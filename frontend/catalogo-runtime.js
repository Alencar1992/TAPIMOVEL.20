(function () {
  "use strict";

  var categorias = [
    "salgadas",
    "especiais",
    "doces_tradicionais",
    "doces_avela",
    "doces_nutella",
    "bebidas"
  ];

  function ehAdicionalLegado(item) {
    return normalizarBusca(item && item.nome) === "+ adicional";
  }

  function copiar(catalogo) {
    var resultado = {};
    categorias.forEach(function (categoria) {
      resultado[categoria] = Array.isArray(catalogo && catalogo[categoria])
        ? catalogo[categoria].filter(function (item) {
            return !ehAdicionalLegado(item);
          }).map(function (item) {
            return {
              nome: String(item.nome || ""),
              preco: Number(item.preco) || 0,
              tipo: item.tipo === "bebida" ? "bebida" : "tapioca",
              ing: String(item.ing || ""),
              imagem: String(item.imagem || "")
            };
          })
        : [];
    });
    return resultado;
  }

  function substituir(destino, origem) {
    var bebidasPadrao = copiar(destino).bebidas;
    var normalizado = copiar(origem);
    var contemBebidaGenericaLegada = normalizado.bebidas.some(function (item) {
      var nome = normalizarBusca(item && item.nome);
      return nome === "refri / suco - lata" || nome === "🥤 refri / suco - lata";
    });
    if (contemBebidaGenericaLegada && bebidasPadrao.length > 1) {
      normalizado.bebidas = bebidasPadrao;
    }
    categorias.forEach(function (categoria) {
      destino[categoria] = normalizado[categoria];
    });
    window.dispatchEvent(new CustomEvent("tapimovel:catalogo-atualizado"));
    return destino;
  }

  function carregar(destino, aoConcluir) {
    google.script.run
      .withSuccessHandler(function (resposta) {
        try {
          substituir(destino, JSON.parse(resposta || "{}"));
        } catch (erro) {
          console.error("Catálogo recebido em formato inválido:", erro);
        }
        if (typeof aoConcluir === "function") aoConcluir();
      })
      .withFailureHandler(function (erro) {
        console.error("Não foi possível carregar o catálogo configurado:", erro);
        if (typeof aoConcluir === "function") aoConcluir();
      })
      .obterCatalogoCardapio(JSON.stringify(copiar(destino)));
  }

  function normalizarBusca(valor) {
    return String(valor == null ? "" : valor)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/\s+/g, " ")
      .trim();
  }

  function correspondeBusca(item, termo, rotuloCategoria) {
    var busca = normalizarBusca(termo);
    if (!busca) return true;
    return [item && item.nome, item && item.ing, rotuloCategoria]
      .some(function (valor) { return normalizarBusca(valor).includes(busca); });
  }

  window.TapimovelCatalogo = {
    categorias: categorias.slice(),
    copiar: copiar,
    substituir: substituir,
    carregar: carregar,
    normalizarBusca: normalizarBusca,
    correspondeBusca: correspondeBusca
  };
})();

