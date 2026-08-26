# P10.2 — Fechamento diário seguro e automático

## Objetivo

Garantir que o PDV nunca apague os pedidos do dia antes de confirmar que o resumo financeiro e a quantidade de tapiocas foram persistidos corretamente no Google Sheets.

## Fluxo seguro

1. O backend lê `Pedidos_Ativos` e identifica o dia solicitado.
2. Se existir pedido sem pagamento ou sem produção concluída, o fechamento é bloqueado.
3. O servidor consolida faturamento, Dinheiro, PIX, Crédito, Débito, VR e quantidade de tapiocas.
4. O resumo é gravado por data em `Fechamentos_Diarios` usando atualização da linha existente ou criação de uma única linha.
5. A quantidade é gravada por data em `Tapiocas Diária`.
6. `SpreadsheetApp.flush()` é executado.
7. As duas abas são lidas novamente e os valores são comparados com o resumo calculado.
8. Somente depois da validação o backend remove de `Pedidos_Ativos` os pedidos pertencentes ao dia fechado.
9. A fila é lida novamente para confirmar que o dia realmente foi removido.
10. O fechamento recebe status `CONCLUIDO`.

## Proteções

- `LockService.getDocumentLock()` serializa o fechamento.
- Pendências bloqueiam a limpeza do dia.
- O serviço não usa `appendRow()` para o resumo diário; procura a data antes de escrever.
- Mais de uma linha existente para a mesma data gera erro explícito em vez de criar uma terceira duplicidade.
- Falha após a gravação e antes da limpeza deixa os dados persistidos e permite recuperação na próxima tentativa.
- A limpeza afeta somente os pedidos da data fechada; pedidos de outras datas permanecem na fila.
- O frontend não executa mais `historicoNuvem = []` ao confirmar o fechamento.

## Fechamento automático

`executarFechamentoDiarioAutomatico` é acionado por um trigger horário. O trigger é garantido de forma idempotente no primeiro login administrativo após o deploy.

Regras:

- nunca fecha o dia corrente;
- só processa após 02h no fuso `America/Sao_Paulo`;
- procura datas antigas ainda presentes em `Pedidos_Ativos`;
- usa exatamente o mesmo núcleo seguro do fechamento manual;
- se houver pendências, não apaga nada e volta a tentar em uma execução futura.

## Compatibilidade

As sete primeiras colunas de `Fechamentos_Diarios` são preservadas. O P10.2 acrescenta:

- `Origem` — `MANUAL` ou `AUTOMATICO`;
- `Status` — `GRAVADO` ou `CONCLUIDO` durante a operação;
- `Atualizado Em` — carimbo de auditoria.

Relatórios existentes continuam lendo as colunas financeiras originais.

## Deploy

O P10.2 altera frontend e Apps Script. Portanto, depois de merge na `main`:

1. aguardar GitHub Pages publicar o frontend;
2. executar manualmente o workflow `Deploy Apps Script - produção` com confirmação `PUBLICAR`;
3. no primeiro login administrativo, o backend tentará garantir o trigger horário;
4. realizar smoke test do fechamento sem utilizar dados reais de um dia em operação.

Não executar fechamento real durante validação técnica sem conferir previamente a data e os pedidos do ambiente.
