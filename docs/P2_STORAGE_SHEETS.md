# P2 — Storage resiliente de filas no Google Sheets

## Objetivo

Remover as filas operacionais grandes do `PropertiesService` e tornar o Google Sheets a fonte oficial para:

- `pdv_vendas_ativas` → aba `Pedidos_Ativos`
- `pedidos_online_pendentes` → aba `Pedidos_Online_Pendentes`

## Migração

A migração é automática e executada na primeira leitura após a publicação do backend atualizado.

1. A aba de destino é criada com cabeçalho, caso ainda não exista.
2. O sistema lê eventual fila já existente no Sheets.
3. O legado no `PropertiesService` é validado como JSON e como lista.
4. Sheets e legado são consolidados sem duplicar pedidos pela chave operacional.
5. O resultado é gravado no Sheets.
6. Somente após a gravação bem-sucedida a chave legada é apagada do `PropertiesService`.

Se o JSON legado estiver inválido, a migração falha de forma explícita e a propriedade é preservada para recuperação; não há exclusão silenciosa.

## Estrutura das abas

Cada pedido ocupa uma linha com os campos:

- Chave
- Número
- Código Online
- Status
- Criado em
- Atualizado em
- Payload JSON

O payload completo preserva a compatibilidade com o formato atual do PDV e dos pedidos online, enquanto as colunas principais permitem inspeção operacional direta.

## Concorrência

Os fluxos de leitura que podem disparar a primeira migração e os fluxos de alteração continuam protegidos por `LockService`, evitando duas migrações/escritas simultâneas.

O fechamento P0 também consulta `Pedidos_Ativos` pelo novo storage, preservando a regra de pedidos pendentes por competência.

## Fora do escopo

`pedidos_online_contador` permanece no `PropertiesService`, pois é um estado pequeno e não é uma fila. A configuração operacional também não faz parte deste P2.

## Publicação

A criação das novas abas não deve ser feita manualmente. Após a nova versão do Apps Script ser implantada, o próprio backend cria/migra as abas na primeira leitura, permitindo validar o processo real de migração.
