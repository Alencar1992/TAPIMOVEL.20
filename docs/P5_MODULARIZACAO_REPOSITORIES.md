# P5 — Modularização segura do Code.gs

## Objetivo

Reduzir o acoplamento físico do `Code.gs` sem alterar contratos públicos, regras de negócio, dados ou endpoints.

## Módulos criados

- `apps-script/SheetsRepository.gs`: helpers de persistência em Google Sheets para configuração operacional e filas.
- `apps-script/PropertiesRepository.gs`: ponto único de acesso direto ao `ScriptProperties` e persistência do catálogo legado.
- `apps-script/SecurityUtils.gs`: hashing, sessão e erros internos de segurança.

## Garantias

- As funções públicas continuam com as mesmas assinaturas em `Code.gs`.
- Nenhuma aba, chave ou formato de payload foi renomeado.
- `PropertiesService.getScriptProperties()` fica isolado no `PropertiesRepository.gs`.
- O CI compila cada `.gs` individualmente e também o bundle completo.
- Os testes de backend passam a carregar todos os módulos do Apps Script.

## Deploy

Este P5 exige que, no próximo deploy manual do Apps Script, os três novos arquivos `.gs` também sejam adicionados ao projeto oficial. Não publicar apenas o `Code.gs` modularizado sem os módulos, pois as funções movidas são dependências do backend.
