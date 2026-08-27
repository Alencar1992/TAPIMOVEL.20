const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const clienteHotfix = fs.readFileSync('frontend/cliente-hotfix.js', 'utf8');
const horario = fs.readFileSync('frontend/horario-operacional.js', 'utf8');
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

test('cliente recebe nova versão da lógica operacional sem cache antigo', () => {
  assert.match(config, /20260827\.4/);
  assert.match(config, /cliente-hotfix\.js/);
  assert.match(config, /horario-operacional\.js/);
});

test('horário do cliente usa configuração operacional dinâmica como fonte única', () => {
  assert.match(horario, /regraOperacionalDoDia\(diaAtualInt\)/);
  assert.match(horario, /rotasOperacionaisDoDia\(diaAtualInt\)/);
  assert.match(horario, /regra\.ativo === true/);
  assert.match(horario, /agora >= inicio && agora < fim/);
  assert.match(horario, /setInterval\(reler_, 60000\)/);
  assert.match(horario, /visibilityState === "visible"/);
  assert.doesNotMatch(horario, /segunda a sexta-feira/i);
  assert.doesNotMatch(horario, /horaAtualInt\s*<\s*18/);
  assert.doesNotMatch(horario, /encerrou às <b>22h/i);
});

test('mensagens legadas de horário são substituídas pela configuração atual', () => {
  assert.match(horario, /function ehMensagemHorarioLegado_\(mensagem\)/);
  assert.match(horario, /segunda\\s\+a\\s\+sexta\|18h\|22h/);
  assert.match(horario, /ehMensagemHorarioLegado_\(mensagem\) \? mensagem_\(estado_\(\)\) : mensagem/);
  assert.match(horario, /var confirmarOriginal = typeof window\.confirmarRotaEEnviar/);
  assert.match(horario, /window\.confirmarRotaEEnviar = function/);
  assert.match(horario, /mensagemAtual: function \(\) \{ return mensagem_\(estado_\(\)\); \}/);
});

test('hotfix não usa horário padrão antigo enquanto a configuração carrega', () => {
  assert.match(clienteHotfix, /TapimovelHorarioOperacional\.mensagemAtual/);
  assert.match(clienteHotfix, /Aguarde enquanto consultamos a configuração de atendimento do PDV/);
  assert.doesNotMatch(clienteHotfix, /textoHorarioHoje/);
  assert.doesNotMatch(clienteHotfix, /18h|22h|segunda a sexta-feira/i);
});

test('modal de fechado aguarda configuração operacional antes de decidir status', () => {
  assert.match(horario, /if \(!e\.carregado\)/);
  assert.match(horario, /avisoTimer = setTimeout/);
  assert.match(horario, /if \(e\.aberto\) \{\s*modal\.style\.display = "none"/);
});

test('modal é reconciliado quando o ADM altera o horário com o cliente aberto', () => {
  assert.match(horario, /function reconciliarAviso_\(\)/);
  assert.match(horario, /var carregarConfigOriginal = typeof window\.carregarConfiguracaoOperacional/);
  assert.match(horario, /setTimeout\(reconciliarAviso_, 300\)/);
  assert.match(horario, /setTimeout\(reconciliarAviso_, 1200\)/);
  assert.match(horario, /if \(e\.aberto\) \{\s*modal\.style\.display = "none"/);
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
