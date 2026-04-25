# AGENTS.md - EmagrecePlus

## Objetivo do produto

Finalizar o EmagrecePlus como SaaS clinico e operacional multi-tenant, com
admin, CRM, pacientes, agenda, prontuario, app do paciente, documentos,
prescricoes, assinatura, billing, compliance, observabilidade e go-live seguro.

## Fonte de verdade atual

Antes de abrir uma frente relevante, leia os arquivos abaixo quando existirem.
Se algum deles contradisser outro, registre a inconsistencia e use o estado real
do repositorio como criterio final:

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

## Stack real encontrada

- Frontend principal: Next.js App Router em `src/app`, Next `^16.2.4`,
  React `^19.2.0` e TypeScript `^6.0.3`.
- UI: CSS global em `src/app/globals.css`, componentes proprios em
  `src/components/ui`, icones `lucide-react` e Tailwind CSS `^4.1.14` via
  `@tailwindcss/postcss`.
- Estado e dados no frontend: TanStack React Query, React Hook Form, Zod e
  Zustand. Zustand nao pode virar fonte clinica definitiva; o antigo store
  persistido do app do paciente foi removido.
- Backend transicional: NestJS `^11.1.19` em `apps/api`, com TypeScript
  `NodeNext`, imports `.ts` e build por `apps/api/tsconfig.json`.
- Banco transicional: Prisma `^7.7.0` com `@prisma/adapter-pg`; client gerado em
  `generated/prisma/client`; schemas Prisma atuais: `platform`, `identity`,
  `patients`, `crm`, `scheduling` e `clinical`.
- Runtime final desejado e em execucao incremental: Supabase Cloud, com
  migrations SQL autoritativas em `supabase/migrations`, Edge Functions em
  `supabase/functions` e schema `api` para exposicao controlada.
- Banco local: `docker-compose.yml` usa Postgres 16 nas portas host `55432` e
  `55433` para banco principal e shadow.
- Auth: Supabase Auth combinado com sessao da aplicacao. `.env.example` aponta
  `NEXT_PUBLIC_AUTH_MODE=real`; CI usa `NEXT_PUBLIC_AUTH_MODE=mock` por padrao e
  roda smoke real somente quando secrets Supabase existem.
- CI: `.github/workflows/ci-smokes.yml` usa Node 24, `npm ci`,
  `prisma:generate`, typecheck, build Next, build API, API smoke e frontend auth
  smoke condicional.

## Arquitetura congelada

- EmagrecePlus e a base tecnica oficial.
- Slim Care e benchmark de jornada, UX e cobertura funcional, nao arquitetura a
  copiar.
- `apps/api` e uma ponte transicional. Corrigir e adaptar e permitido; crescer
  dominio critico ali exige justificativa de transicao.
- `prisma/schema.prisma` e inventario/transicao, nao fonte autoritativa final.
- Toda regra critica nova deve nascer em `supabase/` como SQL, RPC, trigger ou
  Edge Function.
- Schemas de negocio nao devem nascer em `public`.
- `public` existe como fachada de compatibilidade, especialmente para wrappers
  RPC expostos ao PostgREST.
- Helpers privilegiados e funcoes `security definer` vivem em `private`.
- APIs curadas expostas ao frontend vivem preferencialmente em `api`.
- Buckets sensiveis sao privados por padrao e devem usar RLS, JWT ou signed URL
  temporaria.
- Nunca usar `service_role` no browser ou em modulo importavel pelo browser.
- Migrations antigas aplicadas nao devem ser alteradas; crie migration nova.

## Estado operacional do roadmap

- Etapas 0 a 8 estao marcadas como `done` no checklist mestre.
- Etapa 9 esta `in_progress`: documentos, prescricoes e compliance operacional.
- Etapa 10 esta marcada como `done`: comercial, elegibilidade, financeiro e
  billing SaaS. A numeracao esta fora da ordem de execucao pratica, mas esse e o
  estado registrado no repo.
- Etapas 11 a 14 estao `later`.
- Proximo foco tecnico registrado: fechar lacunas da Etapa 9 com verificacao
  criptografica de assinatura por provedor real, evidencia juridica final e
  download seguro de artefatos fora do detalhe do encounter.

## Supabase atual

- `supabase/migrations` existe e contem migrations de `0001` a `0065`, alem de
  `.gitkeep`.
- `supabase/functions` existe com Edge Functions para billing e documentos:
  `billing-gateway`, `billing-webhook`, `document-printable`,
  `document-signature-dispatch` e `document-signature-webhook`.
- `supabase/seeds` existe, mas no estado atual contem apenas `.gitkeep`; os seeds
  operacionais reais estao em `scripts/seed-runtime-*.ts`.
- Buckets privados fundacionais estao documentados em
  `docs/execution/storage-upload-policy.md`: `brand-assets`, `profile-avatars`,
  `patient-documents` e `clinical-attachments`.

