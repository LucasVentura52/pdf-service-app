import assert from "node:assert/strict";
import test from "node:test";
import {
  isNativeReportPayload,
} from "../src/services/nativeReportPdfService.js";

test("identifica payloads do template report para renderer nativo", () => {
  assert.equal(isNativeReportPayload({ templateId: "report" }), true);
  assert.equal(isNativeReportPayload({ templateId: "contract" }), false);
  assert.equal(isNativeReportPayload({}), false);
});

test("nao usa renderer nativo para relatorio de pessoas plain-table", () => {
  assert.equal(
    isNativeReportPayload({
      templateId: "report",
      filename: "relatorio-pessoas-cadastradas",
      data: {
        layout: {
          variant: "plain-table",
        },
      },
    }),
    false
  );
});
