const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const clienteHotfix = fs.readFileSync('frontend/cliente-hotfix.js', 'utf8');
const config = fs.readFileSync('frontend/config.js', 'utf8');
const pedidos = fs.readFileSync('apps-script/PedidoService.gs', 'utf8');

test('bebidas entram direto no carrinho sem observação', () => {
  assert.match(clienteHotfix, /prod\.tipo === "bebida"/);
  assert.match(clienteHotfix, /obs: ""/);
  assert.match(clienteHotfix, /adicionarBebidaDireto_/);
});

test('bebidas conhecidas usam imagens próprias e nunca fallback de tapioca', () => {
  assert.match(clienteHotfix, /bebida-coca-zero\.webp/);
  assert.match(clienteHotfix, /bebida-coca-original\.webp/);
  assert.match(clienteHotfix, /bebida-fanta-laranja\.webp/);
  assert.match(clienteHotfix, /bebida-sprite\.webp/);
  assert.match(clienteHotfix, /bebida-guarana-antartica\.webp/);
  assert.match(clienteHotfix, /bebida-del-valle-goiaba\.webp/);
  assert.match(clienteHotfix, /produto && produto\.tipo === "bebida"\) return ""/);
});

test('cliente recebe nova versão do hotfix sem cache antigo', () => {
  assert.match(config, /20260827\.2/);
});

test('pedido online relê Config_Horarios do Sheets antes de adquirir o lock', () => {
  assert.match(pedidos, /function obterConfiguracaoOperacionalPedidoOnlineFresca_\(\)/);
  assert.match(pedidos, /lerConfiguracaoOperacionalSheets_\(\)/);
  const inicio = pedidos.indexOf('function registrarPedidoOnline');
  const trecho = pedidos.slice(inicio, inicio + 900);
  const indiceConfig = trecho.indexOf('obterConfiguracaoOperacionalPedidoOnlineFresca_()');
  const indiceLock = trecho.indexOf('LockService.getScriptLock()');
  assert.ok(indiceConfig >= 0 && indiceLock > indiceConfig, 'configuração fresca deve ser obtida antes do lock');
  assert.match(trecho, /obterRegraOperacionalHoje_\(configOperacional, new Date\(\)\)/);
});
