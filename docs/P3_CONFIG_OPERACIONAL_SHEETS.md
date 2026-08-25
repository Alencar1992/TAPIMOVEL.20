# P3 — Configuração Operacional no Google Sheets

## Objetivo

Retirar a configuração operacional dinâmica do armazenamento persistente do `PropertiesService` e usar tabelas estruturadas no Google Sheets.

## Abas

- `Config_Horarios`
- `Config_Rotas`
- `Config_MonteSua`
- `Config_Adicionais`

## Compatibilidade

A chave `tapimovel_config_operacional_v1` permanece no código apenas para a migração do dado legado. Não há nova gravação nessa propriedade.

Na primeira leitura após o deploy:

1. o backend procura a configuração legada;
2. normaliza e grava os dados nas quatro abas;
3. somente após a gravação bem-sucedida remove a propriedade legada;
4. em falha de migração, preserva o legado e continua servindo a configuração anterior;
5. depois da migração, o Google Sheets passa a ser a fonte persistente oficial.

## Cache

O `CacheService` é usado apenas como cache temporário de leitura por 5 minutos e não é fonte persistente de dados. Se o JSON crescer além do limite de segurança adotado, o backend ignora o cache e continua lendo do Sheets.

## Gravação

`salvarConfiguracaoOperacional` mantém `LockService`, grava as quatro tabelas e invalida/atualiza o cache. Se a escrita falhar após a migração, o backend tenta restaurar a configuração anterior.

## Contratos preservados

- `obterConfiguracaoOperacional()`
- `salvarConfiguracaoOperacional(configJSON, responsavel)`

O frontend não precisa ser alterado para esta migração.
