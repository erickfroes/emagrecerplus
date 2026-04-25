# Matriz de fusao de modulos

Esta matriz diz o que o repositorio atual preserva, refatora, descarta ou posterga.

| Dominio | Evidencia atual no repo | Decisao | Forma alvo |
| --- | --- | --- | --- |
| Frontend admin | `src/app/(dashboard)` e `src/modules/*` | Preservar e refatorar | Next.js continua como shell operacional |
| Auth | `src/lib/supabase/*`, `apps/api/src/modules/auth` | Preservar e convergir | Supabase Auth + autorizacao relacional no banco |
| CRM | `src/modules/crm`, `apps/api/src/modules/crm`, `supabase/migrations/0036_*`, `0037_*`, `0040_*`, `0041_*` | Preservar dominio; runtime comercial ja existe, com writes legados residuais projetando para Supabase | Views/RPCs em Supabase e remocao gradual dos pontos Prisma-first |
| Pacientes | `src/modules/patients`, `apps/api/src/modules/patients`, `supabase/migrations/0010_*` a `0021_*` | Preservar dominio; Paciente 360 ja consome runtime curado nos fluxos principais | `api.patient_360`, feed longitudinal e writes nativos progressivos |
| Scheduling | `src/modules/scheduling`, `apps/api/src/modules/scheduling`, `supabase/migrations/0020_*` a `0035_*` | Preservar dominio; transicoes operacionais ja possuem RPCs/runtime, com ponte Nest transicional | RPCs SQL para agenda, fila, check-in, retorno e reducao de fallback legado |
| Clinical | `src/modules/clinical`, `apps/api/src/modules/clinical`, `supabase/migrations/0049_*` a `0065_*` | Preservar dominio; encounter, nutricao, documentos e prescricoes ja estao estruturados em Supabase | Fechar Etapa 9 com assinatura real, evidencia juridica e centro documental |
| Dashboard | `src/modules/dashboard`, `apps/api/src/modules/dashboard`, `supabase/migrations/0035_*`, `0037_*` | Refatorar continuamente | Read models e views curadas; menos agregacao no cliente |
| App do paciente | `src/app/app`, `src/modules/patient-app`, `supabase/migrations/0038_*`, `0039_*`, `0046_*` | Preservar UX sobre cockpit real e gates de acesso | Backend longitudinal como fonte de verdade |
| Persistencia local do paciente | arquivo antigo removido de `src/modules/patient-app/state` | Descontinuada como fonte de verdade | Buffer de UX apenas quando necessario; backend como verdade |
| Prisma schema | `prisma/schema.prisma` | Congelar como referencia | Migrations SQL em `supabase/migrations` |
| Seeds Prisma | `prisma/seed.ts`, `prisma/seed-level-2.ts`, `scripts/seed-runtime-*.ts` | Manter Prisma como transicional; seeds operacionais ja estao em scripts runtime | Migrar para fluxo Supabase-first mais direto quando a transicao fechar |
| API Nest | `apps/api` | Congelar e usar como ponte | Nao expandir como backend final |
| Journey logs | `supabase/migrations/0038_*`, `0039_*`, `0050_*` a `0053_*`, `src/modules/patient-app` | Reposicionado no runtime longitudinal | Schema `journey`, feed longitudinal e aderencia por contrato curado |
| Financeiro clinico | `supabase/migrations/0044_runtime_finance_domain_and_patient_summary.sql` | Construido como dominio separado do billing SaaS | `finance.*` com reconciliacao real e resumo financeiro do paciente |
| Billing SaaS | `supabase/migrations/0045_*` a `0048_*`, `supabase/functions/billing-*` | Construido como dominio separado; evoluir provider real e observabilidade | `platform.tenant_subscriptions`, meters, limites e webhooks idempotentes |
| Documentos e prescricoes auditaveis | `supabase/migrations/0054_*` a `0065_*`, `supabase/functions/document-*`, UI do encounter e layout documental | Avancado; concluir lacunas remanescentes da Etapa 9 | `docs.*` + storage privado + assinatura real + evidencia juridica + centro documental |
| Chat e comunidade | Nao existe | Postergar | Entrar so apos core longitudinal |
| Analytics pesadas | Nao existe | Postergar | `analytics.*` com read models e snapshots |

## O que aproveitar do benchmark Slim Care

- cockpit do paciente
- quick actions em modal ou sheet
- jornada operacional agenda -> fila -> atendimento -> retorno
- prontuario longitudinal percebido
- contexto comercial afetando experiencia

## O que nao herdar tecnicamente

- regra pesada no frontend
- repository gigante
- dashboards calculados demais no cliente
- microtelas demais para quick actions
- PDF improvisado como compliance final
