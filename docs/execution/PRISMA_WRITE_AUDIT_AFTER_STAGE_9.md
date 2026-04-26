# Prisma Write Audit After Stage 9

Data de referencia: 2026-04-26

Branch esperada pela tarefa: `docs/audit-prisma-writes-after-stage-9`

Branch real encontrada: `docs/audit-prisma-writes-after-stage-9-v2`

## Escopo

Esta auditoria mapeia writes Prisma/local restantes depois da estabilizacao da
Etapa 9. Nao houve implementacao de codigo nem criacao de migration.

Arquivos e diretorios lidos:

- `AGENTS.md`
- `docs/execution/CODEX_CONTEXT.md`
- `README.md`
- `package.json`
- `.env.example`
- `docker-compose.yml`
- `.github/workflows/ci-smokes.yml`
- `docs/execution/control-checklist.md`
- `docs/execution/operating-system.md`
- `docs/adr/0001-emagreceplus-supabase-runtime.md`
- `docs/execution/gap-analysis.md`
- `docs/fusion/module-matrix.md`
- `docs/execution/environments-and-deploys.md`
- `docs/execution/prisma-freeze-and-transition.md`
- `docs/execution/public-schema-boundary.md`
- `docs/execution/storage-upload-policy.md`
- `supabase/README.md`
- `apps/api/src`
- `prisma/schema.prisma`
- `supabase/migrations`
- `supabase/functions`
- `scripts/api-smoke.ts`

## Inconsistencias de contexto

- `AGENTS.md` e `docs/execution/CODEX_CONTEXT.md` citam migrations ate `0065`,
  mas o estado real do repositorio contem migrations ate `0082`, incluindo
  broker documental, detalhe operacional, dossie juridico, pacote de evidencia,
  readiness D4Sign e observabilidade documental.
- A tarefa citou a branch `docs/audit-prisma-writes-after-stage-9`, mas a branch
  atual e `docs/audit-prisma-writes-after-stage-9-v2`.

## Resumo

- Pontos de write Prisma/local encontrados: 22.
- Statements Prisma diretos encontrados: 47.
- Statements em API de producao/transicao: 35.
- Statements em smoke/teste local: 12.
- Writes ja Supabase-first ou Edge Function-only nao entram como Prisma-first:
  `PatientAppService`, `SettingsService`, billing Edge Functions e a maior parte
  do pipeline documental da Etapa 9.

## Classificacao usada

1. manter temporariamente como ponte
2. migrar para RPC
3. migrar para Edge Function
4. remover/depreciar
5. investigar

Prioridade:

- P0: maior risco operacional ou clinico; deve ser a proxima frente.
- P1: migrar na sequencia curta.
- P2: manter sob controle ate a ponte reduzir.
- P3: test-only ou limpeza posterior.

## Writes encontrados

