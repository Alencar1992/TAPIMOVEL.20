from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = ROOT / "apps-script" / "Code.gs"
SERVICE_PATH = ROOT / "apps-script" / "PedidoService.gs"
AUTONOMIA_TEST = ROOT / "tests" / "autonomia-operacional.test.js"
P7_TEST = ROOT / "tests" / "modularizacao-p7.test.js"
DOC = ROOT / "docs" / "P7_MODULARIZACAO_PEDIDOS.md"

FUNCOES = [
    "precoMonteSua_",
    "normalizarPedidoOnline_",
    "registrarPedidoOnline",
    "listarPedidosOnlinePendentes",
    "aceitarPedidoOnline",
    "recusarPedidoOnline",
    "normalizarPedidoPdv_",
    "registrarPedidoPdv",
    "atualizarPedidoPdv",
    "salvarVendaRealTime",
    "atualizarVendaRealTime",
]


def inicio_regex(code: str, i: int) -> bool:
    j = i - 1
    while j >= 0 and code[j].isspace():
        j -= 1
    if j < 0:
        return True
    if code[j] in "([{=:;,!&|?+-*%^~<>":
        return True
    prefix = code[max(0, j - 12):j + 1]
    return bool(re.search(r"(?:return|throw|case|delete|typeof|void|new)\s*$", prefix))


def fim_funcao(code: str, start: int) -> int:
    brace = code.find("{", start)
    if brace < 0:
        raise RuntimeError("Abertura da função não encontrada")
    depth = 0
    i = brace
    string = None
    line_comment = False
    block_comment = False
    regex = False
    char_class = False
    escaped = False

    while i < len(code):
        ch = code[i]
        nxt = code[i + 1] if i + 1 < len(code) else ""

        if line_comment:
            if ch == "\n":
                line_comment = False
            i += 1
            continue
        if block_comment:
            if ch == "*" and nxt == "/":
                block_comment = False
                i += 2
            else:
                i += 1
            continue
        if string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == string:
                string = None
            i += 1
            continue
        if regex:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "[":
                char_class = True
            elif ch == "]" and char_class:
                char_class = False
            elif ch == "/" and not char_class:
                regex = False
            i += 1
            continue

        if ch == "/" and nxt == "/":
            line_comment = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            block_comment = True
            i += 2
            continue
        if ch in ("'", '"', "`"):
            string = ch
            i += 1
            continue
        if ch == "/" and inicio_regex(code, i):
            regex = True
            char_class = False
            i += 1
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                while end < len(code) and code[end] in " \t":
                    end += 1
                if end < len(code) and code[end] == "\r":
                    end += 1
                if end < len(code) and code[end] == "\n":
                    end += 1
                return end
        i += 1
    raise RuntimeError("Fim da função não encontrado")


def extrair_funcoes(code: str):
    spans = []
    blocos = []
    for nome in FUNCOES:
        m = re.search(rf"(?m)^function\s+{re.escape(nome)}\s*\(", code)
        if not m:
            raise RuntimeError(f"Função esperada não encontrada: {nome}")
        start = m.start()
        end = fim_funcao(code, start)
        spans.append((start, end, nome))
    spans.sort()
    for idx in range(1, len(spans)):
        if spans[idx][0] < spans[idx - 1][1]:
            raise RuntimeError(f"Blocos sobrepostos: {spans[idx - 1][2]} / {spans[idx][2]}")
    for start, end, nome in spans:
        blocos.append((start, nome, code[start:end].rstrip()))
    novo = code
    for start, end, nome in reversed(spans):
        novo = novo[:start] + novo[end:]
    novo = re.sub(r"\n{4,}", "\n\n\n", novo).rstrip() + "\n"
    return novo, blocos


code = CODE_PATH.read_text(encoding="utf-8")
novo_code, blocos = extrair_funcoes(code)

header = """// =========================================================\n// P7 — SERVIÇO DE PEDIDOS\n// Validação, pedidos online e criação/atualização do PDV.\n// Persistência de filas permanece em SheetsRepository.gs.\n// =========================================================\n\n"""
service = header + "\n\n".join(bloco for _, _, bloco in sorted(blocos)) + "\n"

for nome in FUNCOES:
    if not re.search(rf"function\s+{re.escape(nome)}\s*\(", service):
        raise RuntimeError(f"Função não foi movida para PedidoService: {nome}")
    if re.search(rf"function\s+{re.escape(nome)}\s*\(", novo_code):
        raise RuntimeError(f"Função permaneceu duplicada em Code.gs: {nome}")

CODE_PATH.write_text(novo_code, encoding="utf-8")
SERVICE_PATH.write_text(service, encoding="utf-8")

