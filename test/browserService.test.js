import assert from "node:assert/strict";
import test from "node:test";
import { isRequestUrlAllowed } from "../src/services/browserService.js";

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
