import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createTemplateService, sanitizeTemplateData } from "../src/services/templateService.js";

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

test("template report converte linhas finais vazias em estado sem dados", async () => {
  const templateService = createTemplateService({
    templateDir: path.resolve("templates"),
  });

  const html = await templateService.resolveHtmlFromPayload({
    templateId: "report",
    data: {
      title: "Relatorio",
      sections: [
        {
          title: "Itens",
          columnsCount: 2,
          columns: [{ label: "Nome" }, { label: "Valor" }],
          rows: [
            {
              cells: [{ value: " " }, { value: "\u00a0" }],
            },
          ],
        },
      ],
    },
  });

  assert.match(html, /Sem dados\./);
});
