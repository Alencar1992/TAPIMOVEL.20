# Ajuste operacional — Online e Produção

## Objetivo
Organizar pedidos online no PDV e reforçar alertas de venda sem alterar contratos do Apps Script.

## Ordem visual
1. Itens/tapiocas do pedido.
2. Observação específica logo abaixo do item correspondente.
3. No final do pedido: cliente, bairro, endereço e forma de pagamento, um por linha.

## Compatibilidade
Pedidos antigos que ainda possuam o formato legado `🟢 CLI: ... | OBS: ...` são limpos apenas para exibição. Novos pedidos deixam de gravar dados do cliente dentro da observação da primeira tapioca.

## Alertas
- sino MP3 existente + fallback Web Audio;
- vibração quando suportada;
- Notification API quando a permissão estiver concedida;
- banner persistente dentro do PDV;
- Screen Wake Lock quando suportado e com a tela visível;
- detecção por identidade do pedido, não apenas pela quantidade da fila.

## Limite do navegador
Permissão de notificação explicitamente negada pelo usuário/sistema não pode ser burlada por uma página web. Nesse cenário o PDV mantém sino, vibração e alerta visual. Se o navegador encerrar/suspender totalmente a página em segundo plano, polling local também pode ser interrompido; push em background exigiria infraestrutura Web Push própria.
