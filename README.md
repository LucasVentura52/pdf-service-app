# PDF Service API

API HTTP para geracao de PDF no backend com Node.js + Playwright.

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
- Dependencias instaladas com `npm install`
- Chromium do Playwright instalado com `npx playwright install chromium`

## Instalacao

```bash
cd /Users/diogomuneratto/pdf-service-app
npm install
npx playwright install chromium
```

## Variaveis de ambiente

Copie `.env.example` para `.env`.

```bash
cp .env.example .env
```

| Variavel | Obrigatoria | Descricao | Padrao |
|---|---|---|---|
| `PORT` | nao | Porta HTTP do servico | `3100` |
| `PDF_SERVICE_TOKEN` | recomendada | Token aceito no header `x-pdf-token` (suporta lista separada por virgula) | fallback interno `troque-este-token-em-producao` |
| `PDF_ALLOWED_ORIGINS` | sim em producao | Lista de origens CORS separadas por virgula | `*` |
| `PDF_PUBLIC_BASE_URL` | nao | Base para resolver assets relativos via `<base href=...>` | vazio |
| `PDF_RATE_LIMIT_MAX` | nao | Limite de requests por minuto em `POST /pdf` | `40` |
| `PDF_BODY_LIMIT` | nao | Limite do body JSON | `8mb` |

### Exemplo de producao (Render)

```bash
PORT=3100
PDF_SERVICE_TOKEN=seu-token-forte
PDF_ALLOWED_ORIGINS=https://sys.maisgerencia.com.br
PDF_PUBLIC_BASE_URL=https://sys.maisgerencia.com.br
PDF_RATE_LIMIT_MAX=40
PDF_BODY_LIMIT=8mb
```

## Execucao

Desenvolvimento (watch):

```bash
npm run dev
```

Producao:

```bash
npm start
```

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
    "waitUntil": "networkidle",
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
- `filename`: maximo 120 caracteres
- `templateId`: apenas `[a-zA-Z0-9_-]`, maximo 80 caracteres
- `html`: maximo de 6.000.000 caracteres
- `options.scale`: entre `0.1` e `2`
- `options.timeoutMs`: entre `1000` e `60000`

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
| `400` | Payload invalido | `{ "message": "Payload invalido.", "errors": ... }` |
| `401` | Token ausente/invalido | `{ "message": "Token invalido." }` |
| `429` | Rate limit excedido | resposta padrao do `express-rate-limit` |
| `500` | Falha interna na renderizacao | `{ "message": "Erro ao gerar PDF." }` |
| `503` | Sem token carregado no processo | `{ "message": "PDF_SERVICE_TOKEN nao configurado." }` |

## Seguranca

- Use token forte em producao
- Defina `PDF_ALLOWED_ORIGINS` com origens explicitas
- Mantenha rate limit habilitado
- Evite expor templates internos desnecessarios

## Integracao com frontend

No frontend, configure:

```bash
VITE_PDF_SERVICE_URL=https://pdf-service-app.onrender.com/pdf
VITE_PDF_SERVICE_TOKEN=seu-token-forte
```

`VITE_PDF_SERVICE_TOKEN` deve ser igual ao `PDF_SERVICE_TOKEN` aceito pela API.
