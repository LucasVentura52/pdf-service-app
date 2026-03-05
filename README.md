# PDF Service (Node + Playwright)

Servico isolado para gerar PDF no backend, sem usar `window.print`.

## 1) Instalar

```bash
cd /Users/diogomuneratto/pdf-service-app
npm install
npx playwright install chromium
```

## 2) Configurar ambiente

Copie `.env.example` para `.env` e ajuste:

- `PORT`: porta do servico
- `PDF_SERVICE_TOKEN`: token simples exigido no endpoint
- `PDF_ALLOWED_ORIGINS`: origens permitidas (CORS)
- `PDF_PUBLIC_BASE_URL`: base para resolver assets relativos (logos/CSS)
- `PDF_RATE_LIMIT_MAX`: limite por minuto no endpoint `/pdf`
- `PDF_BODY_LIMIT`: limite de payload JSON (ex: `8mb`)

## 3) Rodar

```bash
npm run dev
```

Healthcheck:

```bash
GET http://localhost:3100/health
```

## Endpoint principal

`POST /pdf`

Headers:

- `Content-Type: application/json`
- `x-pdf-token: <PDF_SERVICE_TOKEN>` (ou `Authorization: Bearer <token>`)

Payload (opcao A: HTML direto):

```json
{
  "filename": "relatorio-vendas",
  "html": "<html>...</html>",
  "options": {
    "format": "A4",
    "landscape": false,
    "printBackground": true,
    "preferCSSPageSize": true,
    "margin": { "top": "10mm", "right": "10mm", "bottom": "10mm", "left": "10mm" }
  }
}
```

Payload (opcao B: template + dados):

```json
{
  "filename": "contrato",
  "templateId": "contract",
  "data": {
    "title": "Contrato de Compra e Venda",
    "contractor": {
      "text": "Nome do contratante...",
      "signatureLabel": "Assinatura do Contratante"
    },
    "contracted": {
      "text": "Nome do contratado...",
      "signatureLabel": "Assinatura do Contratado"
    },
    "clauses": [
      { "title": "Clausula 1", "text": "Texto da clausula..." }
    ]
  }
}
```

Resposta:

- `200` com `Content-Type: application/pdf`
- `400` payload invalido
- `401` token invalido
- `429` rate limit
- `500` erro interno na geracao
