# Monitoramento documental operacional

## Superficie

- API administrativa: `GET /documents/ops/health`.
- UI administrativa: `/clinical/documents/ops/health`.
- RPC alvo: `api.get_document_operational_health`.
- Wrapper PostgREST service-role-only: `public.get_document_operational_health`.
- Eventos operacionais persistidos: `docs.document_operational_events`.

A resposta nao expoe `storageObjectPath`, URLs assinadas, secrets, payload bruto de webhook
ou chaves D4Sign. O browser consome apenas a API transicional autenticada; `service_role`
continua restrito ao servidor e Edge Functions.

## Dados monitorados

- Ultimos dispatches de assinatura por provider, modo, status e documento.
- Ultimos webhooks persistidos em `docs.signature_events`.
- Falhas de HMAC registradas por `document-signature-webhook`.
- Webhooks duplicados detectados pela idempotencia.
- Falhas de pacote juridico e de `print_package`.
- Evidencias pendentes ou com verificacao pendente.
- `provider_config_missing` quando D4Sign esta selecionado sem credenciais completas.

## Quando investigar

- `Falha`: investigar imediatamente. Inclui dispatch `failed`, HMAC invalido,
  pacote com status `failed` e falha de consumo do webhook.
- `Atencao`: avaliar antes de ativar provider real. Inclui webhook duplicado e
  `provider_config_missing`.
- `Pendente`: acompanhar a fila operacional. Inclui evidencias parciais,
  verificacao ainda `pending` ou dispatch ainda pendente.
- `OK`: nao ha ocorrencia monitorada no periodo/provider/status filtrado.

## `provider_config_missing`

`provider_config_missing` e esperado quando:

- `DOCUMENT_SIGNATURE_PROVIDER=d4sign` esta ativo;
- o modo caiu em `unconfigured`;
- faltam variaveis reais como `D4SIGN_TOKEN_API`, `D4SIGN_CRYPT_KEY`,
  `D4SIGN_WEBHOOK_SECRET` ou `D4SIGN_SAFE_UUID`;
- o dispatch fica `skipped` e a solicitacao permanece pendente.

Esse status nao indica tentativa real contra a D4Sign. Ele confirma que o produto
nao chamou rede externa sem credenciais completas.

Tratar como erro real quando:

- o ambiente deveria estar em `simulated`, `mock` ou `real` validado;
- a contagem cresce depois de configurar credenciais sandbox/producao;
- aparece junto de `not_implemented`, dispatch `failed`, HMAC invalido ou falha
  de pacote/evidencia.

## Procedimento curto

1. Filtrar por `D4Sign` e periodo de 24h.
2. Verificar cards de HMAC, duplicidade, pacote e provider sem configuracao.
3. Abrir o detalhe do documento afetado pelo `documentId` exibido.
4. Consultar o dossie em `/documents/:id/evidence`.
5. Para `provider_config_missing`, conferir secrets server-side sem copiar valores
   para logs, tickets ou screenshots.
6. Para HMAC invalido, confirmar `D4SIGN_HMAC_STRATEGY`, header `Content-Hmac` e
   modo (`simulated` ou futuro `real`).
7. Para duplicidade, confirmar se o replay retornou `duplicate=true` sem alterar
   status final indevidamente.

## Checks esperados

- `git diff --check`
- `npm run typecheck`
- `npm run api:typecheck`
- `npm run api:build`
- `npm run build`
- `npm run api:smoke:local`
- `npm run api:smoke:real`, quando secrets Supabase estiverem disponiveis
