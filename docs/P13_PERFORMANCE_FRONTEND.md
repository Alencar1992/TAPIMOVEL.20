# P13 — Performance e carga seletiva do frontend

## Objetivo

Reduzir trabalho repetido no navegador sem alterar fluxos de negócio, permissões, contratos públicos ou semântica das operações de escrita.

## Alterações

- Requisições de leitura idênticas e simultâneas passam a compartilhar a mesma Promise enquanto estiverem em andamento.
- Nenhuma resposta fica armazenada após o término da requisição; portanto, isso não é cache de dados.
- Operações de escrita, fechamento, aceite, recusa, exclusão e login continuam sempre independentes.
- O retry automático fica restrito a ações explicitamente classificadas como leitura segura.
- A gravação de atividade da sessão em `localStorage` é limitada a uma vez a cada 30 segundos.
- `cliente.html` deixa de carregar os módulos administrativos `fechamento-eliel-ui.js`, `fechamento-eliel-ui.css` e `fechamento-diario-seguro.js`.

## Segurança

- A URL oficial da API foi preservada.
- `window.google.script.run`, `withSuccessHandler` e `withFailureHandler` continuam com o mesmo contrato.
- Escritas nunca são agrupadas.
- Login não é elegível para retry automático nem deduplicação.
- Nenhuma alteração foi feita no Apps Script nesta etapa.

## Resultado esperado

- Menos chamadas duplicadas quando dois componentes pedem o mesmo dado ao mesmo tempo.
- Menos operações síncronas de `localStorage` durante interação contínua.
- Menos JavaScript/CSS administrativo carregado no cardápio público.
- Menor custo de CPU/rede sem risco de servir dados antigos.

## Validação

O P13 deve passar por `npm run ci`, check oficial `validar` da PR e smoke no GitHub Pages após o merge.
