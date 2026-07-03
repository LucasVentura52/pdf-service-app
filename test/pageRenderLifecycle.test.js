import assert from "node:assert/strict";
import test from "node:test";
import {
  createPageRenderLifecycle,
  hasLikelyVisualAssets,
  shouldNormalizePageBreaks,
} from "../src/services/pageRenderLifecycle.js";
import { BrowserUnavailableError } from "../src/services/pdfServiceErrors.js";

test("detecta opt-in de normalizacao por marcador explicito ou ancora de conteudo", () => {
  assert.equal(shouldNormalizePageBreaks('<div data-pdf-normalize-page-breaks></div>'), true);
  assert.equal(shouldNormalizePageBreaks('<div data-pdf-content-anchor></div>'), true);
  assert.equal(shouldNormalizePageBreaks("<div>sem marcador</div>"), false);
});

test("detecta quando html provavelmente exige espera por assets visuais", () => {
  assert.equal(hasLikelyVisualAssets('<img src="a.png" />'), true);
  assert.equal(hasLikelyVisualAssets("<style>body{background:url(a.png)}</style>"), true);
  assert.equal(hasLikelyVisualAssets("<div>somente texto</div>"), false);
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

test("nao aguarda assets visuais quando html nao tem indicios de recursos graficos", async () => {
  const lifecycle = createPageRenderLifecycle({
    pdfDefaultWaitUntil: "domcontentloaded",
    pdfNetworkidleBudgetMs: 1200,
    pdfAssetWaitTimeoutMs: 400,
  });
  let evaluateCalled = false;
  const page = {
    async setContent() {},
    async evaluate() {
      evaluateCalled = true;
    },
  };

  await lifecycle.setPageContentWithFallback(page, "<html><body><p>Texto puro</p></body></html>", {
    timeoutMs: 5000,
  });

  assert.equal(evaluateCalled, false);
});

test("aguarda assets visuais quando html contem imagens", async () => {
  const lifecycle = createPageRenderLifecycle({
    pdfDefaultWaitUntil: "domcontentloaded",
    pdfNetworkidleBudgetMs: 1200,
    pdfAssetWaitTimeoutMs: 400,
  });
  let evaluateCalled = false;
  const page = {
    async setContent() {},
    async evaluate() {
      evaluateCalled = true;
    },
  };

  await lifecycle.setPageContentWithFallback(page, '<html><body><img src="a.png" /></body></html>', {
    timeoutMs: 5000,
  });

  assert.equal(evaluateCalled, true);
});
