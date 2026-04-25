# Etapa 9 Completion Plan - Documentos, prescricoes e compliance operacional

Este plano e somente tecnico e operacional. Ele nao implementa feature, nao cria
migration, nao altera Edge Functions e nao muda regra clinica. O objetivo e
transformar o estado atual da Etapa 9 em uma fila de PRs pequenos, auditaveis e
testaveis.

## Fonte de verdade usada

Arquivos revisados para este plano:

- `AGENTS.md`
- `docs/execution/CODEX_CONTEXT.md`
- `docs/execution/control-checklist.md`
- `docs/execution/operating-system.md`
- `docs/execution/gap-analysis.md`
- `docs/fusion/module-matrix.md`
- `docs/execution/environments-and-deploys.md`
- `docs/execution/storage-upload-policy.md`
- `docs/execution/public-schema-boundary.md`
- `docs/adr/0001-emagreceplus-supabase-runtime.md`
- `README.md`
- `package.json`
- `scripts/api-smoke.ts`
- `supabase/README.md`
- `supabase/migrations/0049` ate `supabase/migrations/0072`
- `supabase/functions/document-printable`
- `supabase/functions/document-signature-dispatch`
- `supabase/functions/document-signature-webhook`
- `supabase/functions/_shared/document-signature-provider.ts`
- `src/modules/clinical`
- `src/app/(dashboard)/clinical/encounters/[id]/page.tsx`
- `src/app/(dashboard)/clinical/document-layout/page.tsx`
- `apps/api/src/modules/clinical`
- `apps/api/src/common/runtime/runtime-document-writes.ts`
- `apps/api/src/common/runtime/runtime-prescription-writes.ts`

Contexto operacional informado nesta task:

- `npm run api:smoke:local` passa.
- `npm run api:smoke:real` passa.
- `npm run api:smoke:real` repetido passa.
- O warning nao bloqueante do driver `pg` foi removido.
- Projecoes runtime estabilizadas: `units`, comercial, `appointment_types` e
  `patients`.

## 1. Estado atual da Etapa 9

### Ja existe com evidencia no repo

- O checklist mestre marca a Etapa 9 como `in_progress`.
- As migrations `0054` a `0065` criam e expoem a base de documentos,
  prescricoes, artefatos imprimiveis, solicitacoes de assinatura, eventos de
  assinatura, dispatch auditavel, layout documental e wrappers de compatibilidade.
- `docs.document_templates`, `docs.document_template_versions`,
  `docs.patient_documents`, `docs.document_versions`,
  `docs.signature_requests`, `docs.signature_events`,
  `docs.printable_artifacts` e `clinical.prescription_items` existem com RLS,
  indices e grants.
- `api.record_prescription_for_encounter` registra prescricoes estruturadas com
  itens, auditoria e evento longitudinal.
- `api.issue_document_for_encounter` emite documento vinculado ao encounter,
  paciente, tenant, unidade, template e versao.
- `api.register_document_printable_artifact` registra artefatos `preview`,
  `html`, `pdf` e `print_package` com checksum e storage path.
- `api.create_document_signature_request` cria solicitacao de assinatura.
- `api.consume_document_signature_webhook` processa webhook idempotente e marca
  documento/versao como `signed` quando recebe evento assinado.
- `api.record_document_signature_dispatch` registra tentativa de dispatch,
  payload enviado, resposta recebida, provider, idempotency key e envelope externo.
- A Edge Function `document-printable` gera HTML, PDF textual e pacote ZIP no
  bucket privado `patient-documents`.
- A Edge Function `document-signature-dispatch` registra dispatch e suporta modo
  local/mock ou HTTP externo generico via `DOCUMENT_SIGNATURE_DISPATCH_URL`.
- A Edge Function `document-signature-webhook` normaliza o payload mock atual e
  chama a RPC idempotente de consumo.
- A tela do encounter usa `DocumentRecordBoard` para emitir documentos, gerar
  artefatos, pedir assinatura e abrir/baixar artefatos por signed URL temporaria.
- A rota `GET /documents/:id/access-links` existe em `apps/api` e gera signed
  URLs de 10 minutos para a versao atual e artefatos do documento.
- A tela `src/app/(dashboard)/clinical/document-layout/page.tsx` existe e usa
  `DocumentLayoutEditor` para branding, layout, presets e versao de template.
- `scripts/api-smoke.ts` valida, em modo real, documentos, prescricoes,
  artefato printable, assinatura mock via webhook, replay idempotente e reflexo
  do documento assinado no encounter.

### Funcional hoje

- Registro de prescricao estruturada dentro do encounter.
- Emissao de documento dentro do encounter.
- Geracao de artefato printable dentro do fluxo do encounter.
- Signed URL temporaria para abrir/baixar artefatos dentro do detalhe do
  encounter.
