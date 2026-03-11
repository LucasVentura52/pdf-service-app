import assert from "node:assert/strict";
import test from "node:test";
import {
  createLegacyPayloadAdapters,
  isLegacyPeopleReportPayload,
} from "../src/services/legacyPayloadAdapters.js";

test("identifica payload legado de people report por filename", () => {
  assert.equal(
    isLegacyPeopleReportPayload({
      templateId: "report",
      filename: "relatorio-pessoas-cadastradas",
      data: {
        layout: {
          variant: "plain-table",
        },
      },
    }),
    true
  );
});

test("identifica payload legado de people report por estrutura de colunas", () => {
  assert.equal(
    isLegacyPeopleReportPayload({
      templateId: "report",
      data: {
        layout: {
          variant: "plain-table",
        },
        sections: [
          {
            columnsCount: 7,
          },
        ],
      },
    }),
    true
  );
});

test("adaptador legado resolve payload para peopleReport", () => {
  const adapters = createLegacyPayloadAdapters({
    buildPeopleReportTemplateData(data) {
      return {
        normalized: true,
        sourceTitle: data?.title || "",
      };
    },
  });

  const adapter = adapters[0];
  const resolved = adapter.resolve({
    templateId: "report",
    data: {
      title: "Relatorio",
    },
  });

  assert.equal(adapter.id, "peopleReport");
  assert.equal(resolved.templateId, "peopleReport");
  assert.deepEqual(resolved.data, {
    normalized: true,
    sourceTitle: "Relatorio",
  });
});
