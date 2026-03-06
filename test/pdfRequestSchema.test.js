import assert from "node:assert/strict";
import test from "node:test";
import { pdfRequestSchema } from "../src/schemas/pdfRequestSchema.js";

test("aceita payload com templateId", () => {
  const parsed = pdfRequestSchema.safeParse({
    templateId: "report",
    data: { title: "Relatorio" },
  });

  assert.equal(parsed.success, true);
});

test("rejeita payload sem templateId", () => {
  const parsed = pdfRequestSchema.safeParse({
    filename: "sem-conteudo",
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.match(parsed.error.message, /templateId/i);
});

test("rejeita payload com campo html legado", () => {
  const parsed = pdfRequestSchema.safeParse({
    templateId: "report",
    html: "<div>ok</div>",
  });

  assert.equal(parsed.success, false);
});
