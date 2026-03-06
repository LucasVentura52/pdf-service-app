import path from "node:path";
import { fileURLToPath } from "node:url";
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
import { createBrowserService } from "./services/browserService.js";
import { createNativeReportPdfService } from "./services/nativeReportPdfService.js";
import { createPdfQueue } from "./services/pdfQueue.js";
import { createTemplateService } from "./services/templateService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_DIR = path.resolve(__dirname, "../templates");

function buildApp() {
  const templateService = createTemplateService({ templateDir: TEMPLATE_DIR });
  const browserService = createBrowserService(config);
  const nativeReportPdfService = createNativeReportPdfService();
  const pdfQueue = createPdfQueue({
    maxConcurrentJobs: config.pdfMaxConcurrentJobs,
    maxPendingJobs: config.pdfMaxPendingJobs,
    acquireTimeoutMs: config.pdfQueueWaitTimeoutMs,
  });
  const requireToken = createRequireToken(config.pdfServiceTokens);

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

  app.use(
    createHealthRouter({
      pdfQueue,
      browserService,
      templateService,
      config,
    })
  );
  app.use(
    "/pdf",
    createPdfRouter({
      requireToken,
      pdfQueue,
      templateService,
      browserService,
      nativeReportPdfService,
      config,
    })
  );

  app.use(errorHandler);

  return {
    app,
    warmup: async () => {
      await Promise.all([templateService.warmupTemplateCache(), browserService.warmupBrowser()]);
    },
    closeBrowser: () => browserService.closeBrowser(),
  };
}

export function startServer() {
  assertCriticalConfig();
  const { app, warmup, closeBrowser } = buildApp();
  const server = app.listen(config.port, () => {
    console.log(`[pdf-service] running on http://localhost:${config.port}`);
    console.log(
      `[pdf-service] concorrencia maxima configurada em ${config.pdfMaxConcurrentJobs} job(s) simultaneo(s).`
    );
    console.log(
      `[pdf-service] fila configurada com maxPendingJobs=${config.pdfMaxPendingJobs} e queueWaitTimeoutMs=${config.pdfQueueWaitTimeoutMs}.`
    );
    void warmup();
  });

  return {
    server,
    closeBrowser,
  };
}
