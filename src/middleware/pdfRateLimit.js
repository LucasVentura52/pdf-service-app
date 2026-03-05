import rateLimit from "express-rate-limit";

export function createPdfRateLimit(maxPerMinute) {
  return rateLimit({
    windowMs: 60 * 1000,
    max: maxPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

