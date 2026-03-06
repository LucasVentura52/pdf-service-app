import test from "node:test";
import assert from "node:assert/strict";
import { injectBaseHref } from "../src/utils/html.js";

test("injeta base href quando html possui head e baseUrl configurada", () => {
  const html = "<html><head><title>Teste</title></head><body>ok</body></html>";
  const result = injectBaseHref(html, "https://sys.maisgerencia.com.br/app");

  assert.match(result, /<base href="https:\/\/sys\.maisgerencia\.com\.br\/app\/">/);
});

test("nao sobrescreve base href ja existente", () => {
  const html =
    '<html><head><base href="https://existente.example/"><title>Teste</title></head><body>ok</body></html>';
  const result = injectBaseHref(html, "https://sys.maisgerencia.com.br");

  assert.equal(result, html);
});
