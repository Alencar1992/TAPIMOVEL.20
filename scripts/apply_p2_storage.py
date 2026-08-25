from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CODE = ROOT / "apps-script" / "Code.gs"
TEST = ROOT / "tests" / "storage-sheets.test.js"
WORKFLOW = ROOT / ".github" / "workflows" / "p2-storage-apply.yml"
SELF = Path(__file__).resolve()

text = CODE.read_text(encoding="utf-8")

old_carregar = '''function carregarDadosNuvem() {
  return PropertiesService.getScriptProperties().getProperty("pdv_vendas_ativas") || "[]";
}'''
new_carregar = '''function carregarDadosNuvem() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    return JSON.stringify(carregarFilaPdvAtivos_());
  } finally {
    lock.releaseLock();
  }
}'''
if old_carregar not in text:
    raise SystemExit("Contrato carregarDadosNuvem não encontrado")
text = text.replace(old_carregar, new_carregar, 1)

old_salvar_completa = 'PropertiesService.getScriptProperties().setProperty("pdv_vendas_ativas", historicoJSON);'
if old_salvar_completa not in text:
    raise SystemExit("Contrato salvarNuvemCompleta não encontrado")
text = text.replace(
    old_salvar_completa,
    'substituirFilaPdvAtivos_(JSON.parse(historicoJSON || "[]"));',
    1,
)

old_listar_online = '''function listarPedidosOnlinePendentes() {
  const pendentes = JSON.parse(
    PropertiesService.getScriptProperties().getProperty("pedidos_online_pendentes") || "[]"
  );
  return pendentes.sort(function(a, b) {
    return Number(a.timestampCriacao || 0) - Number(b.timestampCriacao || 0);
  });
}'''
new_listar_online = '''function listarPedidosOnlinePendentes() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const pendentes = carregarFilaPedidosOnlinePendentes_();
    return pendentes.sort(function(a, b) {
      return Number(a.timestampCriacao || 0) - Number(b.timestampCriacao || 0);
    });
  } finally {
    lock.releaseLock();
  }
}'''
if old_listar_online not in text:
    raise SystemExit("Contrato listarPedidosOnlinePendentes não encontrado")
text = text.replace(old_listar_online, new_listar_online, 1)

# Leituras restantes dentro de fluxos já protegidos por ScriptLock.
text = re.sub(
    r'JSON\.parse\(\s*(?:c|props|PropertiesService\.getScriptProperties\(\))\.getProperty\("pdv_vendas_ativas"\)\s*\|\|\s*"\[\]"\s*\)',
    'carregarFilaPdvAtivos_()',
    text,
)
text = re.sub(
    r'JSON\.parse\(\s*(?:c|props|PropertiesService\.getScriptProperties\(\))\.getProperty\("pedidos_online_pendentes"\)\s*\|\|\s*"\[\]"\s*\)',
    'carregarFilaPedidosOnlinePendentes_()',
    text,
)

# Escritas restantes passam a persistir exclusivamente em Sheets.
text = re.sub(
    r'(?:c|props|PropertiesService\.getScriptProperties\(\))\.setProperty\("pdv_vendas_ativas",\s*JSON\.stringify\(([^()\n]+)\)\);',
    r'substituirFilaPdvAtivos_(\1);',
    text,
)
text = re.sub(
    r'(?:c|props|PropertiesService\.getScriptProperties\(\))\.setProperty\("pedidos_online_pendentes",\s*JSON\.stringify\(([^()\n]+)\)\);',
    r'substituirFilaPedidosOnlinePendentes_(\1);',
    text,
)

# Antes de inserir o bloco de compatibilidade, nenhuma referência literal legada pode sobrar.
for legacy in ("pdv_vendas_ativas", "pedidos_online_pendentes"):
    if legacy in text:
        linhas = [f"{i + 1}: {line}" for i, line in enumerate(text.splitlines()) if legacy in line]
        raise SystemExit("Referências legadas não tratadas para %s:\n%s" % (legacy, "\n".join(linhas)))

marker = '''// =========================================================
// 2. SISTEMA DE NUVEM (BLINDADO COM LOCKSERVICE)
// ========================================================='''
if marker not in text:
    raise SystemExit("Marcador da seção de nuvem não encontrado")

