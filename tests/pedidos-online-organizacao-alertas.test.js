const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const index = fs.readFileSync('frontend/index.html', 'utf8');
const cliente = fs.readFileSync('frontend/cliente.html', 'utf8');

test('cliente não mistura dados pessoais na observação da primeira tapioca', () => {
  assert.ok(!cliente.includes('🟢 CLI:'));
  assert.ok(!cliente.includes("' | OBS: ' + obsAntiga"));
});

test('Online renderiza itens e observações antes dos dados do cliente', () => {
  assert.match(index, /pedido-online-itens/);
  assert.match(index, /pedido-online-obs/);
  assert.match(index, /renderizarBlocoClienteOnline\(pedido, ''\)/);
  const fn = index.slice(index.indexOf('function renderizarPedidosOnline'), index.indexOf('function aceitarPedidoOnlineTela'));
  assert.ok(fn.indexOf('pedido-online-itens') < fn.indexOf("renderizarBlocoClienteOnline(pedido, '')"));
});

test('Produção coloca dados do cliente somente depois de todos os itens', () => {
  assert.match(index, /dadosClienteProducao/);
  assert.match(index, /\$\{htmlItens\}\$\{dadosClienteProducao\}/);
  assert.match(index, /pedido-producao-cliente/);
});

test('pedidos legados têm metadados removidos da observação somente na apresentação', () => {
  assert.match(index, /function limparObsLegadaOnlineTela/);
  assert.match(index, /lastIndexOf\('| OBS:'\)/);
  assert.match(index, /obsOperacional/);
});

test('novo pedido online usa sino, vibração, notificação e alerta visual', () => {
  assert.match(index, /function tocarSinoOnline/);
  assert.match(index, /navigator\.vibrate/);
  assert.match(index, /new Notification\('🔔 Novo pedido online'/);
  assert.match(index, /requireInteraction: true/);
  assert.match(index, /alerta-online-fixo/);
  assert.match(index, /navigator\.wakeLock/);
});

test('detecção de novidade usa identidade do pedido e não apenas aumento da contagem', () => {
  assert.match(index, /codigosOnlineAlertados/);
  assert.match(index, /chavePedidoOnlineAlerta/);
  assert.ok(!index.includes('campainhaOnlineAtiva && novos.length > totalOnlineAnterior'));
});
