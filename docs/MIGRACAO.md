# Migração do Tapimóvel 2.0

## Arquitetura da primeira etapa

- `frontend/`: interface estática preparada para GitHub Pages.
- `apps-script/`: API intermediária que continua conectada ao Google Sheets.
- Google Sheets: fonte de dados do sistema.

## Publicação da API

1. Substitua o conteúdo de `Code.gs` e `appsscript.json` no projeto Apps Script.
2. Crie uma nova implantação como aplicativo da Web.
3. Execute como o proprietário e libere o acesso necessário para o beta.
4. Copie a URL terminada em `/exec`.
5. Cole a URL em `frontend/config.js`.

## Beta no GitHub Pages

Configure o GitHub Pages para publicar a pasta `frontend/`. A tela administrativa fica em
`index.html` e o cardápio público em `cliente.html`.

## Segurança

Esta primeira etapa preserva a compatibilidade com o sistema atual. Antes da troca oficial,
as ações administrativas receberão autenticação própria e a fila ativa será removida do
`PropertiesService`.
