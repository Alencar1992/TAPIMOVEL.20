const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('P10.1 carrega módulo próprio de controle do fechamento', () => {
  const config = read('frontend/config.js');
  assert.match(config, /fechamento-eliel-ui\.css\?v=/);
  assert.match(config, /fechamento-eliel-ui\.js\?v=/);
  assert.match(config, /20260826\.2/);
});

test('painel mostra período, status, pendências e operação do mês', () => {
  const ui = read('frontend/fechamento-eliel-ui.js');
  assert.match(ui, /id = "elielFechamentoControle"/);
  assert.match(ui, /Fechamento do mês/);
  assert.match(ui, /elielFechamentoPeriodo/);
  assert.match(ui, /elielFechamentoStatus/);
  assert.match(ui, /elielFechamentoPendentes/);
  assert.match(ui, /elielFechamentoOperacao/);
});

test('controle reutiliza prévia segura e bloqueia fechamento duplicado ou com pendências', () => {
  const ui = read('frontend/fechamento-eliel-ui.js');
  assert.match(ui, /\.obterPreviaFechamentoRelatorioEliel\(/);
  assert.match(ui, /ultimoEstado\.duplicado/);
  assert.match(ui, /ultimoEstado\.pedidosPendentes/);
  assert.match(ui, /botao\.disabled = duplicado \|\| pendentes > 0/);
  assert.match(ui, /window\.abrirFechamentoMesEliel/);
});

test('admin comum não recebe poder de fechar e CEO Eliel continua protegido no backend', () => {
  const ui = read('frontend/fechamento-eliel-ui.js');
  const api = read('apps-script/Api.gs');
  const fechamento = read('apps-script/FechamentoService.gs');

  assert.match(ui, /Entrar como CEO Eliel/);
  assert.match(ui, /index\.html\?acesso=eliel/);
  assert.match(api, /action === "fecharMesRelatorioEliel" && sessao\.perfil !== "eliel"/);
  assert.match(api, /PERMISSION_DENIED/);
  assert.match(fechamento, /O fechamento mensal é exclusivo do perfil CEO Eliel/);
});

test('painel diferencia pronto, bloqueado, fechado e recuperação segura', () => {
  const ui = read('frontend/fechamento-eliel-ui.js');
  for (const estado of ['PRONTO', 'BLOQUEADO', 'FECHADO', 'RECUPERAÇÃO']) {
    assert.match(ui, new RegExp(estado));
  }
});
