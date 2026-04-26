# D4Sign Provider Integration Plan

## Objetivo

Preparar a assinatura D4Sign sem depender de `tokenAPI`, `cryptKey`, safe UUID ou segredo real de webhook. A entrega atual deixa contrato, persistencia, HMAC local, simulacao, idempotencia, UI e smoke prontos, mas nao chama API real da D4Sign.

## Variaveis futuras

As variaveis abaixo ficam vazias em `.env.example` e devem ser preenchidas apenas em ambientes server-side quando a D4Sign liberar as credenciais:

- `DOCUMENT_SIGNATURE_PROVIDER`
- `DOCUMENT_SIGNATURE_PROVIDER_MODE`
- `D4SIGN_ENV`
- `D4SIGN_BASE_URL`
- `D4SIGN_TOKEN_API`
- `D4SIGN_CRYPT_KEY`
- `D4SIGN_WEBHOOK_SECRET`
- `D4SIGN_SAFE_UUID`
- `D4SIGN_WEBHOOK_URL`
- `D4SIGN_HMAC_STRATEGY`

Nenhuma dessas variaveis deve ser exposta ao browser.

## Modos

- `unconfigured`: `DOCUMENT_SIGNATURE_PROVIDER=d4sign` sem credenciais completas. O dispatch nao chama rede externa, grava `provider_config_missing`, mantem a solicitacao como pendente e nao marca verificacao como real.
- `simulated`: simulacao local sem rede externa. Gera `externalDocumentId` fake estavel, aceita webhooks D4Sign simulados com HMAC fake e grava hashes do evento.
- `real`: reservado para a proxima etapa. Mesmo com variaveis preenchidas, o adapter atual retorna `not_implemented` e nao chama a D4Sign ate existir contrato validado.

Adapters persistidos/esperados: `mock`, `d4sign_unconfigured`, `d4sign_simulated` e `d4sign_real`.

## Fluxo de Dispatch

1. API cria a solicitacao de assinatura pelo fluxo documental existente.
2. `document-signature-dispatch` resolve provider e modo.
3. `mock` preserva comportamento atual.
4. `d4sign/unconfigured` grava tentativa `skipped` com `provider_config_missing`, audita readiness e corrige a solicitacao para `pending`.
5. `d4sign/simulated` gera UUID fake estavel, grava dispatch `sent`, persiste `providerMode`, `externalDocumentId`, `externalEnvelopeId` e `providerPayloadHash`.
6. `d4sign/real` retorna `not_implemented` sem rede externa.

## Fluxo de Webhook

1. `document-signature-webhook` le o corpo cru antes de parsear JSON.
2. Para `provider=d4sign`, valida `Content-Hmac`.
3. Em `simulated`, usa segredo fake interno somente para smoke/teste.
4. Eventos validos sao normalizados para os status suportados pelo runtime: `signed`, `cancelled`, `declined`, `expired`, `viewed` ou `pending`.
5. A RPC idempotente existente consome o webhook por `eventId`; reenvios retornam `duplicate=true`.
6. O evento grava `rawEventHash`, `providerEventHash`, estrategia HMAC, resultado HMAC e `providerPayloadHash`.

## HMAC

A validacao aceita header `Content-Hmac` no formato `sha256=<hash>`, usa comparacao em tempo constante e suporta duas estrategias:

- `uuid`: HMAC calculado sobre o UUID externo do documento.
- `raw_body`: HMAC calculado sobre o corpo cru recebido.

A estrategia e parametrizada por `D4SIGN_HMAC_STRATEGY` ou pelo payload simulado. Isso preserva a duvida operacional atual: ha documentacao D4Sign indicando HMAC por UUID do documento e material de troubleshooting indicando validacao pelo corpo.

Em modo real, segredo ausente rejeita o webhook. Em modo simulated, o segredo fake interno existe apenas para teste/smoke.

## Idempotencia

- Dispatch usa chave estavel em D4Sign simulated: `adapter:signatureRequestId:documentId`.
- Webhook usa `eventId` e reaproveita a RPC idempotente `consume_document_signature_webhook`.
- Webhook duplicado retorna o snapshot ja consumido com `duplicate=true`.

## Campos Persistidos

A migration `0080_d4sign_provider_readiness.sql` adiciona campos de readiness em:

- `docs.signature_requests`: `provider_mode`, `external_document_id`, `external_envelope_id`, `verification_method`, `verification_status`, `verification_failure_reason`, `verified_at`, `provider_payload_hash`.
- `docs.signature_dispatch_attempts`: modo, ids externos, metodo/status de verificacao e hash de payload.
- `docs.signature_events`: `provider_event_hash`, `raw_event_hash`, estrategia/resultado HMAC e hash de payload.
- `docs.document_legal_evidence`: espelho seguro dos principais campos de readiness para o dossie.

A RPC `get_document_signature_provider_readiness` retorna somente campos operacionais seguros e nao expoe `storageObjectPath`.

## Verificacao Juridica

`verificationStatus=verified` so pode ocorrer em task futura com:

- credenciais reais D4Sign configuradas server-side;
- validacao oficial da assinatura/webhook/evidencia pela D4Sign;
- contrato fechado de HMAC;
- registro de artefatos finais e hashes com origem real.

No estado atual, D4Sign `unconfigured`, `simulated` e `real/not_implemented` ficam como `pending` ou erro operacional, nunca como `verified`.

## Pendencias D4Sign

- Receber `tokenAPI`, `cryptKey`, safe UUID e webhook secret.
- Confirmar base URL por ambiente e formato oficial de criação de documento/envelope.
- Confirmar payload real dos webhooks e nomes de eventos.
- Confirmar definitivamente a estrategia HMAC (`uuid` ou `raw_body`).
- Implementar adapter real com retries, timeouts, erros tipados e contrato de anexos.
- Habilitar verificacao criptografica/oficial e atualizar `verificationStatus` somente apos validacao real.
