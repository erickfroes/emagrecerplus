# CODEX_CONTEXT.md - EmagrecePlus

## Snapshot atual

- Data de referencia: 2026-04-25
- Branch de trabalho: `chore/sync-codex-context-v2`
- Commit local apos sincronizacao: `4bb41d3`
- Remote confirmado: `origin/main`
- Contexto antigo de `AGENTS.md` e `docs/execution/CODEX_CONTEXT.md` foi tratado
  como desatualizado e nao foi reaproveitado como fonte.

## Arquitetura real

O EmagrecePlus e um SaaS clinico-operacional em transicao controlada. O frontend
principal continua em Next.js App Router dentro de `src/app`. O backend NestJS em
`apps/api` permanece como camada transicional para manter o produto operando
enquanto o runtime final migra para Supabase Cloud.

O runtime final fica em `supabase/`. As migrations SQL em
`supabase/migrations` sao a fonte autoritativa nova para schemas, RLS, grants,
RPCs, triggers e regras criticas. Edge Functions em `supabase/functions` cobrem
operacoes com segredo ou integracao externa, especialmente billing, documentos e
assinatura. `prisma/schema.prisma` segue como inventario e compatibilidade do
legado, nao como destino final.

O desenho alvo usa schemas de negocio fora de `public`. O schema `api` concentra
contratos curados para consumo, `private` concentra helpers privilegiados, e
schemas como `platform`, `identity`, `patients`, `crm`, `scheduling`,
`clinical`, `journey`, `commercial`, `finance`, `docs`, `audit`, `analytics` e
`comms` representam os dominios. `public` e apenas fachada de compatibilidade
para wrappers RPC e extensoes.

Storage sensivel deve ser privado. A politica atual documenta os buckets
`brand-assets`, `profile-avatars`, `patient-documents` e `clinical-attachments`,
com prefixos por tenant e regras de MIME/tamanho. Novas superficies documentais
devem usar signed URLs temporarias ou JWT autorizado, sem expor paths privados
diretamente ao browser.

## Stack real

- Next.js `^16.2.4`, React `^19.2.0`, TypeScript `^6.0.3`.
- Tailwind CSS `^4.1.14` via `@tailwindcss/postcss`, CSS global em
  `src/app/globals.css`, componentes proprios em `src/components/ui` e icones
  `lucide-react`.
- Dados/estado frontend: TanStack React Query, React Hook Form, Zod e Zustand.
  O store persistido do app do paciente nao existe mais; o app consome backend
  real para cockpit e quick actions.
- Backend transicional: NestJS `^11.1.19` em `apps/api`.
- Prisma `^7.7.0` com `@prisma/adapter-pg`, client em
  `generated/prisma/client` e datasource multi-schema legado.
- Supabase CLI `^2.93.0` como devDependency.
- Banco local via Docker Compose: Postgres 16 em `55432` e shadow em `55433`.
- CI usa Node 24 e `npm ci`. O `packageManager` declara pnpm, mas o fluxo real
  atual documentado e executado no CI usa npm.

## Comandos reais

- `npm run dev`: sobe frontend e API juntos.
- `npm run dev:stop`: encerra listeners locais presos em 3000/3001 no Windows.
- `npm run web:dev`: sobe apenas o Next.js.
- `npm run api:dev`: sobe a API NestJS em modo dev.
- `npm run typecheck`: gera tipos do Next e roda `tsc --noEmit`.
- `npm run build`: build do Next.
- `npm run prisma:generate`: gera Prisma client e aplica ajuste de imports.
- `npm run api:typecheck`: typecheck da API.
- `npm run api:build`: build da API.
- `npm run api:start`: start da API compilada.
- `npm run api:smoke`: build da API e smoke via `scripts/api-smoke.ts`.
- `npm run frontend:auth-smoke`: build API, build Next e smoke de auth real.
- `npm run runtime:seed`: seed Supabase-first de homologacao.
- `npm run runtime:seed:direct`: fixtures minimas direto no runtime Supabase.
- `npm run runtime:seed:hybrid`: seed legado + backfill runtime.
- `npm run runtime:backfill`: backfill do runtime Supabase.
- `npm run auth:backfill`: backfill da projecao de auth.
- `docker compose up -d`: sobe Postgres local principal e shadow.

## Status real do roadmap

Segundo `docs/execution/control-checklist.md`:

- Etapa 0: governanca e freeze arquitetural - `done`.
- Etapa 1: infra cloud-only e ambientes - `done`.
- Etapa 2: fundacao Supabase e hardening inicial - `done`.
- Etapa 3: migracao de schema e abandono do Prisma como fonte de verdade -
  `done`.
