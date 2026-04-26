# Chat Community Plan

Data de referencia: 2026-04-26
Branch de trabalho: docs/plan-chat-community
Tipo: planejamento tecnico, sem implementacao

## 0. Fontes, escopo e premissas

Arquivos e areas considerados:

- `AGENTS.md`
- `docs/execution/CODEX_CONTEXT.md`
- `docs/execution/STAGE_9_READINESS_REVIEW.md`
- `docs/execution/PRISMA_WRITE_AUDIT_AFTER_STAGE_9.md`
- `docs/execution/ETAPA_9_COMPLETION_PLAN.md`
- `docs/fusion/module-matrix.md`
- `docs/execution/control-checklist.md`
- `supabase/migrations/0083_notification_foundation.sql`
- `apps/api/src/modules/notifications`
- `src/modules/notifications`
- `src/app/(dashboard)/notifications`
- `src/app/app`
- `src/modules/patient-app`

Premissas operacionais:

- Supabase e o runtime final. NestJS e Prisma continuam como ponte transicional.
- Chat e comunidade nao devem nascer com regra critica em React, Zustand,
  Prisma ou API transicional sem RPC/Edge Supabase autoritativa.
- Esta task nao cria migration, nao altera Edge Functions, nao altera backend e
  nao altera frontend.
- A fundacao de notificacoes internas e assumida como base disponivel para o
  desenho: `notifications.notification_events`,
  `notifications.notification_deliveries`, `api.create_notification_event`,
  `api.list_my_notifications`, `api.list_admin_notifications`,
  `api.mark_notification_read`, `api.cancel_notification_event` e UI
  `/notifications`.
- No branch atual, os artefatos de notificacoes e a auditoria Prisma citados no
  pedido nao estao materializados no working tree. Eles foram usados como
  referencia a partir da frente `feat/notification-foundation`, sem trazer
  codigo para este branch.
- O plano nao considera WhatsApp, email, push real ou provider externo nesta
  etapa. A integracao inicial deve usar apenas notificacoes internas.

## 1. Objetivo do modulo

O modulo de comunicacao deve entregar duas superficies complementares:

- Chat paciente/equipe: canal privado, auditavel e multi-tenant para mensagens
  entre paciente e equipe autorizada, com suporte a contexto clinico-operacional
  como paciente, unidade, pacote, atendimento ou jornada.
- Comunidade/feed: area moderada para conteudos, comentarios e interacoes
  controladas, vinculada a tenant, unidade, plano/pacote e regras de
  elegibilidade.
- Suporte a planos/pacotes: o acesso a chat, prioridade, comunidade,
  comentarios, anexos e horarios deve respeitar entitlements comerciais e status
  ativo do paciente.
- Integracao futura com notificacoes internas: novas mensagens, mencoes,
  respostas, denuncias e acoes de moderacao devem gerar eventos internos pela
  fundacao de notificacoes, sem expor payload sensivel e sem canais externos
  reais no MVP.

## 2. Escopo MVP

### Chat

- Chat 1:1 paciente/equipe com sala por paciente ou por contexto operacional.
- Salas por paciente como default, com possibilidade futura de salas por
  atendimento, pacote, documento ou suporte administrativo.
- Mensagens de texto, mensagens de sistema e mensagens ocultadas por moderacao.
- Anexos privados com upload controlado e acesso por signed URL temporaria.
- Controle de leitura por membro, unread count e ultima mensagem.
- Auditoria de criacao de sala, entrada/saida de membros, envio, edicao,
  ocultacao, leitura e anexos.
- Idempotencia para envio de mensagem e criacao de notificacoes.

### Comunidade

- Feed por tenant/unidade/plano, com posts criados por equipe autorizada no MVP.
- Comentarios de pacientes quando o pacote permitir.
- Reacoes simples, com controle de duplicidade por usuario/paciente.
- Denuncias de conteudo por pacientes ou equipe.
- Ocultacao, bloqueio e restauracao de posts/comentarios por moderadores.
- Auditoria de posts, comentarios, reacoes, denuncias e acoes de moderacao.

### Fora do MVP

- WhatsApp, email, push real ou qualquer provider externo.
- Chat em grupo amplo sem desenho especifico de moderacao.
- Comunidade publica ou bucket publico.
- Busca full-text avancada sem avaliacao de privacidade e performance.
- Regras criticas implementadas somente no frontend.

