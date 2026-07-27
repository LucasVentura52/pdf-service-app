export function hasLikelyVisualAssets(html) {
  const documentHtml = String(html || "");
  if (!documentHtml) return false;

  return (
    /<img[\s>]/i.test(documentHtml) ||
    /<svg[\s>]/i.test(documentHtml) ||
    /<canvas[\s>]/i.test(documentHtml) ||
    /<iframe[\s>]/i.test(documentHtml) ||
    /<link[^>]+rel=["']stylesheet["']/i.test(documentHtml) ||
    /<style[\s>]/i.test(documentHtml) ||
    /@font-face/i.test(documentHtml) ||
    /background(?:-image)?\s*:/i.test(documentHtml)
  );
}

export function shouldNormalizePageBreaks(html) {
  const documentHtml = String(html || "");
  if (!documentHtml) return false;

  return (
    /data-pdf-normalize-page-breaks(?:[\s=>]|$)/i.test(documentHtml) ||
    /data-pdf-content-anchor(?:[\s=>]|$)/i.test(documentHtml)
  );
}

export function createWaitForAssetsScript(timeoutMs) {
  return `
    (function(maxWait) {
      var capTimeout = Math.max(100, Number(maxWait || 0));
      var stopAfter = function(promise) {
        return Promise.race([
          promise,
          new Promise(function(resolve) { setTimeout(resolve, capTimeout); })
        ]);
      };
      var waitFonts = function() {
        if (!("fonts" in document) || !document.fonts || !document.fonts.ready) return Promise.resolve();
        return document.fonts.ready;
      };
      var waitImages = function() {
        var images = Array.from(document.images || []);
        if (!images.length) return Promise.resolve();
        return Promise.all(images.map(function(img) {
          var decodePromise = typeof img.decode === "function"
            ? img.decode().catch(function() { return null; })
            : Promise.resolve();
          if (img.complete) return decodePromise;
          return new Promise(function(resolve) {
            var finalize = function() { decodePromise.finally(function() { resolve(); }); };
            img.addEventListener("load", finalize, { once: true });
            img.addEventListener("error", function() { resolve(); }, { once: true });
          });
        })).then(function() {
          return new Promise(function(resolve) {
            requestAnimationFrame(function() { requestAnimationFrame(resolve); });
          });
        });
      };
      return stopAfter(Promise.all([waitFonts(), waitImages()]));
    })(${timeoutMs});
  `;
}

export function createNormalizePageBreaksScript() {
  return `
    (function() {
      const BREAK_SELECTOR = ".page-break, [data-pdf-page-break='always']";
      const IGNORE_SELECTOR = "script, style, link, meta, noscript, template, source, track, br";
      const INTRINSIC_CONTENT_SELECTOR = "img, svg, canvas, video, iframe, object, embed, hr, table, thead, tbody, tfoot, tr, td, th, input, textarea, select";
      const WHITESPACE_RE = /[\\s\\u00a0]+/g;
      const body = document.body;
      if (!body) return;

      for (const node of Array.from(document.querySelectorAll(BREAK_SELECTOR))) {
        const previousElement = node.previousElementSibling;
        if (previousElement?.matches?.(BREAK_SELECTOR)) {
          node.remove();
        }
      }

      while (body.lastElementChild?.matches?.(BREAK_SELECTOR)) {
        body.lastElementChild.remove();
      }

      const lastElement = body.lastElementChild;
      if (lastElement) {
        lastElement.style.breakAfter = "auto";
        lastElement.style.pageBreakAfter = "auto";
      }

      function hasDirectTextContent(element) {
        for (const node of Array.from(element.childNodes || [])) {
          if (node.nodeType !== Node.TEXT_NODE) continue;
          if (String(node.textContent || "").replace(WHITESPACE_RE, "").length > 0) return true;
        }
        return false;
      }

      function shouldIgnoreElement(element, style) {
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || "1") === 0) return true;
        if (element.matches(IGNORE_SELECTOR)) return true;
        if (element.getAttribute("aria-hidden") === "true" && !element.querySelector("img, svg, canvas")) return true;
        return false;
      }

      function hasMeaningfulOwnContent(element) {
        if (element.matches(INTRINSIC_CONTENT_SELECTOR)) return true;
        const rect = element.getBoundingClientRect();
        if (!rect.width && !rect.height) return false;
        return hasDirectTextContent(element);
      }

      function findLastMeaningfulElement(root) {
        if (!(root instanceof Element)) return null;
        const style = window.getComputedStyle(root);
        if (shouldIgnoreElement(root, style)) return null;
        let child = root.lastElementChild;
        while (child) {
          const lastMeaningfulDescendant = findLastMeaningfulElement(child);
          if (lastMeaningfulDescendant) return lastMeaningfulDescendant;
          const previousSibling = child.previousElementSibling;
          child.remove();
          child = previousSibling;
        }
        return hasMeaningfulOwnContent(root) ? root : null;
      }

      function resolveLayoutAnchor(element) {
        if (!(element instanceof Element)) return null;
        const explicitAnchor = element.closest("[data-pdf-content-anchor]");
        if (explicitAnchor) return explicitAnchor;
        return element.closest("td, th, tr, tfoot, tbody, table") || element;
      }

      function resolveClipPadding(anchor) {
        const rawValue = anchor?.getAttribute?.("data-pdf-clip-padding");
        const numericValue = Number(rawValue);
        if (Number.isFinite(numericValue) && numericValue >= 0) return numericValue;
        return 12;
      }

      const lastMeaningfulElement = findLastMeaningfulElement(body);
      const lastLayoutAnchor = resolveLayoutAnchor(lastMeaningfulElement);
      const contentBottom = lastLayoutAnchor
        ? lastLayoutAnchor.getBoundingClientRect().bottom + window.scrollY
        : 0;
      const clipPadding = resolveClipPadding(lastLayoutAnchor);

      if (lastMeaningfulElement && contentBottom > 0) {
        let current = lastMeaningfulElement;
        while (current && current !== body) {
          const rect = current.getBoundingClientRect();
          const renderedBottom = rect.bottom + window.scrollY;
          const trailingGap = renderedBottom - contentBottom;

          if (trailingGap > 24) {
            current.style.height = "auto";
            current.style.minHeight = "0";
            current.style.maxHeight = "none";
            current.style.paddingBottom = "0";
            current.style.marginBottom = "0";
            current.style.breakInside = "auto";
            current.style.pageBreakInside = "auto";
            current.style.breakAfter = "auto";
            current.style.pageBreakAfter = "auto";
          }

          current = current.parentElement;
        }
      }

      if (contentBottom > 0) {
        const root = document.documentElement;
        const bodyTop = body.getBoundingClientRect().top + window.scrollY;
        const documentBottom = Math.max(
          root.getBoundingClientRect().bottom + window.scrollY,
          body.getBoundingClientRect().bottom + window.scrollY,
          root.scrollHeight,
          body.scrollHeight
        );
        const trailingDocumentGap = documentBottom - contentBottom;

        if (trailingDocumentGap > 48) {
          const clippedHeight = Math.max(0, Math.ceil(contentBottom - bodyTop + clipPadding));

          if (clippedHeight > 0) {
            for (const element of [root, body]) {
              element.style.minHeight = "0";
              element.style.height = clippedHeight + "px";
              element.style.maxHeight = clippedHeight + "px";
              element.style.paddingBottom = "0";
              element.style.marginBottom = "0";
              element.style.overflow = "hidden";
              element.style.breakAfter = "auto";
              element.style.pageBreakAfter = "auto";
            }
          }
        }
      }
    })();
  `;
}
