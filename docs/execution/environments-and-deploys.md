# Environments, Deploys and Rollback

Este documento fecha a disciplina operacional minima do projeto.
O objetivo e parar de tratar ambientes e deploy como acordo verbal.

## Estrategia de branches

- `main`: trilho de codigo pronto para producao.
- `staging`: trilho de integracao e homologacao antes de promover para `main`.
- `feature/*`: frentes curtas de implementacao com entrega por pull request.

Regra pratica:

- toda feature nova nasce em `feature/*`
- toda validacao integrada acontece por PR e merge em `staging`
- a promocao para producao sai de `staging` para `main`

Observacao operacional:

- a estrategia esta oficializada no repo agora
- a branch remota `staging` ja foi criada em `origin/staging`
- branch protection automatica nao pode ser habilitada neste repositorio privado com o plano GitHub atual; isso fica como limitacao da plataforma, nao do repo

## Mapa de ambientes

| Ambiente | Uso | Runtime web/api | Banco |
| --- | --- | --- | --- |
| local | desenvolvimento e smoke local | `.env` ou `.env.local` nao versionados | Postgres local e Supabase CLI quando necessario |
| ci | build, typecheck e smoke automatizado | GitHub Actions | Postgres efemero + Supabase secrets opcionais |
| staging | homologacao integrada | projeto Vercel `emagrece-plus-saa-s` em preview/staging | projeto Supabase oficial de staging: `sjrwhblnzsgzmhztsyqi` (`EmagreceHiper`) |
| prod | producao | mesmo projeto Vercel, promoted deploy em `main` | projeto Supabase oficial de producao: `llxweqotzxwtsjprjlnr` (`Emagrece Med`) |

## Pipeline oficial no repositorio

- [ci-smokes.yml](../../.github/workflows/ci-smokes.yml): roda em `pull_request`, `push` para `main` e `staging`, e `workflow_dispatch`
- [vercel-preview.yml](../../.github/workflows/vercel-preview.yml): cria preview deploy por PR quando os secrets do Vercel estiverem configurados

## Politica de secrets

- nenhum secret sensivel entra em git
- `.env`, `.env.*` e `.vercel` ficam fora do versionamento
- GitHub Actions guarda os secrets de CI/CD
- Vercel guarda variaveis de runtime de preview e producao
- Supabase guarda chaves de projeto, banco e integracoes operacionais
- uso local de secrets serve apenas para desenvolvimento e comandos manuais

## Contrato de variaveis de ambiente

### Browser (`NEXT_PUBLIC_*`)

- `NEXT_PUBLIC_API_BASE_URL`: base HTTP do backend consumida pelo app
- `NEXT_PUBLIC_AUTH_MODE`: `mock` ou `real`
- `NEXT_PUBLIC_SUPABASE_URL`: URL publica do projeto Supabase
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: chave publishable para auth/browser
- `NEXT_PUBLIC_DEMO_LOGIN_ENABLED`: habilita login de demonstracao
- `NEXT_PUBLIC_DEMO_LOGIN_EMAIL`: email default da demo
- `NEXT_PUBLIC_DEMO_LOGIN_PASSWORD`: senha default da demo

### Server e automacao

- `API_PORT`
- `API_BASE_URL`
- `APP_BASE_URL`
- `APP_TIMEZONE`
- `DATABASE_URL`
- `DIRECT_URL`
- `SHADOW_DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY`
- `BILLING_PROVIDER`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_API_VERSION`
- `DEFAULT_TENANT_ID`
- `DEFAULT_UNIT_CODE`
- `DEFAULT_PIPELINE_CODE`
- `DEFAULT_RECEPTION_EMAIL`
- `DEFAULT_SALES_EMAIL`
- `DEFAULT_CLINICAL_USER_EMAIL`

### CLI e operacao manual

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Regra dura:

- `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD` e tokens de automacao nunca podem vazar para `NEXT_PUBLIC_*`

## Secrets esperados por provedor

### GitHub Actions

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

### Vercel

- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_AUTH_MODE`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_BASE_URL`
- `BILLING_PROVIDER`
- `STRIPE_SECRET_KEY` quando o provider real for Stripe
- `STRIPE_WEBHOOK_SECRET` quando o provider real for Stripe
- `STRIPE_API_VERSION` opcional
- `SUPABASE_PUBLISHABLE_KEY`
- `API_BASE_URL` se o backend depender do mesmo projeto na promocao

### Supabase Edge Functions

- `SUPABASE_SERVICE_ROLE_KEY` nao pode faltar nas funcoes `billing-gateway` e `billing-webhook`
- `billing-webhook` deve ser publicado com `--no-verify-jwt`
- `billing-gateway` continua com JWT obrigatorio porque resolve o tenant a partir da sessao autenticada

## Fluxo de deploy

1. Abrir branch `feature/*`
2. Subir PR
3. Deixar `ci-smokes` e `vercel-preview` validarem o corte
4. Fazer merge em `staging`
5. Rodar smoke manual integrado contra staging quando a mudanca mexer com auth, migrations ou runtime operacional
6. Promover `staging` para `main`
7. Executar deploy de producao e validacao curta de pos-deploy

Observacao atual:

- as migrations Supabase ainda estao sendo promovidas de forma controlada/manual
- isso continua aceitavel enquanto a promocao automatica para producao ainda nao estiver ligada

## Fluxo de rollback

### Web e API

1. travar merges novos
2. identificar o ultimo commit/deploy saudavel
3. reverter o merge ofensivo ou promover o ultimo deploy estavel no Vercel
4. rodar smoke minimo de auth, agenda e Paciente 360

### Banco

1. evitar rollback destrutivo de migration ja aplicada
2. preferir migration corretiva de avancar
3. usar restore ou PITR apenas para incidente real de dados
4. registrar o incidente e congelar novas migrations ate estabilizar

## Pendencias operacionais fora do repo

- se o repositorio migrar para plano/feature compativel, habilitar branch protection em `staging` e `main`
