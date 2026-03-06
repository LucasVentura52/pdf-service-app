import { chromium } from "playwright";
import { normalizeWaitUntil } from "../config.js";

const SAFE_PROTOCOLS = new Set(["about:", "data:", "blob:"]);
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function parseIpv4(hostname) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return null;
  }
  return octets;
}

function isPrivateIpv4(hostname) {
  const octets = parseIpv4(hostname);
  if (!octets) return false;

  const [a, b] = octets;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized.includes(":")) return false;
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;
  return false;
}

function isPrivateHostname(hostname) {
  const normalized = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!normalized) return true;
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (normalized.endsWith(".local")) return true;

  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice("::ffff:".length));
  }

  return isPrivateIpv4(normalized) || isPrivateIpv6(normalized);
}

export function isRequestUrlAllowed(url, allowedAssetOrigins, blockPrivateNetwork) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (SAFE_PROTOCOLS.has(protocol)) {
    return true;
  }

  if (!HTTP_PROTOCOLS.has(protocol)) {
    return false;
  }

  if (allowedAssetOrigins.has(parsed.origin.toLowerCase())) {
    return true;
  }

  if (blockPrivateNetwork && isPrivateHostname(parsed.hostname)) {
    return false;
  }

  if (!allowedAssetOrigins.size) {
    return true;
  }

  return allowedAssetOrigins.has(parsed.origin.toLowerCase());
}

export function resolveReusableSessionTarget({
  maxConcurrentJobs,
  prewarmedSessions,
  reuseSessions,
}) {
  const normalizedMaxConcurrentJobs = Math.max(1, Number(maxConcurrentJobs || 1));
  const normalizedPrewarmedSessions = Math.max(0, Number(prewarmedSessions || 0));
  const baselineTarget = reuseSessions ? 1 : 0;

  return Math.min(
    normalizedMaxConcurrentJobs,
    Math.max(normalizedPrewarmedSessions, baselineTarget)
  );
}

export function recordAssetRequest(assetRequests, requestUrl, resourceType, blocked = false) {
  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (!HTTP_PROTOCOLS.has(protocol)) {
    return;
  }

  const origin = parsed.origin.toLowerCase();
  const entry = assetRequests.get(origin) || {
    count: 0,
    blockedCount: 0,
    types: new Set(),
  };

  entry.count += 1;
  if (blocked) {
    entry.blockedCount += 1;
  }
  if (resourceType) {
    entry.types.add(resourceType);
  }

  assetRequests.set(origin, entry);
}

export function summarizeAssetRequests(assetRequests) {
  return Array.from(assetRequests.entries())
    .map(([origin, entry]) => ({
      origin,
      count: entry.count,
      blockedCount: entry.blockedCount,
      types: Array.from(entry.types).sort(),
    }))
    .sort((left, right) => left.origin.localeCompare(right.origin));
}

