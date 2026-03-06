import fs from "node:fs/promises";
import path from "node:path";
import Mustache from "mustache";

export class TemplateNotFoundError extends Error {
  constructor(templateId) {
    super(`Template '${templateId}' nao encontrado.`);
    this.name = "TemplateNotFoundError";
    this.code = "TEMPLATE_NOT_FOUND";
    this.templateId = templateId;
  }
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

export function sanitizeTemplateData(templateId, data) {
  if (String(templateId || "").trim() !== "report" || !data || typeof data !== "object") {
    return data || {};
  }

  const sections = Array.isArray(data.sections)
    ? data.sections.map((section) => sanitizeReportSectionRows(section))
    : data.sections;

  return {
    ...data,
    sections,
  };
}

export function createTemplateService({ templateDir }) {
  const resolvedTemplateDir = path.resolve(templateDir);
  const templateCache = new Map();

  async function loadTemplate(templateId) {
    const key = String(templateId).trim();
    if (!key) {
      throw new Error("templateId invalido.");
    }
    if (templateCache.has(key)) {
      return templateCache.get(key);
    }

    const templatePath = path.resolve(resolvedTemplateDir, `${key}.html`);
    if (!templatePath.startsWith(`${resolvedTemplateDir}${path.sep}`)) {
      throw new Error("templateId invalido.");
    }

    let template;
    try {
      template = await fs.readFile(templatePath, "utf8");
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        throw new TemplateNotFoundError(key);
      }
      throw error;
    }

    Mustache.parse(template);
    templateCache.set(key, template);
    return template;
  }

  async function resolveHtmlFromPayload(payload) {
    if (payload.templateId) {
      const template = await loadTemplate(payload.templateId);
      return Mustache.render(template, sanitizeTemplateData(payload.templateId, payload.data));
    }
    return payload.html || "";
  }

  async function warmupTemplateCache() {
    try {
      const files = await fs.readdir(resolvedTemplateDir);
      const htmlFiles = files.filter((file) => file.endsWith(".html"));
      await Promise.all(
        htmlFiles.map((file) => {
          const templateId = file.replace(/\.html$/i, "");
          return loadTemplate(templateId);
        })
      );
      console.log(`[pdf-service] templates carregados em cache: ${htmlFiles.length}`);
    } catch (error) {
      console.warn("[pdf-service] Nao foi possivel carregar templates no startup.", error);
    }
  }

  return {
    resolveHtmlFromPayload,
    warmupTemplateCache,
  };
}
