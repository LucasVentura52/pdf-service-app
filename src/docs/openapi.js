/**
 * Especificacao OpenAPI 3.1 do PDF Service.
 *
 * Mantida manualmente, espelhando o contrato definido em
 * src/schemas/pdfRequestSchema.js e o comportamento das rotas em
 * src/routes/*.js. Ao alterar o contrato, atualizar este arquivo.
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
      "O servico **nao monta documentos**: endpoints `/pdf` e `/preview` nao aceitam `templateId` nem `data`. O contrato de requisicao e definido pelo schema `PdfRequest`.",
    ].join("\n"),
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
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Operacional"],
        summary: "Estado operacional do servico",
        description:
          "Retorna estado operacional do servico, fila, browser e limites configurados. Nao requer autenticacao.",
        responses: {
          200: {
            description: "Snapshot operacional do servico.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/ready": {
      get: {
        tags: ["Operacional"],
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
              },
            },
          },
          503: {
            description: "Servico ainda nao esta pronto.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReadyResponse" },
              },
            },
          },
        },
      },
    },
    "/pdf": {
      post: {
        tags: ["Geracao"],
        summary: "Gera um PDF a partir de HTML",
        description:
          "Gera um PDF a partir do HTML enviado e retorna o binario no corpo da resposta.",
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PdfRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "PDF gerado com sucesso.",
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
            },
            content: {
              "application/pdf": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          400: {
            description: "Payload invalido ou asset externo bloqueado pela politica de seguranca.",
            headers: {
              "Retry-After": {
                description: "Tempo sugerido em segundos antes de tentar novamente.",
                schema: { type: "integer", example: 5 },
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          503: {
            description:
              "Servico nao pronto, fila lotada, tempo limite da fila excedido ou browser indisponivel.",
            headers: {
              "Retry-After": {
                description: "Tempo sugerido em segundos antes de tentar novamente.",
                schema: { type: "integer", example: 5 },
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          500: {
            description: "Erro interno ao gerar o PDF.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/preview": {
      post: {
        tags: ["Geracao"],
        summary: "Gera um preview HTML renderizado",
        description:
          "Renderiza o HTML no Chromium e retorna um documento HTML com o preview pronto, incluindo marcadores visuais de quebra de pagina.",
        security: [{ apiKey: [] }, { bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PdfRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Preview HTML gerado com sucesso.",
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
            description: "Payload invalido ou asset externo bloqueado pela politica de seguranca.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          503: {
            description:
              "Servico nao pronto, fila lotada, tempo limite da fila excedido ou browser indisponivel.",
            headers: {
              "Retry-After": {
                description: "Tempo sugerido em segundos antes de tentar novamente.",
                schema: { type: "integer", example: 5 },
              },
            },
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          500: {
            description: "Erro interno ao gerar o preview.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
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
            description: "Nome base do arquivo gerado, sem extensao. Usado no header `Content-Disposition`.",
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
            description: "Campo legado nao suportado. Enviar este campo resulta em erro 400.",
            deprecated: true,
          },
          data: {
            description: "Campo legado nao suportado. Enviar este campo resulta em erro 400.",
            deprecated: true,
          },
          options: { $ref: "#/components/schemas/PdfOptions" },
        },
        required: ["html"],
      },
      PdfOptions: {
        type: "object",
        additionalProperties: false,
        properties: {
          format: {
            type: "string",
            enum: ["A0", "A1", "A2", "A3", "A4", "A5", "A6", "Letter", "Legal", "Tabloid"],
            default: "A4",
            description: "Formato da pagina.",
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
            description: "Estrategia de espera do Playwright.",
          },
          readySelector: {
            type: "string",
            minLength: 1,
            maxLength: 160,
            description: "Seletor CSS que indica que a pagina terminou de renderizar.",
          },
          readyTimeoutMs: {
            type: "integer",
            minimum: 100,
            maximum: 15000,
            description: "Tempo maximo de espera pelo `readySelector`.",
          },
          timeoutMs: {
            type: "integer",
            minimum: 1000,
            maximum: 60000,
            default: 15000,
            description: "Tempo limite de renderizacao.",
          },
          margin: { $ref: "#/components/schemas/Margin" },
        },
      },
      Margin: {
        type: "object",
        additionalProperties: false,
        properties: {
          top: {
            type: "string",
            description: "Margem superior. Unidades aceitas: `mm`, `cm`, `in`, `px` (opcional).",
            example: "10mm",
          },
          right: {
            type: "string",
            description: "Margem direita. Unidades aceitas: `mm`, `cm`, `in`, `px` (opcional).",
            example: "10mm",
          },
          bottom: {
            type: "string",
            description: "Margem inferior. Unidades aceitas: `mm`, `cm`, `in`, `px` (opcional).",
            example: "10mm",
          },
          left: {
            type: "string",
            description: "Margem esquerda. Unidades aceitas: `mm`, `cm`, `in`, `px` (opcional).",
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
            example: "Payload invalido.",
          },
          code: {
            type: "string",
            description: "Codigo opcional do estado de prontidao, presente em respostas 503 do probe/geracao.",
            example: "DRAINING",
          },
          errors: {
            type: "object",
            description: "Detalhes de validacao (presente apenas quando `message` e \"Payload invalido.\").",
            additionalProperties: true,
          },
        },
        required: ["message"],
      },
      HealthResponse: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["ok", "degraded"],
            description: "`ok` quando o servico esta pronto, `degraded` caso contrario.",
          },
          timestamp: {
            type: "string",
            format: "date-time",
            description: "Momento em que o snapshot foi gerado.",
          },
          readiness: {
            type: "object",
            additionalProperties: true,
            description: "Snapshot de prontidao do servico.",
          },
          operational: {
            type: "object",
            additionalProperties: true,
            description: "Estado operacional interno do servico.",
          },
          queue: {
            type: "object",
            additionalProperties: true,
            description: "Estatisticas da fila de renderizacao.",
          },
          browser: {
            type: "object",
            additionalProperties: true,
            description: "Estatisticas do pool de sessoes do browser.",
          },
          limits: {
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
                description: "Tempo maximo de espera na fila em milissegundos.",
              },
            },
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
            description: "`ok` quando pronto, `unavailable` quando nao.",
          },
          timestamp: {
            type: "string",
            format: "date-time",
          },
          readiness: {
            type: "object",
            additionalProperties: false,
            properties: {
              ready: {
                type: "boolean",
                description: "Se o servico esta pronto para receber `POST /pdf`.",
              },
              code: {
                type: "string",
                description: "Codigo do estado de prontidao. Ex.: `READY`, `WARMING_UP`, `MISSING_TOKEN`, `DRAINING`.",
              },
              message: {
                type: "string",
                description: "Mensagem legivel do estado de prontidao.",
              },
            },
            required: ["ready", "code", "message"],
          },
        },
        required: ["status", "timestamp", "readiness"],
      },
    },
  },
};