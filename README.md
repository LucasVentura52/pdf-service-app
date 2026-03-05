# PDF Service API

API HTTP para geração de PDF no backend com Node.js + Playwright.

## Objetivo

- Receber HTML bruto ou `templateId` + `data`
- Renderizar no Chromium headless
- Retornar `application/pdf`

## Stack

- Node.js (ESM)
- Express
- Playwright (Chromium)
- Mustache (templates)
- Zod (validacao)

## Requisitos

- Node.js 18+
- Dependências instaladas com `npm install`
- Chromium do Playwright instalado com `npx playwright install chromium`

## Instalação

```bash
cd (diretório do projeto)
npm install
npx playwright install chromium
```

## Variaveis de ambiente

Copie `.env.example` para `.env`.

```bash
cp .env.example .env
```

| Variável | Obrigatória | Descrição | Padrão |
|---|---|---|---|
| `PORT` | não | Porta HTTP do servico | `3100` |
| `PDF_SERVICE_TOKEN` | recomendada | Token aceito no header `x-pdf-token` (suporta lista separada por vírgula) | sem padrão (`/pdf` retorna `503` se ausente) |
| `PDF_ALLOWED_ORIGINS` | recomendada | Lista de origens CORS separadas por vírgula (`*` não é aceito) | usa `PDF_PUBLIC_BASE_URL` quando vazio; sem ambos, bloqueia requests com `Origin` |
| `PDF_PUBLIC_BASE_URL` | não | Base para resolver assets relativos via `<base href=...>` | vazio |
| `PDF_ALLOWED_ASSET_ORIGINS` | recomendada | Lista de origens HTTP/HTTPS permitidas para assets externos (imagens/fontes/css) durante a renderização | usa origem de `PDF_PUBLIC_BASE_URL` quando definida |
| `PDF_BLOCK_PRIVATE_NETWORK` | não | Quando `1`, bloqueia tentativas de acessar hosts privados/localhost durante a renderização | `1` |
| `PDF_TRUST_PROXY` | recomendada em produção | Configuração de `trust proxy` do Express para rate limit/IP real (ex.: `1` na Render) | `false` |
| `PDF_RATE_LIMIT_MAX` | não | Limite de requests por minuto em `POST /pdf` | `40` |
| `PDF_BODY_LIMIT` | não | Limite do body JSON | `8mb` |
| `PDF_MAX_CONCURRENT_JOBS` | não | Quantidade máxima de PDFs gerados ao mesmo tempo no processo | `2` |
| `PDF_MAX_PENDING_JOBS` | não | Tamanho máximo da fila de espera quando todos os workers estão ocupados | `50` |
| `PDF_QUEUE_WAIT_TIMEOUT_MS` | não | Tempo máximo que uma requisição pode aguardar na fila antes de falhar | `15000` |
| `PDF_LOG_PERFORMANCE` | não | Quando `1`, registra tempo total de cada geração no log | `0` |
| `PDF_DEFAULT_WAIT_UNTIL` | não | Estratégia padrão de render (`load`, `domcontentloaded`, `networkidle`) quando o payload não define `options.waitUntil` | `domcontentloaded` |
| `PDF_NETWORKIDLE_BUDGET_MS` | não | Tempo máximo para a tentativa inicial com `networkidle` antes de fallback para `domcontentloaded` | `1200` |
| `PDF_ASSET_WAIT_TIMEOUT_MS` | não | Janela curta para aguardar fontes/imagens após `domcontentloaded` | `600` |
| `PDF_CHROMIUM_CHANNEL` | não | Channel opcional para launch do Chromium (ex.: `chrome`) | vazio |
| `PDF_CHROMIUM_EXECUTABLE_PATH` | não | Caminho absoluto para binario Chromium/Chrome | vazio |

### Exemplo de produção (Render)

```bash
PORT=3100
PDF_SERVICE_TOKEN=seu-token-forte
PDF_ALLOWED_ORIGINS=https://sys.maisgerencia.com.br
PDF_PUBLIC_BASE_URL=https://sys.maisgerencia.com.br
PDF_ALLOWED_ASSET_ORIGINS=https://sys.maisgerencia.com.br
PDF_BLOCK_PRIVATE_NETWORK=1
PDF_TRUST_PROXY=1
PDF_RATE_LIMIT_MAX=40
PDF_BODY_LIMIT=8mb
PDF_MAX_CONCURRENT_JOBS=2
PDF_MAX_PENDING_JOBS=50
PDF_QUEUE_WAIT_TIMEOUT_MS=15000
PDF_LOG_PERFORMANCE=0
PDF_DEFAULT_WAIT_UNTIL=domcontentloaded
PDF_NETWORKIDLE_BUDGET_MS=1200
PDF_ASSET_WAIT_TIMEOUT_MS=600
```

## Execução

Desenvolvimento (watch):

```bash
npm run dev
```

produção:

```bash
npm start
```

