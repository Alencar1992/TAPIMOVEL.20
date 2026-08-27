(function () {
  "use strict";

  let sugestaoCategoriasDispensada = false;
  let prepararItemOriginal_ = null;
  let obterImagemProdutoOriginal_ = null;

  function assinaturaAtualCarrinho_() {
    try {
      return typeof obterAssinaturaCarrinho === "function"
        ? obterAssinaturaCarrinho()
        : "";
    } catch (_) {
      return "";
    }
  }

  function marcarSugestaoComoTratada_() {
    sugestaoCategoriasDispensada = true;
    try {
      assinaturaSugestaoIgnorada = assinaturaAtualCarrinho_();
    } catch (_) {
      // Compatibilidade com versões antigas em que a variável não exista.
    }
  }

  function fecharModalSugestao_() {
    const modal = document.getElementById("modalSugestao");
    if (modal) modal.style.display = "none";
  }

  function rolarAoTopo_() {
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (_) {
      window.scrollTo(0, 0);
    }
  }

  function abrirCategoriaDaSugestao(categoria) {
    marcarSugestaoComoTratada_();
    fecharModalSugestao_();

    const tab = document.querySelector('.tab[data-categoria="' + categoria + '"]');
    if (typeof mudarAba === "function") {
      mudarAba(categoria, tab || undefined);
    }

    rolarAoTopo_();
  }

  function voltarAoCardapioDaSugestaoSeguro_() {
    marcarSugestaoComoTratada_();
    fecharModalSugestao_();
    rolarAoTopo_();
  }

  function abrirSugestaoPorCategoria_() {
    if (sugestaoCategoriasDispensada) return false;

    const assinatura = assinaturaAtualCarrinho_();
    let tipo = null;

    try {
      tipo = typeof classificarTapiocaUnica === "function"
        ? classificarTapiocaUnica()
        : null;
    } catch (_) {
      tipo = null;
    }

    try {
      if (!tipo || assinatura === assinaturaSugestaoIgnorada) return false;
    } catch (_) {
      if (!tipo) return false;
    }

    const texto = document.getElementById("textoSugestao");
    if (texto) {
      texto.textContent = "Quer completar seu pedido? Escolha uma categoria. As tapiocas que você já colocou no carrinho continuam salvas até a finalização do pedido.";
    }

    const lista = document.getElementById("listaSugestoes");
    if (!lista) return false;

    lista.innerHTML = [
      '<div class="sugestao-card">' +
        '<strong>🍫 Tapiocas doces</strong>' +
        '<small>Abrir o cardápio de tapiocas doces</small>' +
        '<button type="button" class="btn-add" onclick="abrirCategoriaDaSugestao(\'doces\')">Ver tapiocas doces</button>' +
      '</div>',
      '<div class="sugestao-card">' +
        '<strong>🥤 Refrigerante ou Suco</strong>' +
        '<small>Abrir o cardápio de refrigerantes e sucos</small>' +
        '<button type="button" class="btn-add" onclick="abrirCategoriaDaSugestao(\'bebidas\')">Ver bebidas</button>' +
      '</div>'
    ].join("");

    const modal = document.getElementById("modalSugestao");
    if (modal) modal.style.display = "flex";
    return true;
  }

  function corrigirValorVr_() {
    const select = document.getElementById("cliPag");
    if (!select) return;

    Array.from(select.options || []).forEach(function (option) {
      if (option.value === "VR" || option.textContent.trim() === "VR (Vale Refeição)") {
        option.value = "VR (Vale Refeição)";
      }
    });

    if (select.value === "VR") {
      select.value = "VR (Vale Refeição)";
    }
  }

  function normalizarNome_(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function imagemBebidaPorNome_(produto) {
    if (!produto || produto.tipo !== "bebida") return "";
    const nome = normalizarNome_(produto.nome);
    if (nome.includes("coca-cola zero")) return "./assets/menu/bebida-coca-zero.webp";
    if (nome.includes("coca-cola original")) return "./assets/menu/bebida-coca-original.webp";
    if (nome.includes("fanta laranja")) return "./assets/menu/bebida-fanta-laranja.webp";
    if (nome.includes("sprite")) return "./assets/menu/bebida-sprite.webp";
    if (nome.includes("guarana antarctica")) return "./assets/menu/bebida-guarana-antartica.webp";
    if (nome.includes("del valle goiaba")) return "./assets/menu/bebida-del-valle-goiaba.webp";
    if (nome.includes("del valle uva")) return "./assets/menu/bebida-del-valle-uva.webp";
    if (nome.includes("del valle pessego")) return "./assets/menu/bebida-del-valle-pessego.webp";
    return "";
  }

  function obterImagemProdutoSeguro_(produto) {
    const bebida = imagemBebidaPorNome_(produto);
    if (bebida) return bebida;
    if (produto && produto.tipo === "bebida") return "";
    return typeof obterImagemProdutoOriginal_ === "function"
      ? obterImagemProdutoOriginal_(produto)
      : "";
  }

  function mensagemHorarioAtual_() {
    try {
      const horario = typeof textoHorarioHoje === "function" ? textoHorarioHoje() : "o horário informado acima";
      return "O cardápio digital está fechado neste momento. O atendimento de hoje funciona das <b>" + horario + "</b>.";
    } catch (_) {
      return "O cardápio digital está fechado neste momento.";
    }
  }

  function adicionarBebidaDireto_(prod) {
    try {
      if (!lojaAberta) {
        if (typeof mostrarAlerta === "function") mostrarAlerta(mensagemHorarioAtual_());
        return;
      }
      if (Array.isArray(itensIndisponiveis) && itensIndisponiveis.includes(prod.nome)) {
        if (typeof mostrarAlerta === "function") mostrarAlerta("Este item está <b>esgotado</b> no momento. Escolha outra opção.");
        return;
      }
      carrinho.push({ ...prod, quantidade: 1, obs: "", pronto: false, id: Date.now() });
      if (typeof atualizarBarra === "function") atualizarBarra();
      const tab = document.querySelector('.tab[data-categoria="bebidas"]');
      if (typeof mudarAba === "function") mudarAba("bebidas", tab || undefined);
    } catch (erro) {
      console.error("Não foi possível adicionar a bebida diretamente:", erro);
      if (typeof prepararItemOriginal_ === "function") prepararItemOriginal_(prod);
    }
  }

  function prepararItemSeguro_(prod) {
    if (prod && prod.tipo === "bebida") {
      adicionarBebidaDireto_(prod);
      return;
    }
    if (typeof prepararItemOriginal_ === "function") prepararItemOriginal_(prod);
  }

  function aplicarAjustesCliente_() {
    corrigirValorVr_();

    prepararItemOriginal_ = typeof window.prepararItem === "function" ? window.prepararItem : null;
    obterImagemProdutoOriginal_ = typeof window.obterImagemProduto === "function" ? window.obterImagemProduto : null;

    window.abrirCategoriaDaSugestao = abrirCategoriaDaSugestao;
    window.abrirSugestaoSeAplicavel = abrirSugestaoPorCategoria_;
    window.voltarAoCardapioDaSugestao = voltarAoCardapioDaSugestaoSeguro_;
    window.prepararItem = prepararItemSeguro_;
    window.obterImagemProduto = obterImagemProdutoSeguro_;

    document.addEventListener("change", function (evento) {
      if (evento.target && evento.target.id === "cliPag") corrigirValorVr_();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", aplicarAjustesCliente_, { once: true });
  } else {
    aplicarAjustesCliente_();
  }
})();
