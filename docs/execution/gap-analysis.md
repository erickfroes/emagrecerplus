# Gap analysis do repositorio atual

## Referencia de leitura

Reconciliado em 2026-04-25 a partir do estado real do repositorio.

O checklist mestre confirma:

- Etapas 0 a 8: `done`
- Etapa 9: `in_progress`, com foco em documentos, prescricoes e compliance operacional
- Etapa 10: `done`, mesmo aparecendo depois da Etapa 9 na ordem numerica
- Etapas 11 a 14: `later`

Esta classificacao nao promove gap sem evidencia em arquivo versionado. Quando
um item antigo foi substituido, ele aparece na secao de obsoleto/substituido em
vez de sumir do historico.

## Resolvido com evidencia

### Runtime Supabase e boundary de schemas

- O workspace `supabase/` existe como base do runtime final, com migrations SQL,
  Edge Functions e README operacional.
- `supabase/migrations` contem migrations de `0001` a `0065`.
- A migration `0001_foundation_schemas.sql` materializa schemas de dominio,
  incluindo `api`, `private`, `journey`, `commercial`, `finance`, `docs`,
  `audit`, `analytics` e `comms`.
- A migration `0028_public_schema_compatibility_boundary.sql` registra `public`
  como fachada de compatibilidade, nao como schema de negocio.
- Grants, RLS e politicas estao versionados em migrations como `0001`, `0002`,
  `0026`, `0054` e `0065`.
- A politica de buckets privados esta documentada em
  `docs/execution/storage-upload-policy.md` e materializada em
  `0026_storage_private_buckets_and_policies.sql`.

### Longitudinalidade e Paciente 360

- `audit.audit_events` e `audit.patient_timeline_events` existem desde
  `0001_foundation_schemas.sql`.
- Leituras curadas de Paciente 360 e feed longitudinal aparecem em
  `0010_patient_360_curated_reads.sql` e
  `0016_patient_360_runtime_reads.sql`.
- O app do paciente saiu do store persistido antigo: o arquivo
  `src/modules/patient-app/state/patient-app-store.ts` nao existe mais.
- O cockpit e os logs do app do paciente usam contratos de backend real em
  `0038_patient_app_cockpit_and_habit_log_rpcs.sql`,
  `0039_patient_app_checkin_and_timeline.sql`,
  `apps/api/src/modules/patient-app` e `src/modules/patient-app/api`.

### Operacao clinica, comercial e financeira

- Agenda, fila, atendimento e retorno ja possuem base runtime e RPCs em
  migrations como `0020` a `0035`.
- Prontuario, encounter, care plan e nutricao estruturada foram avancados em
  `0049` a `0053`.
- O dominio comercial existe no runtime em `0036`, `0037`, `0040`, `0041`,
  `0042` e `0043`.
- O financeiro clinico existe separado em `0044_runtime_finance_domain_and_patient_summary.sql`.
- O billing SaaS existe separado em `platform.*`, com `tenant_plans`,
  `tenant_subscriptions`, `usage_meters`, gateway e webhook nas migrations
  `0045` a `0048` e nas Edge Functions `billing-gateway` e `billing-webhook`.

### Base documental e prescricoes da Etapa 9

- A fundacao de documentos e prescricoes estruturadas existe em
  `0054_runtime_docs_and_prescriptions_foundation.sql`.
- Prescricoes estruturadas e wrapper publico controlado aparecem em `0055` e
  `0056`.
- Documentos, artifacts, signatures, layout/branding e compatibilidade runtime
  aparecem em `0057` a `0065`.
- As Edge Functions documentais existem: `document-printable`,
  `document-signature-dispatch` e `document-signature-webhook`.
- O detalhe do encounter ja expoe signed URLs temporarias via
  `GET /documents/:id/access-links`, com consumo em
  `src/modules/clinical/api/get-document-access-links.ts` e
  `src/modules/clinical/hooks/use-document-access-links.ts`.

## Parcialmente resolvido

