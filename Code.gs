const CONFIG = {
  SPREADSHEET_ID: '1xevm5cPHfRz9M55__ulQYjosXghsAqUGiA9JRXEV3vQ',
  SHEETS: {
    DB: 'BancoDeDados',
    ENTREGAS: 'Entregas',
    NETFLIX: 'Netflix',
    DEVEDORES: 'Devedores'
  },
  LIMITS: {
    LUCAS: 1000,
    INTER: 2000,
    NEON: 500
  },
  NETFLIX_USERS: ['Usuário 1', 'Usuário 2', 'Usuário 3', 'Usuário 4'],
  QUEM_OPTIONS: [
    'MARCELO', 'PRISCILA', 'DESPESAS CASA', 'GORDA', 'FERNANDA',
    'VITORIA', 'MOISES', 'PRIPEL', 'DAVID', 'OUTROS'
  ],
  ENTREGA_CATEGORIES: ['EXPRESSO', 'IFOOD', 'PRIPEL ENTREGA', 'PRIPEL POSTAGEM', 'LALAMOVE', 'BRIE']
};

const HEADERS = {
  BancoDeDados: ['Data', 'Tipo', 'Categoria', 'Subcategoria', 'Descrição', 'Valor', 'Quem', 'FormaPagamento', 'Parcelas', 'Status', 'Observação'],
  Entregas: ['Data', 'Categoria', 'Quantidade', 'ValorUnitario', 'ValorTotal'],
  Netflix: ['Data', 'Nome', 'Valor', 'Status'],
  Devedores: ['Data', 'Nome', 'Descrição', 'Valor', 'Status']
};

function doGet() {
  ensureStructure();
  return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('Painel Financeiro Inteligente');
}

function include(file) {
  return HtmlService.createHtmlOutputFromFile(file).getContent();
}

function ensureStructure() {
  const ss = getSpreadsheet();
  Object.keys(HEADERS).forEach((name) => {
    const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    const headers = HEADERS[name];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      return;
    }
    const current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (JSON.stringify(current) !== JSON.stringify(headers)) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
    }
  });
}

function getInitialData() {
  ensureStructure();
  return {
    summary: getDashboardData(),
    options: {
      quem: CONFIG.QUEM_OPTIONS,
      entregas: CONFIG.ENTREGA_CATEGORIES,
      netflixUsers: CONFIG.NETFLIX_USERS
    },
    monthly: {
      entregas: getEntregasResumo(),
      devedores: getDevedoresPendentes()
    }
  };
}

function getDashboardData() {
  const rows = getDataRows(CONFIG.SHEETS.DB);
  const totalEntradas = sumWhere(rows, (r) => r.Tipo === 'Entrada', 'Valor');
  const gastosLucas = sumWhere(rows, (r) => r.Tipo === 'Saída' && normalize(r.Quem) === 'LUCAS', 'Valor');
  const inter = sumWhere(rows, (r) => r.Tipo === 'Saída' && normalize(r.FormaPagamento) === 'INTER', 'Valor');
  const neon = sumWhere(rows, (r) => r.Tipo === 'Saída' && normalize(r.FormaPagamento) === 'NEON', 'Valor');

  return {
    totalEntradas,
    gastosLucas,
    inter,
    neon,
    lucroReal: totalEntradas - gastosLucas,
    progress: {
      lucas: buildProgress(gastosLucas, CONFIG.LIMITS.LUCAS),
      inter: buildProgress(inter, CONFIG.LIMITS.INTER),
      neon: buildProgress(neon, CONFIG.LIMITS.NEON)
    }
  };
}

function saveEntrada(payload) {
  return safeExecute(() => {
    validatePayload(payload, ['categoria', 'subcategoria', 'descricao', 'valor']);
    const valor = toNumber(payload.valor);
    if (valor <= 0) throw new Error('Valor da entrada deve ser maior que zero.');

    appendRow(CONFIG.SHEETS.DB, [
      new Date(), 'Entrada', payload.categoria, payload.subcategoria, payload.descricao,
      valor, payload.quem || '', payload.formaPagamento || '', payload.parcelas || '', 'Registrado', payload.observacao || ''
    ]);

    return success('Entrada registrada com sucesso.');
  });
}

