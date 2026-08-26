from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND_TEST = ROOT / "tests" / "frontend-integrity.test.js"
P9_TEST = ROOT / "tests" / "modularizacao-p9.test.js"

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


def patch_frontend_integrity():
    text = FRONTEND_TEST.read_text(encoding="utf-8")
    marker = 'test("fechamento mensal é exclusivo do Relatório Eliel e exige prévia", () => {'
    start = text.find(marker)
    if start < 0:
        raise RuntimeError("Bloco do teste de fechamento não encontrado.")

    old = '  const backend = fs.readFileSync(path.join(root, "apps-script/Code.gs"), "utf8");'
    pos = text.find(old, start)
    next_test = text.find('\ntest(', start + len(marker))
    if pos < 0 or (next_test >= 0 and pos > next_test):
        raise RuntimeError("Leitura antiga de Code.gs não encontrada no bloco esperado.")

    new = '''  const appsScriptDir = path.join(root, "apps-script");
  const backend = fs.readdirSync(appsScriptDir)
    .filter(nome => nome.endsWith(".gs"))
    .sort()
    .map(nome => fs.readFileSync(path.join(appsScriptDir, nome), "utf8"))
    .join("\\n\\n");'''

    text = text[:pos] + new + text[pos + len(old):]
    FRONTEND_TEST.write_text(text, encoding="utf-8")


def rewrite_p9_test():
    functions_js = ",\n  ".join(f"'{name}'" for name in TARGET_FUNCTIONS)
    constants_js = ",\n  ".join(f"'{name}'" for name in TARGET_CONSTANTS)
    content = f'''const test = require('node:test');
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
  {functions_js}
];
const constantes = [
  {constants_js}
];

const temFuncao = (source, nome) => source.includes(`function ${{nome}}(`);
const temConstante = (source, nome) => source.includes(`const ${{nome}} =`);

test('P9 concentra o fechamento mensal no FechamentoService sem duplicação', () => {{
  for (const nome of funcoes) {{
    assert.equal(temFuncao(fechamento, nome), true, `função ausente no FechamentoService: ${{nome}}`);
    assert.equal(temFuncao(code, nome), false, `função duplicada no Code.gs: ${{nome}}`);
  }}
  for (const nome of constantes) {{
    assert.equal(temConstante(fechamento, nome), true, `constante ausente no FechamentoService: ${{nome}}`);
    assert.equal(temConstante(code, nome), false, `constante duplicada no Code.gs: ${{nome}}`);
  }}
}});

test('P9 preserva os contratos públicos e a autorização do CEO Eliel na API', () => {{
  assert.equal(api.includes('"obterPreviaFechamentoRelatorioEliel"'), true);
  assert.equal(api.includes('"fecharMesRelatorioEliel"'), true);
  assert.equal(api.includes('action === "fecharMesRelatorioEliel"'), true);
  assert.equal(api.includes('sessao.perfil !== "eliel"'), true);
}});

test('FechamentoService mantém idempotência, recuperação e bloqueio de pendências', () => {{
  for (const trecho of [
    'STATUS_OPERACAO_PROCESSANDO_',
    'STATUS_OPERACAO_CONCLUIDO_',
    'STATUS_OPERACAO_ERRO_',
    'recuperavel',
    'pedidosPendentes',
    'carregarFilaPdvAtivos_',
    'Fechamentos_Mensais_v2'
  ]) assert.equal(fechamento.includes(trecho), true, `regra crítica ausente: ${{trecho}}`);
  assert.equal(fechamento.includes('function obterRelatorioEliel('), false);
  assert.equal(fechamento.includes('function obterHistoricoVendasEliel('), false);
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
'''
    P9_TEST.write_text(content, encoding="utf-8")


def main():
    patch_frontend_integrity()
    rewrite_p9_test()
    print("Testes P9 ajustados para o bundle modular.")


if __name__ == "__main__":
    main()
