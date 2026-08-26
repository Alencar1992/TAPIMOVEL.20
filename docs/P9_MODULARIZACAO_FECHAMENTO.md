# P9 — Modularização do fechamento mensal

## Objetivo

Extrair do `Code.gs` o domínio crítico de fechamento mensal para `apps-script/FechamentoService.gs`, sem alterar contratos públicos, regras financeiras, autorização do CEO Eliel ou persistência existente.

## Escopo movido

O novo serviço concentra:

- máquina de estado em `Controle_Operacoes`;
- persistência em `Fechamentos_Mensais_v2`;
- normalização de referência mensal;
- detecção de pedidos pendentes do período;
- prévia do fechamento;
- idempotência e recuperação após falha parcial;
- gravação no Relatório Eliel e log do fechamento;
- operação pública `fecharMesRelatorioEliel`.

## Fora do escopo

Permanecem no `Code.gs` nesta etapa:

- cálculo de `obterRelatorioEliel`;
- configurações do Relatório Eliel;
- histórico de vendas;
- ranking, exportações e demais relatórios;
- fechamento diário.

Essa separação evita misturar cálculo analítico com a transação crítica de fechamento.

## Compatibilidade

`Api.gs` não muda seus nomes de ação. `obterPreviaFechamentoRelatorioEliel` e `fecharMesRelatorioEliel` continuam globais no bundle do Apps Script, portanto o frontend e o `/exec` permanecem compatíveis.

## Deploy

O preflight do P8 passa a exigir `FechamentoService.gs`, evitando publicação incompleta. Após merge, usar exclusivamente o workflow `Deploy Apps Script - produção` com `PUBLICAR` e aprovação do environment.

## Rollback

Reverter o squash commit do P9 e executar novamente o workflow de produção restaura a versão anterior no mesmo deployment.