- Criacao de solicitacao de assinatura com provider `mock` ou codigo informado.
- Dispatch auditavel para provider local/mock ou HTTP generico quando configurado.
- Webhook idempotente para evento de assinatura mock.
- Layout documental com branding e presets.
- Smoke local/mock e smoke real/runtime cobrindo o fluxo minimo atual.

### Parcial

- A assinatura real ainda nao possui verificacao criptografica por provider.
- A abstracao de provider documental ainda normaliza apenas payload mock; o modo
  HTTP externo despacha, mas nao valida criptograficamente o webhook ou evidencia.
- A evidencia juridica esta distribuida em `signature_events`,
  `signature_dispatch_attempts`, metadata, audit log e timeline. Ainda nao existe
  um dossie final consolidado de evidencia juridica.
- O acesso seguro a artefatos existe no encounter, mas nao ha centro documental
  ou superficie administrativa fora do encounter.
- O PDF atual e textual e funcional para smoke, mas o checklist registra que o
  PDF legal/pixel-perfect pode ser refinado depois da escolha do provider real.
- Prescricoes estruturadas existem, mas ainda precisam ser fechadas como
  documento clinico imprimivel/assinavel com versionamento e evidencia completa.

### Blockers reais para concluir a Etapa 9

- Download/acesso seguro a documentos fora do encounter, com auditoria e
  protecao cross-tenant.
- Centro documental administrativo com busca, filtros, acoes e permissoes.
- Evidencia juridica final consolidada para documento, artefatos, assinatura,
  signatarios, provider, hashes, timestamps e auditoria.
- Verificacao criptografica real da assinatura e dos webhooks do provider.
- Testes de RLS, Edge Functions, API smoke e UI cobrindo os fluxos acima.

### Fora de escopo desta etapa de planejamento

- Escolher um provider especifico de assinatura.
- Implementar adapter real sem contrato definido.
- Tornar bucket sensivel publico.
- Levar `service_role` para browser.
- Criar regra critica apenas no frontend.
- Alterar migrations antigas ja aplicadas.

## 2. Download e acesso seguro fora do encounter

### Modelo de permissao

- O acesso deve exigir usuario autenticado e sessao de aplicacao valida.
- O tenant deve vir do contexto autenticado, nunca de parametro confiado pelo
  browser.
- A unidade deve respeitar a unidade ativa e as unidades permitidas ao usuario.
- O paciente deve ser acessivel pelo usuario via as regras existentes de
  `private.can_access_patient`.
- Leitura deve exigir permissao clinica/documental de leitura. O repo ja usa
  `clinical:view` em `ClinicalController`; a implementacao pode reaproveitar
  isso no primeiro PR ou introduzir permissoes documentais explicitas em uma
  migration futura, por exemplo `documents:view` e `documents:manage`.
- Acoes mutaveis devem exigir permissao de escrita/gestao, como `clinical:write`
  hoje ou permissoes documentais dedicadas quando o modelo de permissoes for
  ampliado.

### RLS e grants

- Tabelas de dominio continuam nos schemas `docs`, `clinical`, `audit` e
  correlatos. Nao criar tabela de negocio em `public`.
- Novas leituras agregadas devem nascer como RPCs no schema `api` e helpers
  privilegiados no schema `private`.
- RPCs de leitura para o frontend podem ser `security definer`, mas precisam
  revalidar tenant, unidade, paciente e permissao dentro da funcao.
- Revogar execucao de `public`, `anon` e `authenticated` quando a chamada for
  exclusiva de servidor/Edge Function com `service_role`.
- Se houver wrapper em `public`, ele deve ser apenas compatibilidade PostgREST e
  seguir o limite documentado em `public-schema-boundary.md`.

### RPCs ou Edge Functions necessarias

Proposta de desenho incremental:

- `api.search_patient_documents` ou `api.list_document_center_documents`
  - Entrada: filtros de status, tipo, assinatura, paciente, unidade, template,
    data, texto, paginacao.
  - Saida: metadados seguros para listagem, sem URL assinada e sem expor path
    privado bruto quando nao for necessario.
- `api.get_patient_document_detail`
  - Entrada: document id publico ou runtime id.
  - Saida: snapshot operacional com versao atual, artefatos, assinatura,
    dispatch, evidencia resumida e timeline essencial.
- `api.prepare_patient_document_access`
  - Entrada: document id, artifact id opcional, modo `open` ou `download`.
  - Responsabilidade: validar escopo e registrar evento de acesso antes de
    retornar um token curto ou instrucoes para signed URL.
- Edge Function opcional `document-access-link`
  - Pode centralizar a geracao de signed URLs fora de `apps/api`, usando
    `service_role` apenas em runtime servidor.
  - Deve chamar RPC de validacao/auditoria antes de gerar a URL.

No estado transicional atual, `apps/api` ja gera signed URLs por
`GET /documents/:id/access-links`. O primeiro PR pode estender esse padrao com
auditoria, mas o alvo final deve ficar documentado em Supabase RPC/Edge Function.

### Signed URLs temporarias

