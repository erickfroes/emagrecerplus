# D4Sign Real Activation Runbook

## Objetivo

Ativar a D4Sign em modo real quando as credenciais oficiais forem liberadas, sem alterar o contrato de seguranca ja preparado no EmagrecePlus.

Este runbook assume que a base D4Sign-ready ja existe: modos `mock`, `d4sign_unconfigured`, `d4sign_simulated` e `d4sign_real` stub, migration `0080_d4sign_provider_readiness.sql`, HMAC local parametrizavel, idempotencia de webhook, dossie juridico e pacote de evidencia.

## Credenciais Necessarias

Configurar somente em ambientes server-side:

- `DOCUMENT_SIGNATURE_PROVIDER=d4sign`
- `DOCUMENT_SIGNATURE_PROVIDER_MODE=real`
- `D4SIGN_ENV`
- `D4SIGN_BASE_URL`
- `D4SIGN_TOKEN_API`
- `D4SIGN_CRYPT_KEY`
- `D4SIGN_WEBHOOK_SECRET`
- `D4SIGN_SAFE_UUID`
- `D4SIGN_WEBHOOK_URL`
- `D4SIGN_HMAC_STRATEGY`

Valores esperados antes do go-live:

- `D4SIGN_ENV`: `sandbox` ou `production`, conforme ambiente.
- `D4SIGN_BASE_URL`: URL oficial da API D4Sign para o ambiente.
- `D4SIGN_TOKEN_API`: token oficial do ambiente.
- `D4SIGN_CRYPT_KEY`: chave oficial do ambiente.
- `D4SIGN_WEBHOOK_SECRET`: segredo usado para validar `Content-Hmac`.
- `D4SIGN_SAFE_UUID`: cofre/safe onde os documentos serao criados.
- `D4SIGN_WEBHOOK_URL`: URL publica HTTPS da Edge Function `document-signature-webhook`.
- `D4SIGN_HMAC_STRATEGY`: `uuid` ou `raw_body`, somente depois de confirmacao oficial da D4Sign.

Nunca preencher credenciais reais em `.env.example`, commits, issues, screenshots, logs ou payloads de teste.

## Onde Configurar

### Local

- Usar `.env` local nao commitado.
- Validar que `.env`, `.env.*`, `.vercel/`, `supabase/config.toml`, `supabase/.gitignore` e `supabase/.temp/` nao entram no diff.
- Manter `DOCUMENT_SIGNATURE_PROVIDER_MODE=simulated` para desenvolvimento comum; usar `real` local somente para teste controlado com credenciais sandbox.

### Supabase Secrets

- Configurar as variaveis D4Sign como secrets das Edge Functions.
- Confirmar que as Edge Functions leem secrets somente server-side.
- Reimplantar `document-signature-dispatch` e `document-signature-webhook` depois da configuracao.
- Recarregar schema cache apenas se houver nova migration em task futura.

### Staging

- Ativar primeiro em staging com `D4SIGN_ENV=sandbox`.
- Usar signatarios de teste controlados.
- Rodar todo o checklist de sandbox antes de qualquer teste em producao.
- Registrar evidencias dos testes sem expor tokens, chaves ou segredos.

### Producao

- Ativar somente apos sandbox aprovado.
- Usar `D4SIGN_ENV=production`, base URL de producao, safe UUID de producao e webhook secret de producao.
- Aplicar rotacao de secrets conforme politica operacional.
- Monitorar primeira janela de uso com logs sem dados sensiveis e metricas de erro do provider.

## Validacao Sandbox

Executar a validacao em staging antes de qualquer producao.

### Preflight

- Confirmar que `api:smoke:real` passa sem depender de chaves reais.
- Confirmar que `DOCUMENT_SIGNATURE_PROVIDER=d4sign` e `DOCUMENT_SIGNATURE_PROVIDER_MODE=real` estao configurados apenas no ambiente-alvo.
- Confirmar que o adapter real ainda nao promove `verificationStatus=verified` sem consulta oficial.
- Confirmar que o webhook publico usa HTTPS e aponta para `D4SIGN_WEBHOOK_URL`.
- Confirmar que nenhum segredo aparece em logs de Edge Function, API, frontend ou observabilidade.

