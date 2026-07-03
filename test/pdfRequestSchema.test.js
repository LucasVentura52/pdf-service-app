import assert from "node:assert/strict";
import test from "node:test";
import { pdfRequestSchema } from "../src/schemas/pdfRequestSchema.js";

test("aceita payload com html", () => {
  const parsed = pdfRequestSchema.safeParse({
    html: "<div>Relatorio</div>",
  });

  assert.equal(parsed.success, true);
});

test("aceita payload com html direto", () => {
  const parsed = pdfRequestSchema.safeParse({
    html: "<section>Relatorio</section>",
    options: {
      format: "A4",
    },
  });

  assert.equal(parsed.success, true);
});

test("rejeita payload sem html", () => {
  const parsed = pdfRequestSchema.safeParse({
    filename: "sem-conteudo",
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.match(parsed.error.message, /html/i);
});

test("rejeita payload com templateId legado", () => {
  const parsed = pdfRequestSchema.safeParse({
    html: "<div>Relatorio</div>",
    templateId: "report",
  });

  assert.equal(parsed.success, false);
});

test("rejeita payload com data legado", () => {
  const parsed = pdfRequestSchema.safeParse({
    html: "<div>Relatorio</div>",
    data: {},
  });

  assert.equal(parsed.success, false);
});
