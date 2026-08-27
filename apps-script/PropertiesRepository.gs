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

function bebidasPadraoServidor_() {
  // Fonte de migração pertencente ao servidor. Nunca usar dados recebidos do
  // navegador para persistir nomes/preços durante a migração do legado.
  return [
    { nome: "Coca-Cola Zero - LATA", preco: 6.00, tipo: "bebida", ing: "Refrigerante lata 350 ml", imagem: "bebida-coca-zero.webp" },
    { nome: "Coca-Cola Original - LATA", preco: 6.00, tipo: "bebida", ing: "Refrigerante lata 350 ml", imagem: "bebida-coca-original.webp" },
    { nome: "Fanta Laranja - LATA", preco: 6.00, tipo: "bebida", ing: "Refrigerante lata 350 ml", imagem: "bebida-fanta-laranja.webp" },
    { nome: "Sprite - LATA", preco: 6.00, tipo: "bebida", ing: "Refrigerante lata 350 ml", imagem: "bebida-sprite.webp" },
    { nome: "Guaraná Antarctica - LATA", preco: 6.00, tipo: "bebida", ing: "Refrigerante lata 350 ml", imagem: "bebida-guarana-antartica.webp" },
    { nome: "Suco Del Valle Goiaba - LATA", preco: 6.00, tipo: "bebida", ing: "Suco lata 290 ml", imagem: "bebida-del-valle-goiaba.webp" },
    { nome: "Suco Del Valle Uva - LATA", preco: 6.00, tipo: "bebida", ing: "Suco lata 290 ml", imagem: "bebida-del-valle-uva.webp" },
    { nome: "Suco Del Valle Pêssego - LATA", preco: 6.00, tipo: "bebida", ing: "Suco lata 290 ml", imagem: "bebida-del-valle-pessego.webp" }
  ];
}

function catalogoConfigurado_(catalogoPadraoJSON) {
  const props = obterScriptProperties_();
  const salvo = props.getProperty(CHAVE_CATALOGO_CARDAPIO_);

  if (salvo) {
    const catalogo = normalizarCatalogo_(JSON.parse(salvo));

    // Migração segura do modelo antigo de uma bebida genérica para o catálogo
    // específico controlado pelo servidor. O payload público do cliente nunca
    // é persistido como fonte de nomes ou preços.
    if (catalogoTemBebidaGenericaLegada_(catalogo)) {
      const catalogoServidor = normalizarCatalogo_({ bebidas: bebidasPadraoServidor_() });
      catalogo.bebidas = catalogoServidor.bebidas;
      props.setProperty(CHAVE_CATALOGO_CARDAPIO_, JSON.stringify(catalogo));
    }

    return catalogo;
  }

  return normalizarCatalogo_(JSON.parse(catalogoPadraoJSON || "{}"));
}

function salvarCatalogoConfigurado_(catalogo) {
  const normalizado = normalizarCatalogo_(catalogo);
  obterScriptProperties_()
    .setProperty(CHAVE_CATALOGO_CARDAPIO_, JSON.stringify(normalizado));
  return normalizado;
}
