const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const config = fs.readFileSync('frontend/config.js', 'utf8');
const hotfix = fs.readFileSync('frontend/cliente-hotfix.js', 'utf8');
const propertiesRepository = fs.readFileSync('apps-script/PropertiesRepository.gs', 'utf8');

test('cliente carrega módulo de ajustes com versão explícita', () => {
  assert.match(config, /cliente-hotfix\.js\?v=/);
  assert.match(config, /paginaTapimovelEhCliente_\(\)/);
});

test('sugestão oferece categorias doces e bebidas sem adicionar produto específico', () => {
  assert.match(hotfix, /Tapiocas doces/);
  assert.match(hotfix, /Refrigerante ou Suco/);
  assert.ok(hotfix.includes("abrirCategoriaDaSugestao(\\'doces\\')"));
  assert.ok(hotfix.includes("abrirCategoriaDaSugestao(\\'bebidas\\')"));
  assert.ok(!hotfix.includes('adicionarSugestao('));
});

test('navegar pela sugestão preserva carrinho existente', () => {
  const trecho = hotfix.slice(
    hotfix.indexOf('function abrirCategoriaDaSugestao'),
    hotfix.indexOf('function abrirSugestaoPorCategoria_')
  );
  assert.match(trecho, /mudarAba\(categoria/);
  assert.ok(!trecho.includes('carrinho = []'));
  assert.ok(!trecho.includes('carrinho.length = 0'));
});

test('VR usa valor canônico aceito pelo backend', () => {
  assert.match(hotfix, /VR \(Vale Refeição\)/);
  assert.match(hotfix, /option\.value = "VR \(Vale Refeição\)"/);
});

test('catálogo legado de bebida genérica é migrado para bebidas específicas', () => {
  assert.match(propertiesRepository, /catalogoTemBebidaGenericaLegada_/);
  assert.match(propertiesRepository, /refri \/ suco - lata/);
  assert.match(propertiesRepository, /padrao\.bebidas\.length > 1/);
  assert.match(propertiesRepository, /catalogo\.bebidas = padrao\.bebidas/);
  assert.match(propertiesRepository, /props\.setProperty\(CHAVE_CATALOGO_CARDAPIO_/);
});