- Usar bucket privado `patient-documents`.
- TTL curto. O fluxo atual usa 10 minutos; a nova superficie deve reaproveitar
  esse padrao ou tornar TTL configuravel por servidor com limite maximo.
- Gerar URL apenas depois de validar tenant, unidade, paciente, documento,
  artefato e permissao.
- Separar link inline de link download quando o content type permitir.
- `print_package` ZIP deve ser download-only.
- Nao retornar `SUPABASE_SERVICE_ROLE_KEY`, paths sensiveis desnecessarios ou
  credenciais ao browser.
- Registrar expiracao retornada ao cliente.

### Auditoria de acesso e download

Criar uma trilha dedicada ou usar `private.record_audit_event` com padrao
consistente. Campos minimos recomendados:

- `tenant_id`, `unit_id`, `patient_id`
- `patient_document_id`, `document_version_id`, `printable_artifact_id`
- `actor_profile_id` e/ou usuario autenticado
- acao: `open`, `download`, `evidence_download`, `signed_artifact_download`
- bucket e path em campo protegido, nunca exibido em UI sem necessidade
- artifact kind, content type, checksum quando existir
- `expires_at` da signed URL
- IP, user-agent e request id quando disponiveis no servidor/Edge Function
- resultado: `granted`, `denied`, `expired`, `storage_error`

### Protecao cross-tenant

- Nao aceitar document id isolado sem revalidar tenant e paciente.
- Testar usuario de tenant A tentando documento de tenant B.
- Testar unidade secundaria sem permissao tentando documento de outra unidade.
- Testar paciente inacessivel mesmo com document id valido.
- Garantir que uma signed URL so seja gerada depois da validacao de escopo.

## 3. Centro documental administrativo

### Rota sugerida

- `src/app/(dashboard)/clinical/documents/page.tsx`

A rota fica dentro do dominio clinico porque os documentos atuais nascem de
encounter, paciente, prescricao, template e assinatura. Se a navegacao futura
criar um modulo dedicado, a pagina pode ser movida para `/documents`, mantendo a
camada de API e hooks.

### Dados e filtros necessarios

- Busca textual por titulo, numero do documento, paciente, signatario ou
  provider envelope.
- Filtro por unidade.
- Filtro por paciente.
- Filtro por profissional/autor quando houver dado disponivel.
- Filtro por tipo: `report`, `consent`, `prescription`, `orientation`,
  `exam_request`, `certificate`, `custom`.
- Filtro por status do documento: `draft`, `issued`, `signed`, `revoked`,
  `archived`.
- Filtro por status da assinatura: `pending`, `sent`, `viewed`, `signed`,
  `declined`, `expired`, `cancelled`.
- Filtro por artifact kind: `html`, `pdf`, `print_package`, `preview`.
- Filtro por periodo de emissao, assinatura e expiracao.
- Filtro operacional: sem artefato, dispatch com falha, evidencia pendente,
  assinatura vencida, documento assinado sem evidencia final.
- Paginacao e ordenacao por data de emissao, assinatura, atualizacao e paciente.

### Acoes permitidas

Primeira versao read-only operacional:

- Abrir detalhe do documento.
- Navegar para encounter de origem.
- Navegar para paciente.
- Abrir artefato por signed URL curta.
- Baixar artefato por signed URL curta.
- Ver status de assinatura e ultima tentativa de dispatch.
- Ver resumo de evidencia, quando existir.

Versoes posteriores com permissao de gestao:

- Regenerar artefato printable.
- Solicitar ou reenviar assinatura.
- Baixar dossie de evidencia.
- Arquivar ou revogar quando a regra ja existir em RPC.
- Reprocessar evidencia quando provider permitir.

### Estados de UI

- Loading de listagem.
- Loading de geracao de link.
- Erro de permissao.
- Erro de storage/signed URL.
- Erro de provider/dispatch.
- Lista vazia sem filtros.
- Lista vazia com filtros.
- Documento sem artefato.
- Documento sem assinatura.
- Documento assinado com evidencia.
- Documento assinado sem evidencia final, como alerta operacional.

### Integracoes

- Reaproveitar tipos em `src/modules/clinical/types.ts` quando possivel.
- Criar API client dedicado, por exemplo
  `src/modules/clinical/api/get-document-center.ts`.
- Criar hooks dedicados para listagem, detalhe e access link fora do encounter.
- Reaproveitar `get-document-access-links.ts` somente se a resposta ganhar
  auditoria e escopo compativel com a nova superficie.
- Reaproveitar componentes de status do `DocumentRecordBoard`, mas evitar
  acoplar o centro inteiro ao componente do encounter.

### Permissoes administrativas

- Read-only: `clinical:view` ou futura `documents:view`.
- Acoes de emissao, artefato e assinatura: `clinical:write` ou futura
  `documents:manage`.
- Configuracao de layout/template permanece no fluxo de settings/document-layout
  e deve exigir permissao de settings/gestao, nao apenas leitura clinica.

