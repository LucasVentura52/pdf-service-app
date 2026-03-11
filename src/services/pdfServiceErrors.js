export class PdfServiceError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = this.constructor.name;
    this.code = code || "PDF_SERVICE_ERROR";
  }
}

export class BrowserUnavailableError extends PdfServiceError {
  constructor(message, options = {}) {
    super(
      message ||
        "Playwright browser nao instalado no ambiente. Execute 'playwright install chromium' no build/deploy.",
      {
        ...options,
        code: "BROWSER_UNAVAILABLE",
      }
    );
  }
}

export class BlockedAssetError extends PdfServiceError {
  constructor(message, options = {}) {
    super(
      message ||
        "Payload requisitou recurso externo nao permitido. Inclua a origem em PDF_ALLOWED_ASSET_ORIGINS ou deixe a allowlist vazia para permitir assets publicos.",
      {
        ...options,
        code: "BLOCKED_ASSET",
      }
    );
  }
}

export function normalizeBrowserError(error) {
  if (error instanceof PdfServiceError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  if (
    /Executable doesn't exist/i.test(message) ||
    /playwright install/i.test(message) ||
    /browserType\.launch/i.test(message)
  ) {
    return new BrowserUnavailableError(undefined, { cause: error });
  }

  if (/ERR_BLOCKED_BY_CLIENT|blockedbyclient/i.test(message)) {
    return new BlockedAssetError(undefined, { cause: error });
  }

  return error;
}
