# Controle de Execucao e Checklist Mestre

Este e o documento de controle operacional do projeto.
Ele existe para evitar perda de contexto, salto de etapa e retrabalho.

## Fontes de verdade

- [README.md](../../README.md)
- [Operating System](./operating-system.md)
- [ADR 0001](../adr/0001-emagreceplus-supabase-runtime.md)
- [Matriz de fusao](../fusion/module-matrix.md)
- [Gap analysis](./gap-analysis.md)
- [Environments and deploys](./environments-and-deploys.md)
- [Prisma freeze and transition](./prisma-freeze-and-transition.md)
- [Public schema boundary](./public-schema-boundary.md)
- [Storage upload policy](./storage-upload-policy.md)
- [Supabase workspace](../../supabase/README.md)

## Como usar este arquivo

- Atualizar o status da etapa antes de abrir uma nova frente relevante.
- Marcar apenas o que tem evidencia concreta no repositorio.
- Nao promover etapa por intuicao; so promover por criterio de saida.
- Registrar benchmark do SlimCare apenas como referencia de produto e UX.
- Nao usar o SlimCare para justificar heranca de arquitetura ruim.

## Legenda de status

- `done`: etapa concluida com evidencia no repositorio
- `in_progress`: etapa ativa neste momento
- `queued`: proxima etapa pronta para entrar
- `blocked`: etapa dependente de pre-condicao externa ou anterior
- `later`: etapa futura, sem inicio autorizado ainda

## Travas de passagem

- Nao iniciar Etapa 5 sem Etapa 4 minimamente fechada.
- Nao iniciar Etapa 6 sem modelo de identidade, tenant e escopo por unidade.
- Nao iniciar Etapa 7 sem persistencia backend definida para jornada do paciente.
- Nao iniciar Etapa 9 sem buckets privados, auditoria e base documental claras.
- Nao iniciar Etapa 10 sem separar financeiro clinico de billing SaaS.
- Nao iniciar Etapa 11 antes do core longitudinal estar estavel.

## Estado atual

- Data de referencia: `2026-04-25`
- Etapa ativa: `Etapa 9 -> documentos, prescricoes e compliance operacional`
- Ultima etapa concluida: `Etapa 8 -> prontuario, encounter, care plan e nutricao estruturada`
- Risco principal atual: os maiores gaps tecnicos agora ficam concentrados no fechamento juridico-operacional da Etapa 9, especialmente verificacao criptografica por provedor real de assinatura, evidencia juridica final e superficies documentais fora do encounter

## Resumo do roadmap

| Etapa | Nome | Status | Gate para avancar |
| --- | --- | --- | --- |
| 0 | Governanca e freeze arquitetural | done | docs-base e regras de execucao no repo |
| 1 | Infra cloud-only e ambientes | done | estrategia de pipeline, branching e ambientes definida |
| 2 | Fundacao Supabase e hardening inicial | done | primeira migration aplicada e fundacao segura em evolucao |
| 3 | Migracao de schema e abandono do Prisma como fonte de verdade | done | schemas base e convencoes SQL definidos |
| 4 | Identidade, memberships e autorizacao | done | fundacao Supabase e naming estabilizados |
| 5 | Nucleo longitudinal e paciente 360 | done | identidade e helpers de acesso funcionando |
| 6 | Agenda -> fila -> atendimento -> retorno | done | longitudinalidade e escopo operacional no banco |
| 7 | App do paciente com cockpit real | done | jornada do paciente persistindo no backend |
| 8 | Prontuario, encounter, care plan e nutricao estruturada | done | fluxo operacional e encounter no banco |
| 9 | Documentos, prescricoes e compliance | in_progress | storage privado e pipeline documental base |
| 10 | Comercial, elegibilidade e financeiro | done | separacao formal de dominios e gatilhos de cobranca |
| 11 | Notificacoes, chat e comunidade | later | core clinico/comercial estavel |
| 12 | Observabilidade, seguranca avancada e resiliencia | later | fluxos centrais rodando em staging |
| 13 | Testes, homologacao, DR e go-live | later | cobertura critica e restore plan disponiveis |
| 14 | Pos-go-live e expansao controlada | later | go-live controlado realizado |

## Benchmark SlimCare por frente

Usar como referencia de produto:

- Cockpit do paciente: [PatientHome.jsx](../../../slim-care-flow/src/pages/PatientHome.jsx)
- Caso/Paciente 360: [PatientCase.jsx](../../../slim-care-flow/src/pages/portal/PatientCase.jsx)
- Agenda operacional: [Agenda.jsx](../../../slim-care-flow/src/pages/portal/Agenda.jsx)
- Atendimento ao vivo: [ClinicalEncounter.jsx](../../../slim-care-flow/src/pages/portal/ClinicalEncounter.jsx)
- Modelo de dados alvo: [DATA_MODEL_OVERVIEW.md](../../../slim-care-flow/supabase/docs/DATA_MODEL_OVERVIEW.md)
- Mapa por pagina: [PAGE_BY_PAGE_MIGRATION_MAP.md](../../../slim-care-flow/supabase/docs/PAGE_BY_PAGE_MIGRATION_MAP.md)

Nao herdar do SlimCare:

- repositorio gigante centralizado em [repository.js](../../../slim-care-flow/src/lib/backend/repository.js)
- agregacao pesada no cliente
- regra critica espalhada no frontend

## Etapa 0 - Governanca, contexto e freeze arquitetural

Status: `done`

Checklist:

- [x] ADR oficial criada
- [x] Matriz de fusao criada
- [x] Gap analysis criado
- [x] Workspace `supabase/` inicial criado
- [x] Regras de execucao registradas no repositorio
- [x] README atualizado com a nova fonte de verdade

Evidencias:

- [ADR 0001](../adr/0001-emagreceplus-supabase-runtime.md)
- [Operating System](./operating-system.md)
- [Matriz de fusao](../fusion/module-matrix.md)
- [Gap analysis](./gap-analysis.md)

## Etapa 1 - Infra cloud-only e ambientes

Status: `done`

Objetivo:

- Tirar a evolucao do modo improvisado e preparar pipeline disciplinado para staging e prod.

Checklist:

- [x] Confirmar estrategia de branches: `main`, `staging`, `feature/*`
- [x] Declarar pipeline alvo de CI/CD no repo
- [x] Definir preview deploy por PR
- [x] Definir projetos Supabase de `staging` e `prod`
- [x] Definir politica de secrets apenas em provedores cloud
- [x] Definir contrato de variaveis de ambiente browser/server
- [x] Registrar fluxo de deploy e rollback

Evidencia atual:

- [README.md](../../README.md)
- [control-checklist.md](./control-checklist.md)
- [ci-smokes.yml](../../.github/workflows/ci-smokes.yml)
- [vercel-preview.yml](../../.github/workflows/vercel-preview.yml)
- [environments-and-deploys.md](./environments-and-deploys.md)
- [.env.example](../../.env.example)

Observacao atual:

- `origin/staging` foi criada a partir de `origin/main`.
- A tentativa de habilitar branch protection via API retornou `403` por limitacao do plano atual do GitHub neste repositorio privado; isso nao impede o fechamento da etapa no repo.

## Etapa 2 - Fundacao Supabase e hardening inicial

Status: `done`

Objetivo:

- Criar o backend alvo com postura de seguranca correta desde o inicio.

Checklist:

- [x] Criar migrations base em `supabase/migrations`
- [x] Criar schemas `api` e `private`
- [x] Criar schemas faltantes do plano: `journey`, `commercial`, `finance`, `docs`, `audit`, `analytics`, `comms`
- [x] Remover `public` como schema de negocio
- [x] Registrar grants minimos
- [x] Definir padrao de `alter default privileges`
- [x] Criar buckets privados necessarios
- [x] Registrar politica de upload por MIME, tamanho e path
- [x] Definir uso de chave browser vs server

Saida obrigatoria:

- Pelo menos uma migration base com schemas, grants iniciais e convencoes

Evidencia atual:

- [0001_foundation_schemas.sql](../../supabase/migrations/0001_foundation_schemas.sql)
- [0002_identity_access_core.sql](../../supabase/migrations/0002_identity_access_core.sql)
- [0026_storage_private_buckets_and_policies.sql](../../supabase/migrations/0026_storage_private_buckets_and_policies.sql)
- [0028_public_schema_compatibility_boundary.sql](../../supabase/migrations/0028_public_schema_compatibility_boundary.sql)
- [environments-and-deploys.md](./environments-and-deploys.md)
- [public-schema-boundary.md](./public-schema-boundary.md)
- [storage-upload-policy.md](./storage-upload-policy.md)

Observacao atual:

- A `0026` registrou buckets privados fundacionais (`brand-assets`, `profile-avatars`, `patient-documents`, `clinical-attachments`) e as politicas base de MIME, tamanho e prefixo de path, com RLS em `storage.objects` apoiada no contexto atual de tenant, perfil e paciente.
- A `0026` ja foi aplicada no staging e o alinhamento atual ficou `0001` a `0026` tanto local quanto remoto.
- A `0028` endureceu o boundary do schema `public`, revogou `create` para papeis operacionais, registrou `public` como fachada de compatibilidade e validou que nao existem relacoes de negocio no schema.

