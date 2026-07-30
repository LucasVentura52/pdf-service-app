import { createHash } from "node:crypto";

const DEFAULT_MAX_ENTRIES = 300;
const DEFAULT_TTL_MS = 300000;
const DEFAULT_FETCH_TIMEOUT_MS = 8000;

export class ImageCache {
  constructor({ maxEntries = DEFAULT_MAX_ENTRIES, ttlMs = DEFAULT_TTL_MS, fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS } = {}) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.fetchTimeoutMs = fetchTimeoutMs;
    this.cache = new Map();
    this.accessOrder = [];
  }

  static generateKey(url) {
    return createHash("sha256").update(url).digest("hex").slice(0, 32);
  }

  get(url) {
    const key = ImageCache.generateKey(url);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.delete(key);
      return null;
    }
    this.touch(key);
    return entry;
  }

  async set(url, buffer, contentType) {
    const key = ImageCache.generateKey(url);
    if (this.cache.has(key)) {
      this.touch(key);
      const entry = this.cache.get(key);
      entry.buffer = buffer;
      entry.contentType = contentType || entry.contentType;
      entry.timestamp = Date.now();
      return;
    }
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }
    this.cache.set(key, { buffer, contentType: contentType || "image/png", timestamp: Date.now() });
    this.accessOrder.push(key);
  }

  async fetchAndCache(url, allowedOrigins, blockPrivateNetwork) {
    const cached = this.get(url);
    if (cached) return cached.buffer;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.fetchTimeoutMs);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "image/*,*/*;q=0.8" },
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers().get("content-type") || "image/png";
      await this.set(url, body, contentType);
      return body;
    } catch (error) {
      console.warn(`[image-cache] Falha ao buscar ${url}: ${error.message}`);
      return null;
    }
  }

  touch(key) {
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) {
      this.accessOrder.splice(idx, 1);
      this.accessOrder.push(key);
    }
  }

  evictOldest() {
    const oldest = this.accessOrder.shift();
    if (oldest) this.cache.delete(oldest);
  }

  delete(key) {
    this.cache.delete(key);
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) this.accessOrder.splice(idx, 1);
  }

  clear() {
    this.cache.clear();
    this.accessOrder = [];
  }

  getStats() {
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
    };
  }
}