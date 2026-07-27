import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeWaitUntil } from "../config.js";
import { normalizeBrowserError } from "./pdfServiceErrors.js";
import {
  hasLikelyVisualAssets,
  shouldNormalizePageBreaks,
  createWaitForAssetsScript,
  createNormalizePageBreaksScript,
} from "../utils/domScripts.js";
import { ensureFullHtmlDocument, injectBaseHref } from "../utils/html.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let sharedCssCache = null;
let sharedPreviewCssCache = null;

function getSharedCss() {
  if (sharedCssCache !== null) return sharedCssCache;
  try {
    const cssPath = join(__dirname, "..", "styles", "render.css");
    sharedCssCache = readFileSync(cssPath, "utf-8");
  } catch {
    console.warn("[render-service] render.css nao encontrado. Usando CSS vazio.");
    sharedCssCache = "";
  }
  return sharedCssCache;
}

function getSharedPreviewCss() {
  if (sharedPreviewCssCache !== null) return sharedPreviewCssCache;
  try {
    const cssPath = join(__dirname, "..", "styles", "render-preview.css");
    sharedPreviewCssCache = readFileSync(cssPath, "utf-8");
  } catch {
    console.warn("[render-service] render-preview.css nao encontrado. Usando CSS de impressao.");
    sharedPreviewCssCache = getSharedCss();
  }
  return sharedPreviewCssCache;
}

function injectSharedCss(html, css) {
  if (!css) return html;
  const styleTag = `<style id="render-shared-css">\n${css}\n</style>`;

  if (/<head[\s>]/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${styleTag}`);
  }

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  ${styleTag}
</head>
<body>
  ${html}
</body>
</html>`;
}

export function createRenderService(browserService, config) {
  async function render(html, options = {}) {
    const waitUntil = normalizeWaitUntil(options?.waitUntil, config.pdfDefaultWaitUntil);
    const timeout = options?.timeoutMs || 15000;
    const firstAttemptTimeout =
      waitUntil === "networkidle" ? Math.min(timeout, config.pdfNetworkidleBudgetMs) : timeout;

    const mode = options?.mode || "pdf";
    const sharedCss = mode === "preview" ? getSharedPreviewCss() : getSharedCss();
    let processedHtml = ensureFullHtmlDocument(html);
    processedHtml = injectSharedCss(processedHtml, sharedCss);
    processedHtml = injectBaseHref(processedHtml, config.pdfPublicBaseUrl);

    const pageSession = await browserService.createPageWithRecovery();
    const { page } = pageSession;

    let usedFallbackWaitUntil = false;
    try {
      await page.setContent(processedHtml, {
        waitUntil,
        timeout: firstAttemptTimeout,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const canRetry = waitUntil === "networkidle" && /timeout/i.test(message);

      if (!canRetry) {
        await pageSession.close();
        throw normalizeBrowserError(error);
      }

      console.warn(
        "[render-service] Timeout com waitUntil=networkidle. Repetindo com domcontentloaded."
      );
      await page.setContent(processedHtml, {
        waitUntil: "domcontentloaded",
        timeout,
      });
      usedFallbackWaitUntil = true;
    }

    const shouldWaitAssets =
      config.pdfAssetWaitTimeoutMs > 0 &&
      hasLikelyVisualAssets(processedHtml) &&
      (waitUntil === "domcontentloaded" || usedFallbackWaitUntil);

    if (shouldWaitAssets) {
      try {
        await page.evaluate(createWaitForAssetsScript(config.pdfAssetWaitTimeoutMs));
      } catch {
        // Nao interrompe a renderizacao por timeout de assets.
      }
    }

    if (shouldNormalizePageBreaks(processedHtml)) {
      try {
        await page.evaluate(createNormalizePageBreaksScript());
      } catch {
        // Nao interrompe a renderizacao por falha ao normalizar paginacao.
      }
    }

    return { page, session: pageSession };
  }

  return { render };
}
