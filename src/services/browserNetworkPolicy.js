const SAFE_PROTOCOLS = new Set(["about:", "data:", "blob:"]);
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

function parseIpv4(hostname) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return null;
  }
  return octets;
}

function isPrivateIpv4(hostname) {
  const octets = parseIpv4(hostname);
  if (!octets) return false;

  const [a, b] = octets;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isPrivateIpv6(hostname) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized.includes(":")) return false;
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80:")) return true;
  return false;
}

function isPrivateHostname(hostname) {
  const normalized = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (!normalized) return true;
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  if (normalized.endsWith(".local")) return true;

  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice("::ffff:".length));
  }

  return isPrivateIpv4(normalized) || isPrivateIpv6(normalized);
}

export function isRequestUrlAllowed(url, allowedAssetOrigins, blockPrivateNetwork) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (SAFE_PROTOCOLS.has(protocol)) {
    return true;
  }

  if (!HTTP_PROTOCOLS.has(protocol)) {
    return false;
  }

  if (allowedAssetOrigins.has(parsed.origin.toLowerCase())) {
    return true;
  }

  if (blockPrivateNetwork && isPrivateHostname(parsed.hostname)) {
    return false;
  }

  if (!allowedAssetOrigins.size) {
    return true;
  }

  return allowedAssetOrigins.has(parsed.origin.toLowerCase());
}

export function recordAssetRequest(assetRequests, requestUrl, resourceType, blocked = false) {
  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (!HTTP_PROTOCOLS.has(protocol)) {
    return;
  }

  const origin = parsed.origin.toLowerCase();
  const entry = assetRequests.get(origin) || {
    count: 0,
    blockedCount: 0,
    types: new Set(),
  };

  entry.count += 1;
  if (blocked) {
    entry.blockedCount += 1;
  }
  if (resourceType) {
    entry.types.add(resourceType);
  }

  assetRequests.set(origin, entry);
}

export function summarizeAssetRequests(assetRequests) {
  return Array.from(assetRequests.entries())
    .map(([origin, entry]) => ({
      origin,
      count: entry.count,
      blockedCount: entry.blockedCount,
      types: Array.from(entry.types).sort(),
    }))
    .sort((left, right) => left.origin.localeCompare(right.origin));
}

export function mergeAllowedAssetOrigins(defaultAllowedOrigins, extraAllowedAssetOrigins) {
  const merged = new Set(defaultAllowedOrigins);
  if (!extraAllowedAssetOrigins) return merged;

  for (const origin of extraAllowedAssetOrigins) {
    const normalized = String(origin || "").trim().toLowerCase();
    if (normalized) {
      merged.add(normalized);
    }
  }

  return merged;
}
