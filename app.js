const CONFIG = {
  LIMITS: { LUCAS: 1000, INTER: 2000, NEON: 500 },
  QUEM: ['MARCELO','PRISCILA','DESPESAS CASA','GORDA','FERNANDA','VITORIA','MOISES','PRIPEL','DAVID','LUCAS','OUTROS'],
  ENTREGAS: ['EXPRESSO','IFOOD','PRIPEL ENTREGA','PRIPEL POSTAGEM','LALAMOVE','BRIE'],
  NETFLIX_USERS: ['Usuário 1','Usuário 2','Usuário 3','Usuário 4']
};

const db = {
  load() {
    return JSON.parse(localStorage.getItem('financeHubData') || '{"banco":[],"entregas":[],"netflix":[],"devedores":[],"fechamentos":[]}');
  },
  save(data) { localStorage.setItem('financeHubData', JSON.stringify(data)); }
};

const state = { data: db.load() };

document.addEventListener('DOMContentLoaded', () => {
  bindNavigation();
  bindForms();
  hydrateStaticOptions();
  refreshAll();
});

function bindNavigation() {
  document.querySelectorAll('.nav').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      const id = btn.dataset.section;
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      document.getElementById('section-title').textContent = btn.textContent;
    });
  });

  document.getElementById('btn-theme').addEventListener('click', () => document.body.classList.toggle('dark'));
  document.getElementById('btn-fechar-mes').addEventListener('click', fecharMes);
}

function bindForms() {
  document.getElementById('entrada-categoria').addEventListener('change', preencherSubcategoriaEntrada);
  document.getElementById('saida-quem').addEventListener('change', onQuemChange);
  document.getElementById('btn-postagem').addEventListener('click', registrarPostagem);
  document.getElementById('btn-buscar-devedores').addEventListener('click', renderDevedores);
  document.getElementById('btn-wa-devedores').addEventListener('click', gerarWaDevedores);

  bindSubmit('form-entrada', salvarEntrada);
  bindSubmit('form-saida', salvarSaida);
  bindSubmit('form-entrega', salvarEntrega);
  bindSubmit('form-devedor', salvarDevedor);
}

function bindSubmit(id, handler) {
  document.getElementById(id).addEventListener('submit', e => {
    e.preventDefault();
    const payload = Object.fromEntries(new FormData(e.target).entries());
    try {
      handler(payload);
      e.target.reset();
      toast('Salvo com sucesso.');
      refreshAll();
    } catch (err) {
      toast(err.message);
    }
  });
}

function hydrateStaticOptions() {
  fillSelect('saida-quem', CONFIG.QUEM);
  fillSelect('entrega-categoria', CONFIG.ENTREGAS);
  preencherSubcategoriaEntrada();
}

function fillSelect(id, options) {
  document.getElementById(id).innerHTML = options.map(o => `<option>${o}</option>`).join('');
}

function preencherSubcategoriaEntrada() {
  const cat = document.getElementById('entrada-categoria').value;
  let opts = ['Sem subcategoria'];
  if (cat === 'Entregas') opts = CONFIG.ENTREGAS;
  if (cat === 'Outras') opts = ['Salário','Comissão','Venda','Outros'];
  fillSelect('entrada-subcategoria', opts);
}

function onQuemChange() {
  const show = document.getElementById('saida-quem').value === 'OUTROS';
  document.getElementById('saida-quem-manual-wrap').classList.toggle('hidden', !show);
}

function salvarEntrada(p) {
  const valor = toNum(p.valor);
  required(p.categoria, 'Categoria'); required(p.descricao, 'Descrição');
  if (valor <= 0) throw new Error('Valor precisa ser maior que zero.');
  state.data.banco.push({ data: new Date().toISOString(), tipo:'Entrada', categoria:p.categoria, subcategoria:p.subcategoria, descricao:p.descricao, valor, quem:'', formaPagamento:'', parcelas:'', status:'Registrado', observacao:'' });
  db.save(state.data);
}

function salvarSaida(p) {
  const valor = toNum(p.valor);
  const quem = p.quem === 'OUTROS' ? (p.quemManual || '').trim() : p.quem;
  required(p.descricao, 'Descrição'); required(quem, 'Quem');
  if (valor <= 0) throw new Error('Valor precisa ser maior que zero.');
  state.data.banco.push({ data:new Date().toISOString(), tipo:'Saída', categoria:'Saídas', subcategoria:'', descricao:p.descricao, valor, quem, formaPagamento:p.formaPagamento, parcelas:p.parcelas || '', status:'Registrado', observacao:'' });
  db.save(state.data);
}

