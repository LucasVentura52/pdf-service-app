import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import Mustache from "mustache";
import { chromium } from "playwright";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_DIR = path.resolve(__dirname, "../templates");

const PORT = Number(process.env.PORT || 3100);
const DEFAULT_PDF_SERVICE_TOKEN = "troque-este-token-em-producao";
const PDF_SERVICE_TOKENS = String(process.env.PDF_SERVICE_TOKEN || DEFAULT_PDF_SERVICE_TOKEN)
  .split(",")
  .map((token) => token.trim())
  .filter(Boolean);
const PDF_PUBLIC_BASE_URL = process.env.PDF_PUBLIC_BASE_URL || "";
const PDF_RATE_LIMIT_MAX = Number(process.env.PDF_RATE_LIMIT_MAX || 40);
const PDF_BODY_LIMIT = process.env.PDF_BODY_LIMIT || "8mb";
const PDF_CHROMIUM_CHANNEL = String(process.env.PDF_CHROMIUM_CHANNEL || "").trim();
const PDF_CHROMIUM_EXECUTABLE_PATH = String(process.env.PDF_CHROMIUM_EXECUTABLE_PATH || "").trim();
const PDF_ALLOWED_ORIGINS = String(process.env.PDF_ALLOWED_ORIGINS || "*")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const NORMALIZED_ALLOWED_ORIGINS = new Set(
  PDF_ALLOWED_ORIGINS.map((origin) => normalizeOrigin(origin)).filter(Boolean)
);

if (!process.env.PDF_SERVICE_TOKEN) {
  console.warn(
    "[pdf-service] PDF_SERVICE_TOKEN ausente. Usando token padrao de fallback; configure a variavel em producao."
  );
}

const marginValueSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?(mm|cm|in|px)?$/i, "Valor de margem invalido");

const pdfOptionsSchema = z
  .object({
    format: z
      .enum([
        "A0",
        "A1",
        "A2",
        "A3",
        "A4",
        "A5",
        "A6",
        "Letter",
        "Legal",
        "Tabloid",
      ])
      .default("A4"),
    landscape: z.boolean().default(false),
    printBackground: z.boolean().default(true),
    preferCSSPageSize: z.boolean().default(true),
    displayHeaderFooter: z.boolean().default(false),
    scale: z.number().min(0.1).max(2).optional(),
    waitUntil: z.enum(["load", "domcontentloaded", "networkidle"]).default("networkidle"),
    timeoutMs: z.number().int().min(1000).max(60000).default(15000),
    margin: z
      .object({
        top: marginValueSchema.optional(),
        right: marginValueSchema.optional(),
        bottom: marginValueSchema.optional(),
        left: marginValueSchema.optional(),
      })
      .optional(),
  })
  .default({});

const pdfRequestSchema = z
  .object({
    filename: z.string().trim().min(1).max(120).optional(),
    templateId: z.string().trim().regex(/^[a-z0-9_-]+$/i).max(80).optional(),
    html: z.string().trim().min(1).max(6_000_000).optional(),
    data: z.record(z.any()).default({}),
    options: pdfOptionsSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.html && !value.templateId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe 'html' ou 'templateId'.",
        path: ["html"],
      });
    }
  });

