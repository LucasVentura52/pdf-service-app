import { Router } from "express";
import { pdfRequestSchema } from "../schemas/pdfRequestSchema.js";
import { TemplateNotFoundError } from "../services/templateService.js";
import { QueueSaturatedError, QueueTimeoutError } from "../services/pdfQueue.js";
import { ensureFullHtmlDocument, injectBaseHref, sanitizeFilename } from "../utils/html.js";

function logPerformanceMetric(enabled, filename, startedAt) {
  if (!enabled) return;
  const durationMs = Date.now() - startedAt;
  console.log(`[pdf-service] ${filename}: ${durationMs}ms`);
}

export function createPdfRouter({ requireToken, pdfQueue, templateService, browserService, config }) {
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
    const startedAt = Date.now();
    let releaseJob = null;

    try {
      releaseJob = await pdfQueue.acquirePdfJob();
      let html = await templateService.resolveHtmlFromPayload(payload);
      html = ensureFullHtmlDocument(html);
      html = injectBaseHref(html, config.pdfPublicBaseUrl);

      const pageSession = await browserService.createPageWithRecovery();
      const { page } = pageSession;

      try {
        await browserService.setPageContentWithFallback(page, html, payload.options);
        await page.emulateMedia({ media: "print" });

        const pdfBuffer = await page.pdf({
          format: payload.options?.format || "A4",
          landscape: payload.options?.landscape || false,
          printBackground: payload.options?.printBackground ?? true,
          preferCSSPageSize: payload.options?.preferCSSPageSize ?? true,
          displayHeaderFooter: payload.options?.displayHeaderFooter ?? false,
          scale: payload.options?.scale,
          margin: payload.options?.margin,
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Length", String(pdfBuffer.length));
        res.setHeader("Content-Disposition", `inline; filename="${filename}.pdf"`);
        res.send(pdfBuffer);
        logPerformanceMetric(config.pdfLogPerformance, filename, startedAt);
      } finally {
        try {
          await page.close();
        } finally {
          await pageSession.close();
        }
      }
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
            "Payload requisitou recurso externo nao permitido. Ajuste PDF_ALLOWED_ASSET_ORIGINS/PDF_PUBLIC_BASE_URL.",
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
      if (releaseJob) {
        releaseJob();
      }
    }
  });

  return router;
}
