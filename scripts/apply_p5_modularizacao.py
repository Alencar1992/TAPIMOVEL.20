from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = ROOT / "apps-script" / "Code.gs"


def extract_function(source: str, name: str):
    match = re.search(rf"(?m)^function\s+{re.escape(name)}\s*\(", source)
    if not match:
        raise RuntimeError(f"Função não encontrada: {name}")

    brace = source.find("{", match.end())
    if brace < 0:
        raise RuntimeError(f"Abertura da função não encontrada: {name}")

    depth = 0
    i = brace
    state = "normal"
    escaped = False
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
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif state == "single" and ch == "'":
                state = "normal"
            elif state == "double" and ch == '"':
                state = "normal"
            elif state == "template" and ch == "`":
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
                    while end < len(source) and source[end] in " \t\r\n":
                        end += 1
                    block = source[match.start(): i + 1].rstrip() + "\n"
                    updated = source[:match.start()] + source[end:]
                    return updated, block
        i += 1

    raise RuntimeError(f"Fechamento da função não encontrado: {name}")


def extract_many(source: str, names):
    blocks = []
    for name in names:
        source, block = extract_function(source, name)
        blocks.append(block)
    return source, "\n".join(blocks).rstrip() + "\n"


code = CODE_PATH.read_text(encoding="utf-8")

security_functions = [
    "obterDiaSessaoAdmin_",
    "hashSeguro_",
    "erroApi_",
    "criarSessaoAcesso_",
    "obterSessaoAcesso_",
    "exigirSessaoAdministrador_",
]

sheets_functions = [
    "obterOuCriarAbaConfigOperacional_",
    "linhasAbaConfigOperacional_",
    "reescreverAbaConfigOperacional_",
    "booleanoConfiguracaoSheets_",
    "lerConfiguracaoOperacionalSheets_",
    "gravarConfiguracaoOperacionalSheets_",
    "obterOuCriarAbaFila_",
    "valorStorageSeguro_",
    "chavePersistenciaPedido_",
    "lerFilaDaAba_",
    "gravarFilaNaAba_",
    "mesclarFilasSemDuplicar_",
    "migrarFilaLegadaSeNecessario_",
    "carregarFilaPdvAtivos_",
    "substituirFilaPdvAtivos_",
    "carregarFilaPedidosOnlinePendentes_",
    "substituirFilaPedidosOnlinePendentes_",
]

properties_functions = [
    "catalogoConfigurado_",
    "salvarCatalogoConfigurado_",
]

code, security_body = extract_many(code, security_functions)
code, sheets_body = extract_many(code, sheets_functions)
code, properties_body = extract_many(code, properties_functions)

# Centraliza o ponto de entrada do PropertiesService sem alterar os contratos dos chamadores.
code = code.replace("PropertiesService.getScriptProperties()", "obterScriptProperties_()")
sheets_body = sheets_body.replace("PropertiesService.getScriptProperties()", "obterScriptProperties_()")
properties_body = properties_body.replace("PropertiesService.getScriptProperties()", "obterScriptProperties_()")

security_module = """// =========================================================
// P5 — UTILITÁRIOS DE SEGURANÇA
// Funções internas compartilhadas. Contratos públicos permanecem em Code.gs.
// =========================================================

""" + security_body

properties_module = """// =========================================================
// P5 — REPOSITÓRIO DE PROPRIEDADES
// Único ponto de acesso direto ao ScriptProperties.
// =========================================================

function obterScriptProperties_() {
  return PropertiesService.getScriptProperties();
}

""" + properties_body

sheets_module = """// =========================================================
// P5 — REPOSITÓRIO GOOGLE SHEETS
// Persistência estruturada de configuração operacional e filas.
// =========================================================

""" + sheets_body

# Invariantes da extração.
for name in security_functions + sheets_functions + properties_functions:
    if re.search(rf"(?m)^function\s+{re.escape(name)}\s*\(", code):
        raise RuntimeError(f"Função ainda permaneceu em Code.gs: {name}")

if "PropertiesService.getScriptProperties()" in code:
    raise RuntimeError("Code.gs ainda acessa PropertiesService diretamente")
if "PropertiesService.getScriptProperties()" in sheets_module:
    raise RuntimeError("SheetsRepository.gs acessa PropertiesService diretamente")

CODE_PATH.write_text(code.rstrip() + "\n", encoding="utf-8")
(ROOT / "apps-script" / "SecurityUtils.gs").write_text(security_module.rstrip() + "\n", encoding="utf-8")
(ROOT / "apps-script" / "PropertiesRepository.gs").write_text(properties_module.rstrip() + "\n", encoding="utf-8")
(ROOT / "apps-script" / "SheetsRepository.gs").write_text(sheets_module.rstrip() + "\n", encoding="utf-8")