| ID | Arquivo / funcao | Dominio | Prisma/local write | Equivalente Supabase evidenciado | Risco | Classificacao | Prioridade | Testes necessarios |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| W01 | `apps/api/src/modules/auth/auth.service.ts` / `findLegacySnapshot` | Auth / identidade | `User.update` em `externalAuthId` e `lastLoginAt` (2 statements) | Parcial: `api.upsert_legacy_auth_projection`, `api.current_app_session`, `identity.access_sessions` e aceite de convite em `api.accept_team_invitation_for_auth_user`. Nao ha evidencia de RPC dedicada para atualizar o espelho legado. | Mantem metadados de login em Prisma enquanto a sessao real ja vem do Supabase, criando dupla fonte de auditoria/auth. | 5. investigar | P2 | `frontend:auth-smoke`, `/auth/me` em modo real, aceite de convite, verificacao de `current_app_session` sem depender de update legado. |
| W02 | `apps/api/src/modules/patients/patients.service.ts` / `create` | Pacientes | `Patient.create` com `PatientProfile.create` aninhado (1 statement direto) | Sim, parcial: `api.upsert_runtime_patient_from_legacy` existe e e chamado depois; `api.patient_360` e leituras runtime existem. | Paciente ainda nasce primeiro no legado; risco de divergencia se a RPC falhar e o fallback nao cobrir todos os campos. | 2. migrar para RPC | P1 | `POST /patients`, `api.patient_360`, idempotencia de CPF/legacy id, `api:smoke:local` e `api:smoke:real`. |
| W03 | `apps/api/src/modules/scheduling/scheduling.service.ts` / `create` | Agenda | `Appointment.create` (1 statement) | Sim: `api.create_appointment` e `api.upsert_runtime_appointment_from_legacy`. | Agendamento ainda nasce legacy-first, apesar de ja haver RPC operacional. | 2. migrar para RPC | P1 | Criacao de agenda, conflito de unidade/tenant, `api.list_appointments`, paciente 360 e smoke de agenda. |
| W04 | `apps/api/src/modules/scheduling/scheduling.service.ts` / `checkIn` | Agenda / fila | `Checkin.create` e `Appointment.update` (2 statements) | Sim: `api.register_checkin` e runtime de fila em `scheduling.attendance_queue`. | Transicao operacional sensivel duplicada; falha parcial pode deixar check-in divergente entre legado e runtime. | 2. migrar para RPC | P1 | Check-in idempotente, bloqueios por status, fila, auditoria e smoke. |
| W05 | `apps/api/src/modules/scheduling/scheduling.service.ts` / `startEncounter` | Agenda / atendimento | `Appointment.update` e `Encounter.create` (2 statements) | Sim: `api.start_encounter`, endurecido em `0022` e `0025`. | Alto: abre atendimento clinico e muda agenda. Dupla escrita pode gerar encounter/queue divergente. | 2. migrar para RPC | P0 | Start idempotente, fila `waiting -> in_attendance`, paciente 360, encounter estruturado e smoke real/local. |
| W06 | `apps/api/src/modules/scheduling/scheduling.service.ts` / `confirm` | Agenda | `AppointmentConfirmation.create` e `Appointment.update` (2 statements) | Sim: `api.confirm_appointment`. | Divergencia de status e confirmacao manual se RPC falhar apos Prisma. | 2. migrar para RPC | P1 | Confirmacao idempotente, status bloqueados, timeline/auditoria e listagem de agenda. |
| W07 | `apps/api/src/modules/scheduling/scheduling.service.ts` / `cancel` | Agenda | `AppointmentConfirmation.create` e `Appointment.update` (2 statements) | Sim: `api.cancel_appointment`. | Cancelamento legacy-first pode deixar o runtime ainda ativo em caso de falha de sync. | 2. migrar para RPC | P1 | Cancelamento com motivo, status bloqueados, `api.list_appointments`, paciente 360 e audit trail. |
| W08 | `apps/api/src/modules/scheduling/scheduling.service.ts` / `reschedule` | Agenda | `Appointment.update` (1 statement) | Sim: `api.reschedule_appointment`. | Remarcacao muda disponibilidade e linha temporal; local-first pode causar horario diferente no runtime. | 2. migrar para RPC | P1 | Remarcacao, conflito de horario, status bloqueados, listagem por data e smoke. |
| W09 | `apps/api/src/modules/scheduling/scheduling.service.ts` / `markNoShow` | Agenda | `NoShowRecord.upsert` e `Appointment.update` (2 statements) | Sim: `api.register_no_show`. | No-show afeta jornada, financeiro/elegibilidade futura e historico operacional. | 2. migrar para RPC | P1 | No-show idempotente, bloqueios, timeline, dashboard operacional e smoke. |
| W10 | `apps/api/src/modules/clinical/clinical.service.ts` / `createTask` | Clinico | `ClinicalTask.create` (1 statement) | Parcial: `api.backfill_runtime_clinical_domain` sincroniza `clinical.clinical_tasks`, mas nao foi evidenciada RPC comando dedicada de criacao de task. | Tarefa clinica nasce no legado e so depois projeta; risco de atraso no Paciente 360 e de auditoria incompleta. | 2. migrar para RPC | P1 | Criacao de task, escopo por paciente/unidade, Paciente 360, timeline/auditoria e smoke. |
| W11 | `apps/api/src/modules/clinical/clinical.service.ts` / `saveAnamnesis` | Clinico / prontuario | `Anamnesis.upsert` (1 statement) | Sim: `api.upsert_runtime_anamnesis` existe; atualmente o fluxo principal ainda faz upsert local e usa sync/fallback. | Registro clinico sensivel com dupla fonte; risco medio-alto de divergencia de conteudo. | 2. migrar para RPC | P1 | Upsert idempotente, bloqueio por unidade, encounter snapshot, Paciente 360 e smoke. |
| W12 | `apps/api/src/modules/clinical/clinical.service.ts` / `saveSoapNote` | Clinico / prontuario | `ConsultationNote.create` (1 statement) | Parcial: `api.backfill_runtime_clinical_domain` cobre projection de notas; `api.autosave_encounter_section` cobre drafts, nao a nota SOAP oficial. | Nota assinada local-first; risco de registro oficial existir no legado antes do runtime/auditoria. | 2. migrar para RPC | P1 | Criacao de SOAP oficial, assinatura/autor, snapshot do encounter, Paciente 360 e auditoria. |
| W13 | `apps/api/src/modules/clinical/clinical.service.ts` / `createPrescriptionRecord` | Prescricoes | `PrescriptionRecord.create` apos tentativa de `recordRuntimePrescription` (1 statement) | Sim: `api.record_prescription_for_encounter` existe e e chamado antes do write local. | Menor que outros clinicos porque o runtime ja e tentado primeiro; o write local ainda sustenta fallback/smoke. | 1. manter temporariamente como ponte | P2 | Prescricao estruturada, itens, snapshot do encounter, fallback legado, smoke real e local. |
| W14 | `apps/api/src/modules/clinical/clinical.service.ts` / `completeEncounter` | Atendimento | `Encounter.update` e `Appointment.update` (2 statements) | Sim: `api.complete_encounter`, com fila e auditoria no runtime. | Alto: fechamento clinico e conclusao da agenda continuam Prisma-first. | 2. migrar para RPC | P0 | Complete idempotente, status bloqueados, fila `in_attendance -> completed`, agenda concluida, timeline e smoke. |
| W15 | `apps/api/src/modules/clinical/clinical.service.ts` / `scheduleReturn` | Atendimento / agenda | `Appointment.create` de retorno (1 statement) | Sim: `api.schedule_return`. | Retorno ainda nasce local-first; pode divergir de agenda runtime e jornada de acompanhamento. | 2. migrar para RPC | P1 | Retorno com tipo padrao, unidade/profissional, conflito de horario, listagem de agenda e Paciente 360. |
| W16 | `apps/api/src/modules/crm/crm.service.ts` / `create` | CRM | `Lead.create`, `Activity.create`, `LeadStageHistory.create` (3 statements) | Parcial: tabelas `commercial.*` existem e `api.backfill_runtime_commercial_domain` projeta leads, historico e atividades. Nao ha RPC comando dedicada de criacao de lead. | Alto: funil comercial ainda nasce no legado; projection pode atrasar ou perder semantica de stage inicial. | 2. migrar para RPC | P0 | Criacao de lead nativa, stage inicial, atividade inicial, kanban, permissao `crm:write`, idempotencia e smoke. |
| W17 | `apps/api/src/modules/crm/crm.service.ts` / `createActivity` | CRM | `Activity.create` (1 statement) | Parcial: `commercial.lead_activities` e backfill idempotente existem, mas nao ha RPC comando dedicada. | Atividade comercial e follow-up ainda local-first; impacto em SLA comercial e timeline do lead. | 2. migrar para RPC | P1 | Criar atividade, filtros de atividades, kanban, permissao e projection idempotente. |
| W18 | `apps/api/src/modules/crm/crm.service.ts` / `updateActivity` | CRM | `Activity.update` (1 statement) | Parcial: backfill atualiza `commercial.lead_activities` por `legacy_activity_id`; nao ha RPC comando dedicada. | Edicao/conclusao de atividade pode ficar divergente no runtime comercial. | 2. migrar para RPC | P1 | Atualizar atividade, completar/descompletar, prazos, kanban e smoke. |
| W19 | `apps/api/src/modules/crm/crm.service.ts` / `moveStage` | CRM | `Lead.update` e `LeadStageHistory.create` (2 statements) | Parcial: `commercial.lead_stage_history` e `crm_kanban_snapshot` existem; nao ha RPC comando dedicada de movimento. | Mudanca de etapa e status comercial ainda legacy-first; risco alto para funil e conversao. | 2. migrar para RPC | P0 | Movimentacao idempotente, validacao de pipeline, kanban, historico, permissao e smoke. |
| W20 | `apps/api/src/modules/crm/crm.service.ts` / `convert` | CRM / pacientes | `Patient.update` ou `Patient.create`, `Conversion.create`, `Lead.update`, `Activity.create`, `LeadStageHistory.create` (6 statements possiveis) | Parcial: `api.upsert_runtime_patient_from_legacy`, `api.backfill_runtime_commercial_domain` e `commercial.conversions` existem. Nao ha RPC atomica de conversao lead -> paciente. | Critico: transacao multi-dominio cria/vincula paciente e fecha lead. E o maior Prisma-first residual. | 2. migrar para RPC | P0 | Conversao atomica, dedupe por email/telefone, paciente 360, contexto comercial, timeline, rollback/idempotencia e smoke. |
| W21 | `scripts/api-smoke.ts` / `setupRequestAuth` | Smoke / auth | `User.create` com `UserRole.create` e `UserUnitAccess.create` aninhados (1 statement direto) | Parcial: Supabase Auth cria usuario real; `api.upsert_legacy_auth_projection` sincroniza a projecao quando `/auth/me` roda. O smoke ainda depende do espelho legado. | Test-only, mas prende o smoke real ao modelo legado de usuario. | 1. manter temporariamente como ponte | P3 | `api:smoke:real`, `/auth/me`, usuario com unidades, cleanup seguro e futura fixture Supabase-first. |
| W22 | `scripts/api-smoke.ts` / `cleanup` | Smoke / limpeza | `deleteMany` em `ClinicalTask`, `Appointment`, `Encounter`, `Lead`, `Patient`, `User` (11 statements) | Nao aplicavel como equivalente de produto; e limpeza transicional do smoke local/real. | Baixo no produto, mas nao deve ser removido enquanto o smoke ainda cria registros Prisma. | 1. manter temporariamente como ponte | P3 | Reexecucao do smoke sem sujeira, cleanup idempotente, ausencia de vazamento entre tenants/execucoes. |

