export function sanitizeFilename(name = "documento") {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function ensureFullHtmlDocument(inputHtml) {
  const html = String(inputHtml || "").trim();
  if (!html) return html;
  if (/<html[\s>]/i.test(html)) return html;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    @page { size: A4; margin: 10mm; }
    body { margin: 0; padding: 0; color: #111; font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; }
    table { width: 100%; border-collapse: collapse; }
    .page-break, [data-pdf-page-break="always"] { break-before: page; page-break-before: always; }
  </style>
</head>
<body>
  ${html}
</body>
</html>`;
}

export function injectBaseHref(html, baseUrl) {
  if (!baseUrl || !html || /<base[\s>]/i.test(html)) return html;
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return html.replace(
    /<head([^>]*)>/i,
    `<head$1><base href="${escapeHtmlAttr(normalizedBaseUrl)}">`
  );
}

export function extractHttpOriginsFromHtml(html) {
  const origins = new Set();
  const matches = String(html || "").matchAll(/https?:\/\/[^\s"'()<>]+/gi);

  for (const match of matches) {
    const url = String(match[0] || "").trim();
    if (!url) continue;

    try {
      origins.add(new URL(url).origin.toLowerCase());
    } catch {
      // Ignora URLs malformadas dentro do HTML.
    }
  }

  if (origins.has("https://fonts.googleapis.com")) {
    origins.add("https://fonts.gstatic.com");
  }

  return origins;
}