## Etapa 3 - Migracao de schema e abandono do Prisma como fonte de verdade

Status: `done`

Objetivo:

- Transformar o que hoje vive em `prisma/schema.prisma` em SQL nativo versionado.

Checklist:

- [x] Congelar `prisma/schema.prisma` como referencia de migracao
- [x] Mapear tabelas existentes para o desenho alvo em Supabase
- [x] Decidir o que permanece, o que muda de schema e o que morre
- [x] Criar enums e status oficiais do produto final
- [x] Definir FKs, indices, uniques e checks
- [x] Reescrever seeds para o fluxo Supabase

Evidencia atual:

- [schema.prisma](../../prisma/schema.prisma)
- [migration.sql](../../prisma/migrations/20260420013956_init_platform_identity_patients_crm_scheduling_clinical/migration.sql)
- [0011_patient_clinical_scheduling_runtime_base.sql](../../supabase/migrations/0011_patient_clinical_scheduling_runtime_base.sql)
- [prisma-freeze-and-transition.md](./prisma-freeze-and-transition.md)
- [seed-runtime-homologation.ts](../../scripts/seed-runtime-homologation.ts)
- [seed-runtime-direct-fixtures.ts](../../scripts/seed-runtime-direct-fixtures.ts)
- [0027_runtime_scope_idempotent_legacy_keys.sql](../../supabase/migrations/0027_runtime_scope_idempotent_legacy_keys.sql)
- [supabase/README.md](../../supabase/README.md)

Observacao atual:

- `npm run runtime:seed` passa a ser o ponto de entrada operacional Supabase-first da homologacao, executando o seed direto nativo por padrao.
- `npm run runtime:seed:hybrid` preserva a trilha transicional quando ainda for necessario incluir seed legado e backfill runtime na mesma execucao.
- `npm run runtime:seed:direct` cria um pacote minimo de fixtures diretamente no runtime Supabase, incluindo tenant, unidades, referencias, paciente, agenda, encounter e logs basicos, sem depender do Prisma legado.
- A `0027` endureceu `api.backfill_runtime_scope` com chaves unicas de `legacy_tenant_id` e `legacy_unit_id`, limpou o tenant duplicado da fixture runtime e deixou o seed direto idempotente sob reexecucao sequencial.
- O legado continua existindo como ponte para testes locais baseados em Prisma, mas a trilha operacional de homologacao ja nasce no runtime Supabase.

## Etapa 4 - Identidade, memberships e autorizacao

Status: `done`

Objetivo:

- Fechar o nucleo multi-tenant e permissionado do produto.

Checklist:

- [x] Criar `profiles`, `memberships`, `unit_memberships`, `roles`, `permissions`, `role_permissions`
- [x] Ligar `/auth/me` e guard do `apps/api` ao contexto vindo de `api.current_app_session()`
- [x] Criar bootstrap/backfill dedicado para `profiles`, `memberships` e `unit_memberships`
- [x] Definir bootstrap de onboarding de tenant via RPC
- [x] Definir snapshot operacional de equipe, papeis e unidades do tenant
- [x] Definir emissao e revogacao de convites de equipe
- [x] Fechar aceite de convite ponta a ponta sem dependencia do auth legado
- [x] Criar helpers `private.current_profile_id()`
- [x] Criar helpers `private.current_tenant_id()`
- [x] Criar helpers `private.current_unit_ids()`
- [x] Criar helpers `private.has_permission(code text)`
- [x] Criar helpers `private.can_access_patient(patient_id uuid)`
- [x] Aplicar RLS por tenant e unidade

Benchmark SlimCare:

- [DATA_MODEL_OVERVIEW.md](../../../slim-care-flow/supabase/docs/DATA_MODEL_OVERVIEW.md) para papeis, perfis e permissoes

Evidencia atual:

- [0002_identity_access_core.sql](../../supabase/migrations/0002_identity_access_core.sql)
- [0003_auth_projection_bridge.sql](../../supabase/migrations/0003_auth_projection_bridge.sql)
- [0004_public_rpc_compat.sql](../../supabase/migrations/0004_public_rpc_compat.sql)
- [0005_access_onboarding_invites.sql](../../supabase/migrations/0005_access_onboarding_invites.sql)
- [0006_fix_access_invite_citext_casts.sql](../../supabase/migrations/0006_fix_access_invite_citext_casts.sql)
- [0007_relax_team_invitation_email_guard.sql](../../supabase/migrations/0007_relax_team_invitation_email_guard.sql)
- [0008_fix_team_invitation_pgcrypto_schema.sql](../../supabase/migrations/0008_fix_team_invitation_pgcrypto_schema.sql)
- [0009_accept_team_invitation_on_first_login.sql](../../supabase/migrations/0009_accept_team_invitation_on_first_login.sql)
- [auth.service.ts](../../apps/api/src/modules/auth/auth.service.ts)
- [request-context.ts](../../apps/api/src/common/auth/request-context.ts)
- [supabase-request.ts](../../apps/api/src/lib/supabase-request.ts)
- [backfill-auth-projection.ts](../../scripts/backfill-auth-projection.ts)
- [settings.controller.ts](../../apps/api/src/modules/settings/settings.controller.ts)
- [settings.service.ts](../../apps/api/src/modules/settings/settings.service.ts)
- [settings page](../../src/app/(dashboard)/settings/page.tsx)
- [settings-access-screen.tsx](../../src/modules/settings/components/settings-access-screen.tsx)

Validacao recente:

- `supabase migration list`: `0001` a `0010` locais e remotas
- `supabase db push`: `0009` e `0010` aplicadas no staging
- `npm run api:typecheck`: ok
- `npm run api:build`: ok
- `API_AUTH_MODE=real NEXT_PUBLIC_AUTH_MODE=real npm run api:smoke`: ok, cobrindo aceite de convite sem espelho local, `settings/access` e a RPC `patient_360`

## Etapa 5 - Nucleo longitudinal e paciente 360

Status: `done`

Objetivo:

- Fazer o paciente virar o centro operacional real do produto.

Checklist:

- [x] Criar `audit.audit_events`
- [x] Criar `audit.patient_timeline_events`
- [x] Definir payload minimo e estavel do feed longitudinal
- [x] Criar `api.patient_360`
- [x] Criar `api.patient_longitudinal_feed`
- [x] Criar `api.patient_operational_alerts`
- [x] Criar `api.patient_commercial_context`
- [x] Criar `api.patient_adherence_summary`
- [x] Migrar a tela 360 atual para consumir o backend curado
- [x] Sincronizar writes legados criticos para manter a projecao runtime do Paciente 360 atualizada
- [x] Colocar `POST /patients` para usar uma RPC nativa dedicada no runtime Supabase
- [x] Preparar a escrita nativa dedicada de agenda (`appointments`) com fallback seguro para o sync incremental
- [x] Aplicar a escrita dedicada de agenda no staging e validar o Paciente 360 sem colisao de `legacy_appointment_id`
- [x] Aplicar a escrita dedicada de `encounters` no staging e alinhar `anamnesis`, `soap` e `clinical task` com ids runtime reais

Benchmark SlimCare:

- [PatientCase.jsx](../../../slim-care-flow/src/pages/portal/PatientCase.jsx)
- `src/components/case/*`
- `src/components/portal/case/*`

Evidencia atual no EmagrecePlus:

- [0010_patient_360_curated_reads.sql](../../supabase/migrations/0010_patient_360_curated_reads.sql)
- [0011_patient_clinical_scheduling_runtime_base.sql](../../supabase/migrations/0011_patient_clinical_scheduling_runtime_base.sql)
- [0012_runtime_backfill_rpc.sql](../../supabase/migrations/0012_runtime_backfill_rpc.sql)
- [0013_public_backfill_rpc_wrappers.sql](../../supabase/migrations/0013_public_backfill_rpc_wrappers.sql)
- [0014_fix_public_backfill_wrappers_volatile.sql](../../supabase/migrations/0014_fix_public_backfill_wrappers_volatile.sql)
- [0015_relax_meal_log_adherence_scale.sql](../../supabase/migrations/0015_relax_meal_log_adherence_scale.sql)
- [0016_patient_360_runtime_reads.sql](../../supabase/migrations/0016_patient_360_runtime_reads.sql)
- [0017_runtime_patient_write_rpc.sql](../../supabase/migrations/0017_runtime_patient_write_rpc.sql)
- [0018_fix_runtime_patient_write_tenant_resolution.sql](../../supabase/migrations/0018_fix_runtime_patient_write_tenant_resolution.sql)
- [0019_fix_runtime_patient_write_upsert_strategy.sql](../../supabase/migrations/0019_fix_runtime_patient_write_upsert_strategy.sql)
- [0020_runtime_appointment_write_rpc.sql](../../supabase/migrations/0020_runtime_appointment_write_rpc.sql)
- [0021_runtime_encounter_write_rpc.sql](../../supabase/migrations/0021_runtime_encounter_write_rpc.sql)
- [runtime-appointment-writes.ts](../../apps/api/src/common/runtime/runtime-appointment-writes.ts)
- [runtime-encounter-writes.ts](../../apps/api/src/common/runtime/runtime-encounter-writes.ts)
- [runtime-patient-projection.ts](../../apps/api/src/common/runtime/runtime-patient-projection.ts)
- [runtime-patient-writes.ts](../../apps/api/src/common/runtime/runtime-patient-writes.ts)
- [patients.controller.ts](../../apps/api/src/modules/patients/patients.controller.ts)
- [patients.service.ts](../../apps/api/src/modules/patients/patients.service.ts)
- [scheduling.service.ts](../../apps/api/src/modules/scheduling/scheduling.service.ts)
- [clinical.service.ts](../../apps/api/src/modules/clinical/clinical.service.ts)
- [backfill-runtime-foundation.ts](../../scripts/backfill-runtime-foundation.ts)
- [api-smoke.ts](../../scripts/api-smoke.ts)
- [patient page](../../src/app/(dashboard)/patients/[id]/page.tsx)