# backend-security: executar o bundle de todos os .gs, como o Apps Script faz no projeto.
backend = ROOT / "tests" / "backend-security.test.js"
text = backend.read_text(encoding="utf-8")
old = '''  const code = fs.readFileSync(\n    path.join(__dirname, "../apps-script/Code.gs"),\n    "utf8"\n  );\n  vm.runInContext(code, context, { filename: "Code.gs" });'''
new = '''  const appsScriptDir = path.join(__dirname, "../apps-script");\n  const arquivosGs = fs.readdirSync(appsScriptDir)\n    .filter(nome => nome.endsWith(".gs"))\n    .sort();\n  const code = arquivosGs\n    .map(nome => fs.readFileSync(path.join(appsScriptDir, nome), "utf8"))\n    .join("\\n\\n");\n  vm.runInContext(code, context, { filename: "AppsScript.bundle.gs" });'''
if old not in text:
    raise RuntimeError("Trecho de carregamento não encontrado em backend-security.test.js")
backend.write_text(text.replace(old, new), encoding="utf-8")

# config-operacional-sheets: as verificações passam a enxergar todos os módulos.
config_test = ROOT / "tests" / "config-operacional-sheets.test.js"
text = config_test.read_text(encoding="utf-8")
old = 'const code = fs.readFileSync(path.join(__dirname, "../apps-script/Code.gs"), "utf8");'
new = '''const appsScriptDir = path.join(__dirname, "../apps-script");\nconst code = fs.readdirSync(appsScriptDir)\n  .filter(nome => nome.endsWith(".gs"))\n  .sort()\n  .map(nome => fs.readFileSync(path.join(appsScriptDir, nome), "utf8"))\n  .join("\\n\\n");'''
if old not in text:
    raise RuntimeError("Trecho não encontrado em config-operacional-sheets.test.js")
config_test.write_text(text.replace(old, new), encoding="utf-8")

# storage-sheets: usa bundle para asserts e o módulo de Sheets para o teste unitário de storage.
storage_test = ROOT / "tests" / "storage-sheets.test.js"
text = storage_test.read_text(encoding="utf-8")
old = 'const code = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");'
new = '''const appsScriptDir = path.join(__dirname, "..", "apps-script");\nconst codeGs = fs.readFileSync(path.join(appsScriptDir, "Code.gs"), "utf8");\nconst sheetsRepository = fs.readFileSync(path.join(appsScriptDir, "SheetsRepository.gs"), "utf8");\nconst propertiesRepository = fs.readFileSync(path.join(appsScriptDir, "PropertiesRepository.gs"), "utf8");\nconst code = fs.readdirSync(appsScriptDir)\n  .filter(nome => nome.endsWith(".gs"))\n  .sort()\n  .map(nome => fs.readFileSync(path.join(appsScriptDir, nome), "utf8"))\n  .join("\\n\\n");'''
if old not in text:
    raise RuntimeError("Declaração code não encontrada em storage-sheets.test.js")
text = text.replace(old, new)
old = '''  const inicio = code.indexOf("// STORAGE RESILIENTE — FILAS NO GOOGLE SHEETS");\n  const fim = code.indexOf("// 2. SISTEMA DE NUVEM (BLINDADO COM LOCKSERVICE)");\n  assert.ok(inicio >= 0 && fim > inicio, "bloco de storage deve existir");\n  const bloco = code.slice(inicio, fim) + `\\nthis.__storage = {\n    carregarFilaPdvAtivos_, substituirFilaPdvAtivos_,\n    carregarFilaPedidosOnlinePendentes_, substituirFilaPedidosOnlinePendentes_\n  };`;'''
new = '''  const inicio = codeGs.indexOf("// STORAGE RESILIENTE — FILAS NO GOOGLE SHEETS");\n  const fim = codeGs.indexOf("// 2. SISTEMA DE NUVEM (BLINDADO COM LOCKSERVICE)");\n  assert.ok(inicio >= 0 && fim > inicio, "constantes do storage devem existir");\n  const constantes = codeGs.slice(inicio, fim);\n  const bloco = constantes + "\\n" + propertiesRepository + "\\n" + sheetsRepository + `\\nthis.__storage = {\n    carregarFilaPdvAtivos_, substituirFilaPdvAtivos_,\n    carregarFilaPedidosOnlinePendentes_, substituirFilaPedidosOnlinePendentes_\n  };`;'''
if old not in text:
    raise RuntimeError("Bloco runtime de storage não encontrado")
storage_test.write_text(text.replace(old, new), encoding="utf-8")

