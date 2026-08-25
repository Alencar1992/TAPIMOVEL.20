# P7 — Modularização do serviço de pedidos

## Objetivo

Separar do `Code.gs` a lógica específica de pedidos sem alterar contratos públicos, payloads, regras comerciais ou persistência.

## Novo módulo

`apps-script/PedidoService.gs` passa a concentrar:

- preço/validação do **Monte Sua** usada em pedidos;
- normalização de pedidos online;
- registro, listagem, aceite e recusa de pedidos online;
- normalização, criação e atualização de pedidos do PDV;
- wrappers legados `salvarVendaRealTime` e `atualizarVendaRealTime`.

A persistência das filas continua em `SheetsRepository.gs`. Autenticação e roteamento continuam em `AuthService.gs` e `Api.gs`.

## Fora do escopo

Não foram movidos nesta etapa histórico, cancelamentos, fechamento mensal, relatórios, catálogo ou configuração operacional.

## Validação

O CI deve validar o bundle completo de `apps-script/*.gs`, preservando os contratos públicos e as regras de adicionais, preço, filas e pedidos após a separação do `Code.gs`. Os testes de adicionais e do fluxo de pedidos online também validam o bundle modular, sem depender da localização física das funções em um único arquivo.

## Deploy manual

Antes de substituir o `Code.gs` no Apps Script, crie `PedidoService.gs` e cole o conteúdo correspondente da `main`. Mantenha todos os módulos P5/P6 existentes. Depois publique uma nova versão da implantação atual preservando o mesmo `/exec`.

## Rollback

Reverter o squash commit do P7 restaura as funções ao `Code.gs` anterior.