## Supabase equivalente ja evidenciado

Evidencias principais encontradas nas migrations e functions:

- Pacientes: `api.upsert_runtime_patient_from_legacy`, `api.patient_360`.
- Agenda: `api.create_appointment`, `api.confirm_appointment`,
  `api.register_checkin`, `api.cancel_appointment`,
  `api.reschedule_appointment`, `api.register_no_show`,
  `api.upsert_runtime_appointment_from_legacy`, `api.list_appointments`.
- Fila/atendimento: `api.enqueue_patient`, `api.start_encounter`,
  `api.complete_encounter`.
- Retorno: `api.schedule_return`.
- Prontuario: `api.upsert_runtime_anamnesis`,
  `api.autosave_encounter_section`, `api.backfill_runtime_clinical_domain`.
- Prescricao: `api.record_prescription_for_encounter`.
- CRM: `commercial.leads`, `commercial.lead_stage_history`,
  `commercial.lead_activities`, `commercial.conversions`,
  `api.backfill_runtime_commercial_domain`, `api.crm_kanban_snapshot`,
  `api.crm_lead_activities`.
- App do paciente: `api.patient_app_cockpit` e RPCs `log_patient_app_*`.
- Documentos Etapa 9: `api.issue_document_for_encounter`,
  `api.create_document_signature_request`, `api.register_document_printable_artifact`,
  `api.list_accessible_patient_documents`, `api.prepare_patient_document_access`,
  `api.record_patient_document_access_event`,
  `api.get_document_legal_evidence_dossier`,
  `api.prepare_document_legal_evidence_package`,
  `api.complete_document_legal_evidence_package`,
  `api.get_document_signature_provider_readiness`, alem das Edge Functions
  `document-printable`, `document-signature-dispatch` e
  `document-signature-webhook`.

