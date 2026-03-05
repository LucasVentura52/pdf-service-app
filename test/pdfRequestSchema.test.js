import assert from "node:assert/strict";
import test from "node:test";
import { pdfRequestSchema } from "../src/schemas/pdfRequestSchema.js";

test("aceita payload com html", () => {
  const parsed = pdfRequestSchema.safeParse({
    html: "<div>ok</div>",
  });

  assert.equal(parsed.success, true);
});

test("aceita payload com templateId", () => {
  const parsed = pdfRequestSchema.safeParse({
    templateId: "report",
    data: { title: "Relatorio" },
  });

  assert.equal(parsed.success, true);
});

test("rejeita payload sem html e sem templateId", () => {
  const parsed = pdfRequestSchema.safeParse({
    filename: "sem-conteudo",
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.match(parsed.error.message, /Informe 'html' ou 'templateId'/);
});

test("rejeita payload com html e templateId ao mesmo tempo", () => {
  const parsed = pdfRequestSchema.safeParse({
    html: "<div>ok</div>",
    templateId: "report",
  });

  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.match(parsed.error.message, /Informe apenas um entre 'html' e 'templateId'/);
});

