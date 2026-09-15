import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { contentSecurityPolicy } from "helmet";
import { openApiDocument } from "../docs/openapi.js";

/**
 * Rota publica de documentacao da API.
 *
 * - `GET /docs.json` -> spec OpenAPI 3.1 em JSON (para ferramentas externas)
 * - `GET /docs/`     -> Swagger UI servido com assets locais (sem CDN)
 * - `GET /docs`      -> redireciona para `/docs/` (assets relativos do Swagger UI)
 *
 * O `swagger-ui-express` injeta um script inline (`swagger-ui-init.js`) e estilos
 * inline. Por isso o CSP padrao do helmet e relaxado apenas nesta sub-arvore;
 * o restante do app mantem o helmet global.
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

  // O HTML gerado pelo swagger-ui-express referencia os assets por caminho
  // relativo (`./swagger-ui-bundle.js` etc.), que so resolvem com a barra final.
  // Redireciona apenas `/docs` (sem barra); `/docs/` e subpaths seguem para o
  // Swagger UI. `req.originalUrl` distingue os dois casos porque o Express
  // normaliza `req.path` apos o strip do mount.
  router.use("/docs", (req, res, next) => {
    if (req.path === "/" && !req.originalUrl.endsWith("/")) {
      res.redirect(301, "/docs/");
      return;
    }
    next();
  });

  router.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument, {
    customSiteTitle: "PDF Service API",
    customRobots: "noindex, nofollow",
  }));

  return router;
}