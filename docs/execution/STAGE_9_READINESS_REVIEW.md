# Stage 9 Readiness Review (Dossie e Evidencia Documental)

## 1) Resumo executivo

A Etapa 9 esta funcional para operacao sem provedor real de assinatura: ha estrutura de
documento legal, dossie, pacote baixavel de evidencia e trilha de auditoria, com fluxo de
simulacao/unconfigured para D4Sign ja preparado para nao quebrar ambiente real.

A lacuna principal de conclusao da Etapa 9 e a ativacao do provedor real (D4Sign) com credenciais
e confirmacao operacional oficial da D4Sign (especialmente estrategia de HMAC e consultas oficiais de
status/certificado).

---

## 2) O que ja esta pronto

- `docs.document_legal_evidence` e contratos de consulta (incluindo status final da evidencia).
- Pacote baixavel de evidencia documental pronto para geracao/registro e download auditado.
- RLS e wrappers de banco preparados para uso com acesso seguro via RPC.
- Broker documental e centro documental administrativo ja existentes.
- Detalhe operacional do documento com secao de evidencia e estados de ausencia/parcial/completa.
- Base D4Sign-readiness consolidada:
  - contratos de provider com modo `mock`, `d4sign_unconfigured`, `d4sign_simulated`.
  - retorno explicito de falha de configuracao (`provider_config_missing`) sem chamada externa.
  - simulacoes de eventos de assinatura, falha e webhook duplicado.
  - utilitario de verificacao HMAC com estrategia parametrizada (`uuid` e `raw_body`).
  - runbook de ativacao real (`docs/execution/D4SIGN_REAL_ACTIVATION_RUNBOOK.md`).
- Smoke real e local cobrindo os fluxos basicos de evidencia e readiness da D4Sign (sem exigir chaves reais).
- `git` da etapa anterior ja com migrations ate `0080` aplicadas e alinhadas com o remoto (por contexto do trabalho anterior).

---

## 3) O que esta parcialmente pronto

- Persistencia e contratos de eventos prontos para consumo, mas parte do ciclo real depende de retorno oficial:
  - `verificationStatus = verified` ainda nao deve ser emitido por integracao simulada/unconfigured.
  - atualizacao de status de evidencia em runtime real ainda depende de confirmacao de endpoints oficiais.
- A API/UX de evidencia ja exibe estado de "pendente" quando sem verificacao real, porem nao substitui
  uma validacao juridica oficial.
- O webhook D4Sign esta preparado para multiplos modos, inclusive idempotencia, mas sem gatilho real para
  producao com credenciais validas ainda ativo.
- HMAC implementado em modo simulado com segredo de teste; modo real depende de confirmacao e secret real.

---

## 4) O que depende da D4Sign

- Emissao e uso de `externalDocumentId`/`externalEnvelopeId` consistentes por ambiente real.
- Estrategia oficial de assinatura/verificacao HMAC (UUID de documento vs. raw body).
- Chaves e parametros:
  - `D4SIGN_TOKEN_API`
  - `D4SIGN_CRYPT_KEY`
  - `D4SIGN_SAFE_UUID`
  - `D4SIGN_WEBHOOK_SECRET`
  - `D4SIGN_HMAC_STRATEGY`
- Endpoints oficiais de status/consulta e de evidencia/certificado.
- Criterios de coerencia final do status do envelope e evento oficial de finalizacao.
- SLAs, limites de API, idempotency keys/event IDs oficiais e politica de retry/replay.
- Validacao oficial de ICP-Brasil/PAdES no modo real.

---

## 5) Riscos restantes

- **Risco critico:** marcacao indevida de `verified` antes de validacao oficial real.
- **Risco operacional:** interpretacao incorreta da estrategia de HMAC pode permitir perda de seguranca ou rejeicao de webhooks.
- **Risco de sincronismo:** divergencia entre evento de webhook e status final consultado por API.
- **Risco de evidencia:** nao geracao/atualizacao de pacote em casos de reprocessamento ou correcao retroativa de eventos.
- **Risco de observabilidade:** ausencia de chaves de correlacao oficiais pode dificultar trilha forense completa.
- **Risco de rollout:** migracao parcial no ambiente em producao sem janela de rollback testada.

---

## 6) Checklist para ativar D4Sign sandbox

- [ ] Provisionar ambiente D4Sign sandbox com token/API validos e `safe UUID`.
- [ ] Configurar variaveis em ambiente de sandbox (incluindo HMAC strategy em modo de teste).
- [ ] Registrar as variaveis em `supabase secrets` e ambiente de aplicacao.
- [ ] Rodar cenario de dispatch de documento em `d4sign_simulated` -> evoluir para real em modo real.
- [ ] Validar envio e resposta de criacao de envelope/documento.
- [ ] Confirmar recebimento de webhook com HMAC valido.
- [ ] Confirmar rejeicao de webhook com HMAC invalido.
- [ ] Reprocessar webhook duplicado e validar idempotencia.
- [ ] Validar evento de assinatura final (`completed`/`finalized`) e persistencia de hashes/event IDs.
- [ ] Consultar status oficial e confirmar coerencia com dossie.
- [ ] Regenerar pacote de evidencia e validar status final de evidencia/assinatura no detalhe documental.
- [ ] Executar `api:smoke:real` sem chaves reais (baseline) e com chaves sandbox.

