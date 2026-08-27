// =========================================================
// P5 — REPOSITÓRIO DE PROPRIEDADES
// Único ponto de acesso direto ao ScriptProperties.
// =========================================================

function obterScriptProperties_() {
  return PropertiesService.getScriptProperties();
}

function nomeBebidaCatalogoNormalizado_(valor) {
  return String(valor == null ? "" : valor)
    .replace(/🥤/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function catalogoTemBebidaGenericaLegada_(catalogo) {
  const bebidas = catalogo && Array.isArray(catalogo.bebidas) ? catalogo.bebidas : [];
  return bebidas.some(function(item) {
    return nomeBebidaCatalogoNormalizado_(item && item.nome) === "refri / suco - lata";
  });
}

function catalogoConfigurado_(catalogoPadraoJSON) {
  const props = obterScriptProperties_();
  const salvo = props.getProperty(CHAVE_CATALOGO_CARDAPIO_);
  const padrao = normalizarCatalogo_(JSON.parse(catalogoPadraoJSON || "{}"));

  if (salvo) {
    const catalogo = normalizarCatalogo_(JSON.parse(salvo));

    // Migração segura do modelo antigo de uma bebida genérica para o catálogo
    // específico enviado pelo cliente. Sem isso, o frontend exibe as bebidas
    // atuais, mas registrarPedidoOnline rejeita o nome específico no backend.
    if (catalogoTemBebidaGenericaLegada_(catalogo) &&
        Array.isArray(padrao.bebidas) &&
        padrao.bebidas.length > 1) {
      catalogo.bebidas = padrao.bebidas;
      props.setProperty(CHAVE_CATALOGO_CARDAPIO_, JSON.stringify(catalogo));
    }

    return catalogo;
  }

  return padrao;
}

function salvarCatalogoConfigurado_(catalogo) {
  const normalizado = normalizarCatalogo_(catalogo);
  obterScriptProperties_()
    .setProperty(CHAVE_CATALOGO_CARDAPIO_, JSON.stringify(normalizado));
  return normalizado;
}