Observacao de bloqueio atual:

- A `0011` materializou a base relacional minima de `patients`, `scheduling` e `clinical` no runtime Supabase, com FKs, indices, triggers de `updated_at` e RLS preparada para a fase seguinte.
- As `0012` a `0015` fecharam o backfill legado do dominio longitudinal por RPC, incluindo compatibilidade publica e ajuste de aderencia alimentar para refletir a escala real do produto.
- A `0016` substituiu o scaffold de `api.patient_360` por leituras SQL reais do runtime Supabase para pacientes ja materializados.
- As `0017` a `0019` colocaram a primeira escrita nativa dedicada no runtime: `upsert_runtime_patient_from_legacy`, usada por `POST /patients`, com resolucao interna de tenant runtime e estrategia de upsert compativel com o indice de `legacy_patient_id`.
- `POST /patients`, writes de agenda e mutacoes clinicas basicas agora disparam um sync incremental da projecao runtime por paciente, reduzindo a janela em que o Paciente 360 ficava desatualizado depois de um write legado.
- O sync incremental passou a reutilizar o `runtime patient id` real quando o paciente ja nasceu pela RPC dedicada, evitando colisao entre ids deterministas antigos e o runtime atual.
- A `0020` virou a segunda escrita dedicada do runtime com `upsert_runtime_appointment_from_legacy`, mais helpers de resolucao por ids legados e um helper Node dedicado para agenda; ela ja esta aplicada no staging.
- O `runtime-patient-projection` passou a reaproveitar o `runtime appointment id` real antes de reprocessar agenda e encounters, eliminando a colisao no indice `legacy_appointment_id` quando a agenda ja nasceu pela RPC dedicada.
- A `0021` virou a terceira escrita dedicada do runtime com `upsert_runtime_encounter_from_legacy`, mais helpers para resolver `appointment` e `encounter` por ids legados e um helper Node dedicado para encounter.
- `clinical.service` agora usa projecoes dedicadas para `createTask`, `saveAnamnesis` e `saveSoapNote`, com fallback seguro para o sync incremental do paciente so se a projecao dedicada falhar.
- O `runtime-patient-projection` passou a reaproveitar o `runtime encounter id` real antes de reprocessar `anamnesis`, `consultation_notes` e `clinical_tasks`, evitando colisao futura no indice `legacy_encounter_id` quando o encounter ja nasceu pela RPC dedicada.
- `GET /patients/:id` agora materializa o paciente no runtime sob demanda e reler `api.patient_360` antes de responder, removendo o fallback direto para Prisma na resposta do detalhe.
- A conversao de lead passou a sincronizar o paciente convertido para o runtime logo apos a transacao comercial, reduzindo a janela de scaffold para novos pacientes vindos do CRM.
- A `0037` substituiu o placeholder de `api.patient_commercial_context` por leitura runtime real baseada em `commercial.conversions`, levando o detalhe do paciente convertido a refletir o contexto comercial sem fallback direto ao Prisma.

Validacao recente:

- `supabase migration list`: `0001` a `0021` locais e remotas
- `supabase db push`: `0021_runtime_encounter_write_rpc.sql` aplicada no staging
- `npm run runtime:backfill`: ok, materializando tenant, unidades, referenciais, pacientes, agenda, encounter, care plans, tarefas e logs clinicos no runtime Supabase
- `npm run api:typecheck`: ok
- `npm run api:build`: ok
- `API_AUTH_MODE=real NEXT_PUBLIC_AUTH_MODE=real npm run api:smoke`: ok, cobrindo `GET /patients/:id` com paciente criado via API, fixture runtime e paciente convertido do CRM ja lidos via runtime, agenda dedicada no runtime, encounter/anamnesis/soap/task dedicados, `commercialContext.hasCommercialContext=true` para o paciente convertido e a RPC `patient_360` com `supabase_runtime`

## Etapa 6 - Agenda -> fila -> atendimento -> retorno

Status: `done`

Objetivo:

- Fechar o fluxo operacional mais valioso com transicao de estado no banco.

Checklist:

- [x] Definir estados oficiais de `appointment`
- [x] Definir estados oficiais de `encounter`
- [x] Criar RPC `api.create_appointment`
- [x] Criar RPC `api.confirm_appointment`
- [x] Criar RPC `api.reschedule_appointment`
- [x] Criar RPC `api.cancel_appointment`
- [x] Criar RPC `api.register_checkin`
- [x] Criar RPC `api.enqueue_patient`
- [x] Criar RPC `api.start_encounter`
- [x] Criar RPC `api.autosave_encounter_section`
- [x] Criar RPC `api.complete_encounter`
- [x] Criar RPC `api.schedule_return`
- [x] Garantir auditoria e timeline por transicao

Benchmark SlimCare:

- [Agenda.jsx](../../../slim-care-flow/src/pages/portal/Agenda.jsx)
- [ClinicalEncounter.jsx](../../../slim-care-flow/src/pages/portal/ClinicalEncounter.jsx)
- `src/components/agenda/*`
- `src/components/clinical/*`

Evidencia atual:

- [0022_runtime_operational_flow_rpc.sql](../../supabase/migrations/0022_runtime_operational_flow_rpc.sql)
- [0023_fix_operational_flow_audit_overloads.sql](../../supabase/migrations/0023_fix_operational_flow_audit_overloads.sql)
- [0024_runtime_appointment_operational_rpcs.sql](../../supabase/migrations/0024_runtime_appointment_operational_rpcs.sql)
- [0025_runtime_attendance_queue_rpcs.sql](../../supabase/migrations/0025_runtime_attendance_queue_rpcs.sql)
- [0029_runtime_schedule_return_rpc.sql](../../supabase/migrations/0029_runtime_schedule_return_rpc.sql)
- [0030_runtime_autosave_encounter_section_rpc.sql](../../supabase/migrations/0030_runtime_autosave_encounter_section_rpc.sql)
- [0031_runtime_encounter_autosave_overlay_rpcs.sql](../../supabase/migrations/0031_runtime_encounter_autosave_overlay_rpcs.sql)
- [0032_runtime_anamnesis_upsert_rpc.sql](../../supabase/migrations/0032_runtime_anamnesis_upsert_rpc.sql)
- [0033_runtime_schedule_curated_reads.sql](../../supabase/migrations/0033_runtime_schedule_curated_reads.sql)
- [0034_public_schedule_curated_read_wrapper.sql](../../supabase/migrations/0034_public_schedule_curated_read_wrapper.sql)
- [0035_runtime_dashboard_operational_summary.sql](../../supabase/migrations/0035_runtime_dashboard_operational_summary.sql)
- [runtime-appointment-writes.ts](../../apps/api/src/common/runtime/runtime-appointment-writes.ts)
- [runtime-encounter-drafts.ts](../../apps/api/src/common/runtime/runtime-encounter-drafts.ts)
- [runtime-encounter-writes.ts](../../apps/api/src/common/runtime/runtime-encounter-writes.ts)
- [dashboard.service.ts](../../apps/api/src/modules/dashboard/dashboard.service.ts)
- [dashboard.controller.ts](../../apps/api/src/modules/dashboard/dashboard.controller.ts)
- [scheduling.controller.ts](../../apps/api/src/modules/scheduling/scheduling.controller.ts)
- [scheduling.service.ts](../../apps/api/src/modules/scheduling/scheduling.service.ts)
- [clinical.controller.ts](../../apps/api/src/modules/clinical/clinical.controller.ts)
- [clinical.service.ts](../../apps/api/src/modules/clinical/clinical.service.ts)
- [api-smoke.ts](../../scripts/api-smoke.ts)
- [anamnesis-form.tsx](../../src/modules/clinical/components/anamnesis-form.tsx)
- [soap-note-form.tsx](../../src/modules/clinical/components/soap-note-form.tsx)
- [autosave-encounter-section.ts](../../src/modules/clinical/api/autosave-encounter-section.ts)
- [use-autosave-encounter-section.ts](../../src/modules/clinical/hooks/use-autosave-encounter-section.ts)
- [appointment-details-drawer.tsx](../../src/modules/scheduling/components/appointment-details-drawer.tsx)
- [enqueue-patient.ts](../../src/modules/scheduling/api/enqueue-patient.ts)
- [use-enqueue-patient.ts](../../src/modules/scheduling/hooks/use-enqueue-patient.ts)
- [start-encounter.ts](../../src/modules/scheduling/api/start-encounter.ts)
- [use-start-encounter.ts](../../src/modules/scheduling/hooks/use-start-encounter.ts)
- [page.tsx](../../src/app/(dashboard)/clinical/encounters/[id]/page.tsx)
- [encounter-header.tsx](../../src/modules/clinical/components/encounter-header.tsx)
- [complete-encounter.ts](../../src/modules/clinical/api/complete-encounter.ts)
- [use-complete-encounter.ts](../../src/modules/clinical/hooks/use-complete-encounter.ts)
- [schedule-return.ts](../../src/modules/clinical/api/schedule-return.ts)
- [use-schedule-return.ts](../../src/modules/clinical/hooks/use-schedule-return.ts)

