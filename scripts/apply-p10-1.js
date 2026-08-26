const fs = require('fs');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, content) { fs.writeFileSync(path, content, 'utf8'); }
function fail(message) { throw new Error(message); }

const indexPath = 'frontend/index.html';
const jsPath = 'frontend/eliel.js';
const cssPath = 'frontend/eliel.css';

let index = read(indexPath);
let eliel = read(jsPath);
let css = read(cssPath);

if (!index.includes('id="elielFechamentoControle"')) {
  const anchor = '<div id="elielConteudo" hidden>';
  const pos = index.indexOf(anchor);
  if (pos === -1) fail('Âncora elielConteudo não encontrada.');
  const insertAt = pos + anchor.length;
  const panel = `
            <section id="elielFechamentoControle" class="eliel-painel eliel-fechamento-controle">
                <div class="eliel-fechamento-cabecalho">
                    <div>
                        <p class="eliel-kicker">CONTROLE EXCLUSIVO DO CEO ELIEL</p>
                        <h3>Fechamento mensal</h3>
                        <p>Confira o estado do período, pendências e conclua o fechamento sem sair do Relatório Eliel.</p>
                    </div>
                    <strong id="elielFechamentoBadge" class="eliel-fechamento-badge">CONSULTANDO</strong>
                </div>
                <div class="eliel-fechamento-grid">
                    <div><span>Período</span><strong id="elielFechamentoPeriodo">-</strong></div>
                    <div><span>Status</span><strong id="elielFechamentoStatus">Consultando...</strong></div>
                    <div><span>Pedidos pendentes</span><strong id="elielFechamentoPendentes">-</strong></div>
                    <div><span>Operação</span><strong id="elielFechamentoOperacao">-</strong></div>
                </div>
                <p id="elielFechamentoMensagem" class="eliel-fechamento-mensagem">O fechamento sempre exige prévia e confirmação final.</p>
                <div class="eliel-fechamento-acoes eliel-owner-only">
                    <button type="button" class="secundario" onclick="atualizarControleFechamentoEliel()">Atualizar status</button>
                    <button type="button" id="btnFecharMesElielPrincipal" class="perigo" onclick="abrirFechamentoMesEliel()">Revisar e fechar mês</button>
                </div>
                <div class="eliel-fechamento-admin eliel-admin-only">
                    <div>
                        <strong>Fechamento protegido</strong>
                        <span>O administrador pode consultar o relatório, mas somente o perfil CEO Eliel pode concluir o mês.</span>
                    </div>
                    <button type="button" onclick="abrirAcessoElielFechamento()">Entrar como CEO Eliel</button>
                </div>
            </section>`;
  index = index.slice(0, insertAt) + panel + index.slice(insertAt);
}

index = index
  .replace(/eliel\.css\?v=\d{8}\.\d+/g, 'eliel.css?v=20260826.2')
  .replace(/eliel\.js\?v=\d{8}\.\d+/g, 'eliel.js?v=20260826.2');

if (!eliel.includes('let statusFechamentoElielAtual = null;')) {
  eliel = eliel.replace(
    '    let previaFechamentoElielAtual = null;',
    '    let previaFechamentoElielAtual = null;\n    let statusFechamentoElielAtual = null;'
  );
}

