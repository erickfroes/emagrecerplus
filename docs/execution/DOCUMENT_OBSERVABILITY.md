# Observabilidade documental

Este documento registra o contrato operacional de observabilidade para os fluxos documentais
da Etapa 9: broker de acesso, detalhe operacional, dossie juridico, pacote de evidencia e
assinatura.

## Correlation id

- Clientes podem enviar `x-correlation-id` nas rotas documentais da API Nest.
- O valor aceito e um UUID. Quando ausente ou invalido, a API gera um UUID novo.
- A API propaga o mesmo id para Edge Functions documentais via header `x-correlation-id`.
- Edge Functions tambem aceitam `correlationId` no corpo para chamadas internas ou testes.
- Eventos e auditorias que recebem metadata gravam `correlationId` em `payload`/`metadata`.
- A migration `0081_document_observability.sql` preenche `audit.audit_events.request_id`
  a partir de `payload.correlationId` ou `payload.correlation_id` quando o valor for UUID.

## Logs estruturados

Todos os logs documentais usam JSON com `type=document_operational_event`.

Campos comuns:

- `component`: `api` ou `edge`
- `observedAt`: timestamp ISO do log
- `correlationId`: UUID da operacao
- `event`: nome operacional do evento
- `operation`: rota, acao ou Edge Function
- `tenantId` / `legacyTenantId`: quando disponivel
- `unitId`: quando disponivel
- `documentId`: identificador publico/runtime conforme o fluxo
- `provider` / `providerMode`: quando o fluxo envolve assinatura
- `durationMs`: duracao medida na API quando aplicavel
- `errorMessage`: mensagem sanitizada, sem URL assinada nem storage path

Eventos principais:

- `document.broker_list_completed`
- `document.detail_loaded`
- `document.evidence_consolidated`
- `document.evidence_package_requested`
- `document.evidence_package_generated`
- `document.evidence_package_failed`
- `document.evidence_package_signed_url_granted`
- `document.signed_url_granted`
- `document.signature_dispatch_requested`
- `document.signature_dispatch_completed`
- `document.signature_provider_config_missing`
- `document.signature_d4sign_simulated_dispatched`
- `document.signature_webhook_hmac_invalid`
- `document.signature_webhook_duplicate`
- `document.signature_webhook_processed`

## Dados sensiveis

Nao devem ser logados:

- `storageObjectPath` ou `storage_object_path`
- URLs assinadas completas
- `Authorization`, `apikey`, `service_role`
- `tokenAPI`, `cryptKey`, webhook secret ou qualquer secret D4Sign
- payload bruto de webhook externo

Os logs usam sanitizacao defensiva de chaves sensiveis e tambem redigem URLs e paths no formato
`tenant/...` quando aparecem em mensagens de erro.

## Auditoria e eventos persistidos

Os fluxos abaixo incluem `correlationId` nas metadata/payloads persistidos:

- broker de acesso a documento (`record_patient_document_access_event`)
- geracao e acesso do pacote de evidencia
- dispatch de assinatura
- provider readiness D4Sign simulated/unconfigured
- consumo de webhook de assinatura

Com a migration `0081`, auditorias que recebem esse payload passam a preencher tambem
`audit.audit_events.request_id`, mantendo busca operacional por correlation id sem expor
detalhes internos de storage.

## Observabilidade D4Sign pre-real

O modo `d4sign_unconfigured` registra `provider_config_missing` e nao chama rede externa.
O modo `d4sign_simulated` registra dispatch simulado, webhook com HMAC fake, webhook duplicado
idempotente e HMAC invalido. Nenhum desses modos marca verificacao como `verified`.

## Validacao

Checks esperados para alteracoes deste contrato:

- `git diff --check`
- `npm run typecheck`
- `npm run api:typecheck`
- `npm run api:build`
- `npm run build`
- `npm run api:smoke:local`
- `npm run api:smoke:real`, quando os secrets Supabase reais estiverem disponiveis