## Comandos reais

- Dev integrado frontend + API: `npm run dev`
- Parar listeners locais presos nas portas 3000/3001: `npm run dev:stop`
- Dev somente frontend: `npm run web:dev`
- Dev somente API: `npm run api:dev`
- Build frontend: `npm run build`
- Start frontend compilado: `npm run start`
- Typecheck frontend geral: `npm run typecheck`
- Build API transicional: `npm run api:build`
- Start API compilada: `npm run api:start`
- Typecheck API: `npm run api:typecheck`
- Smoke API: `npm run api:smoke`
- Smoke frontend/auth real: `npm run frontend:auth-smoke`
- Gerar Prisma client: `npm run prisma:generate`
- Prisma migrate dev: `npm run prisma:migrate`
- Prisma migrate deploy: `npx prisma migrate deploy`
- Prisma Studio: `npm run prisma:studio`
- Seed Prisma base: `npm run prisma:seed`
- Seed Prisma operacional legado: `npm run prisma:seed:level2`
- Backfill auth: `npm run auth:backfill`
- Backfill runtime: `npm run runtime:backfill`
- Seed Supabase-first de homologacao: `npm run runtime:seed`
- Seed direto no runtime Supabase: `npm run runtime:seed:direct`
- Seed hibrido legado + runtime: `npm run runtime:seed:hybrid`
- Banco local: `docker compose up -d`

Observacao: `package.json` declara `packageManager` como pnpm, mas os scripts,
README e CI atuais usam `npm`. Nao troque o gerenciador da entrega sem uma tarefa
explicita para isso.

## Guardrails de implementacao

- Preferir mudancas pequenas, testaveis e revisaveis.
- Nao criar regra clinica multi-tabela no React.
- Nao usar Zustand, localStorage ou estado de tela como fonte clinica final.
- Fluxos centrais precisam de auditoria e evento longitudinal quando o dominio
  exigir.
- Toda escrita multi-tenant precisa validar tenant, unidade, usuario/permissao e
  escopo de acesso.
- Webhooks precisam de chave idempotente, reprocessamento seguro e log auditavel.
- Buckets e arquivos clinicos/documentais devem ser privados por padrao.
- Secrets ficam apenas em ambiente, GitHub Actions, Vercel ou Supabase; nunca
  commitar `.env`, chaves Supabase, service role, tokens ou credenciais.
- Se tocar em dados ou regra critica, preferir Supabase SQL/RPC/trigger/Edge
  Function documentada em vez de regra espalhada no cliente.

## Proibicoes explicitas

- Nao usar `service_role` em codigo de browser ou modulo importavel pelo browser.
- Nao criar schemas, tabelas ou views de negocio em `public`.
- Nao tornar bucket sensivel publico.
- Nao alterar migration antiga ja aplicada.
- Nao adicionar dominio critico novo em `apps/api` sem registrar que e ponte de
  transicao.
- Nao liberar endpoint central sem auth, autorizacao e tenant scope.
- Nao criar webhook sem chave idempotente e persistencia do evento recebido.
- Nao tratar dados clinicos ou de paciente como mock persistente/local
  definitivo.
- Nao commitar artefatos gerados desnecessarios: `.next`, `dist`,
  `tsbuildinfo`, client Prisma gerado, `.vercel` ou secrets locais.

## Definition of Done

Uma entrega critica so esta pronta quando tiver:

- migration SQL quando houver mudanca de dados
- grants, RLS, indices e constraints
- RPC, trigger ou Edge Function documentada quando aplicavel
- teste automatizado ou smoke relevante
- seed ou fixture quando necessario
- UI com estados de loading, erro e vazio quando houver superficie visual
- auditoria
- evento longitudinal quando o dominio exigir
- checks executados e reportados
- pendencias e riscos reais descritos no fechamento

## Checks obrigatorios

- Docs only: revisar diff e executar `git diff --check`.
- Frontend: `npm run typecheck` e `npm run build`.
- API transicional: `npm run prisma:generate`, `npm run api:typecheck` e
  `npm run api:build`.
- Mudanca de fluxo API ou contrato: executar tambem `npm run api:smoke` com banco
  local migrado e seeds aplicados.
- Auth real/frontend protegido: executar `npm run frontend:auth-smoke` quando os
  secrets Supabase estiverem disponiveis.
- Paridade CI local quando a mudanca justificar: `docker compose up -d`,
  `npm run prisma:generate`, `npx prisma migrate deploy`,
  `npm run prisma:seed`, `npm run prisma:seed:level2`, `npm run typecheck`,
  `npm run api:build`, `npm run build` e `npm run api:smoke`.

## Resposta final obrigatoria

Ao terminar qualquer tarefa, responder com:

1. O que mudou
2. Arquivos alterados
3. Checks executados
4. Resultado dos checks
5. Pendencias reais
6. Riscos ou decisoes tomadas
