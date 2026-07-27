import assert from "node:assert/strict";
import test from "node:test";
import { createPdfRouter } from "../src/routes/pdfRoute.js";
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
    if (error) {
      throw error;
    }
  });
  await new Promise((resolve) => setImmediate(resolve));

  return res;
}

test("POST /pdf rejeita novas requisicoes enquanto o servico esta draining", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();
  operationalState.beginDrain();

  const router = createPdfRouter({
    requireToken: (_req, _res, next) => next(),
    pdfQueue: {
      acquirePdfJob: async () => {
        throw new Error("queue should not be touched while draining");
      },
    },
    renderService: { render: async () => ({ page: {}, session: { close: async () => {} } }) },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
      url: "/",
      body: {
        html: "<div>noop</div>",
      },
    });

  assert.equal(response.statusCode, 503);
  assert.equal(response.headers["retry-after"], "10");
  assert.equal(response.body.code, "DRAINING");
});

test("POST /pdf mapeia BrowserUnavailableError para 503", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();

  const router = createPdfRouter({
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
      body: {
        html: "<div>noop</div>",
      },
    });

  assert.equal(response.statusCode, 503);
  assert.match(response.body.message, /Playwright browser nao instalado/i);
});

test("POST /pdf mapeia BlockedAssetError para 400", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();

  const router = createPdfRouter({
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
      body: {
        html: "<div>noop</div>",
      },
    });

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /recurso externo nao permitido/i);
});

test("POST /pdf nao normaliza pagina quando html nao possui opt-in", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();

  const router = createPdfRouter({
    requireToken: (_req, _res, next) => next(),
    pdfQueue: {
      acquirePdfJob: async () => () => {},
    },
    renderService: {
      render: async () => ({
        page: {
          pdf: async () => Buffer.from("pdf"),
        },
        session: { close: async () => {} },
      }),
    },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
      url: "/",
      body: {
        html: "<div>noop</div>",
      },
    });

  assert.equal(response.statusCode, 200);
});

test("POST /pdf aceita html direto e retorna pdf com headers corretos", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();

  const router = createPdfRouter({
    requireToken: (_req, _res, next) => next(),
    pdfQueue: {
      acquirePdfJob: async () => () => {},
    },
    renderService: {
      render: async () => ({
        page: {
          pdf: async () => Buffer.from("%PDF-mock"),
        },
        session: { close: async () => {} },
      }),
    },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
    url: "/",
    body: {
      html: "<div>HTML direto</div>",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/pdf");
  assert.equal(response.headers["content-disposition"], 'inline; filename="documento-gerado.pdf"');
  assert.equal(response.headers["content-length"], String(Buffer.from("%PDF-mock").length));
  assert.equal(response.body.toString("latin1"), "%PDF-mock");
});

test("POST /pdf rejeita payload legado com templateId", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();

  const router = createPdfRouter({
    requireToken: (_req, _res, next) => next(),
    pdfQueue: {
      acquirePdfJob: async () => {
        throw new Error("queue should not be used for invalid payload");
      },
    },
    renderService: { render: async () => ({ page: {}, session: { close: async () => {} } }) },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
    url: "/",
    body: {
      html: "<div>Relatorio legado</div>",
      templateId: "report",
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(JSON.stringify(response.body.errors), /templateId/i);
});
