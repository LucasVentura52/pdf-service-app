import { Router } from "express";
import { pdfRequestSchema } from "../schemas/pdfRequestSchema.js";
import { QueueSaturatedError, QueueTimeoutError } from "../services/pdfQueue.js";
import {
  BlockedAssetError,
  BrowserUnavailableError,
} from "../services/pdfServiceErrors.js";

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
      console.log(`[render-service] preview ${filename}: total=${totalMs}ms${details}`);
    },
  };
}

function sendErrorResponse(error, res) {
  if (error instanceof QueueSaturatedError) {
    res.setHeader("Retry-After", "5");
    res.status(503).json({ message: "Fila de renderizacao lotada. Tente novamente em instantes." });
    return true;
  }

  if (error instanceof QueueTimeoutError) {
    const retryAfterSeconds = Math.max(1, Math.ceil(error.timeoutMs / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(503).json({ message: "Tempo limite na fila de renderizacao excedido. Tente novamente." });
    return true;
  }

  if (error instanceof BlockedAssetError) {
    res.status(400).json({ message: error.message });
    return true;
  }

  if (error instanceof BrowserUnavailableError) {
    res.status(503).json({ message: error.message });
    return true;
  }

  return false;
}

const PREVIEW_INJECT_SCRIPT = `
<script>
(function() {
  var PAGE_W = Math.round(210 * 96 / 25.4);

  var style = document.createElement('style');
  style.id = 'preview-page-styles';
  style.textContent = [
    'html, body { margin:0; padding:0; background:#e5e7eb; }',
    'body { display:flex; flex-direction:column; align-items:center; padding:24px 0 !important; gap:24px; }',
    '.preview-page-break {',
    '  display: flex !important;',
    '  align-items: center !important;',
    '  justify-content: center !important;',
    '  width: ' + PAGE_W + 'px !important;',
    '  height: 0 !important;',
    '  margin: 32px 0 !important;',
    '  padding: 0 !important;',
    '  border: none !important;',
    '  position: relative !important;',
    '  page-break-after: always !important;',
    '  flex-shrink: 0 !important;',
    '}',
    '.preview-page-break::before {',
    '  content: "✂ Quebra de página" !important;',
    '  position: absolute !important;',
    '  top: -12px !important;',
    '  left: 50% !important;',
    '  transform: translateX(-50%) !important;',
    '  background: #e5e7eb !important;',
    '  padding: 0 12px !important;',
    '  font: 600 11px sans-serif !important;',
    '  color: #6b7280 !important;',
    '  white-space: nowrap !important;',
    '  z-index: 1 !important;',
    '}',
    '.preview-page-break::after {',
    '  content: "" !important;',
    '  position: absolute !important;',
    '  top: 0 !important;',
    '  left: 0 !important;',
    '  right: 0 !important;',
    '  height: 3px !important;',
    '  border-top: 3px dashed #9ca3af !important;',
    '}',
  ].join('\\n');
  document.head.appendChild(style);

  var breaks = document.querySelectorAll('img.mce-pagebreak');
  for (var i = 0; i < breaks.length; i++) {
    var old = breaks[i];
    var div = document.createElement('div');
    div.className = 'preview-page-break';
    old.parentNode.replaceChild(div, old);
  }

  var otherBreaks = document.querySelectorAll('[data-pdf-page-break="always"], .page-break, .page-break-before');
  for (var j = 0; j < otherBreaks.length; j++) {
    var el = otherBreaks[j];
    if (el.tagName !== 'IMG' || !el.classList.contains('mce-pagebreak')) {
      el.className = 'preview-page-break';
      el.removeAttribute('style');
    }
  }
})();
<\/script>
`;

export function createPreviewRouter({
  requireToken,
  pdfQueue,
  renderService,
  config,
  operationalState,
}) {
  const router = Router();

  router.post("/", requireToken, async (req, res) => {
    const readiness = operationalState?.getReadiness?.();
    if (readiness && !readiness.ready) {
      if (readiness.code === "DRAINING") {
        res.setHeader("Retry-After", "10");
      }
      res.status(503).json({ message: readiness.message, code: readiness.code });
      return;
    }

    const parsed = pdfRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Payload invalido.", errors: parsed.error.flatten() });
      return;
    }

    const payload = parsed.data;
    const filename = payload.filename || "preview";
    const performanceTracker = createPerformanceTracker(config.pdfLogPerformance, filename);
    let releaseJob = null;
    let pageSession = null;

    try {
      releaseJob = await pdfQueue.acquirePdfJob();
      performanceTracker.mark("queue");

      const { page, session } = await renderService.render(payload.html, {
        ...payload.options,
        mode: "preview",
      });
      pageSession = session;
      performanceTracker.mark("render");

      const contentHtml = await page.evaluate(() => {
        const doc = document;
        const headAssets = Array.from(
          doc.head.querySelectorAll("style, link[rel='stylesheet']")
        )
          .map((node) => node.outerHTML)
          .join("\n");
        const bodyHtml = doc.body?.innerHTML || "";
        return JSON.stringify({ headAssets, bodyHtml });
      });

      const { headAssets, bodyHtml } = JSON.parse(contentHtml);
      performanceTracker.mark("extract");

      const fullHtml = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${headAssets}
</head>
<body>
  ${bodyHtml}
  ${PREVIEW_INJECT_SCRIPT}
</body>
</html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.send(fullHtml);
      performanceTracker.mark("send");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Erro ao renderizar preview:", message);

      if (sendErrorResponse(error, res)) return;

      res.status(500).json({ message: "Erro ao renderizar preview." });
    } finally {
      if (pageSession) {
        await pageSession.close();
        performanceTracker.mark("close");
      }
      performanceTracker.flush();
      if (releaseJob) releaseJob();
    }
  });

  return router;
}
