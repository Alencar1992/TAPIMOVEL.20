// =========================================================
// P5 — REPOSITÓRIO DE PROPRIEDADES
// Único ponto de acesso direto ao ScriptProperties.
// =========================================================

function obterScriptProperties_() {
  return PropertiesService.getScriptProperties();
}

function catalogoConfigurado_(catalogoPadraoJSON) {
  const props = obterScriptProperties_();
  const salvo = props.getProperty(CHAVE_CATALOGO_CARDAPIO_);
  if (salvo) return normalizarCatalogo_(JSON.parse(salvo));
  return normalizarCatalogo_(JSON.parse(catalogoPadraoJSON || "{}"));
}

function salvarCatalogoConfigurado_(catalogo) {
  const normalizado = normalizarCatalogo_(catalogo);
  obterScriptProperties_()
    .setProperty(CHAVE_CATALOGO_CARDAPIO_, JSON.stringify(normalizado));
  return normalizado;
}
