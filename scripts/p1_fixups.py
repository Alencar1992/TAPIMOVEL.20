from pathlib import Path

# Completa a autonomia dos adicionais no frontend administrativo.
eliel_path = Path('frontend/eliel.js')
eliel = eliel_path.read_text(encoding='utf-8')
eliel = eliel.replace('    const PRECO_ADICIONAL = 4;', '    let PRECO_ADICIONAL = 4;', 1)
eliel = eliel.replace('    const adicionaisSalgados = [', '    let adicionaisSalgados = [', 1)
eliel = eliel.replace('    const adicionaisDoces = [', '    let adicionaisDoces = [', 1)

anchor = '''    const meses = [
        "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
        "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
'''
insert = anchor + r'''

    function carregarConfiguracaoOperacionalPdv_() {
        if (!window.google || !google.script || !google.script.run) return;
        google.script.run
            .withSuccessHandler(function (resposta) {
                try {
                    const config = JSON.parse(resposta || "{}");
                    const adicionais = config.adicionais || {};
                    const valor = Number(adicionais.valor);
                    if (Number.isFinite(valor) && valor >= 0) PRECO_ADICIONAL = valor;
                    if (Array.isArray(adicionais.salgado)) adicionaisSalgados = adicionais.salgado.slice();
                    if (Array.isArray(adicionais.doce)) adicionaisDoces = adicionais.doce.slice();
                } catch (erro) {
                    console.error("Não foi possível aplicar a configuração operacional no PDV:", erro);
                }
            })
            .withFailureHandler(function (erro) {
                console.error("Não foi possível carregar a configuração operacional no PDV:", erro);
            })
            .obterConfiguracaoOperacional();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", carregarConfiguracaoOperacionalPdv_);
    } else {
        carregarConfiguracaoOperacionalPdv_();
    }
'''
if anchor not in eliel:
    raise SystemExit('Âncora de eliel.js não encontrada')
eliel = eliel.replace(anchor, insert, 1)
eliel_path.write_text(eliel, encoding='utf-8')

# Atualiza o teste antigo para o novo contrato: adicional configurável, não literal.
test_path = Path('tests/frontend-integrity.test.js')
test = test_path.read_text(encoding='utf-8')
repls = {
    'assert.match(eliel, /const PRECO_ADICIONAL = 4/);': 'assert.match(eliel, /let PRECO_ADICIONAL = 4/);',
    'assert.match(eliel, /const adicionaisSalgados/);': 'assert.match(eliel, /let adicionaisSalgados/);',
    'assert.match(eliel, /const adicionaisDoces/);': 'assert.match(eliel, /let adicionaisDoces/);',
    'assert.match(backend, /precoBase \\+ adicionais\\.length \\* 4/);': 'assert.match(backend, /precoBase \\+ adicionais\\.length \\* valorAdicional/);\n  assert.match(eliel, /obterConfiguracaoOperacional/);',
}
for old, new in repls.items():
    if old not in test:
        raise SystemExit('Expectativa antiga não encontrada: ' + old)
    test = test.replace(old, new, 1)
test_path.write_text(test, encoding='utf-8')

# O aplicador principal remove o workflow e a si próprio; este fixup também é descartável.
Path('scripts/p1_fixups.py').unlink()
