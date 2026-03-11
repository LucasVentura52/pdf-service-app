import assert from "node:assert/strict";
import test from "node:test";
import { createOperationalState } from "../src/services/operationalState.js";

test("readiness inicia em warming_up e vai para ready apos warmup bem-sucedido", () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });

  assert.deepEqual(operationalState.getReadiness(), {
    ready: false,
    code: "WARMING_UP",
    message: "Servico iniciando aquecimento interno.",
  });

  operationalState.markWarmupSuccess();

  assert.deepEqual(operationalState.getReadiness(), {
    ready: true,
    code: "READY",
    message: "Servico pronto para gerar PDFs.",
  });
});

test("readiness entra em degraded quando warmup falha", () => {
  const operationalState = createOperationalState({ hasRequiredToken: true });

  operationalState.markWarmupFailure(new Error("browser indisponivel"));

  assert.deepEqual(operationalState.getReadiness(), {
    ready: false,
    code: "WARMUP_FAILED",
    message: "browser indisponivel",
  });
});

test("readiness bloqueia servico sem token e durante draining", () => {
  const missingTokenState = createOperationalState({ hasRequiredToken: false });

  assert.deepEqual(missingTokenState.getReadiness(), {
    ready: false,
    code: "MISSING_TOKEN",
    message: "PDF_SERVICE_TOKEN nao configurado.",
  });

  const drainingState = createOperationalState({ hasRequiredToken: true });
  drainingState.markWarmupSuccess();
  drainingState.beginDrain();

  assert.equal(drainingState.getSnapshot().phase, "draining");
  assert.equal(typeof drainingState.getSnapshot().drainStartedAt, "string");
  assert.deepEqual(drainingState.getReadiness(), {
    ready: false,
    code: "DRAINING",
    message: "Servico em desligamento controlado.",
  });
});
