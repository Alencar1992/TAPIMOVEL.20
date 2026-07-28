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
    /function liberarAplicacaoAcesso\(sessao\)[\s\S]{0,900}!acessoEhEliel\(\)[\s\S]{0,200}window\.verificarAvisoPdv\(\)/
  );
});

test("sessão do navegador persiste somente no dia e expira por inatividade", () => {
  const apiClient = fs.readFileSync(
    path.join(root, "frontend/api-client.js"),
    "utf8"
  );
  const index = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");

  assert.match(
    apiClient,
    /localStorage\.setItem\((?:TOKEN_KEY|sessionPrefix \+ "token")/
  );
  assert.doesNotMatch(apiClient, /sessionStorage/);
  assert.match(apiClient, /sessionDay !== getLocalDay\(\)/);
  assert.match(apiClient, /4 \* 60 \* 60 \* 1000/);
  assert.match(apiClient, /\["pointerdown", "keydown", "touchstart"\]/);
  assert.match(index, /expira após 4 horas sem uso/);
});

test("acesso exclusivo do CEO Eliel limita navegação e mantém sessão separada", () => {
  const apiClient = fs.readFileSync(
    path.join(root, "frontend/api-client.js"),
    "utf8"
  );
  const index = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const restricted = fs.readFileSync(
    path.join(root, "frontend/relatorio-eliel.html"),
    "utf8"
  );

  assert.match(restricted, /index\.html\?acesso=eliel/);
  assert.match(apiClient, /"tapimovel_" \+ accessMode \+ "_"/);
  assert.match(apiClient, /TOKEN_PROFILE_KEY/);
  assert.match(index, /CEO Eliel/);
  assert.match(index, /\['view-relatorio-eliel', 'view-itens', 'view-configuracao'\]/);
  assert.match(index, /\.loginAcesso\(pin, modoAcessoEsperado\)/);
  assert.match(index, /class="[^"]*eliel-admin-only[^"]*"[^>]*>Fechar e zerar mês/);
});

test("PIN do CEO Eliel no PDV preserva a sessão restrita e redireciona", () => {
  const apiClient = fs.readFileSync(
    path.join(root, "frontend/api-client.js"),
    "utf8"
  );
  const index = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");

  assert.match(apiClient, /session\.perfil === "eliel" \? "eliel" : accessMode/);
  assert.match(apiClient, /sessionPrefix \+ "token"/);
  assert.match(
    index,
    /modoAcessoEsperado === 'admin' && sessao && sessao\.perfil === 'eliel'/
  );
  assert.match(index, /window\.location\.replace\('\.\/relatorio-eliel\.html\?origem=pdv'\)/);
});

test("configuração usa identidade CEO Eliel sem solicitar nome manual", () => {
  const configuracao = fs.readFileSync(
    path.join(root, "frontend/configuracao.js"),
    "utf8"
  );
  assert.match(configuracao, /sessao\.perfil === "eliel"/);
  assert.match(configuracao, /responsavelAtual = "CEO Eliel"/);
});