Observacao de estado atual:

- O backend agora expoe `PATCH /appointments/:id/enqueue`, `PATCH /appointments/:id/start-encounter` e `PATCH /encounters/:id/complete`, trocando o atalho antigo do smoke que criava `encounter` direto via Prisma.
- A agenda ganhou CTA de `Encaminhar para fila` e `Iniciar atendimento` no drawer, e a tela do encounter ganhou CTA de `Concluir atendimento`, deixando o fluxo operacional acessivel sem rota escondida.
- A `0022` ja esta aplicada no staging e cobre `api.start_encounter` e `api.complete_encounter`, atualizando `appointment.status` para `in_progress/completed` e `encounter.status` para `open/closed`.
- A `0024` levou a mesma estrategia para a agenda critica com `api.create_appointment`, `api.confirm_appointment`, `api.register_checkin`, `api.cancel_appointment`, `api.reschedule_appointment` e `api.register_no_show`, todos com wrappers `public.*`, auditoria e timeline no runtime.
- `scheduling.service` agora tenta primeiro a operacao dedicada correspondente e so cai para a projecao generica de agenda se a RPC dedicada falhar; no smoke mais recente nao houve log de fallback dessas operacoes.
- A `0025` criou `scheduling.attendance_queue`, a RPC `api.enqueue_patient` e a propagacao transacional da fila dentro de `api.start_encounter` e `api.complete_encounter`, com auditoria e timeline dedicadas para `waiting -> in_attendance -> completed`.
- A `0029` fechou `api.schedule_return` no runtime, reaproveitando a esteira de criacao de agendamento e registrando auditoria/timeline dedicada para a passagem `encounter -> retorno`.
- O smoke e a UI agora cobrem `check-in -> fila -> atendimento -> conclusao -> retorno`, sem rota oculta nem leitura direta improvisada do runtime.
- A `0023` entrou como shim compativel para o helper de auditoria/timeline do runtime e ja esta aplicada no staging, eliminando o fallback incremental nas transicoes operacionais de `start/complete encounter`.
- A `0030` adicionou `api.autosave_encounter_section` com suporte inicial a `anamnesis` e `soap_draft`, incluindo protecao temporal para nao deixar um autosave antigo recriar ou sobrescrever dados depois do salvamento oficial.
- A `0031` substituiu as leituras e a limpeza do rascunho por RPCs (`get_encounter_autosave_overlay` e `clear_encounter_soap_draft`), removendo a dependencia de acesso REST direto a schemas privados do runtime.
- A `0032` introduziu `upsert_runtime_anamnesis` por `encounter_id`, permitindo que o sync oficial reutilize a linha criada pelo autosave e eliminando o fallback por conflito de `anamneses_encounter_id_key`.
- A tela do encounter agora autosalva rascunho de anamnese e SOAP com debounce, mostra status de rascunho na UI e limpa o `soapDraft` depois do registro oficial da evolucao.
- A `0033` levou `GET /appointments` para uma leitura curada do runtime Supabase, com filtros por data/status/profissional/unidade, preservando os `legacy ids` no contrato HTTP para nao quebrar as rotas operacionais existentes.
- A `0034` fechou a compatibilidade da RPC de agenda pela fachada `public`, alinhando o PostgREST com o padrao que ja vinha sendo usado nas RPCs curadas acessadas pelo backend em modo real.
- A `0035` moveu o miolo operacional de `GET /dashboard/summary` para o runtime Supabase, cobrindo agenda do dia, no-show recente, flags de risco e tarefas clinicas abertas por unidade, enquanto a parte comercial do card continua temporariamente no Prisma ate o schema `commercial` deixar de ser apenas reservado e virar dominio operacional de verdade.

Validacao recente:

- `npm run api:build`: ok
- `npm run api:typecheck`: ok
- `npm run build`: ok
- `supabase db push`: `0030` a `0035` aplicadas no staging
- `API_AUTH_MODE=real NEXT_PUBLIC_AUTH_MODE=real npm run api:smoke`: ok cobrindo `GET /dashboard/summary` via runtime operacional, `GET /appointments` via runtime e o fluxo `create -> confirm -> check-in -> enqueue -> reschedule/cancel/no-show -> start encounter -> autosave anamnesis -> autosave soap draft -> GET /encounters/:id com overlay -> anamnesis oficial -> soap oficial -> limpeza do draft -> complete encounter -> schedule return`
- `supabase migration list`: `0001` a `0035` locais e remotas

## Etapa 7 - App do paciente com cockpit real

Status: `done`

Objetivo:

- Manter a boa UX do SlimCare, mas tirar a fonte clinica de verdade do estado local.

Checklist:

- [x] Definir summary backend do cockpit do paciente
- [x] Converter quick actions em modais/sheets transacionais
- [x] Persistir agua no backend
- [x] Persistir refeicoes no backend
- [x] Persistir treinos no backend
- [x] Persistir sono no backend
- [x] Persistir sintomas no backend
- [x] Persistir check-in diario no backend
- [x] Garantir reflexo na timeline e nos indicadores
- [x] Remover `zustand persist` como fonte definitiva de logs clinicos

Benchmark SlimCare:

- [PatientHome.jsx](../../../slim-care-flow/src/pages/PatientHome.jsx)
- `src/components/patient/*`
- `src/components/intelligence/*`

Evidencia atual no EmagrecePlus:

- [0038_patient_app_cockpit_and_habit_log_rpcs.sql](../../supabase/migrations/0038_patient_app_cockpit_and_habit_log_rpcs.sql)
- [0039_patient_app_checkin_and_timeline.sql](../../supabase/migrations/0039_patient_app_checkin_and_timeline.sql)
- [patient-app.module.ts](../../apps/api/src/modules/patient-app/patient-app.module.ts)
- [patient-app.controller.ts](../../apps/api/src/modules/patient-app/patient-app.controller.ts)
- [patient-app.service.ts](../../apps/api/src/modules/patient-app/patient-app.service.ts)
- [create-patient-app-daily-checkin.dto.ts](../../apps/api/src/modules/patient-app/dto/create-patient-app-daily-checkin.dto.ts)
- [patient-app api](../../src/modules/patient-app/api/patient-app.ts)
- [patient-app hooks](../../src/modules/patient-app/hooks/use-patient-app-cockpit.ts)
- [patient app home](../../src/app/app/page.tsx)
- [patient-app-quick-action-modal.tsx](../../src/modules/patient-app/components/patient-app-quick-action-modal.tsx)
- [patient-app-recent-activity-card.tsx](../../src/modules/patient-app/components/patient-app-recent-activity-card.tsx)
- [quick-habit-actions.tsx](../../src/modules/patient-app/components/quick-habit-actions.tsx)
- [water page](../../src/app/app/water/page.tsx)
- [meals page](../../src/app/app/meals/page.tsx)
- [workouts page](../../src/app/app/workouts/page.tsx)
- [sleep page](../../src/app/app/sleep/page.tsx)
- [symptoms page](../../src/app/app/symptoms/page.tsx)
- [api-smoke.ts](../../scripts/api-smoke.ts)

Observacao de estado atual:

- A `0038` abriu o contrato curado do app do paciente no runtime com `patient_app_cockpit` e RPCs dedicadas para hidratacao, refeicao, treino, sono e sintoma, sempre resolvendo o paciente atual por claim ou por `patientId` de preview com `private.can_access_patient`.
- O backend ganhou o modulo `patient-app` no Nest, expondo `GET /patient-app/cockpit` e os `POST` dedicados dos cinco registros de habito em cima das RPCs do Supabase.
- O frontend do portal do paciente saiu de `zustand persist`; a home e as cinco telas de registro agora usam React Query sobre o backend, invalidam o cockpit ao salvar e passam a refletir os logs persistidos no runtime.
- O fluxo de login e roteamento passou a respeitar `role = patient`, com redirecionamento para `/app` e bloqueio do dashboard administrativo para sessao de paciente.
- O preview administrativo do cockpit ficou viabilizado via `?patientId=<id-do-paciente>`, o que permite validar staging e smoke sem depender de um usuario final do paciente ja provisionado no Supabase Auth.
- A `0039` fechou o restante da jornada do cockpit: quick actions viraram modais transacionais na home, o app ganhou `POST /patient-app/daily-checkins` apoiado em `api.log_patient_app_daily_checkin`, e os registros do paciente passaram a refletir auditoria/timeline longitudinal no runtime.
- `api.patient_app_cockpit` agora expoe `todayCheckIn`, `recentActivity`, `weeklyCounts.checkinCount` e `logs.checkins`, alinhando a UX do cockpit com o comportamento real persistido no backend.
- `api.patient_longitudinal_feed` deixou de ser scaffold para atividade do app do paciente e passou a ler `audit.patient_timeline_events`, permitindo refletir check-in e habitos no feed longitudinal do paciente.