const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || NORMALIZED_ALLOWED_ORIGINS.has("*")) {
        callback(null, true);
        return;
      }

      const normalizedRequestOrigin = normalizeOrigin(origin);
      if (normalizedRequestOrigin && NORMALIZED_ALLOWED_ORIGINS.has(normalizedRequestOrigin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origem nao permitida pelo PDF service"));
    },
  })
);
app.use(express.json({ limit: PDF_BODY_LIMIT }));
app.use(morgan("tiny"));
app.use(
  "/pdf",
  rateLimit({
    windowMs: 60 * 1000,
    max: PDF_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const templateCache = new Map();
let browserPromise = null;

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "*") return "*";

  try {
    return new URL(raw).origin.toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

function sanitizeFilename(name = "documento") {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ensureFullHtmlDocument(inputHtml) {
  const html = String(inputHtml || "").trim();
  if (!html) return html;
  if (/<html[\s>]/i.test(html)) return html;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { size: A4; margin: 10mm; }
    body { margin: 0; padding: 0; color: #111; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; }
    table { width: 100%; border-collapse: collapse; }
    .page-break, [data-pdf-page-break="always"] { break-before: page; page-break-before: always; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
}

function injectBaseHref(html, baseUrl) {
  if (!baseUrl || !html || /<base[\s>]/i.test(html)) return html;
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return html.replace(
    /<head([^>]*)>/i,
    `<head$1><base href="${escapeHtmlAttr(normalizedBaseUrl)}">`
  );
}

async function loadTemplate(templateId) {
  const key = String(templateId).trim();
  if (!key) {
    throw new Error("templateId invalido.");
  }
  if (templateCache.has(key)) {
    return templateCache.get(key);
  }

  const templatePath = path.resolve(TEMPLATE_DIR, `${key}.html`);
  if (!templatePath.startsWith(TEMPLATE_DIR)) {
    throw new Error("templateId invalido.");
  }

  const template = await fs.readFile(templatePath, "utf8");
  templateCache.set(key, template);
  return template;
}

async function resolveHtmlFromPayload(payload) {
  if (payload.templateId) {
    const template = await loadTemplate(payload.templateId);
    return Mustache.render(template, payload.data || {});
  }
  return payload.html || "";
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser();
  }
  return browserPromise;
}

async function launchBrowser() {
  const launchOptions = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  };

  if (PDF_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = PDF_CHROMIUM_EXECUTABLE_PATH;
  }

  if (PDF_CHROMIUM_CHANNEL) {
    launchOptions.channel = PDF_CHROMIUM_CHANNEL;
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
  const waitUntil = options?.waitUntil || "networkidle";
  const timeout = options?.timeoutMs || 15000;

  try {
    await page.setContent(html, {
      waitUntil,
      timeout,
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

function requireToken(req, res, next) {
  if (!PDF_SERVICE_TOKENS.length) {
    res.status(503).json({
      message: "PDF_SERVICE_TOKEN nao configurado.",
    });
    return;
  }

  const headerToken = req.header("x-pdf-token")?.trim();
  const authHeader = req.header("authorization")?.trim() || "";
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const providedToken = (headerToken || bearerToken || "").trim();

  if (!providedToken || !PDF_SERVICE_TOKENS.includes(providedToken)) {
    res.status(401).json({ message: "Token invalido." });
    return;
  }

  next();
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.post("/pdf", requireToken, async (req, res) => {
  const parsed = pdfRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: "Payload invalido.",
      errors: parsed.error.flatten(),
    });
    return;
  }

  const payload = parsed.data;

  try {
    let html = await resolveHtmlFromPayload(payload);
    html = ensureFullHtmlDocument(html);
    html = injectBaseHref(html, PDF_PUBLIC_BASE_URL);

    const browser = await getBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await setPageContentWithFallback(page, html, payload.options);
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

      const filename = sanitizeFilename(payload.filename || "documento-gerado") || "documento-gerado";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Length", String(pdfBuffer.length));
      res.setHeader("Content-Disposition", `inline; filename="${filename}.pdf"`);
      res.send(pdfBuffer);
    } finally {
      await context.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Erro ao gerar PDF:", message);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }

    const missingBrowser =
      /Executable doesn't exist/i.test(message) ||
      /playwright install/i.test(message) ||
      /browserType\.launch/i.test(message);

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
  }
});

app.use((error, _req, res, _next) => {
  console.error("Erro interno no PDF service:", error);
  res.status(500).json({ message: "Erro interno no PDF service." });
});

const server = app.listen(PORT, () => {
  console.log(`[pdf-service] running on http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  server.close();
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  server.close();
  await closeBrowser();
  process.exit(0);
});
