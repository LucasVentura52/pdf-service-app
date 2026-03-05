import cors from "cors";
import { normalizeOrigin } from "../config.js";

export function createCorsPolicy(normalizedAllowedOrigins) {
  return cors({
    origin(origin, callback) {
      if (!origin || normalizedAllowedOrigins.has("*")) {
        callback(null, true);
        return;
      }

      const normalizedRequestOrigin = normalizeOrigin(origin);
      if (normalizedRequestOrigin && normalizedAllowedOrigins.has(normalizedRequestOrigin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origem nao permitida pelo PDF service"));
    },
  });
}

