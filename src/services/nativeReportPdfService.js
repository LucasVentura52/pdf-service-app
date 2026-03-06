import PDFDocument from "pdfkit";
import { isPeopleReportPayload, sanitizeTemplateData } from "./templatePayloads.js";

const MM_TO_POINTS = 72 / 25.4;
const CM_TO_POINTS = 72 / 2.54;
const PX_TO_POINTS = 72 / 96;
const DEFAULT_MARGIN_MM = 12;
const DEFAULT_SUMMARY_COLUMNS = 3;
const DEFAULT_PAGE_FORMAT = "A4";
const PDF_PAGE_SIZES = {
  A0: "A0",
  A1: "A1",
  A2: "A2",
  A3: "A3",
  A4: "A4",
  A5: "A5",
  A6: "A6",
  Letter: "LETTER",
  Legal: "LEGAL",
  Tabloid: "TABLOID",
};

function mmToPoints(value) {
  return value * MM_TO_POINTS;
}

export function isNativeReportPayload(payload) {
  return String(payload?.templateId || "").trim() === "report" && !isPeopleReportPayload(payload);
}

export function marginValueToPoints(value) {
  const raw = String(value || "").trim().toLowerCase();
  const match = raw.match(/^(\d+(?:\.\d+)?)(mm|cm|in|px)?$/i);
  if (!match) {
    return mmToPoints(DEFAULT_MARGIN_MM);
  }

  const amount = Number(match[1]);
  const unit = match[2] || "px";

  switch (unit) {
    case "mm":
      return amount * MM_TO_POINTS;
    case "cm":
      return amount * CM_TO_POINTS;
    case "in":
      return amount * 72;
    default:
      return amount * PX_TO_POINTS;
  }
}

export function resolveNativeReportMargins(margin = {}) {
  const fallback = mmToPoints(DEFAULT_MARGIN_MM);

  return {
    top: margin.top ? marginValueToPoints(margin.top) : fallback,
    right: margin.right ? marginValueToPoints(margin.right) : fallback,
    bottom: margin.bottom ? marginValueToPoints(margin.bottom) : fallback,
    left: margin.left ? marginValueToPoints(margin.left) : fallback,
  };
}

function resolvePageSize(format) {
  return PDF_PAGE_SIZES[format] || DEFAULT_PAGE_FORMAT;
}

function resolveText(value) {
  if (value === null || value === undefined) return "";

  if (typeof value === "string") {
    return value.replace(/\r\n/g, "\n");
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveText(item)).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    if ("value" in value) {
      return resolveText(value.value);
    }

    if ("text" in value) {
      return resolveText(value.text);
    }
  }

  return String(value);
}

