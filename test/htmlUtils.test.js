import test from "node:test";
import assert from "node:assert/strict";
import { extractHttpOriginsFromHtml } from "../src/utils/html.js";

test("extrai origens http/https do html e inclui fonts.gstatic como derivada", () => {
  const html = `
    <html>
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto&display=swap">
      </head>
      <body>
        <img src="https://api.maisgerencia.com.br/storage/image/veiculo/teste.jpg">
      </body>
    </html>
  `;

  const origins = extractHttpOriginsFromHtml(html);

  assert.deepEqual(
    Array.from(origins).sort(),
    [
      "https://api.maisgerencia.com.br",
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ]
  );
});
