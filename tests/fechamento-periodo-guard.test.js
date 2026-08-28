const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

function extrairFuncao(codigo, nome) {
  const inicio = codigo.indexOf(`function ${nome}(`);
  assert.notEqual(inicio, -1, `Função ${nome} não encontrada`);
  const abre = codigo.indexOf('{', inicio);
  let nivel = 0;
  for (let i = abre; i < codigo.length; i++) {
    if (codigo[i] === '{') nivel++;
    if (codigo[i] === '}') {
      nivel--;
      if (nivel === 0) return codigo.slice(inicio, i + 1);
    }
  }
  throw new Error(`Função ${nome} incompleta`);
}

test('backend considera encerrado somente período anterior ao mês atual', () => {
  const fechamento = read('apps-script/FechamentoService.gs');
  const codigo = extrairFuncao(fechamento, 'obterRegraPeriodoFechamentoMensal_');
  const contexto = {
    Date,
    Number,
    String,
    isNaN,
    Utilities: {
      formatDate(_data, fuso, formato) {
        assert.equal(fuso, 'America/Sao_Paulo');
        assert.equal(formato, 'yyyy-MM');
        return '2026-08';
      }
    },
    Session: { getScriptTimeZone() { return 'America/Sao_Paulo'; } }
  };
  vm.createContext(contexto);
  vm.runInContext(codigo, contexto);

  const agora = new Date('2026-08-28T10:35:00-03:00');
  const julho = contexto.obterRegraPeriodoFechamentoMensal_(7, 2026, agora);
  const agosto = contexto.obterRegraPeriodoFechamentoMensal_(8, 2026, agora);
  const setembro = contexto.obterRegraPeriodoFechamentoMensal_(9, 2026, agora);

  assert.equal(julho.periodoEncerrado, true);
  assert.equal(agosto.periodoEncerrado, false);
  assert.equal(agosto.disponivelEm, '01/09/2026');
  assert.match(agosto.mensagem, /ainda está em andamento/);
  assert.equal(setembro.periodoEncerrado, false);
  assert.equal(setembro.disponivelEm, '01/10/2026');
});

test('prévia e gravação mensal obedecem ao bloqueio temporal do backend', () => {
  const fechamento = read('apps-script/FechamentoService.gs');
  assert.match(fechamento, /const regraPeriodo = obterRegraPeriodoFechamentoMensal_\(mes, ano\)/);
  assert.match(fechamento, /periodoEncerrado: regraPeriodo\.periodoEncerrado/);
  assert.match(fechamento, /bloqueioTemporal: regraPeriodo\.mensagem/);
  assert.match(fechamento, /podeFechar: regraPeriodo\.periodoEncerrado && !duplicado && pedidosPendentes === 0/);
  assert.match(fechamento, /if \(!previa\.periodoEncerrado\)/);
  assert.match(fechamento, /previa\.bloqueioTemporal/);
});

test('frontend carrega guarda temporal e impede clique em mês corrente ou futuro', () => {
  const config = read('frontend/config.js');
  const guard = read('frontend/fechamento-periodo-guard.js');
  assert.match(config, /fechamento-periodo-guard\.js\?v=/);
  assert.match(config, /20260828\.1/);
  assert.match(guard, /America\/Sao_Paulo/);
  assert.match(guard, /chave < atual/);
  assert.match(guard, /botao\.disabled = true/);
  assert.match(guard, /Disponível após o fim do mês/);
  assert.match(guard, /stopImmediatePropagation\(\)/);
  assert.match(guard, /\}, true\);/);
});
