import { normalizeWaitUntil } from "../config.js";
import { normalizeBrowserError } from "./pdfServiceErrors.js";
import {
  hasLikelyVisualAssets,
  shouldNormalizePageBreaks,
  createWaitForAssetsScript,
  createNormalizePageBreaksScript,
} from "../utils/domScripts.js";

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
      hasLikelyVisualAssets(html) &&
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
      await page.evaluate(createWaitForAssetsScript(timeoutMs));
    } catch {
      // Nao interrompe a geração por timeout de assets.
    }
  }

  async function normalizePageBreaks(page) {
    try {
      await page.evaluate(createNormalizePageBreaksScript());
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