# Novo teste estrutural específico do P5.
p5_test = ROOT / "tests" / "modularizacao-p5.test.js"
p5_test.write_text(r'''const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const dir = path.join(__dirname, "..", "apps-script");
const read = nome => fs.readFileSync(path.join(dir, nome), "utf8");
const code = read("Code.gs");
const sheets = read("SheetsRepository.gs");
const props = read("PropertiesRepository.gs");
const security = read("SecurityUtils.gs");
const all = fs.readdirSync(dir)
  .filter(nome => nome.endsWith(".gs"))
  .sort()
  .map(read)
  .join("\n\n");

test("P5 cria os três módulos sem duplicar helpers em Code.gs", () => {
  assert.match(sheets, /function obterOuCriarAbaFila_\(/);
  assert.match(sheets, /function lerConfiguracaoOperacionalSheets_\(/);
  assert.match(props, /function obterScriptProperties_\(/);
  assert.match(props, /function catalogoConfigurado_\(/);
  assert.match(security, /function hashSeguro_\(/);
  assert.match(security, /function obterSessaoAcesso_\(/);

  for (const nome of [
    "obterOuCriarAbaFila_",
    "lerConfiguracaoOperacionalSheets_",
    "catalogoConfigurado_",
    "hashSeguro_",
    "obterSessaoAcesso_"
  ]) {
    assert.doesNotMatch(code, new RegExp(`function\\s+${nome}\\s*\\(`));
  }
});

test("PropertiesService direto fica isolado no PropertiesRepository", () => {
  assert.doesNotMatch(code, /PropertiesService\.getScriptProperties\(\)/);
  assert.doesNotMatch(sheets, /PropertiesService\.getScriptProperties\(\)/);
  assert.doesNotMatch(security, /PropertiesService\.getScriptProperties\(\)/);
  assert.equal((props.match(/PropertiesService\.getScriptProperties\(\)/g) || []).length, 1);
});

test("bundle completo de Apps Script continua sintaticamente válido", () => {
  assert.doesNotThrow(() => new vm.Script(all, { filename: "AppsScript.bundle.gs" }));
});

test("contratos públicos críticos continuam no Code.gs", () => {
  for (const assinatura of [
    /function loginAdministrador\(pin\)/,
    /function obterConfiguracaoOperacional\(\)/,
    /function salvarConfiguracaoOperacional\(configJSON, responsavel\)/,
    /function carregarDadosNuvem\(\)/,
    /function salvarNuvemCompleta\(historicoJSON\)/,
    /function listarPedidosOnlinePendentes\(\)/
  ]) assert.match(code, assinatura);
});
''', encoding="utf-8")

# CI: passa a validar todos os arquivos Apps Script e o bundle combinado.
quality = ROOT / "scripts" / "quality-check.js"
text = quality.read_text(encoding="utf-8")
text = text.replace(
    'checkSyntax("apps-script/Code.gs");\nfor (const rel of walk("frontend", new Set([".js"]))) checkSyntax(rel);',
    '''const appsScriptFiles = walk("apps-script", new Set([".gs"])).sort();\nfor (const rel of appsScriptFiles) checkSyntax(rel);\nnew vm.Script(appsScriptFiles.map(read).join("\\n\\n"), { filename: "AppsScript.bundle.gs" });\nconsole.log("Sintaxe OK: bundle completo do Apps Script");\nfor (const rel of walk("frontend", new Set([".js"]))) checkSyntax(rel);'''
)
text = text.replace(
    '''const conflictFiles = [\n  "apps-script/Code.gs",''',
    '''const conflictFiles = [\n  ...appsScriptFiles,'''
)
text = text.replace(
    'const code = read("apps-script/Code.gs");',
    'const code = appsScriptFiles.map(read).join("\\n\\n");'
)
quality.write_text(text, encoding="utf-8")

# Documentação do passo estrutural.
doc = ROOT / "docs" / "P5_MODULARIZACAO_REPOSITORIES.md"
doc.write_text('''# P5 — Modularização segura do Code.gs\n\n## Objetivo\n\nReduzir o acoplamento físico do `Code.gs` sem alterar contratos públicos, regras de negócio, dados ou endpoints.\n\n## Módulos criados\n\n- `apps-script/SheetsRepository.gs`: helpers de persistência em Google Sheets para configuração operacional e filas.\n- `apps-script/PropertiesRepository.gs`: ponto único de acesso direto ao `ScriptProperties` e persistência do catálogo legado.\n- `apps-script/SecurityUtils.gs`: hashing, sessão e erros internos de segurança.\n\n## Garantias\n\n- As funções públicas continuam com as mesmas assinaturas em `Code.gs`.\n- Nenhuma aba, chave ou formato de payload foi renomeado.\n- `PropertiesService.getScriptProperties()` fica isolado no `PropertiesRepository.gs`.\n- O CI compila cada `.gs` individualmente e também o bundle completo.\n- Os testes de backend passam a carregar todos os módulos do Apps Script.\n\n## Deploy\n\nEste P5 exige que, no próximo deploy manual do Apps Script, os três novos arquivos `.gs` também sejam adicionados ao projeto oficial. Não publicar apenas o `Code.gs` modularizado sem os módulos, pois as funções movidas são dependências do backend.\n''', encoding="utf-8")

print("P5 aplicado com sucesso.")
