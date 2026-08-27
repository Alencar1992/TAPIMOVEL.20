const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, content) => fs.writeFileSync(path.join(root, rel), content, 'utf8');

function functionRange(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Função não encontrada: ${name}`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) { if (ch === '\n') lineComment = false; continue; }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++; } continue; }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return { start, end: i + 1 };
    }
  }
  throw new Error(`Fim da função não encontrado: ${name}`);
}

function replaceFunction(source, name, replacement) {
  const range = functionRange(source, name);
  return source.slice(0, range.start) + replacement + source.slice(range.end);
}

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: esperado 1 match, encontrado ${count}`);
  return source.replace(before, after);
}

let cliente = read('frontend/cliente.html');
const legadoCliente = `            if (novoPedido.itens.length > 0) {\n                let obsAntiga = novoPedido.itens[0].obs || \"\";\n                novoPedido.itens[0].obs = \`🟢 CLI: \${nome} | 📍 \${rotaFinal} | 💳 \${pagamentoFinal} \${obsAntiga ? ' | OBS: ' + obsAntiga : ''}\`;\n            }\n\n`;
if (!cliente.includes(legadoCliente)) throw new Error('Bloco legado que mistura cliente na observação não encontrado.');
cliente = cliente.replace(legadoCliente, '');
write('frontend/cliente.html', cliente);

let index = read('frontend/index.html');

index = replaceOnce(
  index,
  `        .pedido-online-card { background:var(--stat-bg); border:1px solid var(--border); border-left:5px solid #7c3aed; border-radius:10px; padding:15px; margin-bottom:12px; }`,
  `        .pedido-online-card { background:var(--stat-bg); border:1px solid var(--border); border-left:5px solid #7c3aed; border-radius:10px; padding:15px; margin-bottom:12px; }\n        .pedido-online-itens { display:grid; gap:10px; margin:12px 0; }\n        .pedido-online-item { background:#182126; border:1px solid var(--border); border-radius:8px; padding:10px 12px; }\n        .pedido-online-item-titulo { font-size:1.05rem; font-weight:800; line-height:1.35; }\n        .pedido-online-obs { margin-top:7px; padding-top:7px; border-top:1px dashed #5b4a16; color:#ffd43b; font-weight:800; line-height:1.35; }\n        .pedido-online-cliente,.pedido-producao-cliente { margin:12px 0; padding:12px; border-radius:8px; background:#171b1e; border:1px solid #3a4045; display:grid; gap:6px; }\n        .pedido-online-dado { display:grid; grid-template-columns:110px minmax(0,1fr); gap:8px; align-items:start; line-height:1.35; }\n        .pedido-online-dado strong { color:#aab2b8; }\n        .pedido-producao-cliente { margin-top:12px; border-left:4px solid #339af0; }\n        .alerta-online-fixo { position:fixed; left:12px; right:12px; top:12px; z-index:5000; max-width:560px; margin:0 auto; background:#5f21b6; color:white; border:2px solid #c4a7ff; border-radius:12px; padding:14px; box-shadow:0 10px 30px rgba(0,0,0,.5); animation:piscarPedidosOnline 1s infinite; }\n        .alerta-online-fixo-acoes { display:flex; gap:8px; margin-top:10px; }\n        .alerta-online-fixo button { flex:1; padding:10px; border:0; border-radius:7px; font-weight:800; cursor:pointer; }\n        @media (max-width:520px) { .pedido-online-dado { grid-template-columns:1fr; gap:2px; } }`,
  'CSS de pedidos online'
);

index = replaceOnce(
  index,
  `        let pedidosOnlinePendentes = []; let totalOnlineAnterior = 0; let campainhaOnlineAtiva = false;`,
  `        let pedidosOnlinePendentes = []; let totalOnlineAnterior = 0; let campainhaOnlineAtiva = true; let codigosOnlineAlertados = new Set(); let contextoAudioOnline = null; let wakeLockOnline = null;`,
  'estado de alertas online'
);

index = replaceOnce(
  index,
  `            <button id=\"btnAtivarCampainha\" class=\"btn-acao\" style=\"width:auto;background:#7c3aed;\" onclick=\"ativarCampainhaOnline()\">🔔 Ativar campainha</button>`,
  `            <button id=\"btnAtivarCampainha\" class=\"btn-acao\" style=\"width:auto;background:#7c3aed;\" onclick=\"ativarCampainhaOnline()\">🔔 Ativar alertas de venda</button>`,
  'botão de alertas online'
);

