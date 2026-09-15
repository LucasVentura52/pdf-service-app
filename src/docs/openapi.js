/**
 * Especificacao OpenAPI 3.1 do PDF Service.
 *
 * Mantida manualmente, espelhando o contrato definido em
 * src/schemas/pdfRequestSchema.js e o comportamento das rotas em
 * src/routes/*.js, src/middleware/*.js e src/services/*.js.
 * Ao alterar o contrato, atualizar este arquivo.
 */
import { config } from "../config.js";

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "PDF Service API",
    version: "1.0.0",
    description: [
      "Microservico HTTP para gerar PDF a partir de HTML pronto enviado pela aplicacao principal.",
      "",
      "O servico recebe um documento `html` completo, renderiza o documento em Chromium headless via Playwright e retorna o PDF no corpo da resposta.",
      "",
      "## Autenticacao",
      "",
      "Os endpoints de geracao (`/pdf` e `/preview`) exigem um token. O token e definido em `PDF_SERVICE_TOKEN` e pode ser informado de duas formas equivalentes:",
      "",
      "- cabecalho `x-pdf-token: <token>`",
      "- cabecalho `Authorization: Bearer <token>`",
      "",
      "Sem token valido o servico responde `401`. Se `PDF_SERVICE_TOKEN` nao estiver configurado, o servico responde `503`.",
      "",
      "## Regras do contrato",
      "",
      "- `html` e obrigatorio",
      "- `filename` aceita ate 120 caracteres",
      "- `templateId` e `data` **nao sao suportados** - enviar qualquer um desses campos resulta em `400`",
      "- `options.scale` aceita valores entre `0.1` e `2`",
      "- `options.timeoutMs` aceita valores entre `1000` e `60000`",
      "",
      "## Comportamento de assets externos",
      "",
      "- com `PDF_ALLOWED_ASSET_ORIGINS` preenchido, apenas assets HTTP/HTTPS dessa lista sao carregados",
      "- a origem definida em `PDF_PUBLIC_BASE_URL` e incluida automaticamente na allowlist",
      "- com `PDF_ALLOWED_ASSET_ORIGINS` vazio, assets publicos continuam permitidos",
      "- acessos a `localhost` e redes privadas permanecem bloqueados quando `PDF_BLOCK_PRIVATE_NETWORK=1` (padrao)",
      "- um asset bloqueado pela politica de seguranca resulta em `400`",
      "",
      "## Endpoints de documentacao",
      "",
      "A propria documentacao e servida pelo servico em `GET /docs/` (Swagger UI) e `GET /docs.json` (spec OpenAPI).",
    ].join("\n"),
  },
  externalDocs: {
    description: "README do projeto (instalacao, variaveis de ambiente e exemplos)",
    url: "https://github.com/LucasVentura52/pdf-service-app",
  },
  servers: [
    {
      url: `http://localhost:${config.port}`,
      description: "Servidor local",
    },
  ],
  tags: [
    { name: "Operacional", description: "Probes de status e prontidao do servico." },
    { name: "Geracao", description: "Geracao de PDF e preview HTML." },
    { name: "Documentacao", description: "Documentacao da propria API (Swagger UI e spec OpenAPI)." },
  ],
  paths: {
    "/docs": {
      get: {
        tags: ["Documentacao"],
        operationId: "getDocs",
        summary: "Interface Swagger UI",
        description:
          "Interface interativa de documentacao da API. Publica, nao exige token. Serve os assets localmente (sem CDN).",
        responses: {
          301: {
            description:
              "Redireciona `GET /docs` (sem barra) para `GET /docs/`, onde os assets relativos do Swagger UI resolvem.",
            headers: {
              Location: {
                description: "URL canonica da documentacao.",
                schema: { type: "string", example: "/docs/" },
              },
            },
          },
          200: {
            description: "Pagina HTML do Swagger UI.",
            content: {
              "text/html": {
                schema: { type: "string" },
              },
            },
          },
        },
      },
    },
    "/docs.json": {
      get: {
        tags: ["Documentacao"],
        operationId: "getDocsJson",
        summary: "Spec OpenAPI 3.1 em JSON",
        description:
          "Especificacao OpenAPI 3.1 deste servico, para consumo por ferramentas externas (Postman, Insomnia, geradores de client). Publica, nao exige token.",
        responses: {
          200: {
            description: "Spec OpenAPI 3.1 do servico.",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/health": {
      get: {
        tags: ["Operacional"],
        operationId: "getHealth",
        summary: "Estado operacional do servico",
        description:
          "Retorna estado operacional do servico, fila, browser e limites configurados. Nao requer autenticacao.",
        responses: {
          200: {
            description: "Snapshot operacional do servico.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
                example: {
                  status: "ok",
                  timestamp: "2026-09-15T19:40:44.000Z",
                  readiness: {
                    ready: true,
                    code: "READY",
                    message: "Servico pronto para gerar PDFs.",
                  },
                  operational: {
                    phase: "ready",
                    warmupCompleted: true,
                    warmupError: null,
                    drainStartedAt: null,
                    readiness: {
                      ready: true,
                      code: "READY",
                      message: "Servico pronto para gerar PDFs.",
                    },
                  },
                  queue: {
                    activeJobs: 0,
                    pendingJobs: 0,
                    maxConcurrentJobs: 2,
                    maxPendingJobs: 20,
                    acquireTimeoutMs: 10000,
                  },
                  browser: {
                    browserLaunched: true,
                    bufferedSessions: 1,
                    bufferedSessionsTarget: 1,
                    pendingWarmups: 0,
                    reuseSessionsEnabled: true,
                    reuseSessionMaxUses: 25,
                    imageCache: {
                      size: 3,
                      maxEntries: 300,
                      ttlMs: 300000,
                    },
                  },
                  limits: {
                    maxConcurrentJobs: 2,
                    maxPendingJobs: 20,
                    queueWaitTimeoutMs: 10000,
                  },
                },
              },
            },
          },
        },
      },
    },
    "/ready": {
      get: {
        tags: ["Operacional"],
        operationId: "getReady",
        summary: "Probe de prontidao",
        description: [
          "Probe de prontidao usada por orquestradores/load balancers.",
          "",
          "- `200` quando o servico esta pronto para aceitar `POST /pdf`",
          "- `503` durante startup, ausencia de token, falha de warmup ou draining",
        ].join("\n"),
        responses: {
          200: {
            description: "Servico pronto para gerar PDFs.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReadyResponse" },
                example: {
                  status: "ok",
                  timestamp: "2026-09-15T19:40:44.000Z",
                  readiness: {
                    ready: true,
                    code: "READY",
                    message: "Servico pronto para gerar PDFs.",
                  },
                },
              },
            },
          },
          503: {
            description:
              "Servico ainda nao esta pronto. Momentos comuns: warmup em andamento (`WARMING_UP`), falha de warmup (`WARMUP_FAILED`) ou shutdown gracioso (`DRAINING`).",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReadyResponse" },
                example: {
                  status: "unavailable",
                  timestamp: "2026-09-15T19:40:40.000Z",
                  readiness: {
                    ready: false,
                    code: "WARMING_UP",
                    message: "Servico iniciando aquecimento interno.",
                  },
                },
              },
            },
          },
        },
      },
    },
    "/pdf": {
      post: {
        tags: ["Geracao"],
        operationId: "postPdf",
        summary: "Gera um PDF a partir de HTML",
        description:
          "Gera um PDF a partir do HTML enviado e retorna o binario no corpo da resposta. Sujeito a rate limit (por padrao 40 requisicoes/minuto, configuravel em `PDF_RATE_LIMIT_MAX`).",
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PdfRequest" },
              example: {
                filename: "relatorio-vendas",
                html: "<html><body><h1>Relatorio de vendas</h1><p>Periodo atual.</p></body></html>",
                options: {
                  format: "A4",
                  landscape: false,
                  printBackground: true,
                  preferCSSPageSize: true,
                  displayHeaderFooter: false,
                  timeoutMs: 15000,
                  margin: {
                    top: "10mm",
                    right: "10mm",
                    bottom: "10mm",
                    left: "10mm",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "PDF gerado com sucesso. O binario e retornado no corpo da resposta.",
            headers: {
              "Content-Type": {
                description: "Tipo do conteudo retornado.",
                schema: { type: "string", example: "application/pdf" },
              },
              "Content-Disposition": {
                description: 'Nome sugerido do arquivo: `inline; filename="<filename>.pdf"`.',
                schema: { type: "string", example: 'inline; filename="relatorio-vendas.pdf"' },
              },
              "Content-Length": {
                description: "Tamanho do PDF em bytes.",
                schema: { type: "integer", example: 48231 },
              },
              "RateLimit-Limit": {
                description: "Limite de requisicoes na janela de 1 minuto.",
                schema: { type: "integer", example: 40 },
              },
              "RateLimit-Remaining": {
                description: "Requisições restantes na janela atual.",
                schema: { type: "integer", example: 39 },
              },
              "RateLimit-Reset": {
                description: "Instante (epoch, segundos) em que a janela reinicia.",
                schema: { type: "integer", example: 1726400000 },
              },
            },
            content: {
              "application/pdf": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          400: {
            description: [
              "Payload invalido ou atualizacao de politica de seguranca bloqueou um asset externo.",
              "",
              "- validacao: `{ \"message\": \"Payload invalido.\", \"errors\": { \"formErrors\": [], \"fieldErrors\": { \"html\": [\"...\"] } } }`",
              "- asset externo bloqueado: `{ \"message\": \"<detalhe do asset bloqueado>\" }`",
              "- JSON malformado no body: `{ \"message\": \"JSON invalido no body.\" }`",
            ].join("\n"),
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
                example: {
                  message: "Payload invalido.",
                  errors: {
                    formErrors: [],
                    fieldErrors: {
                      html: ["String must contain at least 1 character(s)"],
                      templateId: ["Campo legado 'templateId' nao e suportado."],
                    },
                  },
                },
              },
            },
          },
          401: {
            description: "Token ausente ou invalido.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { message: "Token invalido." },
              },
            },
          },
          429: {
            description: "Limite de requisicoes por minuto excedido.",
            headers: {
              "Retry-After": {
                description: "Segundos restantes da janela de rate limit.",
                schema: { type: "integer", example: 12 },
              },
              "RateLimit-Limit": {
                description: "Limite de requisicoes na janela de 1 minuto.",
                schema: { type: "integer", example: 40 },
              },
              "RateLimit-Remaining": {
                description: "Sempre `0` quando o limite foi atingido.",
                schema: { type: "integer", example: 0 },
              },
              "RateLimit-Reset": {
                description: "Instante (epoch, segundos) em que a janela reinicia.",
                schema: { type: "integer", example: 1726400000 },
              },
            },
            content: {
              "text/plain": {
                schema: { type: "string" },
                example: "Too many requests, please try again later.",
              },
            },
          },
          503: {
            description: [
              "Servico nao esta pronto para gerar PDFs.",
              "",
              "- token nao configurado: `{ \"message\": \"PDF_SERVICE_TOKEN nao configurado.\" }`",
              "- warmup em andamento: `{ \"message\": \"...\", \"code\": \"WARMING_UP\" }`",
              "- falha de warmup: `{ \"message\": \"...\", \"code\": \"WARMUP_FAILED\" }`",
              "- shutdown gracioso (`Retry-After: 10`): `{ \"message\": \"Servico em desligamento controlado.\", \"code\": \"DRAINING\" }`",
              "- fila lotada (`Retry-After: 5`): `{ \"message\": \"Fila de geração lotada. Tente novamente em instantes.\" }`",
              "- tempo limite na fila excedido (`Retry-After: <segundos>`): `{ \"message\": \"Tempo limite na fila de geração excedido. Tente novamente.\" }`",
              "- browser indisponivel: `{ \"message\": \"<detalhe do browser>\" }`",
            ].join("\n"),
            headers: {
              "Retry-After": {
                description:
                  "Tempo sugerido em segundos antes de tentar novamente (presente quando a causa e fila lotada, timeout de fila ou draining).",
                schema: { type: "integer", example: 5 },
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: {
                  message: "Fila de geração lotada. Tente novamente em instantes.",
                },
              },
            },
          },
          500: {
            description: "Erro interno ao gerar o PDF (inclui payload acima do limite `PDF_BODY_LIMIT`).",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { message: "Erro ao gerar PDF." },
              },
            },
          },
        },
      },
    },
    "/preview": {
      post: {
        tags: ["Geracao"],
        operationId: "postPreview",
        summary: "Gera um preview HTML renderizado",
        description:
          "Renderiza o HTML no Chromium e retorna um documento HTML com o preview pronto, incluindo marcadores visuais de quebra de pagina. Sujeito ao mesmo rate limit de `/pdf`.",
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PdfRequest" },
              example: {
                filename: "relatorio-vendas",
                html: "<html><body><h1>Relatorio de vendas</h1><p>Periodo atual.</p></body></html>",
                options: {
                  format: "A4",
                  printBackground: true,
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Preview HTML gerado com sucesso. Na resposta, quebras de pagina sao substituidas por marcadores visuais das paginas.",
            headers: {
              "Content-Type": {
                description: "Tipo do conteudo retornado.",
                schema: { type: "string", example: "text/html; charset=utf-8" },
              },
              "Cache-Control": {
                description: "O preview nao deve ser cacheado.",
                schema: { type: "string", example: "no-store" },
              },
            },
            content: {
              "text/html": {
                schema: { type: "string" },
              },
            },
          },
          400: {
            description: [
              "Payload invalido ou atualizacao de politica de seguranca bloqueou um asset externo.",
              "",
              "- validacao: `{ \"message\": \"Payload invalido.\", \"errors\": { \"formErrors\": [], \"fieldErrors\": { \"html\": [\"...\"] } } }`",
              "- asset externo bloqueado: `{ \"message\": \"<detalhe do asset bloqueado>\" }`",
              "- JSON malformado no body: `{ \"message\": \"JSON invalido no body.\" }`",
            ].join("\n"),
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" },
                example: {
                  message: "Payload invalido.",
                  errors: {
                    formErrors: [],
                    fieldErrors: {
                      html: ["String must contain at least 1 character(s)"],
                    },
                  },
                },
              },
            },
          },
          401: {
            description: "Token ausente ou invalido.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { message: "Token invalido." },
              },
            },
          },
          429: {
            description: "Limite de requisicoes por minuto excedido.",
            headers: {
              "Retry-After": {
                description: "Segundos restantes da janela de rate limit.",
                schema: { type: "integer", example: 12 },
              },
              "RateLimit-Limit": {
                description: "Limite de requisicoes na janela de 1 minuto.",
                schema: { type: "integer", example: 40 },
              },
              "RateLimit-Remaining": {
                description: "Sempre `0` quando o limite foi atingido.",
                schema: { type: "integer", example: 0 },
              },
              "RateLimit-Reset": {
                description: "Instante (epoch, segundos) em que a janela reinicia.",
                schema: { type: "integer", example: 1726400000 },
              },
            },
            content: {
              "text/plain": {
                schema: { type: "string" },
                example: "Too many requests, please try again later.",
              },
            },
          },
          503: {
            description: [
              "Servico nao esta pronto para gerar previews.",
              "",
              "- token nao configurado: `{ \"message\": \"PDF_SERVICE_TOKEN nao configurado.\" }`",
              "- warmup em andamento: `{ \"message\": \"...\", \"code\": \"WARMING_UP\" }`",
              "- falha de warmup: `{ \"message\": \"...\", \"code\": \"WARMUP_FAILED\" }`",
              "- shutdown gracioso (`Retry-After: 10`): `{ \"message\": \"Servico em desligamento controlado.\", \"code\": \"DRAINING\" }`",
              "- fila lotada (`Retry-After: 5`): `{ \"message\": \"Fila de renderizacao lotada. Tente novamente em instantes.\" }`",
              "- tempo limite na fila excedido (`Retry-After: <segundos>`): `{ \"message\": \"Tempo limite na fila de renderizacao excedido. Tente novamente.\" }`",
              "- browser indisponivel: `{ \"message\": \"<detalhe do browser>\" }`",
            ].join("\n"),
            headers: {
              "Retry-After": {
                description:
                  "Tempo sugerido em segundos antes de tentar novamente (presente quando a causa e fila lotada, timeout de fila ou draining).",
                schema: { type: "integer", example: 5 },
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: {
                  message: "Fila de renderizacao lotada. Tente novamente em instantes.",
                },
              },
            },
          },
          500: {
            description: "Erro interno ao gerar o preview.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { message: "Erro ao renderizar preview." },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "x-pdf-token",
        description: "Token de acesso enviado no cabecalho `x-pdf-token`.",
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Token de acesso enviado como `Authorization: Bearer <token>`.",
      },
    },
    schemas: {
      PdfRequest: {
        type: "object",
        additionalProperties: false,
        properties: {
          filename: {
            type: "string",
            minLength: 1,
            maxLength: 120,
            description: "Nome base do arquivo gerado, sem extensao. Usado no header `Content-Disposition` e no nome do PDF.",
            example: "relatorio-vendas",
          },
          html: {
            type: "string",
            minLength: 1,
            maxLength: 2000000,
            description: "Documento HTML completo a ser renderizado.",
            example: "<html><body><h1>Relatorio de vendas</h1></body></html>",
          },
          templateId: {
            description:
              "Campo legado **nao suportado**. Enviar este campo resulta em erro 400 - o servico nao monta documentos.",
            deprecated: true,
          },
          data: {
            description:
              "Campo legado **nao suportado**. Enviar este campo resulta em erro 400 - o servico nao monta documentos.",
            deprecated: true,
          },
          options: {
            $ref: "#/components/schemas/PdfOptions",
          },
        },
        required: ["html"],
      },
      PdfOptions: {
        type: "object",
        additionalProperties: false,
        description:
          "Opcoes de renderizacao do PDF. Quando omitidas, os valores padrao sao aplicados.",
        properties: {
          format: {
            type: "string",
            enum: ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "Letter", "Legal", "Tabloid"],
            default: "A4",
            description: "Formato da pagina.",
            example: "A4",
          },
          landscape: {
            type: "boolean",
            default: false,
            description: "Orienta a pagina em modo paisagem.",
          },
          printBackground: {
            type: "boolean",
            default: true,
            description: "Imprime o background dos elementos.",
          },
          preferCSSPageSize: {
            type: "boolean",
            default: true,
            description: "Respeita `@page` declarado no CSS em vez do formato da opcao.",
          },
          displayHeaderFooter: {
            type: "boolean",
            default: false,
            description: "Exibe cabecalho e rodape padrao do Chromium.",
          },
          scale: {
            type: "number",
            minimum: 0.1,
            maximum: 2,
            description: "Escala da renderizacao.",
            example: 1,
          },
          waitUntil: {
            type: "string",
            enum: ["load", "domcontentloaded", "networkidle"],
            description: "Estrategia de espera do Playwright. O padrao do servico e configurado por `PDF_DEFAULT_WAIT_UNTIL` (`domcontentloaded`).",
            example: "domcontentloaded",
          },
          readySelector: {
            type: "string",
            minLength: 1,
            maxLength: 160,
            description: "Seletor CSS que indica que a pagina terminou de renderizar. O servico aguarda ate ele aparecer antes de gerar o PDF.",
            example: "#app-loaded",
          },
          readyTimeoutMs: {
            type: "integer",
            minimum: 100,
            maximum: 15000,
            description: "Tempo maximo de espera pelo `readySelector`, em milissegundos.",
            example: 3000,
          },
          timeoutMs: {
            type: "integer",
            minimum: 1000,
            maximum: 60000,
            default: 15000,
            description: "Tempo limite de renderizacao, em milissegundos.",
            example: 15000,
          },
          margin: {
            $ref: "#/components/schemas/Margin",
          },
        },
      },
      Margin: {
        type: "object",
        additionalProperties: false,
        description:
          "Margens da pagina. Cada valor aceita numero seguido opcionalmente de unidade: `mm`, `cm`, `in` ou `px` (ex.: `10mm`, `1in`, `20`).",
        properties: {
          top: {
            type: "string",
            pattern: "^\\d+(\\.\\d+)?(mm|cm|in|px)?$",
            description: "Margem superior.",
            example: "10mm",
          },
          right: {
            type: "string",
            pattern: "^\\d+(\\.\\d+)?(mm|cm|in|px)?$",
            description: "Margem direita.",
            example: "10mm",
          },
          bottom: {
            type: "string",
            pattern: "^\\d+(\\.\\d+)?(mm|cm|in|px)?$",
            description: "Margem inferior.",
            example: "10mm",
          },
          left: {
            type: "string",
            pattern: "^\\d+(\\.\\d+)?(mm|cm|in|px)?$",
            description: "Margem esquerda.",
            example: "10mm",
          },
        },
      },
      ErrorResponse: {
        type: "object",
        additionalProperties: false,
        properties: {
          message: {
            type: "string",
            description: "Mensagem legivel do erro.",
            example: "Token invalido.",
          },
          code: {
            type: "string",
            description:
              "Codigo opcional do estado de prontidao, presente em respostas 503 de geracao. Valores possiveis: `WARMING_UP`, `WARMUP_FAILED`, `DRAINING`.",
            example: "DRAINING",
          },
        },
        required: ["message"],
      },
      ValidationErrorResponse: {
        type: "object",
        additionalProperties: false,
        description: "Estrutura retornada quando o payload nao passa na validacao Zod.",
        properties: {
          message: {
            type: "string",
            description: "Sempre `Payload invalido.`.",
            example: "Payload invalido.",
          },
          errors: {
            type: "object",
            additionalProperties: false,
            description: "Resultado do flatten() do ZodError. `fieldErrors` mapeia cada campo raiz invalido para a lista de mensagens.",
            properties: {
              formErrors: {
                type: "array",
                description: "Erros nao vinculados a um campo especifico. Normalmente vazio.",
                items: { type: "string" },
                example: [],
              },
              fieldErrors: {
                type: "object",
                additionalProperties: {
                  type: "array",
                  items: { type: "string" },
                },
                description: "Erros agrupados por campo raiz do payload.",
                example: {
                  html: ["String must contain at least 1 character(s)"],
                  templateId: ["Campo legado 'templateId' nao e suportado."],
                },
              },
            },
            required: ["formErrors", "fieldErrors"],
          },
        },
        required: ["message", "errors"],
      },
      Readiness: {
        type: "object",
        additionalProperties: false,
        properties: {
          ready: {
            type: "boolean",
            description: "Se o servico esta pronto para receber `POST /pdf`.",
          },
          code: {
            type: "string",
            enum: ["READY", "WARMING_UP", "WARMUP_FAILED", "MISSING_TOKEN", "DRAINING"],
            description: "Codigo do estado de prontidao.",
            example: "READY",
          },
          message: {
            type: "string",
            description: "Mensagem legivel do estado de prontidao.",
            example: "Servico pronto para gerar PDFs.",
          },
        },
        required: ["ready", "code", "message"],
      },
      OperationalSnapshot: {
        type: "object",
        additionalProperties: false,
        description: "Estado operacional interno do servico.",
        properties: {
          phase: {
            type: "string",
            enum: ["starting", "ready", "degraded", "draining", "stopped"],
            description: "Fase do ciclo de vida do servico.",
          },
          warmupCompleted: {
            type: "boolean",
            description: "Se o warmup do browser ja terminou (com sucesso ou falha).",
          },
          warmupError: {
            type: ["string", "null"],
            description: "Mensagem do erro de warmup, quando houver.",
          },
          drainStartedAt: {
            type: ["string", "null"],
            format: "date-time",
            description: "Momento em que o shutdown gracioso comecou, quando houver.",
          },
          readiness: {
            $ref: "#/components/schemas/Readiness",
          },
        },
        required: ["phase", "warmupCompleted", "warmupError", "drainStartedAt", "readiness"],
      },
      QueueStats: {
        type: "object",
        additionalProperties: false,
        description: "Estatisticas da fila de renderizacao.",
        properties: {
          activeJobs: {
            type: "integer",
            description: "Renderizacoes em execucao no momento.",
          },
          pendingJobs: {
            type: "integer",
            description: "Requisicoes aguardando vaga na fila.",
          },
          maxConcurrentJobs: {
            type: "integer",
            description: "Quantidade maxima de PDFs gerados simultaneamente.",
          },
          maxPendingJobs: {
            type: "integer",
            description: "Tamanho maximo da fila de espera.",
          },
          acquireTimeoutMs: {
            type: "integer",
            description: "Tempo maximo de espera na fila, em milissegundos.",
          },
        },
        required: ["activeJobs", "pendingJobs", "maxConcurrentJobs", "maxPendingJobs", "acquireTimeoutMs"],
      },
      ImageCacheStats: {
        type: "object",
        additionalProperties: false,
        properties: {
          size: {
            type: "integer",
            description: "Imagens em cache no momento.",
          },
          maxEntries: {
            type: "integer",
            description: "Limite de entradas do cache.",
          },
          ttlMs: {
            type: "integer",
            description: "Tempo de vida das entradas, em milissegundos.",
          },
        },
        required: ["size", "maxEntries", "ttlMs"],
      },
      BrowserStats: {
        type: "object",
        additionalProperties: false,
        description: "Estatisticas do pool de sessoes do browser.",
        properties: {
          browserLaunched: {
            type: "boolean",
            description: "Se o browser esta iniciado.",
          },
          bufferedSessions: {
            type: "integer",
            description: "Sessoes aquecidas disponiveis.",
          },
          bufferedSessionsTarget: {
            type: "integer",
            description: "Alvo de sessoes aquecidas.",
          },
          pendingWarmups: {
            type: "integer",
            description: "Aquecimentos de sessao ainda em andamento.",
          },
          reuseSessionsEnabled: {
            type: "boolean",
            description: "Se a reutilizacao de sessoes esta ativa.",
          },
          reuseSessionMaxUses: {
            type: "integer",
            description: "Numero maximo de reutilizacoes por sessao.",
          },
          imageCache: {
            $ref: "#/components/schemas/ImageCacheStats",
          },
        },
        required: [
          "browserLaunched",
          "bufferedSessions",
          "bufferedSessionsTarget",
          "pendingWarmups",
          "reuseSessionsEnabled",
          "reuseSessionMaxUses",
          "imageCache",
        ],
      },
      LogLimits: {
        type: "object",
        additionalProperties: false,
        properties: {
          maxConcurrentJobs: {
            type: "integer",
            description: "Quantidade maxima de PDFs gerados simultaneamente.",
          },
          maxPendingJobs: {
            type: "integer",
            description: "Tamanho maximo da fila de espera.",
          },
          queueWaitTimeoutMs: {
            type: "integer",
            description: "Tempo maximo de espera na fila, em milissegundos.",
          },
        },
        required: ["maxConcurrentJobs", "maxPendingJobs", "queueWaitTimeoutMs"],
      },
      HealthResponse: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["ok", "degraded"],
            description: "`ok` quando `readiness.ready` e `true`; `degraded` caso contrario.",
          },
          timestamp: {
            type: "string",
            format: "date-time",
            description: "Momento em que o snapshot foi gerado.",
          },
          readiness: {
            $ref: "#/components/schemas/Readiness",
          },
          operational: {
            $ref: "#/components/schemas/OperationalSnapshot",
          },
          queue: {
            $ref: "#/components/schemas/QueueStats",
          },
          browser: {
            $ref: "#/components/schemas/BrowserStats",
          },
          limits: {
            $ref: "#/components/schemas/LogLimits",
          },
        },
        required: ["status", "timestamp"],
      },
      ReadyResponse: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["ok", "unavailable"],
            description: "`ok` quando pronto; `unavailable` quando nao.",
          },
          timestamp: {
            type: "string",
            format: "date-time",
          },
          readiness: {
            $ref: "#/components/schemas/Readiness",
          },
        },
        required: ["status", "timestamp", "readiness"],
      },
    },
  },
};