const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('P8 vincula o clasp somente ao projeto oficial e ao diretório apps-script', () => {
  const clasp = JSON.parse(read('.clasp.json'));
  assert.equal(clasp.scriptId, '1HMoBIVEYDJ6tS6x_7byfiwkQo92caEAa1SJnU0AGYXU933-xm7sO2Bsn');
  assert.equal(clasp.rootDir, 'apps-script');
});

test('P8 valida todos os módulos críticos antes de qualquer publicação', () => {
  const preflight = read('scripts/validate-apps-script-deploy.js');
  for (const modulo of [
    'Api.gs',
    'AuthService.gs',
    'Code.gs',
    'FechamentoDiarioService.gs',
    'FechamentoService.gs',
    'PedidoService.gs',
    'PropertiesRepository.gs',
    'RelatorioElielService.gs',
    'SecurityUtils.gs',
    'SheetsRepository.gs'
  ]) {
    assert.match(preflight, new RegExp(modulo.replace('.', '\\.')));
  }
  assert.match(preflight, /America\/Sao_Paulo/);
  assert.match(preflight, /runtimeVersion/);
});

test('credenciais clasp e OAuth nunca entram no repositório', () => {
  const gitignore = read('.gitignore');
  for (const segredo of ['.clasprc.json', 'client_secret.json', 'credentials.json', 'oauth-client.json']) {
    assert.match(gitignore, new RegExp(segredo.replace('.', '\\.')));
  }
});

test('workflow de produção é manual, revalida CI e atualiza somente deployment existente', () => {
  const workflow = read('.github/workflows/deploy-apps-script.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\npush:/);
  assert.doesNotMatch(workflow, /\npull_request:/);
  assert.match(workflow, /environment: apps-script-production/);
  assert.match(workflow, /PUBLICAR/);
  assert.match(workflow, /refs\/heads\/main/);
  assert.match(workflow, /npm run ci/);
  assert.match(workflow, /npm run deploy:validate/);
  assert.match(workflow, /@google\/clasp@3\.3\.0/);
  assert.match(workflow, /list-deployments/);
  assert.match(workflow, /push --force/);
  assert.match(workflow, /update-deployment/);
  assert.match(workflow, /APPS_SCRIPT_DEPLOYMENT_ID/);
  assert.match(workflow, /CLASPRC_JSON/);
  assert.doesNotMatch(workflow, /create-deployment/);
});

test('input PUBLICAR não é interpolado diretamente no shell', () => {
  const workflow = read('.github/workflows/deploy-apps-script.yml');
  assert.match(workflow, /CONFIRMACAO: \$\{\{ inputs\.confirmacao \}\}/);
  assert.match(workflow, /test "\$CONFIRMACAO" = "PUBLICAR"/);
  assert.doesNotMatch(workflow, /run:\s*test "\$\{\{ inputs\.confirmacao \}\}" = "PUBLICAR"/);
});
