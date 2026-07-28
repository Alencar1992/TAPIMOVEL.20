# Tapimóvel 2.0

Sistema web responsivo da Expresso Tapiocaria para operação do cardápio, pedidos, produção, disponibilidade de itens, configurações e relatórios.

## Acessos

- [Painel administrativo](https://alencar1992.github.io/TAPIMOVEL.20/frontend/index.html)
- [Acesso restrito do CEO Eliel](https://alencar1992.github.io/TAPIMOVEL.20/frontend/relatorio-eliel.html)
- [Cardápio do cliente](https://alencar1992.github.io/TAPIMOVEL.20/frontend/cliente.html)
- O endereço principal do GitHub Pages redireciona automaticamente para o painel administrativo.

## Estrutura do projeto

- `frontend/`: painel administrativo, cardápio do cliente, estilos, scripts e imagens.
- `apps-script/Code.gs`: backend oficial do Tapimóvel para Google Apps Script.
- `apps-script/appsscript.json`: manifesto do Apps Script.
- `docs/`: documentação de migração e implantação.
- `index.html`: redirecionamento seguro para o painel.

## Funcionalidades principais

- pedidos e lançamento para produção;
- cardápio administrativo e cardápio do cliente;
- pausa e reativação de itens com pressão de 3 segundos;
- configuração auditável de produtos;
- logs de acesso e alterações;
- Relatório Eliel e fechamento mensal;
- exportação de relatórios;
- integração com Google Sheets por Google Apps Script.

## Publicação

O frontend é publicado pelo GitHub Pages a partir da branch `main`.

Alterações no backend devem ser copiadas exclusivamente de `apps-script/Code.gs` para o projeto do Google Apps Script e publicadas como uma nova versão da implantação web. A URL `/exec` configurada em `frontend/config.js` deve ser mantida.

## Cuidados

- Não duplicar arquivos do Apps Script na raiz.
- Não armazenar chaves, senhas ou dados pessoais no repositório.
- Toda mudança deve ser feita em branch separada e revisada por Pull Request antes de chegar à `main`.
