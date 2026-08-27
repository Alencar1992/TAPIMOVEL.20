const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('P15 torna a auditoria final parte obrigatória do CI', () => {
  const pkg = JSON.parse(read('package.json'));
  const quality = read('.github/workflows/quality.yml');
  assert.equal(pkg.scripts['audit:final'], 'node scripts/audit-final.js');
  assert.match(pkg.scripts.ci, /audit:final/);
  assert.match(quality, /run: npm run ci/);
});

test('auditoria final protege identidade e deploy do Apps Script', () => {
  const audit = read('scripts/audit-final.js');
  assert.match(audit, /expectedScriptId/);
  assert.match(audit, /workflow_dispatch:/);
  assert.match(audit, /update-deployment/);
  assert.match(audit, /create-deployment/);
  assert.match(audit, /apps-script-production/);
  assert.match(audit, /APPS_SCRIPT_DEPLOYMENT_ID/);
});

test('auditoria final impede cache de fila e retry de escrita', () => {
  const audit = read('scripts/audit-final.js');
  for (const critical of ['Pedidos_Ativos', 'Pedidos_Online_Pendentes', 'Controle_Operacoes']) {
    assert.match(audit, new RegExp(critical));
  }
  for (const write of ['login', 'salvar', 'registrar', 'atualizar', 'excluir', 'remover', 'fechar', 'aceitar', 'recusar']) {
    assert.match(audit, new RegExp(write));
  }
  assert.match(audit, /SAFE_READ_ACTION_PATTERN/);
});

test('auditoria final bloqueia resíduos temporários e segredos', () => {
  const audit = read('scripts/audit-final.js');
  assert.match(audit, /apply-p/);
  assert.match(audit, /p\\d\+/);
  for (const secret of ['.clasprc.json', 'client_secret.json', 'credentials.json', 'oauth-client.json']) {
    assert.match(audit, new RegExp(secret.replace('.', '\\.')));
  }
});

test('relatório final registra fechamento técnico e etapa operacional restante', () => {
  const doc = read('docs/AUDITORIA_FINAL_P15.md');
  assert.match(doc, /P11/);
  assert.match(doc, /P12/);
  assert.match(doc, /P13/);
  assert.match(doc, /P14/);
  assert.match(doc, /P15/);
  assert.match(doc, /deploy consolidado/i);
  assert.match(doc, /smoke/i);
});