## 4. Evidencia juridica final

### Dados que devem compor a evidencia

- Documento: id, numero, tipo, status, tenant, unidade, paciente, encounter,
  profissional, autor e timestamps.
- Versao: id, numero da versao, status, `issued_at`, `signed_at`, content
  snapshot, layout schema, branding snapshot e template version.
- Artefatos: ids, kinds, bucket, storage path protegido, content type, tamanho
  quando disponivel, checksum SHA-256 e data de render.
- Assinatura: request id, provider code, signer type, signer name/email quando
  disponivel, external request/envelope id, status, expiracao, completed at.
- Provider: envelope/id externo, event id externo, timestamps do provider,
  status bruto, payload bruto protegido, response payload do dispatch.
- Verificacao: algoritmo, chave/certificado usado quando aplicavel, resultado,
  hash verificado, timestamp de verificacao, erro de verificacao se falhar.
- Contexto tecnico: IP, user-agent, request id e callback URL quando disponiveis.
- Auditoria: eventos `docs.signature_request_created`,
  `docs.signature_dispatch_recorded`, eventos de webhook, eventos de acesso e
  timeline longitudinal.
- Idempotencia: provider, idempotency key, payload hash e resposta consolidada.

### Relacao com documento, artefato, assinatura e signatarios

Modelo recomendado para futura migration:

- `docs.document_legal_evidence`
  - `tenant_id`, `unit_id`, `patient_id`
  - `patient_document_id`, `document_version_id`
  - `signature_request_id`
  - `provider_code`, `external_request_id`, `external_envelope_id`
  - `evidence_status`: `pending`, `verified`, `failed`, `superseded`
  - `verification_status`: `not_required`, `pending`, `verified`, `failed`
  - `document_hash`, `signed_artifact_hash`, `manifest_hash`
  - `evidence_payload`, `provider_payload`, `verification_payload`
  - `verified_at`, `failed_at`, `failure_reason`
  - `created_at`, `updated_at`
- `docs.document_legal_evidence_files`, se a evidencia tiver arquivos separados
  - referencia para `document_legal_evidence`
  - artifact kind, bucket, storage path, checksum, content type

Se a primeira implementacao nao criar tabelas novas, ela deve pelo menos
consolidar um snapshot via RPC a partir de `signature_events`,
`signature_dispatch_attempts`, `printable_artifacts`, `document_versions` e
audit log. A conclusao da Etapa 9, porem, deve ter um registro final de
evidencia protegido e recuperavel.

### Hashes, timestamps e integridade

- Usar SHA-256 para HTML, PDF, ZIP, signed artifact e manifest.
- O manifest do `print_package` ja existe; a evidencia final deve referenciar
  seu hash e o hash do PDF incluido.
- Incluir timestamps do sistema e timestamps externos do provider.
- Evitar sobrescrever evidencia verificada. Nova evidencia deve criar versao ou
  marcar anterior como `superseded`.
- Persistir payload bruto do provider em campo protegido ou arquivo privado, com
  redacao de secrets quando necessario.

### Storage ou tabela protegida

- JSON estruturado pequeno pode ficar em tabela `docs`.
- Arquivos de evidencia, comprovantes ou payloads extensos devem ficar no bucket
  privado `patient-documents`, em prefixo do documento, por exemplo:
  `tenant/<tenant_uuid>/patients/<patient_uuid>/documents/<document_uuid>/evidence/...`
- Download do dossie deve usar o mesmo broker de signed URL e auditoria.

## 5. Verificacao criptografica real de assinatura

### Abstracao de provider

O arquivo `supabase/functions/_shared/document-signature-provider.ts` hoje cobre
provider atual e normalizacao do webhook mock. A proxima camada deve transformar
isso em uma abstracao explicita:

- `currentDocumentSignatureProvider()`
- `normalizeWebhookEvent(provider, request, rawBody)`
- `verifyWebhookSignature(provider, request, rawBody)`
- `normalizeDispatchResponse(provider, responsePayload)`
- `fetchOrBuildLegalEvidence(provider, normalizedEvent, documentSnapshot)`
- `verifySignedArtifact(provider, evidencePayload, artifactBytes?)`

O provider `mock` deve permanecer para smoke local/real controlado. O provider
real deve ser configuravel e isolado em Edge Functions/servidor.

### Variaveis de ambiente

Variaveis ja documentadas:

- `DOCUMENT_SIGNATURE_PROVIDER`
- `DOCUMENT_SIGNATURE_DISPATCH_URL`
- `DOCUMENT_SIGNATURE_API_KEY`
- `DOCUMENT_SIGNATURE_CALLBACK_URL`

Variaveis provaveis para provider real, sem assumir fornecedor especifico:

