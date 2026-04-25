# Gap analysis do repositorio atual

## O que ja existe e vale aproveitar

- Frontend Next.js organizado por modulos
- Integracao com Supabase Auth
- Dominios iniciais de `platform`, `identity`, `patients`, `crm`, `scheduling` e `clinical`
- Primeira versao de dashboard operacional
- Primeira versao de paciente 360
- App do paciente com cockpit inicial e quick actions

## Gaps criticos contra o alvo final

### Runtime e backend

- O runtime principal ainda depende de NestJS em `apps/api`
- O modelo de dados autoritativo ainda esta em `prisma/schema.prisma`
- Nao existe workspace Supabase como fonte oficial de migrations, functions e seeds

### Seguranca e exposicao

- Ainda nao ha `api` e `private` materializados como schemas versionados no repo
- Nao ha politicas RLS versionadas no repositorio
- Nao ha estrategia formal de grants minimos e default deny no git

### Longitudinalidade

- Nao existe `audit.patient_timeline_events`
- Nao existe `audit.audit_events`
- O paciente 360 atual monta timeline a partir de encounters e notas, nao de um feed longitudinal append-only

### App do paciente

- `src/modules/patient-app/state/patient-app-store.ts` persiste agua, refeicoes, treino, sono e sintomas em Zustand persist
- Isso contradiz a regra de backend como fonte clinica de verdade

### Dominios ausentes ou incompletos

- `journey`
- `commercial`
- `finance`
- `docs`
- `comms`
- `audit`
- `analytics`
- `platform` ainda sem billing SaaS completo, usage metering e subscriptions formais

### Operacao cloud-only

- Nao existe ainda um fluxo declarado de branching Supabase, preview deploy e migrations SQL nativas
- O repositorio nao comunica claramente a natureza transicional de `apps/api` e `prisma/`

## O que fazer agora

### Fase imediata

1. Estruturar `supabase/` como destino de migrations, functions e seeds
2. Criar migrations base para `api`, `private` e schemas faltantes
3. Definir helpers de escopo e autorizacao (`current_profile_id`, `current_tenant_id`, `current_unit_ids`, `has_permission`, `can_access_patient`)
4. Criar `audit.audit_events` e `audit.patient_timeline_events`
5. Desenhar `api.patient_360`, `api.patient_longitudinal_feed`, `api.patient_operational_alerts`

### Fase seguinte

1. Mover agenda -> fila -> encounter -> retorno para RPCs SQL
2. Mover logs do paciente para persistencia real
3. Tirar agregacoes relevantes do cliente e servi-las por read models

## O que nao fazer na sequencia

- Nao crescer `apps/api` como se ele fosse o alvo final
- Nao adicionar mais regra clinica em Zustand
- Nao comecar chat, comunidade ou IA antes de fechar core longitudinal
- Nao implementar financeiro serio antes de separar financeiro clinico e billing SaaS
