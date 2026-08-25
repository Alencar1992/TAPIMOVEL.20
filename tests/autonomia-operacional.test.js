const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");

test("P1 centraliza rotas, horários, Monte Sua e adicionais no backend", () => {
  const code = fs.readFileSync(path.join(root, "apps-script/Code.gs"), "utf8");
  assert.match(code, /CHAVE_CONFIG_OPERACIONAL_/);
  assert.match(code, /function obterConfiguracaoOperacional\(/);
  assert.match(code, /function salvarConfiguracaoOperacional\(/);
  assert.match(code, /const configOperacional = JSON\.parse\(obterConfiguracaoOperacional\(\)\)/);
  assert.match(code, /const valorAdicional = Number\(configOperacional\.adicionais/);
  assert.match(code, /function precoMonteSua_\(nome\)[\s\S]{0,400}obterConfiguracaoOperacional/);
});

test("cardápio consome configuração operacional dinâmica", () => {
  const html = fs.readFileSync(path.join(root, "frontend/cliente.html"), "utf8");
  assert.match(html, /let precosMonteSua = \{/);
  assert.match(html, /let rotasDaSemana = \{/);
  assert.match(html, /function carregarConfiguracaoOperacional\(/);
  assert.match(html, /\.obterConfiguracaoOperacional\(\)/);
  assert.match(html, /Object\.keys\(precosMonteSua\)/);
  assert.match(html, /regraOperacionalDoDia/);
});

test("painel administrativo possui editor operacional", () => {
  const config = fs.readFileSync(path.join(root, "frontend/config-operacional.js"), "utf8");
  const loader = fs.readFileSync(path.join(root, "frontend/configuracao.js"), "utf8");
  assert.match(config, /Configuração operacional/);
  assert.match(config, /salvarConfiguracaoOperacional/);
  assert.match(config, /opMonteLinhas/);
  assert.match(config, /opAdicionaisSalgado/);
  assert.match(loader, /config-operacional\.js/);
});
