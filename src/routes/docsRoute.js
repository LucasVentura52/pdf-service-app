import { Router } from "express";
import { contentSecurityPolicy } from "helmet";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { apiReference } from "@scalar/express-api-reference";
import { openApiDocument } from "../docs/openapi.js";

const require = createRequire(import.meta.url);

// O pacote @scalar/api-reference traz o build standalone do browser
// (UMD, registra `window.Scalar`). O @scalar/express-api-reference
// carrega esse bundle por CDN por padrao; aqui apontamos para o arquivo
// local, mantendo a politica "sem CDN" do projeto.
const scalarDistPath = dirname(require.resolve("@scalar/api-reference"));
const scalarStandalonePath = join(scalarDistPath, "browser", "standalone.js");

/**
 * Rota publica de documentacao da API.
 *
 * - `GET /docs.json`              -> spec OpenAPI 3.1 em JSON (para ferramentas externas)
 * - `GET /docs/`                  -> Scalar API Reference (assets locais, sem CDN)
 * - `GET /docs`                   -> redireciona para `/docs/`
 * - `GET /docs-assets/standalone.js` -> bundle do Scalar (same-origin)
 *
 * O Scalar injeta scripts e estilos inline em runtime; por isso o CSP padrao
 * do helmet e relaxado apenas nesta sub-arvore. O restante do app mantem o
 * helmet global.
 */
export function createDocsRouter() {
  const router = Router();

  router.use(
    contentSecurityPolicy({
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        connectSrc: ["'self'"],
      },
    })
  );

  router.get("/docs.json", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(openApiDocument);
  });

  // Bundle unico e autocontido do Scalar (sem CDN e sem source maps).
  router.get("/docs-assets/standalone.js", (_req, res, next) => {
    res.sendFile(scalarStandalonePath, {
      headers: { "Cache-Control": "public, max-age=86400" },
    }, (error) => {
      // Cliente que abortou no meio do stream deixa o abort como unico erro
      // possivel; repassar para o errorHandler resultaria em double-send.
      if (error && !res.headersSent) next(error);
    });
  });

  // Redireciona apenas `/docs` (sem barra) para `/docs/`, mantendo a URL
  // canonica. `req.originalUrl` distingue os dois casos porque o Express
  // normaliza `req.path` apos o strip do mount.
  router.use("/docs", (req, res, next) => {
    if (req.path === "/" && !req.originalUrl.endsWith("/")) {
      res.redirect(301, "/docs/");
      return;
    }
    next();
  });

  router.use("/docs", apiReference({
    cdn: "/docs-assets/standalone.js",
    content: openApiDocument,
    withDefaultFonts: false,
    hideModels: false,
    theme: "purple",
    pageTitle: "PDF Service API",
  }));

  return router;
}