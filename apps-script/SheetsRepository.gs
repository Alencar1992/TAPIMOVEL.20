// =========================================================
// P5 — REPOSITÓRIO GOOGLE SHEETS
// Persistência estruturada de configuração operacional e filas.
// =========================================================

function obterOuCriarAbaConfigOperacional_(nomeAba, cabecalho) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(nomeAba);
  if (!aba) aba = ss.insertSheet(nomeAba);
  if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, cabecalho.length)
      .setFontWeight("bold")
      .setBackground("#d9ead3");
  }
  return aba;
}

function linhasAbaConfigOperacional_(aba, colunas) {
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha <= 1) return [];
  return aba.getRange(2, 1, ultimaLinha - 1, colunas).getValues();
}

function reescreverAbaConfigOperacional_(nomeAba, cabecalho, linhas) {
  const aba = obterOuCriarAbaConfigOperacional_(nomeAba, cabecalho);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha > 1) {
    aba.getRange(2, 1, ultimaLinha - 1, cabecalho.length).clearContent();
  }
  if (linhas.length) {
    aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
  }
}

function booleanoConfiguracaoSheets_(valor) {
  if (valor === true) return true;
  const texto = String(valor == null ? "" : valor).trim().toLowerCase();
  return texto === "true" || texto === "verdadeiro" || texto === "sim" || texto === "1";
}

function lerConfiguracaoOperacionalSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const horariosAba = ss.getSheetByName(ABA_CONFIG_HORARIOS_);
  const rotasAba = ss.getSheetByName(ABA_CONFIG_ROTAS_);
  const monteAba = ss.getSheetByName(ABA_CONFIG_MONTE_SUA_);
  const adicionaisAba = ss.getSheetByName(ABA_CONFIG_ADICIONAIS_);

  if (!horariosAba || !rotasAba || !monteAba || !adicionaisAba) return null;
  if (horariosAba.getLastRow() <= 1 || monteAba.getLastRow() <= 1) return null;

  const config = configuracaoOperacionalPadrao_();
  config.rotas = { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [] };
  config.monteSua.combinacoes = {};
  config.adicionais.salgado = [];
  config.adicionais.doce = [];

  linhasAbaConfigOperacional_(horariosAba, 4).forEach(function(linha) {
    const dia = String(Number(linha[0]));
    if (!/^[1-7]$/.test(dia)) return;
    config.horarios[dia] = {
      ativo: booleanoConfiguracaoSheets_(linha[1]),
      inicio: String(linha[2] || config.horarios[dia].inicio),
      fim: String(linha[3] || config.horarios[dia].fim)
    };
  });

  linhasAbaConfigOperacional_(rotasAba, 3)
    .sort(function(a, b) { return Number(a[1] || 0) - Number(b[1] || 0); })
    .forEach(function(linha) {
      const dia = String(Number(linha[0]));
      const rota = String(linha[2] || "").trim();
      if (/^[1-7]$/.test(dia) && rota) config.rotas[dia].push(rota);
    });

  linhasAbaConfigOperacional_(monteAba, 3).forEach(function(linha) {
    const base = String(linha[0] || "").trim();
    const queijo = String(linha[1] || "").trim();
    const preco = Number(linha[2]);
    if (!base || !queijo || !isFinite(preco)) return;
    if (!config.monteSua.combinacoes[base]) config.monteSua.combinacoes[base] = {};
    config.monteSua.combinacoes[base][queijo] = preco;
  });

  let valorAdicional = null;
  linhasAbaConfigOperacional_(adicionaisAba, 4)
    .sort(function(a, b) { return Number(a[1] || 0) - Number(b[1] || 0); })
    .forEach(function(linha) {
      const tipo = String(linha[0] || "").trim().toLowerCase();
      const item = String(linha[2] || "").trim();
      const valor = Number(linha[3]);
      if ((tipo === "salgado" || tipo === "doce") && item) {
        config.adicionais[tipo].push(item);
      }
      if (valorAdicional == null && isFinite(valor)) valorAdicional = valor;
    });
  if (valorAdicional != null) config.adicionais.valor = valorAdicional;

  return normalizarConfiguracaoOperacional_(config);
}

