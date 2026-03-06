import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  createTemplateService,
  resolveTemplatePayload,
  sanitizeTemplateData,
} from "../src/services/templateService.js";

test("sanitiza linhas vazias do template report sem remover valores validos", () => {
  const sanitized = sanitizeTemplateData("report", {
    sections: [
      {
        title: "Itens",
        rows: [
          {
            cells: [{ value: "   " }, { value: "\u00a0" }],
          },
          {
            cells: [{ value: 0 }, { value: "Cliente 1" }],
          },
        ],
      },
    ],
  });

  assert.equal(sanitized.sections[0].rows.length, 1);
  assert.equal(sanitized.sections[0].rows[0].cells[0].value, 0);
});

test("template peopleReport renderiza estado sem dados quando nao ha linhas validas", async () => {
  const templateService = createTemplateService({
    templateDir: path.resolve("templates"),
  });

  const html = await templateService.resolveHtmlFromPayload({
    templateId: "peopleReport",
    data: {
      title: "Relatório",
      columns: [
        {
          label: "Nome",
          widthPercent: 50,
        },
        {
          label: "Valor",
          widthPercent: 50,
        },
      ],
      rows: [],
      columnsCount: 2,
      emptyLabel: "Sem dados.",
    },
  });

  assert.match(html, /Sem dados\./);
});

test("payload plain-table de pessoas e resolvido para template dedicado", () => {
  const resolved = resolveTemplatePayload({
    templateId: "report",
    filename: "relatorio-pessoas-cadastradas",
    data: {
      title: "Relatorio de Pessoas",
      layout: {
        variant: "plain-table",
      },
      sections: [
        {
          footerText: "Total de registros: 1",
          columnsCount: 7,
          columns: [
            { label: "Codigo", alignClass: "text-center", widthWeight: 0.8 },
            { label: "Status", alignClass: "text-center", widthWeight: 1.1 },
            { label: "Tipo", alignClass: "text-center", widthWeight: 1.2 },
            { label: "Nome", widthWeight: 2.2 },
            { label: "Documento", alignClass: "text-center", widthWeight: 1.35 },
            { label: "Telefone", alignClass: "text-center", widthWeight: 1.55 },
            { label: "Email", widthWeight: 2.25 },
          ],
          rows: [
            {
              cells: [
                { value: "#1", alignClass: "text-center" },
                { value: "Ativo", alignClass: "text-center" },
                { value: "Fisica", alignClass: "text-center" },
                { value: "Ana" },
                { value: "123", alignClass: "text-center" },
                { value: "11 99999-9999\n11 98888-8888", alignClass: "text-center" },
                { value: "ana@dominio.com" },
              ],
            },
          ],
        },
      ],
    },
  });

  assert.equal(resolved.templateId, "peopleReport");
  assert.equal(resolved.data.columns.length, 7);
  assert.equal(resolved.data.rows.length, 1);
  assert.match(resolved.data.rows[0].cells[5].className, /is-preserve-lines/);
  assert.equal(resolved.data.totalCountLabel, "Total de registros: 1");
});

