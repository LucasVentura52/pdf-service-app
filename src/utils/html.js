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