### `apps/api` e Prisma como ponte

- `apps/api` continua necessario como camada transicional para composicao,
  sessao da aplicacao e rotas existentes.
- `prisma/schema.prisma` continua como inventario/compatibilidade do legado, nao
  como fonte autoritativa final.
- O checklist registra writes residuais, especialmente lead e atividade,
  projetando do legado para o runtime.

### Seeds e fixtures

- `supabase/seeds` existe, mas contem apenas `.gitkeep`.
- Os seeds operacionais reais estao em scripts TypeScript:
  `runtime:seed`, `runtime:seed:direct`, `runtime:seed:hybrid`,
  `prisma:seed` e `prisma:seed:level2`.
- Isso e funcional para a transicao, mas ainda nao e um fluxo puramente
  Supabase-first em `supabase/seeds`.

### Documentos e compliance operacional

- A fundacao documental, artefatos finais, layout, dispatch auditavel e signed
  URLs no encounter ja existem.
- A Etapa 9 ainda nao fecha porque faltam verificacao criptografica integrada a
  provedor real de assinatura, evidencia juridica final consolidada e superficies
  documentais administrativas fora do detalhe do encounter.

### Setup local e smokes

- Docker Compose e CI usam Postgres local nas portas `55432` e `55433`.
- Smokes locais dependem do Postgres local iniciado, migrations aplicadas e seeds
  carregados.
- Smokes reais de auth/frontend dependem de secrets Supabase disponiveis no
  ambiente.

## Bloqueantes atuais

- Integrar verificacao criptografica com provedor real de assinatura documental.
- Consolidar evidencia juridica final para documentos assinados.
- Expor download seguro/signed URL para artefatos documentais fora do detalhe do
  encounter.
- Consolidar um centro documental administrativo.
- Manter `npm run api:smoke` condicionado a Postgres local em `55432`, shadow DB
  em `55433`, migrations e seeds aplicados.

## Melhorias futuras

- Reduzir writes residuais Prisma-first ate que o runtime Supabase seja a origem
  primaria tambem nesses fluxos.
- Migrar fixtures operacionais para um fluxo Supabase-first mais direto quando a
  transicao permitir.
- Implementar Etapa 11: notificacoes, chat e comunidade, com gating por
  entitlement.
- Implementar Etapa 12: observabilidade, seguranca avancada, alertas, Sentry e
  monitoramento de RLS/buckets.
- Implementar Etapa 13: testes SQL, testes de Edge Functions, isolamento por
  tenant, restore plan, DR e homologacao formal.
- Implementar Etapa 14: pos-go-live, performance, analytics avancada e expansao
  controlada.

## Obsoleto ou substituido

As afirmacoes antigas abaixo nao representam mais o estado atual:

- "Nao existe workspace Supabase oficial." Substituido por `supabase/` com
  migrations `0001` a `0065` e Edge Functions.
- "Nao ha schemas `api` e `private` versionados." Substituido por
  `0001_foundation_schemas.sql`.
- "Nao ha RLS, grants minimos ou default deny no git." Substituido por RLS e
  grants versionados nas migrations de fundacao, storage, billing, documentos e
  dominios operacionais.
- "Nao existe `audit.audit_events` ou `audit.patient_timeline_events`."
  Substituido pela fundacao de auditoria em `0001`.
- "O app do paciente persiste logs clinicos em Zustand." Substituido por cockpit
  e quick actions com backend real; o store persistido antigo foi removido.
- "`commercial`, `finance`, `docs`, `audit` e billing SaaS nao existem."
  Substituido pelas migrations `0036` a `0048` e `0054` a `0065`.

## O que fazer agora

1. Manter a Etapa 9 como foco tecnico atual.
2. Fechar assinatura real, evidencia juridica final e centro documental
   administrativo com download seguro fora do encounter.
3. Continuar removendo dependencias residuais Prisma-first de fluxos centrais,
   sem expandir `apps/api` como backend final.