test("template de pessoas renderiza tabela estilizada a partir do payload atual do frontend", async () => {
  const templateService = createTemplateService({
    templateDir: path.resolve("templates"),
  });

  const html = await templateService.resolveHtmlFromPayload({
    templateId: "report",
    filename: "relatorio-pessoas-cadastradas",
    data: {
      title: "Relatorio de Pessoas",
      layout: {
        variant: "plain-table",
      },
      sections: [
        {
          footerText: "Total de registros: 1",
          columnsCount: 7,
          columns: [
            { label: "Codigo", alignClass: "text-center", widthWeight: 0.8 },
            { label: "Status", alignClass: "text-center", widthWeight: 1.1 },
            { label: "Tipo", alignClass: "text-center", widthWeight: 1.2 },
            { label: "Nome", widthWeight: 2.2 },
            { label: "Documento", alignClass: "text-center", widthWeight: 1.35 },
            { label: "Telefone", alignClass: "text-center", widthWeight: 1.55 },
            { label: "Email", widthWeight: 2.25 },
          ],
          rows: [
            {
              cells: [
                { value: "#1", alignClass: "text-center" },
                { value: "Ativo", alignClass: "text-center" },
                { value: "Fisica", alignClass: "text-center" },
                { value: "Ana" },
                { value: "123", alignClass: "text-center" },
                { value: "11 99999-9999", alignClass: "text-center" },
                { value: "ana@dominio.com" },
              ],
            },
          ],
        },
      ],
    },
  });

  assert.match(html, /report-card/);
  assert.match(html, /colgroup/);
  assert.match(html, /Total de registros: 1/);
  assert.doesNotMatch(html, /summary-grid/);
});

test("template salesReport renderiza tabela com metadados e total final", async () => {
  const templateService = createTemplateService({
    templateDir: path.resolve("templates"),
  });

  const html = await templateService.resolveHtmlFromPayload({
    templateId: "salesReport",
    data: {
      title: "Relatorio de Vendas",
      hasMeta: true,
      metaLeftLines: [{ value: "01/03/2026 ate 31/03/2026", className: "is-strong" }],
      metaRightLines: [{ value: "Vendedor Teste", className: "is-strong" }],
      emptyLabel: "Sem dados.",
      columnsCount: 3,
      columns: [
        { label: "#", widthPercent: 10, className: "is-center" },
        { label: "Data", widthPercent: 40 },
        { label: "Venda", widthPercent: 50, className: "is-right" },
      ],
      rows: [
        {
          cells: [
            { value: 1, className: "is-center" },
            { value: "01/03/2026", caption: "Garagem Centro" },
            { value: "R$ 100,00", className: "is-right" },
          ],
        },
      ],
      footerRow: {
        cells: [
          { value: 1, className: "is-center" },
          { value: "Totais" },
          { value: "R$ 100,00", className: "is-right" },
        ],
      },
    },
  });

  assert.match(html, /Relatorio de Vendas/);
  assert.match(html, /Garagem Centro/);
  assert.match(html, /<tfoot>/);
});

test("template commissionReport renderiza tabela com total final", async () => {
  const templateService = createTemplateService({
    templateDir: path.resolve("templates"),
  });

  const html = await templateService.resolveHtmlFromPayload({
    templateId: "commissionReport",
    data: {
      title: "Relatorio de Comissionamento",
      columnsCount: 3,
      columns: [
        { label: "#", widthPercent: 10, className: "is-center" },
        { label: "Vendedor", widthPercent: 50 },
        { label: "Comissao", widthPercent: 40, className: "is-right" },
      ],
      rows: [
        {
          cells: [
            { value: 1, className: "is-center" },
            { value: "Joao" },
            { value: "R$ 50,00", className: "is-right" },
          ],
        },
      ],
      footerRow: {
        cells: [
          { value: 1, className: "is-center" },
          { value: "Totais" },
          { value: "R$ 50,00", className: "is-right" },
        ],
      },
      emptyLabel: "Sem dados.",
    },
  });

  assert.match(html, /Relatorio de Comissionamento/);
  assert.match(html, /Joao/);
  assert.match(html, /<tfoot>/);
});

test("template promissoryNote reagruppa notas em 4 por pagina", () => {
  const sanitized = sanitizeTemplateData("promissoryNote", {
    pages: [
      {
        notes: [{ numero: 1 }, { numero: 2 }],
      },
      {
        notes: [{ numero: 3 }, { numero: 4 }, { numero: 5 }],
      },
    ],
  });

  assert.equal(sanitized.pages.length, 2);
  assert.equal(sanitized.pages[0].notes.length, 4);
  assert.equal(sanitized.pages[1].notes.length, 1);
});
