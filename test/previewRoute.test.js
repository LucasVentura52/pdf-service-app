import assert from "node:assert/strict";
import test from "node:test";
import { createPreviewRouter } from "../src/routes/previewRoute.js";
import { createOperationalState } from "../src/services/operationalState.js";
import {
  BlockedAssetError,
  BrowserUnavailableError,
} from "../src/services/pdfServiceErrors.js";

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

async function dispatch(router, { method = "POST", url = "/", body = null } = {}) {
  const req = {
    method,
    url,
    originalUrl: url,
    body,
    headers: {},
    header(name) {
      return this.headers[String(name).toLowerCase()];
    },
  };
  const res = createMockResponse();

  router.handle(req, res, (error) => {
    if (error) throw error;
  });
  await new Promise((resolve) => setImmediate(resolve));

  return res;
}

function setupRouter(overrides = {}) {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();

  const mockPage = {
    async evaluate(fn) {
      if (typeof fn === "function") {
        const headStyles = '<link rel="stylesheet" href="style.css">';
        const bodyHtml = "<div>Preview content</div>";
        return JSON.stringify({ headAssets: headStyles, bodyHtml });
      }
      return "";
    },
    async setContent() {},
  };

  const router = createPreviewRouter({
    requireToken: (_req, _res, next) => next(),
    pdfQueue: {
      acquirePdfJob: async () => () => {},
    },
    renderService: {
      render: async () => ({
        page: mockPage,
        session: { close: async () => {} },
      }),
    },
    config: {},
    operationalState,
    ...overrides,
  });

  return { router, mockPage };
}

test("POST /preview rejeita requisicao sem token", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();

  const router = createPreviewRouter({
    requireToken: (_req, res, next) => {
      res.status(401).json({ message: "Token nao informado." });
    },
    pdfQueue: {
      acquirePdfJob: async () => () => {},
    },
    renderService: {
      render: async () => ({ page: {}, session: { close: async () => {} } }),
    },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
    url: "/",
    body: { html: "<div>test</div>" },
  });

  assert.equal(response.statusCode, 401);
});

test("POST /preview rejeita payload sem html", async () => {
  const { router } = setupRouter();

  const response = await dispatch(router, {
    url: "/",
    body: {},
  });

  assert.equal(response.statusCode, 400);
});

test("POST /preview rejeita payload com html vazio", async () => {
  const { router } = setupRouter();

  const response = await dispatch(router, {
    url: "/",
    body: { html: "" },
  });

  assert.equal(response.statusCode, 400);
});

test("POST /preview retorna HTML com estilo e body do preview", async () => {
  const { router } = setupRouter();

  const response = await dispatch(router, {
    url: "/",
    body: { html: "<div>Preview test</div>" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(response.headers["cache-control"], "no-store");
  assert.ok(response.body.includes("Preview content"));
  assert.ok(response.body.includes("style.css"));
  assert.ok(response.body.includes("Quebra de página"));
});

test("POST /preview injeta script de visualizacao de quebra de pagina", async () => {
  const { router } = setupRouter();

  const response = await dispatch(router, {
    url: "/",
    body: { html: "<div>test</div>" },
  });

  assert.ok(response.body.includes("preview-page-break"));
  assert.ok(response.body.includes("mce-pagebreak"));
  assert.ok(response.body.includes("✂ Quebra de página"));
});

test("POST /preview rejeita durante draining", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();
  operationalState.beginDrain();

  const router = createPreviewRouter({
    requireToken: (_req, _res, next) => next(),
    pdfQueue: {
      acquirePdfJob: async () => () => {},
    },
    renderService: {
      render: async () => ({ page: {}, session: { close: async () => {} } }),
    },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
    url: "/",
    body: { html: "<div>test</div>" },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.headers["retry-after"], "10");
  assert.equal(response.body.code, "DRAINING");
});

test("POST /preview mapeia BrowserUnavailableError para 503", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();

  const router = createPreviewRouter({
    requireToken: (_req, _res, next) => next(),
    pdfQueue: {
      acquirePdfJob: async () => () => {},
    },
    renderService: {
      render: async () => {
        throw new BrowserUnavailableError();
      },
    },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
    url: "/",
    body: { html: "<div>test</div>" },
  });

  assert.equal(response.statusCode, 503);
});

test("POST /preview mapeia BlockedAssetError para 400", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();

  const router = createPreviewRouter({
    requireToken: (_req, _res, next) => next(),
    pdfQueue: {
      acquirePdfJob: async () => () => {},
    },
    renderService: {
      render: async () => {
        throw new BlockedAssetError();
      },
    },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
    url: "/",
    body: { html: "<div>test</div>" },
  });

  assert.equal(response.statusCode, 400);
});

test("POST /preview retorna 503 quando fila esta saturada", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();

  const { QueueSaturatedError } = await import("../src/services/pdfQueue.js");

  const router = createPreviewRouter({
    requireToken: (_req, _res, next) => next(),
    pdfQueue: {
      acquirePdfJob: async () => {
        throw new QueueSaturatedError(3);
      },
    },
    renderService: {
      render: async () => ({ page: {}, session: { close: async () => {} } }),
    },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
    url: "/",
    body: { html: "<div>test</div>" },
  });

  assert.equal(response.statusCode, 503);
  assert.ok(response.body.message.includes("Fila"));
});

test("POST /preview fecha sessao apos completar", async () => {
  let closed = false;
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();

  const mockPage = {
    async evaluate() {
      return JSON.stringify({ headAssets: "", bodyHtml: "<div>ok</div>" });
    },
  };

  const router = createPreviewRouter({
    requireToken: (_req, _res, next) => next(),
    pdfQueue: {
      acquirePdfJob: async () => () => {},
    },
    renderService: {
      render: async () => ({
        page: mockPage,
        session: { close: async () => { closed = true; } },
      }),
    },
    config: {},
    operationalState,
  });

  await dispatch(router, {
    url: "/",
    body: { html: "<div>test</div>" },
  });

  assert.equal(closed, true);
});
