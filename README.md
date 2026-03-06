# PDF Service API

Serviço HTTP para geração de documentos PDF a partir de templates renderizados no backend.

## Visão Geral

O serviço recebe requisições com `templateId`, `data` e opções de renderização, processa o conteúdo no servidor e retorna o arquivo PDF no corpo da resposta.

O projeto utiliza dois caminhos de geração:

- renderização HTML com Chromium headless, via Playwright;
- renderização nativa para relatórios genéricos extensos, via PDFKit.

## Tecnologias

- Node.js 18+
- Express
- Playwright
- Mustache
- PDFKit
- Zod

## Requisitos

- Node.js 18 ou superior
- Dependências instaladas com `npm install`
- Chromium do Playwright instalado

## Instalação

```bash
npm install
npx playwright install chromium
```

## Execução

Desenvolvimento:

```bash
npm run dev
```

Produção:

```bash
npm start
```

Testes automatizados:

```bash
npm test
```

## Variáveis de Ambiente

Copiar `.env.example` para `.env` antes da execução:

```bash
cp .env.example .env
```

| Variável | Obrigatória | Descrição | Padrão |
|---|---|---|---|
| `PORT` | não | Porta HTTP do serviço | `3100` |
| `PDF_SERVICE_TOKEN` | sim, para uso da rota `/pdf` | Token aceito nos cabeçalhos `x-pdf-token` e `Authorization: Bearer` | sem padrão |
| `PDF_ALLOWED_ORIGINS` | recomendada | Lista de origens CORS separadas por vírgula | usa `PDF_PUBLIC_BASE_URL` quando vazio |
| `PDF_ALLOW_LOCALHOST_ORIGINS` | não | Libera origens locais comuns para desenvolvimento | `1` |
| `PDF_PUBLIC_BASE_URL` | recomendada | Base pública utilizada para resolução de assets relativos | vazio |
| `PDF_ALLOWED_ASSET_ORIGINS` | não | Lista de origens HTTP/HTTPS permitidas para assets externos durante a renderização | vazio |
| `PDF_BLOCK_PRIVATE_NETWORK` | não | Bloqueia acesso a `localhost` e redes privadas durante a renderização | `1` |
| `PDF_TRUST_PROXY` | recomendada em produção | Configuração de `trust proxy` do Express | `false` |
| `PDF_RATE_LIMIT_MAX` | não | Limite de requisições por minuto em `POST /pdf` | `40` |
| `PDF_BODY_LIMIT` | não | Limite do corpo JSON | `8mb` |
| `PDF_MAX_CONCURRENT_JOBS` | não | Quantidade máxima de PDFs gerados simultaneamente | `2` |
| `PDF_MAX_PENDING_JOBS` | não | Tamanho máximo da fila de espera | `50` |
| `PDF_PREWARMED_SESSIONS` | não | Quantidade base de sessões pré-aquecidas do navegador | `0` |
| `PDF_REUSE_SESSIONS` | não | Reutiliza sessões aquecidas com limpeza entre requisições | `0` |
| `PDF_REUSE_SESSION_MAX_USES` | não | Número máximo de reutilizações por sessão | `25` |
| `PDF_QUEUE_WAIT_TIMEOUT_MS` | não | Tempo máximo de espera na fila | `15000` |
| `PDF_LOG_PERFORMANCE` | não | Ativa o log de tempo por etapa | `0` |
| `PDF_LOG_ASSET_ORIGINS` | não | Registra as origens de assets utilizados durante a renderização | `0` |
| `PDF_DEFAULT_WAIT_UNTIL` | não | Estratégia padrão de espera do Playwright | `domcontentloaded` |
| `PDF_NETWORKIDLE_BUDGET_MS` | não | Limite da tentativa com `networkidle` antes do fallback | `1200` |
| `PDF_ASSET_WAIT_TIMEOUT_MS` | não | Janela curta para aguardar fontes e imagens | `600` |
| `PDF_CHROMIUM_CHANNEL` | não | Canal opcional do Chromium | vazio |
| `PDF_CHROMIUM_EXECUTABLE_PATH` | não | Caminho absoluto do executável do Chromium/Chrome | vazio |