---

## 7) Checklist para ativar producao

- [ ] Validar todos os itens de sandbox com evidencia de execucao em ambiente nao-prod.
- [ ] Confirmar armazenamento seguro de artefatos e expiracao de links.
- [ ] Validar monitoramento de falhas de dispatch/webhook em dashboard/audit.
- [ ] Definir rota de rollback para `d4sign_unconfigured` e comunicacao de status.
- [ ] Definir procedimento de mitigacao para evento legado recebido apos troca de credenciais.
- [ ] Rodar testes de carga/retentativas (replay) para webhooks em janela controlada.
- [ ] Validar cadeia de auditoria ponta a ponta (dispatch, webhook, evidencia, pacote).
- [ ] Revisar LGPD/seguranca de logs: sem persistir tokens/secret no texto de log.
- [ ] Executar `api:smoke:local` e `api:smoke:real` com nova configuracao.

---

## 8) Criterios para liberar `verificationStatus = verified`

- HMAC do webhook validado com estrategia oficial da D4Sign.
- Consulta oficial de status realizada e positiva antes de promover evidencia final.
- Documento e assinatura com estado consistente (`sent`/`completed` conforme contrato adotado).
- `provider_event_hash` e `provider_payload_hash` persistidos.
- `externalDocumentId` e `externalEnvelopeId` persistidos.
- Evidencia juridica e pacote recomputados/atualizados apos recebimento do evento final.
- Nenhuma inconsistencia de idempotencia ou reprocessamento pendente.
- Sem modo `d4sign_unconfigured`/`d4sign_simulated` ativos para esse documento.

---

## 9) Criterios para considerar Etapa 9 concluida

- Evidencia juridica e pacote final disponiveis para leitura interna e download.
- Auditoria de acesso e geracao de evidencia operando com trilha minima para rastreabilidade.
- Dossie de evidencia com cobertura de estados (sem evidencia, parcial, completa).
- Provider readiness nao invasivo ja estavel (mock + unconfigured + simulated).
- Runbook e documentacao de operacao atualizados e consistentes com implementacao.
- `api:smoke:local` e `api:smoke:real` executando com sucesso nos limites do ambiente sem chaves reais.
- Condicao de aprovacao final depende de ativacao do provedor real com checklist de item 8 cumprido.

---

## 10) Proximas tasks pequenas apos chegada das chaves

1. Habilitar variaveis D4Sign real em ambiente de staging e executar os cenarios do checklist sandbox.
2. Implementar/ativar consulta oficial de status com assinatura de envelope real.
3. Implementar persistencia de `verification_method`/`provider_payload_hash` com payload hash oficial.
4. Ajustar fluxos de erro para distincao explicita entre status final do dossie e de assinatura.
5. Executar rodada de homologacao com pacote de evidencia regenerado pos-eventos reais.
6. Conduzir validacao juridica/operacional formal com time compliance sobre emissao de `verified`.

---

## 11) Checks atuais de saude do projeto

- `api:smoke:local` esta passando no estado-base atual sem chaves D4Sign.
- `api:smoke:real` esta passando no estado-base atual sem chaves D4Sign.
- `git diff --check` devera retornar sem alertas de whitespace apos este documento.
- Estrutura de auditoria e evidencias ja consolidada para o fluxo documental.

---

## 12) Matriz de decisao: seguir para D4Sign real agora vs aguardar credenciais

| Situacao | Evidencia disponivel | Risco | Recomendacao |
|---|---|---|---|
| Aguardar credenciais | Sem chaves/sem confirmacao oficial da D4Sign | Baixo risco tecnico imediato | **Aguardar** - mantem ambiente estavel e auditavel com simulated/unconfigured. |
| Ativar real parcialmente (apenas ambiente de testes) | Credenciais de sandbox + duvidas de HMAC/endpoint | Risco de bloqueio operacional e falsos positivos | **Ativar em staging com controle estrito e rollback preparado.** |
| Ativar real diretamente em producao | Credenciais completas e estrategia oficial validada | Risco de bloqueio transacional alto | **Nao recomendado** sem concluir o ciclo de validacao da matriz de item 8. |

---

## Pendencias reais

- Aprovacao formal da estrategia HMAC oficial pela D4Sign.
- Conferencia oficial de endpoints (status, eventos, evidencia/certificado).
- Definicao de comportamento idempotente com chaves/event IDs oficiais.
- Definicao de criterios de producao para retries, timeouts e falha parcial de webhook.
