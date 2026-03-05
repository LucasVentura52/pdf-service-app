import process from "node:process";

const WAIT_UNTIL_OPTIONS = new Set(["load", "domcontentloaded", "networkidle"]);
const DEFAULT_LOCAL_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:4173",
];

export function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "*") return "*";

  try {
    return new URL(raw).origin.toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

export function normalizeWaitUntil(value, fallback = "domcontentloaded") {
  const raw = String(value || "").trim().toLowerCase();
  if (WAIT_UNTIL_OPTIONS.has(raw)) {
    return raw;
  }
  return fallback;
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseTrustProxy(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw || raw === "false" || raw === "0") return false;
  if (raw === "true" || raw === "1") return 1;
  const asNumber = Number(raw);
  if (Number.isInteger(asNumber) && asNumber >= 0) return asNumber;
  return raw;
}

const pdfServiceTokens = splitCsv(process.env.PDF_SERVICE_TOKEN);
const pdfAllowedOrigins = splitCsv(process.env.PDF_ALLOWED_ORIGINS);
const pdfPublicBaseUrl = String(process.env.PDF_PUBLIC_BASE_URL || "").trim();
const pdfAllowLocalDevOrigins = String(process.env.PDF_ALLOW_LOCALHOST_ORIGINS || "1").trim() !== "0";
const configuredCorsOrigins = pdfAllowedOrigins.length ? pdfAllowedOrigins : [pdfPublicBaseUrl].filter(Boolean);
const corsOriginSeeds = pdfAllowLocalDevOrigins
  ? [...configuredCorsOrigins, ...DEFAULT_LOCAL_DEV_ORIGINS]
  : configuredCorsOrigins;
const pdfAllowedAssetOrigins = splitCsv(process.env.PDF_ALLOWED_ASSET_ORIGINS);
const pdfBlockPrivateNetwork = String(process.env.PDF_BLOCK_PRIVATE_NETWORK || "1").trim() !== "0";
const normalizedConfiguredAssetOrigins = pdfAllowedAssetOrigins
  .map((origin) => normalizeOrigin(origin))
  .filter((origin) => Boolean(origin) && origin !== "*");
const assetOriginSeeds = normalizedConfiguredAssetOrigins;

export const config = {
  port: Number(process.env.PORT || 3100),
  pdfServiceTokens,
  pdfPublicBaseUrl,
  pdfRateLimitMax: Number(process.env.PDF_RATE_LIMIT_MAX || 40),
  pdfBodyLimit: process.env.PDF_BODY_LIMIT || "8mb",
  pdfAllowLocalDevOrigins,
  pdfChromiumChannel: String(process.env.PDF_CHROMIUM_CHANNEL || "").trim(),
  pdfChromiumExecutablePath: String(process.env.PDF_CHROMIUM_EXECUTABLE_PATH || "").trim(),
  pdfMaxConcurrentJobs: Math.max(1, Number(process.env.PDF_MAX_CONCURRENT_JOBS || 2)),
  pdfMaxPendingJobs: Math.max(0, Number(process.env.PDF_MAX_PENDING_JOBS || 50)),
  pdfQueueWaitTimeoutMs: Math.max(0, Number(process.env.PDF_QUEUE_WAIT_TIMEOUT_MS || 15000)),
  pdfLogPerformance: String(process.env.PDF_LOG_PERFORMANCE || "").trim() === "1",
  pdfDefaultWaitUntil: normalizeWaitUntil(process.env.PDF_DEFAULT_WAIT_UNTIL, "domcontentloaded"),
  pdfNetworkidleBudgetMs: Math.max(300, Number(process.env.PDF_NETWORKIDLE_BUDGET_MS || 1200)),
  pdfAssetWaitTimeoutMs: Math.max(0, Number(process.env.PDF_ASSET_WAIT_TIMEOUT_MS || 600)),
  trustProxy: parseTrustProxy(process.env.PDF_TRUST_PROXY),
  normalizedAllowedOrigins: new Set(
    corsOriginSeeds.map((origin) => normalizeOrigin(origin)).filter(Boolean)
  ),
  normalizedAllowedAssetOrigins: new Set(
    assetOriginSeeds
  ),
  pdfBlockPrivateNetwork,
};

export function assertCriticalConfig() {
  if (config.normalizedAllowedOrigins.has("*")) {
    throw new Error(
      "[pdf-service] PDF_ALLOWED_ORIGINS nao pode conter '*'. Configure origens explicitas."
    );
  }
}

if (!config.pdfServiceTokens.length) {
  console.warn(
    "[pdf-service] PDF_SERVICE_TOKEN nao configurado. Endpoint /pdf respondera 503 ate que o token seja definido."
  );
}

if (!pdfAllowedOrigins.length && config.normalizedAllowedOrigins.size) {
  console.warn(
    "[pdf-service] PDF_ALLOWED_ORIGINS vazio. Usando origem de PDF_PUBLIC_BASE_URL como fallback para CORS."
  );
}

if (config.pdfAllowLocalDevOrigins) {
  console.warn("[pdf-service] Origens locais de desenvolvimento estao liberadas para CORS.");
}

if (!config.normalizedAllowedOrigins.size) {
  console.warn(
    "[pdf-service] PDF_ALLOWED_ORIGINS/PDF_PUBLIC_BASE_URL vazios: requests de browser com Origin serao bloqueadas."
  );
}

if (!config.normalizedAllowedAssetOrigins.size) {
  console.warn(
    "[pdf-service] PDF_ALLOWED_ASSET_ORIGINS vazio. Assets HTTP/HTTPS publicos serao permitidos; rede privada/localhost continuam bloqueados."
  );
}

if (pdfAllowedOrigins.includes("*")) {
  console.warn("[pdf-service] '*' em PDF_ALLOWED_ORIGINS esta descontinuado e agora bloqueia startup.");
}
