const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const claspPath = path.join(root, '.clasp.json');
const appsScriptDir = path.join(root, 'apps-script');
const manifestPath = path.join(appsScriptDir, 'appsscript.json');

const EXPECTED_SCRIPT_ID = '1HMoBIVEYDJ6tS6x_7byfiwkQo92caEAa1SJnU0AGYXU933-xm7sO2Bsn';
const REQUIRED_MODULES = [
  'Api.gs',
  'AuthService.gs',
  'Code.gs',
  'FechamentoService.gs',
  'PedidoService.gs',
  'PropertiesRepository.gs',
  'RelatorioElielService.gs',
  'SecurityUtils.gs',
  'SheetsRepository.gs'
];

function fail(message) {
  console.error(`PRE-FLIGHT FALHOU: ${message}`);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${path.relative(root, file)} inválido: ${error.message}`);
  }
}

if (!fs.existsSync(claspPath)) fail('.clasp.json não encontrado.');
if (!fs.existsSync(appsScriptDir)) fail('Diretório apps-script não encontrado.');
if (!fs.existsSync(manifestPath)) fail('apps-script/appsscript.json não encontrado.');

const clasp = readJson(claspPath);
const manifest = readJson(manifestPath);

if (clasp.scriptId !== EXPECTED_SCRIPT_ID) {
  fail(`scriptId inesperado em .clasp.json: ${clasp.scriptId || '(vazio)'}`);
}

if (clasp.rootDir !== 'apps-script') {
  fail(`rootDir precisa ser "apps-script"; recebido: ${clasp.rootDir || '(vazio)'}`);
}

if (manifest.timeZone !== 'America/Sao_Paulo') {
  fail(`timezone do manifest inesperado: ${manifest.timeZone || '(vazio)'}`);
}

if (manifest.runtimeVersion !== 'V8') {
  fail(`runtimeVersion precisa ser V8; recebido: ${manifest.runtimeVersion || '(vazio)'}`);
}

const files = fs.readdirSync(appsScriptDir).sort();
const gsFiles = files.filter(name => name.endsWith('.gs'));

for (const required of REQUIRED_MODULES) {
  if (!gsFiles.includes(required)) fail(`módulo obrigatório ausente: apps-script/${required}`);
}

if (gsFiles.length < REQUIRED_MODULES.length) {
  fail('Quantidade de módulos .gs menor que o conjunto mínimo obrigatório.');
}

const secretCandidates = [
  '.clasprc.json',
  'client_secret.json',
  'credentials.json',
  'oauth-client.json'
];

for (const secretFile of secretCandidates) {
  if (fs.existsSync(path.join(root, secretFile))) {
    fail(`arquivo sensível não pode estar no repositório: ${secretFile}`);
  }
}

const bundle = gsFiles
  .map(name => fs.readFileSync(path.join(appsScriptDir, name), 'utf8'))
  .join('\n\n');

const requiredContracts = [
  'function doGet',
  'function doPost',
  'function loginAcesso',
  'function registrarPedidoOnline',
  'function aceitarPedidoOnline',
  'function registrarPedidoPdv',
  'function obterPreviaFechamentoRelatorioEliel',
  'function fecharMesRelatorioEliel',
  'function obterRelatorioEliel',
  'function registrarAcessoRelatorioEliel',
  'function obterConfiguracoesRelatorioEliel',
  'function salvarConfiguracoesRelatorioEliel',
  'function obterHistoricoVendasEliel',
  'function carregarFilaPdvAtivos_',
  'function carregarFilaPedidosOnlinePendentes_'
];

for (const contract of requiredContracts) {
  if (!bundle.includes(contract)) fail(`contrato backend ausente no bundle: ${contract}`);
}

console.log('Pre-flight Apps Script OK.');
console.log(`Projeto: ${clasp.scriptId}`);
console.log(`rootDir: ${clasp.rootDir}`);
console.log(`Módulos .gs encontrados (${gsFiles.length}): ${gsFiles.join(', ')}`);
