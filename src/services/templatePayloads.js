import {
  createLegacyPayloadAdapters,
  isLegacyPeopleReportPayload,
} from "./legacyPayloadAdapters.js";

const REPORT_COMPACT_ROWS_THRESHOLD = 800;
const REPORT_ULTRA_COMPACT_ROWS_THRESHOLD = 1800;
const PEOPLE_REPORT_TEMPLATE_ID = "peopleReport";
const PEOPLE_REPORT_EMPTY_LABEL = "Sem dados.";
const PROMISSORY_NOTES_PER_PAGE = 4;

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function hasVisibleReportValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "number" || typeof value === "boolean") return true;

  if (typeof value === "string") {
    return value.replace(/[\s\u00a0]+/g, "").length > 0;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasVisibleReportValue(item));
  }

  if (typeof value === "object") {
    if ("value" in value) {
      return hasVisibleReportValue(value.value);
    }

    if ("text" in value) {
      return hasVisibleReportValue(value.text);
    }
  }

  return false;
}

function sanitizeReportSectionRows(section) {
  if (!section || !Array.isArray(section.rows)) {
    return section;
  }

  const rows = section.rows.filter((row) => {
    if (!row || !Array.isArray(row.cells)) {
      return true;
    }

    return row.cells.some((cell) => hasVisibleReportValue(cell));
  });

  return {
    ...section,
    rows,
  };
}

function buildReportLayout(sections) {
  const normalizedSections = Array.isArray(sections) ? sections : [];
  let totalRows = 0;
  let maxColumns = 0;

  for (const section of normalizedSections) {
    const rowCount = Array.isArray(section?.rows) ? section.rows.length : 0;
    const columnCount = Array.isArray(section?.columns)
      ? section.columns.length
      : Math.max(0, Number(section?.columnsCount || 0));

    totalRows += rowCount;
    maxColumns = Math.max(maxColumns, columnCount);
  }

  const ultraCompact = totalRows >= REPORT_ULTRA_COMPACT_ROWS_THRESHOLD;
  const compact = ultraCompact || totalRows >= REPORT_COMPACT_ROWS_THRESHOLD;

  return {
    compact,
    ultraCompact,
    totalRows,
    maxColumns,
  };
}

function resolvePlainText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.replace(/\r\n/g, "\n");
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  if (Array.isArray(value)) {
    return value.map((item) => resolvePlainText(item)).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    if ("value" in value) {
      return resolvePlainText(value.value);
    }

    if ("text" in value) {
      return resolvePlainText(value.text);
    }
  }

  return String(value);
}

function resolveAlignClass(value) {
  const normalized = normalizeIdentifier(value);
  if (normalized === "text-right" || normalized === "right") {
    return "is-right";
  }

  if (normalized === "text-center" || normalized === "center") {
    return "is-center";
  }

  return "";
}

function resolveColumnWeight(column) {
  const candidates = [column?.widthWeight, column?.width, column?.widthPercent];

  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }

  return 1;
}

