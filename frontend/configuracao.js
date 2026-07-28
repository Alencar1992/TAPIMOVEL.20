(function () {
  "use strict";

  var responsavelAtual = "";
  var categorias = {
    salgadas: "Salgadas",
    especiais: "Especiais",
    doces_tradicionais: "Doces tradicionais",
    doces_avela: "Doces · Avelã",
    doces_nutella: "Doces · Nutella",
    bebidas: "Bebidas"
  };

  function escapar(valor) {
    return String(valor == null ? "" : valor)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function moeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function listarCatalogo() {
    var itens = [];
    Object.keys(categorias).forEach(function (categoria) {
      (bdCatalogo[categoria] || []).forEach(function (item) {
        itens.push(Object.assign({ categoria: categoria }, item));
      });
    });
    return itens;
  }

  function atualizarCatalogo(resposta) {
    var catalogo = JSON.parse(resposta || "{}");
    TapimovelCatalogo.substituir(bdCatalogo, catalogo);
    itensIndisponiveis = itensIndisponiveis.filter(function (nome) {
      return listarCatalogo().some(function (item) { return item.nome === nome; });
    });
    renderizarConfiguracao();
    if (typeof renderizarTelaItens === "function") renderizarTelaItens();
    if (typeof renderizarCatalogo === "function") renderizarCatalogo(abaAtivaCatalogo);
  }

  window.solicitarAcessoConfiguracao = function () {
    fecharMenuLateral();
    var sessao = window.TapimovelAuth && window.TapimovelAuth.getSession
      ? window.TapimovelAuth.getSession()
      : null;
    if (sessao && sessao.perfil === "eliel") {
      responsavelAtual = "CEO Eliel";
      google.script.run
        .withSuccessHandler(function (resposta) {
          atualizarCatalogo(resposta);
          document.getElementById("configResponsavelAtual").textContent = responsavelAtual;
          mudarTela("view-configuracao");
        })
        .withFailureHandler(function (erro) {
          mostrarAlerta("Não foi possível abrir a configuração.<br><small>" + escapar(erro.message) + "</small>");
        })
        .inicializarCatalogoConfiguracao(
          JSON.stringify(TapimovelCatalogo.copiar(bdCatalogo)),
          responsavelAtual
        );
      return;
    }
    var modal = document.getElementById("modalIdentificacaoConfig");
    var campo = document.getElementById("configResponsavel");
    campo.value = responsavelAtual;
    modal.style.display = "flex";
    setTimeout(function () { campo.focus(); }, 80);
  };

  window.fecharIdentificacaoConfiguracao = function () {
    document.getElementById("modalIdentificacaoConfig").style.display = "none";
  };

  window.confirmarIdentificacaoConfiguracao = function () {
    var campo = document.getElementById("configResponsavel");
    var nome = campo.value.trim().replace(/\s+/g, " ");
    if (nome.length < 2) {
      mostrarAlerta("Informe seu nome para acessar a configuração.");
      return;
    }
    var botao = document.querySelector("#modalIdentificacaoConfig .btn-acao:not(.btn-limpar)");
    botao.disabled = true;
    botao.textContent = "Registrando acesso...";
    google.script.run
      .withSuccessHandler(function (resposta) {
        responsavelAtual = nome;
        atualizarCatalogo(resposta);
        document.getElementById("configResponsavelAtual").textContent = responsavelAtual;
        fecharIdentificacaoConfiguracao();
        mudarTela("view-configuracao");
        botao.disabled = false;
        botao.textContent = "Entrar na configuração";
      })
      .withFailureHandler(function (erro) {
        botao.disabled = false;
        botao.textContent = "Entrar na configuração";
        mostrarAlerta("Não foi possível abrir a configuração.<br><small>" + escapar(erro.message) + "</small>");
      })
      .inicializarCatalogoConfiguracao(
        JSON.stringify(TapimovelCatalogo.copiar(bdCatalogo)),
        responsavelAtual || nome
      );
  };

  window.sairConfiguracao = function () {
    responsavelAtual = "";
    document.getElementById("configResponsavelAtual").textContent = "—";
    document.getElementById("configResponsavel").value = "";
    voltarInicioAcesso();
  };

  window.renderizarConfiguracao = function () {
    var lista = document.getElementById("configListaItens");
    if (!lista) return;
    var busca = (document.getElementById("configBusca").value || "").trim().toLowerCase();
    var itens = listarCatalogo()
      .filter(function (item) {
        return !busca ||
          item.nome.toLowerCase().includes(busca) ||
          String(item.ing || "").toLowerCase().includes(busca) ||
          categorias[item.categoria].toLowerCase().includes(busca);
      })
      .sort(function (a, b) {
        return a.nome.localeCompare(b.nome, "pt-BR");
      });

    var totalItens = listarCatalogo().length;
    document.getElementById("configTotalItens").textContent =
      totalItens + (totalItens === 1 ? " item cadastrado" : " itens cadastrados");

    if (!itens.length) {
      lista.innerHTML = '<div class="config-vazio">Nenhum item encontrado.</div>';
      return;
    }

    lista.innerHTML = itens.map(function (item) {
      var nome = encodeURIComponent(item.nome).replace(/'/g, "%27");
      return '<article class="config-item">' +
        '<div class="config-item-info">' +
          '<span>' + escapar(categorias[item.categoria]) + '</span>' +
          '<strong>' + escapar(item.nome) + '</strong>' +
          '<p>' + escapar(item.ing || (item.tipo === "bebida" ? "Bebida" : "Sem ingredientes informados")) + '</p>' +
        '</div>' +
        '<strong class="config-item-preco">' + moeda(item.preco) + '</strong>' +
        '<div class="config-item-acoes">' +
          '<button type="button" onclick="editarItemConfiguracao(decodeURIComponent(\'' + nome + '\'))">Editar</button>' +
          '<button type="button" class="remover" onclick="confirmarRemocaoConfiguracao(decodeURIComponent(\'' + nome + '\'))">Remover</button>' +
        '</div>' +
      '</article>';
    }).join("");
  };

  window.abrirEditorConfiguracao = function () {
    if (!responsavelAtual) {
      solicitarAcessoConfiguracao();
      return;
    }
    document.getElementById("configFormItem").reset();
    document.getElementById("configNomeOriginal").value = "";
    document.getElementById("configItemCategoria").value = "salgadas";
    document.getElementById("configEditorTitulo").textContent = "Nova tapioca";
    document.getElementById("configEditorResponsavel").textContent =
      "Alteração por " + responsavelAtual;
    document.getElementById("modalEditorConfig").style.display = "flex";
    setTimeout(function () { document.getElementById("configItemNome").focus(); }, 80);
  };

  window.editarItemConfiguracao = function (nome) {
    var item = listarCatalogo().find(function (registro) { return registro.nome === nome; });
    if (!item) {
      mostrarAlerta("Este item não foi encontrado.");
      return;
    }
    document.getElementById("configFormItem").reset();
    document.getElementById("configNomeOriginal").value = item.nome;
    document.getElementById("configItemNome").value = item.nome;
    document.getElementById("configItemCategoria").value = item.categoria;
    document.getElementById("configItemPreco").value =
      Number(item.preco).toFixed(2).replace(".", ",");
    document.getElementById("configItemIngredientes").value = item.ing || "";
    document.getElementById("configEditorTitulo").textContent = "Editar item";
    document.getElementById("configEditorResponsavel").textContent =
      "Alteração por " + responsavelAtual;
    document.getElementById("modalEditorConfig").style.display = "flex";
  };

  window.fecharEditorConfiguracao = function () {
    document.getElementById("modalEditorConfig").style.display = "none";
  };

  window.salvarItemConfiguracao = function (evento) {
    evento.preventDefault();
    var categoria = document.getElementById("configItemCategoria").value;
    var precoTexto = document.getElementById("configItemPreco").value.trim()
      .replace(/\s/g, "").replace(/R\$/gi, "").replace(/\./g, "").replace(",", ".");
    var item = {
      nome: document.getElementById("configItemNome").value.trim(),
      categoria: categoria,
      preco: Number(precoTexto),
      tipo: categoria === "bebidas" ? "bebida" : "tapioca",
      ing: document.getElementById("configItemIngredientes").value.trim()
    };
    if (item.nome.length < 2 || !Number.isFinite(item.preco) || item.preco <= 0) {
      mostrarAlerta("Preencha o nome e informe um preço maior que zero.");
      return;
    }
    var original = document.getElementById("configNomeOriginal").value;
    var botao = document.getElementById("configBtnSalvar");
    botao.disabled = true;
    botao.textContent = "Salvando...";
    google.script.run
      .withSuccessHandler(function (resposta) {
        atualizarCatalogo(resposta);
        fecharEditorConfiguracao();
        botao.disabled = false;
        botao.textContent = "Salvar item";
        mostrarToast(original ? "Item atualizado no cardápio." : "Nova tapioca criada no cardápio.");
      })
      .withFailureHandler(function (erro) {
        botao.disabled = false;
        botao.textContent = "Salvar item";
        mostrarAlerta("Não foi possível salvar o item.<br><small>" + escapar(erro.message) + "</small>");
      })
      .salvarItemCatalogo(JSON.stringify(item), original, responsavelAtual);
  };

  window.confirmarRemocaoConfiguracao = function (nome) {
    mostrarConfirmacao(
      'Remover "' + nome + '" do cardápio? O item deixará de aparecer no PDV e para o cliente.',
      function () { removerItemConfiguracao(nome); },
      {
        titulo: "Remover item do cardápio",
        icone: "!",
        textoCancelar: "Cancelar",
        textoConfirmar: "Remover",
        destrutiva: true
      }
    );
  };

  function removerItemConfiguracao(nome) {
    document.getElementById("loadingText").textContent = "Removendo item do cardápio...";
    document.getElementById("loadingScreen").style.display = "flex";
    google.script.run
      .withSuccessHandler(function (resposta) {
        document.getElementById("loadingScreen").style.display = "none";
        atualizarCatalogo(resposta);
        mostrarToast("Item removido do cardápio.");
      })
      .withFailureHandler(function (erro) {
        document.getElementById("loadingScreen").style.display = "none";
        mostrarAlerta("Não foi possível remover o item.<br><small>" + escapar(erro.message) + "</small>");
      })
      .removerItemCatalogo(nome, responsavelAtual);
  }

  window.addEventListener("DOMContentLoaded", function () {
    TapimovelCatalogo.carregar(bdCatalogo, function () {
      if (typeof renderizarCatalogo === "function" && abaAtivaCatalogo) {
        renderizarCatalogo(abaAtivaCatalogo);
      }
    });
  });
})();
