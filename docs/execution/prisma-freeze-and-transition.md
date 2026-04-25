# Prisma Freeze and Transition

Este documento oficializa o papel atual do Prisma no projeto.
Ele nao e mais a fonte de verdade do produto final.

## Regra principal

- `supabase/migrations/*.sql` e a fonte autoritativa de schema, regras e transicoes operacionais
- `prisma/schema.prisma` fica congelado como referencia de migracao e compatibilidade do legado
- nenhuma regra critica nova deve nascer primeiro no Prisma

## O que o Prisma ainda faz

- sustenta partes transicionais do `apps/api`
- mantem seed local e alguns smokes herdados enquanto o runtime nativo ainda convive com fallback
- ajuda a comparar o desenho antigo com o desenho SQL que esta sendo promovido

## O que migra para Supabase nativo

- plataforma multi-tenant (`platform.*`)
- identidade e autorizacao (`identity.*`)
- pacientes e leitura longitudinal (`patients.*`, `audit.*`)
- agenda, fila e atendimento (`scheduling.*`, `clinical.*`)
- RPCs operacionais em `api.*` e helpers em `private.*`

## O que deve morrer ao final da transicao

- Prisma como modelador principal de dominio
- escrita `legacy-first` para paciente, agenda e encounter
- dependencia de `public` como schema de negocio
- fallback Prisma em rotas que ja possuam contrato SQL estavel no runtime

## Estado de freeze

`prisma/schema.prisma` pode receber ajuste tecnico transicional apenas quando:

- for necessario manter build, seed ou smoke funcionando durante a migracao
- nao houver introducao de regra de negocio nova fora do runtime Supabase

Se a mudanca for estrutural de dominio, ela deve entrar primeiro em `supabase/migrations`.

## Status oficiais ja materializados no runtime

### Plataforma e acesso

- `platform.tenants.status`: `active`, `trial`, `suspended`, `archived`
- `platform.units.status`: `active`, `inactive`, `archived`
- `identity.profiles.status`: `invited`, `active`, `suspended`, `disabled`
- `identity.permissions.status`: `active`, `deprecated`
- `identity.roles.status`: `active`, `archived`
- `identity.memberships.status`: `invited`, `active`, `suspended`, `revoked`
- `identity.unit_memberships.access_level`: `member`, `manager`, `clinical`, `viewer`
- `identity.unit_memberships.status`: `active`, `inactive`
- `identity.invitation_tokens.status`: `pending`, `accepted`, `expired`, `revoked`

### Paciente e sinais clinicos

- `patients.patients.status`: `active`, `inactive`, `archived`
- `patients.patients.source`: `runtime`, `legacy_backfill`, `hybrid`
- `patients.tags.status`: `active`, `inactive`, `archived`
- `patients.patient_flags.severity`: `low`, `medium`, `high`, `critical`

### Agenda e atendimento

- `scheduling.appointments.status`: `scheduled`, `confirmed`, `checked_in`, `in_progress`, `completed`, `cancelled`, `no_show`
- `scheduling.appointments.source`: `internal`, `patient_app`, `crm`, `automation`, `other`
- `scheduling.attendance_queue.queue_status`: `waiting`, `in_attendance`, `completed`, `removed`
- `clinical.encounters.status`: `open`, `closed`, `cancelled`
- `clinical.clinical_tasks.priority`: `low`, `medium`, `high`, `urgent`
- `clinical.clinical_tasks.status`: `open`, `in_progress`, `done`, `cancelled`
- `clinical.adverse_events.severity`: `mild`, `moderate`, `severe`, `critical`
- `clinical.adverse_events.status`: `active`, `resolved`, `monitoring`, `closed`

## Decisao de permanencia por camada

| Camada | Estado | Decisao |
| --- | --- | --- |
| `supabase/migrations` | autoritativa | manter e expandir |
| `apps/api` | transicional | manter ate substituir por runtime nativo ou camada minima de composicao |
| `prisma/schema.prisma` | congelado | usar como referencia, nao como ponto de partida |
| Prisma seeds | transicional | reescrever progressivamente para o fluxo Supabase |
| Fallbacks Prisma em paciente/agenda/encounter | temporarios | remover apos `schedule_return`, `autosave_encounter_section` e writes nativos restantes |

## Pendencia para fechar a Etapa 3

- substituir progressivamente a origem dos seeds para que fixtures de homologacao nascam direto no runtime Supabase, sem depender do legado
- reduzir os ultimos pontos de leitura/escrita que ainda dependem do legado