## 3. Tabelas provaveis

Schemas propostos:

- `communication`: chat, salas, membros, mensagens e anexos.
- `community`: feed, comentarios, reacoes, denuncias e moderacao.

Observacao: a decisao final de schema deve ser tomada na task de migration. Se
ja houver schema legado `comms` em algum ambiente, a migration futura deve
decidir entre reutilizar com compatibilidade ou criar `communication` com
backfill documentado. Nenhuma tabela de negocio deve ser criada em `public`.

### `communication.chat_rooms`

Finalidade: sala privada de conversa.

Campos provaveis:

- `id`
- `tenant_id`
- `unit_id`
- `patient_id`
- `context_domain`
- `context_entity_type`
- `context_entity_id`
- `room_type`: `patient_team`, `support`, `care_plan`, `document_context`
- `status`: `open`, `archived`, `blocked`, `closed`
- `gating_snapshot` jsonb
- `created_by_user_id`
- `created_by_patient_id`
- `last_message_at`
- `closed_at`
- `created_at`
- `updated_at`

Indices e constraints:

- Indice por `(tenant_id, patient_id, status, updated_at desc)`.
- Indice por `(tenant_id, unit_id, status, updated_at desc)`.
- Unique parcial para evitar sala ativa duplicada por paciente/contexto quando
  aplicavel.

### `communication.chat_members`

Finalidade: membership explicito da sala.

Campos provaveis:

- `id`
- `tenant_id`
- `room_id`
- `member_type`: `user`, `patient`, `role`
- `user_id`
- `patient_id`
- `role_code`
- `status`: `active`, `muted`, `removed`, `blocked`
- `last_read_message_id`
- `last_read_at`
- `muted_until`
- `created_at`
- `updated_at`

Indices e constraints:

- Indice por `(tenant_id, room_id, status)`.
- Indice por `(tenant_id, user_id, status)`.
- Indice por `(tenant_id, patient_id, status)`.
- Unique para membership ativo por sala e membro.

### `communication.chat_messages`

Finalidade: mensagens do chat.

Campos provaveis:

- `id`
- `tenant_id`
- `room_id`
- `sender_type`: `user`, `patient`, `system`
- `sender_user_id`
- `sender_patient_id`
- `message_type`: `text`, `system`, `attachment`
- `body`
- `payload` jsonb
- `status`: `sent`, `edited`, `deleted`, `hidden`, `failed`
- `moderation_status`: `visible`, `flagged`, `hidden`, `removed`
- `reply_to_message_id`
- `idempotency_key`
- `created_at`
- `edited_at`
- `deleted_at`
- `updated_at`

Indices e constraints:

- Indice por `(tenant_id, room_id, created_at desc)`.
- Indice por `(tenant_id, sender_user_id, created_at desc)`.
- Indice por `(tenant_id, sender_patient_id, created_at desc)`.
- Unique por `(tenant_id, room_id, idempotency_key)` quando
  `idempotency_key` nao for nula.

### `communication.chat_attachments`

Finalidade: metadados de anexos privados.

Campos provaveis:

- `id`
- `tenant_id`
- `room_id`
- `message_id`
- `uploaded_by_user_id`
- `uploaded_by_patient_id`
- `bucket_name`
- `object_path`
- `file_name`
- `mime_type`
- `byte_size`
- `checksum_sha256`
- `upload_status`: `pending`, `uploaded`, `failed`, `deleted`
- `scan_status`: `pending`, `clean`, `blocked`, `not_applicable`
- `created_at`
- `updated_at`

Regras:

- Bucket privado, por exemplo `chat-attachments`.
- Caminho deve carregar tenant e contexto sem depender de input livre:
  `tenant/{tenant_id}/room/{room_id}/message/{message_id}/{attachment_id}`.
- Download apenas via signed URL temporaria emitida por RPC/Edge segura.

### `communication.chat_read_receipts` (opcional)

Finalidade: leitura por membro quando `chat_members.last_read_*` nao for
suficiente.

Campos provaveis:

- `tenant_id`
- `room_id`
- `message_id`
- `member_id`
- `read_at`

### `community.posts`

Finalidade: posts do feed/comunidade.

Campos provaveis:

- `id`
- `tenant_id`
- `unit_id`
- `author_user_id`
- `author_patient_id`
- `visibility`: `tenant`, `unit`, `plan`, `cohort`
- `target_plan_id`
- `target_package_id`
- `title`
- `body`
- `payload` jsonb
- `status`: `draft`, `published`, `hidden`, `archived`, `removed`
- `moderation_status`: `visible`, `flagged`, `hidden`, `removed`
- `published_at`
- `created_at`
- `updated_at`

Indices:

- `(tenant_id, unit_id, status, published_at desc)`.
- `(tenant_id, target_plan_id, status, published_at desc)`.
- `(tenant_id, target_package_id, status, published_at desc)`.

### `community.comments`

Finalidade: comentarios em posts.

Campos provaveis:

- `id`
- `tenant_id`
- `post_id`
- `parent_comment_id`
- `author_user_id`
- `author_patient_id`
- `body`
- `status`: `published`, `hidden`, `removed`
- `moderation_status`: `visible`, `flagged`, `hidden`, `removed`
- `idempotency_key`
- `created_at`
- `updated_at`

Indices:

- `(tenant_id, post_id, created_at asc)`.
- Unique por `(tenant_id, post_id, author_user_id, idempotency_key)` quando
  aplicavel.
- Unique por `(tenant_id, post_id, author_patient_id, idempotency_key)` quando
  aplicavel.

### `community.reactions`

Finalidade: reacoes a posts ou comentarios.

Campos provaveis:

- `id`
- `tenant_id`
- `target_type`: `post`, `comment`
- `target_id`
- `reaction_type`
- `actor_user_id`
- `actor_patient_id`
- `created_at`

Constraints:

- Unique por alvo, tipo de reacao e ator.
- Check para garantir exatamente um ator: usuario ou paciente.

### `community.reports`

Finalidade: denuncias de conteudo.

Campos provaveis:

- `id`
- `tenant_id`
- `target_type`: `post`, `comment`, `chat_message`
- `target_id`
- `reporter_user_id`
- `reporter_patient_id`
- `reason`
- `details`
- `status`: `open`, `reviewing`, `resolved`, `dismissed`
- `created_at`
- `updated_at`

### `community.moderation_actions`

Finalidade: log auditavel de moderacao.

Campos provaveis:

- `id`
- `tenant_id`
- `target_type`: `post`, `comment`, `chat_message`, `room`
- `target_id`
- `action_type`: `hide`, `restore`, `remove`, `block_user`, `close_room`
- `reason`
- `moderator_user_id`
- `metadata` jsonb
- `created_at`

Regras:

- Append-only no fluxo normal.
- Nao apagar conteudo sensivel sem politica de retencao e base legal definida.

## 4. Gating e permissoes

O acesso deve ser decidido server-side, preferencialmente em RPCs e policies.

Dimensoes obrigatorias:

- Tenant: todo registro deve carregar `tenant_id`; qualquer RPC deve validar o
  tenant resolvido pela sessao.
- Unidade: equipe so ve salas, pacientes e posts das unidades permitidas.
- Paciente: paciente so acessa salas, mensagens, posts e anexos aos quais seu
  cadastro esta vinculado.
- Equipe/profissional: acesso por membership explicito, unidade, perfil e
  permissao operacional.
- Plano/pacote/entitlement: chat, comunidade, anexos, prioridade e comentarios
  devem depender do pacote ativo e do entitlement vigente.
- Horario comercial: quando aplicavel, mensagem fora do horario deve ser
  aceita, enfileirada, sinalizada como fora de horario ou bloqueada conforme
  configuracao do tenant/pacote.
- Permissao administrativa: moderacao, ocultacao, desbloqueio e leitura
  administrativa exigem permissao explicita.
- Status do paciente: paciente inativo, desligado, inadimplente bloqueado ou sem
  pacote vigente nao deve iniciar novos chats nem comentar, salvo fluxo de
  suporte/retencao permitido pelo tenant.

Regras recomendadas:

- `chat_members` e a fronteira de leitura de chat. Sem membership ativo, nao ha
  listagem nem acesso direto por `room_id`.
- Comunidade deve usar elegibilidade por feed, plano, unidade e status ativo.
- O frontend pode exibir bloqueios e mensagens de estado, mas a decisao final
  precisa estar em RPC/RLS.
- Snapshots de gating podem ser guardados para auditoria, mas a validacao deve
  consultar o estado vigente quando a acao ocorre.

## 5. Seguranca

### RLS

