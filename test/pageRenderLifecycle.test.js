import assert from "node:assert/strict";
import test from "node:test";
import {
  createPageRenderLifecycle,
  shouldNormalizePageBreaks,
} from "../src/services/pageRenderLifecycle.js";
import { BrowserUnavailableError } from "../src/services/pdfServiceErrors.js";

test("detecta opt-in de normalizacao por marcador explicito ou ancora de conteudo", () => {
  assert.equal(shouldNormalizePageBreaks('<div data-pdf-normalize-page-breaks></div>'), true);
  assert.equal(shouldNormalizePageBreaks('<div data-pdf-content-anchor></div>'), true);
  assert.equal(shouldNormalizePageBreaks("<div>sem marcador</div>"), false);
});

test("repete setContent com domcontentloaded quando networkidle expira", async () => {
  const lifecycle = createPageRenderLifecycle({
    pdfDefaultWaitUntil: "domcontentloaded",
    pdfNetworkidleBudgetMs: 1200,
    pdfAssetWaitTimeoutMs: 0,
  });
  const calls = [];
  const page = {
    async setContent(_html, options) {
      calls.push(options);
      if (options.waitUntil === "networkidle") {
        throw new Error("Timeout 1200ms exceeded");
      }
    },
  };

  await lifecycle.setPageContentWithFallback(page, "<html></html>", {
    waitUntil: "networkidle",
    timeoutMs: 5000,
  });

  assert.deepEqual(calls, [
    { waitUntil: "networkidle", timeout: 1200 },
    { waitUntil: "domcontentloaded", timeout: 5000 },
  ]);
});

test("normaliza erro de render nao recuperavel para erro tipado", async () => {
  const lifecycle = createPageRenderLifecycle({
    pdfDefaultWaitUntil: "domcontentloaded",
    pdfNetworkidleBudgetMs: 1200,
    pdfAssetWaitTimeoutMs: 0,
  });
  const page = {
    async setContent() {
      throw new Error("browserType.launch: Executable doesn't exist");
    },
  };

  await assert.rejects(
    () => lifecycle.setPageContentWithFallback(page, "<html></html>", {}),
    (error) => error instanceof BrowserUnavailableError
  );
});

test("aguarda readySelector quando configurado", async () => {
  const lifecycle = createPageRenderLifecycle({
    pdfDefaultWaitUntil: "domcontentloaded",
    pdfNetworkidleBudgetMs: 1200,
    pdfAssetWaitTimeoutMs: 0,
  });
  const page = {
    async setContent() {},
    async waitForSelector(selector, options) {
      assert.equal(selector, "#pdf-ready");
      assert.deepEqual(options, {
        state: "attached",
        timeout: 900,
      });
    },
  };

  await lifecycle.setPageContentWithFallback(page, "<html></html>", {
    readySelector: "#pdf-ready",
    readyTimeoutMs: 900,
    timeoutMs: 5000,
  });
});
