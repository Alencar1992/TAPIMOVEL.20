from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = ROOT / "apps-script" / "Code.gs"
MODULE_PATH = ROOT / "apps-script" / "FechamentoService.gs"
PREFLIGHT_PATH = ROOT / "scripts" / "validate-apps-script-deploy.js"
DEPLOY_TEST_PATH = ROOT / "tests" / "deploy-p8.test.js"
P9_TEST_PATH = ROOT / "tests" / "modularizacao-p9.test.js"
DOC_PATH = ROOT / "docs" / "P9_MODULARIZACAO_FECHAMENTO.md"

TARGET_FUNCTIONS = [
    "obterAbaFechamentosMensaisV2_",
    "obterAbaControleOperacoes_",
    "localizarLinhaPorChave_",
    "obterEstadoOperacaoFechamento_",
    "atualizarEstadoOperacaoFechamento_",
    "normalizarReferenciaFechamentoMensal_",
    "obterDataReferenciaPedidoFechamento_",
    "chaveMesDaDataFechamento_",
    "obterPedidosPendentesFechamentoEliel_",
    "obterChavesFechamentosExistentes_",
    "obterPersistenciaFechamento_",
    "montarPreviaFechamentoRelatorioEliel_",
    "obterPreviaFechamentoRelatorioEliel",
    "garantirRegistroRelatorioEliel_",
    "garantirRegistroFechamentoMensalV2_",
    "garantirLogFechamentoEliel_",
    "fecharMesRelatorioEliel",
]

TARGET_CONSTANTS = [
    "ABA_FECHAMENTOS_MENSAIS_V2_",
    "ABA_CONTROLE_OPERACOES_",
    "TIPO_OPERACAO_FECHAMENTO_MENSAL_",
    "STATUS_OPERACAO_PROCESSANDO_",
    "STATUS_OPERACAO_CONCLUIDO_",
    "STATUS_OPERACAO_ERRO_",
]


def extract_function(source: str, name: str):
    match = re.search(rf"(?m)^function\s+{re.escape(name)}\s*\(", source)
    if not match:
        raise RuntimeError(f"Função não encontrada em Code.gs: {name}")
    start = match.start()
    brace = source.find("{", match.end())
    if brace < 0:
        raise RuntimeError(f"Abertura de bloco não encontrada: {name}")

    depth = 0
    i = brace
    state = "normal"
    escaped = False
    regex_class = False
    prev_sig = ""

    while i < len(source):
        ch = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else ""

        if state in ("single", "double", "template"):
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif (state == "single" and ch == "'") or (state == "double" and ch == '"') or (state == "template" and ch == "`"):
                state = "normal"
            i += 1
            continue

        if state == "line_comment":
            if ch == "\n":
                state = "normal"
            i += 1
            continue

        if state == "block_comment":
            if ch == "*" and nxt == "/":
                state = "normal"
                i += 2
            else:
                i += 1
            continue

        if state == "regex":
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == "[":
                regex_class = True
            elif ch == "]":
                regex_class = False
            elif ch == "/" and not regex_class:
                state = "normal"
                i += 1
                while i < len(source) and source[i].isalpha():
                    i += 1
                continue
            i += 1
            continue

        if ch == "/" and nxt == "/":
            state = "line_comment"
            i += 2
            continue
        if ch == "/" and nxt == "*":
            state = "block_comment"
            i += 2
            continue
        if ch == "'":
            state = "single"
            i += 1
            continue
        if ch == '"':
            state = "double"
            i += 1
            continue
        if ch == "`":
            state = "template"
            i += 1
            continue
        if ch == "/" and prev_sig in ("", "(", "[", "{", "=", ":", ",", ";", "!", "?", "&", "|", "+", "-", "*", "%", "<", ">"):
            state = "regex"
            regex_class = False
            i += 1
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                while end < len(source) and source[end] in " \t":
                    end += 1
                if end < len(source) and source[end] == "\r":
                    end += 1
                if end < len(source) and source[end] == "\n":
                    end += 1
                return source[start:end], start, end
        if not ch.isspace():
            prev_sig = ch
        i += 1

    raise RuntimeError(f"Fim da função não encontrado: {name}")


