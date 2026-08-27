const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('P13 agrupa somente leituras idênticas enquanto estão em andamento', () => {
  const api = read('frontend/api-client.js');
  assert.match(api, /SAFE_READ_ACTION_PATTERN/);
  assert.match(api, /pendingReadRequests = Object\.create\(null\)/);
  assert.match(api, /function requestApiShared\(action, args, token\)/);
  assert.match(api, /if \(!SAFE_READ_ACTION_PATTERN\.test\(action\)\) \{\s*return requestApi\(action, args, token, 0\);/s);
  assert.match(api, /if \(pendingReadRequests\[key\]\) return pendingReadRequests\[key\]/);
  assert.match(api, /delete pendingReadRequests\[key\]/);
  assert.match(api, /requestApiShared\(prop, args, getToken\(\)\)/);
});

test('P13 não trata login nem escritas como operação segura para retry ou deduplicação', () => {
  const api = read('frontend/api-client.js');
  const patternLine = api.match(/var SAFE_READ_ACTION_PATTERN = ([^;]+);/);
  assert.ok(patternLine, 'padrão de leitura segura precisa existir');
  assert.doesNotMatch(patternLine[1], /login/);
  for (const escrita of ['salvar', 'registrar', 'atualizar', 'excluir', 'remover', 'fechar', 'aceitar', 'recusar']) {
    assert.doesNotMatch(patternLine[1], new RegExp(escrita));
  }
});

test('P13 reduz persistência síncrona de atividade no localStorage', () => {
  const api = read('frontend/api-client.js');
  assert.match(api, /ACTIVITY_PERSIST_INTERVAL_MS = 30000/);
  assert.match(api, /lastActivityPersistedAt/);
  assert.match(api, /agora - lastActivityPersistedAt < ACTIVITY_PERSIST_INTERVAL_MS/);
  assert.match(api, /localStorage\.setItem\(TOKEN_LAST_ACTIVITY_KEY, String\(agora\)\)/);
});

test('P13 não carrega módulos administrativos no cardápio do cliente', () => {
  const config = read('frontend/config.js');
  const cliente = read('frontend/cliente.html');
  assert.match(cliente, /<script src="\.\/config\.js"><\/script>/);
  assert.match(config, /function paginaTapimovelEhCliente_\(\)/);
  assert.match(config, /cliente\\\.html/);
  assert.match(config, /if \(!paginaTapimovelEhCliente_\(\)\) \{/);
  assert.match(config, /fechamento-eliel-ui\.js/);
  assert.match(config, /fechamento-diario-seguro\.js/);
});

test('P13 preserva a URL oficial da API e não altera contratos de fechamento', () => {
  const config = read('frontend/config.js');
  const api = read('frontend/api-client.js');
  assert.match(config, /AKfycbwupkSzv-H0qucPvVdvpQ85ytmNDu8_DOgPnakTY5lwIQ1jDCpuGqCvfvAMSIuMRL6f/);
  assert.match(api, /window\.google\.script\.run = createRunner\(\)/);
  assert.match(api, /withSuccessHandler/);
  assert.match(api, /withFailureHandler/);
});
