import assert from "node:assert/strict";
import test from "node:test";
import { createRenderService } from "../src/services/renderService.js";

function createConfig(overrides = {}) {
  return {
    pdfDefaultWaitUntil: "domcontentloaded",
    pdfNetworkidleBudgetMs: 800,
    pdfAssetWaitTimeoutMs: 400,
    pdfPublicBaseUrl: "https://sys.maisgerencia.com.br",
    sharedCss: "body { margin: 0; }",
    sharedPreviewCss: "body { background: #e5e7eb; }",
    ...overrides,
  };
}

function createMockPage() {
  const calls = { setContent: [], evaluate: [] };
  const page = {
    async setContent(html, options) {
      calls.setContent.push({ html, options });
      return undefined;
    },
    async evaluate(fn) {
      calls.evaluate.push({ fn: String(fn) });
      return undefined;
    },
  };
  return { page, calls };
}

function createMockSession() {
  const { page, calls } = createMockPage();
  let closed = false;
  const session = {
    page,
    close: async () => { closed = true; },
    get closed() { return closed; },
  };
  return { session, calls };
}

function createBrowserService(mockSession) {
  return {
    async createPageWithRecovery() {
      if (mockSession instanceof Error) throw mockSession;
      return mockSession;
    },
  };
}

test("render injeta doctype, css compartilhado e base href no html", async () => {
  const { session, calls } = createMockSession();
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig()
  );

  await renderService.render("<div>Conteudo</div>");

  assert.equal(calls.setContent.length, 1);
  const { html } = calls.setContent[0];
  assert.match(html, /<!doctype html/i);
  assert.match(html, /<html lang="pt-BR">/i);
  assert.match(html, /<style id="render-shared-css">/);
  assert.match(html, /body \{ margin: 0; \}/);
  assert.match(html, /<base href="https:\/\/sys\.maisgerencia\.com\.br\/">/);
  assert.match(html, /<div>Conteudo<\/div>/);
});

test("render usa css de preview quando mode=preview", async () => {
  const { session, calls } = createMockSession();
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig()
  );

  await renderService.render("<div>Preview</div>", { mode: "preview" });

  assert.equal(calls.setContent.length, 1);
  const { html } = calls.setContent[0];
  assert.match(html, /body \{ background: #e5e7eb; \}/);
});

test("render usa css padrao quando mode=pdf", async () => {
  const { session, calls } = createMockSession();
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig()
  );

  await renderService.render("<div>PDF</div>", { mode: "pdf" });

  assert.equal(calls.setContent.length, 1);
  const { html } = calls.setContent[0];
  assert.match(html, /body \{ margin: 0; \}/);
});

test("render passa waitUntil e timeout corretos para setContent", async () => {
  const { session, calls } = createMockSession();
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig({ pdfDefaultWaitUntil: "networkidle", pdfNetworkidleBudgetMs: 2000 })
  );

  await renderService.render("<div>Test</div>", { timeoutMs: 10000 });

  assert.equal(calls.setContent.length, 1);
  assert.deepEqual(calls.setContent[0].options, {
    waitUntil: "networkidle",
    timeout: 2000,
  });
});

test("render usa domcontentloaded quando waitUntil nao e networkidle", async () => {
  const { session, calls } = createMockSession();
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig({ pdfDefaultWaitUntil: "domcontentloaded" })
  );

  await renderService.render("<div>Test</div>");

  assert.equal(calls.setContent.length, 1);
  assert.equal(calls.setContent[0].options.waitUntil, "domcontentloaded");
  assert.equal(calls.setContent[0].options.timeout, 15000);
});

test("render faz fallback de networkidle para domcontentloaded em caso de timeout", async () => {
  const setContentCalls = [];
  let attempt = 0;
  const page = {
    async setContent(_html, options) {
      setContentCalls.push(options);
      attempt++;
      if (attempt === 1 && options.waitUntil === "networkidle") {
        throw new Error("Timeout 1200ms exceeded");
      }
    },
    async evaluate() {},
  };
  const session = { page, close: async () => {} };
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig({ pdfDefaultWaitUntil: "networkidle", pdfNetworkidleBudgetMs: 1200 })
  );

  await renderService.render("<div>Test</div>", { timeoutMs: 10000 });

  assert.equal(setContentCalls.length, 2);
  assert.equal(setContentCalls[0].waitUntil, "networkidle");
  assert.equal(setContentCalls[0].timeout, 1200);
  assert.equal(setContentCalls[1].waitUntil, "domcontentloaded");
  assert.equal(setContentCalls[1].timeout, 10000);
});

