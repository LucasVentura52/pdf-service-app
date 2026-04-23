import sharp from "sharp";
import { isRequestUrlAllowed } from "./browserNetworkPolicy.js";

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAllowedRemoteUrl(value, config) {
  try {
    const parsed = new URL(String(value || "").trim());
    if (!HTTP_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
      return false;
    }

    return isRequestUrlAllowed(
      parsed.toString(),
      config.normalizedAllowedAssetOrigins,
      config.pdfBlockPrivateNetwork
    );
  } catch {
    return false;
  }
}

function cloneForPathUpdate(value, path, nextValue) {
  if (!path.length) {
    return typeof nextValue === "function" ? nextValue(value) : nextValue;
  }

  const [segment, ...rest] = path;

  if (segment === "*") {
    if (!Array.isArray(value)) {
      return value;
    }

    return value.map((item) => cloneForPathUpdate(item, rest, nextValue));
  }

  if (!isPlainObject(value) && !Array.isArray(value)) {
    return value;
  }

  const current = value?.[segment];
  const updatedChild = cloneForPathUpdate(current, rest, nextValue);

  if (updatedChild === current) {
    return value;
  }

  if (Array.isArray(value)) {
    const copy = value.slice();
    copy[segment] = updatedChild;
    return copy;
  }

  return {
    ...value,
    [segment]: updatedChild,
  };
}