Validacao recente:

- `npm run api:typecheck`: ok
- `npm run api:build`: ok
- `npm run build`: ok
- `supabase db push`: `0038` e `0039` aplicadas no staging
- `supabase migration list`: `0001` a `0039` locais e remotas
- `API_AUTH_MODE=real NEXT_PUBLIC_AUTH_MODE=real npm run api:smoke`: ok, cobrindo `GET /patient-app/cockpit`, os cinco `POST /patient-app/*-logs`, `POST /patient-app/daily-checkins`, releitura do cockpit com `todayCheckIn`, `recentActivity`, `weeklyCounts.checkinCount` e a validacao da RPC `patient_longitudinal_feed`

## Etapa 8 - Prontuario, encounter, care plan e nutricao estruturada

Status: `done`

Objetivo:

- Sair do texto livre como base unica e virar operacao clinica estruturada.

Checklist:

- [x] Criar `medical_records`
- [x] Criar `encounters` e `encounter_sections`
- [x] Criar `anamneses`
- [x] Criar `soap_notes`
- [x] Criar `clinical_tasks`
- [x] Criar `problem_list`
- [x] Criar `adverse_events`
- [x] Criar `care_plans` e `care_plan_items`
- [x] Criar `patient_goals`
- [x] Criar `nutrition_plans`, `nutrition_plan_versions`, `nutrition_targets`
- [x] Garantir versionamento e vigencia do plano nutricional

Benchmark SlimCare:

- [DATA_MODEL_OVERVIEW.md](../../../slim-care-flow/supabase/docs/DATA_MODEL_OVERVIEW.md)
- [ClinicalEncounter.jsx](../../../slim-care-flow/src/pages/portal/ClinicalEncounter.jsx)

Observacao atual:

- O gate da etapa foi destravado: encounter operacional, agenda, retorno, autosave e elegibilidade comercial/financeira ja estao persistindo no runtime Supabase.
- A `0049` materializou a fundacao clinica estruturada com `medical_records`, `problem_lists` e `encounter_sections`, alinhando o prontuario ao benchmark do SlimCare sem herdar a arquitetura centralizada dele.
- As `0050` a `0053` fecharam o corte nutricional com `nutrition_plans`, `nutrition_plan_versions`, `nutrition_targets`, vigencia/versionamento, backfill idempotente e contrato consistente entre `patient_app_cockpit`, `meal-logs` e `get_structured_encounter_snapshot`.
- `GET /encounters/:id` em modo real agora devolve `medicalRecord`, `sections`, `carePlan`, `problemList`, `prescriptions` e `nutritionPlan` diretamente do runtime, com fallback legado apenas quando o snapshot ainda nao estiver pronto.
- O app do paciente passou a expor o plano nutricional vigente na home de refeicoes e a refletir `nutritionPlanVersionId` consistente nos logs, deixando a Etapa 8 observavel no produto e nao so no banco.
- Com esse fechamento, a proxima frente autorizada volta para a ordem do plano: base documental, prescricoes estruturadas e compliance operacional da Etapa 9.

Evidencia atual:

- [0011_patient_clinical_scheduling_runtime_base.sql](../../supabase/migrations/0011_patient_clinical_scheduling_runtime_base.sql)
- [0030_runtime_autosave_encounter_section_rpc.sql](../../supabase/migrations/0030_runtime_autosave_encounter_section_rpc.sql)
- [0031_runtime_encounter_autosave_overlay_rpcs.sql](../../supabase/migrations/0031_runtime_encounter_autosave_overlay_rpcs.sql)
- [0032_runtime_anamnesis_upsert_rpc.sql](../../supabase/migrations/0032_runtime_anamnesis_upsert_rpc.sql)
- [0049_runtime_structured_clinical_foundation.sql](../../supabase/migrations/0049_runtime_structured_clinical_foundation.sql)
- [0050_runtime_nutrition_domain_and_patient_plan_reads.sql](../../supabase/migrations/0050_runtime_nutrition_domain_and_patient_plan_reads.sql)
- [0051_fix_nutrition_legacy_unique_indexes.sql](../../supabase/migrations/0051_fix_nutrition_legacy_unique_indexes.sql)
- [0052_fix_nutrition_read_functions_pure.sql](../../supabase/migrations/0052_fix_nutrition_read_functions_pure.sql)
- [0053_fix_nutrition_public_ids_in_patient_app.sql](../../supabase/migrations/0053_fix_nutrition_public_ids_in_patient_app.sql)
- [clinical.service.ts](../../apps/api/src/modules/clinical/clinical.service.ts)
- [encounter page](../../src/app/(dashboard)/clinical/encounters/[id]/page.tsx)
- [meals page](../../src/app/app/meals/page.tsx)
- [api-smoke.ts](../../scripts/api-smoke.ts)

Validacao recente:

- `supabase db push`: `0049` a `0053` aplicadas no staging
- `supabase migration list`: `0001` a `0053` locais e remotas
- `npm run api:typecheck`: ok
- `npm run api:build`: ok
- `npm run build`: ok
- `npm run runtime:seed:direct`: ok
- `API_AUTH_MODE=real NEXT_PUBLIC_AUTH_MODE=real npm run api:smoke`: ok, cobrindo `GET /encounters/:id` com `medicalRecord`, `sections`, `problemList`, `carePlan`, `nutritionPlan`, autosave de anamnese, rascunho SOAP, logs de refeicao com `nutritionPlanVersionId` consistente e fechamento do encounter com as transicoes estruturadas refletidas no runtime

## Etapa 9 - Documentos, prescricoes e compliance operacional

Status: `in_progress`

Objetivo:

- Construir pipeline documental serio, com storage privado, evidencia e assinatura.

Checklist:

- [x] Criar `document_templates`
- [x] Criar `document_template_versions`
- [x] Criar `patient_documents`
- [x] Criar `document_versions`
- [x] Criar `signature_requests`
- [x] Criar `signature_events`
- [x] Criar `printable_artifacts`
- [x] Criar `prescriptions` estruturadas e `prescription_items`
- [x] Criar Edge Function `document-printable` para artefato versionado em storage privado
- [x] Garantir webhook idempotente com `document-signature-webhook`
- [x] Expor templates, emissao, artefato imprimivel e solicitacao de assinatura via HTTP
- [x] Expor editor documental com snapshot remoto de presets, branding e standards notes operacionais
- [x] Persistir branding/logo/footer por tenant e layout versionado por template
- [x] Fazer o renderer respeitar layout/branding quando esses campos estiverem presentes no snapshot documental
- [x] Expor signed URL temporaria no detalhe do encounter para abrir e baixar artefatos sem vazar o bucket privado
- [x] Gerar `pdf` e `print_package` reais em vez de renderer HTML transicional
- [x] Registrar dispatch auditavel de assinatura com tentativa, payload, resposta, envelope externo e evento de compliance
- [ ] Integrar verificacao criptografica com provedor real de assinatura
- [ ] Expor download seguro/signed URL para artefatos documentais fora do detalhe do encounter

Benchmark SlimCare:

- [DATA_MODEL_OVERVIEW.md](../../../slim-care-flow/supabase/docs/DATA_MODEL_OVERVIEW.md)
- [Documents.jsx](../../../slim-care-flow/src/pages/portal/Documents.jsx)
- [Prescriptions.jsx](../../../slim-care-flow/src/pages/portal/Prescriptions.jsx)
- [DocumentTemplates.jsx](../../../slim-care-flow/src/pages/portal/DocumentTemplates.jsx)
- [DocumentCreatorModal.jsx](../../../slim-care-flow/src/components/portal/documents/DocumentCreatorModal.jsx)
- [DocumentDetailDrawer.jsx](../../../slim-care-flow/src/components/portal/documents/DocumentDetailDrawer.jsx)
- [PrescriptionEditorModal.jsx](../../../slim-care-flow/src/components/portal/prescriptions/PrescriptionEditorModal.jsx)
- [PrescriptionDetailDrawer.jsx](../../../slim-care-flow/src/components/portal/prescriptions/PrescriptionDetailDrawer.jsx)
- [ComplianceLimitationsBlock.jsx](../../../slim-care-flow/src/components/portal/compliance/ComplianceLimitationsBlock.jsx)
- `src/pages/portal/Documents.jsx`
- `src/pages/portal/Prescriptions.jsx`

Observacao atual:

