# PDF Service API

Microservico HTTP para gerar PDF a partir de HTML pronto enviado pela aplicacao principal.

## Visao Geral

O servico recebe `html` completo, renderiza o documento em Chromium headless via Playwright e retorna o PDF no corpo da resposta.

O microservico nao monta documentos. Ele nao usa `templateId`, `data`, templates internos ou Mustache.

## Tecnologias

- Node.js 18+
- Express
- Playwright
- Zod
- Swagger UI (OpenAPI 3.1)

## Requisitos

- Node.js 18 ou superior
- Dependencias instaladas com `npm install`
- Chromium do Playwright instalado

## Instalacao

```bash
npm install
npx playwright install chromium
```

## Execucao

Desenvolvimento:

```bash
npm run dev
```

Producao:

```bash
npm start
```

Testes:

```bash
npm test
```

## Variaveis de Ambiente

Mantenha apenas `.env.example` no projeto. Use esse arquivo como referencia para configurar o ambiente de execucao.

| Variavel | Obrigatoria | Descricao | Padrao |
|---|---|---|---|
| `PORT` | nao | Porta HTTP do servico | `3100` |
| `PDF_SERVICE_TOKEN` | sim, para uso da rota `/pdf` | Token aceito nos cabecalhos `x-pdf-token` e `Authorization: Bearer` | sem padrao |
| `PDF_ALLOWED_ORIGINS` | recomendada | Lista de origens CORS separadas por virgula | usa `PDF_PUBLIC_BASE_URL` quando vazio |
| `PDF_ALLOW_LOCALHOST_ORIGINS` | nao | Libera origens locais comuns para desenvolvimento | `1` |
| `PDF_PUBLIC_BASE_URL` | recomendada | Base publica usada para resolver assets relativos do HTML | vazio |
| `PDF_ALLOWED_ASSET_ORIGINS` | nao | Lista de origens HTTP/HTTPS permitidas para assets externos durante a renderizacao | vazio |
| `PDF_BLOCK_PRIVATE_NETWORK` | nao | Bloqueia acesso a `localhost` e redes privadas durante a renderizacao | `1` |
| `PDF_TRUST_PROXY` | recomendada em producao | Configuracao de `trust proxy` do Express | `false` |
| `PDF_RATE_LIMIT_MAX` | nao | Limite de requisicoes por minuto em `POST /pdf` | `40` |
| `PDF_BODY_LIMIT` | nao | Limite do corpo JSON | `8mb` |
| `PDF_MAX_CONCURRENT_JOBS` | nao | Quantidade maxima de PDFs gerados simultaneamente | `2` |
| `PDF_MAX_PENDING_JOBS` | nao | Tamanho maximo da fila de espera | `20` |
| `PDF_PREWARMED_SESSIONS` | nao | Quantidade base de sessoes pre-aquecidas do navegador | `1` |
| `PDF_REUSE_SESSIONS` | nao | Reutiliza sessoes aquecidas com limpeza entre requisicoes | `1` |
| `PDF_REUSE_SESSION_MAX_USES` | nao | Numero maximo de reutilizacoes por sessao | `25` |
| `PDF_QUEUE_WAIT_TIMEOUT_MS` | nao | Tempo maximo de espera na fila | `10000` |
| `PDF_LOG_PERFORMANCE` | nao | Ativa log de tempo por etapa | `0` |
| `PDF_LOG_ASSET_ORIGINS` | nao | Registra as origens de assets usados durante a renderizacao | `0` |
| `PDF_DEFAULT_WAIT_UNTIL` | nao | Estrategia padrao de espera do Playwright | `domcontentloaded` |
| `PDF_NETWORKIDLE_BUDGET_MS` | nao | Limite da tentativa com `networkidle` antes do fallback | `800` |
| `PDF_ASSET_WAIT_TIMEOUT_MS` | nao | Janela curta para aguardar fontes e imagens | `400` |
| `PDF_SHUTDOWN_GRACE_PERIOD_MS` | nao | Tempo maximo para shutdown gracioso | `30000` |
| `PDF_CHROMIUM_CHANNEL` | nao | Canal opcional do Chromium | vazio |
| `PDF_CHROMIUM_EXECUTABLE_PATH` | nao | Caminho absoluto do executavel do Chromium/Chrome | vazio |

### Exemplo `.env.example`

