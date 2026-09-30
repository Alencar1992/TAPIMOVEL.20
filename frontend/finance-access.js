(function (root, factory) {
  "use strict";
  var api = factory();
  root.TapimovelAcessoFinanceiro = api;
  if (root.document) api.instalarInterface(root);
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var AREAS = {
    liquidez: true,
    gestao: true,
    rankings: true
  };

  function normalizarArea(area) {
    var normalizada = String(area || "").trim().toLowerCase();
    if (!AREAS[normalizada]) throw new Error("Área financeira inválida.");
    return normalizada;
  }

  function criarControlador(opcoes) {
    opcoes = opcoes || {};
    if (typeof opcoes.autorizar !== "function") {
      throw new Error("O autorizador financeiro é obrigatório.");
    }
    var pendente = null;
    var tickets = Object.create(null);

    return {
      solicitar: function (area, aoLiberar) {
        var normalizada = normalizarArea(area);
        pendente = {
          area: normalizada,
          aoLiberar: typeof aoLiberar === "function" ? aoLiberar : function () {}
        };
        if (typeof opcoes.aoSolicitar === "function") {
          opcoes.aoSolicitar(normalizada);
        }
      },

      confirmar: function (pin) {
        if (!pendente) return Promise.reject(new Error("Nenhum acesso foi solicitado."));
        var atual = pendente;
        return Promise.resolve(opcoes.autorizar(pin, atual.area)).then(function (resposta) {
          if (!resposta || !resposta.ticket) {
            throw new Error("O servidor não forneceu uma autorização válida.");
          }
          if (pendente !== atual) return null;
          tickets[atual.area] = String(resposta.ticket);
          pendente = null;
          atual.aoLiberar(tickets[atual.area]);
          return resposta;
        });
      },

      cancelar: function () {
        pendente = null;
      },

      obterTicket: function (area) {
        return tickets[normalizarArea(area)] || "";
      },

      obterAreaPendente: function () {
        return pendente ? pendente.area : "";
      }
    };
  }

  function instalarInterface(root) {
    var rotulos = {
      liquidez: "Liquidez mensal",
      gestao: "Gestão O.P.",
      rankings: "Rankings de vendas"
    };

    function elemento(id) {
      return root.document.getElementById(id);
    }

    function executarApi(nome, args) {
      return new Promise(function (resolve, reject) {
        var runner = root.google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(reject);
        runner[nome].apply(runner, args || []);
      });
    }

    function obterStatusNoServidor() {
      return new Promise(function (resolve, reject) {
        root.google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(reject)
          .obterStatusPinAreasFinanceiras();
      });
    }

    function configurarPinNoServidor(pin) {
      return new Promise(function (resolve, reject) {
        root.google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(reject)
          .configurarPinAreasFinanceiras(pin);
      });
    }

    function exibirErro(id, erro) {
      var destino = elemento(id);
      if (destino) destino.textContent = erro && erro.message ? erro.message : String(erro || "Falha inesperada.");
    }

    function fecharModalPin() {
      var modal = elemento("modalPinFinanceiro");
      var campo = elemento("pinFinanceiro");
      if (modal) modal.style.display = "none";
      if (campo) campo.value = "";
      exibirErro("erroPinFinanceiro", "");
    }

    var controlador = criarControlador({
      autorizar: function (pin, area) {
        return executarApi("autorizarAreaFinanceira", [pin, area]);
      },
      aoSolicitar: function (area) {
        var modal = elemento("modalPinFinanceiro");
        var titulo = elemento("tituloPinFinanceiro");
        var campo = elemento("pinFinanceiro");
        if (titulo) titulo.textContent = "Acessar " + rotulos[area];
        if (campo) campo.value = "";
        exibirErro("erroPinFinanceiro", "");
        if (modal) modal.style.display = "flex";
        if (campo) root.setTimeout(function () { campo.focus(); }, 0);
      }
    });

    root.solicitarAcessoFinanceiro = function (area, aoLiberar) {
      controlador.solicitar(area, aoLiberar);
    };

    root.obterTicketFinanceiro = function (area) {
      return controlador.obterTicket(area);
    };

    root.confirmarPinFinanceiro = function (evento) {
      if (evento) evento.preventDefault();
      var campo = elemento("pinFinanceiro");
      var botao = elemento("btnConfirmarPinFinanceiro");
      var pin = String(campo && campo.value || "").trim();
      if (!/^\d{4}$/.test(pin)) {
        exibirErro("erroPinFinanceiro", "Digite os 4 números do PIN.");
        return false;
      }
      if (botao) botao.disabled = true;
      exibirErro("erroPinFinanceiro", "");
      controlador.confirmar(pin).then(function (resposta) {
        if (!resposta) return;
        fecharModalPin();
      }).catch(function (erro) {
        exibirErro("erroPinFinanceiro", erro);
        if (campo) {
          campo.value = "";
          campo.focus();
        }
      }).then(function () {
        if (botao) botao.disabled = false;
      });
      return false;
    };

    root.cancelarPinFinanceiro = function () {
      controlador.cancelar();
      fecharModalPin();
    };

    root.carregarStatusPinFinanceiro = function () {
      var status = elemento("statusPinFinanceiro");
      if (!status) return Promise.resolve();
      status.textContent = "Consultando configuração…";
      status.dataset.estado = "carregando";
      return obterStatusNoServidor().then(function (resposta) {
        status.textContent = resposta && resposta.configurado
          ? "PIN configurado com segurança no servidor."
          : "PIN ainda não configurado.";
        status.dataset.estado = resposta && resposta.configurado ? "ok" : "pendente";
      }).catch(function (erro) {
        status.textContent = erro && erro.message ? erro.message : "Não foi possível consultar o PIN.";
        status.dataset.estado = "erro";
      });
    };

    root.configurarPinFinanceiro = function (evento) {
      if (evento) evento.preventDefault();
      var campo = elemento("configPinFinanceiro");
      var confirmacao = elemento("configPinFinanceiroConfirmacao");
      var botao = elemento("btnSalvarPinFinanceiro");
      var pin = String(campo && campo.value || "").trim();
      var repeticao = String(confirmacao && confirmacao.value || "").trim();
      exibirErro("erroConfigPinFinanceiro", "");
      if (!/^\d{4}$/.test(pin)) {
        exibirErro("erroConfigPinFinanceiro", "O PIN deve conter exatamente 4 números.");
        return false;
      }
      if (pin !== repeticao) {
        exibirErro("erroConfigPinFinanceiro", "Os PINs informados não coincidem.");
        return false;
      }
      if (botao) botao.disabled = true;
      configurarPinNoServidor(pin).then(function () {
        if (campo) campo.value = "";
        if (confirmacao) confirmacao.value = "";
        return root.carregarStatusPinFinanceiro();
      }).catch(function (erro) {
        exibirErro("erroConfigPinFinanceiro", erro);
      }).then(function () {
        if (botao) botao.disabled = false;
      });
      return false;
    };
  }

  return {
    criarControlador: criarControlador,
    normalizarArea: normalizarArea,
    instalarInterface: instalarInterface
  };
});