function salvarEntrega(p) {
  const categoria = p.categoria;
  let quantidade = toNum(p.quantidade);
  let valorUnitario = toNum(p.valorUnitario);
  if (categoria === 'PRIPEL POSTAGEM') { quantidade = 1; valorUnitario = 5; }
  if (quantidade <= 0 || valorUnitario <= 0) throw new Error('Quantidade e valor unitário precisam ser válidos.');
  const valorTotal = quantidade * valorUnitario;

  state.data.entregas.push({ data:new Date().toISOString(), categoria, quantidade, valorUnitario, valorTotal });
  state.data.banco.push({ data:new Date().toISOString(), tipo:'Entrada', categoria:'Entregas', subcategoria:categoria, descricao:`Entrega ${categoria}`, valor:valorTotal, quem:'LUCAS', formaPagamento:'DINHEIRO', parcelas:'', status:'Registrado', observacao:'' });
  db.save(state.data);
}

function registrarPostagem() {
  try {
    salvarEntrega({ categoria:'PRIPEL POSTAGEM', quantidade:1, valorUnitario:5 });
    toast('Postagem registrada.');
    refreshAll();
  } catch (e) { toast(e.message); }
}

function salvarDevedor(p) {
  const valor = toNum(p.valor);
  required(p.nome, 'Nome'); required(p.descricao, 'Descrição');
  if (valor <= 0) throw new Error('Valor precisa ser maior que zero.');
  state.data.devedores.push({ data:new Date().toISOString(), nome:p.nome, descricao:p.descricao, valor, status:'Pendente' });
  db.save(state.data);
}

function toggleNetflix(nome) {
  const month = monthKey();
  const item = state.data.netflix.find(n => n.nome === nome && n.month === month);
  if (item) {
    item.status = item.status === 'Pago' ? 'Pendente' : 'Pago';
    item.data = new Date().toISOString();
  } else {
    state.data.netflix.push({ data:new Date().toISOString(), month, nome, valor:15, status:'Pendente' });
  }
  db.save(state.data);
  refreshAll();
}

function refreshAll() {
  state.data = db.load();
  renderDashboard();
  renderEntregasResumo();
  renderNetflix();
  renderDevedores();
}

function renderDashboard() {
  const s = dashboardData();
  const root = document.getElementById('dashboard');
  root.innerHTML = `
    <div class="card progress-card"><h3>💰 Lucro Real: ${money(s.lucroReal)}</h3></div>
    ${progress('Gastos Lucas', s.gastosLucas, CONFIG.LIMITS.LUCAS)}
    ${progress('Cartão INTER', s.inter, CONFIG.LIMITS.INTER)}
    ${progress('Cartão NEON', s.neon, CONFIG.LIMITS.NEON)}
    <div class="card progress-card">
      <button onclick="gerarWaEntregas('ELIEL')">Relatório ELIEL</button>
      <button onclick="gerarWaEntregas('PRIPEL')">Relatório PRIPEL</button>
    </div>`;
  document.querySelectorAll('.bar i').forEach(el => setTimeout(() => { el.style.width = `${el.dataset.p}%`; }, 30));
}

function progress(title, value, limit) {
  const p = limit ? Math.min(100, (value / limit) * 100) : 0;
  const color = p >= 85 ? 'red' : p >= 60 ? 'yellow' : 'green';
  return `<div class="card progress-card"><h4 class="progress-title">${title}</h4><p>${money(value)} / ${money(limit)} (${p.toFixed(1)}%)</p><div class="bar"><i class="${color}" data-p="${p}"></i></div></div>`;
}

function dashboardData() {
  const entradas = sum(state.data.banco.filter(r => r.tipo === 'Entrada'), 'valor');
  const gastosLucas = sum(state.data.banco.filter(r => r.tipo === 'Saída' && up(r.quem) === 'LUCAS'), 'valor');
  const inter = sum(state.data.banco.filter(r => r.tipo === 'Saída' && up(r.formaPagamento) === 'INTER'), 'valor');
  const neon = sum(state.data.banco.filter(r => r.tipo === 'Saída' && up(r.formaPagamento) === 'NEON'), 'valor');
  return { entradas, gastosLucas, inter, neon, lucroReal: entradas - gastosLucas };
}