(function () {
  "use strict";

  function instalarHorarioOperacionalCliente_() {
    if (!document.body || !document.body.classList.contains("app-cliente")) return;
    if (window.TapimovelHorarioOperacional && window.TapimovelHorarioOperacional.instalado) return;

    var obterHorarioOriginal = typeof window.obterHorarioSaoPaulo === "function"
      ? window.obterHorarioSaoPaulo
      : null;
    var prepararItemOriginal = typeof window.prepararItem === "function"
      ? window.prepararItem
      : null;
    var validarPedidoOriginal = typeof window.validarPedido === "function"
      ? window.validarPedido
      : null;
    var timerAviso = null;
    var ultimaAtualizacaoConfig = 0;

    function minutos_(valor) {
      var partes = String(valor || "00:00").split(":").map(Number);
      return (partes[0] || 0) * 60 + (partes[1] || 0);
    }

    function statusAtual_() {
      if (typeof configuracaoOperacional === "undefined" || !configuracaoOperacional) {
        return {
          carregado: false,
          ativo: false,
          aberta: false,
          emHorario: false,
          rotas: [],
          inicio: "",
          fim: "",
          agoraMinutos: 0
        };
      }

      var regra = typeof regraOperacionalDoDia === "function"
        ? regraOperacionalDoDia(diaAtualInt)
        : { ativo: false, inicio: "00:00", fim: "00:00" };
      var rotas = typeof rotasOperacionaisDoDia === "function"
        ? rotasOperacionaisDoDia(diaAtualInt)
        : [];
      var agoraMinutos = Number(horaAtualInt || 0) * 60 + Number(minutoAtualInt || 0);
      var inicioMinutos = minutos_(regra.inicio);
      var fimMinutos = minutos_(regra.fim);
      var emHorario = regra.ativo === true &&
        agoraMinutos >= inicioMinutos &&
        agoraMinutos < fimMinutos;

      return {
        carregado: true,
        ativo: regra.ativo === true,
        aberta: emHorario && rotas.length > 0,
        emHorario: emHorario,
        rotas: rotas,
        inicio: String(regra.inicio || "00:00"),
        fim: String(regra.fim || "00:00"),
        agoraMinutos: agoraMinutos,
        inicioMinutos: inicioMinutos,
        fimMinutos: fimMinutos
      };
    }

    function atualizarLogo_(status) {
      var logo = document.querySelector(".header-logo");
      if (!logo) return;
      logo.classList.remove("status-aberta", "status-encerrando", "status-fechada");

      if (!status.carregado || !status.aberta) {
        logo.classList.add("status-fechada");
        return;
      }

      var faltam = status.fimMinutos - status.agoraMinutos;
      logo.classList.add(faltam <= 60 ? "status-encerrando" : "status-aberta");
    }

    function mensagemFechado_() {
      var status = statusAtual_();
      if (!status.carregado) {
        return "Estamos carregando o horário configurado no PDV. Aguarde alguns segundos e tente novamente.";
      }
      if (!status.ativo) {
        return "O atendimento de hoje está <b>desativado na Configuração Operacional</b> do PDV.";
      }
      if (status.agoraMinutos < status.inicioMinutos) {
        return "O atendimento de hoje está configurado das <b>" +
          status.inicio + " às " + status.fim + "</b> e ainda não começou.";
      }
      if (status.agoraMinutos >= status.fimMinutos) {
        return "O atendimento de hoje estava configurado das <b>" +
          status.inicio + " às " + status.fim + "</b> e já foi encerrado.";
      }
      if (!status.rotas.length) {
        return "O horário de hoje está aberto das <b>" + status.inicio + " às " +
          status.fim + "</b>, mas não existe rota cadastrada para hoje.";
      }
      return "O cardápio digital está indisponível neste momento.";
    }

    function montarResumoConfigurado_() {
      var linhas = [];
      for (var diaJs = 0; diaJs <= 6; diaJs++) {
        var regra = regraOperacionalDoDia(diaJs);
        if (!regra || regra.ativo !== true) continue;
        var rotas = rotasOperacionaisDoDia(diaJs);
        var nomeDia = nomesDias[diaJs] || ("Dia " + diaJs);
        linhas.push(
          '<div class="status-rota-dia"><strong>' +
          escaparHtml(nomeDia) + " · " + escaparHtml(regra.inicio) + " às " +
          escaparHtml(regra.fim) + "</strong>" +
          (rotas.length
            ? rotas.map(escaparHtml).join(" · ")
            : "Sem rota cadastrada") +
          "</div>"
        );
      }
      return linhas.join("");
    }

    window.obterHorarioSaoPaulo = function (agora) {
      if (typeof modoTeste !== "undefined" && modoTeste) {
        var diaInformado = Number(parametrosTeste.get("dia"));
        var horaInformada = Number(parametrosTeste.get("hora"));
        var minutoInformado = Number(parametrosTeste.get("minuto"));
        var dia = Number.isInteger(diaInformado) ? Math.min(6, Math.max(0, diaInformado)) : 1;
        var hora = Number.isFinite(horaInformada) ? Math.min(23, Math.max(0, horaInformada)) : 19;
        var minuto = Number.isFinite(minutoInformado) ? Math.min(59, Math.max(0, minutoInformado)) : 0;
        return { dia: dia, hora: hora, minuto: minuto };
      }
      return obterHorarioOriginal ? obterHorarioOriginal(agora || new Date()) : { dia: 0, hora: 0, minuto: 0 };
    };

    window.atualizarRelogioAtendimento = function (recarregarTela) {
      if (recarregarTela === undefined) recarregarTela = true;

      var anterior = String(diaAtualInt) + "-" + String(horaAtualInt) + "-" +
        String(minutoAtualInt) + "-" + String(lojaAberta);
      var horario = window.obterHorarioSaoPaulo(new Date());

      diaAtualInt = horario.dia;
      horaAtualInt = horario.hora;
      minutoAtualInt = horario.minuto || 0;

      var status = statusAtual_();
      lojaAberta = status.aberta;
      atualizarLogo_(status);

      var atual = String(diaAtualInt) + "-" + String(horaAtualInt) + "-" +
        String(minutoAtualInt) + "-" + String(lojaAberta);

      if (recarregarTela && anterior !== atual) {
        if (typeof window.carregarConfiguracoesDia === "function") {
          window.carregarConfiguracoesDia();
        }
        if (typeof window.mudarAba === "function") {
          window.mudarAba(
            categoriaAtiva,
            document.querySelector('.tab[data-categoria="' + categoriaAtiva + '"]')
          );
        }
      }
      return lojaAberta;
    };

    window.carregarConfiguracoesDia = function () {
      var badge = document.getElementById("diaSemanaBadge");
      var selectRota = document.getElementById("cliRota");
      var inputLivre = document.getElementById("cliRotaLivre");
      var boxNum = document.getElementById("boxNumero");
      var statusBox = document.getElementById("menuStatus");
      var statusTitulo = document.getElementById("menuStatusTitulo");
      var statusTexto = document.getElementById("menuStatusTexto");

      if (badge) {
        badge.textContent = (typeof modoTeste !== "undefined" && modoTeste ? "TESTE · " : "") +
          (nomesDias[diaAtualInt] || "");
      }
      if (!selectRota || !statusBox || !statusTitulo || !statusTexto) return;

      if (inputLivre) inputLivre.style.display = "none";
      selectRota.style.display = "block";
      selectRota.disabled = true;
      if (boxNum) boxNum.style.display = "block";
      selectRota.innerHTML = '<option value="">Carregando configuração...</option>';

      var status = statusAtual_();
      if (!status.carregado) {
        lojaAberta = false;
        statusBox.classList.add("fechado");
        statusTitulo.textContent = "Consultando horário";
        statusTexto.textContent = "Carregando a Configuração Operacional do PDV...";
        return;
      }

      lojaAberta = status.aberta;

      if (status.aberta) {
        selectRota.disabled = false;
        selectRota.innerHTML = '<option value="">-- Selecione seu bairro ou rua --</option>';
        status.rotas.forEach(function (rota) {
          selectRota.innerHTML += '<option value="' + escaparHtml(rota) + '">' +
            escaparHtml(rota) + "</option>";
        });
        statusBox.classList.remove("fechado");
        statusTitulo.textContent = "Pedidos abertos";
        statusTexto.textContent = "Atendimento configurado das " + status.inicio + " às " +
          status.fim + " · " + status.rotas.join(" • ");
        return;
      }

      selectRota.innerHTML = '<option value="">Cardápio indisponível agora</option>';
      statusBox.classList.add("fechado");
      statusTitulo.textContent = "Cardápio fechado";

      if (!status.ativo) {
        statusTexto.textContent = "O atendimento de hoje está desativado na Configuração Operacional.";
      } else if (status.agoraMinutos < status.inicioMinutos) {
        statusTexto.textContent = "O atendimento de hoje está configurado das " +
          status.inicio + " às " + status.fim + " e ainda não começou.";
      } else if (status.agoraMinutos >= status.fimMinutos) {
        statusTexto.textContent = "O atendimento configurado para hoje encerrou às " +
          status.fim + ".";
      } else if (!status.rotas.length) {
        statusTexto.textContent = "O horário está aberto das " + status.inicio + " às " +
          status.fim + ", mas não há rota cadastrada para hoje.";
      } else {
        statusTexto.textContent = "O cardápio está indisponível conforme a Configuração Operacional.";
      }
    };

    window.montarResumoRotas = montarResumoConfigurado_;

    window.abrirAvisoAtendimento = function () {
      var status = statusAtual_();

      if (!status.carregado) {
        if (!timerAviso) {
          timerAviso = window.setTimeout(function () {
            timerAviso = null;
            window.abrirAvisoAtendimento();
          }, 120);
        }
        return;
      }

      window.atualizarRelogioAtendimento(false);
      status = statusAtual_();

      var modal = document.getElementById("modalStatusAtendimento");
      if (!modal) return;

      if (status.aberta) {
        modal.style.display = "none";
        return;
      }

      var titulo = document.getElementById("statusAtendimentoTitulo");
      var texto = document.getElementById("statusAtendimentoTexto");
      var icone = document.getElementById("statusAtendimentoIcone");
      var rotas = document.getElementById("statusAtendimentoRotas");
      var btnWhatsapp = document.getElementById("btnWhatsappPosRota");
      var btnSair = document.getElementById("btnSairCardapio");

      if (rotas) rotas.hidden = true;
      if (btnWhatsapp) btnWhatsapp.hidden = true;
      if (btnSair) btnSair.hidden = false;

      if (!status.ativo) {
        if (icone) icone.textContent = "📅";
        if (titulo) titulo.textContent = "Pedidos indisponíveis hoje";
        if (texto) {
          texto.innerHTML = "O atendimento de hoje está <b>desativado na Configuração Operacional</b>. " +
            "Confira abaixo os dias e horários atualmente ativos.";
        }
        if (rotas) {
          rotas.innerHTML = montarResumoConfigurado_() ||
            '<div class="status-rota-dia">Nenhum dia está ativo na configuração.</div>';
          rotas.hidden = false;
        }
      } else if (status.agoraMinutos < status.inicioMinutos) {
        if (icone) icone.textContent = "👋";
        if (titulo) titulo.textContent = "Atendimento ainda não iniciado";
        if (texto) {
          texto.innerHTML = "Hoje o atendimento está configurado das <b>" +
            escaparHtml(status.inicio) + " às " + escaparHtml(status.fim) +
            "</b>.<br><br>" +
            (status.rotas.length
              ? "<b>Rota de hoje:</b><br>" + status.rotas.map(escaparHtml).join(" · ")
              : "Ainda não existe rota cadastrada para hoje.");
        }
      } else if (status.agoraMinutos >= status.fimMinutos) {
        if (icone) icone.textContent = "🌙";
        if (titulo) titulo.textContent = "Pedidos online encerrados";
        if (texto) {
          texto.innerHTML = "O horário configurado para hoje foi das <b>" +
            escaparHtml(status.inicio) + " às " + escaparHtml(status.fim) +
            "</b> e já terminou.";
        }
        if (btnWhatsapp) {
          var mensagem = "Oi, você ainda está passando na minha rua? Ainda dá tempo de pedir tapioca?";
          btnWhatsapp.href = "https://wa.me/5511932180290?text=" + encodeURIComponent(mensagem);
          btnWhatsapp.hidden = false;
        }
      } else {
        if (icone) icone.textContent = "🗺️";
        if (titulo) titulo.textContent = "Rota não configurada";
        if (texto) {
          texto.innerHTML = "O horário de hoje está aberto das <b>" +
            escaparHtml(status.inicio) + " às " + escaparHtml(status.fim) +
            "</b>, mas não existe rota cadastrada para receber pedidos online.";
        }
      }

      modal.style.display = "flex";
    };

    if (prepararItemOriginal) {
      window.prepararItem = function (produto) {
        window.atualizarRelogioAtendimento(false);
        if (!lojaAberta) {
          if (typeof window.mostrarAlerta === "function") {
            window.mostrarAlerta(mensagemFechado_());
          }
          return;
        }
        return prepararItemOriginal.apply(this, arguments);
      };
    }

    if (validarPedidoOriginal) {
      window.validarPedido = function () {
        window.atualizarRelogioAtendimento(false);
        if (!lojaAberta) {
          if (typeof window.mostrarAlerta === "function") {
            return window.mostrarAlerta(mensagemFechado_());
          }
          return;
        }
        return validarPedidoOriginal.apply(this, arguments);
      };
    }

    function atualizarConfiguracao_() {
      var agora = Date.now();
      if (agora - ultimaAtualizacaoConfig < 2500) return;
      ultimaAtualizacaoConfig = agora;
      if (typeof window.carregarConfiguracaoOperacional === "function") {
        window.carregarConfiguracaoOperacional();
      }
    }

    window.addEventListener("focus", atualizarConfiguracao_);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") atualizarConfiguracao_();
    });
    window.setInterval(atualizarConfiguracao_, 60000);

    window.TapimovelHorarioOperacional = {
      instalado: true,
      statusAtual: statusAtual_,
      mensagemFechado: mensagemFechado_,
      atualizarConfiguracao: atualizarConfiguracao_
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", instalarHorarioOperacionalCliente_, { once: true });
  } else {
    instalarHorarioOperacionalCliente_();
  }
})();