const helpers = `        function limparObsLegadaOnlineTela(valor) {\n            const texto = String(valor || '').trim();\n            if (!texto || texto.indexOf('🟢 CLI:') === -1) return texto;\n            const marcador = texto.lastIndexOf('| OBS:');\n            return marcador >= 0 ? texto.slice(marcador + 6).trim() : '';\n        }\n\n        function separarEnderecoOnlineTela(valor) {\n            const partes = String(valor || '').split('|').map(function(parte) { return parte.trim(); }).filter(Boolean);\n            if (partes.length >= 2) return { bairro: partes.shift(), endereco: partes.join(' | ') };\n            return { bairro: 'Não informado', endereco: partes[0] || 'Não informado' };\n        }\n\n        function renderizarBlocoClienteOnline(pedido, classeExtra) {\n            const endereco = separarEnderecoOnlineTela(pedido && pedido.enderecoCliente);\n            return \`<div class=\"pedido-online-cliente \${classeExtra || ''}\">\n                <div class=\"pedido-online-dado\"><strong>👤 Cliente</strong><span>\${escaparHtml(pedido && pedido.nomeCliente || 'Não informado')}</span></div>\n                <div class=\"pedido-online-dado\"><strong>📍 Bairro</strong><span>\${escaparHtml(endereco.bairro)}</span></div>\n                <div class=\"pedido-online-dado\"><strong>🏠 Endereço</strong><span>\${escaparHtml(endereco.endereco)}</span></div>\n                <div class=\"pedido-online-dado\"><strong>💳 Pagamento</strong><span>\${escaparHtml(pedido && pedido.pagamentoDesejado || 'Não informado')}</span></div>\n            </div>\`;\n        }\n\n        function chavePedidoOnlineAlerta(pedido) {\n            return String(pedido && pedido.codigoOnline || '') + ':' + String(pedido && pedido.timestampCriacao || '');\n        }\n\n        function prepararAudioOnline() {\n            try {\n                const AudioCtx = window.AudioContext || window.webkitAudioContext;\n                if (!AudioCtx) return false;\n                if (!contextoAudioOnline) contextoAudioOnline = new AudioCtx();\n                if (contextoAudioOnline.state === 'suspended') contextoAudioOnline.resume().catch(function() {});\n                return true;\n            } catch (_) { return false; }\n        }\n\n        function tocarSinoOnline() {\n            const audio = document.getElementById('somCampainha');\n            if (audio) {\n                audio.volume = 1;\n                audio.currentTime = 0;\n                audio.play().catch(function() {});\n            }\n            if (!prepararAudioOnline() || !contextoAudioOnline) return;\n            const agora = contextoAudioOnline.currentTime;\n            [0, .22, .48].forEach(function(atraso, indice) {\n                const osc = contextoAudioOnline.createOscillator();\n                const ganho = contextoAudioOnline.createGain();\n                osc.type = 'sine';\n                osc.frequency.value = indice === 1 ? 1175 : 880;\n                ganho.gain.setValueAtTime(0.0001, agora + atraso);\n                ganho.gain.exponentialRampToValueAtTime(0.28, agora + atraso + .02);\n                ganho.gain.exponentialRampToValueAtTime(0.0001, agora + atraso + .18);\n                osc.connect(ganho); ganho.connect(contextoAudioOnline.destination);\n                osc.start(agora + atraso); osc.stop(agora + atraso + .2);\n            });\n        }\n\n        function ativarWakeLockOnline() {\n            if (!navigator.wakeLock || document.visibilityState !== 'visible') return;\n            navigator.wakeLock.request('screen').then(function(lock) { wakeLockOnline = lock; }).catch(function() {});\n        }\n\n        function removerAlertaOnlineFixo() {\n            const alerta = document.getElementById('alertaNovoPedidoOnline');\n            if (alerta) alerta.remove();\n        }\n\n        function mostrarAlertaOnlineFixo(pedidos) {\n            removerAlertaOnlineFixo();\n            const alerta = document.createElement('div');\n            alerta.id = 'alertaNovoPedidoOnline';\n            alerta.className = 'alerta-online-fixo';\n            const primeiro = pedidos[0] || {};\n            alerta.innerHTML = \`<strong style=\"font-size:1.15rem;\">🔔 NOVO PEDIDO ONLINE</strong>\n                <div style=\"margin-top:5px;\">\${pedidos.length > 1 ? pedidos.length + ' pedidos aguardando' : escaparHtml(primeiro.codigoOnline || 'Pedido novo') + ' aguardando aceite'}</div>\n                <div class=\"alerta-online-fixo-acoes\">\n                    <button style=\"background:#fff;color:#51239a;\" onclick=\"removerAlertaOnlineFixo();mudarTela('view-pedidos-online')\">📲 Abrir pedidos</button>\n                    <button style=\"background:#2d164c;color:#fff;\" onclick=\"removerAlertaOnlineFixo()\">Fechar</button>\n                </div>\`;\n            document.body.appendChild(alerta);\n        }\n\n        function notificarPedidoOnlineNativo(pedido) {\n            if (!('Notification' in window) || Notification.permission !== 'granted') return;\n            try {\n                const notificacao = new Notification('🔔 Novo pedido online', {\n                    body: String(pedido && pedido.codigoOnline || 'Pedido novo') + ' · ' + String(pedido && pedido.nomeCliente || 'Cliente'),\n                    icon: './assets/logo-expresso-tapiocaria.png',\n                    tag: chavePedidoOnlineAlerta(pedido),\n                    renotify: true,\n                    requireInteraction: true\n                });\n                notificacao.onclick = function() {\n                    window.focus(); removerAlertaOnlineFixo(); mudarTela('view-pedidos-online'); notificacao.close();\n                };\n            } catch (_) {}\n        }\n\n        function alertarNovosPedidosOnline(pedidos) {\n            if (!pedidos || !pedidos.length) return;\n            tocarSinoOnline();\n            setTimeout(tocarSinoOnline, 900);\n            if (navigator.vibrate) navigator.vibrate([350, 120, 350, 120, 650]);\n            pedidos.forEach(notificarPedidoOnlineNativo);\n            mostrarAlertaOnlineFixo(pedidos);\n            const btn = document.getElementById('btnTopoOnline');\n            if (btn) btn.classList.add('tem-pedidos');\n        }\n\n        document.addEventListener('pointerdown', function prepararAlertasNaPrimeiraInteracao() {\n            prepararAudioOnline();\n            ativarWakeLockOnline();\n            document.removeEventListener('pointerdown', prepararAlertasNaPrimeiraInteracao, true);\n        }, true);\n        document.addEventListener('visibilitychange', function() {\n            if (campainhaOnlineAtiva && document.visibilityState === 'visible') ativarWakeLockOnline();\n        });\n\n`;
const markerAtivar = `        function ativarCampainhaOnline() {`;
if (!index.includes(markerAtivar)) throw new Error('Ponto de inserção dos helpers não encontrado.');
index = index.replace(markerAtivar, helpers + markerAtivar);

