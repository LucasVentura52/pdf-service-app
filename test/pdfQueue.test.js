import assert from "node:assert/strict";
import test from "node:test";
import { createPdfQueue } from "../src/services/pdfQueue.js";

test("fila satura quando atinge limite de pendencias", async () => {
  const queue = createPdfQueue({
    maxConcurrentJobs: 1,
    maxPendingJobs: 1,
    acquireTimeoutMs: 1000,
  });

  const releaseFirst = await queue.acquirePdfJob();
  const secondPending = queue.acquirePdfJob();

  await assert.rejects(queue.acquirePdfJob(), /QUEUE_SATURATED|Fila de processamento lotada/);

  releaseFirst();
  const releaseSecond = await secondPending;
  releaseSecond();
});

test("fila expira quando espera alem do timeout", async () => {
  const queue = createPdfQueue({
    maxConcurrentJobs: 1,
    maxPendingJobs: 2,
    acquireTimeoutMs: 50,
  });

  const releaseFirst = await queue.acquirePdfJob();
  await assert.rejects(queue.acquirePdfJob(), /QUEUE_TIMEOUT|Tempo limite na fila/);
  releaseFirst();
});

test("fila expõe stats de concorrencia e pendencias", async () => {
  const queue = createPdfQueue({
    maxConcurrentJobs: 1,
    maxPendingJobs: 2,
    acquireTimeoutMs: 1000,
  });

  const releaseFirst = await queue.acquirePdfJob();
  const secondPending = queue.acquirePdfJob();

  const statsDuringWait = queue.getStats();
  assert.equal(statsDuringWait.activeJobs, 1);
  assert.equal(statsDuringWait.pendingJobs, 1);
  assert.equal(statsDuringWait.maxConcurrentJobs, 1);
  assert.equal(statsDuringWait.maxPendingJobs, 2);

  releaseFirst();
  const releaseSecond = await secondPending;
  releaseSecond();

  const statsAfterDrain = queue.getStats();
  assert.equal(statsAfterDrain.activeJobs, 0);
  assert.equal(statsAfterDrain.pendingJobs, 0);
});
