from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "scripts" / "apply_p2_storage.py"
BACKEND_TEST = ROOT / "tests" / "backend-security.test.js"
STORAGE_TEST = ROOT / "tests" / "storage-sheets.test.js"
SELF = Path(__file__).resolve()

source = BASE.read_text(encoding="utf-8")
needle = '''if old_listar_online not in text:
    raise SystemExit("Contrato listarPedidosOnlinePendentes não encontrado")
text = text.replace(old_listar_online, new_listar_online, 1)
'''
if needle not in source:
    raise SystemExit("Ponto de extensão do aplicador P2 não encontrado")

old_func = '''function obterPedidosPendentesFechamentoEliel_(mes, ano) {
  const bruto = PropertiesService.getScriptProperties().getProperty("pdv_vendas_ativas") || "[]";
  let pedidos = [];
  try {
    pedidos = JSON.parse(bruto);
  } catch (e) {
    pedidos = [];
  }
  const chaveAlvo = chaveMes_(mes, ano);
  const chaveAtual = String(obterDiaSessaoAdmin_()).substring(0, 7);
  return (Array.isArray(pedidos) ? pedidos : []).filter(function(pedido) {
    const pendente = !pedido || !pedido.produzido || !pedido.timestamp;
    if (!pendente) return false;
    const data = obterDataReferenciaPedidoFechamento_(pedido);
    if (!data) return chaveAlvo === chaveAtual;
    return chaveMesDaDataFechamento_(data) === chaveAlvo;
  }).length;
}'''
new_func = '''function obterPedidosPendentesFechamentoEliel_(mes, ano) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const pedidos = carregarFilaPdvAtivos_();
    const chaveAlvo = chaveMes_(mes, ano);
    const chaveAtual = String(obterDiaSessaoAdmin_()).substring(0, 7);
    return (Array.isArray(pedidos) ? pedidos : []).filter(function(pedido) {
      const pendente = !pedido || !pedido.produzido || !pedido.timestamp;
      if (!pendente) return false;
      const data = obterDataReferenciaPedidoFechamento_(pedido);
      if (!data) return chaveAlvo === chaveAtual;
      return chaveMesDaDataFechamento_(data) === chaveAlvo;
    }).length;
  } finally {
    lock.releaseLock();
  }
}'''

injected = (
    "\nold_pendentes_fechamento = " + repr(old_func) + "\n"
    "new_pendentes_fechamento = " + repr(new_func) + "\n"
    "if old_pendentes_fechamento not in text:\n"
    "    raise SystemExit(\"Contrato de pendências do fechamento não encontrado\")\n"
    "text = text.replace(old_pendentes_fechamento, new_pendentes_fechamento, 1)\n"
)
source = source.replace(needle, needle + injected, 1)
BASE.write_text(source, encoding="utf-8")

result = subprocess.run([sys.executable, str(BASE)], cwd=ROOT)
if result.returncode != 0:
    raise SystemExit(result.returncode)

with STORAGE_TEST.open("a", encoding="utf-8") as handle:
    handle.write('''\n\ntest("fechamento P0 consulta a fila ativa já migrada e mantém lock de leitura", () => {\n  assert.match(\n    code,\n    /function obterPedidosPendentesFechamentoEliel_\\(mes, ano\\)[\\s\\S]*?LockService\\.getScriptLock\\(\\)[\\s\\S]*?carregarFilaPdvAtivos_\\(\\)/\n  );\n});\n''')

backend = BACKEND_TEST.read_text(encoding="utf-8")
old_spreadsheet = '''    SpreadsheetApp: {
      getActiveSpreadsheet() {
        throw new Error("Spreadsheet não deve ser acessada neste teste.");
      }
    },'''
new_spreadsheet = '''    SpreadsheetApp: {
      getActiveSpreadsheet() { return spreadsheet; }
    },'''
if old_spreadsheet not in backend:
    raise SystemExit("Mock antigo de SpreadsheetApp não encontrado")

insert_after = '''  const lock = { waitLock() {}, releaseLock() {} };
'''
memory_sheet = r'''  class MemoryRange {
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
      const values = [];
      for (let r = 0; r < this.rows; r++) {
        const row = [];
        for (let c = 0; c < this.cols; c++) {
          row.push(this.sheet.get(this.row + r, this.col + c));
        }
        values.push(row);
      }
      return values;
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
  class MemorySheet {
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
      for (let row = this.cells.length; row >= 1; row--) {
        if ((this.cells[row - 1] || []).some(value => value !== "" && value != null)) return row;
      }
      return 0;
    }
    getRange(row, col, rows, cols) { return new MemoryRange(this, row, col, rows, cols); }
    setFrozenRows() { return this; }
  }
  const spreadsheet = {
    sheets: new Map(),
    getSheetByName(name) { return this.sheets.get(name) || null; },
    insertSheet(name) {
      const sheet = new MemorySheet(name);
      this.sheets.set(name, sheet);
      return sheet;
    }
  };
'''
if insert_after not in backend:
    raise SystemExit("Ponto para mock de Sheets não encontrado")
backend = backend.replace(insert_after, insert_after + memory_sheet, 1)
backend = backend.replace(old_spreadsheet, new_spreadsheet, 1)
backend = backend.replace(
    'assert.equal(JSON.parse(properties.get("pdv_vendas_ativas") || "[]").length, 0);',
    'assert.equal(context.carregarFilaPdvAtivos_().length, 0);',
    1,
)
backend = backend.replace(
    'assert.equal(JSON.parse(properties.get("pdv_vendas_ativas")).length, 1);',
    'assert.equal(context.carregarFilaPdvAtivos_().length, 1);',
    1,
)
BACKEND_TEST.write_text(backend, encoding="utf-8")

# Remover todos os aplicadores temporários anteriores que não pertencem ao produto final.
for name in ["apply_p2_storage_v2.py", "apply_p2_storage_v3.py"]:
    path = ROOT / "scripts" / name
    if path.exists():
        path.unlink()
if SELF.exists():
    SELF.unlink()