- `DOCUMENT_SIGNATURE_WEBHOOK_SECRET`
- `DOCUMENT_SIGNATURE_WEBHOOK_PUBLIC_KEY`
- `DOCUMENT_SIGNATURE_VERIFY_REQUIRED`
- `DOCUMENT_SIGNATURE_EVIDENCE_URL`
- `DOCUMENT_SIGNATURE_TIMEOUT_MS`
- `DOCUMENT_SIGNATURE_ALLOWED_CLOCK_SKEW_SECONDS`

Nenhuma delas deve ser `NEXT_PUBLIC_*`.

### Dispatch idempotente

- A idempotency key nao deve depender de `Date.now()` quando for provider real.
- Usar chave estavel baseada em provider, signature request id, document version
  id e hash do artefato a assinar.
- Reenvio deve reutilizar ou atualizar tentativa existente sem duplicar envelope
  indevidamente.
- O dispatch deve falhar de forma visivel quando provider real estiver
  configurado sem URL/chave obrigatoria.

### Webhook idempotente

- Validar assinatura do webhook antes de normalizar evento real.
- Idempotencia deve usar provider + external event id.
- Se o mesmo event id chegar com payload hash diferente, deve falhar como
  conflito de replay, nao retornar sucesso silencioso.
- Webhook duplicado identico deve retornar resposta idempotente.
- Eventos fora de ordem devem preservar o estado mais forte quando a regra ja
  estiver definida, por exemplo nao reabrir documento assinado como pendente.

### Estados de falha

Estados operacionais a modelar em migration futura, sem quebrar estados atuais:

- `dispatch_failed`
- `webhook_verification_failed`
- `evidence_pending`
- `evidence_failed`
- `signature_verified`
- `signed_unverified`

Enquanto esses estados nao existirem, registrar em metadata/evidencia e expor
alerta operacional sem mascarar falha real.

### Validacao sem depender do frontend

- A verificacao de assinatura deve ocorrer em Edge Function/RPC/servidor.
- O frontend apenas mostra status e evidencia ja apurada.
- `api:smoke:real` deve conseguir validar provider mock e, quando variaveis
  reais estiverem presentes, validar a camada real sem passos manuais.

## 6. Prescricoes e documentos clinicos

### Estado atual

- Prescricoes estruturadas sao registradas por `api.record_prescription_for_encounter`.
- Itens de prescricao existem em `clinical.prescription_items`.
- O encounter retorna `prescriptions` no snapshot estruturado.
- A UI `PrescriptionRecordForm` cria prescricoes e itens no encounter.
- Templates documentais aceitam `template_kind = 'prescription'`.
- Documentos emitidos podem ter `document_type = 'prescription'`.

### Lacunas atuais

- O fluxo de prescricao estruturada ainda nao garante, por padrao, a geracao de
  um documento clinico printable/assinavel para a prescricao.
- Nao ha evidencia final especifica conectando prescricao estruturada,
  documento emitido, artefato printable, assinatura e signatario.
- A UI do encounter exibe prescricoes e documentos como blocos separados; o
  centro documental deve permitir ver a relacao quando existir.
- O versionamento de template/layout existe, mas a prescricao precisa garantir
  snapshot de template/layout usado no momento da emissao documental.

### Geracao de printable artifact

- O caminho recomendado e tratar prescricao clinica como documento emitido a
  partir de template `prescription`.
- O artefato printable deve referenciar:
  - prescription record id
  - encounter id
  - patient id
  - professional id
  - template version id
  - layout schema e branding snapshot
- A geracao deve produzir HTML/PDF/ZIP no bucket privado e registrar checksum.

### Versionamento de template/layout

- O documento emitido deve preservar snapshot de layout e branding no momento
  da emissao.
- Alterar template depois da emissao nao deve mudar evidencia de documento ja
  emitido.
- A versao do template e o preset devem entrar no dossie de evidencia.

### Trilha longitudinal

- `clinical.prescription_recorded`, `document_issued`,
  `document_artifact_rendered`, `document_signature_requested`,
  `document_signature_sent` e `document_signed` devem aparecer de forma
  rastreavel.
- O centro documental deve linkar documento, encounter e paciente.
- O paciente 360 deve poder consumir o resumo sem depender de estado local.

## 7. Testes necessarios

### SQL e RLS

- Usuario do tenant A nao lista documento do tenant B.
- Usuario sem unidade autorizada nao acessa documento daquela unidade.
- Usuario com acesso ao paciente consegue listar metadados permitidos.
- Usuario sem acesso ao paciente nao gera signed URL.
- RPC de access link registra auditoria em sucesso e falha.
- `docs.document_legal_evidence`, quando criada, respeita RLS equivalente aos
  documentos do paciente.

### Edge Functions

- `document-printable` gera HTML, PDF e ZIP com checksum e path correto.
- `document-signature-dispatch` falha quando provider real esta mal configurado.
- `document-signature-dispatch` e idempotente para a mesma chave.
- `document-signature-webhook` aceita webhook mock valido.
- `document-signature-webhook` rejeita provider real com assinatura invalida.
- Webhook duplicado com mesmo payload retorna duplicado idempotente.
- Webhook duplicado com payload diferente falha como conflito.
- Provider failure registra falha sem marcar documento como assinado.

