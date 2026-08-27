# P14 — Limpeza conservadora de legado

## Objetivo

Remover somente código comprovadamente sem consumidor atual, sem transformar a limpeza em uma refatoração de risco.

## Removido

### `include(filename)`

Era um helper do modelo antigo baseado em `HtmlService.createHtmlOutputFromFile`. O frontend atual é servido pelo GitHub Pages e nenhuma parte do bundle Apps Script chama `include()`.

### `salvarMultiplosFechamentos(resumosJSON)`

O contrato permanecia no `Code.gs` e na allowlist administrativa da API, mas não existe chamada no `index.html`, `cliente.html`, `eliel.js` ou `configuracao.js`. O fechamento diário atual usa `fecharDiaSeguro`.

## Compatibilidade mantida deliberadamente

- `salvarFechamentoDiaPlanilha` permanece disponível como fallback legado do fechamento diário único.
- As funções inline antigas `registrarFechamentoDia` e `confirmarRegistroFechamentoDiario` permanecem no `index.html`; o módulo `fechamento-diario-seguro.js` sobrescreve essas funções quando carrega normalmente.
- `excluirContadorTapiocasHoje` permanece porque ainda é usado pela ação administrativa de zerar a linha diária.
- `investigador.js` permanece porque está carregado pelo `index.html` e alimenta o modal de erros do navegador.

## Critério de segurança

Um item só foi removido quando a busca no código mostrou a definição/allowlist sem consumidor de frontend atual. Códigos com função de fallback ou diagnóstico foram preservados mesmo que exista implementação mais nova.

## Validação

- suíte `npm run ci`;
- teste P14 específico de ausência dos contratos mortos;
- teste explícito de preservação dos fallbacks ainda úteis;
- check oficial `validar` antes do merge.