### Exemplo de configuração

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
PDF_MAX_PENDING_JOBS=50
PDF_PREWARMED_SESSIONS=1
PDF_REUSE_SESSIONS=1
PDF_REUSE_SESSION_MAX_USES=25
PDF_QUEUE_WAIT_TIMEOUT_MS=15000
PDF_LOG_PERFORMANCE=0
PDF_LOG_ASSET_ORIGINS=0
PDF_DEFAULT_WAIT_UNTIL=domcontentloaded
PDF_NETWORKIDLE_BUDGET_MS=1200
PDF_ASSET_WAIT_TIMEOUT_MS=600
```

## Deploy

### Render

Configuração recomendada:

- Build Command: `npm install`
- Start Command: `npm start`

O script `postinstall` executa a instalação do Chromium com `PLAYWRIGHT_BROWSERS_PATH=0`, mantendo o navegador dentro do artefato da aplicação.

## Endpoints

### `GET /health`

Retorna o estado básico do serviço.

Exemplo de resposta:

```json
{
  "status": "ok",
  "timestamp": "2026-03-06T12:00:00.000Z",
  "queue": {
    "activeJobs": 0,
    "pendingJobs": 0,
    "maxConcurrentJobs": 2,
    "maxPendingJobs": 50,
    "acquireTimeoutMs": 15000
  },
  "browser": {
    "browserLaunched": true,
    "bufferedSessions": 2,
    "bufferedSessionsTarget": 2,
    "pendingWarmups": 0,
    "reuseSessionsEnabled": true,
    "reuseSessionMaxUses": 25
  },
  "templates": {
    "templateDir": "/caminho/absoluto/templates",
    "cachedTemplates": 11
  },
  "limits": {
    "maxConcurrentJobs": 2,
    "maxPendingJobs": 50,
    "queueWaitTimeoutMs": 15000
  }
}
```

### `POST /pdf`

Gera um arquivo PDF e retorna o binário no corpo da resposta.

#### Cabeçalhos

- `Content-Type: application/json`
- `x-pdf-token: <token>`

Alternativa:

- `Authorization: Bearer <token>`

#### Corpo da requisição

```json
{
  "filename": "contrato",
  "templateId": "contract",
  "data": {},
  "options": {
    "format": "A4",
    "landscape": false,
    "printBackground": true,
    "preferCSSPageSize": true,
    "displayHeaderFooter": false,
    "scale": 1,
    "waitUntil": "domcontentloaded",
    "readySelector": "#pdf-ready",
    "readyTimeoutMs": 1200,
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

#### Regras do contrato

- `templateId` é obrigatório;
- `filename` aceita até 120 caracteres;
- `templateId` aceita apenas caracteres alfanuméricos, `_` e `-`, com limite de 80 caracteres;
- `options.scale` aceita valores entre `0.1` e `2`;
- `options.timeoutMs` aceita valores entre `1000` e `60000`.

#### Comportamento de assets externos

- com `PDF_ALLOWED_ASSET_ORIGINS` preenchido, apenas assets HTTP/HTTPS dessa lista são carregados;
- a origem definida em `PDF_PUBLIC_BASE_URL` é incluída automaticamente na allowlist;
- com `PDF_ALLOWED_ASSET_ORIGINS` vazio, assets públicos continuam permitidos;
- acessos a `localhost` e redes privadas permanecem bloqueados quando `PDF_BLOCK_PRIVATE_NETWORK=1`.

#### Caminhos de renderização

- `report`: renderização nativa com PDFKit;
- `peopleReport`, `salesReport`, `commissionReport`, `movementReport`, `promissoryNote`, `receipt`, `vehicleChecklist`, `viewVehicle`, `vehicleExpenses`, `contract` e `richDocument`: renderização HTML com Playwright;
- o payload legado de relatório de pessoas em formato `plain-table` é resolvido automaticamente para `peopleReport`.

#### Observações sobre `options`

No renderer nativo do template `report`, as opções efetivamente aplicadas são:

- `format`
- `landscape`
- `margin`
- `scale`

As opções específicas de navegador não se aplicam ao renderer nativo:

- `waitUntil`
- `readySelector`
- `readyTimeoutMs`
- `timeoutMs`
- `printBackground`
- `preferCSSPageSize`
- `displayHeaderFooter`

Nos templates HTML, todas as opções acima permanecem disponíveis.

### Exemplo de requisição

```bash
curl -X POST http://localhost:3100/pdf \
  -H "Content-Type: application/json" \
  -H "x-pdf-token: seu-token-forte" \
  -d '{
    "filename": "contrato",
    "templateId": "contract",
    "data": {
      "title": "Contrato de Compra e Venda",
      "contractor": {
        "text": "Contratante...",
        "signatureLabel": "Assinatura do Contratante"
      },
      "contracted": {
        "text": "Contratado...",
        "signatureLabel": "Assinatura do Contratado"
      },
      "clauses": [
        {
          "title": "Cláusula 1",
          "text": "Texto da cláusula."
        }
      ]
    }
  }' \
  --output contrato.pdf
```

## Templates Disponíveis

Os templates HTML devem ser mantidos em `templates/<templateId>.html`.

Templates disponíveis:

- `commissionReport` → `templates/commissionReport.html`
- `contract` → `templates/contract.html`
- `movementReport` → `templates/movementReport.html`
- `peopleReport` → `templates/peopleReport.html`
- `promissoryNote` → `templates/promissoryNote.html`
- `receipt` → `templates/receipt.html`
- `report` → `src/services/nativeReportPdfService.js`
- `richDocument` → `templates/richDocument.html`
- `salesReport` → `templates/salesReport.html`
- `vehicleChecklist` → `templates/vehicleChecklist.html`
- `vehicleExpenses` → `templates/vehicleExpenses.html`
- `viewVehicle` → `templates/viewVehicle.html`

## Respostas e Erros

| HTTP | Situação | Resposta |
|---|---|---|
| `200` | PDF gerado com sucesso | binário PDF (`Content-Type: application/pdf`) |
| `400` | Payload inválido ou asset externo bloqueado | JSON com mensagem de erro |
| `401` | Token ausente ou inválido | JSON com mensagem de autenticação |
| `403` | Origem bloqueada pelo CORS | JSON com mensagem de origem não permitida |
| `404` | Template não encontrado | JSON com identificação do template |
| `429` | Limite de requisições excedido | resposta padrão do rate limit |
| `500` | Falha interna de geração | JSON com mensagem genérica |
| `503` | Serviço sem token configurado, fila esgotada, timeout de fila ou navegador indisponível | JSON com mensagem correspondente |

## Operação

### Recomendações de desempenho

- habilitar `PDF_PREWARMED_SESSIONS=1` em ambientes com carga recorrente;
- habilitar `PDF_REUSE_SESSIONS=1` quando houver margem de memória suficiente;
- manter `PDF_REUSE_SESSION_MAX_USES` ajustado para reciclagem periódica do contexto;
- utilizar `PDF_LOG_PERFORMANCE=1` durante análise de gargalos;
- utilizar `PDF_LOG_ASSET_ORIGINS=1` temporariamente para localizar dependências externas.

### Registro de performance

Quando `PDF_LOG_PERFORMANCE=1`, o serviço registra o tempo por etapa, por exemplo:

```txt
[pdf-service] relatorio-vendas: total=812ms | queue=0ms | html=4ms | session=0ms | render=214ms | normalize=18ms | pdf=559ms | close=17ms
```

### Estrutura do projeto

- `src/app.js`: composição da aplicação
- `src/routes/pdfRoute.js`: endpoint de geração
- `src/services/browserService.js`: integração com Playwright
- `src/services/nativeReportPdfService.js`: renderer nativo para `report`
- `src/services/templateService.js`: carregamento e renderização de templates
- `src/services/templatePayloads.js`: adaptação e saneamento de payloads
- `templates/`: templates HTML

## Integração com Frontend

O token do serviço não deve ser exposto em variáveis públicas nem em código de cliente.

Fluxo recomendado:

1. o frontend solicita a geração ao backend da aplicação;
2. o backend da aplicação chama esta API com o token de serviço;
3. o PDF é retornado ao frontend pela camada de backend responsável pela autenticação do sistema.