### Dispatch de Documento

1. Criar ou selecionar documento elegivel para assinatura.
2. Solicitar assinatura pelo fluxo administrativo existente.
3. Validar que o dispatch chama somente a API oficial D4Sign do ambiente sandbox.
4. Confirmar persistencia de `provider=d4sign`, `providerMode=real`, `externalDocumentId`, `externalEnvelopeId` quando houver, e `providerPayloadHash`.
5. Confirmar que erro de provider fica auditado sem mascarar falha real.

### Signatario de Teste

- Usar e-mail/telefone de signatario sandbox.
- Confirmar que o convite chegou pelo canal esperado.
- Validar que dados minimos do paciente/profissional estao corretos e sem excesso de informacao sensivel.
- Confirmar que nenhum `storageObjectPath` aparece no frontend ou no payload publico.

### Webhook HMAC Valido

- Receber evento real da D4Sign sandbox.
- Validar `Content-Hmac` com `D4SIGN_WEBHOOK_SECRET`.
- Confirmar a estrategia oficial configurada em `D4SIGN_HMAC_STRATEGY`.
- Persistir `rawEventHash`, `providerEventHash`, `providerPayloadHash`, `hmacStrategy` e `hmacValid=true`.
- Rejeitar qualquer evento com header ausente, segredo ausente ou hash divergente.

### Webhook Duplicado

- Reenviar o mesmo evento sandbox.
- Confirmar resposta idempotente, sem criar efeitos duplicados.
- Confirmar que o evento original permanece preservado.
- Confirmar que dossie e pacote nao sao corrompidos por replay.

### Evento Assinado ou Finalizado

- Completar assinatura no ambiente sandbox.
- Confirmar mapeamento correto para status interno.
- Confirmar timestamps de assinatura/finalizacao.
- Confirmar signatarios e status individuais.
- Confirmar que status parcial nao vira status final indevidamente.

### Consulta Oficial de Status

- Consultar a API oficial D4Sign usando `externalDocumentId` ou identificador oficial confirmado.
- Comparar status oficial com evento recebido por webhook.
- Registrar hash do payload oficial consultado.
- Tratar divergencia como pendencia operacional, sem marcar `verified`.

### Dossie Juridico Atualizado

- Acessar `GET /documents/:id/evidence`.
- Confirmar provider, modo, IDs externos, status de assinatura, signatarios, eventos, timestamps e auditoria recente.
- Confirmar que `verificationStatus` so muda para `verified` se todos os criterios deste runbook forem atendidos.

### Pacote de Evidencia Regenerado

- Gerar pacote final de evidencia apos evento final.
- Confirmar que o pacote inclui hashes, provider payload hash, IDs externos, auditoria recente e status de verificacao.
- Baixar por link temporario via broker.
- Confirmar auditoria de geracao e download.
- Confirmar que o pacote antigo nao e apagado sem politica explicita de retencao.

### Smoke Real

- Rodar `npm run api:smoke:real`.
- O smoke deve continuar cobrindo mock, D4Sign simulated, D4Sign unconfigured, HMAC invalido, webhook duplicado e ausencia de `storageObjectPath`.
- Se o smoke ganhar casos reais D4Sign, eles devem ser condicionais a credenciais sandbox e nao podem quebrar ambientes sem chaves.

## Criterios Para `verificationStatus=verified`

Permitir `verificationStatus=verified` somente quando todos os itens abaixo forem verdadeiros:

