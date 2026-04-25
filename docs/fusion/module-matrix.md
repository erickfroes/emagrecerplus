# Matriz de fusao de modulos

Esta matriz diz o que o repositorio atual preserva, refatora, descarta ou posterga.

| Dominio | Evidencia atual no repo | Decisao | Forma alvo |
| --- | --- | --- | --- |
| Frontend admin | `src/app/(dashboard)` e `src/modules/*` | Preservar e refatorar | Next.js continua como shell operacional |
| Auth | `src/lib/supabase/*`, `apps/api/src/modules/auth` | Preservar e convergir | Supabase Auth + autorizacao relacional no banco |
| CRM | `src/modules/crm`, `apps/api/src/modules/crm` | Preservar dominio e migrar backend | Views e RPCs em Supabase |
| Pacientes | `src/modules/patients`, `apps/api/src/modules/patients` | Preservar dominio e migrar backend | Paciente 360 por `api.patient_360` e feed longitudinal |
| Scheduling | `src/modules/scheduling`, `apps/api/src/modules/scheduling` | Preservar dominio e reimplementar transicoes | RPCs SQL para agenda, fila, check-in, retorno |
| Clinical | `src/modules/clinical`, `apps/api/src/modules/clinical` | Preservar dominio e estruturar | Encounter, SOAP, tasks, goals e nutricao em Supabase |
| Dashboard | `src/modules/dashboard`, `apps/api/src/modules/dashboard` | Refatorar | Read models e views curadas; menos agregacao no cliente |
| App do paciente | `src/app/app`, `src/modules/patient-app` | Preservar UX e trocar persistencia | Cockpit real com backend longitudinal |
| Persistencia local do paciente | `src/modules/patient-app/state/patient-app-store.ts` | Descontinuar como fonte de verdade | Buffer de UX apenas; backend como verdade |
| Prisma schema | `prisma/schema.prisma` | Congelar como referencia | Migrations SQL em `supabase/migrations` |
| Seeds Prisma | `prisma/seed.ts`, `prisma/seed-level-2.ts` | Manter so como insumo de migracao | Seeds anonimas no fluxo Supabase |
| API Nest | `apps/api` | Congelar e usar como ponte | Nao expandir como backend final |
| Journey logs | `clinical.hydration_logs`, `meal_logs`, `sleep_logs`, etc. | Reposicionar | Schema `journey` com feed e aderencia |
| Financeiro clinico | Nao existe como dominio serio | Construir depois do core | `finance.*` com reconciliacao real |
| Billing SaaS | Nao existe separado | Construir explicitamente | `platform.tenant_subscriptions`, meters e limites |
| Documentos e prescricoes auditaveis | Parcial e simplificado | Reestruturar | `docs.*` + storage privado + assinatura |
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
