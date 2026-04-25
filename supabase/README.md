# Supabase workspace

Este diretorio passa a ser a base do runtime backend final.

## Estrutura esperada

- `supabase/migrations/`: migrations SQL autoritativas
- `supabase/functions/`: Edge Functions
- `supabase/seeds/`: seeds anonimas e fixtures de homologacao

## Edge Functions atuais

- `billing-gateway`: abre sessao de checkout/portal do billing SaaS do tenant
- `billing-webhook`: consome eventos idempotentes do gateway e reconcilia `platform.tenant_subscriptions`
- `document-printable`: gera HTML, PDF textual e pacote ZIP de documentos no bucket privado do paciente
- `document-signature-dispatch`: registra tentativa auditavel de envio para assinatura e, quando configurado, chama um provedor HTTP externo
- `document-signature-webhook`: consome eventos idempotentes do provedor de assinatura e atualiza documento/versao assinada

## Secrets minimos para as Edge Functions

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` ou `SUPABASE_PUBLISHABLE_KEY`
- `APP_BASE_URL`
- `BILLING_PROVIDER`
- `DOCUMENT_SIGNATURE_PROVIDER`

Quando o provider for `stripe`, tambem configurar:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_API_VERSION` opcional

Quando houver provedor real de assinatura documental, tambem configurar:

- `DOCUMENT_SIGNATURE_DISPATCH_URL`
- `DOCUMENT_SIGNATURE_API_KEY` opcional
- `DOCUMENT_SIGNATURE_CALLBACK_URL` opcional; se ausente, usa `/functions/v1/document-signature-webhook`

## Seed operacional atual

- `npm run runtime:seed` e o ponto de entrada Supabase-first da homologacao
- `npm run runtime:seed:direct` cria fixtures minimas diretamente no runtime Supabase, sem depender do banco legado
- `npm run runtime:seed:hybrid` preserva a trilha transicional com seed legado + backfill quando isso ainda for necessario

## Regras

- schemas de negocio nao devem nascer em `public`
- frontend consome `api`
- helpers e funcoes privilegiadas vivem em `private`
- buckets sensiveis sao privados por padrao
- funcoes sensiveis nao recebem grant publico por acidente
- toda regra critica multi-tabela entra em SQL RPC ou Edge Function, nunca so no cliente

## Convencoes iniciais

- nome de RPC: `api.<verbo>_<entidade>`
- helpers internos: `private.<acao>`
- um arquivo de migration por unidade coerente de mudanca
- toda migration nova precisa registrar grants, RLS, indices e rollback pensado

## Papel do codigo legado

- `prisma/` = referencia de migracao
- `apps/api/` = ponte transicional

Nenhum desses dois diretorios substitui o workspace Supabase como alvo final.