if (!eliel.includes('window.atualizarControleFechamentoEliel = function')) {
  const anchor = '    window.abrirFechamentoMesEliel = function () {';
  if (!eliel.includes(anchor)) fail('Âncora abrirFechamentoMesEliel não encontrada.');
  const block = `    function renderizarControleFechamentoEliel(status) {
        statusFechamentoElielAtual = status || {};
        const pendentes = Number(statusFechamentoElielAtual.pedidosPendentes || 0);
        const duplicado = statusFechamentoElielAtual.duplicado === true;
        const recuperavel = statusFechamentoElielAtual.recuperavel === true;
        const badge = document.getElementById("elielFechamentoBadge");
        const botao = document.getElementById("btnFecharMesElielPrincipal");
        const mensagem = document.getElementById("elielFechamentoMensagem");
        if (!badge) return;

        document.getElementById("elielFechamentoPeriodo").textContent =
            statusFechamentoElielAtual.chave || (relatorioElielAtual && relatorioElielAtual.chave) || "-";
        document.getElementById("elielFechamentoPendentes").textContent = String(pendentes);
        document.getElementById("elielFechamentoOperacao").textContent =
            statusFechamentoElielAtual.statusOperacao || (duplicado ? "CONCLUÍDO" : "NÃO INICIADA");

        badge.className = "eliel-fechamento-badge";
        if (duplicado) {
            badge.textContent = "FECHADO";
            badge.classList.add("fechado");
            document.getElementById("elielFechamentoStatus").textContent = "Mês já fechado";
            mensagem.textContent = "Este período já possui fechamento concluído e não pode ser fechado novamente.";
        } else if (recuperavel) {
            badge.textContent = "RECUPERAÇÃO";
            badge.classList.add("recuperavel");
            document.getElementById("elielFechamentoStatus").textContent = "Recuperação segura disponível";
            mensagem.textContent = "Existe uma operação incompleta. O CEO Eliel pode revisar a prévia e continuar com segurança.";
        } else if (pendentes > 0) {
            badge.textContent = "BLOQUEADO";
            badge.classList.add("bloqueado");
            document.getElementById("elielFechamentoStatus").textContent = "Aguardando pedidos";
            mensagem.textContent = "Finalize os pedidos pendentes deste mês antes de concluir o fechamento.";
        } else {
            badge.textContent = "PRONTO";
            badge.classList.add("pronto");
            document.getElementById("elielFechamentoStatus").textContent = "Pronto para conferência";
            mensagem.textContent = "Nenhuma pendência bloqueia o período. Revise a prévia antes da confirmação final.";
        }

        if (botao) {
            botao.disabled = duplicado || pendentes > 0;
            botao.textContent = duplicado
                ? "Mês já fechado"
                : recuperavel ? "Revisar e recuperar fechamento" : "Revisar e fechar mês";
        }
    }

    window.atualizarControleFechamentoEliel = function () {
        if (!relatorioElielAtual) return;
        const mes = Number(document.getElementById("elielMes").value);
        const ano = Number(document.getElementById("elielAno").value);
        const badge = document.getElementById("elielFechamentoBadge");
        if (badge) {
            badge.textContent = "CONSULTANDO";
            badge.className = "eliel-fechamento-badge";
        }
        google.script.run
            .withSuccessHandler(function (resposta) {
                try {
                    const status = JSON.parse(resposta || "{}");
                    previaFechamentoElielAtual = status;
                    renderizarControleFechamentoEliel(status);
                } catch (erro) {
                    mostrarAlerta("Não foi possível interpretar o estado do fechamento.<br><small>" + escapar(erro.message) + "</small>");
                }
            })
            .withFailureHandler(function (erro) {
                if (badge) {
                    badge.textContent = "ERRO";
                    badge.className = "eliel-fechamento-badge bloqueado";
                }
                mostrarAlerta("Não foi possível consultar o fechamento mensal.<br><small>" + escapar(erro.message) + "</small>");
            })
            .obterPreviaFechamentoRelatorioEliel(
                mes,
                ano,
                JSON.stringify(catalogoCompleto())
            );
    };

    window.abrirAcessoElielFechamento = function () {
        window.location.assign("./index.html?acesso=eliel");
    };

`;
  eliel = eliel.replace(anchor, block + anchor);
}

const drawAnchor = '                desenharRelatorioEliel();';
if (!eliel.includes('                desenharRelatorioEliel();\n                atualizarControleFechamentoEliel();')) {
  if (!eliel.includes(drawAnchor)) fail('Âncora desenharRelatorioEliel não encontrada.');
  eliel = eliel.replace(drawAnchor, drawAnchor + '\n                atualizarControleFechamentoEliel();');
}

if (!css.includes('.eliel-fechamento-controle {')) {
  css += `

/* P10.1 · Controle do fechamento mensal no Relatório Eliel */
.eliel-fechamento-controle {
    border-color: rgba(232, 184, 79, .42) !important;
    background:
        radial-gradient(circle at 100% 0%, rgba(232, 184, 79, .12), transparent 36%),
        linear-gradient(135deg, rgba(255,255,255,.055), rgba(255,255,255,.015)),
        rgba(10, 12, 12, .92) !important;
}

.eliel-fechamento-cabecalho {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
}

.eliel-fechamento-cabecalho h3 { margin-bottom: 6px; }
.eliel-fechamento-cabecalho p:last-child {
    margin: 0;
    color: #929a97;
    font-size: .82rem;
    line-height: 1.45;
}

.eliel-fechamento-badge {
    display: inline-flex;
    min-width: 92px;
    justify-content: center;
    padding: 7px 10px;
    border: 1px solid rgba(255,255,255,.16);
    border-radius: 99px;
    color: #d7dcda;
    background: rgba(255,255,255,.055);
    font-size: .7rem;
    letter-spacing: .06em;
}
.eliel-fechamento-badge.pronto { color: #a7ec88; border-color: rgba(126,217,87,.42); background: rgba(126,217,87,.09); }
.eliel-fechamento-badge.fechado { color: #9fd9ff; border-color: rgba(91,170,230,.42); background: rgba(91,170,230,.09); }
.eliel-fechamento-badge.recuperavel { color: #f3cb72; border-color: rgba(232,184,79,.45); background: rgba(232,184,79,.1); }
.eliel-fechamento-badge.bloqueado { color: #ff978e; border-color: rgba(255,107,95,.45); background: rgba(255,107,95,.1); }

.eliel-fechamento-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 9px;
    margin-top: 16px;
}
.eliel-fechamento-grid > div {
    display: grid;
    gap: 6px;
    padding: 13px;
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 13px;
    background: rgba(255,255,255,.028);
}
.eliel-fechamento-grid span { color: #858d88; font-size: .72rem; }
.eliel-fechamento-grid strong { color: #f5f6f3; overflow-wrap: anywhere; }
.eliel-fechamento-mensagem { margin: 13px 0 0; color: #9ca39f; font-size: .78rem; line-height: 1.5; }

.eliel-fechamento-acoes,
.eliel-fechamento-admin {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 9px;
    margin-top: 15px;
}
.eliel-fechamento-acoes button,
.eliel-fechamento-admin button {
    min-height: 44px;
    padding: 0 15px;
    border: 1px solid var(--eliel-line);
    border-radius: 11px;
    background: var(--eliel-surface-2);
    color: #fff;
    font-weight: 750;
    cursor: pointer;
}
.eliel-fechamento-acoes button.perigo { border-color: rgba(255,107,95,.48); background: #b63e3e; }
.eliel-fechamento-acoes button:disabled { opacity: .42; cursor: not-allowed; }
.eliel-fechamento-admin { justify-content: space-between; padding-top: 13px; border-top: 1px solid rgba(255,255,255,.08); }
.eliel-fechamento-admin > div { display: grid; gap: 4px; }
.eliel-fechamento-admin span { color: #929a97; font-size: .78rem; }
.eliel-fechamento-admin button { border-color: rgba(232,184,79,.42); color: var(--eliel-accent); }
.eliel-fechamento-acoes[hidden], .eliel-fechamento-admin[hidden] { display: none !important; }

@media (max-width: 700px) {
    .eliel-fechamento-cabecalho,
    .eliel-fechamento-admin { align-items: stretch; flex-direction: column; }
    .eliel-fechamento-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .eliel-fechamento-acoes { display: grid; grid-template-columns: 1fr; }
    .eliel-fechamento-acoes button,
    .eliel-fechamento-admin button { width: 100%; }
}

@media (max-width: 430px) {
    .eliel-fechamento-grid { grid-template-columns: 1fr; }
}
`;
}

