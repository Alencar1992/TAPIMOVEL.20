const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const INDEX = 'frontend/index.html';
const CLIENTE = 'frontend/cliente.html';
const CONFIG = 'frontend/config.js';
const LOADER = 'frontend/loader-tapi-tudo.js';
const ASSET = 'frontend/assets/loading/tapi_tudo_loader_animado.webp';
const ASSET_LEGADO = 'frontend/assets/loading/tapi-tudo-loader.webp';

test('Tapi-Tudo usa o mesmo cache-buster no PDV e no cardápio', () => {
  const index = read(INDEX);
  const cliente = read(CLIENTE);
  const config = read(CONFIG);
  const loader = read(LOADER);

  assert.match(index, /<script src="\.\/config\.js\?v=20260828\.3"><\/script>/);
  assert.match(cliente, /<script src="\.\/config\.js\?v=20260828\.3"><\/script>/);
  assert.match(config, /carregarLoaderTapiTudoGlobal[\s\S]*?const versao = "20260828\.3"/);
  assert.match(loader, /tapi_tudo_loader_animado\.webp\?v=20260828\.3/);
});

test('Tapi-Tudo mantém um único WebP oficial e íntegro', () => {
  const assetPath = path.join(root, ASSET);
  const legadoPath = path.join(root, ASSET_LEGADO);

  assert.ok(fs.existsSync(assetPath), 'WebP oficial da Tapi-Tudo precisa existir');
  assert.equal(fs.existsSync(legadoPath), false, 'WebP duplicado/legado deve permanecer removido');

  const stat = fs.statSync(assetPath);
  assert.ok(stat.size >= 300000, `WebP oficial parece truncado: ${stat.size} bytes`);

  const header = fs.readFileSync(assetPath).subarray(0, 12);
  assert.equal(header.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(header.subarray(8, 12).toString('ascii'), 'WEBP');
});

test('Tapi-Tudo preserva fallback seguro para o taco legado', () => {
  const loader = read(LOADER);
  assert.match(loader, /querySelector\("\.taco-prep-animation"\)/);
  assert.match(loader, /imagem\.addEventListener\("load"/);
  assert.match(loader, /imagem\.addEventListener\("error"/);
  assert.match(loader, /fallback\.style\.removeProperty\("display"\)/);
});