index = replaceFunction(index, 'ativarCampainhaOnline', `function ativarCampainhaOnline() {\n            campainhaOnlineAtiva = true;\n            prepararAudioOnline();\n            tocarSinoOnline();\n            if (navigator.vibrate) navigator.vibrate([120, 80, 120]);\n            ativarWakeLockOnline();\n            const btn = document.getElementById('btnAtivarCampainha');\n            if ('Notification' in window && Notification.permission === 'default') {\n                Notification.requestPermission().then(function(permissao) {\n                    if (btn) btn.textContent = permissao === 'granted' ? '🔔 Alertas ativos' : '🔔 Sino e vibração ativos';\n                    mostrarToast(permissao === 'granted' ? '🔔 Som, vibração e notificações ativados.' : '🔔 Som e vibração ativos. A notificação do navegador está bloqueada.');\n                }).catch(function() {\n                    if (btn) btn.textContent = '🔔 Sino e vibração ativos';\n                });\n            } else {\n                if (btn) btn.textContent = Notification && Notification.permission === 'granted' ? '🔔 Alertas ativos' : '🔔 Sino e vibração ativos';\n                mostrarToast('🔔 Alertas de pedidos online ativados.');\n            }\n        }`);

index = replaceFunction(index, 'renderizarPedidosOnline', `function renderizarPedidosOnline() {\n            const lista = document.getElementById('listaPedidosOnline');\n            if (!lista) return;\n            if (!pedidosOnlinePendentes.length) {\n                lista.innerHTML = '<p style=\"color:var(--text-muted);\">Nenhum pedido online aguardando confirmação.</p>';\n                return;\n            }\n            lista.innerHTML = pedidosOnlinePendentes.map(function(pedido) {\n                const itens = (pedido.itens || []).map(function(item) {\n                    const obs = limparObsLegadaOnlineTela(item.obs);\n                    return \`<div class=\"pedido-online-item\">\n                        <div class=\"pedido-online-item-titulo\">\${Number(item.quantidade) || 0}x \${escaparHtml(item.nome)}</div>\n                        \${obs ? '<div class=\"pedido-online-obs\">📝 OBS: ' + escaparHtml(obs) + '</div>' : ''}\n                    </div>\`;\n                }).join('');\n                return \`<article class=\"pedido-online-card\">\n                    <div class=\"pedido-online-topo\"><strong>\${escaparHtml(pedido.codigoOnline)}</strong><span>🕐 \${escaparHtml(pedido.hora || '')}</span></div>\n                    <div class=\"pedido-online-itens\">\${itens}</div>\n                    \${renderizarBlocoClienteOnline(pedido, '')}\n                    <div style=\"font-size:1.15rem;font-weight:800;margin:12px 0;\">Total: \${formatarMoeda(Number(pedido.total) || 0)}</div>\n                    <div class=\"pedido-online-acoes\">\n                        <button style=\"background:var(--success);color:#fff;\" onclick=\"aceitarPedidoOnlineTela('\${escaparHtml(pedido.codigoOnline)}')\">✅ Aceitar e enviar à fila</button>\n                        <button style=\"background:var(--danger);color:#fff;\" onclick=\"recusarPedidoOnlineTela('\${escaparHtml(pedido.codigoOnline)}')\">❌ Recusar pedido</button>\n                    </div>\n                </article>\`;\n            }).join('');\n            const tela = document.getElementById('view-pedidos-online');\n            if (tela && tela.classList.contains('active')) removerAlertaOnlineFixo();\n        }`);

