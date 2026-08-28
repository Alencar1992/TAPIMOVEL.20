const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");
const css = fs.readFileSync(path.join(root, "frontend/eliel.css"), "utf8");

test("gráfico do Relatório Eliel mantém duas escalas independentes", () => {
  assert.match(eliel, /const maxQuantidade = Math\.max\(/);
  assert.match(eliel, /const maxFaturamento = Math\.max\(/);
  assert.match(eliel, /function rotuloEscalaReais\(/);
  assert.match(eliel, /Unidades · eixo esquerdo/);
  assert.match(eliel, /Faturamento · eixo direito/);
  assert.match(eliel, />Unidades<\/text>/);
  assert.match(eliel, />Faturamento<\/text>/);
  assert.match(eliel, /rotuloEscalaReais\(faturamento\)/);
});

test("gráfico preserva acessibilidade de barras, pontos e SVG", () => {
  assert.match(eliel, /<g tabindex="0" role="img" aria-label=/);
  assert.match(eliel, /<circle[^>]*tabindex="0" role="img" aria-label=/);
  assert.match(eliel, /<svg[^>]*role="img" aria-label="Gráfico de unidades vendidas e faturamento/);
  assert.match(eliel, /<title>\$\{escapar\(descricao\)\}<\/title>/);
});

test("gráfico continua utilizável em desktop e mobile", () => {
  assert.match(css, /\.eliel-grafico svg\s*\{[\s\S]{0,180}width:\s*100%/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.eliel-grafico\s*\{[\s\S]{0,180}overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.eliel-grafico svg\s*\{[\s\S]{0,120}min-width:\s*620px/);
});
