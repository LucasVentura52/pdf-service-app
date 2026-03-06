import assert from "node:assert/strict";
import test from "node:test";
import {
  isRequestUrlAllowed,
  recordAssetRequest,
  resolveReusableSessionTarget,
  summarizeAssetRequests,
} from "../src/services/browserService.js";

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