- Habilitar RLS em todas as tabelas.
- Policies devem combinar `tenant_id`, membership, paciente vinculado, unidade
  permitida e permissao.
- Leitura de chat deve passar por membership ativo em `chat_members`.
- Leitura de comunidade deve passar por elegibilidade do feed e status do
  conteudo.
- Escritas sensiveis devem ocorrer por RPCs `SECURITY DEFINER` com
  `search_path` fixo e validacoes explicitas.

### Grants

- Revoke amplo nos schemas `communication` e `community`.
- Grants minimos para `authenticated`, idealmente somente em RPCs do schema
  `api`.
- `anon` nao deve acessar tabelas nem RPCs de chat/comunidade.
- Wrappers em `public` so se forem inevitaveis para compatibilidade com
  PostgREST, sempre hardenizados.

### Anexos privados

- Nao criar bucket publico.
- Usar bucket privado, signed URLs temporarias e paths controlados pelo servidor.
- Nunca expor `object_path` direto para cliente nao autorizado.
- Validar tipo, tamanho, tenant, sala, membership e status do paciente antes de
  emitir upload/download.
- Considerar scan/validacao de arquivo antes de liberar download para outros
  membros.

### Anti-enumeracao e cross-tenant

- Nao permitir `select` direto que aceite `room_id`, `message_id`, `post_id` ou
  `attachment_id` sem validar tenant e escopo.
- Listagens devem partir do ator autenticado: minhas salas, meus posts
  elegiveis, minhas notificacoes.
- Erros devem ser genericos quando o recurso nao pertence ao ator.
- Indices e constraints devem sempre incluir `tenant_id` onde fizer sentido.

### Rate limit e antiabuso

- Aplicar limite por tenant, paciente, usuario, sala e janela de tempo.
- Bloquear rajadas de mensagens, comentarios, reacoes e denuncias repetidas.
- Usar idempotencia para retry seguro, mas sem permitir replay abusivo.
- Gerar auditoria e evento interno para abuso detectado.

### Moderacao

- Conteudo reportado pode ficar visivel, oculto preventivamente ou em revisao,
  conforme politica do tenant.
- Acoes de moderacao devem ser auditaveis e reversiveis quando possivel.
- Moderadores devem ter permissao explicita e escopo por tenant/unidade.
- Payload de notificacao de moderacao nao deve carregar corpo integral de
  mensagem ou comentario sensivel.

### Retencao e LGPD

- Definir politica por tipo de dado: mensagens, anexos, denuncias, logs de
  moderacao e auditoria.
- Separar apagamento logico, anonimizacao, legal hold e purge fisico.
- Registrar base legal e finalidade de comunicacao assistencial, suporte e
  comunidade.
- Permitir exportacao/auditoria interna sem expor dados de outros tenants.

## 6. Notificacoes

A integracao deve usar `api.create_notification_event` e gerar apenas
entregas internas `in_app` no primeiro ciclo.

Eventos recomendados:

- `chat.message.created`: nova mensagem para os demais membros da sala.
- `chat.mention.created`: mencao direta a profissional ou paciente.
- `chat.after_hours_message.created`: mensagem enviada fora do horario
  configurado.
- `community.post.published`: novo post para audiencia elegivel, se o tenant
  habilitar.
- `community.comment.created`: comentario em post acompanhado.
- `community.reply.created`: resposta a comentario do ator.
- `community.report.created`: denuncia para moderadores.
- `community.moderation_action.created`: alerta de ocultacao, remocao,
  restauracao ou bloqueio.

Modelo de idempotencia:

- Chave por evento e destinatario, por exemplo
  `chat.message:{message_id}:recipient:{recipient_id}`.
- Repetir a criacao da notificacao nao deve duplicar evento nem delivery.
- O payload deve conter apenas ids e metadados minimos:
  `room_id`, `message_id`, `post_id`, `comment_id`, `report_id`,
  `source_domain`, `source_entity_type`.
- Nao incluir corpo integral da mensagem, caminho de anexo, dados clinicos,
  secrets ou tokens em payload de notificacao.

Regras de horario:

- Mensagem fora do horario pode criar notificacao interna para equipe ou fila de
  suporte, mas nao deve acionar provider externo nesta etapa.
- O estado visual no app pode informar expectativa de resposta, mas a regra de
  gating deve ser server-side.

## 7. UX

### App do paciente

