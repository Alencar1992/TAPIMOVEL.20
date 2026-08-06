const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("scripts locais e scripts embutidos compilam", () => {
  const localScripts = [
    "frontend/api-client.js",
    "frontend/vendor-loader.js",
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

test("interface administrativa força arquivos compatíveis e remove adicional legado", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const catalogo = fs.readFileSync(path.join(root, "frontend/catalogo-runtime.js"), "utf8");
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");

  assert.match(html, /catalogo-runtime\.js\?v=20260806\.1/);
  assert.match(html, /eliel\.css\?v=20260806\.1/);
  assert.match(html, /eliel\.js\?v=20260806\.1/);
  assert.match(catalogo, /ehAdicionalLegado/);
  assert.match(catalogo, /normalizarBusca\(item && item\.nome\) === "\+ adicional"/);
  assert.match(eliel, /normalizarBusca\(item && item\.nome\) !== "\+ adicional"/);
});

test("dependências externas carregam somente sob demanda e mantêm integridade", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const loader = fs.readFileSync(path.join(root, "frontend/vendor-loader.js"), "utf8");
  assert.doesNotMatch(html, /<script src="https:\/\/cdnjs\.cloudflare\.com/);
  assert.match(html, /src="\.\/vendor-loader\.js"/);
  assert.equal((loader.match(/integrity: "sha384-/g) || []).length, 3);
  assert.match(loader, /script\.crossOrigin = "anonymous"/);
  assert.doesNotMatch(loader, /jspdf\/2\.5\.2/);
  assert.doesNotMatch(loader, /autotable/);
});

test("cliente da API tolera instabilidade sem repetir operações de escrita", () => {
  const apiClient = fs.readFileSync(path.join(root, "frontend/api-client.js"), "utf8");
  assert.match(apiClient, /REQUEST_TIMEOUT_MS = 25000/);
  assert.match(apiClient, /SAFE_RETRY_LIMIT = 1/);
  assert.match(apiClient, /SAFE_ACTION_PATTERN/);
  assert.match(apiClient, /response\.status === 404/);
  assert.match(apiClient, /controller\.abort\(\)/);
  assert.match(apiClient, /tapimovel:connection/);
  assert.match(apiClient, /Sem internet no aparelho/);
});

test("login inicia sem aguardar bibliotecas e mídias externas", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  assert.match(html, /DOMContentLoaded', iniciarAutenticacaoAdmin/);
  assert.doesNotMatch(html, /window\.onload = iniciarAutenticacaoAdmin/);
  assert.equal((html.match(/preload="none"/g) || []).length, 2);
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
  assert.match(index, /class="[^"]*eliel-owner-only[^"]*"[^>]*>Revisar e fechar mês/);
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

test("Relatório Eliel premium mantém indicadores interativos e gráficos responsivos", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "frontend/eliel.css"), "utf8");

  assert.match(html, /Resumo de lucros do mês/);
  assert.match(html, /alternarDetalheMetricaEliel\('taxas'/);
  assert.match(html, /mudarGraficoEliel\('semana'/);
  assert.match(eliel, /detalhesTaxas/);
  assert.match(eliel, /combustivelTrailer/);
  assert.match(eliel, /mesesComparacao/);
  assert.match(css, /backdrop-filter:\s*blur/);
  assert.match(css, /\.eliel-podio/);
  assert.match(css, /@media \(max-width: 430px\)/);
});

test("fechamento mensal é exclusivo do Relatório Eliel e exige prévia", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");
  const backend = fs.readFileSync(path.join(root, "apps-script/Code.gs"), "utf8");

  assert.match(html, /Prévia do fechamento mensal/);
  assert.match(html, /Confirmar e zerar mês/);
  assert.match(html, /id="previaElielCombustivelTotal"/);
  assert.match(html, /Combustível total · 100%/);
  assert.match(html, /Liquidez Mensal · consulta/);
  assert.doesNotMatch(html, /Fechar Mês \(Drive\)/);
  assert.doesNotMatch(html, /function confirmarFechamentoMes\(/);
  assert.doesNotMatch(backend, /function fecharMesESalvarDrive\(/);
  assert.match(eliel, /\.obterPreviaFechamentoRelatorioEliel\(/);
  assert.match(
    eliel,
    /previaElielCombustivelTotal"\)\.textContent = moeda\(custos\.combustivelTotal\)/
  );
  assert.match(eliel, /\.fecharMesRelatorioEliel\(\s*mes,\s*ano,/);
  assert.match(backend, /O fechamento mensal é exclusivo do perfil CEO Eliel/);
  assert.match(backend, /pedidosPendentes/);
  assert.match(backend, /obterAbaFechamentosMensais_/);
  assert.match(backend, /Responsável/);
});

test("gestão de itens usa pausa de 2 segundos, busca completa e ações em massa", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");
  const config = fs.readFileSync(path.join(root, "frontend/configuracao.js"), "utf8");
  const catalogo = fs.readFileSync(path.join(root, "frontend/catalogo-runtime.js"), "utf8");

  assert.match(html, /DURACAO_PRESSAO_ITEM = 2000/);
  assert.match(eliel, /DURACAO_PRESSAO_GESTAO_ITEM = 2000/);
  assert.match(html, /id="itensAcoesMassa"/);
  assert.match(eliel, /definirEstadoResultadosItens/);
  assert.match(eliel, /item-switch/);
  assert.match(eliel, /correspondeBusca\(item, busca\)/);
  assert.match(config, /correspondeBusca\(item, busca, categorias\[item\.categoria\]\)/);
  assert.match(catalogo, /normalize\("NFD"\)/);
  assert.match(catalogo, /item && item\.ing/);

  const sandbox = { window: {}, CustomEvent: function () {} };
  vm.createContext(sandbox);
  vm.runInContext(catalogo, sandbox);
  assert.equal(sandbox.window.TapimovelCatalogo.normalizarBusca("MUÇARELA"), "mucarela");
  assert.equal(
    sandbox.window.TapimovelCatalogo.correspondeBusca(
      { nome: "Caipira II", ing: "Frango, catupiry e milho" },
      "frango"
    ),
    true
  );
});

test("adicionais pagos ficam vinculados à tapioca e respeitam a categoria", () => {
  const html = fs.readFileSync(path.join(root, "frontend/index.html"), "utf8");
  const eliel = fs.readFileSync(path.join(root, "frontend/eliel.js"), "utf8");
  const backend = fs.readFileSync(path.join(root, "apps-script/Code.gs"), "utf8");

  assert.match(html, /id="listaAdicionais"/);
  assert.doesNotMatch(html, /id="inputDescAdicional"/);
  assert.match(eliel, /const PRECO_ADICIONAL = 4/);
  assert.match(eliel, /const adicionaisSalgados/);
  assert.match(eliel, /const adicionaisDoces/);
  assert.match(eliel, /item\.precoBase \+ item\.adicionais\.length \* PRECO_ADICIONAL/);
  assert.match(html, /item\.adicionais\.map\(escaparHtml\)/);
  assert.match(backend, /adicionaisPermitidos/);
  assert.match(backend, /precoBase \+ adicionais\.length \* 4/);
});

test("cardápio do cliente usa as rotas atualizadas e endereço completo obrigatório", () => {
  const cliente = fs.readFileSync(path.join(root, "frontend/cliente.html"), "utf8");

  assert.doesNotMatch(cliente, /JD VAZ DE LIMA/);
  assert.match(cliente, /5: \["JD SOUZA", "COPACABANA", "TUPI"\]/);
  assert.match(cliente, /id="cliEndereco"/);
  assert.match(cliente, /id="cliNum"/);
  assert.match(cliente, /if\(!endereco\)/);
  assert.match(cliente, /if\(!num\)/);
  assert.match(cliente, /id="resumoEnderecoPedido"/);
  assert.match(cliente, /enderecoCliente: rotaFinal/);
  assert.match(cliente, /selectRota \+ " \| " \+ endereco \+ ", Nº " \+ num/);
});
