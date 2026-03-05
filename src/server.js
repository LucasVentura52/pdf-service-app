import "dotenv/config";
import process from "node:process";
import { startServer } from "./app.js";

const { server, closeBrowser } = startServer();

async function shutdown() {
  server.close();
  await closeBrowser();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});