- Etapa 4: identidade, memberships e autorizacao - `done`.
- Etapa 5: nucleo longitudinal e paciente 360 - `done`.
- Etapa 6: agenda, fila, atendimento e retorno - `done`.
- Etapa 7: app do paciente com cockpit real - `done`.
- Etapa 8: prontuario, encounter, care plan e nutricao estruturada - `done`.
- Etapa 9: documentos, prescricoes e compliance operacional - `in_progress`.
- Etapa 10: comercial, elegibilidade e financeiro - `done`.
- Etapas 11 a 14: notificacoes/chat/comunidade, observabilidade, go-live e
  expansao controlada - `later`.

Observacao importante: a Etapa 10 aparece como concluida enquanto a Etapa 9
segue ativa. Isso e uma realidade do checklist atual, nao um erro de leitura.

## Etapa ativa

A etapa ativa e a Etapa 9: documentos, prescricoes e compliance operacional.

Ja existe base documental e de prescricoes no runtime, incluindo:

- migrations `0054` a `0065`
- documentos, versoes, templates, signature requests, signature events e
  printable artifacts
- prescricoes estruturadas e itens de prescricao no fluxo do encounter
- `document-printable` gerando HTML, PDF textual e `print_package` ZIP em bucket
  privado
- `document-signature-dispatch` com registro auditavel de tentativa, payload,
  resposta, idempotency key e envelope externo
- `document-signature-webhook` idempotente
- editor de layout documental em `/clinical/document-layout`
- branding, logo, footer, standards notes e presets por tenant/template
- signed URLs temporarias no detalhe do encounter para abrir e baixar artefatos

O que falta para fechar a etapa:

- verificacao criptografica integrada a provedor real de assinatura
- evidencia juridica final consolidada
- download seguro/signed URL para artefatos documentais fora do detalhe do
  encounter
- centro documental administrativo consolidado

## Riscos reais

- `apps/api` e Prisma ainda existem como ponte transicional; alguns writes
  residuais, especialmente lead e atividade, ainda projetam do legado para o
  runtime.
- `.env.example` usa `DATABASE_URL` e `SHADOW_DATABASE_URL` em `localhost:5432`,
  mas `docker-compose.yml` expoe Postgres nas portas host `55432` e `55433`, e o
  CI tambem usa `55432/55433`.
- `package.json` declara `packageManager` como pnpm, mas README e CI usam npm.
  Trocar gerenciador sem alinhamento pode introduzir ruido.
- `supabase/seeds` existe, mas contem apenas `.gitkeep`; os seeds operacionais
  estao em scripts TypeScript.
- Smokes reais dependem de Postgres local, migrations, seeds e secrets. O
  checklist registra `npm run api:smoke` bloqueado recentemente por Postgres
  local indisponivel em `localhost:55432/emagreceplus`.
- Deploy de migrations Supabase ainda e descrito como controlado/manual.
- Frontend auth smoke no CI so roda quando secrets Supabase estao configurados.

## Inconsistencias reais encontradas

- `docs/execution/gap-analysis.md` esta parcialmente antigo: ainda afirma que
  nao existe workspace Supabase oficial, schemas `api/private`, RLS versionada,
  `audit.audit_events` e `audit.patient_timeline_events`, mas esses itens aparecem
  como materializados no checklist e nas migrations atuais.
- O mesmo `gap-analysis.md` menciona `src/modules/patient-app/state/patient-app-store.ts`
  como fonte persistida em Zustand, mas esse arquivo foi removido e o app do
  paciente usa backend real.
- `docs/fusion/module-matrix.md` ainda descreve financeiro serio, billing SaaS e
  documentos/prescricoes como ausentes, parciais ou futuros; o checklist atual
  registra Etapa 10 concluida e Etapa 9 avancada ate dispatch auditavel.
- `.env.example` e `docker-compose.yml` divergem nas portas locais do Postgres.
- `supabase/.temp` esta versionado no estado sincronizado. Nao ha secret lido
  ali nesta tarefa, mas nao adicionar credenciais ou tokens a essa area.

## Proxima sequencia recomendada

1. Fazer uma tarefa docs-only para reconciliar `gap-analysis.md`,
   `module-matrix.md` e a divergencia de portas em `.env.example`, sem mexer em
   dominio clinico.
2. Na Etapa 9, implementar a verificacao criptografica de assinatura com provedor
   real e consolidar a evidencia juridica final no runtime Supabase.
3. Criar ou consolidar o centro documental administrativo com download seguro de
   artefatos fora do detalhe do encounter.
4. Continuar reduzindo writes Prisma-first residuais, principalmente CRM/lead
   activity, sempre registrando o lado transicional e o alvo Supabase.

## Checks esperados por tipo de mudanca

- Docs only: `git diff --check`.
- Frontend: `npm run typecheck` e `npm run build`.
- API transicional: `npm run prisma:generate`, `npm run api:typecheck` e
  `npm run api:build`.
- Fluxo API/contrato: adicionar `npm run api:smoke` com banco local migrado e
  seeds aplicados.
- Auth real: adicionar `npm run frontend:auth-smoke` quando os secrets Supabase
  estiverem disponiveis.