storage_block = r'''// =========================================================
// STORAGE RESILIENTE — FILAS NO GOOGLE SHEETS
// =========================================================
const ABA_STORAGE_PDV_ATIVOS_ = "Pedidos_Ativos";
const ABA_STORAGE_ONLINE_PENDENTES_ = "Pedidos_Online_Pendentes";
const CHAVE_LEGADA_PDV_ATIVOS_ = "pdv_vendas_ativas";
const CHAVE_LEGADA_ONLINE_PENDENTES_ = "pedidos_online_pendentes";
const CABECALHO_STORAGE_PEDIDOS_ = [
  "Chave",
  "Número",
  "Código Online",
  "Status",
  "Criado em",
  "Atualizado em",
  "Payload JSON"
];

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
  const props = PropertiesService.getScriptProperties();
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
  PropertiesService.getScriptProperties().deleteProperty(CHAVE_LEGADA_PDV_ATIVOS_);
}

function carregarFilaPedidosOnlinePendentes_() {
  return migrarFilaLegadaSeNecessario_(
    ABA_STORAGE_ONLINE_PENDENTES_,
    CHAVE_LEGADA_ONLINE_PENDENTES_
  );
}

function substituirFilaPedidosOnlinePendentes_(pedidos) {
  gravarFilaNaAba_(ABA_STORAGE_ONLINE_PENDENTES_, pedidos);
  PropertiesService.getScriptProperties().deleteProperty(CHAVE_LEGADA_ONLINE_PENDENTES_);
}

'''
text = text.replace(marker, storage_block + marker, 1)
CODE.write_text(text, encoding="utf-8")

