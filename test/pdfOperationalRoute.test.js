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
    templateService: {
      resolveHtmlFromPayload: async () => "<html><body>noop</body></html>",
    },
    browserService: {},
    nativeReportPdfService: {
      canRenderPayload: () => false,
    },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
    url: "/",
    body: {
      templateId: "contract",
      data: {},
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
    templateService: {
      resolveHtmlFromPayload: async () => "<html><body>noop</body></html>",
    },
    browserService: {
      createPageWithRecovery: async () => {
        throw new BrowserUnavailableError();
      },
    },
    nativeReportPdfService: {
      canRenderPayload: () => false,
    },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
    url: "/",
    body: {
      templateId: "contract",
      data: {},
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
    templateService: {
      resolveHtmlFromPayload: async () => "<html><body>noop</body></html>",
    },
    browserService: {
      createPageWithRecovery: async () => ({
        page: {},
        close: async () => {},
      }),
      setPageContentWithFallback: async () => {
        throw new BlockedAssetError();
      },
    },
    nativeReportPdfService: {
      canRenderPayload: () => false,
    },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
    url: "/",
    body: {
      templateId: "contract",
      data: {},
    },
  });

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /recurso externo nao permitido/i);
});

test("POST /pdf nao normaliza pagina quando html nao possui opt-in", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  operationalState.markWarmupSuccess();
  let normalizeCalled = false;

  const router = createPdfRouter({
    requireToken: (_req, _res, next) => next(),
    pdfQueue: {
      acquirePdfJob: async () => () => {},
    },
    templateService: {
      resolveHtmlFromPayload: async () => "<html><body><div>noop</div></body></html>",
    },
    browserService: {
      createPageWithRecovery: async () => ({
        page: {
          pdf: async () => Buffer.from("pdf"),
        },
        close: async () => {},
      }),
      setPageContentWithFallback: async () => {},
      normalizePageBreaks: async () => {
        normalizeCalled = true;
      },
    },
    nativeReportPdfService: {
      canRenderPayload: () => false,
    },
    config: {},
    operationalState,
  });

  const response = await dispatch(router, {
    url: "/",
    body: {
      templateId: "contract",
      data: {},
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(normalizeCalled, false);
});