test("render nao chama evaluate quando pdfAssetWaitTimeoutMs=0 mesmo com CSS injetado", async () => {
  const { session, calls } = createMockSession();
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig({ pdfAssetWaitTimeoutMs: 0 })
  );

  await renderService.render("<div>Texto puro</div>");

  assert.equal(calls.evaluate.length, 0);
});

test("render chama evaluate para assets com CSS injetado", async () => {
  const { session, calls } = createMockSession();
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig({ pdfAssetWaitTimeoutMs: 400 })
  );

  await renderService.render("<div>Texto with CSS trigger</div>");

  assert.equal(calls.evaluate.length, 1);
  assert.ok(calls.evaluate[0].fn.includes("waitFonts"));
});

test("render chama evaluate para assets e normalizacao com opt-in", async () => {
  const { session, calls } = createMockSession();
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig({ pdfAssetWaitTimeoutMs: 400 })
  );

  await renderService.render(
    '<div data-pdf-normalize-page-breaks><img src="a.png" /></div>'
  );

  assert.equal(calls.evaluate.length, 2);
  assert.ok(calls.evaluate[0].fn.includes("waitFonts"));
  assert.ok(calls.evaluate[1].fn.includes("BREAK_SELECTOR"));
});

test("render retorna page e session", async () => {
  const { session } = createMockSession();
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig()
  );

  const result = await renderService.render("<div>Test</div>");

  assert.equal(result.page, session.page);
  assert.equal(result.session, session);
});

test("render propaga erro de BrowserUnavailableError", async () => {
  const { BrowserUnavailableError } = await import("../src/services/pdfServiceErrors.js");
  const errorSession = new BrowserUnavailableError();
  const renderService = createRenderService(
    createBrowserService(errorSession),
    createConfig()
  );

  await assert.rejects(
    () => renderService.render("<div>Test</div>"),
    (err) => err instanceof BrowserUnavailableError
  );
});

test("render nao normaliza page breaks quando html nao tem opt-in", async () => {
  const { session, calls } = createMockSession();
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig()
  );

  await renderService.render("<div>Sem page break</div>");

  const evaluateCalls = calls.evaluate.filter((c) =>
    c.fn.includes("BREAK_SELECTOR")
  );
  assert.equal(evaluateCalls.length, 0);
});

test("render normaliza page breaks quando html tem opt-in", async () => {
  const { session, calls } = createMockSession();
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig()
  );

  await renderService.render('<div data-pdf-normalize-page-breaks>Com page break</div>');

  const evaluateCalls = calls.evaluate.filter((c) =>
    c.fn.includes("BREAK_SELECTOR")
  );
  assert.equal(evaluateCalls.length, 1);
});

test("render fecha sessao e propaga erro quando setContent falha sem ser timeout", async () => {
  const { page } = createMockPage();
  let closed = false;
  const session = {
    page,
    close: async () => { closed = true; },
  };
  page.setContent = async () => {
    throw new Error("browserType.launch: Executable doesn't exist");
  };
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig()
  );

  await assert.rejects(() => renderService.render("<div>Test</div>"));

  assert.equal(closed, true);
});

test("render nao interrompe por erro no evaluate de assets", async () => {
  const { page } = createMockPage();
  const session = { page, close: async () => {} };
  page.evaluate = async (fn) => {
    if (String(fn).includes("waitFonts")) {
      throw new Error("asset timeout");
    }
  };
  const renderService = createRenderService(
    createBrowserService(session),
    createConfig({ pdfAssetWaitTimeoutMs: 400 })
  );

  const result = await renderService.render('<div><img src="a.png" /></div>');

  assert.ok(result);
  assert.equal(result.page, page);
});