testes automatizados:

```bash
npm test
```

### Deploy na Render

Configuração recomendada:

- Build Command: `npm install`
- Start Command: `npm start`

O `postinstall` do projeto ja executa `playwright install chromium` com `PLAYWRIGHT_BROWSERS_PATH=0`, garantindo que o browser fique dentro do artefato da aplicacao.

## Endpoints

### `GET /health`

Healthcheck simples.

Resposta esperada (`200`):

```json
{
  "status": "ok",
  "timestamp": "2026-03-05T12:00:00.000Z"
}
```

### `POST /pdf`

Gera PDF e retorna o binario no corpo da resposta.

#### Headers

- `Content-Type: application/json`
- `x-pdf-token: <token>`
- Alternativa: `Authorization: Bearer <token>`

#### Body (schema)

```json
{
  "filename": "opcional",
  "html": "opcional",
  "templateId": "opcional",
  "data": {},
  "options": {
    "format": "A4",
    "landscape": false,
    "printBackground": true,
    "preferCSSPageSize": true,
    "displayHeaderFooter": false,
    "scale": 1,
    "waitUntil": "domcontentloaded",
    "readySelector": "#pdf-ready[data-ready='1']",
    "readyTimeoutMs": 1400,
    "timeoutMs": 15000,
    "margin": {
      "top": "10mm",
      "right": "10mm",
      "bottom": "10mm",
      "left": "10mm"
    }
  }
}
```

Regras importantes:

- Informe `html` **ou** `templateId`
- Não envie `html` e `templateId` juntos no mesmo payload
- `filename`: maximo 120 caracteres
- `templateId`: apenas `[a-zA-Z0-9_-]`, maximo 80 caracteres
- `html`: maximo de 6.000.000 caracteres
- `options.scale`: entre `0.1` e `2`
- `options.timeoutMs`: entre `1000` e `60000`
- assets HTTP/HTTPS externos so carregam se a origem estiver em `PDF_ALLOWED_ASSET_ORIGINS` (ou `PDF_PUBLIC_BASE_URL`)

#### Exemplo A: HTML direto

```bash
curl -X POST http://localhost:3100/pdf \
  -H "Content-Type: application/json" \
  -H "x-pdf-token: seu-token-forte" \
  -d '{
    "filename": "relatorio-vendas",
    "html": "<html><body><h1>Relatorio</h1></body></html>",
    "options": { "format": "A4", "printBackground": true }
  }' \
  --output relatorio-vendas.pdf
```

#### Exemplo B: template + dados

```bash
curl -X POST http://localhost:3100/pdf \
  -H "Content-Type: application/json" \
  -H "x-pdf-token: seu-token-forte" \
  -d '{
    "filename": "contrato",
    "templateId": "contract",
    "data": {
      "title": "Contrato de Compra e Venda",
      "contractor": { "text": "Contratante...", "signatureLabel": "Assinatura Contratante" },
      "contracted": { "text": "Contratado...", "signatureLabel": "Assinatura Contratado" },
      "clauses": [
        { "title": "Clausula 1", "text": "Texto..." }
      ]
    }
  }' \
  --output contrato.pdf
```

## Templates disponiveis

Os templates devem ficar em `templates/<templateId>.html`.

Templates atuais:

- `contract` -> `templates/contract.html`
- `report` -> `templates/report.html`
- `viewVehicle` -> `templates/viewVehicle.html`
- `vehicleExpenses` -> `templates/vehicleExpenses.html`

## Respostas e erros

| HTTP | Quando ocorre | Body |
|---|---|---|
| `200` | PDF gerado com sucesso | binario PDF (`Content-Type: application/pdf`) |
| `400` | Payload invalido ou asset externo nao permitido | `{ "message": "Payload invalido.", "errors": ... }` |
| `401` | Token ausente/invalido | `{ "message": "Token invalido." }` |
| `403` | Origem bloqueada pelo CORS | `{ "message": "Origem nao permitida pelo PDF service." }` |
| `404` | `templateId` não encontrado | `{ "message": "Template '<id>' nao encontrado." }` |
| `429` | Rate limit excedido | resposta padrao do `express-rate-limit` |
| `500` | Falha interna na renderizacao | `{ "message": "Erro ao gerar PDF." }` |
| `503` | Token não configurado, browser do Playwright indisponivel ou fila de geração saturada/expirada | `{ "message": "PDF_SERVICE_TOKEN nao configurado." }` / `{ "message": "Playwright browser nao instalado no ambiente..." }` / `{ "message": "Fila de geração lotada..." }` / `{ "message": "Tempo limite na fila..." }` |

## Integraçao com frontend

Nao exponha `PDF_SERVICE_TOKEN` em variáveis `VITE_*` ou em código cliente.

Fluxo recomendado:

- frontend chama seu backend;
- backend chama este serviço de PDF com `x-pdf-token`;
- token fica somente no servidor.