### API smoke

- `api:smoke:local` continua validando shape e fluxo minimo sem provider real.
- `api:smoke:real` continua exigindo runtime Supabase, catalogo, settings,
  artefatos e assinatura.
- Novo smoke real deve validar access link fora do encounter quando o endpoint
  existir.
- Novo smoke real deve validar documento assinado com evidencia final quando a
  migration/Edge Function correspondente existir.
- Smoke real com provider real deve ser condicional a variaveis reais e falhar
  claramente quando incompletas.

### UI

- Centro documental renderiza loading, erro, vazio sem filtros e vazio com
  filtros.
- Filtros alteram query e paginacao.
- Acoes indisponiveis aparecem bloqueadas quando falta permissao.
- Signed URL expirada dispara regeneracao ou erro claro.
- ZIP aparece como download-only.
- Documento assinado exibe status, provider, envelope e evidencia.
- Documento sem assinatura nao mostra evidencia falsa.

### Casos obrigatorios

- Cross-tenant.
- Signed URL expirada.
- Webhook duplicado.
- Provider failure.
- Documento sem assinatura.
- Documento assinado com evidencia.
- Documento assinado sem evidencia final, como alerta.
- Paciente inacessivel.
- Unidade fora do escopo.

## 8. Seguranca e compliance

- Buckets sensiveis permanecem privados.
- `service_role` somente em servidor ou Edge Function.
- Nenhum segredo em `NEXT_PUBLIC_*`.
- Logs nao devem conter tokens, API keys, payload sensivel integral ou signed
  URL completa.
- Auditoria deve registrar ator, tenant, unidade, paciente, recurso, acao,
  resultado e timestamps.
- A evidencia juridica deve ser rastreavel e protegida contra sobrescrita
  silenciosa.
- Dados pessoais e clinicos devem seguir minimo necessario para a operacao
  juridica e assistencial.
- Retencao precisa ser definida antes de expurgo automatico; ate la, nao apagar
  evidencia legal sem regra explicita.
- Downloads de documento e evidencia devem ser auditados.
- Toda regra critica fica em SQL/RPC/Edge Function, nao apenas no React.
- O provider real deve ter retry e idempotencia, mas nao pode transformar falha
  critica em no-op.
- Erro real de assinatura ou evidencia deve aparecer em UI/operacao e no smoke
  real quando o fluxo for obrigatorio.

## 9. Ordem recomendada de implementacao

### Task 1 - Broker seguro e auditavel de acesso documental

Objetivo:

- Fechar download/acesso seguro fora do encounter com auditoria.

Arquivos provaveis:

- Nova migration `supabase/migrations/0073_document_access_audit.sql`
- `apps/api/src/modules/clinical/clinical.controller.ts`
- `apps/api/src/modules/clinical/clinical.service.ts`
- `apps/api/src/common/runtime/runtime-document-writes.ts`
- `src/modules/clinical/api/get-document-access-links.ts`
- `docs/execution/environments-and-deploys.md`
- `scripts/api-smoke.ts`

Migrations provaveis:

- Criar `docs.document_access_events` ou RPC auditada equivalente.
- Criar `api.prepare_patient_document_access`.
- Ajustar grants/RLS sem alterar migrations antigas.

Checks:

- `git diff --check`
- `npm run typecheck`
- `npm run api:typecheck`
- `npm run api:build`
- `npm run build`
- `npm run api:smoke:local`
- `npm run api:smoke:real`

Criterio de pronto:

- Link de acesso fora do encounter so e emitido depois de validar tenant,
  unidade, paciente e permissao.
- Toda abertura/download gera auditoria.
- Cross-tenant falha.
- Bucket path privado nao vira contrato publico de UI.

### Task 2 - Centro documental administrativo read-only

Objetivo:

- Criar listagem administrativa para encontrar documentos e acessar detalhes sem
  misturar acoes mutaveis.

Arquivos provaveis:

- Nova migration `supabase/migrations/0074_document_center_read_model.sql`
- `src/app/(dashboard)/clinical/documents/page.tsx`
- `src/modules/clinical/api/get-document-center.ts`
- `src/modules/clinical/hooks/use-document-center.ts`
- `src/modules/clinical/components/document-center-*`
- `apps/api/src/modules/clinical/clinical.controller.ts`
- `apps/api/src/modules/clinical/clinical.service.ts`
- `scripts/api-smoke.ts`

Migrations provaveis:

- Criar RPC `api.list_document_center_documents`.
- Criar RPC `api.get_patient_document_detail`.
- Criar indices se a busca exigir, sem duplicar indices existentes.

Checks:

- `git diff --check`
- `npm run typecheck`
- `npm run api:typecheck`
- `npm run api:build`
- `npm run build`
- `npm run api:smoke:local`
- `npm run api:smoke:real`

Criterio de pronto:

- Pagina lista documentos por filtros principais.
- Estados loading, erro, vazio e permissao negada existem.
- Acesso a artefatos usa broker da Task 1.
- Nenhuma acao mutavel entra neste PR, exceto navegacao/abrir/baixar.

### Task 3 - Modelo de evidencia juridica final

Objetivo:

- Consolidar evidencia juridica protegida, versionada e recuperavel.

Arquivos provaveis:

- Nova migration `supabase/migrations/0075_document_legal_evidence.sql`
- `supabase/functions/document-signature-webhook/index.ts`
- `supabase/functions/document-printable/index.ts`, se precisar registrar
  manifest/hash adicional
- `supabase/functions/_shared/document-signature-provider.ts`
- `apps/api/src/common/runtime/runtime-document-writes.ts`
- `scripts/api-smoke.ts`
- `docs/execution/storage-upload-policy.md`

Migrations provaveis:

- Criar `docs.document_legal_evidence`.
- Criar `docs.document_legal_evidence_files`, se houver arquivos de evidencia.
- Criar RPC `api.get_document_legal_evidence`.
- Criar helper privado para consolidar evidencia a partir de documento,
  assinatura, dispatch e artefatos.

Checks:

- `git diff --check`
- `npm run typecheck`
- `npm run api:typecheck`
- `npm run api:build`
- `npm run build`
- `npm run api:smoke:local`
- `npm run api:smoke:real`

Criterio de pronto:

- Documento assinado possui evidencia juridica consolidada ou status claro de
  pendencia/falha.
- Evidencia preserva metadata existente e nao sobrescreve registro verificado.
- Download de evidencia passa pelo broker seguro.
- Smoke real valida documento assinado com evidencia.

### Task 4 - Abstracao real de provider e verificacao de webhook

Objetivo:

- Separar mock, HTTP generico e provider real configuravel sem assumir
  fornecedor especifico.

Arquivos provaveis:

- `supabase/functions/_shared/document-signature-provider.ts`
- `supabase/functions/document-signature-dispatch/index.ts`
- `supabase/functions/document-signature-webhook/index.ts`
- `supabase/README.md`
- `.env.example`
- `docs/execution/environments-and-deploys.md`
- `scripts/api-smoke.ts`

Migrations provaveis:

- Somente se novos estados ou campos de verificacao forem necessarios.

Checks:

- `git diff --check`
- `npm run typecheck`
- `npm run api:typecheck`
- `npm run api:build`
- `npm run build`
- `npm run api:smoke:local`
- `npm run api:smoke:real`

Criterio de pronto:

- Provider mock continua funcionando.
- Provider real exige variaveis completas e falha claramente se faltar segredo.
- Webhook real rejeita assinatura invalida antes de alterar estado.
- Webhook duplicado identico e idempotente.
- Webhook duplicado divergente falha como replay suspeito.

### Task 5 - Adapter de provider real escolhido

Objetivo:

- Implementar o adapter do fornecedor escolhido depois de decisao explicita.

Arquivos provaveis:

- `supabase/functions/_shared/document-signature-provider.ts`
- Novo arquivo compartilhado de provider, se necessario.
- `supabase/functions/document-signature-dispatch/index.ts`
- `supabase/functions/document-signature-webhook/index.ts`
- `supabase/README.md`
- `.env.example`
- `docs/execution/environments-and-deploys.md`

Migrations provaveis:

- Ajustes em evidencia/verificacao apenas se o provider exigir campos novos.

Checks:

- `git diff --check`
- `npm run typecheck`
- `npm run api:typecheck`
- `npm run api:build`
- `npm run build`
- `npm run api:smoke:local`
- `npm run api:smoke:real`
- Teste manual ou automatizado com webhook real em ambiente controlado.

Criterio de pronto:

- Dispatch real cria envelope externo.
- Webhook real e verificado criptograficamente.
- Evidencia real e persistida.
- Falhas do provider sao auditadas e visiveis.
- Mock continua preservado.

### Task 6 - Prescricao como documento clinico imprimivel e assinavel

Objetivo:

- Fechar o caminho entre prescricao estruturada, documento, artefato, assinatura
  e evidencia.

Arquivos provaveis:

- Nova migration `supabase/migrations/0076_prescription_document_link.sql`
- `apps/api/src/common/runtime/runtime-prescription-writes.ts`
- `apps/api/src/common/runtime/runtime-document-writes.ts`
- `apps/api/src/modules/clinical/clinical.service.ts`
- `src/modules/clinical/components/prescription-record-form.tsx`
- `src/modules/clinical/components/document-record-board.tsx`
- `scripts/api-smoke.ts`

Migrations provaveis:

- Relacionar `clinical.prescription_records` com `docs.patient_documents`, se o
  schema atual nao tiver vinculo suficiente via metadata.
- Criar RPC para emitir documento de prescricao a partir de prescription record.

Checks:

- `git diff --check`
- `npm run typecheck`
- `npm run api:typecheck`
- `npm run api:build`
- `npm run build`
- `npm run api:smoke:local`
- `npm run api:smoke:real`

