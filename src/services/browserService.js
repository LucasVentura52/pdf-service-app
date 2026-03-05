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

function isRequestUrlAllowed(url, allowedAssetOrigins, blockPrivateNetwork) {
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

export function createBrowserService(config) {
  let browserPromise = null;

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
    const context = await browser.newContext();
    const resolvedAllowedAssetOrigins = mergeAllowedAssetOrigins(extraAllowedAssetOrigins);
    await context.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      if (
        isRequestUrlAllowed(
          requestUrl,
          resolvedAllowedAssetOrigins,
          config.pdfBlockPrivateNetwork
        )
      ) {
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
    return context;
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

  async function closeBrowser() {
    if (!browserPromise) return;
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch (error) {
      console.error("Erro ao fechar browser do PDF service:", error);
    } finally {
      browserPromise = null;
    }
  }

  async function createPageWithRecovery(options = {}) {
    try {
      return await createIsolatedPageSession(options);
    } catch {
      console.warn("[pdf-service] Falha ao criar page no contexto atual. Reiniciando browser/contexto.");
      await closeBrowser();
      return createIsolatedPageSession(options);
    }
  }

  async function createIsolatedPageSession(options = {}) {
    const context = await createContextWithNetworkGuard(options.allowedAssetOrigins);
    try {
      const page = await context.newPage();
      return {
        page,
        close: async () => {
          try {
            await context.close();
          } catch (error) {
            console.error("Erro ao fechar contexto isolado do PDF service:", error);
          }
        },
      };
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
      const session = await createIsolatedPageSession();
      try {
        await session.page.setContent("<html><body></body></html>", {
          waitUntil: "domcontentloaded",
          timeout: 5000,
        });
        await session.page.close();
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
    warmupBrowser,
    closeBrowser,
  };
}