- Entrada no app do paciente com card/atalho para chat e comunidade.
- Estado bloqueado quando o pacote nao permitir chat, comunidade ou comentarios.
- Estado inativo quando o paciente nao estiver ativo ou sem entitlement vigente.
- Lista de conversas com unread count, ultima mensagem, status e horario.
- Tela de conversa com loading, erro, vazio, composer, anexos e estado
  fora-do-horario.
- Feed de comunidade com loading, erro, vazio, filtro por assuntos/planos e
  acoes permitidas.
- Denunciar conteudo e visualizar resultado basico da moderacao quando
  aplicavel.

### Dashboard equipe

- Caixa de entrada de chats com filtros por unidade, profissional, paciente,
  status, unread, prioridade e fora-do-horario.
- Detalhe de sala com historico, anexos privados, dados minimos do paciente e
  acoes de moderacao.
- Feed/comunidade com criacao de posts por usuarios autorizados.
- Fila de denuncias e moderacao com status, motivo e auditoria.
- Indicadores de unread e alertas internos reutilizando `/notifications`.

### Estados obrigatorios

- Loading para listas e detalhes.
- Vazio para sem conversas, sem posts ou sem permissoes.
- Erro sem vazar detalhes de tenant, ids ou policies.
- Bloqueado por pacote/entitlement com texto operacional claro.
- Conteudo ocultado por moderacao com estado neutro e auditavel.

## 8. RPCs e Edge Functions provaveis

RPCs no schema `api`:

- `api.create_chat_room`
- `api.list_chat_rooms`
- `api.get_chat_room`
- `api.list_chat_messages`
- `api.send_chat_message`
- `api.mark_chat_room_read`
- `api.hide_chat_message`
- `api.request_chat_attachment_upload`
- `api.get_chat_attachment_download_url`
- `api.create_community_post`
- `api.list_community_posts`
- `api.get_community_post`
- `api.create_community_comment`
- `api.react_to_community_target`
- `api.report_community_target`
- `api.list_moderation_queue`
- `api.apply_moderation_action`

Edge Functions provaveis:

- `chat-attachment-broker`: emitir signed upload/download para bucket privado,
  validar membership, tenant, tamanho e tipo.
- `communication-rate-limit` ou validacao equivalente dentro das RPCs: aplicar
  limite por ator/sala/post.
- `community-moderation-worker`: futuro processamento assíncrono de denuncia,
  ocultacao preventiva ou integracao com analise de conteudo, sem provider
  externo obrigatorio no MVP.

Decisao inicial recomendada:

- Comecar com RPCs para regras transacionais e listagens.
- Usar Edge Function apenas para anexos e tarefas que precisem de ambiente
  server-side com signed URL ou service role.
- Manter todos os comandos idempotentes quando houver retry de cliente.

## 9. Testes necessarios

Banco/RLS:

- Tenant A nao lista salas, mensagens, posts, anexos, comentarios ou denuncias
  do Tenant B.
- Usuario autenticado sem membership nao acessa sala nem mensagem por id direto.
- Paciente tenta acessar sala de outro paciente e recebe negativa generica.
- Equipe de uma unidade nao acessa sala/post restrito a outra unidade.
- Paciente inativo ou sem pacote elegivel nao inicia chat nem comenta.
- Moderador sem permissao nao oculta conteudo nem resolve denuncia.

Anexos:

- Upload negado para ator sem membership.
- Download negado para anexo de outra sala/tenant.
- Signed URL expirada nao funciona.
- `object_path` nao e exposto em payload publico.
- Tipo e tamanho de arquivo sao validados.

Idempotencia:

- Retry de `send_chat_message` com mesma chave nao duplica mensagem.
- Retry de comentario com mesma chave nao duplica comentario.
- Retry de notificacao com mesma chave nao duplica evento nem delivery.

Notificacoes:

- Nova mensagem gera notificacao interna para destinatarios elegiveis.
- Mencao gera notificacao apenas para mencionado elegivel.
- Denuncia gera notificacao para moderadores autorizados.
- Mensagem fora do horario gera evento interno apropriado.
- Payload de notificacao nao contem corpo integral sensivel nem path de anexo.

Moderacao:

- Conteudo ocultado some da visao de pacientes comuns.
- Moderador ainda consegue auditar conteudo conforme permissao.
- Restauracao registra nova acao auditavel.
- Denuncia duplicada por mesmo ator/alvo e controlada.

