# Public Schema Boundary

O schema `public` nao e schema de negocio no EmagrecePlus.

## Regra

- tabelas, views materializadas, sequences e relacoes de dominio nao devem nascer em `public`
- `public` existe apenas como fachada de compatibilidade para RPCs expostas ao client e para extensoes do Postgres/Supabase
- regra critica de negocio continua em `api`, `private` e schemas de dominio

## O que ainda pode existir em `public`

- wrappers compat para RPCs consumidas por `supabase.rpc(...)`
- funcoes de extensao como `citext`
- helpers pontuais expostos ao PostgREST por necessidade de compatibilidade

## O que nao pode existir em `public`

- tabelas de pacientes, agenda, encounter, crm, financeiro ou documentos
- views de leitura de negocio
- sequences ou artefatos estruturais usados como fonte de verdade funcional

## Guardrail aplicado

- a migration [0028_public_schema_compatibility_boundary.sql](../../supabase/migrations/0028_public_schema_compatibility_boundary.sql) revoga `create` em `public` para papeis operacionais e falha se encontrar relacoes de negocio no schema
- a verificacao atual no staging confirmou que `public` nao possui relacoes de negocio; restam apenas wrappers de compatibilidade e funcoes de extensao
