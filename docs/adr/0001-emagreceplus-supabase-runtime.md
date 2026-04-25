# ADR 0001 - EmagrecePlus como base e Supabase como runtime final

## Status

Accepted

## Contexto

O repositorio atual ja possui:

- frontend em Next.js App Router
- auth conectado ao Supabase
- backend transicional em NestJS
- modelo de dados multi-schema em Prisma para `platform`, `identity`, `patients`, `crm`, `scheduling` e `clinical`
- uma primeira versao de paciente 360 e de app do paciente

Ao mesmo tempo, o plano mestre define que o produto final precisa ser:

- cloud-only
- multi-tenant
- seguro por padrao
- longitudinal
- auditavel
- operado sobre Supabase nativo

Se o time continuar expandindo NestJS + Prisma como se fossem o alvo final, a divida arquitetural vai crescer na direcao errada.

## Decisao

Fica decidido que:

1. EmagrecePlus e a base tecnica oficial do produto.
2. Slim Care entra como benchmark de produto, UX e cobertura funcional.
3. Supabase Cloud passa a ser o runtime backend final.
4. `apps/api` e `prisma/` deixam de ser destino final e passam a ser camada de transicao e referencia de migracao.
5. Novas regras criticas devem ser implementadas em SQL, RPC, trigger ou Edge Function sob `supabase/`.
6. O frontend deve consumir views e RPCs curadas, idealmente expostas pelo schema `api`.
7. A logica privilegiada e helpers de seguranca devem viver em `private`.

## Consequencias

### Positivas

- reduz duplicacao de regra entre cliente e backend
- aproxima o produto de RLS, auditoria e multi-tenant real
- prepara branching, preview e operacao cloud-only
- facilita linha evolutiva para timeline longitudinal e paciente 360 real

### Custos e tradeoffs

- parte do codigo atual em NestJS/Prisma vira transicional e nao deve mais crescer livremente
- a migracao exige disciplina de naming, migrations SQL e controle de exposicao
- o time precisa suportar um periodo de coexistencia entre a pilha atual e o alvo final

## Regras derivadas

- nao criar novo dominio critico apenas em React
- nao usar `public` como schema principal de negocio
- nao depender de local storage para persistencia clinica
- nao misturar financeiro da clinica com billing do SaaS
- nao abrir buckets sensiveis como publicos

## Proximos passos imediatos

1. Criar a estrutura `supabase/`
2. Formalizar schemas alvo ausentes: `api`, `private`, `journey`, `commercial`, `finance`, `docs`, `audit`, `analytics`, `comms`
3. Migrar identidade e autorizacao para o modelo alvo
4. Criar timeline longitudinal e paciente 360 em Supabase