## Top 5 writes de maior risco

1. `CrmService.convert`: converte lead em paciente e escreve em varios modelos
   Prisma em uma transacao multi-dominio.
2. `SchedulingService.startEncounter`: muda agenda e abre encounter clinico
   ainda com write local primeiro.
3. `ClinicalService.completeEncounter`: fecha encounter e conclui appointment
   no legado antes de consolidar o runtime.
4. `CrmService.moveStage`: altera status e historico do funil comercial fora de
   uma RPC nativa.
5. `CrmService.create`: cria lead, primeira atividade e historico inicial
   Prisma-first, apesar do dominio `commercial.*` ja existir.

## Ordem recomendada de migracao

1. Criar RPCs comando para CRM: `create_lead`, `record_lead_activity`,
   `update_lead_activity`, `move_lead_stage` e `convert_lead_to_patient`.
   Esta e a maior lacuna porque hoje so existe projection/backfill do legado.
2. Inverter agenda e atendimento para runtime-first usando as RPCs ja existentes:
   `create_appointment`, `register_checkin`, `confirm_appointment`,
   `cancel_appointment`, `reschedule_appointment`, `register_no_show`,
   `start_encounter`, `complete_encounter` e `schedule_return`.
3. Fechar comandos clinicos nativos para `createTask`, SOAP oficial e anamnese.
   Prescricoes podem ficar por ultimo nessa frente porque ja chamam
   `record_prescription_for_encounter` antes do mirror local.
4. Migrar `POST /patients` para nascer diretamente na RPC de paciente ou em uma
   RPC nova que retorne o contrato legado enquanto a API transicional existir.
5. Reduzir dependencias de auth/smoke no espelho Prisma, substituindo fixtures
   por bootstrap Supabase-first e removendo cleanup local apenas depois que o
   smoke nao criar mais registros Prisma.

## Proxima task recomendada

Criar a especificacao tecnica da primeira frente de migracao CRM runtime-first:
contratos RPC, payloads, grants/RLS, idempotencia, eventos de auditoria,
timeline comercial e ajustes esperados nos smokes, sem ainda implementar codigo.