index = replaceOnce(
  index,
  `                    if (campainhaOnlineAtiva && novos.length > totalOnlineAnterior) {\n                        const audio = document.getElementById('somCampainha');\n                        if (audio) { audio.currentTime = 0; audio.play().catch(function() {}); }\n                    }\n                    pedidosOnlinePendentes = novos;\n                    totalOnlineAnterior = novos.length;`,
  `                    const pedidosNovos = novos.filter(function(pedido) {\n                        const chave = chavePedidoOnlineAlerta(pedido);\n                        return chave && !codigosOnlineAlertados.has(chave);\n                    });\n                    pedidosNovos.forEach(function(pedido) { codigosOnlineAlertados.add(chavePedidoOnlineAlerta(pedido)); });\n                    if (campainhaOnlineAtiva && pedidosNovos.length) alertarNovosPedidosOnline(pedidosNovos);\n                    pedidosOnlinePendentes = novos;\n                    totalOnlineAnterior = novos.length;`,
  'detecção de novos pedidos online'
);

const rangeProd = functionRange(index, 'renderizarProducao');
let prod = index.slice(rangeProd.start, rangeProd.end);
prod = replaceOnce(
  prod,
  `                    let obsHtml = item.obs ? \`<span class=\"ingredientes\" style=\"color:#ffc107; font-weight:bold; font-size: 0.95rem;\">↳ OBS: \${escaparHtml(item.obs)}</span>\` : ''; let extrasHtml = '';`,
  `                    const obsOperacional = pedido.origem === 'Online' ? limparObsLegadaOnlineTela(item.obs) : String(item.obs || '');\n                    let obsHtml = obsOperacional ? \`<span class=\"ingredientes\" style=\"color:#ffc107; font-weight:bold; font-size: 0.95rem;\">↳ OBS: \${escaparHtml(obsOperacional)}</span>\` : ''; let extrasHtml = '';`,
  'observação limpa na Produção'
);
prod = replaceOnce(
  prod,
  `                    htmlBuffer += \`<div class=\"card-producao\"><h3><span style=\"display:flex; align-items:center;\">\${badgeOrigem}Pedido #\${pedido.numero} <small style=\"color:var(--text-muted); font-size:0.8rem; margin-left:5px;\">(\${pedido.hora})</small></span>\${badgePagamento}</h3>\${htmlItens}<button class=\"btn-forcar-baixa\" onclick=\"excluirPedidoDeVez('\${pedido.numero}')\">🗑️ Excluir Pedido Travado</button></div>\`;`,
  `                    const dadosClienteProducao = pedido.origem === 'Online' ? renderizarBlocoClienteOnline(pedido, 'pedido-producao-cliente') : '';\n                    htmlBuffer += \`<div class=\"card-producao\"><h3><span style=\"display:flex; align-items:center;\">\${badgeOrigem}Pedido #\${pedido.numero} <small style=\"color:var(--text-muted); font-size:0.8rem; margin-left:5px;\">(\${pedido.hora})</small></span>\${badgePagamento}</h3>\${htmlItens}\${dadosClienteProducao}<button class=\"btn-forcar-baixa\" onclick=\"excluirPedidoDeVez('\${pedido.numero}')\">🗑️ Excluir Pedido Travado</button></div>\`;`,
  'dados do cliente no final da Produção'
);
index = index.slice(0, rangeProd.start) + prod + index.slice(rangeProd.end);

