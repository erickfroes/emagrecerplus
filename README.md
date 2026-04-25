# EmagrecePlus - SaaS

Este repositorio entrou em uma transicao arquitetural controlada.
O EmagrecePlus segue como base tecnica do produto.
O Slim Care entra como benchmark de UX, jornada e cobertura funcional.
O runtime final passa a ser Supabase Cloud.

## Fonte de verdade

Leia estes arquivos antes de abrir novas frentes:

1. `docs/execution/control-checklist.md`
2. `docs/execution/operating-system.md`
3. `docs/adr/0001-emagreceplus-supabase-runtime.md`
4. `docs/fusion/module-matrix.md`
5. `docs/execution/gap-analysis.md`
6. `docs/execution/environments-and-deploys.md`
7. `docs/execution/prisma-freeze-and-transition.md`
8. `docs/execution/public-schema-boundary.md`
9. `docs/execution/storage-upload-policy.md`
10. `supabase/README.md`

## Estado atual do repositorio

- Frontend principal: Next.js App Router em `src/app`
- Runtime backend transicional: NestJS em `apps/api`
- Modelo de dados transicional: Prisma multi-schema em `prisma/schema.prisma`
- Auth: Supabase Auth combinado com sessao da aplicacao
- Paciente 360 parcial: `src/app/(dashboard)/patients/[id]/page.tsx`
- App do paciente com cockpit real e quick actions transacionais em `src/app/app`
- Encounter estruturado e nutricao versionada no runtime em `supabase/migrations/0049_*` a `0053_*`
- Fundacao documental e de prescricoes estruturadas aberta no runtime em `supabase/migrations/0054_runtime_docs_and_prescriptions_foundation.sql`
- Primeiro slice funcional de prescricoes estruturadas ativo no encounter com `0055_*`, `0056_*`, `POST /encounters/:id/prescriptions` e UI dedicada em `src/modules/clinical/components/prescription-record-form.tsx`
- Slice documental operacional ativo no runtime com `0057_*` a `0065_*`, `GET /document-templates`, `POST /encounters/:id/documents`, `POST /documents/:id/printable-artifacts`, `POST /documents/:id/signature-requests`, `GET /settings/document-layout`, `PUT /settings/document-layout/branding`, `PUT /settings/document-layout/templates/:id`, `document-printable`, `document-signature-dispatch` e `document-signature-webhook`
- Editor de layout documental ativo em `/clinical/document-layout`, consumindo presets clinicos, branding por tenant, logo/footer e standards notes operacionais do runtime
- O renderer `document-printable` agora respeita layout/branding presentes no snapshot documental e emite HTML, PDF textual e `print_package` ZIP com manifesto no prefixo privado padrao do paciente
- O fluxo de assinatura agora registra dispatch auditavel com tentativa, payload/resposta, idempotency key, envelope externo e status visivel no encounter
- O encounter agora expoe links seguros temporarios para abrir e baixar artefatos documentais em `GET /documents/:id/access-links`, sem expor o bucket privado diretamente no frontend
- Validacao recente do slice documental: `0065_document_signature_dispatch_evidence.sql` aplicada no staging e `supabase functions deploy document-signature-dispatch` executado apos o alinhamento do dispatch

## Congelamento de arquitetura

- `apps/api` nao e o runtime final. E uma camada transicional para manter o produto andando enquanto o backend migra para Supabase nativo.
- `prisma/schema.prisma` nao e mais a fonte autoritativa do produto final. Ele vira referencia de migracao.
- Toda nova regra critica deve nascer em SQL, RPC, trigger ou Edge Function no workspace `supabase/`.
- Estado local no frontend pode existir como buffer de UX, nunca como fonte clinica definitiva.
- Qualquer trabalho novo deve reforcar multi-tenant, RLS, auditoria e longitudinalidade.

## Prioridade imediata

A proxima etapa de implementacao deve seguir esta ordem:

1. Fechar as lacunas remanescentes da Etapa 9 apos o slice de dispatch: verificacao criptografica por provedor real de assinatura, evidencia juridica final e centro documental administrativo
2. Expandir o acesso seguro documental para superficies alem do detalhe do encounter e consolidar um centro documental administrativo
3. Expandir o app do paciente para consumir os gates reais de comunidade, chat e retorno quando essas superficies entrarem no produto
4. Reduzir os writes residuais ainda Prisma-first fora da trilha principal do runtime

## Desenvolvimento local

- Setup local com Docker:
  1. Copie `.env.example` para `.env` e mantenha secrets reais apenas no arquivo
     local nao versionado.
  2. Suba os bancos locais com `docker compose up -d`. O Postgres principal usa
     `127.0.0.1:55432` e o shadow DB usa `127.0.0.1:55433`.
  3. Instale dependencias com `npm ci`.
  4. Gere o Prisma client com `npm run prisma:generate`.
  5. Aplique migrations locais com `npx prisma migrate deploy`.
  6. Carregue fixtures transicionais com `npm run prisma:seed` e
     `npm run prisma:seed:level2`.
  7. Rode os checks de base com `npm run typecheck`, `npm run api:typecheck`,
     `npm run api:build` e `npm run build`.
  8. Rode `npm run api:smoke` somente com o Postgres local ativo, migrations
     aplicadas e seeds carregados.
- Os scripts `runtime:seed`, `runtime:seed:direct` e `runtime:seed:hybrid`
  existem para a trilha Supabase-first/homologacao e dependem das variaveis de
  runtime apropriadas.
- `npm run frontend:auth-smoke` depende de secrets Supabase reais disponiveis no
  ambiente.
- `npm run dev` sobe frontend e API juntos para evitar `ERR_CONNECTION_REFUSED` em `http://localhost:3001`
- `npm run dev` agora tambem falha cedo com mensagem clara se `3000` ou `3001` ja estiverem ocupadas
- `npm run dev:stop` encerra listeners presos nas portas `3000` e `3001` no Windows
- `npm run web:dev` sobe apenas o Next.js
- `npm run api:dev` sobe a API NestJS com `tsc --watch` + `node --watch`, preservando a injecao de dependencia do Nest em desenvolvimento

## Regra de contribuicao

Nao expandir `apps/api` com novo dominio critico sem uma razao transicional explicita.
Nao adicionar nova dependencia estrutural em Prisma se ela ja deveria nascer em Supabase.