function collectValuesByPath(value, path) {
  if (!path.length) {
    return [value];
  }

  const [segment, ...rest] = path;

  if (segment === "*") {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.flatMap((item) => collectValuesByPath(item, rest));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return collectValuesByPath(value[segment], rest);
}

function buildCacheKey(sourceUrl, variant) {
  return JSON.stringify({
    url: sourceUrl,
    width: variant.width,
    height: variant.height,
    quality: variant.quality,
  });
}

const DEFAULT_IMAGE_VARIANT = { width: 900, height: 680, quality: 78 };
const DEFAULT_LOGO_VARIANT = { width: 320, height: 160, quality: 82 };

function pickVariantForKey(keyName) {
  const normalized = String(keyName || "").trim().toLowerCase();

  if (!normalized) {
    return DEFAULT_IMAGE_VARIANT;
  }

  if (normalized.includes("logo")) {
    return DEFAULT_LOGO_VARIANT;
  }

  if (
    normalized.includes("image") ||
    normalized.includes("imagem") ||
    normalized.includes("foto") ||
    normalized.includes("photo") ||
    normalized === "url"
  ) {
    return DEFAULT_IMAGE_VARIANT;
  }

  return null;
}

function pickTemplateVariants(templateId) {
  switch (String(templateId || "").trim()) {
    case "vehicleListReport":
      return [
        { path: ["company", "logo"], width: 320, height: 160, quality: 82 },
        { path: ["vehicles", "*", "photo"], width: 420, height: 320, quality: 72 },
      ];
    case "viewVehicle":
      return [
        { path: ["vehicle", "imagem"], width: 900, height: 680, quality: 78 },
        { path: ["vehicle", "foto"], width: 900, height: 680, quality: 78 },
        { path: ["vehicle", "imagemPrincipal"], width: 900, height: 680, quality: 78 },
        { path: ["vehicle", "fotoPrincipal"], width: 900, height: 680, quality: 78 },
        { path: ["company", "logo"], width: 320, height: 160, quality: 82 },
        { path: ["garage", "foto"], width: 320, height: 160, quality: 82 },
        { path: ["garage", "imagem"], width: 320, height: 160, quality: 82 },
      ];
    case "vehicleExpenses":
      return [
        { path: ["vehicle", "imagem"], width: 900, height: 680, quality: 78 },
        { path: ["vehicle", "foto"], width: 900, height: 680, quality: 78 },
        { path: ["vehicle", "imagemPrincipal"], width: 900, height: 680, quality: 78 },
        { path: ["vehicle", "fotoPrincipal"], width: 900, height: 680, quality: 78 },
      ];
    case "promissoryNote":
      return [{ path: ["logoUrl"], width: 320, height: 160, quality: 82 }];
    case "receipt":
      return [{ path: ["logoGaragem"], width: 320, height: 160, quality: 82 }];
    case "commissionReport":
      return [{ path: ["rows", "*", "cells", "*", "detailCard", "image"], width: 420, height: 320, quality: 72 }];
    case "vehicleChecklist":
      return [{ path: ["items", "*", "photos", "*", "url"], width: 900, height: 680, quality: 78 }];
    default:
      return [];
  }
}

export function createImageAssetOptimizer(config) {
  const cache = new Map();

  async function optimizeLikelyImageUrls(value, keyName = "") {
    if (Array.isArray(value)) {
      const results = await Promise.all(value.map((item) => optimizeLikelyImageUrls(item, keyName)));
      return results.some((item, index) => item !== value[index]) ? results : value;
    }

    if (!value || typeof value !== "object") {
      if (typeof value !== "string") {
        return value;
      }

      const variant = pickVariantForKey(keyName);
      const candidate = String(value || "").trim();

      if (!variant || !isAllowedRemoteUrl(candidate, config)) {
        return value;
      }

      return fetchOptimizedDataUrl(candidate, variant);
    }

    const entries = await Promise.all(
      Object.entries(value).map(async ([entryKey, entryValue]) => {
        const optimizedValue = await optimizeLikelyImageUrls(entryValue, entryKey);
        return [entryKey, optimizedValue];
      })
    );

    let changed = false;
    const nextValue = {};

    for (const [entryKey, optimizedValue] of entries) {
      nextValue[entryKey] = optimizedValue;
      if (optimizedValue !== value[entryKey]) {
        changed = true;
      }
    }

    return changed ? nextValue : value;
  }

  function pruneCache() {
    while (cache.size > config.pdfImageOptimizeCacheEntries) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
  }

  async function fetchOptimizedDataUrl(sourceUrl, variant) {
    if (!isAllowedRemoteUrl(sourceUrl, config)) {
      return sourceUrl;
    }

    const cacheKey = buildCacheKey(sourceUrl, variant);
    const now = Date.now();
    const cached = cache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const pending = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.pdfImageFetchTimeoutMs);
      timeout.unref?.();

      try {
        const response = await fetch(sourceUrl, {
          signal: controller.signal,
          headers: {
            Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
          },
        });

        if (!response.ok) {
          return sourceUrl;
        }

        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        if (!contentType.startsWith("image/")) {
          return sourceUrl;
        }

        const sourceBuffer = Buffer.from(await response.arrayBuffer());
        const optimizedBuffer = await sharp(sourceBuffer, { failOn: "none" })
          .rotate()
          .resize({
            width: variant.width,
            height: variant.height,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({
            quality: variant.quality,
            effort: 4,
          })
          .toBuffer();

        if (!optimizedBuffer.length) {
          return sourceUrl;
        }

        return `data:image/webp;base64,${optimizedBuffer.toString("base64")}`;
      } catch {
        return sourceUrl;
      } finally {
        clearTimeout(timeout);
      }
    })();

    cache.set(cacheKey, {
      expiresAt: now + config.pdfImageCacheTtlMs,
      value: pending,
    });
    pruneCache();

    try {
      const resolvedValue = await pending;
      cache.set(cacheKey, {
        expiresAt: now + config.pdfImageCacheTtlMs,
        value: resolvedValue,
      });
      return resolvedValue;
    } catch {
      cache.delete(cacheKey);
      return sourceUrl;
    }
  }

  async function optimizeTemplateData(templateId, sourceData = {}) {
    const variants = pickTemplateVariants(templateId);
    if (!variants.length || !sourceData || typeof sourceData !== "object") {
      return sourceData;
    }

    let nextData = sourceData;

    for (const variant of variants) {
      const currentValues = collectValuesByPath(nextData, variant.path);
      if (!currentValues.length) {
        continue;
      }

      const uniqueUrls = Array.from(
        new Set(
          currentValues
            .map((value) => String(value || "").trim())
            .filter((value) => isAllowedRemoteUrl(value, config))
        )
      );

      if (!uniqueUrls.length) {
        continue;
      }

      const replacements = new Map(
        await Promise.all(
          uniqueUrls.map(async (url) => [url, await fetchOptimizedDataUrl(url, variant)])
        )
      );

      nextData = cloneForPathUpdate(nextData, variant.path, (currentValue) => {
        const key = String(currentValue || "").trim();
        return replacements.get(key) || currentValue;
      });
    }

    return optimizeLikelyImageUrls(nextData);
  }

  function getStats() {
    return {
      cachedImages: cache.size,
    };
  }

  return {
    optimizeTemplateData,
    getStats,
  };
}
