export function createOperationalState({ hasRequiredToken } = {}) {
  let phase = "starting";
  let warmupCompleted = false;
  let warmupError = null;
  let drainStartedAt = null;

  function getReadiness() {
    if (phase === "draining" || phase === "stopped") {
      return {
        ready: false,
        code: "DRAINING",
        message: "Servico em desligamento controlado.",
      };
    }

    if (!hasRequiredToken) {
      return {
        ready: false,
        code: "MISSING_TOKEN",
        message: "PDF_SERVICE_TOKEN nao configurado.",
      };
    }

    if (!warmupCompleted) {
      return {
        ready: false,
        code: "WARMING_UP",
        message: "Servico iniciando aquecimento interno.",
      };
    }

    if (warmupError) {
      return {
        ready: false,
        code: "WARMUP_FAILED",
        message: warmupError.message || "Warmup inicial falhou.",
      };
    }

    return {
      ready: true,
      code: "READY",
      message: "Servico pronto para gerar PDFs.",
    };
  }

  return {
    markWarmupSuccess() {
      warmupCompleted = true;
      warmupError = null;
      if (phase === "starting") {
        phase = "ready";
      }
    },
    markWarmupFailure(error) {
      warmupCompleted = true;
      warmupError = error instanceof Error ? error : new Error(String(error));
      if (phase === "starting") {
        phase = "degraded";
      }
    },
    beginDrain() {
      if (phase !== "draining") {
        phase = "draining";
        drainStartedAt = new Date().toISOString();
      }
    },
    markStopped() {
      phase = "stopped";
    },
    getReadiness,
    getSnapshot() {
      return {
        phase,
        warmupCompleted,
        warmupError: warmupError ? warmupError.message : null,
        drainStartedAt,
        readiness: getReadiness(),
      };
    },
  };
}
