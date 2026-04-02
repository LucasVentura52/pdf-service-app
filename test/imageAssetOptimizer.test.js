import assert from "node:assert/strict";
import test from "node:test";
import { createImageAssetOptimizer } from "../src/services/imageAssetOptimizer.js";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnR2S8AAAAASUVORK5CYII=";

function createOptimizer(overrides = {}) {
  return createImageAssetOptimizer({
    normalizedAllowedAssetOrigins: new Set(),
    pdfBlockPrivateNetwork: true,
    pdfImageFetchTimeoutMs: 2000,
    pdfImageCacheTtlMs: 60_000,
    pdfImageOptimizeCacheEntries: 50,
    ...overrides,
  });
}

test("otimiza imagens do vehicleListReport para data URL com cache", async () => {
  const calls = [];
  const originalFetch = global.fetch;
  const pngBuffer = Buffer.from(ONE_PIXEL_PNG_BASE64, "base64");

  global.fetch = async (url) => {
    calls.push(url);
    return {
      ok: true,
      headers: {
        get(name) {
          return String(name).toLowerCase() === "content-type" ? "image/png" : null;
        },
      },
      async arrayBuffer() {
        return pngBuffer;
      },
    };
  };

  try {
    const optimizer = createOptimizer();
    const payload = {
      company: {
        logo: "https://cdn.example.com/logo.png",
      },
      vehicles: [
        { photo: "https://cdn.example.com/carro-1.jpg" },
        { photo: "https://cdn.example.com/carro-1.jpg" },
      ],
    };

    const optimized = await optimizer.optimizeTemplateData("vehicleListReport", payload);

    assert.match(String(optimized.company.logo), /^data:image\/webp;base64,/);
    assert.match(String(optimized.vehicles[0].photo), /^data:image\/webp;base64,/);
    assert.equal(optimized.vehicles[0].photo, optimized.vehicles[1].photo);
    assert.equal(calls.length, 2);

    await optimizer.optimizeTemplateData("vehicleListReport", payload);
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test("mantem URL original quando template nao possui regras de otimizacao", async () => {
  const optimizer = createOptimizer();
  const payload = {
    image: "https://cdn.example.com/arquivo.png",
  };

  const optimized = await optimizer.optimizeTemplateData("peopleReport", payload);

  assert.deepEqual(optimized, payload);
});
