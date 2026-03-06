import { Router } from "express";

export function createHealthRouter({ pdfQueue, browserService, templateService, config } = {}) {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
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

  return router;
}