export function createBrowserService(config) {
  let browserPromise = null;
  let isClosing = false;
  const bufferedSessions = [];
  const pendingBufferedSessionWarmups = new Set();

  async function getBrowser() {
    if (!browserPromise) {
      browserPromise = launchBrowser();
    }
    return browserPromise;
  }

  function mergeAllowedAssetOrigins(extraAllowedAssetOrigins) {
    const merged = new Set(config.normalizedAllowedAssetOrigins);
    if (!extraAllowedAssetOrigins) return merged;

    for (const origin of extraAllowedAssetOrigins) {
      const normalized = String(origin || "").trim().toLowerCase();
      if (normalized) {
        merged.add(normalized);
      }
    }

    return merged;
  }

  async function createContextWithNetworkGuard(extraAllowedAssetOrigins) {
    const browser = await getBrowser();
    const context = await browser.newContext({
      serviceWorkers: "block",
    });
    const assetRequests = new Map();
    const resolvedAllowedAssetOrigins = mergeAllowedAssetOrigins(extraAllowedAssetOrigins);
    await context.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = request.url();
      const allowed = isRequestUrlAllowed(
        requestUrl,
        resolvedAllowedAssetOrigins,
        config.pdfBlockPrivateNetwork
      );

      recordAssetRequest(assetRequests, requestUrl, request.resourceType(), !allowed);

      if (allowed) {
        await route.continue();
        return;
      }
      console.warn(
        `[pdf-service] Asset bloqueado durante renderizacao: ${requestUrl} | allowlist=${
          resolvedAllowedAssetOrigins.size
            ? Array.from(resolvedAllowedAssetOrigins).join(",")
            : "<public-assets-enabled>"
        }`
      );
      await route.abort("blockedbyclient");
    });
    return {
      context,
      assetRequests,
    };
  }

  async function launchBrowser() {
    const launchOptions = {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    };

    if (config.pdfChromiumExecutablePath) {
      launchOptions.executablePath = config.pdfChromiumExecutablePath;
    }

    if (config.pdfChromiumChannel) {
      launchOptions.channel = config.pdfChromiumChannel;
    }

    try {
      return await chromium.launch(launchOptions);
    } catch (error) {
      if (launchOptions.channel) {
        console.warn(
          `[pdf-service] Falha ao iniciar chromium com channel="${launchOptions.channel}". Tentando fallback sem channel.`
        );
        const { channel, ...fallbackOptions } = launchOptions;
        return chromium.launch(fallbackOptions);
      }
      throw error;
    }
  }

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
        throw error;
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
          await Promise.all(
            images.map((img) => {
              if (img.complete) return Promise.resolve();
              return new Promise((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              });
            })
          );
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

        function isMeaningfulElement(element, style) {
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity || "1") === 0
          ) {
            return false;
          }

          if (
            element.matches(
              "script, style, link, meta, noscript, template, source, track, br"
            )
          ) {
            return false;
          }

          if (element.getAttribute("aria-hidden") === "true" && !element.querySelector("img, svg, canvas")) {
            return false;
          }

          if (
            element.matches(
              "img, svg, canvas, video, iframe, object, embed, hr, table, thead, tbody, tfoot, tr, td, th"
            )
          ) {
            return true;
          }

          const text = (element.innerText || "").replace(/\s+/g, " ").trim();
          if (text) {
            return true;
          }

          return false;
        }

        const meaningfulElements = new WeakSet();
        let contentBottom = 0;
        let lastMeaningfulElement = null;
        for (const element of Array.from(body.querySelectorAll("*"))) {
          const rect = element.getBoundingClientRect();
          if (!rect.width && !rect.height) {
            continue;
          }

          const style = window.getComputedStyle(element);
          if (!isMeaningfulElement(element, style)) {
            continue;
          }

          meaningfulElements.add(element);
          lastMeaningfulElement = element;

          const shouldCountAsContentEdge =
            element.children.length === 0 ||
            element.matches(
              "img, svg, canvas, video, iframe, object, embed, hr, table, thead, tbody, tfoot, tr, td, th"
            );

          if (shouldCountAsContentEdge) {
            contentBottom = Math.max(contentBottom, rect.bottom + window.scrollY);
          }
        }

        function subtreeHasMeaningfulContent(element) {
          if (meaningfulElements.has(element)) {
            return true;
          }

          for (const child of Array.from(element.children || [])) {
            if (subtreeHasMeaningfulContent(child)) {
              return true;
            }
          }

          return false;
        }

        if (lastMeaningfulElement) {
          let current = lastMeaningfulElement;
          while (current && current !== body) {
            let sibling = current.nextElementSibling;
            while (sibling) {
              const nextSibling = sibling.nextElementSibling;
              if (!subtreeHasMeaningfulContent(sibling)) {
                sibling.remove();
              }
              sibling = nextSibling;
            }
            current = current.parentElement;
          }
        }

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
            const clippedHeight = Math.max(0, Math.ceil(contentBottom - bodyTop + 12));

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

  function getBufferedSessionsTarget() {
    return resolveReusableSessionTarget({
      maxConcurrentJobs: config.pdfMaxConcurrentJobs,
      prewarmedSessions: config.pdfPrewarmedSessions,
      reuseSessions: config.pdfReuseSessions,
    });
  }

  function canUseDefaultSessionPool(options = {}) {
    const allowedAssetOrigins = options.allowedAssetOrigins;
    if (!allowedAssetOrigins) {
      return true;
    }

    for (const _origin of allowedAssetOrigins) {
      return false;
    }

    return true;
  }

  function resetSessionAssetRequests(session) {
    session.assetRequests.clear();
  }

  function markSessionInUse(session) {
    session.useCount += 1;
    resetSessionAssetRequests(session);
    return session;
  }

  async function destroySession(session) {
    try {
      await session.context.close();
    } catch (error) {
      console.error("Erro ao fechar contexto isolado do PDF service:", error);
    }
  }

  async function resetReusableSession(session) {
    try {
      if (session.page.isClosed()) {
        return false;
      }

      for (const contextPage of session.context.pages()) {
        if (contextPage !== session.page) {
          await contextPage.close();
        }
      }

      try {
        await session.page.goto("about:blank", {
          waitUntil: "domcontentloaded",
          timeout: 5000,
        });
      } catch {
        await session.page.setContent("<html><body></body></html>", {
          waitUntil: "domcontentloaded",
          timeout: 5000,
        });
      }

      await session.context.clearCookies();
      await session.context.clearPermissions();
      resetSessionAssetRequests(session);
      return !session.page.isClosed();
    } catch (error) {
      console.warn("[pdf-service] Falha ao resetar sessao reutilizavel do browser.", error);
      return false;
    }
  }

  function canReturnSessionToPool(session) {
    if (!config.pdfReuseSessions || !session.poolEligible || isClosing) {
      return false;
    }

    if (session.useCount >= config.pdfReuseSessionMaxUses) {
      return false;
    }

    return bufferedSessions.length < getBufferedSessionsTarget();
  }

  async function releaseSession(session) {
    if (canReturnSessionToPool(session)) {
      const resetOk = await resetReusableSession(session);
      if (resetOk) {
        bufferedSessions.push(session);
        scheduleBufferedSessionWarmups();
        return;
      }
    }

    await destroySession(session);
    scheduleBufferedSessionWarmups();
  }

  function scheduleBufferedSessionWarmups() {
    const target = getBufferedSessionsTarget();
    if (isClosing || target <= 0) {
      return;
    }

    while (bufferedSessions.length + pendingBufferedSessionWarmups.size < target) {
      const warmupPromise = createIsolatedPageSession()
        .then(async (session) => {
          if (isClosing) {
            await destroySession(session);
            return;
          }

          if (bufferedSessions.length < target) {
            bufferedSessions.push(session);
            return;
          }

          await destroySession(session);
        })
        .catch((error) => {
          console.warn("[pdf-service] Nao foi possivel preaquecer sessao isolada do browser.", error);
        })
        .finally(() => {
          pendingBufferedSessionWarmups.delete(warmupPromise);
        });

      pendingBufferedSessionWarmups.add(warmupPromise);
    }
  }

  async function takeBufferedSession() {
    while (bufferedSessions.length) {
      const session = bufferedSessions.shift();
      if (!session) {
        break;
      }

      if (session.page.isClosed()) {
        await destroySession(session);
        continue;
      }

      scheduleBufferedSessionWarmups();
      return markSessionInUse(session);
    }

    scheduleBufferedSessionWarmups();
    return null;
  }

  async function drainBufferedSessions() {
    const sessionsToClose = bufferedSessions.splice(0, bufferedSessions.length);
    await Promise.allSettled(sessionsToClose.map((session) => destroySession(session)));
    await Promise.allSettled(Array.from(pendingBufferedSessionWarmups));
  }

  async function closeBrowser() {
    isClosing = true;
    try {
      await drainBufferedSessions();

      if (!browserPromise) return;
      const browser = await browserPromise;
      await browser.close();
    } catch (error) {
      console.error("Erro ao fechar browser do PDF service:", error);
    } finally {
      browserPromise = null;
      isClosing = false;
    }
  }

  async function createPageWithRecovery(options = {}) {
    if (canUseDefaultSessionPool(options)) {
      const bufferedSession = await takeBufferedSession();
      if (bufferedSession) {
        return bufferedSession;
      }
    }

    try {
      const session = markSessionInUse(await createIsolatedPageSession(options));
      scheduleBufferedSessionWarmups();
      return session;
    } catch {
      console.warn("[pdf-service] Falha ao criar page no contexto atual. Reiniciando browser/contexto.");
      await closeBrowser();
      const session = markSessionInUse(await createIsolatedPageSession(options));
      scheduleBufferedSessionWarmups();
      return session;
    }
  }

  async function createIsolatedPageSession(options = {}) {
    const { context, assetRequests } = await createContextWithNetworkGuard(options.allowedAssetOrigins);
    try {
      const page = await context.newPage();
      const session = {
        context,
        page,
        assetRequests,
        poolEligible: canUseDefaultSessionPool(options),
        useCount: 0,
        getAssetRequestSummary: () => summarizeAssetRequests(assetRequests),
      };
      session.close = async () => {
        await releaseSession(session);
      };
      return session;
    } catch (error) {
      try {
        await context.close();
      } catch {
        // Ignora erro de cleanup, mantendo erro original.
      }
      throw error;
    }
  }

  async function warmupBrowser() {
    try {
      await getBrowser();

      if (getBufferedSessionsTarget() > 0) {
        scheduleBufferedSessionWarmups();
        await Promise.allSettled(Array.from(pendingBufferedSessionWarmups));
        console.log(
          `[pdf-service] browser/contexto aquecidos com ${bufferedSessions.length} sessao(oes) pre-aquecida(s).`
        );
        return;
      }

      const session = await createIsolatedPageSession();
      try {
        await session.page.setContent("<html><body></body></html>", {
          waitUntil: "domcontentloaded",
          timeout: 5000,
        });
      } finally {
        await session.close();
      }

      console.log("[pdf-service] browser/contexto aquecidos.");
    } catch (error) {
      console.warn("[pdf-service] warmup do browser falhou.", error);
    }
  }

  return {
    createPageWithRecovery,
    setPageContentWithFallback,
    normalizePageBreaks,
    warmupBrowser,
    closeBrowser,
  };
}