- A `0054` abriu a fundacao documental no runtime com `docs.document_templates`, `docs.document_template_versions`, `docs.patient_documents`, `docs.document_versions`, `docs.signature_requests`, `docs.signature_events` e `docs.printable_artifacts`, sempre sob RLS por tenant/unidade/paciente.
- A mesma `0054` fechou a base de prescricoes estruturadas com `clinical.prescription_items`, acoplando os itens ao `prescription_record` ja existente em vez de abrir um dominio duplicado.
- A `0055` abriu o primeiro slice funcional da etapa para prescricoes estruturadas, com `api.record_prescription_for_encounter`, injecao das prescricoes estruturadas em `public.get_structured_encounter_snapshot` e leitura de `items[]` no `GET /encounters/:id`.
- A `0056` publicou o wrapper `public.record_prescription_for_encounter`, alinhando a gravacao com o padrao operacional do projeto para RPCs chamadas via `supabaseAdmin.rpc`.
- A `0057` abriu o slice documental operacional com `list_document_templates`, `issue_document_for_encounter`, injecao do bloco `documents[]` no `GET /encounters/:id` e compatibilidade de leituras no runtime.
- A `0058` fechou `create_document_signature_request`, `register_document_printable_artifact` e `consume_document_signature_webhook`, com trilha de auditoria, eventos de assinatura e replay idempotente no runtime.
- A `0059` publicou `get_patient_document_snapshot`, usado pela Edge Function `document-printable` para gerar artefato versionado em storage privado sem vazar regra documental para o frontend.
- A `0060` alinhou RPCs de compatibilidade documental no boundary publico para manter a camada transicional consistente com o runtime novo.
- A `0061` ajustou o bucket `patient-documents` para aceitar `text/html`, fechando o fluxo de preview HTML versionado.
- A `0062` abriu o slice de layout documental com `get_document_layout_studio_snapshot`, `update_document_layout_branding` e `update_document_template_layout`, passou a devolver `branding`, `presets` e `standards` para o studio e injeta `layoutSchema`, `tenantBranding` e `standardsNotes` no snapshot documental.
- A `0063` liberou `application/zip` e `application/x-zip-compressed` no bucket privado `patient-documents`, permitindo armazenar pacotes documentais finais alem de HTML, PDF e imagens.
- A `0064` passou a expor `tenantId`, `unitId` e `patientId` no snapshot documental para que renderers salvem artefatos diretamente no prefixo privado padrao `tenant/<tenant_uuid>/patients/<patient_uuid>/documents/...`.
- A `0065` criou `docs.signature_dispatch_attempts` e `api.record_document_signature_dispatch`, registrando tentativas de envio, payload/resposta do provedor, idempotency key, envelope externo, erro e evento de auditoria/timeline.
- O admin ganhou o editor em `/clinical/document-layout`, consumindo `GET /settings/document-layout` e persistindo branding/logo/footer por tenant e preset/layout por template via `PUT /settings/document-layout/branding` e `PUT /settings/document-layout/templates/:id`.
- O branding documental agora centraliza nome institucional, paleta, `logoPath`, `footerNote` e notas auxiliares no runtime, enquanto os presets `clinical_classic`, `institutional_clean` e `evidence_compact` padronizam largura, densidade e hierarquia visual.
- As standards notes operacionais passaram a acompanhar o snapshot com referencias de identificacao institucional, trilha de assinatura eletronica e requisitos de guarda/reproducao, orientando o editor e preparando o fechamento de compliance da etapa.
- O `document-printable` foi redeployado para respeitar layout/branding presentes no snapshot documental de forma retrocompativel, aplicando largura, alinhamento, cores, logo e footer quando informados sem quebrar o fallback HTML atual.
- O `document-printable` agora gera artefatos reais por tipo: HTML para preview/HTML, PDF texto-renderizado com metadados e conteudo estruturado, e `print_package` ZIP contendo HTML, PDF e `manifest.json`; a fidelidade pixel-perfect/legal do PDF ainda deve ser refinada quando o provedor final de renderizacao/compliance for escolhido.
- O backend agora expoe `GET /documents/:id/access-links`, resolvendo o snapshot do documento no runtime e gerando signed URLs curtas para a versao atual e para cada artefato imprimivel com `storageObjectPath` em `patient-documents`.
- O backend agora chama `document-signature-dispatch` apos criar uma solicitacao de assinatura real, mantendo o endpoint existente e adicionando evidencia operacional de dispatch sem acoplar a API Nest a um provedor especifico.
- A Edge Function `document-signature-dispatch` suporta modo local/mock auditavel e modo HTTP generico via `DOCUMENT_SIGNATURE_DISPATCH_URL`, com callback padrao para `document-signature-webhook`.
- O `document-record-board` do encounter passou a preparar e consumir esses links seguros no proprio detalhe do atendimento, permitindo `Abrir` e `Baixar` sem expor o bucket privado nem mover o usuario para uma superficie paralela; pacotes ZIP ficam restritos a download.
- O `document-record-board` tambem passou a exibir provider, envelope externo e ultimo status de dispatch da solicitacao de assinatura, deixando a evidencia operacional visivel no atendimento.
- O encounter do admin agora segue a inspiracao de produto do SlimCare com o fluxo `historico listado -> formulario dedicado no atendimento`, mais acoes de `emitir documento -> gerar preview -> solicitar assinatura`, mas mantendo a regra critica no runtime Supabase em vez do frontend.
- Os prerequisitos da etapa ja estavam resolvidos antes desse corte: buckets privados em `0026`, boundary seguro de `public` em `0028` e padrao idempotente para gateway/webhook consolidado na Etapa 10.
- O que ainda impede a etapa de fechar nao e mais fundacao documental, geracao de artefatos finais nem dispatch auditavel; agora o gap ficou concentrado em expansao do download seguro para superficies fora do encounter, verificacao criptografica por provedor real de assinatura e evidencias juridicas finais.

Evidencia atual:

- [0026_storage_private_buckets_and_policies.sql](../../supabase/migrations/0026_storage_private_buckets_and_policies.sql)
- [0028_public_schema_compatibility_boundary.sql](../../supabase/migrations/0028_public_schema_compatibility_boundary.sql)
- [0047_platform_billing_gateway_and_webhook_runtime.sql](../../supabase/migrations/0047_platform_billing_gateway_and_webhook_runtime.sql)
- [0048_public_platform_billing_gateway_wrappers.sql](../../supabase/migrations/0048_public_platform_billing_gateway_wrappers.sql)
- [0054_runtime_docs_and_prescriptions_foundation.sql](../../supabase/migrations/0054_runtime_docs_and_prescriptions_foundation.sql)
- [0055_runtime_prescription_structured_reads_and_writes.sql](../../supabase/migrations/0055_runtime_prescription_structured_reads_and_writes.sql)
- [0056_public_prescription_write_wrapper.sql](../../supabase/migrations/0056_public_prescription_write_wrapper.sql)
- [0057_runtime_document_reads_and_writes.sql](../../supabase/migrations/0057_runtime_document_reads_and_writes.sql)
- [0058_runtime_document_artifacts_and_signatures.sql](../../supabase/migrations/0058_runtime_document_artifacts_and_signatures.sql)
- [0059_document_printable_snapshot_wrapper_fix.sql](../../supabase/migrations/0059_document_printable_snapshot_wrapper_fix.sql)
- [0060_document_runtime_compatibility_rpcs.sql](../../supabase/migrations/0060_document_runtime_compatibility_rpcs.sql)
- [0061_patient_documents_allow_html_preview.sql](../../supabase/migrations/0061_patient_documents_allow_html_preview.sql)
- [0062_document_layout_studio.sql](../../supabase/migrations/0062_document_layout_studio.sql)
- [0063_patient_documents_allow_print_package_zip.sql](../../supabase/migrations/0063_patient_documents_allow_print_package_zip.sql)
- [0064_patient_document_snapshot_storage_scope.sql](../../supabase/migrations/0064_patient_document_snapshot_storage_scope.sql)
- [0065_document_signature_dispatch_evidence.sql](../../supabase/migrations/0065_document_signature_dispatch_evidence.sql)
- [runtime-document-writes.ts](../../apps/api/src/common/runtime/runtime-document-writes.ts)
- [runtime-prescription-writes.ts](../../apps/api/src/common/runtime/runtime-prescription-writes.ts)
- [create-document-printable-artifact.dto.ts](../../apps/api/src/modules/clinical/dto/create-document-printable-artifact.dto.ts)
- [create-document-signature-request.dto.ts](../../apps/api/src/modules/clinical/dto/create-document-signature-request.dto.ts)
- [create-prescription-record.dto.ts](../../apps/api/src/modules/clinical/dto/create-prescription-record.dto.ts)
- [clinical.controller.ts](../../apps/api/src/modules/clinical/clinical.controller.ts)
- [clinical.service.ts](../../apps/api/src/modules/clinical/clinical.service.ts)
- [settings.controller.ts](../../apps/api/src/modules/settings/settings.controller.ts)
- [settings.service.ts](../../apps/api/src/modules/settings/settings.service.ts)
- [document-printable](../../supabase/functions/document-printable/index.ts)
- [document-signature-dispatch](../../supabase/functions/document-signature-dispatch/index.ts)
- [document-signature-webhook](../../supabase/functions/document-signature-webhook/index.ts)
- [document-record-board.tsx](../../src/modules/clinical/components/document-record-board.tsx)
- [document-layout page](../../src/app/(dashboard)/clinical/document-layout/page.tsx)
- [document-layout-editor.tsx](../../src/modules/clinical/components/document-layout-editor.tsx)
- [document-layout-settings.ts](../../src/modules/clinical/api/document-layout-settings.ts)
- [get-document-access-links.ts](../../src/modules/clinical/api/get-document-access-links.ts)
- [use-document-layout-editor.ts](../../src/modules/clinical/hooks/use-document-layout-editor.ts)
- [use-document-access-links.ts](../../src/modules/clinical/hooks/use-document-access-links.ts)
- [create-document-record.ts](../../src/modules/clinical/api/create-document-record.ts)
- [create-document-printable-artifact.ts](../../src/modules/clinical/api/create-document-printable-artifact.ts)
- [create-document-signature-request.ts](../../src/modules/clinical/api/create-document-signature-request.ts)
- [use-create-document-printable-artifact.ts](../../src/modules/clinical/hooks/use-create-document-printable-artifact.ts)
- [use-create-document-signature-request.ts](../../src/modules/clinical/hooks/use-create-document-signature-request.ts)
- [prescription-record-form.tsx](../../src/modules/clinical/components/prescription-record-form.tsx)
- [create-prescription-record.ts](../../src/modules/clinical/api/create-prescription-record.ts)
- [use-create-prescription-record.ts](../../src/modules/clinical/hooks/use-create-prescription-record.ts)
- [get-encounter.ts](../../src/modules/clinical/api/get-encounter.ts)
- [encounter page](../../src/app/(dashboard)/clinical/encounters/[id]/page.tsx)
- [storage-upload-policy.md](./storage-upload-policy.md)

