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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", instalar, { once: true });
  } else {
    instalar();
  }
})();
