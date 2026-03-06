import assert from "node:assert/strict";
import test from "node:test";
import {
  generateNativeReportPdf,
  marginValueToPoints,
  resolveNativeReportMargins,
} from "../src/services/nativeReportPdfService.js";

test("converte margens css para pontos", () => {
  assert.equal(Math.round(marginValueToPoints("10mm")), 28);
  assert.equal(Math.round(marginValueToPoints("2cm")), 57);
  assert.equal(Math.round(marginValueToPoints("1in")), 72);
  assert.equal(Math.round(marginValueToPoints("96px")), 72);
});

test("usa margem padrao de 12mm quando margem nao foi informada", () => {
  const margins = resolveNativeReportMargins();

  assert.equal(Math.round(margins.top), 34);
  assert.equal(Math.round(margins.right), 34);
  assert.equal(Math.round(margins.bottom), 34);
  assert.equal(Math.round(margins.left), 34);
});

test("gera pdf nativo para report", async () => {
  const pdfBuffer = await generateNativeReportPdf(
    {
      templateId: "report",
      data: {
        title: "Relatorio de Pessoas",
        subtitle: "Teste",
        generatedAt: "2026-03-06 12:00",
        summary: {
          items: [
            { label: "Total", value: 2 },
            { label: "Ativos", value: 1 },
          ],
        },
        sections: [
          {
            title: "Pessoas",
            columnsCount: 3,
            columns: [{ label: "Nome" }, { label: "Email" }, { label: "Status" }],
            rows: [
              {
                cells: [{ value: "Ana" }, { value: "ana@dominio.com" }, { value: "Ativo" }],
              },
              {
                cells: [{ value: "Bruno" }, { value: "bruno@dominio.com" }, { value: "Inativo" }],
              },
            ],
          },
        ],
      },
      options: {
        format: "A4",
      },
    },
    {
      compress: false,
    }
  );

  assert.ok(pdfBuffer.length > 1000);
  assert.equal(pdfBuffer.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.match(pdfBuffer.toString("latin1"), /Relatorio de Pessoas/);
});
