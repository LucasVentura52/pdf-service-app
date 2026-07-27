import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { assertCriticalConfig, config } from "./config.js";
import { createCorsPolicy } from "./middleware/corsPolicy.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { createPdfRateLimit } from "./middleware/pdfRateLimit.js";
import { createRequireToken } from "./middleware/requireToken.js";
import { createHealthRouter } from "./routes/healthRoute.js";
import { createPdfRouter } from "./routes/pdfRoute.js";
import { createPreviewRouter } from "./routes/previewRoute.js";
import { createBrowserService } from "./services/browserService.js";
import { createPdfQueue } from "./services/pdfQueue.js";
import { createRenderService } from "./services/renderService.js";
import { createOperationalState } from "./services/operationalState.js";

export function buildApp() {
  const browserService = createBrowserService(config);
  const pdfQueue = createPdfQueue({
    maxConcurrentJobs: config.pdfMaxConcurrentJobs,
    maxPendingJobs: config.pdfMaxPendingJobs,
    acquireTimeoutMs: config.pdfQueueWaitTimeoutMs,
  });
  const renderService = createRenderService(browserService, config);
  const requireToken = createRequireToken(config.pdfServiceTokens);
  const operationalState = createOperationalState({
    hasRequiredToken: config.pdfServiceTokens.length > 0,
  });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    })
  );

  app.use(createCorsPolicy(config.normalizedAllowedOrigins));

  app.use(express.json({ limit: config.pdfBodyLimit }));
  app.use(morgan("tiny"));
  app.use("/pdf", createPdfRateLimit(config.pdfRateLimitMax));
  app.use("/preview", createPdfRateLimit(config.pdfRateLimitMax));

  app.use(
    createHealthRouter({
      pdfQueue,
      browserService,
      config,
      operationalState,
    })
  );
  app.use(
    "/pdf",
    createPdfRouter({
      requireToken,
      pdfQueue,
      renderService,
      config,
      operationalState,
    })
  );
  app.use(
    "/preview",
    createPreviewRouter({
      requireToken,
      pdfQueue,
      renderService,
      config,
      operationalState,
    })
  );

  app.use(errorHandler);

  return {
    app,
    warmup: async () => {
      try {
        await browserService.warmupBrowser();
        operationalState.markWarmupSuccess();
      } catch (error) {
        operationalState.markWarmupFailure(error);
        throw error;
      }
    },
    closeBrowser: () => browserService.closeBrowser(),
    operationalState,
  };
}

export function startServer() {
  assertCriticalConfig();
  const { app, warmup, closeBrowser, operationalState } = buildApp();
  const server = app.listen(config.port, () => {
    console.log(`[pdf-service] running on http://localhost:${config.port}`);
    console.log(
      `[pdf-service] concorrencia maxima configurada em ${config.pdfMaxConcurrentJobs} job(s) simultaneo(s).`
    );
    console.log(
      `[pdf-service] fila configurada com maxPendingJobs=${config.pdfMaxPendingJobs} e queueWaitTimeoutMs=${config.pdfQueueWaitTimeoutMs}.`
    );
    void warmup().catch((error) => {
      console.error("[pdf-service] warmup inicial falhou.", error);
    });
  });

  return {
    server,
    closeBrowser,
    operationalState,
  };
}
