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
      return Mustache.render(template, payload.data || {});
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