Validacao recente:

- `supabase db push`: `0065` aplicada no staging
- `supabase migration list`: `0001` a `0065` locais e remotas
- `supabase functions deploy document-printable`: ok, redeployado depois do renderer passar a emitir HTML, PDF e ZIP de `print_package`
- `supabase functions deploy document-signature-dispatch`: ok
- `supabase functions deploy document-signature-webhook --no-verify-jwt`: ok
- `npm run typecheck`: ok
- `npm run api:typecheck`: ok
- `npm run api:build`: ok
- `npm run build`: ok
- `npm run api:smoke`: bloqueado antes dos fluxos por PostgreSQL local indisponivel em `localhost:55432/emagreceplus`; precisa do Docker Desktop/daemon e banco local iniciados
- Validacao estatica manual: contratos alinhados em `clinical.controller.ts`, `clinical.service.ts`, `runtime-document-writes.ts`, `document-record-board.tsx`, `get-document-access-links.ts` e `use-document-access-links.ts`

## Etapa 10 - Comercial, elegibilidade e financeiro

Status: `done`

Objetivo:

- Separar de forma definitiva comercial/financeiro clinico do billing do SaaS.

Checklist:

- [x] Materializar o dominio `commercial` no runtime Supabase
- [x] Criar backfill idempotente para `pipelines`, `stages`, `leads`, `activities` e `conversions`
- [x] Tirar `GET /leads/kanban` e `GET /leads/:id/activities` do Prisma no modo real
- [x] Tirar o resumo comercial de `GET /dashboard/summary` do Prisma no modo real
- [x] Criar catalogo de servicos, pacotes e programas
- [x] Criar matriculas e entitlements por paciente
- [x] Criar `financial_items`, eventos e reconciliacao
- [x] Criar `tenant_plans`, `tenant_subscriptions`, `usage_meters`
- [x] Definir regras de elegibilidade no app do paciente
- [x] Criar Edge Functions para gateway e webhook idempotente
- [x] Separar claramente recibo/pagamento do paciente de cobranca do tenant

Benchmark SlimCare:

- [DATA_MODEL_OVERVIEW.md](../../../slim-care-flow/supabase/docs/DATA_MODEL_OVERVIEW.md)
- `src/components/financial/*`
- `src/pages/portal/Commercial.jsx`
- `src/pages/portal/Financial.jsx`

Evidencia atual:

- [0036_runtime_commercial_domain_base.sql](../../supabase/migrations/0036_runtime_commercial_domain_base.sql)
- [0037_runtime_commercial_backfill_and_reads.sql](../../supabase/migrations/0037_runtime_commercial_backfill_and_reads.sql)
- [0040_runtime_commercial_catalog.sql](../../supabase/migrations/0040_runtime_commercial_catalog.sql)
- [0041_runtime_commercial_catalog_backfill_rpc.sql](../../supabase/migrations/0041_runtime_commercial_catalog_backfill_rpc.sql)
- [0042_runtime_patient_enrollments_and_entitlements.sql](../../supabase/migrations/0042_runtime_patient_enrollments_and_entitlements.sql)
- [0043_fix_commercial_enrollment_legacy_conflicts.sql](../../supabase/migrations/0043_fix_commercial_enrollment_legacy_conflicts.sql)
- [0044_runtime_finance_domain_and_patient_summary.sql](../../supabase/migrations/0044_runtime_finance_domain_and_patient_summary.sql)
- [0045_platform_billing_saas_runtime.sql](../../supabase/migrations/0045_platform_billing_saas_runtime.sql)
- [0046_patient_app_access_state_and_eligibility.sql](../../supabase/migrations/0046_patient_app_access_state_and_eligibility.sql)
- [0047_platform_billing_gateway_and_webhook_runtime.sql](../../supabase/migrations/0047_platform_billing_gateway_and_webhook_runtime.sql)
- [0048_public_platform_billing_gateway_wrappers.sql](../../supabase/migrations/0048_public_platform_billing_gateway_wrappers.sql)
- [runtime-commercial-projection.ts](../../apps/api/src/common/runtime/runtime-commercial-projection.ts)
- [crm.service.ts](../../apps/api/src/modules/crm/crm.service.ts)
- [crm.controller.ts](../../apps/api/src/modules/crm/crm.controller.ts)
- [patients.service.ts](../../apps/api/src/modules/patients/patients.service.ts)
- [patients.controller.ts](../../apps/api/src/modules/patients/patients.controller.ts)
- [create-patient-enrollment.dto.ts](../../apps/api/src/modules/patients/dto/create-patient-enrollment.dto.ts)
- [crm catalog page](../../src/app/(dashboard)/crm/catalog/page.tsx)
- [get-commercial-catalog.ts](../../src/modules/crm/api/get-commercial-catalog.ts)
- [use-commercial-catalog.ts](../../src/modules/crm/hooks/use-commercial-catalog.ts)
- [create-patient-enrollment.ts](../../src/modules/patients/api/create-patient-enrollment.ts)
- [use-create-patient-enrollment.ts](../../src/modules/patients/hooks/use-create-patient-enrollment.ts)
- [patient-commercial-card.tsx](../../src/modules/patients/components/patient-commercial-card.tsx)
- [patient-summary-tab.tsx](../../src/modules/patients/components/patient-summary-tab.tsx)
- [patient app home](../../src/app/app/page.tsx)
- [patient-app-access-card.tsx](../../src/modules/patient-app/components/patient-app-access-card.tsx)
- [quick-habit-actions.tsx](../../src/modules/patient-app/components/quick-habit-actions.tsx)
- [patient-app types](../../src/modules/patient-app/types.ts)
- [billing-gateway](../../supabase/functions/billing-gateway/index.ts)
- [billing-webhook](../../supabase/functions/billing-webhook/index.ts)
- [billing-provider shared](../../supabase/functions/_shared/billing-provider.ts)
- [dashboard.service.ts](../../apps/api/src/modules/dashboard/dashboard.service.ts)
- [seed-runtime-direct-fixtures.ts](../../scripts/seed-runtime-direct-fixtures.ts)
- [api-smoke.ts](../../scripts/api-smoke.ts)

Observacao de estado atual:

