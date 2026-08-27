const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));

function fail(message) {
  console.error(`AUDITORIA FINAL FALHOU: ${message}`);
  process.exit(1);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function listFiles(dir, prefix = '') {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory()
      ? listFiles(path.join(dir, entry.name), relative)
      : [relative];
  });
}

const clasp = JSON.parse(read('.clasp.json'));
const manifest = JSON.parse(read('apps-script/appsscript.json'));
const packageJson = JSON.parse(read('package.json'));
const deploy = read('.github/workflows/deploy-apps-script.yml');
const quality = read('.github/workflows/quality.yml');
const api = read('apps-script/Api.gs');
const fechamento = read('apps-script/FechamentoService.gs');
const diario = read('apps-script/FechamentoDiarioService.gs');
const cache = read('apps-script/ReadCacheService.gs');
const apiClient = read('frontend/api-client.js');
const frontendConfig = read('frontend/config.js');
const code = read('apps-script/Code.gs');

const expectedScriptId = '1HMoBIVEYDJ6tS6x_7byfiwkQo92caEAa1SJnU0AGYXU933-xm7sO2Bsn';
const expectedApiDeployment = 'AKfycbwupkSzv-H0qucPvVdvpQ85ytmNDu8_DOgPnakTY5lwIQ1jDCpuGqCvfvAMSIuMRL6f';

expect(clasp.scriptId === expectedScriptId, 'scriptId oficial foi alterado.');
expect(clasp.rootDir === 'apps-script', 'rootDir do clasp deixou de ser apps-script.');
expect(manifest.timeZone === 'America/Sao_Paulo', 'timezone do Apps Script foi alterado.');
expect(manifest.runtimeVersion === 'V8', 'runtime do Apps Script deixou de ser V8.');

const requiredModules = [
  'Api.gs', 'AuthService.gs', 'Code.gs', 'CoreUtils.gs',
  'FechamentoDiarioService.gs', 'FechamentoService.gs', 'PedidoService.gs',
  'PropertiesRepository.gs', 'ReadCacheService.gs', 'RelatorioElielService.gs',
  'SecurityUtils.gs', 'SheetsRepository.gs'
];
for (const module of requiredModules) {
  expect(exists(path.posix.join('apps-script', module)), `módulo obrigatório ausente: ${module}`);
}

for (const secret of ['.clasprc.json', 'client_secret.json', 'credentials.json', 'oauth-client.json']) {
  expect(!exists(secret), `arquivo sensível presente no repositório: ${secret}`);
}

const workflowFiles = listFiles('.github/workflows', '.github/workflows');
const scriptFiles = listFiles('scripts', 'scripts');
expect(
  !workflowFiles.some(file => /\/p\d+(?:[-_.]\d+)*-aplicar\.ya?ml$/i.test(file)),
  'workflow temporário de aplicação P* permaneceu no repositório.'
);
expect(
  !scriptFiles.some(file => /\/apply-p\d+(?:[-_.]\d+)*\.js$/i.test(file)),
  'script temporário apply-p* permaneceu no repositório.'
);

expect(/workflow_dispatch:/.test(deploy), 'deploy de produção deixou de ser manual.');
expect(!/^\s*push:/m.test(deploy), 'deploy de produção não pode disparar por push.');
expect(!/^\s*pull_request:/m.test(deploy), 'deploy de produção não pode disparar por pull request.');
expect(/environment:\s*apps-script-production/.test(deploy), 'environment protegido de produção ausente.');
expect(/PUBLICAR/.test(deploy), 'confirmação PUBLICAR ausente do deploy.');
expect(/npm run ci/.test(deploy) && /npm run deploy:validate/.test(deploy), 'deploy não revalida CI/preflight.');
expect(/push --force/.test(deploy), 'clasp push protegido ausente.');
expect(/update-deployment/.test(deploy), 'deploy não atualiza deployment existente.');
expect(!/create-deployment/.test(deploy), 'deploy não pode criar deployment novo.');
expect(/APPS_SCRIPT_DEPLOYMENT_ID/.test(deploy), 'secret do deployment de produção ausente do workflow.');

