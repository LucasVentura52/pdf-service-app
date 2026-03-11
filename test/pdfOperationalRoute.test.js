import assert from "node:assert/strict";
import test from "node:test";
import { createPdfRouter } from "../src/routes/pdfRoute.js";
import { createOperationalState } from "../src/services/operationalState.js";

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
