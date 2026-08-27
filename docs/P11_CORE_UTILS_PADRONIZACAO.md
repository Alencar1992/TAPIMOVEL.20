# P11 — Padronização do Núcleo e Utilitários Compartilhados

## Objetivo

Reduzir divergências de datas, números, comparações monetárias e logs técnicos sem alterar contratos públicos nem regras de negócio do TAPIMOVEL.

## Núcleo único

O módulo `apps-script/CoreUtils.gs` passa a concentrar:

- parsing de números e moeda em formatos brasileiros e decimais com ponto;
- parsing e validação de datas de calendário;
- formatação no fuso oficial `America/Sao_Paulo`;
- chaves diárias e mensais;
- identificação de mês e dia da semana;
- comparação numérica com tolerância;
- extração de mensagem de erro;
- log técnico estruturado e sem dados de autenticação.

## Compatibilidade

Os contratos internos antigos continuam existindo como wrappers:

- `normalizarNumero_`;
- `extrairData_`;
- `pertenceAoMes_`;
- `chaveMes_`;
- `nomeDia_`;
- helpers privados do `FechamentoDiarioService`.

Isso permite migrar o restante do legado em etapas posteriores sem quebrar Relatório Eliel, fechamento mensal ou fechamento diário.

## Segurança operacional

O P11 não altera:

- preços;
- catálogo;
- fluxo de pedidos;
- permissões;
- regras de fechamento mensal;
- regras de fechamento diário;
- estrutura histórica das planilhas.

`CoreUtils.gs` entra no preflight obrigatório do deploy para impedir publicação incompleta.

## Validação

Os testes do P11 cobrem:

- `R$ 1.234,56`;
- decimal com vírgula e com ponto;
- separador de milhar;
- datas `dd/MM/yyyy` e `yyyy-MM-dd`;
- datas inválidas;
- chaves mensais;
- wrappers de compatibilidade;
- logging estruturado;
- presença do módulo no preflight de produção.