# O teste P1 deve validar o bundle modular, pois precoMonteSua_ e a validação de adicionais
# agora pertencem ao PedidoService.
autonomia = AUTONOMIA_TEST.read_text(encoding="utf-8")
antigo = '  const code = fs.readFileSync(path.join(root, "apps-script/Code.gs"), "utf8");'
novo = '''  const appsScriptDir = path.join(root, "apps-script");\n  const code = fs.readdirSync(appsScriptDir)\n    .filter(nome => nome.endsWith(".gs"))\n    .sort()\n    .map(nome => fs.readFileSync(path.join(appsScriptDir, nome), "utf8"))\n    .join("\\n\\n");'''
if antigo not in autonomia:
    raise RuntimeError("Trecho esperado do teste autonomia-operacional não encontrado")
autonomia = autonomia.replace(antigo, novo, 1)
AUTONOMIA_TEST.write_text(autonomia, encoding="utf-8")

P7_TEST.write_text(r'''const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const dir = path.join(__dirname, "..", "apps-script");
const read = nome => fs.readFileSync(path.join(dir, nome), "utf8");
const code = read("Code.gs");
const pedido = read("PedidoService.gs");
const api = read("Api.gs");
const all = fs.readdirSync(dir)
  .filter(nome => nome.endsWith(".gs"))
  .sort()
  .map(read)
  .join("\n\n");

const funcoesPedido = [
  "precoMonteSua_",
  "normalizarPedidoOnline_",
  "registrarPedidoOnline",
  "listarPedidosOnlinePendentes",
  "aceitarPedidoOnline",
  "recusarPedidoOnline",
  "normalizarPedidoPdv_",
  "registrarPedidoPdv",
  "atualizarPedidoPdv",
  "salvarVendaRealTime",
  "atualizarVendaRealTime"
];

test("P7 concentra fluxo de pedidos no PedidoService sem duplicação", () => {
  for (const nome of funcoesPedido) {
    assert.match(pedido, new RegExp(`function\\s+${nome}\\s*\\(`));
    assert.doesNotMatch(code, new RegExp(`function\\s+${nome}\\s*\\(`));
  }
});

test("PedidoService usa repositories existentes para as filas", () => {
  assert.match(pedido, /carregarFilaPedidosOnlinePendentes_\(\)/);
  assert.match(pedido, /substituirFilaPedidosOnlinePendentes_\(/);
  assert.match(pedido, /carregarFilaPdvAtivos_\(\)/);
  assert.match(pedido, /substituirFilaPdvAtivos_\(/);
  assert.doesNotMatch(pedido, /setProperty\(["']pdv_vendas_ativas["']/);
  assert.doesNotMatch(pedido, /setProperty\(["']pedidos_online_pendentes["']/);
});

test("P7 preserva contratos da API para pedidos", () => {
  for (const acao of [
    "registrarPedidoOnline",
    "listarPedidosOnlinePendentes",
    "aceitarPedidoOnline",
    "recusarPedidoOnline",
    "salvarVendaRealTime",
    "atualizarVendaRealTime",
    "registrarPedidoPdv",
    "atualizarPedidoPdv"
  ]) {
    assert.match(api, new RegExp(`"${acao}"`));
  }
});

test("P7 não mistura histórico, fechamento ou relatórios no PedidoService", () => {
  for (const foraDoEscopo of [
    "moverParaHistorico",
    "moverParaCancelados",
    "fecharMesRelatorioEliel",
    "obterRelatorioEliel"
  ]) {
    assert.doesNotMatch(pedido, new RegExp(`function\\s+${foraDoEscopo}\\s*\\(`));
  }
});

test("bundle completo continua sintaticamente válido após P7", () => {
  assert.doesNotThrow(() => new vm.Script(all, { filename: "AppsScript.bundle.gs" }));
});
''', encoding="utf-8")

DOC.write_text('''# P7 — Modularização do serviço de pedidos\n\n## Objetivo\n\nSeparar do `Code.gs` a lógica específica de pedidos sem alterar contratos públicos, payloads, regras comerciais ou persistência.\n\n## Novo módulo\n\n`apps-script/PedidoService.gs` passa a concentrar:\n\n- preço/validação do **Monte Sua** usada em pedidos;\n- normalização de pedidos online;\n- registro, listagem, aceite e recusa de pedidos online;\n- normalização, criação e atualização de pedidos do PDV;\n- wrappers legados `salvarVendaRealTime` e `atualizarVendaRealTime`.\n\nA persistência das filas continua em `SheetsRepository.gs`. Autenticação e roteamento continuam em `AuthService.gs` e `Api.gs`.\n\n## Fora do escopo\n\nNão foram movidos nesta etapa histórico, cancelamentos, fechamento mensal, relatórios, catálogo ou configuração operacional.\n\n## Deploy manual\n\nAntes de substituir o `Code.gs` no Apps Script, crie `PedidoService.gs` e cole o conteúdo correspondente da `main`. Mantenha todos os módulos P5/P6 existentes. Depois publique uma nova versão da implantação atual preservando o mesmo `/exec`.\n\n## Rollback\n\nReverter o squash commit do P7 restaura as funções ao `Code.gs` anterior.\n''', encoding="utf-8")
