import assert from "node:assert/strict";
import test from "node:test";
import { buildNormalizedAllowedAssetOrigins } from "../src/config.js";

test("inclui a origem de PDF_PUBLIC_BASE_URL na allowlist de assets", () => {
  const origins = buildNormalizedAllowedAssetOrigins(
    ["https://api.maisgerencia.com.br"],
    "https://sys.maisgerencia.com.br/app"
  );

  assert.deepEqual(Array.from(origins).sort(), [
    "https://api.maisgerencia.com.br",
    "https://sys.maisgerencia.com.br",
  ]);
});