def replace_once(text: str, old: str, new: str, label: str):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Substituição {label} esperava 1 ocorrência; encontrou {count}.")
    return text.replace(old, new, 1)


def main():
    code = CODE_PATH.read_text(encoding="utf-8")
    extracted = []

    # Extrai funções da versão original e depois remove de trás para frente.
    ranges = []
    for name in TARGET_FUNCTIONS:
        block, start, end = extract_function(code, name)
        extracted.append((start, name, block.rstrip()))
        ranges.append((start, end, name))

    for start, end, name in sorted(ranges, reverse=True):
        code = code[:start] + code[end:]

    constants = []
    for name in TARGET_CONSTANTS:
        pattern = re.compile(rf"(?m)^const\s+{re.escape(name)}\s*=\s*[^;]+;\s*\n?")
        match = pattern.search(code)
        if not match:
            raise RuntimeError(f"Constante não encontrada em Code.gs: {name}")
        constants.append(match.group(0).strip())
        code = code[:match.start()] + code[match.end():]

    module = "\n".join([
        "// =========================================================",
        "// P9 — SERVIÇO DE FECHAMENTO MENSAL",
        "// Prévia, idempotência, recuperação e persistência do fechamento.",
        "// Cálculo do Relatório Eliel permanece fora deste módulo.",
        "// =========================================================",
        "",
        *constants,
        "",
        *[block for _, _, block in sorted(extracted)],
        "",
    ])

    # Guarda contra extração incompleta/duplicada.
    for name in TARGET_FUNCTIONS:
        if f"function {name}(" not in module:
            raise RuntimeError(f"Função ausente no novo módulo: {name}")
        if re.search(rf"(?m)^function\s+{re.escape(name)}\s*\(", code):
            raise RuntimeError(f"Função ainda duplicada em Code.gs: {name}")
    for name in TARGET_CONSTANTS:
        if name not in module:
            raise RuntimeError(f"Constante ausente no novo módulo: {name}")
        if re.search(rf"(?m)^const\s+{re.escape(name)}\b", code):
            raise RuntimeError(f"Constante ainda duplicada em Code.gs: {name}")

    CODE_PATH.write_text(code, encoding="utf-8")
    MODULE_PATH.write_text(module, encoding="utf-8")

    preflight = PREFLIGHT_PATH.read_text(encoding="utf-8")
    preflight = replace_once(
        preflight,
        "  'Code.gs',\n  'PedidoService.gs',",
        "  'Code.gs',\n  'FechamentoService.gs',\n  'PedidoService.gs',",
        "preflight FechamentoService",
    )
    preflight = replace_once(
        preflight,
        "  'function registrarPedidoPdv',\n  'function carregarFilaPdvAtivos_',",
        "  'function registrarPedidoPdv',\n  'function obterPreviaFechamentoRelatorioEliel',\n  'function fecharMesRelatorioEliel',\n  'function carregarFilaPdvAtivos_',",
        "preflight contratos de fechamento",
    )
    PREFLIGHT_PATH.write_text(preflight, encoding="utf-8")

    deploy_test = DEPLOY_TEST_PATH.read_text(encoding="utf-8")
    deploy_test = replace_once(
        deploy_test,
        "    'Code.gs',\n    'PedidoService.gs',",
        "    'Code.gs',\n    'FechamentoService.gs',\n    'PedidoService.gs',",
        "teste P8 módulo P9",
    )
    DEPLOY_TEST_PATH.write_text(deploy_test, encoding="utf-8")

    target_js = ",\n  ".join([f"'{name}'" for name in TARGET_FUNCTIONS])
    const_js = ",\n  ".join([f"'{name}'" for name in TARGET_CONSTANTS])
    P9_TEST_PATH.write_text(f'''const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const code = read('apps-script/Code.gs');
const fechamento = read('apps-script/FechamentoService.gs');
const api = read('apps-script/Api.gs');

const funcoes = [
  {target_js}
];
const constantes = [
  {const_js}
];

test('P9 concentra o fechamento mensal no FechamentoService sem duplicação', () => {{
  for (const nome of funcoes) {{
    assert.match(fechamento, new RegExp(`function\\s+${{nome}}\\s*\\(`));
    assert.doesNotMatch(code, new RegExp(`function\\s+${{nome}}\\s*\\(`));
  }}
  for (const nome of constantes) {{
    assert.match(fechamento, new RegExp(`const\\s+${{nome}}\\b`));
    assert.doesNotMatch(code, new RegExp(`const\\s+${{nome}}\\b`));
  }}
}});

test('P9 preserva os contratos públicos e a autorização do CEO Eliel na API', () => {{
  assert.match(api, /"obterPreviaFechamentoRelatorioEliel"/);
  assert.match(api, /"fecharMesRelatorioEliel"/);
  assert.match(api, /action === "fecharMesRelatorioEliel"/);
  assert.match(api, /sessao\.perfil !== "eliel"/);
}});

test('FechamentoService mantém idempotência, recuperação e bloqueio de pendências', () => {{
  assert.match(fechamento, /STATUS_OPERACAO_PROCESSANDO_/);
  assert.match(fechamento, /STATUS_OPERACAO_CONCLUIDO_/);
  assert.match(fechamento, /STATUS_OPERACAO_ERRO_/);
  assert.match(fechamento, /recuperavel/);
  assert.match(fechamento, /pedidosPendentes/);
  assert.match(fechamento, /carregarFilaPdvAtivos_/);
  assert.match(fechamento, /Fechamentos_Mensais_v2/);
  assert.doesNotMatch(fechamento, /function obterRelatorioEliel\s*\(/);
  assert.doesNotMatch(fechamento, /function obterHistoricoVendasEliel\s*\(/);
}});

test('bundle completo continua sintaticamente válido após o P9', () => {{
  const dir = path.join(root, 'apps-script');
  const bundle = fs.readdirSync(dir)
    .filter(nome => nome.endsWith('.gs'))
    .sort()
    .map(nome => fs.readFileSync(path.join(dir, nome), 'utf8'))
    .join('\\n\\n');
  assert.doesNotThrow(() => new vm.Script(bundle));
}});
''', encoding="utf-8")

    DOC_PATH.write_text('''# P9 — Modularização do fechamento mensal\n\n## Objetivo\n\nExtrair do `Code.gs` o domínio crítico de fechamento mensal para `apps-script/FechamentoService.gs`, sem alterar contratos públicos, regras financeiras, autorização do CEO Eliel ou persistência existente.\n\n## Escopo movido\n\nO novo serviço concentra:\n\n- máquina de estado em `Controle_Operacoes`;\n- persistência em `Fechamentos_Mensais_v2`;\n- normalização de referência mensal;\n- detecção de pedidos pendentes do período;\n- prévia do fechamento;\n- idempotência e recuperação após falha parcial;\n- gravação no Relatório Eliel e log do fechamento;\n- operação pública `fecharMesRelatorioEliel`.\n\n## Fora do escopo\n\nPermanecem no `Code.gs` nesta etapa:\n\n- cálculo de `obterRelatorioEliel`;\n- configurações do Relatório Eliel;\n- histórico de vendas;\n- ranking, exportações e demais relatórios;\n- fechamento diário.\n\nEssa separação evita misturar cálculo analítico com a transação crítica de fechamento.\n\n## Compatibilidade\n\n`Api.gs` não muda seus nomes de ação. `obterPreviaFechamentoRelatorioEliel` e `fecharMesRelatorioEliel` continuam globais no bundle do Apps Script, portanto o frontend e o `/exec` permanecem compatíveis.\n\n## Deploy\n\nO preflight do P8 passa a exigir `FechamentoService.gs`, evitando publicação incompleta. Após merge, usar exclusivamente o workflow `Deploy Apps Script - produção` com `PUBLICAR` e aprovação do environment.\n\n## Rollback\n\nReverter o squash commit do P9 e executar novamente o workflow de produção restaura a versão anterior no mesmo deployment.\n''', encoding="utf-8")

    print(f"P9 aplicado: {len(TARGET_FUNCTIONS)} funções e {len(TARGET_CONSTANTS)} constantes movidas.")


if __name__ == "__main__":
    main()