- A `0036` abriu o dominio `commercial` no runtime com RLS, FKs, indices e trilha de `updated_at`, cobrindo `pipelines`, `pipeline_stages`, `leads`, `lead_profiles`, `lead_stage_history`, `lead_activities` e `conversions`.
- A `0037` endureceu as chaves legadas como uniques reais, criou a RPC de backfill `api.backfill_runtime_commercial_domain`, levou `crm_kanban_snapshot`, `crm_lead_activities`, `crm_operational_summary` e substituiu o placeholder de `api.patient_commercial_context`.
- `CrmService` agora sincroniza o runtime comercial sob demanda e depois de cada write legado relevante, enquanto `GET /leads/kanban` e `GET /leads/:id/activities` passam a consultar o Supabase no modo real.
- `DashboardService` deixou de depender do Prisma para o resumo comercial em modo real, combinando `dashboard_operational_summary` com `crm_operational_summary`.
- A `0040` abriu o catalogo comercial no runtime com `commercial.services`, `commercial.packages`, `commercial.package_services`, `commercial.programs` e `commercial.program_packages`, mais a leitura curada `api.commercial_catalog_snapshot`.
- A `0041` adicionou `api.backfill_runtime_commercial_catalog`, permitindo semear o catalogo por RPC de `service_role` no mesmo padrao dos outros dominios runtime.
- A `0042` abriu `commercial.patient_program_enrollments` e `commercial.patient_entitlements`, criou o backfill idempotente, a RPC de write `api.enroll_patient_program` e expandiu `api.patient_commercial_context` para retornar matricula, programa, pacote, entitlements, beneficios, vigencia e elegibilidade.
- A `0043` corrigiu o desenho das chaves legadas de matricula e entitlement para permitir `ON CONFLICT` real no backfill e reexecucao segura dos seeds comerciais.
- O produto agora expoe `GET /leads/catalog` e a pagina `/crm/catalog`, deixando servicos, pacotes e programas visiveis no admin sobre leitura autoritativa do Supabase.
- O detalhe do paciente agora expoe um card comercial no `Paciente 360`, com visao de matricula, pacote, beneficios e entitlements, e permite matricular o paciente direto do admin sobre o runtime quando a sessao tem `crm:write`.
- A `0044` abriu o dominio `finance` em separado de `commercial` e `platform`, com `finance.financial_items`, `finance.financial_item_events`, RLS propria, backfill idempotente por `service_role` e RPCs autenticadas de `record_financial_item`, `reconcile_financial_item` e `patient_financial_summary`.
- `api.patient_commercial_context` deixou de devolver `financialSummary` placeholder e passou a trazer o resumo financeiro real do paciente com contagem e valor de pendencias, contagem e valor de vencidos, proximo vencimento e ultimo evento financeiro.
- O `Paciente 360` passou a exibir valor pendente, valor vencido e proximo vencimento no card comercial, seguindo a referencia de produto do financeiro do SlimCare sem herdar sua arquitetura.
- O seed direto de homologacao passou a criar tres servicos, dois pacotes, um programa, uma matricula ativa e tres entitlements no staging, o que da fixture real para smoke e validacao visual da etapa.
- O seed direto agora tambem cria tres titulos financeiros e cinco eventos financeiros para a fixture runtime, deixando a etapa com cenário real de cobranca clinica no staging.
- O smoke passou a preparar um catalogo comercial minimo e idempotente no tenant autenticado antes da validacao, permitindo testar o fluxo real `catalogo -> matricula -> commercialContext` no mesmo tenant da sessao.
- O smoke agora cobre `record_financial_item`, `reconcile_financial_item`, `patient_financial_summary` e a releitura de `GET /patients/:id` e `patient_commercial_context` com resumo financeiro real.
- A `0045` abriu o billing SaaS em `platform.*` com `tenant_plans`, `tenant_subscriptions` e `usage_meters`, separando formalmente limites operacionais e assinatura do tenant do dominio `finance.*`.
- A `0045` tambem criou sincronizacao automatica a partir de `platform.tenants.subscription_plan_code`, preservando o bootstrap legado e os backfills existentes sem reintroduzir mistura com o financeiro do paciente.
- O runtime agora expoe `current_tenant_billing_summary`, retornando plano atual, assinatura corrente, medidores de uso e alertas de limite para a sessao autenticada do tenant.
- O seed direto passou a criar plano, assinatura e tres medidores (`active_patients`, `active_staff`, `monthly_appointments`) para a fixture runtime, fechando a separacao de dominios tambem na homologacao.
- O smoke passou a semear billing SaaS no tenant autenticado e validar `current_tenant_billing_summary`, garantindo leitura real de plano, assinatura e medidores no runtime.
- A `0046` fechou o proximo corte do plano no app do paciente: `api.patient_app_cockpit` agora devolve `commercialContext` e um `accessState` derivado de entitlements, vigencia e financeiro real, reaproveitando o mesmo contrato comercial ja consolidado no Paciente 360.
- O `accessState` do app do paciente deixa os registros diarios sempre disponiveis, mas passa a bloquear comunidade, chat prioritario e retorno quando houver vigencia expirada, matricula inativa ou pendencia vencida, alinhando produto e arquitetura sem transformar o app em fonte paralela de regra.
- A home do paciente agora mostra plano, status de acesso, situacao financeira, vigencia e beneficios liberados em um card dedicado, seguindo a inspiracao funcional do SlimCare sem copiar sua arquitetura.
- `QuickHabitActions` passou a consumir o `accessState`, ficando preparado para gates reais no proprio app; neste corte, os atalhos clinicos continuam liberados por decisao de produto para nao interromper a coleta longitudinal.
- O comercial e o financeiro do paciente seguem inspirados na referencia de produto do SlimCare, enquanto o billing SaaS foi isolado em `platform.*` por exigencia do plano arquitetural.
- A `0047` abriu `platform.billing_gateway_sessions` e `platform.billing_webhook_events`, adicionou a RPC de registro de sessao do gateway e a RPC idempotente de consumo de webhook, ambas com auditoria, outbox e reaproveitamento de `audit.idempotency_keys`.
- A `0048` publicou wrappers `public.*` service-role-only para o PostgREST das Edge Functions, sem abrir os endpoints para `anon` ou `authenticated`.
- `billing-gateway` agora suporta `checkout` e `portal` em modo `mock` e `stripe`, resolvendo o tenant pela sessao autenticada e gravando a sessao no runtime antes do redirecionamento.
- `billing-webhook` ficou publicado sem verificacao de JWT, com validacao de assinatura Stripe quando o provider for real, normalizacao de payload e consumo idempotente sobre a RPC do runtime.
- A validacao em staging ja cobriu processamento real de um webhook `mock` com `duplicate = false` na primeira chamada e `duplicate = true` na reexecucao do mesmo `eventId`.
- Correcao de estado: os writes legados de lead e atividade ainda seguem projetando do Prisma para o runtime, mas matricula comercial, titulos financeiros e conciliacao ja nascem nativamente no Supabase.

Validacao recente:

- `supabase db push`: `0047` e `0048` aplicadas no staging
- `supabase migration list`: `0001` a `0048` locais e remotas
- `npm run api:typecheck`: ok
- `npm run api:build`: ok
- `npm run build`: ok
- `npm run runtime:seed:direct`: ok, criando fixture de plano, assinatura, medidores, catalogo, matricula, entitlements, titulos financeiros e eventos financeiros no staging
- `API_AUTH_MODE=real NEXT_PUBLIC_AUTH_MODE=real npm run api:smoke`: ok, cobrindo `current_tenant_billing_summary`, `GET /dashboard/summary`, `GET /leads/kanban`, `GET /leads/catalog`, `POST /patients/:id/enrollments`, `record_financial_item`, `reconcile_financial_item`, `GET /patients/:id` com `commercialContext` financeiro real, `patient_commercial_context`, `patient_financial_summary`, `GET /patient-app/cockpit` com `accessState` e `commercialContext`, `commercial_catalog_snapshot`, `crm_operational_summary`, `crm_kanban_snapshot`, `crm_lead_activities` e a trilha clinica/operacional principal
- `supabase functions deploy billing-gateway`: ok em `staging`
- `supabase functions deploy billing-webhook --no-verify-jwt`: ok em `staging`
- `POST https://sjrwhblnzsgzmhztsyqi.supabase.co/functions/v1/billing-webhook`: ok em `mock`, com idempotencia validada por reexecucao do mesmo `eventId`

## Etapa 11 - Notificacoes, chat e comunidade

Status: `later`

Objetivo:

- Adicionar retencao e comunicacao sem comprometer o core.

Checklist:

- [ ] Criar `notification_events` e `notification_deliveries`
- [ ] Criar `chat_rooms`, `chat_room_members`, `chat_messages`, `chat_attachments`
- [ ] Criar `community_posts`, `community_comments`, `community_reactions`, `moderation_actions`
- [ ] Definir gating por entitlement
- [ ] Garantir buckets privados para media sensivel
- [ ] Garantir auditoria de moderacao

Benchmark SlimCare:

- `src/components/chat/*`
- `src/components/community/*`
- `src/pages/PatientChat.jsx`
- `src/pages/Community.jsx`
- `src/pages/portal/Messages.jsx`
- `src/pages/portal/CommunityModeration.jsx`

## Etapa 12 - Observabilidade, seguranca avancada e resiliencia

Status: `later`

Checklist:

- [ ] Padronizar logs por request e execution id
- [ ] Definir correlation id
- [ ] Integrar Sentry frontend
- [ ] Integrar Sentry functions
- [ ] Criar alertas para webhook, fila, jobs e auth
- [ ] Criar monitoramento de buckets orfaos
- [ ] Criar monitoramento de regressao de RLS

## Etapa 13 - Testes, homologacao, DR e go-live

Status: `later`

Checklist:

- [ ] Testes SQL para schema, constraints, RLS e RPCs
- [ ] Testes de Edge Functions
- [ ] Testes de integracao web -> backend
- [ ] Smoke tests dos fluxos criticos
- [ ] Testes de isolamento por tenant
- [ ] Testes de restore
- [ ] Validacao de PITR
- [ ] Validacao de storage backup
- [ ] Checklist de homologacao por fluxo

## Etapa 14 - Pos-go-live e expansao controlada

Status: `later`

Checklist:

- [ ] Tuning de performance
- [ ] Materialized views para dashboards pesados
- [ ] Automacoes comerciais e clinicas seguras
- [ ] IA assistiva com escopo controlado
- [ ] Relatorios avancados
- [ ] Leitura replicada quando necessario
- [ ] Avaliar tenants dedicados enterprise

## Proxima acao objetiva

A proxima implementacao tecnica deve entrar por aqui:

1. Fechar as lacunas remanescentes da Etapa 9 com verificacao criptografica de assinatura, evidencia juridica final e download seguro fora do detalhe do encounter
2. Consolidar centro documental administrativo agora que editor, branding/layout, artefatos finais, dispatch auditavel e signed URLs no encounter estao alinhados ao snapshot remoto
3. Continuar reduzindo writes residuais ainda Prisma-first fora da trilha principal do runtime
