(function () {
  "use strict";

  function instalar_() {
    if (!document.body || !document.body.classList.contains("app-cliente")) return;
    if (window.TapimovelHorarioOperacional) return;

    var prepararOriginal = typeof window.prepararItem === "function" ? window.prepararItem : null;
    var validarOriginal = typeof window.validarPedido === "function" ? window.validarPedido : null;
    var avisoTimer = null;
    var ultimaLeitura = 0;

    function minutos_(valor) {
      var p = String(valor || "00:00").split(":").map(Number);
      return (p[0] || 0) * 60 + (p[1] || 0);
    }

    function estado_() {
      if (typeof configuracaoOperacional === "undefined" || !configuracaoOperacional) {
        return { carregado: false, aberto: false, ativo: false, rotas: [] };
      }
      var regra = regraOperacionalDoDia(diaAtualInt);
      var rotas = rotasOperacionaisDoDia(diaAtualInt);
      var agora = Number(horaAtualInt || 0) * 60 + Number(minutoAtualInt || 0);
      var inicio = minutos_(regra.inicio);
      var fim = minutos_(regra.fim);
      var emHorario = regra.ativo === true && agora >= inicio && agora < fim;
      return {
        carregado: true,
        ativo: regra.ativo === true,
        aberto: emHorario && rotas.length > 0,
        emHorario: emHorario,
        rotas: rotas,
        inicio: String(regra.inicio || "00:00"),
        fim: String(regra.fim || "00:00"),
        agora: agora,
        inicioMin: inicio,
        fimMin: fim
      };
    }

    function mensagem_(e) {
      if (!e.carregado) return "Carregando o horário configurado no PDV...";
      if (!e.ativo) return "O atendimento de hoje está desativado na Configuração Operacional.";
      if (e.agora < e.inicioMin) return "O atendimento de hoje está configurado das <b>" + e.inicio + " às " + e.fim + "</b> e ainda não começou.";
      if (e.agora >= e.fimMin) return "O atendimento de hoje estava configurado das <b>" + e.inicio + " às " + e.fim + "</b> e já foi encerrado.";
      if (!e.rotas.length) return "O horário está aberto das <b>" + e.inicio + " às " + e.fim + "</b>, mas não há rota cadastrada para hoje.";
      return "O cardápio está indisponível conforme a Configuração Operacional.";
    }

    function atualizarLogo_(e) {
      var logo = document.querySelector(".header-logo");
      if (!logo) return;
      logo.classList.remove("status-aberta", "status-encerrando", "status-fechada");
      if (!e.aberto) {
        logo.classList.add("status-fechada");
        return;
      }
      logo.classList.add((e.fimMin - e.agora) <= 60 ? "status-encerrando" : "status-aberta");
    }

    window.atualizarRelogioAtendimento = function (recarregar) {
      if (recarregar === undefined) recarregar = true;
      var antes = String(diaAtualInt) + "-" + String(horaAtualInt) + "-" + String(minutoAtualInt) + "-" + String(lojaAberta);
      var h = obterHorarioSaoPaulo(new Date());
      diaAtualInt = h.dia;
      horaAtualInt = h.hora;
      minutoAtualInt = h.minuto || 0;

      var e = estado_();
      lojaAberta = e.aberto;
      atualizarLogo_(e);

      var depois = String(diaAtualInt) + "-" + String(horaAtualInt) + "-" + String(minutoAtualInt) + "-" + String(lojaAberta);
      if (recarregar && antes !== depois) {
        window.carregarConfiguracoesDia();
        window.mudarAba(categoriaAtiva, document.querySelector('.tab[data-categoria="' + categoriaAtiva + '"]'));
      }
      return lojaAberta;
    };

    window.carregarConfiguracoesDia = function () {
      var rota = document.getElementById("cliRota");
      var status = document.getElementById("menuStatus");
      var titulo = document.getElementById("menuStatusTitulo");
      var texto = document.getElementById("menuStatusTexto");
      var badge = document.getElementById("diaSemanaBadge");
      if (badge) badge.textContent = (modoTeste ? "TESTE · " : "") + nomesDias[diaAtualInt];
      if (!rota || !status || !titulo || !texto) return;

      var e = estado_();
      lojaAberta = e.aberto;
      rota.disabled = true;

      if (!e.carregado) {
        rota.innerHTML = '<option value="">Carregando configuração...</option>';
        status.classList.add("fechado");
        titulo.textContent = "Consultando horário";
        texto.textContent = "Carregando a Configuração Operacional do PDV...";
        return;
      }

      if (e.aberto) {
        rota.disabled = false;
        rota.innerHTML = '<option value="">-- Selecione seu bairro ou rua --</option>';
        e.rotas.forEach(function (r) {
          rota.innerHTML += '<option value="' + escaparHtml(r) + '">' + escaparHtml(r) + "</option>";
        });
        status.classList.remove("fechado");
        titulo.textContent = "Pedidos abertos";
        texto.textContent = "Atendimento configurado das " + e.inicio + " às " + e.fim + " · " + e.rotas.join(" • ");
      } else {
        rota.innerHTML = '<option value="">Cardápio indisponível agora</option>';
        status.classList.add("fechado");
        titulo.textContent = "Cardápio fechado";
        texto.innerHTML = mensagem_(e);
      }
    };

    window.abrirAvisoAtendimento = function () {
      var e = estado_();
      if (!e.carregado) {
        if (!avisoTimer) {
          avisoTimer = setTimeout(function () {
            avisoTimer = null;
            window.abrirAvisoAtendimento();
          }, 120);
        }
        return;
      }

      window.atualizarRelogioAtendimento(false);
      e = estado_();
      var modal = document.getElementById("modalStatusAtendimento");
      if (!modal) return;
      if (e.aberto) {
        modal.style.display = "none";
        return;
      }

      var titulo = document.getElementById("statusAtendimentoTitulo");
      var texto = document.getElementById("statusAtendimentoTexto");
      var icone = document.getElementById("statusAtendimentoIcone");
      var rotas = document.getElementById("statusAtendimentoRotas");
      var sair = document.getElementById("btnSairCardapio");
      var whatsapp = document.getElementById("btnWhatsappPosRota");

      if (icone) icone.textContent = e.ativo ? "🕒" : "📅";
      if (titulo) titulo.textContent = e.ativo ? "Cardápio fechado agora" : "Pedidos indisponíveis hoje";
      if (texto) texto.innerHTML = mensagem_(e);
      if (rotas) rotas.hidden = true;
      if (sair) sair.hidden = false;
      if (whatsapp) whatsapp.hidden = true;
      modal.style.display = "flex";
    };

    if (prepararOriginal) {
      window.prepararItem = function () {
        window.atualizarRelogioAtendimento(false);
        if (!lojaAberta) return mostrarAlerta(mensagem_(estado_()));
        return prepararOriginal.apply(this, arguments);
      };
    }

    if (validarOriginal) {
      window.validarPedido = function () {
        window.atualizarRelogioAtendimento(false);
        if (!lojaAberta) return mostrarAlerta(mensagem_(estado_()));
        return validarOriginal.apply(this, arguments);
      };
    }

    function reler_() {
      var agora = Date.now();
      if (agora - ultimaLeitura < 2500) return;
      ultimaLeitura = agora;
      if (typeof window.carregarConfiguracaoOperacional === "function") {
        window.carregarConfiguracaoOperacional();
      }
    }

    setInterval(reler_, 60000);
    window.addEventListener("focus", reler_);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") reler_();
    });

    window.TapimovelHorarioOperacional = {
      statusAtual: estado_,
      atualizarConfiguracao: reler_
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", instalar_, { once: true });
  } else {
    instalar_();
  }
})();
