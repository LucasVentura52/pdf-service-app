import assert from "node:assert/strict";
import test from "node:test";
import {
  isRequestUrlAllowed,
  recordAssetRequest,
  summarizeAssetRequests,
  mergeAllowedAssetOrigins,
} from "../src/services/browserNetworkPolicy.js";
import { resolveReusableSessionTarget, canUseDefaultSessionPool } from "../src/services/browserSessionPool.js";
import {
  buildChromiumLaunchOptions,
} from "../src/services/browserService.js";
import {
  BlockedAssetError,
  BrowserUnavailableError,
  normalizeBrowserError,
} from "../src/services/pdfServiceErrors.js";

test("permite asset publico quando allowlist esta vazia", () => {
  const allowed = isRequestUrlAllowed("https://cdn.example.com/image.png", new Set(), true);

  assert.equal(allowed, true);
});

test("bloqueia asset publico fora da allowlist configurada", () => {
  const allowed = isRequestUrlAllowed(
    "https://cdn.example.com/image.png",
    new Set(["https://sys.maisgerencia.com.br"]),
    true
  );

  assert.equal(allowed, false);
});

test("bloqueia localhost quando nao foi explicitamente permitido", () => {
  const allowed = isRequestUrlAllowed("http://localhost:5173/logo.png", new Set(), true);

  assert.equal(allowed, false);
});

test("permite origem explicitamente allowlisted mesmo em localhost", () => {
  const allowed = isRequestUrlAllowed(
    "http://localhost:5173/logo.png",
    new Set(["http://localhost:5173"]),
    true
  );

  assert.equal(allowed, true);
});

test("define target reutilizavel minimo quando reuse esta ativo", () => {
  const target = resolveReusableSessionTarget({
    maxConcurrentJobs: 4,
    prewarmedSessions: 0,
    reuseSessions: true,
  });

  assert.equal(target, 1);
});

test("alinha pool reutilizavel com concorrencia quando prewarm e reuse estao ativos", () => {
  const target = resolveReusableSessionTarget({
    maxConcurrentJobs: 4,
    prewarmedSessions: 1,
    reuseSessions: true,
  });

  assert.equal(target, 4);
});

test("limita target reutilizavel ao maximo de concorrencia", () => {
  const target = resolveReusableSessionTarget({
    maxConcurrentJobs: 2,
    prewarmedSessions: 5,
    reuseSessions: true,
  });

  assert.equal(target, 2);
});

test("resume requests de assets por origem e tipo", () => {
  const assetRequests = new Map();

  recordAssetRequest(assetRequests, "https://cdn.example.com/a.png", "image");
  recordAssetRequest(assetRequests, "https://cdn.example.com/b.css", "stylesheet");
  recordAssetRequest(assetRequests, "https://api.example.com/logo.svg", "image", true);
  recordAssetRequest(assetRequests, "data:image/png;base64,aaaa", "image");

  assert.deepEqual(summarizeAssetRequests(assetRequests), [
    {
      origin: "https://api.example.com",
      count: 1,
      blockedCount: 1,
      types: ["image"],
    },
    {
      origin: "https://cdn.example.com",
      count: 2,
      blockedCount: 0,
      types: ["image", "stylesheet"],
    },
  ]);
});

test("mescla origens permitidas padrao com origens extras por requisicao", () => {
  const merged = mergeAllowedAssetOrigins(
    new Set(["https://sys.maisgerencia.com.br"]),
    [" https://cdn.example.com ", ""]
  );

  assert.deepEqual(Array.from(merged).sort(), [
    "https://cdn.example.com",
    "https://sys.maisgerencia.com.br",
  ]);
});

test("remove export-tagged-pdf dos default args do chromium", () => {
  const launchOptions = buildChromiumLaunchOptions({
    pdfChromiumChannel: "",
    pdfChromiumExecutablePath: "",
  });

  assert.deepEqual(launchOptions.ignoreDefaultArgs, ["--export-tagged-pdf"]);
  assert.deepEqual(launchOptions.args, [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
  ]);
});

test("preserva channel e executablePath no launch do chromium", () => {
  const launchOptions = buildChromiumLaunchOptions({
    pdfChromiumChannel: "chrome",
    pdfChromiumExecutablePath: "/custom/chromium",
  });

  assert.equal(launchOptions.channel, "chrome");
  assert.equal(launchOptions.executablePath, "/custom/chromium");
});

test("nao usa pool padrao quando a requisicao traz allowlist extra de assets", () => {
  assert.equal(
    canUseDefaultSessionPool({
      allowedAssetOrigins: ["https://cdn.example.com"],
    }),
    false
  );

  assert.equal(canUseDefaultSessionPool({}), true);
});

test("normaliza erro de browser ausente para tipo estavel", () => {
  const error = normalizeBrowserError(
    new Error("browserType.launch: Executable doesn't exist at /ms-playwright/chromium")
  );

  assert.equal(error instanceof BrowserUnavailableError, true);
  assert.equal(error.code, "BROWSER_UNAVAILABLE");
});

test("normaliza bloqueio de asset para tipo estavel", () => {
  const error = normalizeBrowserError(new Error("net::ERR_BLOCKED_BY_CLIENT at https://cdn.example.com"));

  assert.equal(error instanceof BlockedAssetError, true);
  assert.equal(error.code, "BLOCKED_ASSET");
});