```env
PORT=3100
PDF_SERVICE_TOKEN=troque-por-um-token-forte
PDF_ALLOWED_ORIGINS=https://sys.maisgerencia.com.br,http://localhost:5173,http://localhost:5174
PDF_PUBLIC_BASE_URL=https://sys.maisgerencia.com.br
PDF_ALLOW_LOCALHOST_ORIGINS=1
PDF_ALLOWED_ASSET_ORIGINS=https://sys.maisgerencia.com.br,https://api.maisgerencia.com.br,https://maisgerenciauto.com.br
PDF_BLOCK_PRIVATE_NETWORK=1
PDF_TRUST_PROXY=1
PDF_RATE_LIMIT_MAX=40
PDF_BODY_LIMIT=8mb
PDF_MAX_CONCURRENT_JOBS=2
PDF_MAX_PENDING_JOBS=20
PDF_PREWARMED_SESSIONS=1
PDF_REUSE_SESSIONS=1
PDF_REUSE_SESSION_MAX_USES=25
PDF_QUEUE_WAIT_TIMEOUT_MS=10000
PDF_LOG_PERFORMANCE=0
PDF_LOG_ASSET_ORIGINS=0
PDF_DEFAULT_WAIT_UNTIL=domcontentloaded
PDF_NETWORKIDLE_BUDGET_MS=800
PDF_ASSET_WAIT_TIMEOUT_MS=400
PDF_SHUTDOWN_GRACE_PERIOD_MS=30000
```

### Perfil recomendado

Para manter o servico simples, com boa performance e sem excesso de consumo de memoria:

- use `PDF_MAX_CONCURRENT_JOBS=2`
- mantenha `PDF_REUSE_SESSIONS=1`
- use `PDF_PREWARMED_SESSIONS=1`
- prefira `PDF_DEFAULT_WAIT_UNTIL=domcontentloaded`
- deixe `PDF_ASSET_WAIT_TIMEOUT_MS` baixo
- escale com mais replicas antes de aumentar muito a concorrencia por instancia

## Endpoints

### `GET /docs`

Documentacao padrao da API (Swagger UI). Publica, acessivel sem token.

- interface interativa para explorar e testar os endpoints
- assets locais (sem CDN), CSP aplicado apenas a essa sub-arvore

### `GET /docs.json`

Spec OpenAPI 3.1 em JSON, para ferramentas externas (Postman, Insomnia, geradores de client).

### `GET /health`

Retorna estado operacional do servico, fila, browser e limites configurados.

### `GET /ready`

Probe de prontidao.

- responde `200` quando o servico esta pronto para aceitar `POST /pdf`
- responde `503` durante startup, ausencia de token, falha de warmup ou draining

### `POST /pdf`

Gera um PDF a partir do HTML enviado e retorna o binario no corpo da resposta.

#### Cabecalhos

- `Content-Type: application/json`
- `x-pdf-token: <token>`

Alternativa:

- `Authorization: Bearer <token>`

#### Payload

```json
{
  "filename": "relatorio-vendas",
  "html": "<html><body><h1>Relatorio de vendas</h1></body></html>",
  "options": {
    "format": "A4",
    "landscape": false,
    "printBackground": true
  }
}
```

#### Exemplo `curl`

```bash
curl -X POST http://localhost:3100/pdf \
  -H 'Content-Type: application/json' \
  -H 'x-pdf-token: troque-por-um-token-forte' \
  -d '{
    "filename": "relatorio-vendas",
    "html": "<html><body><h1>Relatorio de vendas</h1><p>Periodo atual.</p></body></html>",
    "options": {
      "format": "A4",
      "landscape": false,
      "printBackground": true
    }
  }'
```

#### Regras do contrato

- `html` e obrigatorio
- `filename` aceita ate 120 caracteres
- `templateId` nao e suportado
- `data` nao e suportado
- `options.scale` aceita valores entre `0.1` e `2`
- `options.timeoutMs` aceita valores entre `1000` e `60000`

#### Headers da resposta

- `Content-Type: application/pdf`
- `Content-Disposition: inline; filename="<filename>.pdf"`
- `Content-Length: <bytes>`

#### Comportamento de assets externos

- com `PDF_ALLOWED_ASSET_ORIGINS` preenchido, apenas assets HTTP/HTTPS dessa lista sao carregados
- a origem definida em `PDF_PUBLIC_BASE_URL` e incluida automaticamente na allowlist
- com `PDF_ALLOWED_ASSET_ORIGINS` vazio, assets publicos continuam permitidos
- acessos a `localhost` e redes privadas permanecem bloqueados quando `PDF_BLOCK_PRIVATE_NETWORK=1`
