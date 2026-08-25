from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = ROOT / "apps-script" / "Code.gs"
API_PATH = ROOT / "apps-script" / "Api.gs"
AUTH_PATH = ROOT / "apps-script" / "AuthService.gs"
P5_TEST_PATH = ROOT / "tests" / "modularizacao-p5.test.js"
P6_TEST_PATH = ROOT / "tests" / "modularizacao-p6.test.js"
DOC_PATH = ROOT / "docs" / "P6_MODULARIZACAO_API_AUTH.md"


def function_span(source, name):
    match = re.search(rf"(?m)^function\s+{re.escape(name)}\s*\(", source)
    if not match:
        raise RuntimeError(f"Função não encontrada: {name}")
    start = match.start()
    brace = source.find("{", match.end())
    if brace < 0:
        raise RuntimeError(f"Abertura da função não encontrada: {name}")

    depth = 0
    state = "normal"
    escape = False
    i = brace
    while i < len(source):
        ch = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else ""

        if state == "line_comment":
            if ch == "\n":
                state = "normal"
        elif state == "block_comment":
            if ch == "*" and nxt == "/":
                state = "normal"
                i += 1
        elif state in ("single", "double", "template"):
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif (state == "single" and ch == "'") or (state == "double" and ch == '"') or (state == "template" and ch == "`"):
                state = "normal"
        else:
            if ch == "/" and nxt == "/":
                state = "line_comment"
                i += 1
            elif ch == "/" and nxt == "*":
                state = "block_comment"
                i += 1
            elif ch == "'":
                state = "single"
            elif ch == '"':
                state = "double"
            elif ch == "`":
                state = "template"
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    end = i + 1
                    while end < len(source) and source[end] in " \t":
                        end += 1
                    if end < len(source) and source[end] == "\n":
                        end += 1
                    if end < len(source) and source[end] == "\n":
                        end += 1
                    return start, end
        i += 1
    raise RuntimeError(f"Fim da função não encontrado: {name}")


def move_functions(source, names):
    spans = []
    snippets = []
    for name in names:
        start, end = function_span(source, name)
        spans.append((start, end, name))
        snippets.append((start, source[start:end].strip()))
    updated = source
    for start, end, _name in sorted(spans, reverse=True):
        updated = updated[:start] + updated[end:]
    updated = re.sub(r"\n{4,}", "\n\n\n", updated)
    return updated, [snippet for _start, snippet in sorted(snippets)]


code = CODE_PATH.read_text(encoding="utf-8")

auth_names = [
    "configurarPinAdministrador",
    "configurarPinEliel",
    "loginAcesso",
    "loginAdministrador",
    "validarSessaoAcesso",
    "validarSessaoAdministrador",
    "encerrarSessaoAdministrador",
]
api_names = [
    "doGet",
    "doPost",
    "executarAcaoApi_",
    "responderApi_",
]

code, auth_functions = move_functions(code, auth_names)
code, api_functions = move_functions(code, api_names)

CODE_PATH.write_text(code.rstrip() + "\n", encoding="utf-8")
AUTH_PATH.write_text(
    "// =========================================================\n"
    "// P6 — SERVIÇO DE AUTENTICAÇÃO\n"
    "// PINs, login e contratos públicos de sessão. Helpers internos ficam em SecurityUtils.gs.\n"
    "// =========================================================\n\n"
    + "\n\n".join(auth_functions)
    + "\n",
    encoding="utf-8",
)
API_PATH.write_text(
    "// =========================================================\n"
    "// P6 — CAMADA DE API\n"
    "// Entrada HTTP, roteamento seguro de ações e resposta JSON.\n"
    "// =========================================================\n\n"
    + "\n\n".join(api_functions)
    + "\n",
    encoding="utf-8",
)

p5 = P5_TEST_PATH.read_text(encoding="utf-8")
old = '''test("contratos públicos críticos continuam no Code.gs", () => {\n  for (const assinatura of [\n    /function loginAdministrador\\(pin\\)/,\n    /function obterConfiguracaoOperacional\\(\\)/,\n    /function salvarConfiguracaoOperacional\\(configJSON, responsavel\\)/,\n    /function carregarDadosNuvem\\(\\)/,\n    /function salvarNuvemCompleta\\(historicoJSON\\)/,\n    /function listarPedidosOnlinePendentes\\(\\)/\n  ]) assert.match(code, assinatura);\n});'''
new = '''test("contratos públicos críticos continuam no bundle modular", () => {\n  for (const assinatura of [\n    /function loginAdministrador\\(pin\\)/,\n    /function obterConfiguracaoOperacional\\(\\)/,\n    /function salvarConfiguracaoOperacional\\(configJSON, responsavel\\)/,\n    /function carregarDadosNuvem\\(\\)/,\n    /function salvarNuvemCompleta\\(historicoJSON\\)/,\n    /function listarPedidosOnlinePendentes\\(\\)/\n  ]) assert.match(all, assinatura);\n});'''
if old not in p5:
    raise RuntimeError("Bloco esperado do teste P5 não foi encontrado")
