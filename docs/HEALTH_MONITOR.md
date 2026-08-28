# Health Monitor — TAPIMOVEL.20

O monitor é executado pelo GitHub Actions e não realiza nenhuma escrita no PDV, no Apps Script ou nas planilhas.

## Frequência

- a cada hora, no minuto 17;
- manualmente por `workflow_dispatch`;
- após mudanças relevantes na `main` que atinjam frontend, Apps Script ou o próprio monitor.

## Camadas verificadas

1. GitHub Pages do PDV/ADM;
2. GitHub Pages do cardápio do cliente;
3. endpoint raiz da API do Apps Script;
4. leitura pública do status/configuração operacional (`obterStatusCardapio`).

Cada verificação usa até três tentativas e timeout para reduzir alarmes causados por instabilidades transitórias.

## Incidentes

Quando uma falha persiste, o workflow:

- marca a execução como falha;
- abre a issue `[HEALTH] TAPIMOVEL indisponível`, ou atualiza a issue já aberta;
- inclui a camada afetada, latência e detalhe técnico.

Quando todas as camadas voltam a responder, o workflow comenta a recuperação e fecha automaticamente a issue do incidente.

## Segurança

O script `scripts/health-check.mjs` usa apenas requisições HTTP GET e endpoints públicos já existentes. Ele não recebe PIN, sessão administrativa, token do Apps Script ou acesso ao Google Sheets.