- `DOCUMENT_SIGNATURE_PROVIDER=d4sign`.
- `DOCUMENT_SIGNATURE_PROVIDER_MODE=real`.
- `Content-Hmac` valido com segredo real da D4Sign.
- Estrategia HMAC oficial confirmada e configurada.
- Consulta oficial a API D4Sign executada com sucesso.
- Documento, envelope, signatarios e status oficial coerentes com o documento interno.
- Evento final recebido e idempotente.
- `externalDocumentId` salvo.
- `externalEnvelopeId` salvo quando a D4Sign retornar esse identificador.
- `providerPayloadHash` salvo para webhook e consulta oficial relevante.
- `providerEventHash` salvo quando houver identificador/hash de evento.
- Printable artifact final e hash do artefato preservados.
- Dossie juridico consolidado apos a verificacao.
- Pacote de evidencia regenerado ou marcado para regeneracao com status consistente.
- Auditoria de dispatch, webhook, acesso ao dossie e download do pacote registrada.

Nao marcar `verified` com base apenas em modo `simulated`, evento sem HMAC, status local, resposta parcial ou ausencia de erro.

## Plano de Rollback

Rollback operacional preferencial:

1. Alterar `DOCUMENT_SIGNATURE_PROVIDER_MODE` para `unconfigured`.
2. Manter `DOCUMENT_SIGNATURE_PROVIDER=d4sign` se for util exibir pendencia de configuracao.
3. Alternativamente voltar para `mock` ou `d4sign_simulated` em staging.
4. Reimplantar Edge Functions se a plataforma exigir reload de secrets.
5. Confirmar que novos dispatches retornam `provider_config_missing` ou simulacao controlada.
6. Preservar todos os eventos, dispatches, hashes, dossies e pacotes ja recebidos.
7. Nao apagar evidencias, eventos de webhook, tentativas de dispatch ou artefatos.
8. Registrar incidente/decisao operacional com horario, ambiente e motivo.

Se houver falha parcial da D4Sign, preferir pausar novos dispatches e continuar aceitando webhooks validos para documentos ja enviados.

## Seguranca e Operacao

- Nunca logar `D4SIGN_TOKEN_API`, `D4SIGN_CRYPT_KEY` ou `D4SIGN_WEBHOOK_SECRET`.
- Nunca enviar secrets para browser, bundle frontend, resposta API ou pacote de evidencia.
- Usar `service_role` apenas server-side.
- Validar autorizacao pelo broker/API antes de expor qualquer dossie, pacote ou signed URL.
- Manter bucket privado e link temporario para downloads.
- Rejeitar webhook sem HMAC valido em modo real.
- Usar idempotencia para replay e duplicidade de eventos.
- Definir rate limit para endpoints internos que acionam dispatch.
- Usar retries com backoff e limite para chamadas D4Sign.
- Registrar falha do provider sem mascarar erro real.
- Separar erro transitorio, erro de credencial, erro de payload e erro de status divergente.
- Ter alerta para aumento de `provider_config_missing`, `not_implemented`, HMAC invalido e falha de consulta oficial.

## Perguntas Pendentes Para D4Sign

- Qual e a estrategia HMAC oficial para `Content-Hmac`: UUID do documento ou corpo cru (`raw_body`)?
- Qual campo exato deve alimentar o HMAC quando a estrategia for `uuid`?
- Quais eventos sao enviados por webhook e quais nomes/codigos oficiais?
- Existe `eventId` ou idempotency key oficial em todos os eventos?
- Qual endpoint oficial deve ser usado para consulta de status?
- Qual endpoint retorna certificado, evidencia, trilha de auditoria ou documento final assinado?
- O documento final e PAdES, ICP-Brasil, assinatura eletronica simples/avancada, ou depende de configuracao?
- Ha suporte oficial a ICP-Brasil por API neste contrato?
- Quais limites de API, rate limits e janelas de retry?
- Como funciona sandbox: base URL, safe UUID, usuarios de teste, webhooks e validade de certificados?
- Como rotacionar `tokenAPI`, `cryptKey` e webhook secret sem interromper webhooks em voo?
- Quais IPs ou headers oficiais podem auxiliar allowlist e observabilidade?

## Proxima Task Recomendada

Implementar o adapter real D4Sign em feature flag, usando sandbox oficial, sem promover `verificationStatus=verified` ate a consulta oficial, HMAC confirmado, hashes persistidos, dossie atualizado e pacote de evidencia regenerado.
