## Objetivo

Descreva de forma objetiva o que muda e por quê.

## Checklist obrigatório

- [ ] Alteração feita em branch dedicada; não diretamente na `main`.
- [ ] `npm run ci` passou sem erros.
- [ ] Não reintroduz `pdv_vendas_ativas`, `pedidos_online_pendentes` ou `tapimovel_config_operacional_v1` como storage persistente no `PropertiesService`.
- [ ] Regras de autenticação, sessão, autorização e validação server-side foram preservadas.
- [ ] Mudanças de Sheets usam `LockService` quando houver escrita concorrente.
- [ ] Migrações de dados são idempotentes e preservam o legado em caso de falha.
- [ ] Se houver mudança no backend Apps Script, o deploy oficial será feito somente após validação da PR.
- [ ] Se houver mudança visual/funcional, foi realizado smoke test no fluxo afetado.

## Impacto de deploy

- Backend Apps Script: [ ] sim [ ] não
- Frontend / GitHub Pages: [ ] sim [ ] não
- Google Sheets / migração: [ ] sim [ ] não

## Plano de rollback

Descreva como voltar à versão anterior se a publicação apresentar regressão.