P5_TEST_PATH.write_text(p5.replace(old, new), encoding="utf-8")

P6_TEST_PATH.write_text(r'''const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const dir = path.join(__dirname, "..", "apps-script");
const read = nome => fs.readFileSync(path.join(dir, nome), "utf8");
const code = read("Code.gs");
const api = read("Api.gs");
const auth = read("AuthService.gs");
const security = read("SecurityUtils.gs");
const all = fs.readdirSync(dir)
  .filter(nome => nome.endsWith(".gs"))
  .sort()
  .map(read)
  .join("\n\n");

test("P6 separa entrada HTTP e autenticação sem duplicar funções no Code.gs", () => {
  const apiNames = ["doGet", "doPost", "executarAcaoApi_", "responderApi_"];
  const authNames = [
    "configurarPinAdministrador", "configurarPinEliel", "loginAcesso",
    "loginAdministrador", "validarSessaoAcesso", "validarSessaoAdministrador",
    "encerrarSessaoAdministrador"
  ];
  for (const nome of apiNames) {
    assert.match(api, new RegExp(`function\\s+${nome}\\s*\\(`));
    assert.doesNotMatch(code, new RegExp(`function\\s+${nome}\\s*\\(`));
  }
  for (const nome of authNames) {
    assert.match(auth, new RegExp(`function\\s+${nome}\\s*\\(`));
    assert.doesNotMatch(code, new RegExp(`function\\s+${nome}\\s*\\(`));
  }
});

test("API preserva contratos HTTP e allowlists de segurança", () => {
  for (const trecho of [
    "obterDisponibilidadeCardapio",
    "obterCatalogoCardapio",
    "obterStatusCardapio",
    "registrarPedidoOnline",
    "obterConfiguracaoOperacional",
    "listarPedidosOnlinePendentes",
    "fecharMesRelatorioEliel",
    "METHOD_NOT_ALLOWED",
    "ACTION_NOT_ALLOWED",
    "AUTH_REQUIRED"
  ]) assert.ok(api.includes(trecho), `Api.gs deve preservar ${trecho}`);
  assert.match(api, /function doGet\(e\)/);
  assert.match(api, /function doPost\(e\)/);
  assert.match(api, /ContentService\.MimeType\.JSON/);
});

test("AuthService preserva PINs e contratos públicos; helpers permanecem em SecurityUtils", () => {
  assert.match(auth, /\^\\d\{6,12\}\$/);
  assert.match(auth, /LOGIN_BLOCKED/);
  assert.match(auth, /INVALID_CREDENTIALS/);
  assert.match(auth, /NOME_PERFIL_ELIEL_/);
  assert.match(security, /function hashSeguro_\(/);
  assert.match(security, /function criarSessaoAcesso_\(/);
  assert.match(security, /function obterSessaoAcesso_\(/);
  assert.match(security, /function exigirSessaoAdministrador_\(/);
});

test("bundle completo continua sintaticamente válido após o P6", () => {
  assert.doesNotThrow(() => new vm.Script(all, { filename: "AppsScript.bundle.gs" }));
});
''', encoding="utf-8")

DOC_PATH.write_text('''# P6 — Modularização de API e autenticação\n\n## Objetivo\nSeparar a porta de entrada HTTP e a autenticação do `Code.gs` sem alterar contratos, URLs, PINs, sessões ou regras de autorização.\n\n## Novos arquivos\n- `apps-script/Api.gs`: `doGet`, `doPost`, roteamento/allowlists e resposta JSON.\n- `apps-script/AuthService.gs`: configuração dos PINs, login, validação e encerramento de sessão.\n\n## Mantidos\n- `SecurityUtils.gs`: hashing e helpers internos de sessão/autorização.\n- `SheetsRepository.gs`: persistência estruturada em Sheets.\n- `PropertiesRepository.gs`: acesso ao ScriptProperties.\n- `Code.gs`: regras de negócio e demais contratos.\n\n## Deploy manual\nAntes de substituir o `Code.gs`, crie no Apps Script os arquivos `Api.gs` e `AuthService.gs` e copie o conteúdo correspondente da `main`. O projeto publicado deve conter os seis scripts: `Code.gs`, `Api.gs`, `AuthService.gs`, `PropertiesRepository.gs`, `SecurityUtils.gs` e `SheetsRepository.gs`. Depois crie uma nova versão da implantação existente, preservando o mesmo `/exec`.\n\n## Smoke test\n1. Abrir a raiz da API e confirmar status online.\n2. Fazer login administrativo.\n3. Abrir PDV e Configuração Operacional.\n4. Abrir cardápio do cliente.\n5. Confirmar que uma ação administrativa sem token continua retornando `AUTH_REQUIRED`.\n\n## Rollback\nReverter o squash commit do P6 e restaurar o `Code.gs` anterior remove `Api.gs` e `AuthService.gs` da arquitetura.\n''', encoding="utf-8")

print("P6 aplicado com sucesso.")
