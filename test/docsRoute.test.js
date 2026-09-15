import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.js";

async function withServer(run) {
  const { app, closeBrowser } = buildApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    await run(base);
  } finally {
    const closed = new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    server.closeAllConnections?.();
    await closed;
    await closeBrowser();
  }
}

test("GET /docs.json retorna a especificacao OpenAPI 3.1", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/docs.json`);
    assert.equal(response.status, 200);

    const spec = await response.json();
    assert.equal(spec.openapi, "3.1.0");
    assert.equal(spec.info.title, "PDF Service API");
    assert.ok(spec.components.schemas.PdfRequest, "schema PdfRequest esperado");

    for (const path of ["/health", "/ready", "/pdf", "/preview"]) {
      assert.ok(spec.paths[path], `path ${path} esperada no spec`);
    }
  });
});

test("GET /docs redireciona para /docs/ e GET /docs/ serve a UI do Scalar", async () => {
  await withServer(async (base) => {
    const redirect = await fetch(`${base}/docs`, { redirect: "manual" });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get("location"), "/docs/");

    const response = await fetch(`${base}/docs/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /id="app"/, "HTML deve conter o container do Scalar");
    assert.match(html, /Scalar\.createApiReference/, "HTML deve inicializar o Scalar");
    assert.match(html, /PDF Service API/, "HTML deve conter o titulo do servico");
  });
});

test("GET /docs/ nao referencia CDN externo", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/docs/`);
    const html = await response.text();
    assert.doesNotMatch(html, /cdn\.jsdelivr\.net|unpkg\.com/, "HTML nao deve carregar assets de CDN");
  });
});

test("GET /docs-assets/standalone.js serve o bundle local do Scalar", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/docs-assets/standalone.js`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /javascript/);
    // Consome o body (3.6MB) para o servidor nao abortar o stream no close.
    await response.arrayBuffer();
  });
});