function saveSaida(payload) {
  return safeExecute(() => {
    validatePayload(payload, ['descricao', 'valor', 'quem', 'formaPagamento']);
    const valor = toNumber(payload.valor);
    if (valor <= 0) throw new Error('Valor da saída deve ser maior que zero.');

    appendRow(CONFIG.SHEETS.DB, [
      new Date(), 'Saída', 'Saídas', payload.subcategoria || '', payload.descricao,
      valor, payload.quem, payload.formaPagamento, payload.parcelas || '', 'Registrado', payload.observacao || ''
    ]);

    return success('Saída registrada com sucesso.');
  });
}

function saveEntrega(payload) {
  return safeExecute(() => {
    validatePayload(payload, ['categoria']);
    let quantidade = toNumber(payload.quantidade || 0);
    let valorUnitario = toNumber(payload.valorUnitario || 0);

    if (normalize(payload.categoria) === 'PRIPEL POSTAGEM') {
      quantidade = 1;
      valorUnitario = 5;
    }
    if (quantidade <= 0 || valorUnitario <= 0) {
      throw new Error('Quantidade e valor unitário devem ser maiores que zero.');
    }
    const valorTotal = quantidade * valorUnitario;

    appendRow(CONFIG.SHEETS.ENTREGAS, [new Date(), payload.categoria, quantidade, valorUnitario, valorTotal]);
    appendRow(CONFIG.SHEETS.DB, [
      new Date(), 'Entrada', 'Entregas', payload.categoria, `Entrega ${payload.categoria}`,
      valorTotal, payload.quem || 'LUCAS', payload.formaPagamento || 'DINHEIRO', '', 'Registrado', payload.observacao || ''
    ]);

    return success('Entrega registrada com sucesso.');
  });
}

function registerPostagem() {
  return saveEntrega({ categoria: 'PRIPEL POSTAGEM', quantidade: 1, valorUnitario: 5 });
}

function toggleNetflixStatus(nome) {
  return safeExecute(() => {
    if (!nome) throw new Error('Usuário Netflix inválido.');
    const hoje = new Date();
    const monthKey = Utilities.formatDate(hoje, Session.getScriptTimeZone(), 'yyyy-MM');
    const rows = getDataRows(CONFIG.SHEETS.NETFLIX);

    let existingIndex = -1;
    rows.forEach((r, i) => {
      const data = r.Data ? new Date(r.Data) : null;
      const key = data ? Utilities.formatDate(data, Session.getScriptTimeZone(), 'yyyy-MM') : '';
      if (normalize(r.Nome) === normalize(nome) && key === monthKey) existingIndex = i + 2;
    });

    if (existingIndex > -1) {
      const statusCell = getSheet(CONFIG.SHEETS.NETFLIX).getRange(existingIndex, 4);
      const nextStatus = normalize(statusCell.getValue()) === 'PAGO' ? 'Pendente' : 'Pago';
      statusCell.setValue(nextStatus);
      getSheet(CONFIG.SHEETS.NETFLIX).getRange(existingIndex, 1).setValue(hoje);
      return success(`Status atualizado para ${nextStatus}.`);
    }

    appendRow(CONFIG.SHEETS.NETFLIX, [hoje, nome, 15, 'Pendente']);
    return success('Registro Netflix criado como Pendente.');
  });
}

function saveDevedor(payload) {
  return safeExecute(() => {
    validatePayload(payload, ['nome', 'descricao', 'valor']);
    const valor = toNumber(payload.valor);
    if (valor <= 0) throw new Error('Valor da dívida deve ser maior que zero.');

    appendRow(CONFIG.SHEETS.DEVEDORES, [new Date(), payload.nome, payload.descricao, valor, payload.status || 'Pendente']);
    return success('Devedor registrado com sucesso.');
  });
}

function getEntregasResumo() {
  const rows = getDataRows(CONFIG.SHEETS.ENTREGAS);
  const month = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  const resumo = {};

  rows.forEach((r) => {
    const data = r.Data ? Utilities.formatDate(new Date(r.Data), Session.getScriptTimeZone(), 'yyyy-MM') : '';
    if (data !== month) return;
    if (!resumo[r.Categoria]) resumo[r.Categoria] = { quantidade: 0, valor: 0 };
    resumo[r.Categoria].quantidade += toNumber(r.Quantidade);
    resumo[r.Categoria].valor += toNumber(r.ValorTotal);
  });

  const items = Object.keys(resumo).map((categoria) => ({ categoria, ...resumo[categoria] }));
  const totalMes = items.reduce((acc, item) => acc + item.valor, 0);
  return { items, totalMes };
}

