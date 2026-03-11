import "dotenv/config";
import process from "node:process";
import { config } from "./config.js";
import { startServer } from "./app.js";

const { server, closeBrowser, operationalState } = startServer();
let shutdownPromise = null;

async function shutdown() {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    operationalState.beginDrain();
    console.log("[pdf-service] iniciando shutdown gracioso.");

    const closeServerPromise = new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    server.closeIdleConnections?.();

    let shutdownTimer = null;
    const timeoutPromise = new Promise((_, reject) => {
      shutdownTimer = setTimeout(() => {
        server.closeAllConnections?.();
        reject(
          new Error(
            `Shutdown excedeu o limite de ${config.pdfShutdownGracePeriodMs}ms. Conexoes restantes foram encerradas.`
          )
        );
      }, config.pdfShutdownGracePeriodMs);
      shutdownTimer.unref?.();
    });

    try {
      await Promise.race([closeServerPromise, timeoutPromise]);
    } finally {
      if (shutdownTimer) {
        clearTimeout(shutdownTimer);
      }
      await closeBrowser();
      operationalState.markStopped();
    }
  })();

  return shutdownPromise;
}

process.on("SIGINT", () => {
  void shutdown()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("[pdf-service] erro durante shutdown:", error);
      process.exit(1);
    });
});

process.on("SIGTERM", () => {
  void shutdown()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("[pdf-service] erro durante shutdown:", error);
      process.exit(1);
    });
});