TEST.write_text(r'''const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const code = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");

test("filas operacionais não são mais escritas no PropertiesService", () => {
  assert.doesNotMatch(code, /setProperty\(["']pdv_vendas_ativas["']/);
  assert.doesNotMatch(code, /setProperty\(["']pedidos_online_pendentes["']/);
  assert.doesNotMatch(code, /getProperty\(["']pdv_vendas_ativas["']/);
  assert.doesNotMatch(code, /getProperty\(["']pedidos_online_pendentes["']/);
  assert.match(code, /const ABA_STORAGE_PDV_ATIVOS_ = "Pedidos_Ativos";/);
  assert.match(code, /const ABA_STORAGE_ONLINE_PENDENTES_ = "Pedidos_Online_Pendentes";/);
  assert.match(code, /deleteProperty\(CHAVE_LEGADA_PDV_ATIVOS_\)/);
  assert.match(code, /deleteProperty\(CHAVE_LEGADA_ONLINE_PENDENTES_\)/);
});

test("contratos públicos continuam iguais e usam storage em Sheets", () => {
  assert.match(code, /function carregarDadosNuvem\(\)[\s\S]*?JSON\.stringify\(carregarFilaPdvAtivos_\(\)\)/);
  assert.match(code, /function salvarNuvemCompleta\(historicoJSON\)[\s\S]*?substituirFilaPdvAtivos_/);
  assert.match(code, /function listarPedidosOnlinePendentes\(\)[\s\S]*?carregarFilaPedidosOnlinePendentes_/);
  assert.match(code, /lock\.waitLock\(10000\);[\s\S]*?JSON\.stringify\(carregarFilaPdvAtivos_\(\)\)/);
});

function criarAmbiente() {
  class Range {
    constructor(sheet, row, col, rows, cols) {
      this.sheet = sheet;
      this.row = row;
      this.col = col;
      this.rows = rows;
      this.cols = cols;
    }
    setValues(values) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.sheet.set(this.row + r, this.col + c, values[r][c]);
        }
      }
      return this;
    }
    getValues() {
      const out = [];
      for (let r = 0; r < this.rows; r++) {
        const linha = [];
        for (let c = 0; c < this.cols; c++) {
          linha.push(this.sheet.get(this.row + r, this.col + c));
        }
        out.push(linha);
      }
      return out;
    }
    clearContent() {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.sheet.set(this.row + r, this.col + c, "");
        }
      }
      return this;
    }
    setFontWeight() { return this; }
    setBackground() { return this; }
  }

  class Sheet {
    constructor(name) {
      this.name = name;
      this.cells = [];
    }
    set(row, col, value) {
      while (this.cells.length < row) this.cells.push([]);
      while (this.cells[row - 1].length < col) this.cells[row - 1].push("");
      this.cells[row - 1][col - 1] = value;
    }
    get(row, col) {
      return (this.cells[row - 1] && this.cells[row - 1][col - 1]) ?? "";
    }
    getLastRow() {
      for (let r = this.cells.length; r >= 1; r--) {
        if ((this.cells[r - 1] || []).some(v => v !== "" && v != null)) return r;
      }
      return 0;
    }
    getRange(row, col, rows, cols) { return new Range(this, row, col, rows, cols); }
    setFrozenRows() { return this; }
  }

  class Spreadsheet {
    constructor() { this.sheets = new Map(); }
    getSheetByName(name) { return this.sheets.get(name) || null; }
    insertSheet(name) {
      const sheet = new Sheet(name);
      this.sheets.set(name, sheet);
      return sheet;
    }
  }

  const spreadsheet = new Spreadsheet();
  const data = new Map();
  const props = {
    getProperty: key => data.has(key) ? data.get(key) : null,
    setProperty: (key, value) => data.set(key, String(value)),
    deleteProperty: key => data.delete(key),
  };
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => props },
    console: { info() {}, error() {} },
  };

  const inicio = code.indexOf("// STORAGE RESILIENTE — FILAS NO GOOGLE SHEETS");
  const fim = code.indexOf("// 2. SISTEMA DE NUVEM (BLINDADO COM LOCKSERVICE)");
  assert.ok(inicio >= 0 && fim > inicio, "bloco de storage deve existir");
  const bloco = code.slice(inicio, fim) + `\nthis.__storage = {
    carregarFilaPdvAtivos_, substituirFilaPdvAtivos_,
    carregarFilaPedidosOnlinePendentes_, substituirFilaPedidosOnlinePendentes_
  };`;
  vm.runInNewContext(bloco, context);
  return { spreadsheet, props, data, api: context.__storage };
}

test("migração automática preserva filas e remove somente as duas chaves legadas", () => {
  const env = criarAmbiente();
  const ativos = [{ numero: 7, timestampCriacao: 111, status: "Produção", itens: [{ nome: "Frango" }] }];
  const pendentes = [{ codigoOnline: "ON003", numeroOnline: 3, timestampCriacao: 222, statusOnline: "Aguardando" }];
  env.props.setProperty("pdv_vendas_ativas", JSON.stringify(ativos));
  env.props.setProperty("pedidos_online_pendentes", JSON.stringify(pendentes));
  env.props.setProperty("pedidos_online_contador", JSON.stringify({ dia: "2026-08-25", valor: 3 }));

  assert.deepEqual(JSON.parse(JSON.stringify(env.api.carregarFilaPdvAtivos_())), ativos);
  assert.deepEqual(JSON.parse(JSON.stringify(env.api.carregarFilaPedidosOnlinePendentes_())), pendentes);
  assert.equal(env.props.getProperty("pdv_vendas_ativas"), null);
  assert.equal(env.props.getProperty("pedidos_online_pendentes"), null);
  assert.notEqual(env.props.getProperty("pedidos_online_contador"), null);
  assert.ok(env.spreadsheet.getSheetByName("Pedidos_Ativos"));
  assert.ok(env.spreadsheet.getSheetByName("Pedidos_Online_Pendentes"));
});

test("Sheets passa a ser a fonte oficial depois da migração", () => {
  const env = criarAmbiente();
  const primeira = [{ numero: 1, timestampCriacao: 100 }];
  env.props.setProperty("pdv_vendas_ativas", JSON.stringify(primeira));
  env.api.carregarFilaPdvAtivos_();

  const nova = [{ numero: 2, timestampCriacao: 200, produzido: true }];
  env.api.substituirFilaPdvAtivos_(nova);
  assert.equal(env.props.getProperty("pdv_vendas_ativas"), null);
  assert.deepEqual(JSON.parse(JSON.stringify(env.api.carregarFilaPdvAtivos_())), nova);
});

test("legado inválido nunca é apagado silenciosamente", () => {
  const env = criarAmbiente();
  env.props.setProperty("pedidos_online_pendentes", "{json quebrado");
  assert.throws(
    () => env.api.carregarFilaPedidosOnlinePendentes_(),
    /O legado foi preservado/
  );
  assert.equal(env.props.getProperty("pedidos_online_pendentes"), "{json quebrado");
});
''', encoding="utf-8")

# O aplicador é descartável; o commit final deve conter apenas código e testes do produto.
if WORKFLOW.exists():
    WORKFLOW.unlink()
if SELF.exists():
    SELF.unlink()

print("P2 aplicado: filas migradas para Sheets e testes adicionados.")