function getDevedoresPendentes(nome) {
  const rows = getDataRows(CONFIG.SHEETS.DEVEDORES)
    .filter((r) => normalize(r.Status) !== 'PAGO' && (!nome || normalize(r.Nome) === normalize(nome)));
  const total = rows.reduce((acc, r) => acc + toNumber(r.Valor), 0);
  return { items: rows, total };
}

function gerarRelatorioWhatsApp(tipo) {
  return safeExecute(() => {
    const resumo = getEntregasResumo();
    const categories = normalize(tipo) === 'ELIEL'
      ? ['EXPRESSO', 'IFOOD']
      : ['PRIPEL ENTREGA', 'PRIPEL POSTAGEM'];

    const filtrados = resumo.items.filter((i) => categories.includes(normalize(i.categoria)));
    const total = filtrados.reduce((acc, i) => acc + i.valor, 0);

    const lines = [
      `*Relatório ${tipo}*`,
      '',
      ...filtrados.map((i) => `• ${i.categoria}: ${i.quantidade} | ${formatCurrency(i.valor)}`),
      '',
      `*Total:* ${formatCurrency(total)}`
    ];

    const text = encodeURIComponent(lines.join('\n'));
    return success('Relatório gerado.', { url: `https://wa.me/?text=${text}`, mensagem: lines.join('\n') });
  });
}

function gerarRelatorioDevedoresWhatsApp(nome) {
  return safeExecute(() => {
    const data = getDevedoresPendentes(nome);
    const lines = [
      '*Devedores Pendentes*',
      '',
      ...data.items.map((i) => `• ${i.Nome} - ${i.Descrição}: ${formatCurrency(i.Valor)}`),
      '',
      `*Total:* ${formatCurrency(data.total)}`
    ];
    return success('Relatório de devedores gerado.', {
      url: `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`,
      mensagem: lines.join('\n')
    });
  });
}

function fecharMes() {
  return safeExecute(() => {
    const ss = getSpreadsheet();
    const db = getSheet(CONFIG.SHEETS.DB);
    const values = db.getDataRange().getValues();
    if (values.length <= 1) throw new Error('Não há dados para fechar o mês.');

    const monthName = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM-yyyy');
    const newName = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    let target = ss.getSheetByName(newName);
    if (!target) target = ss.insertSheet(newName);

    target.clear();
    target.getRange(1, 1, values.length, values[0].length).setValues(values);
    db.getRange(2, 1, Math.max(0, db.getLastRow() - 1), db.getLastColumn()).clearContent();

    return success(`Fechamento concluído em ${newName}.`);
  });
}

function safeExecute(handler) {
  try {
    return handler();
  } catch (error) {
    return { ok: false, message: error.message || 'Erro inesperado.' };
  }
}

function success(message, data) {
  return { ok: true, message, data: data || null, summary: getDashboardData() };
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet(name) {
  const sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`Aba ${name} não encontrada.`);
  return sheet;
}

function appendRow(sheetName, values) {
  getSheet(sheetName).appendRow(values);
}

function getDataRows(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map((row) => headers.reduce((obj, h, i) => {
    obj[h] = row[i];
    return obj;
  }, {}));
}

function sumWhere(rows, predicate, field) {
  return rows.filter(predicate).reduce((acc, r) => acc + toNumber(r[field]), 0);
}

function toNumber(value) {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function normalize(v) {
  return String(v || '').trim().toUpperCase();
}

function buildProgress(value, limit) {
  const percent = limit > 0 ? Math.min(100, (value / limit) * 100) : 0;
  let color = 'green';
  if (percent >= 85) color = 'red';
  else if (percent >= 60) color = 'yellow';
  return { value, limit, percent, color };
}

function formatCurrency(value) {
  return Utilities.formatString('R$ %.2f', toNumber(value));
}

function validatePayload(payload, fields) {
  fields.forEach((f) => {
    if (!payload || payload[f] === undefined || payload[f] === null || String(payload[f]).trim() === '') {
      throw new Error(`Campo obrigatório: ${f}.`);
    }
  });
}
