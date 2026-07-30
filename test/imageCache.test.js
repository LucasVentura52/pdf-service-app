import assert from "node:assert/strict";
import test from "node:test";
import { ImageCache } from "../src/services/imageCache.js";

test("ImageCache armazena e recupera buffer por URL", async () => {
  const cache = new ImageCache();
  const buffer = Buffer.from("image-data");
  await cache.set("https://example.com/logo.png", buffer, "image/png");
  const entry = cache.get("https://example.com/logo.png");
  assert.ok(entry);
  assert.ok(entry.buffer instanceof Buffer);
  assert.equal(entry.buffer.toString(), "image-data");
  assert.equal(entry.contentType, "image/png");
});

test("ImageCache retorna null para URL inexistente", () => {
  const cache = new ImageCache();
  assert.equal(cache.get("https://example.com/missing.png"), null);
});

test("ImageCache respeita TTL expirado", async () => {
  const cache = new ImageCache({ ttlMs: 50 });
  await cache.set("https://example.com/img.png", Buffer.from("expire-data"), "image/png");
  assert.ok(cache.get("https://example.com/img.png"));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(cache.get("https://example.com/img.png"), null);
});

test("ImageCache respeita limite de entradas e evita entradas antigas", async () => {
  const cache = new ImageCache({ maxEntries: 2 });
  await cache.set("https://example.com/a.png", Buffer.from("a"), "image/png");
  await cache.set("https://example.com/b.png", Buffer.from("b"), "image/png");
  await cache.set("https://example.com/c.png", Buffer.from("c"), "image/png");

  assert.equal(cache.get("https://example.com/a.png"), null);
  assert.ok(cache.get("https://example.com/b.png"));
  assert.ok(cache.get("https://example.com/c.png"));
});

test("ImageCache acesso atualiza ordem de evictacao", async () => {
  const cache = new ImageCache({ maxEntries: 2 });
  await cache.set("https://example.com/a.png", Buffer.from("a"), "image/png");
  await cache.set("https://example.com/b.png", Buffer.from("b"), "image/png");
  cache.get("https://example.com/a.png");
  await cache.set("https://example.com/c.png", Buffer.from("c"), "image/png");

  assert.ok(cache.get("https://example.com/a.png"));
  assert.equal(cache.get("https://example.com/b.png"), null);
  assert.ok(cache.get("https://example.com/c.png"));
});

test("ImageCache.clear remove todas as entradas", async () => {
  const cache = new ImageCache();
  await cache.set("https://example.com/a.png", Buffer.from("a"), "image/png");
  await cache.set("https://example.com/b.png", Buffer.from("b"), "image/png");
  cache.clear();
  assert.equal(cache.get("https://example.com/a.png"), null);
  assert.equal(cache.get("https://example.com/b.png"), null);
  assert.equal(cache.cache.size, 0);
});

test("ImageCache.getStats retorna estatisticas", async () => {
  const cache = new ImageCache({ maxEntries: 10, ttlMs: 5000 });
  assert.equal(cache.getStats().size, 0);
  assert.equal(cache.getStats().maxEntries, 10);
  assert.equal(cache.getStats().ttlMs, 5000);
  await cache.set("https://example.com/a.png", Buffer.from("a"), "image/png");
  assert.equal(cache.getStats().size, 1);
});

test("ImageCache usa valores padrao quando nao recebe config", () => {
  const cache = new ImageCache();
  assert.equal(cache.maxEntries, 300);
  assert.equal(cache.ttlMs, 300000);
  assert.equal(cache.fetchTimeoutMs, 8000);
});

test("ImageCache usa config customizada", () => {
  const cache = new ImageCache({ maxEntries: 50, ttlMs: 60000 });
  assert.equal(cache.maxEntries, 50);
  assert.equal(cache.ttlMs, 60000);
});

test("ImageCache armazena e recupera contentType correto", async () => {
  const cache = new ImageCache();
  await cache.set("https://example.com/photo.jpg", Buffer.from("jpeg-data"), "image/jpeg");
  await cache.set("https://example.com/chart.webp", Buffer.from("webp-data"), "image/webp");

  assert.equal(cache.get("https://example.com/photo.jpg").contentType, "image/jpeg");
  assert.equal(cache.get("https://example.com/chart.webp").contentType, "image/webp");
});