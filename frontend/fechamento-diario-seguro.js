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

  function confirmarFechamentoDiarioSeguro() {
    mostrarConfirmacao(
      "O servidor vai conferir os pedidos, gravar Fechamentos_Diarios e Tapiocas Diária, validar as duas gravações e somente depois zerar os pedidos deste dia.",
      registrarFechamentoDiarioSeguro,
      {
        titulo: "Registrar e zerar o dia com segurança?",
        icone: "!",
        textoCancelar: "Cancelar",
        textoConfirmar: "Salvar, conferir e zerar"
      }
    );
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
