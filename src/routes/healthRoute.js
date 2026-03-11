import { Router } from "express";

export function createHealthRouter({
  pdfQueue,
  browserService,
  templateService,
  config,
  operationalState,
} = {}) {
  const router = Router();

  router.get("/health", (_req, res) => {
    const operational = operationalState?.getSnapshot?.() || null;
    const readiness = operational?.readiness || null;
    const status = readiness?.ready ? "ok" : "degraded";

    res.json({
      status,
      timestamp: new Date().toISOString(),
      readiness,
      operational,
      queue: pdfQueue?.getStats?.() || null,
      browser: browserService?.getStats?.() || null,
      templates: templateService?.getStats?.() || null,
      limits: config
        ? {
            maxConcurrentJobs: config.pdfMaxConcurrentJobs,
            maxPendingJobs: config.pdfMaxPendingJobs,
            queueWaitTimeoutMs: config.pdfQueueWaitTimeoutMs,
          }
        : null,
    });
  });

  router.get("/ready", (_req, res) => {
    const readiness = operationalState?.getReadiness?.() || {
      ready: true,
      code: "READY",
      message: "Servico pronto para gerar PDFs.",
    };

    res.status(readiness.ready ? 200 : 503).json({
      status: readiness.ready ? "ok" : "unavailable",
      timestamp: new Date().toISOString(),
      readiness,
    });
  });

  return router;
}