index = replaceOnce(
  index,
  `            if(idTela === 'view-pedidos-online') {\n                renderizarPedidosOnline();`,
  `            if(idTela === 'view-pedidos-online') {\n                removerAlertaOnlineFixo();\n                renderizarPedidosOnline();`,
  'remoção do alerta ao abrir Online'
);

write('frontend/index.html', index);

const test = `const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst fs = require('fs');\n\nconst index = fs.readFileSync('frontend/index.html', 'utf8');\nconst cliente = fs.readFileSync('frontend/cliente.html', 'utf8');\n\ntest('cliente não mistura dados pessoais na observação da primeira tapioca', () => {\n  assert.ok(!cliente.includes('🟢 CLI:'));\n  assert.ok(!cliente.includes("' | OBS: ' + obsAntiga"));\n});\n\ntest('Online renderiza itens e observações antes dos dados do cliente', () => {\n  assert.match(index, /pedido-online-itens/);\n  assert.match(index, /pedido-online-obs/);\n  assert.match(index, /renderizarBlocoClienteOnline\\(pedido, ''\\)/);\n  const fn = index.slice(index.indexOf('function renderizarPedidosOnline'), index.indexOf('function aceitarPedidoOnlineTela'));\n  assert.ok(fn.indexOf('pedido-online-itens') < fn.indexOf("renderizarBlocoClienteOnline(pedido, '')"));\n});\n\ntest('Produção coloca dados do cliente somente depois de todos os itens', () => {\n  assert.match(index, /dadosClienteProducao/);\n  assert.match(index, /\\$\\{htmlItens\\}\\$\\{dadosClienteProducao\\}/);\n  assert.match(index, /pedido-producao-cliente/);\n});\n\ntest('pedidos legados têm metadados removidos da observação somente na apresentação', () => {\n  assert.match(index, /function limparObsLegadaOnlineTela/);\n  assert.match(index, /lastIndexOf\\('\| OBS:'\\)/);\n  assert.match(index, /obsOperacional/);\n});\n\ntest('novo pedido online usa sino, vibração, notificação e alerta visual', () => {\n  assert.match(index, /function tocarSinoOnline/);\n  assert.match(index, /navigator\\.vibrate/);\n  assert.match(index, /new Notification\\('🔔 Novo pedido online'/);\n  assert.match(index, /requireInteraction: true/);\n  assert.match(index, /alerta-online-fixo/);\n  assert.match(index, /navigator\\.wakeLock/);\n});\n\ntest('detecção de novidade usa identidade do pedido e não apenas aumento da contagem', () => {\n  assert.match(index, /codigosOnlineAlertados/);\n  assert.match(index, /chavePedidoOnlineAlerta/);\n  assert.ok(!index.includes('campainhaOnlineAtiva && novos.length > totalOnlineAnterior'));\n});\n`;
write('tests/pedidos-online-organizacao-alertas.test.js', test);

const doc = `# Ajuste operacional — Online e Produção\n\n## Objetivo\nOrganizar pedidos online no PDV e reforçar alertas de venda sem alterar contratos do Apps Script.\n\n## Ordem visual\n1. Itens/tapiocas do pedido.\n2. Observação específica logo abaixo do item correspondente.\n3. No final do pedido: cliente, bairro, endereço e forma de pagamento, um por linha.\n\n## Compatibilidade\nPedidos antigos que ainda possuam o formato legado \`🟢 CLI: ... | OBS: ...\` são limpos apenas para exibição. Novos pedidos deixam de gravar dados do cliente dentro da observação da primeira tapioca.\n\n## Alertas\n- sino MP3 existente + fallback Web Audio;\n- vibração quando suportada;\n- Notification API quando a permissão estiver concedida;\n- banner persistente dentro do PDV;\n- Screen Wake Lock quando suportado e com a tela visível;\n- detecção por identidade do pedido, não apenas pela quantidade da fila.\n\n## Limite do navegador\nPermissão de notificação explicitamente negada pelo usuário/sistema não pode ser burlada por uma página web. Nesse cenário o PDV mantém sino, vibração e alerta visual. Se o navegador encerrar/suspender totalmente a página em segundo plano, polling local também pode ser interrompido; push em background exigiria infraestrutura Web Push própria.\n`;
write('docs/AJUSTE_OPERACIONAL_PEDIDOS_ONLINE.md', doc);

console.log('Ajuste operacional aplicado em Online, Produção e alertas.');
