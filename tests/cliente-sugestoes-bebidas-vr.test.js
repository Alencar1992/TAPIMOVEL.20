const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const config = fs.readFileSync('frontend/config.js', 'utf8');
const hotfix = fs.readFileSync('frontend/cliente-hotfix.js', 'utf8');
const propertiesRepository = fs.readFileSync('apps-script/PropertiesRepository.gs', 'utf8');

test('cliente carrega módulo de ajustes com versão explícita', () => {
  assert.match(config, /cliente-hotfix\.js\?v=/);
  assert.match(config, /if \(!paginaTapimovelEhCliente_\(\)\)/);
});

test('sugestão oferece categorias doces e bebidas sem adicionar produto específico', () => {
  assert.match(hotfix, /Tapiocas doces/);
  assert.match(hotfix, /Refrigerante ou Suco/);
  assert.ok(hotfix.includes("abrirCategoriaDaSugestao(\\'doces\\')"));
  assert.ok(hotfix.includes("abrirCategoriaDaSugestao(\\'bebidas\\')"));
  assert.ok(!hotfix.includes('adicionarSugestao('));
});

test('navegar pela sugestão preserva carrinho e não repete sugestão no mesmo pedido', () => {
  const trecho = hotfix.slice(
    hotfix.indexOf('function abrirCategoriaDaSugestao'),
    hotfix.indexOf('function abrirSugestaoPorCategoria_')
  );
  assert.match(trecho, /mudarAba\(categoria/);
  assert.ok(!trecho.includes('carrinho = []'));
  assert.ok(!trecho.includes('carrinho.length = 0'));
  assert.match(hotfix, /sugestaoCategoriasDispensada = true/);
  assert.match(hotfix, /if \(sugestaoCategoriasDispensada\) return false/);
});

test('VR usa valor canônico aceito pelo backend', () => {
  assert.match(hotfix, /VR \(Vale Refeição\)/);
  assert.match(hotfix, /option\.value = "VR \(Vale Refeição\)"/);
});

test('catálogo legado é migrado somente com bebidas controladas pelo servidor', () => {
  assert.match(propertiesRepository, /catalogoTemBebidaGenericaLegada_/);
  assert.match(propertiesRepository, /refri \/ suco - lata/);
  assert.match(propertiesRepository, /function bebidasPadraoServidor_/);
  assert.match(propertiesRepository, /Coca-Cola Zero - LATA/);
  assert.match(propertiesRepository, /catalogoServidor\.bebidas/);
  assert.match(propertiesRepository, /props\.setProperty\(CHAVE_CATALOGO_CARDAPIO_/);
  assert.ok(!propertiesRepository.includes('catalogo.bebidas = padrao.bebidas'));
});
