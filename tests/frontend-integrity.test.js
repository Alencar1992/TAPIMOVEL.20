const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("scripts locais e scripts embutidos compilam", () => {
  const localScripts = [
    "frontend/api-client.js",
    "frontend/catalogo-base.js",
    "frontend/catalogo-runtime.js",
    "frontend/configuracao.js",
    "frontend/eliel.js",
    "frontend/investigador.js"
  ];
  localScripts.forEach(file => {
    new vm.Script(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
  });

  ["frontend/index.html", "frontend/cliente.html"].forEach(file => {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    let count = 0;
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
      if (!match[1].trim()) continue;
      count += 1;
      new vm.Script(match[1], { filename: `${file}#inline-${count}` });
    }
    assert.ok(count > 0);
  });
});

test("administrador e cliente usam o mesmo catálogo inicial", () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(root, "frontend/catalogo-base.js"), "utf8"),
    sandbox
  );
  const catalog = sandbox.window.TapimovelCatalogoBase.criar();
  assert.equal(Object.values(catalog).flat().length, 60);
  assert.equal(catalog.salgadas.find(item => item.nome === "Baiana").preco, 18);

  ["frontend/index.html", "frontend/cliente.html"].forEach(file => {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /src="\.\/catalogo-base\.js"/);
    assert.doesNotMatch(html, /const bdCatalogo = \{/);
  });
});

test("dependências externas têm integridade e não apontam para jsPDF inexistente", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const external = Array.from(
    html.matchAll(/<script src="https:\/\/cdnjs\.cloudflare\.com\/[^"]+"[^>]*><\/script>/g)
  ).map(match => match[0]);
  assert.equal(external.length, 4);
  external.forEach(tag => {
    assert.match(tag, /integrity="sha384-[^"]+"/);
    assert.match(tag, /crossorigin="anonymous"/);
  });
  assert.doesNotMatch(html, /jspdf\/2\.5\.2/);
});

test("regra de pausa diária permanece implementada", () => {
  const code = fs.readFileSync(path.join(root, "apps-script/Code.gs"), "utf8");
  assert.match(
    code,
    /if \(dataPausa !== hoje\) \{[\s\S]*cardapio_itens_indisponiveis", "\[\]"/
  );
});

test("avisos administrativos aguardam a autenticação", () => {
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");
  const index = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");

  assert.doesNotMatch(
    eliel,
    /DOMContentLoaded[\s\S]{0,300}verificarAvisoPdv\(\)/
  );
  assert.match(
    index,
    /function liberarAplicacaoAdmin\(\)[\s\S]{0,600}window\.verificarAvisoPdv\(\)/
  );
});
