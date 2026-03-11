import { normalizeWaitUntil } from "../config.js";
import { normalizeBrowserError } from "./pdfServiceErrors.js";

export function shouldNormalizePageBreaks(html) {
  const documentHtml = String(html || "");
  if (!documentHtml) return false;

  return (
    /data-pdf-normalize-page-breaks(?:[\s=>]|$)/i.test(documentHtml) ||
    /data-pdf-content-anchor(?:[\s=>]|$)/i.test(documentHtml)
  );
}

export function createPageRenderLifecycle(config) {
  async function setPageContentWithFallback(page, html, options) {
    const waitUntil = normalizeWaitUntil(options?.waitUntil, config.pdfDefaultWaitUntil);
    const timeout = options?.timeoutMs || 15000;
    const firstAttemptTimeout =
      waitUntil === "networkidle" ? Math.min(timeout, config.pdfNetworkidleBudgetMs) : timeout;
    let usedFallbackWaitUntil = false;

    try {
      await page.setContent(html, {
        waitUntil,
        timeout: firstAttemptTimeout,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const canRetry = waitUntil === "networkidle" && /timeout/i.test(message);

      if (!canRetry) {
        throw normalizeBrowserError(error);
      }

      console.warn(
        "[pdf-service] Timeout com waitUntil=networkidle. Repetindo setContent com waitUntil=domcontentloaded."
      );
      await page.setContent(html, {
        waitUntil: "domcontentloaded",
        timeout,
      });
      usedFallbackWaitUntil = true;
    }

    const readySelector = String(options?.readySelector || "").trim();
    if (readySelector) {
      const readyTimeoutMs = Math.min(options?.readyTimeoutMs || 1200, timeout);
      await waitForReadySelector(page, readySelector, readyTimeoutMs);
      return;
    }

    const shouldWaitAssets =
      config.pdfAssetWaitTimeoutMs > 0 &&
      (waitUntil === "domcontentloaded" || usedFallbackWaitUntil);

    if (shouldWaitAssets) {
      await waitForVisualAssets(page, config.pdfAssetWaitTimeoutMs);
    }
  }

  async function waitForReadySelector(page, selector, timeoutMs) {
    try {
      await page.waitForSelector(selector, {
        state: "attached",
        timeout: timeoutMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[pdf-service] readySelector timeout para "${selector}": ${message}`);
    }
  }

  async function waitForVisualAssets(page, timeoutMs) {
    try {
      await page.evaluate(async (maxWait) => {
        const capTimeout = Math.max(100, Number(maxWait || 0));
        const stopAfter = (promise) =>
          Promise.race([
            promise,
            new Promise((resolve) => setTimeout(resolve, capTimeout)),
          ]);

        const waitFonts = async () => {
          if (!("fonts" in document) || !document.fonts?.ready) return;
          await document.fonts.ready;
        };

        const waitImages = async () => {
          const images = Array.from(document.images || []);
          if (!images.length) return;

          const waitForImageDecode = (img) => {
            const decodePromise =
              typeof img.decode === "function"
                ? img.decode().catch(() => null)
                : Promise.resolve();

            if (img.complete) {
              return decodePromise;
            }

            return new Promise((resolve) => {
              const finalize = () => {
                decodePromise.finally(() => resolve());
              };

              img.addEventListener("load", finalize, { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            });
          };

          await Promise.all(images.map((img) => waitForImageDecode(img)));

          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        };

        await stopAfter(Promise.all([waitFonts(), waitImages()]));
      }, timeoutMs);
    } catch {
      // Nao interrompe a geração por timeout de assets.
    }
  }

  async function normalizePageBreaks(page) {
    try {
      await page.evaluate(() => {
        const BREAK_SELECTOR = ".page-break, [data-pdf-page-break='always']";
        const IGNORE_SELECTOR =
          "script, style, link, meta, noscript, template, source, track, br";
        const INTRINSIC_CONTENT_SELECTOR =
          "img, svg, canvas, video, iframe, object, embed, hr, table, thead, tbody, tfoot, tr, td, th, input, textarea, select";
        const WHITESPACE_RE = /[\s\u00a0]+/g;
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
            if (node.nodeType !== Node.TEXT_NODE) {
              continue;
            }

            if (String(node.textContent || "").replace(WHITESPACE_RE, "").length > 0) {
              return true;
            }
          }

          return false;
        }

        function shouldIgnoreElement(element, style) {
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity || "1") === 0
          ) {
            return true;
          }

          if (element.matches(IGNORE_SELECTOR)) {
            return true;
          }

          if (
            element.getAttribute("aria-hidden") === "true" &&
            !element.querySelector("img, svg, canvas")
          ) {
            return true;
          }

          return false;
        }

        function hasMeaningfulOwnContent(element) {
          if (element.matches(INTRINSIC_CONTENT_SELECTOR)) {
            return true;
          }

          const rect = element.getBoundingClientRect();
          if (!rect.width && !rect.height) {
            return false;
          }

          return hasDirectTextContent(element);
        }

        function findLastMeaningfulElement(root) {
          if (!(root instanceof Element)) {
            return null;
          }

          const style = window.getComputedStyle(root);
          if (shouldIgnoreElement(root, style)) {
            return null;
          }

          let child = root.lastElementChild;
          while (child) {
            const lastMeaningfulDescendant = findLastMeaningfulElement(child);
            if (lastMeaningfulDescendant) {
              return lastMeaningfulDescendant;
            }

            const previousSibling = child.previousElementSibling;
            child.remove();
            child = previousSibling;
          }

          return hasMeaningfulOwnContent(root) ? root : null;
        }

        function resolveLayoutAnchor(element) {
          if (!(element instanceof Element)) {
            return null;
          }

          const explicitAnchor = element.closest("[data-pdf-content-anchor]");
          if (explicitAnchor) {
            return explicitAnchor;
          }

          return element.closest("td, th, tr, tfoot, tbody, table") || element;
        }

        function resolveClipPadding(anchor) {
          const rawValue = anchor?.getAttribute?.("data-pdf-clip-padding");
          const numericValue = Number(rawValue);

          if (Number.isFinite(numericValue) && numericValue >= 0) {
            return numericValue;
          }

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
                element.style.height = `${clippedHeight}px`;
                element.style.maxHeight = `${clippedHeight}px`;
                element.style.paddingBottom = "0";
                element.style.marginBottom = "0";
                element.style.overflow = "hidden";
                element.style.breakAfter = "auto";
                element.style.pageBreakAfter = "auto";
              }
            }
          }
        }
      });
    } catch {
      // Nao interrompe a geração por falha ao normalizar paginação.
    }
  }

  return {
    setPageContentWithFallback,
    waitForReadySelector,
    waitForVisualAssets,
    normalizePageBreaks,
  };
}
