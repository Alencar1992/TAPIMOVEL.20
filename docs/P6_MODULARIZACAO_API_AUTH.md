# P6 — Modularização de API e autenticação

## Objetivo
Separar a porta de entrada HTTP e a autenticação do `Code.gs` sem alterar contratos, URLs, PINs, sessões ou regras de autorização.

## Novos arquivos
- `apps-script/Api.gs`: `doGet`, `doPost`, roteamento/allowlists e resposta JSON.
- `apps-script/AuthService.gs`: configuração dos PINs, login, validação e encerramento de sessão.

## Mantidos
- `SecurityUtils.gs`: hashing e helpers internos de sessão/autorização.
- `SheetsRepository.gs`: persistência estruturada em Sheets.
- `PropertiesRepository.gs`: acesso ao ScriptProperties.
- `Code.gs`: regras de negócio e demais contratos.

## Deploy manual
Antes de substituir o `Code.gs`, crie no Apps Script os arquivos `Api.gs` e `AuthService.gs` e copie o conteúdo correspondente da `main`. O projeto publicado deve conter os seis scripts: `Code.gs`, `Api.gs`, `AuthService.gs`, `PropertiesRepository.gs`, `SecurityUtils.gs` e `SheetsRepository.gs`. Depois crie uma nova versão da implantação existente, preservando o mesmo `/exec`.

## Smoke test
1. Abrir a raiz da API e confirmar status online.
2. Fazer login administrativo.
3. Abrir PDV e Configuração Operacional.
4. Abrir cardápio do cliente.
5. Confirmar que uma ação administrativa sem token continua retornando `AUTH_REQUIRED`.

## Rollback
Reverter o squash commit do P6 e restaurar o `Code.gs` anterior remove `Api.gs` e `AuthService.gs` da arquitetura.
