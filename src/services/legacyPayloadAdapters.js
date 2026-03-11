const PEOPLE_REPORT_TEMPLATE_ID = "peopleReport";

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLookupValue(value) {
  return normalizeIdentifier(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function isLegacyPeopleReportPayload(payload) {
  const templateId = normalizeIdentifier(payload?.templateId);

  if (templateId === normalizeIdentifier(PEOPLE_REPORT_TEMPLATE_ID)) {
    return true;
  }

  if (templateId !== "report") {
    return false;
  }

  if (normalizeIdentifier(payload?.data?.layout?.variant) !== "plain-table") {
    return false;
  }

  const filename = normalizeLookupValue(payload?.filename);
  if (
    filename.includes("relatorio-pessoas-cadastradas") ||
    filename.includes("pessoas-cadastradas")
  ) {
    return true;
  }

  const firstSection = Array.isArray(payload?.data?.sections) ? payload.data.sections[0] : null;
  const columnsCount = Array.isArray(firstSection?.columns)
    ? firstSection.columns.length
    : Math.max(0, Number(firstSection?.columnsCount || 0));

  return columnsCount === 7;
}

export function createLegacyPayloadAdapters({ buildPeopleReportTemplateData }) {
  return [
    {
      id: PEOPLE_REPORT_TEMPLATE_ID,
      matches: isLegacyPeopleReportPayload,
      resolve(payload) {
        return {
          templateId: PEOPLE_REPORT_TEMPLATE_ID,
          data: buildPeopleReportTemplateData(payload?.data),
        };
      },
    },
  ];
}
