# P12 — Performance Google Sheets / Apps Script

## Objetivo

Reduzir leituras repetidas no Google Sheets sem colocar em cache dados operacionais ou estados críticos de fechamento.

## Estratégia

O módulo `ReadCacheService.gs` mantém snapshots analíticos por no máximo 30 segundos para:

- `Historico_Diario`;
- `Fechamentos_Diarios`;
- `Tapiocas Diária`;
- `Combustivel`.

O cache é usado apenas em consultas e relatórios. Filas e controles transacionais não entram na allowlist.

## Dados que nunca usam esse cache

- `Pedidos_Ativos`;
- `Pedidos_Online_Pendentes`;
- `Controle_Operacoes`;
- estados de fechamento mensal e diário;
- dados de autenticação.

## Invalidação

As escritas que alteram dados analíticos removem imediatamente o snapshot correspondente. O fechamento mensal invalida todos os snapshots analíticos antes de montar a prévia oficial, garantindo leitura fresca.

## Consultas otimizadas

- Relatório Eliel;
- resumo mensal do PDV;
- estimativa salarial;
- histórico de combustível;
- ranking de rotas;
- ranking de produtos.

## Segurança

Se uma aba ultrapassar o limite seguro do `CacheService`, a leitura continua diretamente no Google Sheets sem falhar. O cache é uma otimização e nunca uma fonte oficial de dados.

## Compatibilidade

Nenhum contrato público de API é alterado. Não há migração de planilha e não há alteração de regra comercial.