write(indexPath, index);
write(jsPath, eliel);
write(cssPath, css);

const testPath = 'tests/fechamento-eliel-ui.test.js';
const test = `const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('P10.1 torna o fechamento mensal visível no Relatório Eliel', () => {
  const html = read('frontend/index.html');
  assert.match(html, /id="elielFechamentoControle"/);
  assert.match(html, /Fechamento mensal/);
  assert.match(html, /id="elielFechamentoBadge"/);
  assert.match(html, /id="btnFecharMesElielPrincipal"/);
  assert.match(html, /abrirFechamentoMesEliel\(\)/);
});

test('painel mostra estado do fechamento e reutiliza a prévia segura do P9', () => {
  const js = read('frontend/eliel.js');
  assert.match(js, /window\.atualizarControleFechamentoEliel/);
  assert.match(js, /\.obterPreviaFechamentoRelatorioEliel\(/);
  assert.match(js, /pedidosPendentes/);
  assert.match(js, /duplicado/);
  assert.match(js, /recuperavel/);
  assert.match(js, /botao\.disabled = duplicado \|\| pendentes > 0/);
});

test('fechamento continua exclusivo do CEO Eliel e admin recebe rota de acesso protegida', () => {
  const html = read('frontend/index.html');
  const js = read('frontend/eliel.js');
  const api = read('apps-script/Api.gs');
  assert.match(html, /eliel-owner-only/);
  assert.match(html, /eliel-admin-only/);
  assert.match(html, /Entrar como CEO Eliel/);
  assert.match(js, /index\.html\?acesso=eliel/);
  assert.match(api, /action === "fecharMesRelatorioEliel" && sessao\.perfil !== "eliel"/);
  assert.match(api, /PERMISSION_DENIED/);
});

test('P10.1 força atualização dos assets do Relatório Eliel', () => {
  const html = read('frontend/index.html');
  assert.match(html, /eliel\.css\?v=20260826\.2/);
  assert.match(html, /eliel\.js\?v=20260826\.2/);
});
`;
write(testPath, test);

const docPath = 'docs/P10_1_CONTROLE_FECHAMENTO_ELIEL.md';
write(docPath, `# P10.1 — Controle de Fechamento do CEO Eliel\n\n## Objetivo\nTornar o fechamento mensal explícito e controlável dentro do Relatório Eliel, sem alterar a lógica segura criada no P9.\n\n## Mudanças\n- painel destacado de fechamento mensal;\n- status do período via prévia segura existente;\n- exibição de pedidos pendentes, operação e estado do mês;\n- bloqueio visual quando o mês já está fechado ou possui pendências;\n- recuperação segura quando houver operação interrompida;\n- ação de fechamento disponível somente para o perfil CEO Eliel;\n- administrador comum recebe orientação para entrar no acesso protegido do CEO Eliel;\n- cache-bust dos assets do relatório.\n\n## Segurança\nA autorização final continua no backend em Api.gs e FechamentoService.gs. A interface não consegue liberar fechamento para perfil administrador comum.\n\n## Deploy\nApós PR, CI e merge, publicar pelo workflow oficial P8 e executar smoke test sem confirmar um fechamento real.\n`);

console.log('P10.1 aplicado com sucesso.');