function gravarConfiguracaoOperacionalSheets_(config) {
  const normalizada = normalizarConfiguracaoOperacional_(config);
  const horarios = [];
  const rotas = [];
  const monte = [];
  const adicionais = [];

  for (let dia = 1; dia <= 7; dia++) {
    const chave = String(dia);
    const regra = normalizada.horarios[chave];
    horarios.push([dia, regra.ativo === true, regra.inicio, regra.fim]);
    (normalizada.rotas[chave] || []).forEach(function(rota, indice) {
      rotas.push([dia, indice + 1, valorStorageSeguro_(rota)]);
    });
  }

  Object.keys(normalizada.monteSua.combinacoes).forEach(function(base) {
    Object.keys(normalizada.monteSua.combinacoes[base]).forEach(function(queijo) {
      monte.push([
        valorStorageSeguro_(base),
        valorStorageSeguro_(queijo),
        Number(normalizada.monteSua.combinacoes[base][queijo])
      ]);
    });
  });

  ["salgado", "doce"].forEach(function(tipo) {
    (normalizada.adicionais[tipo] || []).forEach(function(item, indice) {
      adicionais.push([
        tipo,
        indice + 1,
        valorStorageSeguro_(item),
        Number(normalizada.adicionais.valor)
      ]);
    });
  });

  reescreverAbaConfigOperacional_(
    ABA_CONFIG_HORARIOS_,
    ["Dia ISO", "Ativo", "Início", "Fim"],
    horarios
  );
  reescreverAbaConfigOperacional_(
    ABA_CONFIG_ROTAS_,
    ["Dia ISO", "Ordem", "Rota"],
    rotas
  );
  reescreverAbaConfigOperacional_(
    ABA_CONFIG_MONTE_SUA_,
    ["Base", "Queijo", "Preço"],
    monte
  );
  reescreverAbaConfigOperacional_(
    ABA_CONFIG_ADICIONAIS_,
    ["Tipo", "Ordem", "Item", "Valor Unitário"],
    adicionais
  );
  return normalizada;
}

function obterOuCriarAbaFila_(nomeAba) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(nomeAba);
  if (!aba) {
    aba = ss.insertSheet(nomeAba);
  }
  if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, CABECALHO_STORAGE_PEDIDOS_.length)
      .setValues([CABECALHO_STORAGE_PEDIDOS_]);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, CABECALHO_STORAGE_PEDIDOS_.length)
      .setFontWeight("bold")
      .setBackground("#d9ead3");
  }
  return aba;
}

function valorStorageSeguro_(valor) {
  const texto = String(valor == null ? "" : valor);
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

function chavePersistenciaPedido_(pedido, indice) {
  const p = pedido && typeof pedido === "object" ? pedido : {};
  const codigo = String(p.codigoOnline || "").trim();
  const numero = String(p.numero == null ? "" : p.numero).trim();
  const timestamp = String(p.timestampCriacao || p.timestamp || "").trim();
  if (codigo && timestamp) return "ONLINE:" + codigo + ":" + timestamp;
  if (numero && timestamp) return "PDV:" + numero + ":" + timestamp;
  if (codigo) return "ONLINE:" + codigo;
  if (numero) return "PDV:" + numero;
  return "SEM_ID:" + String(indice || 0) + ":" + JSON.stringify(p);
}

function lerFilaDaAba_(nomeAba) {
  const aba = obterOuCriarAbaFila_(nomeAba);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha <= 1) return [];

  const linhas = aba.getRange(
    2,
    1,
    ultimaLinha - 1,
    CABECALHO_STORAGE_PEDIDOS_.length
  ).getValues();

  return linhas.reduce(function(lista, linha, indice) {
    const vazia = linha.every(function(valor) {
      return valor === "" || valor == null;
    });
    if (vazia) return lista;

    const payload = linha[6];
    if (!payload) {
      throw new Error(
        "Storage de pedidos corrompido em " + nomeAba + " na linha " + (indice + 2) + "."
      );
    }
    try {
      const pedido = JSON.parse(String(payload));
      if (!pedido || typeof pedido !== "object" || Array.isArray(pedido)) {
        throw new Error("payload inválido");
      }
      lista.push(pedido);
      return lista;
    } catch (erro) {
      throw new Error(
        "Falha ao ler pedido persistido em " + nomeAba + " na linha " + (indice + 2) + ": " + erro.message
      );
    }
  }, []);
}