expect(/run:\s*npm run ci/.test(quality), 'workflow oficial validar deixou de executar npm run ci.');
expect(packageJson.scripts && packageJson.scripts.ci && packageJson.scripts.ci.includes('audit:final'), 'auditoria final não está acoplada ao CI.');

for (const forbidden of ['Pedidos_Ativos', 'Pedidos_Online_Pendentes', 'Controle_Operacoes']) {
  expect(!cache.includes(`"${forbidden}"`), `fonte crítica entrou no cache analítico: ${forbidden}`);
}
for (const allowed of ['Historico_Diario', 'Fechamentos_Diarios', 'Tapiocas Diária', 'Combustivel']) {
  expect(cache.includes(`"${allowed}"`), `fonte analítica esperada ausente do cache controlado: ${allowed}`);
}
expect(/CACHE_LEITURA_ANALITICA_TTL_\s*=\s*30/.test(cache), 'TTL analítico deixou de ser 30 segundos.');
expect(/invalidarCachesAnaliticos_\(\)/.test(fechamento), 'fechamento mensal não força leitura fresca antes da prévia.');

expect(/action === "fecharMesRelatorioEliel" && sessao\.perfil !== "eliel"/.test(api), 'fechamento mensal perdeu a barreira exclusiva do CEO Eliel.');
expect(/O fechamento mensal é exclusivo do perfil CEO Eliel/.test(fechamento), 'serviço de fechamento mensal perdeu a validação de perfil.');
expect(/function fecharDiaSeguro\s*\(/.test(diario), 'fechamento diário seguro ausente.');
expect(/validarPersistenciaFechamentoDiario_\(resumo\)/.test(diario), 'fechamento diário não valida persistência.');
expect(/removerSomentePedidosDoDiaFechado_/.test(diario), 'fechamento diário não limita a limpeza ao dia fechado.');

const safePattern = apiClient.match(/var SAFE_READ_ACTION_PATTERN = ([^;]+);/);
expect(Boolean(safePattern), 'classificação de leitura segura do frontend ausente.');
for (const forbidden of ['login', 'salvar', 'registrar', 'atualizar', 'excluir', 'remover', 'fechar', 'aceitar', 'recusar']) {
  expect(!safePattern[1].includes(forbidden), `ação de escrita/autenticação reapareceu no retry seguro: ${forbidden}`);
}
expect(/pendingReadRequests/.test(apiClient), 'deduplicação somente em voo das leituras foi removida.');
expect(/ACTIVITY_PERSIST_INTERVAL_MS\s*=\s*30000/.test(apiClient), 'throttle de atividade do navegador foi alterado.');

expect(frontendConfig.includes(expectedApiDeployment), 'frontend deixou de apontar para o deployment oficial esperado.');
expect(/if \(!paginaTapimovelEhCliente_\(\)\)/.test(frontendConfig), 'cardápio cliente voltou a carregar módulos administrativos.');

expect(!/function include\s*\(/.test(code), 'helper HtmlService legado include() reapareceu.');
expect(!/function salvarMultiplosFechamentos\s*\(/.test(code), 'endpoint morto salvarMultiplosFechamentos reapareceu.');
expect(!api.includes('"salvarMultiplosFechamentos"'), 'allowlist voltou a expor endpoint morto.');
expect(/function salvarFechamentoDiaPlanilha\s*\(/.test(code), 'fallback compatível do fechamento diário único foi removido prematuramente.');

console.log('AUDITORIA FINAL OK');
console.log(`Apps Script oficial: ${clasp.scriptId}`);
console.log(`Módulos obrigatórios: ${requiredModules.length}`);
console.log(`Workflows verificados: ${workflowFiles.length}`);
console.log('Controles: deploy manual, cache seguro, fechamento protegido, frontend sem retry de escrita e legado crítico limpo.');
