(function () {
  "use strict";

  function dataHojePtBr() {
    return new Date().toLocaleDateString("pt-BR");
  }

  function mostrarCarregando(texto) {
    const loadingText = document.getElementById("loadingText");
    const loadingScreen = document.getElementById("loadingScreen");
    if (loadingText) loadingText.textContent = texto || "Processando fechamento diário...";
    if (loadingScreen) loadingScreen.style.display = "flex";
  }

  function esconderCarregando() {
    const loadingScreen = document.getElementById("loadingScreen");
    if (loadingScreen) loadingScreen.style.display = "none";
  }

  function mensagemResumo(resultado) {
    const resumo = resultado && resultado.resumo || {};
    if (!resumo.pedidosFinalizados) return "";
    const total = Number(resumo.total || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
    return `<br><small>${Number(resumo.pedidosFinalizados || 0)} pedido(s) · ${Number(resumo.qtdTapiocas || 0)} tapioca(s) · ${total}</small>`;
  }

  function recarregarFilaDepoisDoFechamento(resultado) {
    google.script.run
      .withSuccessHandler(function (resposta) {
        try {
          historicoNuvem = JSON.parse(resposta || "[]");
          carrinho = [];
          ultimoQtdHojeEnviado = -1;
          if (typeof atualizarTudo === "function") atualizarTudo();
          if (typeof fecharModais === "function") fecharModais();

          const status = String(resultado && resultado.status || "CONCLUIDO");
          const textos = {
            CONCLUIDO: "✅ Fechamento diário salvo, conferido e zerado com segurança!",
            RECUPERADO: "✅ Fechamento diário recuperado e fila zerada com segurança!",
            JA_FECHADO: "✅ Este dia já estava fechado e permanece íntegro.",
            SEM_MOVIMENTO: "✅ Nenhum movimento encontrado para fechar neste dia."
          };
          mostrarAlerta((textos[status] || textos.CONCLUIDO) + mensagemResumo(resultado));
        } catch (erro) {
          mostrarAlerta(
            "✅ O fechamento foi salvo no servidor, mas a tela não conseguiu atualizar a fila.<br>" +
            "<small>Recarregue a página antes de continuar. " + String(erro.message || erro) + "</small>"
          );
        }
      })
      .withFailureHandler(function (erro) {
        mostrarAlerta(
          "✅ O fechamento foi salvo no servidor, mas não foi possível recarregar os pedidos.<br>" +
          "<small>Recarregue a página antes de continuar. " + String(erro && erro.message || erro) + "</small>"
        );
      })
      .carregarDadosNuvem();
  }

  function registrarFechamentoDiarioSeguro() {
    mostrarCarregando("Salvando e validando fechamento diário...");

    google.script.run
      .withSuccessHandler(function (resposta) {
        esconderCarregando();
        let resultado;
        try {
          resultado = JSON.parse(resposta || "{}");
        } catch (erro) {
          mostrarAlerta("❌ O servidor retornou uma resposta inválida. Nada foi zerado na tela.");
          return;
        }

        if (resultado.status === "BLOQUEADO_PENDENCIAS") {
          mostrarAlerta(
            "⚠️ Fechamento bloqueado: existem " + Number(resultado.pedidosPendentes || 0) +
            " pedido(s) pendente(s) na cozinha ou no caixa.<br><small>Finalize-os antes de zerar o dia.</small>"
          );
          return;
        }
        if (resultado.ok !== true) {
          mostrarAlerta("⚠️ O fechamento não foi concluído. Nenhum dado foi zerado.");
          return;
        }
        recarregarFilaDepoisDoFechamento(resultado);
      })
      .withFailureHandler(function (erro) {
        esconderCarregando();
        mostrarAlerta(
          "❌ O fechamento diário não foi concluído e a fila não foi zerada.<br>" +
          "<small>" + String(erro && erro.message || erro) + "</small>"
        );
      })
      .fecharDiaSeguro(dataHojePtBr(), "MANUAL");
  }

  function moeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    });
  }

  function textoPreviaFechamento(previa) {
    const resumo = previa && previa.resumo || {};
    return [
      "Confira os valores antes de fechar " + String(previa.data || dataHojePtBr()) + ":",
      "",
      "Total faturado: " + moeda(resumo.total),
      "PIX: " + moeda(resumo.pix),
      "Dinheiro: " + moeda(resumo.dinheiro),
      "Crédito: " + moeda(resumo.credito),
      "Débito: " + moeda(resumo.debito),
      "VR: " + moeda(resumo.vr),
      "Tapiocas: " + Number(resumo.qtdTapiocas || 0),
      "Pedidos finalizados: " + Number(resumo.pedidosFinalizados || 0),
      "Linhas em Vendas_hoje: " + Number(resumo.linhasVendasHoje || 0),
      "",
      "Somente após confirmar o servidor gravará Histórico, Fechamentos e Tapiocas Diária e então limpará Vendas_hoje."
    ].join("\n");
  }

  function atualizarModalComPreviaOficial(previa) {
    const resumo = previa && previa.resumo || {};
    const setTexto = function (id, valor) {
      const el = document.getElementById(id);
      if (el) el.textContent = valor;
    };

    setTexto("relFaturamento", moeda(resumo.total));
    setTexto("relDin", moeda(resumo.dinheiro));
    setTexto("relPix", moeda(resumo.pix));
    setTexto("relCred", moeda(resumo.credito));
    setTexto("relDeb", moeda(resumo.debito));
    setTexto("relVR", moeda(resumo.vr));
    setTexto("relQtdTapiocas", Number(resumo.qtdTapiocas || 0) + " un");
    setTexto("dataFechamentoPrint", String(previa && previa.data || dataHojePtBr()).slice(0, 5));

    const status = document.getElementById("statusPreviaFechamento");
    const botao = document.querySelector("#modalRelatorio .btn-fechamento-seguro");
    if (status) {
      const textos = {
        PRONTO: "✅ Valores oficiais carregados de Vendas_hoje.",
        BLOQUEADO_PENDENCIAS: "⚠️ Existem pedidos pendentes. Finalize-os antes de fechar.",
        DIVERGENCIA_PAGAMENTOS: "❌ Há divergência entre vendas e formas de pagamento.",
        JA_FECHADO: "✅ Este dia já consta como fechado.",
        SEM_MOVIMENTO: "ℹ️ Não existem vendas deste dia para fechar."
      };
      status.textContent = textos[String(previa && previa.status || "")] || "⚠️ Pré-validação indisponível.";
    }
    if (botao) {
      botao.disabled = !previa || previa.status !== "PRONTO";
      botao.style.opacity = botao.disabled ? "0.55" : "1";
      botao.style.cursor = botao.disabled ? "not-allowed" : "";
    }
  }

  function carregarPreviaFechamentoDiarioNoModal() {
    const modal = document.getElementById("modalRelatorio");
    const status = document.getElementById("statusPreviaFechamento");
    const botao = document.querySelector("#modalRelatorio .btn-fechamento-seguro");
    if (modal) modal.style.display = "flex";
    if (status) status.textContent = "⏳ Consultando valores oficiais de Vendas_hoje...";
    if (botao) {
      botao.disabled = true;
      botao.style.opacity = "0.55";
      botao.style.cursor = "not-allowed";
    }

    ["relFaturamento", "relDin", "relPix", "relCred", "relDeb", "relVR"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = "Carregando...";
    });
    const qtd = document.getElementById("relQtdTapiocas");
    if (qtd) qtd.textContent = "...";

    google.script.run
      .withSuccessHandler(function (resposta) {
        let previa;
        try {
          previa = JSON.parse(resposta || "{}");
        } catch (_) {
          if (status) status.textContent = "❌ Resposta inválida ao consultar o fechamento.";
          return;
        }
        atualizarModalComPreviaOficial(previa);
      })
      .withFailureHandler(function (erro) {
        if (status) {
          status.textContent = "❌ Não foi possível consultar Vendas_hoje. Fechamento bloqueado.";
        }
        mostrarAlerta(
          "❌ Não foi possível carregar os valores oficiais do fechamento.<br><small>" +
          String(erro && erro.message || erro) + "</small>"
        );
      })
      .obterPreviaFechamentoDiario(dataHojePtBr());
  }

  function confirmarFechamentoDiarioSeguro() {
    mostrarCarregando("Pré-validando fechamento diário...");

    google.script.run
      .withSuccessHandler(function (resposta) {
        esconderCarregando();
        let previa;
        try {
          previa = JSON.parse(resposta || "{}");
        } catch (_) {
          mostrarAlerta("❌ Não foi possível interpretar a prévia do fechamento. Nada foi alterado.");
          return;
        }

        if (previa.status === "BLOQUEADO_PENDENCIAS") {
          mostrarAlerta(
            "⚠️ Fechamento bloqueado: existem " + Number(previa.pedidosPendentes || 0) +
            " pedido(s) pendente(s) na cozinha ou no caixa."
          );
          return;
        }
        if (previa.status === "DIVERGENCIA_PAGAMENTOS") {
          mostrarAlerta(
            "❌ Fechamento bloqueado por divergência entre o total vendido e a soma das formas de pagamento." +
            "<br><small>Nenhum dado foi alterado. Revise os pagamentos antes de tentar novamente.</small>"
          );
          return;
        }
        if (previa.status === "JA_FECHADO") {
          mostrarAlerta("✅ Este dia já consta como fechado. Nenhum dado foi alterado.");
          return;
        }
        if (previa.status === "SEM_MOVIMENTO") {
          mostrarAlerta("ℹ️ Não existem vendas deste dia em Vendas_hoje para fechar.");
          return;
        }
        if (previa.ok !== true) {
          mostrarAlerta("⚠️ A pré-validação não autorizou o fechamento. Nenhum dado foi alterado.");
          return;
        }

        mostrarConfirmacao(
          textoPreviaFechamento(previa),
          registrarFechamentoDiarioSeguro,
          {
            titulo: "Conferir e fechar o dia?",
            icone: "✓",
            textoCancelar: "Voltar e revisar",
            textoConfirmar: "Confirmar fechamento"
          }
        );
      })
      .withFailureHandler(function (erro) {
        esconderCarregando();
        mostrarAlerta(
          "❌ Não foi possível pré-validar o fechamento. Nenhum dado foi alterado.<br><small>" +
          String(erro && erro.message || erro) + "</small>"
        );
      })
      .obterPreviaFechamentoDiario(dataHojePtBr());
  }

  function instalar() {
    // Substitui o fluxo legado sem alterar o grande index.html.
    window.registrarFechamentoDia = registrarFechamentoDiarioSeguro;
    window.confirmarRegistroFechamentoDiario = confirmarFechamentoDiarioSeguro;
    window.carregarPreviaFechamentoDiarioNoModal = carregarPreviaFechamentoDiarioNoModal;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", instalar, { once: true });
  } else {
    instalar();
  }
})();