Criterio de pronto:

- Prescricao pode gerar documento `prescription`.
- Documento de prescricao gera printable artifact.
- Evidencia referencia prescription record, encounter, patient e professional.
- Nao ha regra clinica critica nova no React.

### Task 7 - UX de evidencia no encounter e centro documental

Objetivo:

- Expor status e dossie de evidencia sem misturar com provider real.

Arquivos provaveis:

- `src/modules/clinical/components/document-record-board.tsx`
- `src/modules/clinical/components/document-center-*`
- `src/modules/clinical/api/get-document-legal-evidence.ts`
- `src/modules/clinical/hooks/use-document-legal-evidence.ts`
- `apps/api/src/modules/clinical/clinical.controller.ts`
- `apps/api/src/modules/clinical/clinical.service.ts`

Migrations provaveis:

- Nenhuma, se a Task 3 ja entregou RPCs.

Checks:

- `git diff --check`
- `npm run typecheck`
- `npm run api:typecheck`
- `npm run api:build`
- `npm run build`
- `npm run api:smoke:local`
- `npm run api:smoke:real`

Criterio de pronto:

- Documento assinado exibe evidencia verificada, pendente ou falha.
- Dossie so baixa por signed URL auditada.
- Documento sem assinatura nao mostra evidencia falsa.
- Estados de UI estao cobertos.

### Task 8 - Ampliacao final de testes e smokes

Objetivo:

- Travar regressao da Etapa 9 completa.

Arquivos provaveis:

- `scripts/api-smoke.ts`
- Testes SQL/fixtures existentes, se houver harness local.
- Testes de UI existentes, se houver.
- `.github/workflows/ci-smokes.yml`, somente se a condicional de secrets precisar
  incluir provider real.
- `docs/execution/environments-and-deploys.md`

Migrations provaveis:

- Nenhuma.

Checks:

- `git diff --check`
- `npm run typecheck`
- `npm run api:typecheck`
- `npm run api:build`
- `npm run build`
- `npm run api:smoke:local`
- `npm run api:smoke:real`
- `npm run frontend:auth-smoke`, se secrets estiverem disponiveis.

Criterio de pronto:

- Smoke local continua leve e mockado.
- Smoke real valida documento, prescricao, acesso seguro, evidencia e assinatura.
- Testes negativos cobrem cross-tenant, URL expirada, webhook duplicado e
  provider failure.

## 10. Definition of Done da Etapa 9

### Criterios tecnicos

- Todos os dados criticos de documentos, prescricoes, artefatos, assinaturas e
  evidencia vivem em Supabase ou storage privado.
- Regras criticas estao em SQL/RPC/Edge Function ou servidor transicional com
  justificativa.
- Migrations novas possuem RLS, grants, indices e constraints.
- Nenhuma migration antiga aplicada foi alterada.
- Public schema continua apenas como fachada de compatibilidade.
- `api:smoke:local`, `api:smoke:real` e `api:smoke:real` repetido passam.

### Criterios de seguranca

- Buckets documentais permanecem privados.
- Signed URLs sao temporarias, auditadas e geradas apos validacao de escopo.
- Nao existe `service_role` no browser.
- Logs nao vazam segredo ou signed URL completa.
- Cross-tenant e unidade fora do escopo falham.
- Webhook real e verificado criptograficamente.
- Replay divergente de webhook falha.
- Evidencia juridica nao e sobrescrita silenciosamente.

### Criterios de UI

- Centro documental administrativo existe.
- Encounter continua exibindo documentos e prescricoes sem regressao.
- UI mostra loading, erro, vazio, permissao negada e estados operacionais de
  assinatura/evidencia.
- Download de ZIP e tratado como download-only.
- Documento assinado, documento sem assinatura e documento com evidencia falha
  sao distinguiveis.

### Criterios de testes

- SQL/RLS cobre tenant, unidade, paciente e permissao.
- Edge Functions cobrem dispatch, webhook, provider failure e replay.
- API smoke cobre local/mock e real/runtime.
- UI cobre listagem, filtros, access link e evidencia.
- Signed URL expirada tem teste ou smoke dedicado.
- Provider real tem validacao em ambiente com secrets.

### Criterios de documentacao

- `README.md`, `supabase/README.md` e
  `docs/execution/environments-and-deploys.md` explicam:
  - modos de smoke
  - variaveis de provider de assinatura
  - buckets privados e access links
  - como validar provider real
  - como operar centro documental
- `docs/execution/gap-analysis.md` deve ser atualizado ao final para mover a
  Etapa 9 de parcial para resolvida apenas quando todos os criterios acima
  tiverem evidencia real no repo.

## Proxima task recomendada

Comecar pela Task 1: broker seguro e auditavel de acesso documental fora do
encounter. Essa task reduz risco de compliance, habilita o centro documental e
nao depende da escolha do provider real de assinatura.