function formatWidthPercent(value) {
  return String(Math.round(value * 1000) / 1000).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function resolveSectionColumns(section) {
  const columns = Array.isArray(section?.columns) ? section.columns : [];
  const totalWeight = columns.reduce((total, column) => total + resolveColumnWeight(column), 0) || 1;

  return columns.map((column, index) => {
    const widthPercent = (resolveColumnWeight(column) / totalWeight) * 100;
    const classes = [resolveAlignClass(column?.alignClass)];

    if (index === 0) {
      classes.push("is-code");
    }

    if (index === 4) {
      classes.push("is-nowrap");
    }

    if (index === 5 || index === 6) {
      classes.push("is-preserve-lines");
    }

    return {
      label: resolvePlainText(column?.label),
      widthPercent: formatWidthPercent(widthPercent),
      className: classes.filter(Boolean).join(" "),
    };
  });
}

function resolveCellClass(cell, column, columnIndex) {
  const classes = [resolveAlignClass(cell?.alignClass), column?.className];
  const text = resolvePlainText(cell);

  if (text.includes("\n")) {
    classes.push("is-preserve-lines");
  }

  if (columnIndex === 0) {
    classes.push("is-code");
  }

  return classes.filter(Boolean).join(" ");
}

function chunkItems(items, size) {
  const chunkSize = Math.max(1, Number(size) || 1);
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function sanitizePromissoryNoteData(data) {
  if (!data || typeof data !== "object") {
    return { pages: [] };
  }

  const sourcePages = Array.isArray(data.pages) ? data.pages : [];
  const flatNotes = sourcePages.flatMap((page) =>
    Array.isArray(page?.notes) ? page.notes.filter(Boolean) : []
  );

  return {
    ...data,
    pages: chunkItems(flatNotes, PROMISSORY_NOTES_PER_PAGE).map((notes) => ({ notes })),
  };
}

function sanitizeReportData(data) {
  if (!data || typeof data !== "object") {
    return data || {};
  }

  const sections = Array.isArray(data.sections)
    ? data.sections.map((section) => sanitizeReportSectionRows(section))
    : data.sections;
  const layout = buildReportLayout(sections);

  return {
    ...data,
    layout: {
      ...(data.layout && typeof data.layout === "object" ? data.layout : {}),
      ...layout,
    },
    sections,
  };
}

function buildPeopleReportTemplateData(sourceData) {
  if (sourceData && Array.isArray(sourceData.columns) && Array.isArray(sourceData.rows)) {
    const fallbackColumnWidth = sourceData.columns.length ? 100 / sourceData.columns.length : 100;
    const columns = sourceData.columns.map((column, index) => {
      const classes = [resolveAlignClass(column?.alignClass), String(column?.className || "").trim()];

      if (index === 0) {
        classes.push("is-code");
      }

      return {
        label: resolvePlainText(column?.label),
        widthPercent: formatWidthPercent(Number(column?.widthPercent) || fallbackColumnWidth),
        className: classes.filter(Boolean).join(" "),
      };
    });

    return {
      title: resolvePlainText(sourceData.title),
      compact: sourceData.compact === true,
      ultraCompact: sourceData.ultraCompact === true,
      columns,
      columnsCount: columns.length || 1,
      rows: sourceData.rows.map((row) => ({
        cells: columns.map((column, columnIndex) => ({
          value: resolvePlainText(row?.cells?.[columnIndex]?.value ?? row?.cells?.[columnIndex]),
          className: resolveCellClass(row?.cells?.[columnIndex], column, columnIndex),
        })),
      })),
      emptyLabel: resolvePlainText(sourceData.emptyLabel) || PEOPLE_REPORT_EMPTY_LABEL,
      totalCountLabel: resolvePlainText(sourceData.totalCountLabel),
    };
  }

  const sanitized = sanitizeReportData(sourceData);
  const firstSection = Array.isArray(sanitized?.sections) ? sanitized.sections[0] : null;
  const columns = resolveSectionColumns(firstSection);
  const rows = Array.isArray(firstSection?.rows)
    ? firstSection.rows.map((row) => {
        const cells = Array.isArray(row?.cells) ? row.cells : [];
        return {
          cells: columns.map((column, columnIndex) => ({
            value: resolvePlainText(cells[columnIndex]),
            className: resolveCellClass(cells[columnIndex], column, columnIndex),
          })),
        };
      })
    : [];

  return {
    title: resolvePlainText(sanitized?.title),
    compact: sanitized?.layout?.compact === true,
    ultraCompact: sanitized?.layout?.ultraCompact === true,
    columns,
    columnsCount: columns.length || Math.max(1, Number(firstSection?.columnsCount || 0)),
    rows,
    emptyLabel: resolvePlainText(sanitized?.emptyLabel) || PEOPLE_REPORT_EMPTY_LABEL,
    totalCountLabel: resolvePlainText(firstSection?.footerText),
  };
}

export function isPeopleReportPayload(payload) {
  return isLegacyPeopleReportPayload(payload);
}

const payloadAdapters = createLegacyPayloadAdapters({
  buildPeopleReportTemplateData,
});

const dataSanitizers = new Map([
  ["promissoryNote", sanitizePromissoryNoteData],
  ["report", sanitizeReportData],
]);

export function sanitizeTemplateData(templateId, data) {
  const key = String(templateId || "").trim();
  const sanitizer = dataSanitizers.get(key);
  if (!sanitizer) {
    return data || {};
  }

  return sanitizer(data);
}

export function resolveTemplatePayload(payload = {}) {
  for (const adapter of payloadAdapters) {
    if (adapter.matches(payload)) {
      return adapter.resolve(payload);
    }
  }

  return {
    templateId: payload.templateId,
    data: sanitizeTemplateData(payload.templateId, payload.data),
  };
}