Smokes:

- Smoke local com Supabase local/migrado.
- Smoke real quando secrets Supabase estiverem disponiveis.
- Smoke do app paciente para bloqueio por entitlement.
- Smoke do dashboard para listagem, vazio, erro e marcar leitura.

## 10. Ordem de implementacao recomendada

1. Plano e desenho de schema: fechar decisoes de `communication`/`community`,
   enums, entitlements e politica de retencao.
2. Chat foundation: migration com tabelas, RLS, grants, indices e RPCs basicas
   de salas/mensagens/leitura, sem anexos.
3. Testes RLS de chat: cross-tenant, membership, paciente errado, usuario sem
   permissao e idempotencia.
4. UI equipe para chat: inbox, detalhe, unread, estados loading/erro/vazio.
5. UI paciente para chat: entrada no app, sala, bloqueios por pacote e
   fora-do-horario.
6. Anexos privados: bucket privado, broker de signed URL, metadados e testes de
   expiracao.
7. Notificacoes internas: eventos de nova mensagem, mencao e fora-do-horario
   usando a fundacao existente.
8. Community foundation: posts, comentarios, reacoes, reports, RLS e RPCs.
9. UI comunidade: feed paciente, gestao basica no dashboard, estados e gating.
10. Moderacao: fila, ocultacao, restauracao, auditoria e notificacoes internas.
11. Hardening: rate limit, testes reais, observabilidade, retencao/LGPD e
    documentacao operacional.

## 11. Criterios de pronto

Tecnico:

- Migration nova com schemas fora de `public`, tabelas, constraints, indices,
  grants e RLS.
- RPCs `SECURITY DEFINER` com `search_path` seguro e validacao explicita de
  tenant, unidade, membership, paciente e entitlement.
- Nenhuma regra critica dependente apenas do frontend.
- Nenhuma escrita nova via Prisma/local para chat ou comunidade.

Seguranca:

- Buckets privados e signed URLs temporarias.
- `service_role` apenas server-side ou em Edge Function segura.
- Sem payload sensivel em notificacoes, logs ou respostas publicas.
- Rate limit basico e idempotencia em writes principais.
- Auditoria para moderacao, denuncias, anexos e eventos relevantes.
- Politica de retencao e LGPD documentada.

UI:

- App do paciente e dashboard com loading, erro, vazio, bloqueado e sucesso.
- Unread count consistente.
- Filtros basicos no dashboard.
- Estados claros para pacote sem acesso, paciente inativo e conteudo moderado.

Testes:

- RLS cross-tenant e membership.
- Anexos privados e signed URL expirada.
- Moderacao e denuncias.
- Notificacoes internas geradas sem duplicidade.
- `api:smoke:local` e `api:smoke:real` quando secrets existirem.

Documentacao:

- Runbook de operacao e moderacao.
- Politica de retencao.
- Mapa de eventos de notificacao.
- Checklist de seguranca antes de habilitar em producao.

## 12. Riscos principais

- Vazamento cross-tenant por RLS incompleta ou listagem por id direto.
- Exposicao de anexos por bucket publico, path previsivel ou signed URL sem
  checagem de membership.
- Bypass de entitlement quando o frontend bloqueia, mas a RPC aceita a acao.
- Abuso, assedio ou spam sem rate limit e moderacao operacional.
- Payload de notificacao carregando corpo sensivel de mensagem, comentario ou
  anexo.
- Equipe acessando paciente fora da unidade ou escopo profissional.
- Paciente inativo ou sem pacote mantendo acesso indevido.
- Retencao, apagamento ou exportacao sem desenho LGPD.
- Crescimento de chat/comunidade dentro do NestJS/Prisma, contrariando a
  direcao Supabase-first.

## 13. Proxima task recomendada

Criar a task `chat-foundation-schema-rls-plan-to-migration`, ainda sem UI, para
implementar somente a fundacao Supabase-first do chat:

- migration nova com `communication.chat_rooms`,
  `communication.chat_members`, `communication.chat_messages`;
- RLS, grants, constraints e indices;
- RPCs `api.create_chat_room`, `api.list_chat_rooms`,
  `api.list_chat_messages`, `api.send_chat_message`,
  `api.mark_chat_room_read`;
- testes de RLS/idempotencia;
- sem anexos, sem comunidade, sem canais externos e sem writes Prisma.