function renderEntregasResumo() {
  const month = monthKey();
  const grouped = {};
  state.data.entregas.filter(e => e.data.slice(0, 7) === month).forEach(e => {
    if (!grouped[e.categoria]) grouped[e.categoria] = { quantidade: 0, valor: 0 };
    grouped[e.categoria].quantidade += toNum(e.quantidade);
    grouped[e.categoria].valor += toNum(e.valorTotal);
  });
  const items = Object.entries(grouped);
  const total = items.reduce((acc, [,v]) => acc + v.valor, 0);

  document.getElementById('entregas-resumo').innerHTML = `
    <h3>📊 Resumo Mensal</h3>
    ${items.map(([cat,v]) => `<p>${cat}: ${v.quantidade} | ${money(v.valor)}</p>`).join('') || '<p>Sem entregas no mês.</p>'}
    <hr><strong>Total mês: ${money(total)}</strong>`;
}

function renderNetflix() {
  const month = monthKey();
  const box = document.getElementById('netflix-grid');
  box.innerHTML = CONFIG.NETFLIX_USERS.map(nome => {
    const row = state.data.netflix.find(n => n.nome === nome && n.month === month);
    const status = row?.status || 'Pendente';
    const klass = status === 'Pago' ? 'pago' : 'pending';
    return `<button class="nbtn ${klass}" onclick="toggleNetflix('${nome.replace(/'/g, "\\'")}')">${nome} - R$ 15 (${status})</button>`;
  }).join('');
}

function renderDevedores() {
  const filtro = up(document.getElementById('filtro-devedor').value || '');
  const pendentes = state.data.devedores.filter(d => up(d.status) !== 'PAGO' && (!filtro || up(d.nome).includes(filtro)));
  const total = sum(pendentes, 'valor');
  document.getElementById('devedores-lista').innerHTML = `${pendentes.map(d => `<p>${d.nome} - ${d.descricao}: ${money(d.valor)} (${d.status})</p>`).join('') || '<p>Nenhum devedor pendente.</p>'}<hr><strong>Total: ${money(total)}</strong>`;
}

function gerarWaEntregas(tipo) {
  const month = monthKey();
  const cats = tipo === 'ELIEL' ? ['EXPRESSO','IFOOD'] : ['PRIPEL ENTREGA','PRIPEL POSTAGEM'];
  const rows = state.data.entregas.filter(e => e.data.slice(0, 7) === month && cats.includes(e.categoria));
  const grouped = {};
  rows.forEach(r => {
    if (!grouped[r.categoria]) grouped[r.categoria] = { q: 0, v: 0 };
    grouped[r.categoria].q += toNum(r.quantidade);
    grouped[r.categoria].v += toNum(r.valorTotal);
  });
  const total = Object.values(grouped).reduce((a,b) => a + b.v, 0);
  const msg = [`*Relatório ${tipo}*`, '', ...Object.entries(grouped).map(([c,v]) => `• ${c}: ${v.q} | ${money(v.v)}`), '', `*Total:* ${money(total)}`].join('\n');
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

function gerarWaDevedores() {
  const filtro = up(document.getElementById('filtro-devedor').value || '');
  const pendentes = state.data.devedores.filter(d => up(d.status) !== 'PAGO' && (!filtro || up(d.nome).includes(filtro)));
  const total = sum(pendentes, 'valor');
  const msg = ['*Devedores Pendentes*', '', ...pendentes.map(d => `• ${d.nome} - ${d.descricao}: ${money(d.valor)}`), '', `*Total:* ${money(total)}`].join('\n');
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

function fecharMes() {
  const month = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', '-');
  if (!state.data.banco.length) return toast('Sem dados para fechar o mês.');
  state.data.fechamentos.push({ nome: month, banco: [...state.data.banco], date: new Date().toISOString() });
  state.data.banco = [];
  db.save(state.data);
  toast(`Fechamento criado: ${month}`);
  refreshAll();
}

function required(v, name) { if (!String(v || '').trim()) throw new Error(`Campo obrigatório: ${name}`); }
function toNum(v) { const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; }
function up(v) { return String(v || '').trim().toUpperCase(); }
function sum(rows, field) { return rows.reduce((acc, r) => acc + toNum(r[field]), 0); }
function money(v) { return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(toNum(v)); }
function monthKey() { return new Date().toISOString().slice(0, 7); }
function toast(msg) { document.getElementById('toast').textContent = msg; }