function gravarFilaNaAba_(nomeAba, pedidos) {
  const lista = Array.isArray(pedidos) ? pedidos : [];
  const aba = obterOuCriarAbaFila_(nomeAba);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha > 1) {
    aba.getRange(
      2,
      1,
      ultimaLinha - 1,
      CABECALHO_STORAGE_PEDIDOS_.length
    ).clearContent();
  }
  if (!lista.length) return;

  const atualizadoEm = Date.now();
  const linhas = lista.map(function(pedido, indice) {
    const p = pedido && typeof pedido === "object" ? pedido : {};
    return [
      chavePersistenciaPedido_(p, indice),
      valorStorageSeguro_(p.numero),
      valorStorageSeguro_(p.codigoOnline),
      valorStorageSeguro_(p.statusOnline || p.status || ""),
      Number(p.timestampCriacao || p.timestamp || 0) || "",
      atualizadoEm,
      JSON.stringify(p)
    ];
  });
  aba.getRange(2, 1, linhas.length, CABECALHO_STORAGE_PEDIDOS_.length).setValues(linhas);
}

function mesclarFilasSemDuplicar_(atual, legado) {
  const saida = [];
  const vistos = {};
  [atual || [], legado || []].forEach(function(lista) {
    lista.forEach(function(pedido, indice) {
      const chave = chavePersistenciaPedido_(pedido, indice);
      if (vistos[chave]) return;
      vistos[chave] = true;
      saida.push(pedido);
    });
  });
  return saida;
}

function migrarFilaLegadaSeNecessario_(nomeAba, chaveLegada) {
  const atual = lerFilaDaAba_(nomeAba);
  const props = obterScriptProperties_();
  const bruto = props.getProperty(chaveLegada);
  if (bruto == null) return atual;

  let legado;
  try {
    legado = JSON.parse(bruto || "[]");
  } catch (erro) {
    throw new Error(
      "Não foi possível migrar " + chaveLegada + " para Google Sheets. O legado foi preservado: " + erro.message
    );
  }
  if (!Array.isArray(legado)) {
    throw new Error(
      "Não foi possível migrar " + chaveLegada + " para Google Sheets. O legado não é uma fila válida."
    );
  }

  const consolidada = mesclarFilasSemDuplicar_(atual, legado);
  gravarFilaNaAba_(nomeAba, consolidada);
  props.deleteProperty(chaveLegada);
  console.info(
    "Migração de storage concluída:",
    chaveLegada,
    "->",
    nomeAba,
    "registros:",
    consolidada.length
  );
  return consolidada;
}

function carregarFilaPdvAtivos_() {
  return migrarFilaLegadaSeNecessario_(
    ABA_STORAGE_PDV_ATIVOS_,
    CHAVE_LEGADA_PDV_ATIVOS_
  );
}

function substituirFilaPdvAtivos_(pedidos) {
  gravarFilaNaAba_(ABA_STORAGE_PDV_ATIVOS_, pedidos);
  obterScriptProperties_().deleteProperty(CHAVE_LEGADA_PDV_ATIVOS_);
}

function carregarFilaPedidosOnlinePendentes_() {
  return migrarFilaLegadaSeNecessario_(
    ABA_STORAGE_ONLINE_PENDENTES_,
    CHAVE_LEGADA_ONLINE_PENDENTES_
  );
}

function substituirFilaPedidosOnlinePendentes_(pedidos) {
  gravarFilaNaAba_(ABA_STORAGE_ONLINE_PENDENTES_, pedidos);
  obterScriptProperties_().deleteProperty(CHAVE_LEGADA_ONLINE_PENDENTES_);
}
