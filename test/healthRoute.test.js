import assert from "node:assert/strict";
import test from "node:test";
import { createHealthRouter } from "../src/routes/healthRoute.js";
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
  };
}

async function dispatch(router, { method = "GET", url = "/", body = null } = {}) {
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

test("GET /ready responde 503 durante startup e 200 apos warmup", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });
  const router = createHealthRouter({ operationalState });

  let response = await dispatch(router, { url: "/ready" });
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.readiness.code, "WARMING_UP");

  operationalState.markWarmupSuccess();

  response = await dispatch(router, { url: "/ready" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.readiness.code, "READY");
});

test("GET /health expõe status degraded quando readiness nao esta pronta", async () => {
  const operationalState = createOperationalState({ hasRequiredToken: false });
  const router = createHealthRouter({
    operationalState,
    pdfQueue: { getStats: () => ({ activeJobs: 0 }) },
    browserService: { getStats: () => ({ browserLaunched: false }) },
    templateService: { getStats: () => ({ cachedTemplates: 0 }) },
    config: {
      pdfMaxConcurrentJobs: 2,
      pdfMaxPendingJobs: 50,
      pdfQueueWaitTimeoutMs: 15000,
    },
  });

  const response = await dispatch(router, { url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "degraded");
  assert.equal(response.body.readiness.code, "MISSING_TOKEN");
  assert.equal(response.body.queue.activeJobs, 0);
});
