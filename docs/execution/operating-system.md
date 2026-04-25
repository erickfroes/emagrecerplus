# Operating System

Este arquivo transforma o PDF gabarito e o plano mestre em regras operacionais do repositorio.
Ele vale como o norte de execucao para as proximas entregas.

## Mandato de trabalho

- Trabalhar com ownership real: nao agir como digitador de tickets.
- Discordar de solucoes rasas quando elas comprometerem o produto final.
- Compensar input curto com analise profunda, criterio tecnico e ordem de execucao.
- Priorizar resultado de longo prazo acima de conveniencia de curto prazo.
- Sempre checar se uma decisao ajuda ou atrapalha o runtime final em Supabase.

## Decisoes arquiteturais congeladas

- EmagrecePlus e a base tecnica oficial.
- Slim Care entra como benchmark de jornada, cockpit do paciente, quick actions e operacao longitudinal.
- Supabase Cloud e o runtime backend final.
- Next.js App Router segue como frontend principal.
- Multi-tenant inicial sera shared database com isolamento por `tenant_id` e `unit_id`.
- `public` nao e schema de negocio.
- Exposicao para frontend deve passar por `api`.
- Helpers sensiveis e `security definer` devem viver em `private`.

## Guardrails obrigatorios

- Nenhuma regra critica multi-tabela em componente React.
- Nenhuma nova fonte clinica de verdade em Zustand/localStorage.
- Nenhuma acao sensivel usando `service_role` no browser.
- Nenhum documento clinico, anexo, recibo ou foto sensivel em bucket publico.
- Nenhum webhook sem idempotencia.
- Nenhum fluxo central sem auditoria e evento longitudinal.
- Nenhum billing do SaaS misturado com financeiro do paciente.
- Nenhuma migration manual no dashboard sem arquivo versionado no git.

## Definicao de onde cada coisa nasce

### SQL RPC

Usar para:

- transicoes de estado multi-tabela
- agenda -> fila -> atendimento -> retorno
- validacao de conflito de agenda
- gravacao consistente de timeline
- regras de elegibilidade e operacao clinica

### Trigger

Usar para:

- timestamps
- emissao de eventos internos simples
- manutencao de auditoria
- sincronismo de read models pequenos

### Edge Function

Usar para:

- gateways de pagamento
- assinatura eletronica
- render de PDF com dependencia externa
- webhooks externos
- operacoes que exigem segredo

### Frontend

Usar para:

- experiencia do usuario
- loading, empty state, optimistic UI com rollback seguro
- composicao de telas
- consumo de views, RPCs e storage assinados

Frontend nao e lugar para:

- transacao de negocio
- autorizacao real
- reconciliacao financeira
- integracao privilegiada

## Regras de transicao do repositorio

- `apps/api` fica congelado como camada transicional. Corrigir ou adaptar e permitido. Fazer dele o backend final e proibido.
- `prisma/schema.prisma` e seeds atuais servem como inventario do dominio ja existente.
- Todo backend novo deve nascer em `supabase/`.
- Se uma feature estiver metade em Nest/Prisma e metade em Supabase, a entrega precisa explicitar qual lado e transicional e qual lado e alvo final.

## Definition of Done

Uma entrega de dominio so esta pronta se tiver:

- migration SQL
- grants revisados
- RLS quando aplicavel
- indices e constraints necessarios
- RPC, trigger ou function documentada
- teste automatizado
- seed ou fixture
- loading, erro e vazio na UI
- auditoria quando aplicavel
- evento longitudinal quando aplicavel

## Ordem pratica de implementacao

1. Infra cloud-only e esteira
2. Base Supabase com `api` e `private`
3. Identidade, tenant, unidade, roles e permissions
4. RLS helpers
5. Pacientes, CRM e scheduling
6. Timeline longitudinal e paciente 360
7. Agenda -> fila -> encounter -> retorno
8. Persistencia real do app do paciente
9. Prontuario, care plan, goals e nutricao estruturada
10. Docs, prescricoes, financeiro, billing SaaS e observabilidade
