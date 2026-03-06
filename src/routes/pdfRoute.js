import { Router } from "express";
import { pdfRequestSchema } from "../schemas/pdfRequestSchema.js";
import { TemplateNotFoundError } from "../services/templateService.js";
import { QueueSaturatedError, QueueTimeoutError } from "../services/pdfQueue.js";
import {
  ensureFullHtmlDocument,
  injectBaseHref,
  sanitizeFilename,
} from "../utils/html.js";

function createPerformanceTracker(enabled, filename) {
  const startedAt = Date.now();
  let checkpointAt = startedAt;
  const steps = [];

  return {
    mark(step) {
      if (!enabled) return;
      const now = Date.now();
      steps.push(`${step}=${now - checkpointAt}ms`);
      checkpointAt = now;
    },
    flush() {
      if (!enabled) return;
      const totalMs = Date.now() - startedAt;
      const details = steps.length ? ` | ${steps.join(" | ")}` : "";
      console.log(`[pdf-service] ${filename}: total=${totalMs}ms${details}`);
    },
  };
}

function logAssetOrigins(enabled, filename, assetSummary) {
  if (!enabled || !assetSummary.length) return;

  const details = assetSummary
    .map((item) => {
      const types = item.types.length ? ` [${item.types.join(",")}]` : "";
      const blocked = item.blockedCount ? ` blocked=${item.blockedCount}` : "";
      return `${item.origin} x${item.count}${blocked}${types}`;
    })
    .join(" | ");

  console.log(`[pdf-service] ${filename}: assets=${details}`);
}

export function createPdfRouter({
  requireToken,
  pdfQueue,
  templateService,
  browserService,
  nativeReportPdfService,
  config,
}) {
  const router = Router();

  router.post("/", requireToken, async (req, res) => {
    const parsed = pdfRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        message: "Payload invalido.",
        errors: parsed.error.flatten(),
      });
      return;
    }

    const payload = parsed.data;
    const filename = sanitizeFilename(payload.filename || "documento-gerado") || "documento-gerado";
    const performanceTracker = createPerformanceTracker(config.pdfLogPerformance, filename);
    let releaseJob = null;
    let pageSession = null;

    try {
      releaseJob = await pdfQueue.acquirePdfJob();
      performanceTracker.mark("queue");

      if (nativeReportPdfService?.canRenderPayload?.(payload)) {
        const pdfBuffer = await nativeReportPdfService.generateFromPayload(payload);
        performanceTracker.mark("nativePdf");

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", String(pdfBuffer.length));
        res.setHeader("Content-Disposition", `inline; filename="${filename}.pdf"`);
        res.send(pdfBuffer);
        return;
      }

      let html = await templateService.resolveHtmlFromPayload(payload);
      html = ensureFullHtmlDocument(html);
      html = injectBaseHref(html, config.pdfPublicBaseUrl);
      performanceTracker.mark("html");
      pageSession = await browserService.createPageWithRecovery();
      const { page } = pageSession;
      performanceTracker.mark("session");

      await browserService.setPageContentWithFallback(page, html, payload.options);
      performanceTracker.mark("render");
      await browserService.normalizePageBreaks(page);
      performanceTracker.mark("normalize");

      const pdfBuffer = await page.pdf({
        format: payload.options?.format || "A4",
        landscape: payload.options?.landscape || false,
        printBackground: payload.options?.printBackground ?? true,
        preferCSSPageSize: payload.options?.preferCSSPageSize ?? true,
        displayHeaderFooter: payload.options?.displayHeaderFooter ?? false,
        scale: payload.options?.scale,
        margin: payload.options?.margin,
      });
      performanceTracker.mark("pdf");

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", String(pdfBuffer.length));
      res.setHeader("Content-Disposition", `inline; filename="${filename}.pdf"`);
      res.send(pdfBuffer);
      logAssetOrigins(
        config.pdfLogAssetOrigins,
        filename,
        pageSession.getAssetRequestSummary?.() || []
      );
    } catch (error) {
      if (error instanceof QueueSaturatedError) {
        res.setHeader("Retry-After", "5");
        res.status(503).json({
          message: "Fila de geração lotada. Tente novamente em instantes.",
        });
        return;
      }

      if (error instanceof QueueTimeoutError) {
        const retryAfterSeconds = Math.max(1, Math.ceil(error.timeoutMs / 1000));
        res.setHeader("Retry-After", String(retryAfterSeconds));
        res.status(503).json({
          message: "Tempo limite na fila de geração excedido. Tente novamente.",
        });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      console.error("Erro ao gerar PDF:", message);
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }

      const missingBrowser =
        /Executable doesn't exist/i.test(message) ||
        /playwright install/i.test(message) ||
        /browserType\.launch/i.test(message);

      const blockedExternalAsset = /ERR_BLOCKED_BY_CLIENT|blockedbyclient/i.test(message);

      if (error instanceof TemplateNotFoundError) {
        res.status(404).json({
          message: `Template '${error.templateId}' nao encontrado.`,
        });
        return;
      }

      if (blockedExternalAsset) {
        res.status(400).json({
          message:
            "Payload requisitou recurso externo nao permitido. Inclua a origem em PDF_ALLOWED_ASSET_ORIGINS ou deixe a allowlist vazia para permitir assets publicos.",
        });
        return;
      }

      if (missingBrowser) {
        res.status(503).json({
          message:
            "Playwright browser nao instalado no ambiente. Execute 'playwright install chromium' no build/deploy.",
        });
        return;
      }

      res.status(500).json({
        message: "Erro ao gerar PDF.",
      });
    } finally {
      if (pageSession) {
        await pageSession.close();
        performanceTracker.mark("close");
      }

      performanceTracker.flush();

      if (releaseJob) {
        releaseJob();
      }
    }
  });

  return router;
}
