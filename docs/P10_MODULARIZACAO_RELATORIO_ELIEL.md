# P10 — Modularização do Relatório Eliel

## Objetivo

Extrair do `Code.gs` o domínio analítico do Relatório Eliel para `apps-script/RelatorioElielService.gs`, preservando integralmente contratos HTTP, regras financeiras e o fechamento mensal já isolado no P9.

## Escopo movido

O novo serviço concentra:

- leitura e gravação das configurações financeiras do Relatório Eliel;
- rateio de combustível 80% carro / 20% trailer;
- cálculo mensal de faturamento, taxas, custos, líquido e distribuição;
- indicadores por dia e semana;
- ranking de produtos, top 3, cinco menos vendidas e tendências;
- ranking de rotas e participação no faturamento;
- comparativo dos últimos três meses;
- criação/garantia da aba `Relatorio Eliel`;
- log de acesso ao relatório;
- consulta ao histórico de vendas.

## Helpers compartilhados

`normalizarNumero_`, `extrairData_`, `pertenceAoMes_`, `chaveMes_` e `nomeDia_` permanecem no `Code.gs` porque também são consumidos por `FechamentoService.gs`. Eles não são duplicados no novo módulo.

## Fora do escopo

Permanecem fora do novo serviço:

- `fecharMesRelatorioEliel` e toda a máquina de estado do fechamento;
- `Fechamentos_Mensais_v2` e `Controle_Operacoes`;
- fechamento diário;
- configuração operacional do cardápio;
- avisos do PDV;
- o helper legado `obterAbaFechamentosMensais_`.

## Compatibilidade

Os nomes públicos do Apps Script permanecem globais no bundle. `Api.gs` continua roteando e autorizando as mesmas ações, sem mudança no frontend ou no `/exec`.

## Deploy

O preflight do P8 passa a exigir `RelatorioElielService.gs` e os contratos públicos do relatório antes de qualquer publicação. Após merge, publicar somente pelo workflow `Deploy Apps Script - produção`.

## Rollback

Reverter o squash commit do P10 por PR e executar novamente o workflow oficial de produção no mesmo deployment.
