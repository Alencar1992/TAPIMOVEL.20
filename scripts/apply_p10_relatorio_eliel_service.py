from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CODE_PATH = ROOT / "apps-script" / "Code.gs"
MODULE_PATH = ROOT / "apps-script" / "RelatorioElielService.gs"
PREFLIGHT_PATH = ROOT / "scripts" / "validate-apps-script-deploy.js"
DEPLOY_TEST_PATH = ROOT / "tests" / "deploy-p8.test.js"
P10_TEST_PATH = ROOT / "tests" / "modularizacao-p10.test.js"
DOC_PATH = ROOT / "docs" / "P10_MODULARIZACAO_RELATORIO_ELIEL.md"

TARGET_FUNCTIONS = [
    "obterConfiguracoesRelatorioEliel",
    "dividirCombustivelRelatorioEliel_",
    "salvarConfiguracoesRelatorioEliel",
    "obterRelatorioEliel",
    "obterAbaRelatorioEliel_",
    "registrarAcessoRelatorioEliel",
    "obterHistoricoVendasEliel",
]

SHARED_HELPERS = [
    "normalizarNumero_",
    "extrairData_",
    "pertenceAoMes_",
    "chaveMes_",
    "nomeDia_",
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
    original = code
    extracted = []
    ranges = []

    for name in TARGET_FUNCTIONS:
        block, start, end = extract_function(original, name)
        extracted.append((start, name, block.rstrip()))
        ranges.append((start, end, name))

    for start, end, _ in sorted(ranges, reverse=True):
        code = code[:start] + code[end:]

    module = "\n".join([
        "// =========================================================",
        "// P10 — SERVIÇO DO RELATÓRIO ELIEL",
        "// Configuração financeira, indicadores, rankings, histórico e log de acesso.",
        "// O fechamento mensal permanece isolado em FechamentoService.gs.",
        "// =========================================================",
        "",
        *[block for _, _, block in sorted(extracted)],
        "",
    ])

    for name in TARGET_FUNCTIONS:
        if not re.search(rf"(?m)^function\s+{re.escape(name)}\s*\(", module):
            raise RuntimeError(f"Função ausente no novo módulo: {name}")
        if re.search(rf"(?m)^function\s+{re.escape(name)}\s*\(", code):
            raise RuntimeError(f"Função ainda duplicada em Code.gs: {name}")

    for helper in SHARED_HELPERS:
        if not re.search(rf"(?m)^function\s+{re.escape(helper)}\s*\(", code):
            raise RuntimeError(f"Helper compartilhado saiu indevidamente do Code.gs: {helper}")
        if re.search(rf"(?m)^function\s+{re.escape(helper)}\s*\(", module):
            raise RuntimeError(f"Helper compartilhado foi duplicado no relatório: {helper}")

    forbidden = [
        "function fecharMesRelatorioEliel(",
        "STATUS_OPERACAO_PROCESSANDO_",
        "STATUS_OPERACAO_CONCLUIDO_",
        "STATUS_OPERACAO_ERRO_",
        "Controle_Operacoes",
        "Fechamentos_Mensais_v2",
    ]
    for token in forbidden:
        if token in module:
            raise RuntimeError(f"Responsabilidade de fechamento vazou para o RelatorioElielService: {token}")

    CODE_PATH.write_text(code, encoding="utf-8")
    MODULE_PATH.write_text(module, encoding="utf-8")

    preflight = PREFLIGHT_PATH.read_text(encoding="utf-8")
    preflight = replace_once(
        preflight,
        "  'PropertiesRepository.gs',\n  'SecurityUtils.gs',",
        "  'PropertiesRepository.gs',\n  'RelatorioElielService.gs',\n  'SecurityUtils.gs',",
        "preflight módulo P10",
    )
    preflight = replace_once(
        preflight,
        "  'function fecharMesRelatorioEliel',\n  'function carregarFilaPdvAtivos_',",
        "  'function fecharMesRelatorioEliel',\n  'function obterRelatorioEliel',\n  'function registrarAcessoRelatorioEliel',\n  'function obterConfiguracoesRelatorioEliel',\n  'function salvarConfiguracoesRelatorioEliel',\n  'function obterHistoricoVendasEliel',\n  'function carregarFilaPdvAtivos_',",
        "preflight contratos do Relatório Eliel",
    )
    PREFLIGHT_PATH.write_text(preflight, encoding="utf-8")

    deploy_test = DEPLOY_TEST_PATH.read_text(encoding="utf-8")
    deploy_test = replace_once(
        deploy_test,
        "    'PropertiesRepository.gs',\n    'SecurityUtils.gs',",
        "    'PropertiesRepository.gs',\n    'RelatorioElielService.gs',\n    'SecurityUtils.gs',",
        "teste P8 módulo P10",
    )
    DEPLOY_TEST_PATH.write_text(deploy_test, encoding="utf-8")

    target_js = ",\n  ".join([f"'{name}'" for name in TARGET_FUNCTIONS])
    helpers_js = ",\n  ".join([f"'{name}'" for name in SHARED_HELPERS])
    P10_TEST_PATH.write_text(f'''const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const code = read('apps-script/Code.gs');
const relatorio = read('apps-script/RelatorioElielService.gs');
const fechamento = read('apps-script/FechamentoService.gs');
const api = read('apps-script/Api.gs');

const funcoes = [
  {target_js}
];
const helpersCompartilhados = [
  {helpers_js}
];

function regexFuncao(nome) {{
  return new RegExp('function\\\\s+' + nome.replace(/[.*+?^${{}}()|[\\]\\\\]/g, '\\\\$&') + '\\\\s*\\\\(');
}}

test('P10 concentra o domínio analítico no RelatorioElielService sem duplicação', () => {{
  for (const nome of funcoes) {{
    assert.match(relatorio, regexFuncao(nome));
    assert.doesNotMatch(code, regexFuncao(nome));
  }}
}});

test('helpers compartilhados continuam no Code.gs e atendem relatório e fechamento', () => {{
  for (const nome of helpersCompartilhados) {{
    assert.match(code, regexFuncao(nome));
    assert.doesNotMatch(relatorio, regexFuncao(nome));
  }}
  assert.match(relatorio, /chaveMes_\(/);
  assert.match(relatorio, /extrairData_\(/);
  assert.match(fechamento, /chaveMes_\(/);
  assert.match(fechamento, /extrairData_\(/);
}});

test('P10 preserva contratos públicos e permissões do Relatório Eliel na API', () => {{
  for (const acao of [
    'obterRelatorioEliel',
    'registrarAcessoRelatorioEliel',
    'obterConfiguracoesRelatorioEliel',
    'salvarConfiguracoesRelatorioEliel',
    'obterHistoricoVendasEliel'
  ]) {{
    assert.match(api, new RegExp('"' + acao + '"'));
  }}
  assert.match(api, /const acoesEliel = \[/);
  assert.match(api, /sessao\.perfil !== "admin" && acoesEliel\.indexOf\(action\) === -1/);
}});

test('RelatorioElielService mantém indicadores, rankings, histórico e não absorve fechamento', () => {{
  assert.match(relatorio, /rankingProdutos/);
  assert.match(relatorio, /rankingRotas/);
  assert.match(relatorio, /menosVendidas/);
  assert.match(relatorio, /detalhesTaxas/);
  assert.match(relatorio, /mesesComparacao/);
  assert.match(relatorio, /combustivelTrailer/);
  assert.match(relatorio, /Historico_Diario/);
  assert.match(relatorio, /Log Relatorio Eliel/);
  assert.doesNotMatch(relatorio, /function fecharMesRelatorioEliel\s*\(/);
  assert.doesNotMatch(relatorio, /Controle_Operacoes/);
  assert.doesNotMatch(relatorio, /Fechamentos_Mensais_v2/);
  assert.doesNotMatch(relatorio, /STATUS_OPERACAO_(?:PROCESSANDO|CONCLUIDO|ERRO)_/);
}});

test('bundle completo continua sintaticamente válido após o P10', () => {{
  const dir = path.join(root, 'apps-script');
  const bundle = fs.readdirSync(dir)
    .filter(nome => nome.endsWith('.gs'))
    .sort()
    .map(nome => fs.readFileSync(path.join(dir, nome), 'utf8'))
    .join('\\n\\n');
  assert.doesNotThrow(() => new vm.Script(bundle));
}});
''', encoding="utf-8")

    DOC_PATH.write_text('''# P10 — Modularização do Relatório Eliel\n\n## Objetivo\n\nExtrair do `Code.gs` o domínio analítico do Relatório Eliel para `apps-script/RelatorioElielService.gs`, preservando integralmente contratos HTTP, regras financeiras e o fechamento mensal já isolado no P9.\n\n## Escopo movido\n\nO novo serviço concentra:\n\n- leitura e gravação das configurações financeiras do Relatório Eliel;\n- rateio de combustível 80% carro / 20% trailer;\n- cálculo mensal de faturamento, taxas, custos, líquido e distribuição;\n- indicadores por dia e semana;\n- ranking de produtos, top 3, cinco menos vendidas e tendências;\n- ranking de rotas e participação no faturamento;\n- comparativo dos últimos três meses;\n- criação/garantia da aba `Relatorio Eliel`;\n- log de acesso ao relatório;\n- consulta ao histórico de vendas.\n\n## Helpers compartilhados\n\n`normalizarNumero_`, `extrairData_`, `pertenceAoMes_`, `chaveMes_` e `nomeDia_` permanecem no `Code.gs` porque também são consumidos por `FechamentoService.gs`. Eles não são duplicados no novo módulo.\n\n## Fora do escopo\n\nPermanecem fora do novo serviço:\n\n- `fecharMesRelatorioEliel` e toda a máquina de estado do fechamento;\n- `Fechamentos_Mensais_v2` e `Controle_Operacoes`;\n- fechamento diário;\n- configuração operacional do cardápio;\n- avisos do PDV;\n- o helper legado `obterAbaFechamentosMensais_`.\n\n## Compatibilidade\n\nOs nomes públicos do Apps Script permanecem globais no bundle. `Api.gs` continua roteando e autorizando as mesmas ações, sem mudança no frontend ou no `/exec`.\n\n## Deploy\n\nO preflight do P8 passa a exigir `RelatorioElielService.gs` e os contratos públicos do relatório antes de qualquer publicação. Após merge, publicar somente pelo workflow `Deploy Apps Script - produção`.\n\n## Rollback\n\nReverter o squash commit do P10 por PR e executar novamente o workflow oficial de produção no mesmo deployment.\n''', encoding="utf-8")

    print(f"P10 aplicado: {len(TARGET_FUNCTIONS)} funções movidas para RelatorioElielService.gs.")


if __name__ == "__main__":
    main()