function resolveTextAlign(...alignCandidates) {
  const normalized = alignCandidates
    .map((value) => String(value || "").trim().toLowerCase())
    .find(Boolean);

  if (normalized === "text-right" || normalized === "right") {
    return "right";
  }

  if (normalized === "text-center" || normalized === "center") {
    return "center";
  }

  return "left";
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

function buildStyle(scale = 1) {
  const resolvedScale = Number.isFinite(Number(scale)) ? Number(scale) : 1;
  const safeScale = Math.min(2, Math.max(0.1, resolvedScale));

  return {
    scale: safeScale,
    accentColor: "#0f172a",
    textColor: "#111827",
    mutedTextColor: "#4b5563",
    subtleTextColor: "#6b7280",
    borderColor: "#d1d5db",
    headerFillColor: "#e7eef9",
    headerTextColor: "#1e293b",
    rowOddFillColor: "#ffffff",
    rowEvenFillColor: "#f8fafc",
    summaryFillColor: "#f8fafc",
    titleFontSize: 18 * safeScale,
    subtitleFontSize: 11 * safeScale,
    metaFontSize: 10 * safeScale,
    sectionTitleFontSize: 13 * safeScale,
    summaryLabelFontSize: 10 * safeScale,
    summaryValueFontSize: 13 * safeScale,
    tableFontSize: 11 * safeScale,
    headerBottomSpacing: mmToPoints(3) * safeScale,
    headerMarginBottom: mmToPoints(8) * safeScale,
    subtitleSpacing: mmToPoints(2) * safeScale,
    metaSpacing: mmToPoints(2) * safeScale,
    sectionSpacingTop: mmToPoints(5) * safeScale,
    sectionSpacingBottom: mmToPoints(1.5) * safeScale,
    tableTopSpacing: mmToPoints(4) * safeScale,
    summaryGap: mmToPoints(2.5) * safeScale,
    summaryPadding: mmToPoints(2.5) * safeScale,
    cellPaddingX: mmToPoints(2.5) * safeScale,
    cellPaddingY: mmToPoints(2.2) * safeScale,
    lineGap: 1 * safeScale,
    summaryRadius: mmToPoints(2),
    sectionAfterSpacing: mmToPoints(4) * safeScale,
    footerFontSize: 8.5 * safeScale,
    footerTopSpacing: mmToPoints(1.5) * safeScale,
  };
}

function createState(doc) {
  return {
    y: doc.page.margins.top,
  };
}

function getContentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function getPageBottom(doc) {
  return doc.page.height - doc.page.margins.bottom;
}

function setFont(doc, fontName, fontSize, color) {
  doc.font(fontName).fontSize(fontSize).fillColor(color);
}

function measureTextHeight(doc, text, width, fontName, fontSize, lineGap = 0) {
  setFont(doc, fontName, fontSize, "#000000");
  return doc.heightOfString(text || " ", {
    width,
    lineGap,
  });
}

function ensureSpace(doc, state, requiredHeight, onPageBreak) {
  if (state.y + requiredHeight <= getPageBottom(doc)) {
    return false;
  }

  doc.addPage();
  state.y = doc.page.margins.top;
  if (typeof onPageBreak === "function") {
    onPageBreak();
  }
  return true;
}

function splitLongToken(doc, token, width) {
  const parts = [];
  let current = "";

  for (const character of token) {
    const next = `${current}${character}`;
    if (!current || doc.widthOfString(next) <= width) {
      current = next;
      continue;
    }

    parts.push(current);
    current = character;
  }

  if (current) {
    parts.push(current);
  }

  return parts.length ? parts : [token];
}

function wrapTextLines(doc, text, width) {
  const normalized = resolveText(text);
  if (!normalized) {
    return [""];
  }

  const lines = [];
  const paragraphs = normalized.split("\n");

  for (const paragraph of paragraphs) {
    const tokens = paragraph.trim().length ? paragraph.trim().split(/\s+/) : [""];
    let currentLine = "";

    for (const token of tokens) {
      if (!token) {
        if (!currentLine) {
          lines.push("");
        }
        continue;
      }

      const candidate = currentLine ? `${currentLine} ${token}` : token;
      if (doc.widthOfString(candidate) <= width) {
        currentLine = candidate;
        continue;
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      if (doc.widthOfString(token) <= width) {
        currentLine = token;
        continue;
      }

      const longParts = splitLongToken(doc, token, width);
      currentLine = longParts.pop() || "";
      lines.push(...longParts);
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    if (!paragraph.trim().length) {
      lines.push("");
    }
  }

  return lines.length ? lines : [""];
}

function drawTextBlock(doc, text, x, y, width, fontName, fontSize, color, align, lineGap = 0) {
  setFont(doc, fontName, fontSize, color);
  doc.text(text || " ", x, y, {
    width,
    align,
    lineGap,
  });
}

function drawHeader(doc, state, data, style) {
  const contentWidth = getContentWidth(doc);
  const title = resolveText(data.title) || "Relatorio";
  const subtitle = resolveText(data.subtitle);
  const generatedAt = resolveText(data.generatedAt);

  const titleHeight = measureTextHeight(
    doc,
    title,
    contentWidth,
    "Helvetica-Bold",
    style.titleFontSize,
    style.lineGap
  );
  const subtitleHeight = subtitle
    ? measureTextHeight(
        doc,
        subtitle,
        contentWidth,
        "Helvetica",
        style.subtitleFontSize,
        style.lineGap
      )
    : 0;
  const metaHeight = generatedAt
    ? measureTextHeight(
        doc,
        `Gerado em: ${generatedAt}`,
        contentWidth,
        "Helvetica",
        style.metaFontSize,
        style.lineGap
      )
    : 0;

  const requiredHeight =
    titleHeight +
    (subtitle ? style.subtitleSpacing + subtitleHeight : 0) +
    (generatedAt ? style.metaSpacing + metaHeight : 0) +
    style.headerBottomSpacing +
    style.headerMarginBottom;

  ensureSpace(doc, state, requiredHeight);

  drawTextBlock(
    doc,
    title,
    doc.page.margins.left,
    state.y,
    contentWidth,
    "Helvetica-Bold",
    style.titleFontSize,
    style.textColor,
    "left",
    style.lineGap
  );
  state.y += titleHeight;

  if (subtitle) {
    state.y += style.subtitleSpacing;
    drawTextBlock(
      doc,
      subtitle,
      doc.page.margins.left,
      state.y,
      contentWidth,
      "Helvetica",
      style.subtitleFontSize,
      style.mutedTextColor,
      "left",
      style.lineGap
    );
    state.y += subtitleHeight;
  }

  if (generatedAt) {
    state.y += style.metaSpacing;
    drawTextBlock(
      doc,
      `Gerado em: ${generatedAt}`,
      doc.page.margins.left,
      state.y,
      contentWidth,
      "Helvetica",
      style.metaFontSize,
      style.subtleTextColor,
      "left",
      style.lineGap
    );
    state.y += metaHeight;
  }

  state.y += style.headerBottomSpacing;
  doc
    .moveTo(doc.page.margins.left, state.y)
    .lineTo(doc.page.width - doc.page.margins.right, state.y)
    .strokeColor(style.borderColor)
    .lineWidth(1)
    .stroke();
  state.y += style.headerMarginBottom;
}

function normalizeSummaryItems(summary) {
  if (!summary || typeof summary !== "object" || !Array.isArray(summary.items)) {
    return [];
  }

  return summary.items
    .map((item) => ({
      label: resolveText(item?.label),
      value: resolveText(item?.value),
    }))
    .filter((item) => item.label || item.value);
}

function normalizeReportLayout(layout) {
  const normalized = layout && typeof layout === "object" ? layout : {};

  return {
    hideHeader: normalized.hideHeader === true,
    showPageNumbers: normalized.showPageNumbers !== false,
    variant: String(normalized.variant || "").trim().toLowerCase(),
  };
}

function drawSummary(doc, state, summary, style) {
  const items = normalizeSummaryItems(summary);
  if (!items.length) {
    return;
  }

  const contentWidth = getContentWidth(doc);
  const columns = Math.min(DEFAULT_SUMMARY_COLUMNS, items.length);
  const columnWidth = (contentWidth - style.summaryGap * (columns - 1)) / columns;

  for (let index = 0; index < items.length; index += columns) {
    const rowItems = items.slice(index, index + columns);
    const rowHeight = rowItems.reduce((maxHeight, item) => {
      const labelHeight = measureTextHeight(
        doc,
        item.label,
        columnWidth - style.summaryPadding * 2,
        "Helvetica",
        style.summaryLabelFontSize,
        style.lineGap
      );
      const valueHeight = measureTextHeight(
        doc,
        item.value,
        columnWidth - style.summaryPadding * 2,
        "Helvetica-Bold",
        style.summaryValueFontSize,
        style.lineGap
      );
      return Math.max(
        maxHeight,
        style.summaryPadding * 2 + labelHeight + mmToPoints(1) * style.scale + valueHeight
      );
    }, 0);

    ensureSpace(doc, state, rowHeight + style.summaryGap);

    rowItems.forEach((item, itemIndex) => {
      const x = doc.page.margins.left + itemIndex * (columnWidth + style.summaryGap);
      const y = state.y;
      const textWidth = columnWidth - style.summaryPadding * 2;
      const labelHeight = measureTextHeight(
        doc,
        item.label,
        textWidth,
        "Helvetica",
        style.summaryLabelFontSize,
        style.lineGap
      );

      doc
        .roundedRect(x, y, columnWidth, rowHeight, style.summaryRadius)
        .fillAndStroke(style.summaryFillColor, style.borderColor);

      drawTextBlock(
        doc,
        item.label,
        x + style.summaryPadding,
        y + style.summaryPadding,
        textWidth,
        "Helvetica",
        style.summaryLabelFontSize,
        style.mutedTextColor,
        "left",
        style.lineGap
      );

      drawTextBlock(
        doc,
        item.value,
        x + style.summaryPadding,
        y + style.summaryPadding + labelHeight + mmToPoints(1) * style.scale,
        textWidth,
        "Helvetica-Bold",
        style.summaryValueFontSize,
        style.textColor,
        "left",
        style.lineGap
      );
    });

    state.y += rowHeight + style.summaryGap;
  }
}

function normalizeSection(section) {
  const rows = Array.isArray(section?.rows) ? section.rows : [];
  const declaredColumns = Array.isArray(section?.columns) ? section.columns : [];
  const inferredColumns = rows.reduce((maxCount, row) => {
    return Math.max(maxCount, Array.isArray(row?.cells) ? row.cells.length : 0);
  }, 0);
  const columnsCount = Math.max(
    declaredColumns.length,
    Number(section?.columnsCount || 0),
    inferredColumns,
    1
  );

  const columns = Array.from({ length: columnsCount }, (_, index) => {
    const column = declaredColumns[index] || {};
    return {
      label: resolveText(column.label) || (declaredColumns.length ? "" : `Coluna ${index + 1}`),
      align: resolveTextAlign(column.alignClass),
      weight: resolveColumnWeight(column),
    };
  });

  return {
    title: resolveText(section?.title),
    footerText: resolveText(section?.footerText),
    footerAlign: resolveTextAlign(section?.footerAlign),
    columns,
    rows,
  };
}

function buildColumnMetrics(doc, columns) {
  const contentWidth = getContentWidth(doc);
  const totalWeight = columns.reduce((total, column) => total + column.weight, 0) || columns.length;
  let x = doc.page.margins.left;

  return columns.map((column, index) => {
    const isLastColumn = index === columns.length - 1;
    const width = isLastColumn
      ? doc.page.width - doc.page.margins.right - x
      : (contentWidth * column.weight) / totalWeight;
    const metric = {
      ...column,
      x,
      width,
    };
    x += width;
    return metric;
  });
}

function drawTableHeader(doc, state, sectionTitle, columnMetrics, style, continuation = false) {
  const title = continuation ? `${sectionTitle} (continua)` : sectionTitle;
  const minRowHeight = style.cellPaddingY * 2 + style.tableFontSize + style.lineGap;
  const titleHeight = title
    ? measureTextHeight(
        doc,
        title,
        getContentWidth(doc),
        "Helvetica-Bold",
        style.sectionTitleFontSize,
        style.lineGap
      )
    : 0;

  const headerLines = columnMetrics.map((column) => {
    setFont(doc, "Helvetica-Bold", style.tableFontSize, style.textColor);
    return wrapTextLines(
      doc,
      column.label,
      Math.max(16, column.width - style.cellPaddingX * 2)
    );
  });
  const headerLineCount = headerLines.reduce((maxLines, lines) => Math.max(maxLines, lines.length), 1);
  const headerHeight = style.cellPaddingY * 2 + headerLineCount * (style.tableFontSize + style.lineGap);

  ensureSpace(doc, state, titleHeight + style.sectionSpacingBottom + headerHeight + minRowHeight);

  if (title) {
    drawTextBlock(
      doc,
      title,
      doc.page.margins.left,
      state.y,
      getContentWidth(doc),
      "Helvetica-Bold",
      style.sectionTitleFontSize,
      style.textColor,
      "left",
      style.lineGap
    );
    state.y += titleHeight + style.sectionSpacingBottom;
  }

  columnMetrics.forEach((column, index) => {
    const lines = headerLines[index];
    doc
      .rect(column.x, state.y, column.width, headerHeight)
      .fillAndStroke(style.headerFillColor, style.borderColor);
    drawTextBlock(
      doc,
      lines.join("\n"),
      column.x + style.cellPaddingX,
      state.y + style.cellPaddingY,
      Math.max(16, column.width - style.cellPaddingX * 2),
      "Helvetica-Bold",
      style.tableFontSize,
      style.headerTextColor,
      column.align,
      style.lineGap
    );
  });

  state.y += headerHeight;
}

function createRowCells(row, columnMetrics) {
  const rowCells = Array.isArray(row?.cells) ? row.cells : [];

  return columnMetrics.map((column, index) => {
    const cell = rowCells[index] || {};
    return {
      text: resolveText(cell),
      align: resolveTextAlign(cell.alignClass, column.align),
      width: column.width,
      x: column.x,
    };
  });
}

function drawSingleCellRow(doc, state, text, columnMetrics, style, align = "center", options = {}) {
  const width = columnMetrics.reduce((total, column) => total + column.width, 0);
  const fontName = options.fontName || "Helvetica";
  const textColor = options.textColor || style.textColor;
  const fillColor = options.fillColor || style.rowOddFillColor;
  const fontSize = options.fontSize || style.tableFontSize;

  setFont(doc, fontName, fontSize, textColor);
  const lines = wrapTextLines(doc, text, width - style.cellPaddingX * 2);
  const rowHeight = style.cellPaddingY * 2 + lines.length * (fontSize + style.lineGap);

  doc
    .rect(columnMetrics[0].x, state.y, width, rowHeight)
    .fillAndStroke(fillColor, style.borderColor);

  drawTextBlock(
    doc,
    lines.join("\n"),
    columnMetrics[0].x + style.cellPaddingX,
    state.y + style.cellPaddingY,
    width - style.cellPaddingX * 2,
    fontName,
    fontSize,
    textColor,
    align,
    style.lineGap
  );

  state.y += rowHeight;
}

function drawRow(doc, state, row, columnMetrics, style, sectionTitle, rowIndex) {
  if (!Array.isArray(row?.cells) || !row.cells.length) {
    drawSingleCellRow(doc, state, "Sem dados.", columnMetrics, style);
    return;
  }

  setFont(doc, "Helvetica", style.tableFontSize, style.textColor);
  const lineHeight = style.tableFontSize + style.lineGap;
  const rowFillColor = rowIndex % 2 === 0 ? style.rowOddFillColor : style.rowEvenFillColor;
  const cells = createRowCells(row, columnMetrics).map((cell) => ({
    ...cell,
    lines: wrapTextLines(doc, cell.text, Math.max(16, cell.width - style.cellPaddingX * 2)),
    offset: 0,
  }));

  while (cells.some((cell) => cell.offset < cell.lines.length)) {
    const availableHeight = getPageBottom(doc) - state.y;
    const maxVisibleLines = Math.max(
      1,
      Math.floor((availableHeight - style.cellPaddingY * 2) / lineHeight)
    );

    if (availableHeight < style.cellPaddingY * 2 + lineHeight) {
      doc.addPage();
      state.y = doc.page.margins.top;
      drawTableHeader(doc, state, sectionTitle, columnMetrics, style, true);
      continue;
    }

    const segmentCells = cells.map((cell) => {
      const nextOffset = Math.min(cell.offset + maxVisibleLines, cell.lines.length);
      const visibleLines = cell.lines.slice(cell.offset, nextOffset);
      return {
        ...cell,
        visibleLines,
        nextOffset,
      };
    });

    const lineCount = segmentCells.reduce(
      (maxLines, cell) => Math.max(maxLines, cell.visibleLines.length || 1),
      1
    );
    const rowHeight = style.cellPaddingY * 2 + lineCount * lineHeight;

    if (state.y + rowHeight > getPageBottom(doc)) {
      doc.addPage();
      state.y = doc.page.margins.top;
      drawTableHeader(doc, state, sectionTitle, columnMetrics, style, true);
      continue;
    }

    segmentCells.forEach((cell) => {
      doc
        .rect(cell.x, state.y, cell.width, rowHeight)
        .fillAndStroke(rowFillColor, style.borderColor);

      drawTextBlock(
        doc,
        cell.visibleLines.join("\n"),
        cell.x + style.cellPaddingX,
        state.y + style.cellPaddingY,
        Math.max(16, cell.width - style.cellPaddingX * 2),
        "Helvetica",
        style.tableFontSize,
        style.textColor,
        cell.align,
        style.lineGap
      );
    });

    cells.forEach((cell, index) => {
      cell.offset = segmentCells[index].nextOffset;
    });

    state.y += rowHeight;
  }
}

function drawSection(doc, state, section, style) {
  const normalizedSection = normalizeSection(section);
  const columnMetrics = buildColumnMetrics(doc, normalizedSection.columns);
  const rows = normalizedSection.rows.length ? normalizedSection.rows : [{ cells: [] }];

  if (normalizedSection.title) {
    state.y += style.sectionSpacingTop;
  }
  drawTableHeader(doc, state, normalizedSection.title, columnMetrics, style, false);

  for (const [index, row] of rows.entries()) {
    drawRow(doc, state, row, columnMetrics, style, normalizedSection.title, index);
  }

  if (normalizedSection.footerText) {
    drawSingleCellRow(
      doc,
      state,
      normalizedSection.footerText,
      columnMetrics,
      style,
      normalizedSection.footerAlign || "right",
      {
        fontName: "Helvetica-Bold",
        fillColor: style.rowOddFillColor,
      }
    );
  }

  state.y += style.sectionAfterSpacing;
}

function drawPageFooters(doc, style, layout) {
  if (!layout.showPageNumbers) {
    return;
  }

  const pageRange = doc.bufferedPageRange();
  const totalPages = pageRange.count;

  for (let index = 0; index < totalPages; index += 1) {
    doc.switchToPage(pageRange.start + index);
    const footerLineY = doc.page.height - doc.page.margins.bottom + style.footerTopSpacing;
    const footerTextY = footerLineY + 3;

    doc
      .moveTo(doc.page.margins.left, footerLineY)
      .lineTo(doc.page.width - doc.page.margins.right, footerLineY)
      .strokeColor(style.borderColor)
      .lineWidth(0.75)
      .stroke();

    drawTextBlock(
      doc,
      `Pagina ${index + 1} de ${totalPages}`,
      doc.page.margins.left,
      footerTextY,
      getContentWidth(doc),
      "Helvetica",
      style.footerFontSize,
      style.subtleTextColor,
      "right"
    );
  }
}

export async function generateNativeReportPdf(payload, options = {}) {
  const data = sanitizeTemplateData("report", payload?.data || {});
  const margins = resolveNativeReportMargins(payload?.options?.margin);
  const style = buildStyle(payload?.options?.scale);
  const layout = normalizeReportLayout(data.layout);
  const compress = options.compress !== false;

  const doc = new PDFDocument({
    autoFirstPage: true,
    bufferPages: true,
    compress,
    size: resolvePageSize(payload?.options?.format),
    layout: payload?.options?.landscape ? "landscape" : "portrait",
    margins,
    info: {
      Title: resolveText(data.title) || "Relatorio",
      Producer: "pdf-service",
      Subject: "Relatorio PDF nativo",
    },
  });

  const chunks = [];
  const bufferPromise = new Promise((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const state = createState(doc);
  if (!layout.hideHeader) {
    drawHeader(doc, state, data, style);
  }
  drawSummary(doc, state, data.summary, style);

  const sections = Array.isArray(data.sections) ? data.sections : [];
  for (const section of sections) {
    drawSection(doc, state, section, style);
  }

  drawPageFooters(doc, style, layout);
  doc.end();
  return bufferPromise;
}

export function createNativeReportPdfService() {
  return {
    canRenderPayload: isNativeReportPayload,
    generateFromPayload: (payload) => generateNativeReportPdf(payload),
  };
}
