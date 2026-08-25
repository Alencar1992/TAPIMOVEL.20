from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "scripts" / "apply_p2_storage.py"
TEST = ROOT / "tests" / "storage-sheets.test.js"
SELF = Path(__file__).resolve()

source = BASE.read_text(encoding="utf-8")
needle = '''if old_listar_online not in text:
    raise SystemExit("Contrato listarPedidosOnlinePendentes não encontrado")
text = text.replace(old_listar_online, new_listar_online, 1)
'''
if needle not in source:
    raise SystemExit("Ponto de extensão do aplicador P2 não encontrado")

extra = r'''
old_pendentes_fechamento = '''function obterPedidosPendentesFechamentoEliel_(mes, ano) {
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
new_pendentes_fechamento = '''function obterPedidosPendentesFechamentoEliel_(mes, ano) {
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
if old_pendentes_fechamento not in text:
    raise SystemExit("Contrato de pendências do fechamento não encontrado")
text = text.replace(old_pendentes_fechamento, new_pendentes_fechamento, 1)
'''

source = source.replace(needle, needle + extra, 1)
BASE.write_text(source, encoding="utf-8")

result = subprocess.run([sys.executable, str(BASE)], cwd=ROOT)
if result.returncode != 0:
    raise SystemExit(result.returncode)

with TEST.open("a", encoding="utf-8") as handle:
    handle.write(r'''

test("fechamento P0 consulta a fila ativa já migrada e mantém lock de leitura", () => {
  assert.match(
    code,
    /function obterPedidosPendentesFechamentoEliel_\(mes, ano\)[\s\S]*?LockService\.getScriptLock\(\)[\s\S]*?carregarFilaPdvAtivos_\(\)/
  );
});
''')

if SELF.exists():
    SELF.unlink()
