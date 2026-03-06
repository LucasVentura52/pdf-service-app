export class QueueSaturatedError extends Error {
  constructor(maxPendingJobs) {
    super(`Fila de processamento lotada (maxPendingJobs=${maxPendingJobs}).`);
    this.name = "QueueSaturatedError";
    this.code = "QUEUE_SATURATED";
    this.maxPendingJobs = maxPendingJobs;
  }
}

export class QueueTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Tempo limite na fila excedido (${timeoutMs}ms).`);
    this.name = "QueueTimeoutError";
    this.code = "QUEUE_TIMEOUT";
    this.timeoutMs = timeoutMs;
  }
}

export function createPdfQueue({
  maxConcurrentJobs,
  maxPendingJobs = 50,
  acquireTimeoutMs = 15000,
}) {
  let activeJobs = 0;
  const pendingJobs = [];

  async function acquirePdfJob() {
    if (activeJobs < maxConcurrentJobs) {
      activeJobs += 1;
      return releasePdfJob;
    }

    if (pendingJobs.length >= maxPendingJobs) {
      throw new QueueSaturatedError(maxPendingJobs);
    }

    return new Promise((resolve, reject) => {
      const item = {
        resolve,
        reject,
        settled: false,
        timer: null,
      };

      if (acquireTimeoutMs > 0) {
        item.timer = setTimeout(() => {
          if (item.settled) return;
          item.settled = true;
          removePendingJob(item);
          item.reject(new QueueTimeoutError(acquireTimeoutMs));
        }, acquireTimeoutMs);
      }

      pendingJobs.push(item);
    });
  }

  function removePendingJob(item) {
    const index = pendingJobs.indexOf(item);
    if (index >= 0) {
      pendingJobs.splice(index, 1);
    }
  }

  function releasePdfJob() {
    const next = pendingJobs.shift();
    if (next) {
      next.settled = true;
      if (next.timer) clearTimeout(next.timer);
      next.resolve(releasePdfJob);
      return;
    }
    activeJobs = Math.max(0, activeJobs - 1);
  }

  return {
    acquirePdfJob,
    getStats() {
      return {
        activeJobs,
        pendingJobs: pendingJobs.length,
        maxConcurrentJobs,
        maxPendingJobs,
        acquireTimeoutMs,
      };
    },
  };
}
