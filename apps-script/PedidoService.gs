// =========================================================
// P7 — SERVIÇO DE PEDIDOS
// Validação, pedidos online e criação/atualização do PDV.
// Persistência de filas permanece em SheetsRepository.gs.
// =========================================================

function salvarVendaRealTime(pedidoJSON) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const p = JSON.parse(pedidoJSON);
    const c = obterScriptProperties_();
    let a = carregarFilaPdvAtivos_();
    a.push(p);
    substituirFilaPdvAtivos_(a);
  } catch (e) {
    console.error("Erro salvarVendaRealTime: ", e);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function atualizarVendaRealTime(pedidoJSON) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const p = JSON.parse(pedidoJSON);
    const c = obterScriptProperties_();
    let a = carregarFilaPdvAtivos_();
    const i = a.findIndex(x => x.numero == p.numero);
    if (i !== -1) {
      a[i] = p;
      substituirFilaPdvAtivos_(a);
    }
  } catch (e) {
    console.error("Erro atualizarVendaRealTime: ", e);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function precoMonteSua_(nome) {
  const config = JSON.parse(obterConfiguracaoOperacional());
  const combinacoes = config.monteSua && config.monteSua.combinacoes || {};
  const match = String(nome || "").match(/^Monte Sua: (.+) c\/ (.+)$/);
  if (!match || !combinacoes[match[1]] || combinacoes[match[1]][match[2]] == null) {
    throw erroApi_("INVALID_ORDER", "A combinação do Monte a Sua não é válida.");
  }
  return Number(combinacoes[match[1]][match[2]]);
}

function normalizarPedidoOnline_(pedidoRecebido, catalogo) {
  if (!pedidoRecebido || typeof pedidoRecebido !== "object" || Array.isArray(pedidoRecebido)) {
    throw erroApi_("INVALID_ORDER", "Pedido inválido.");
  }
  if (!Array.isArray(pedidoRecebido.itens) ||
      pedidoRecebido.itens.length < 1 ||
      pedidoRecebido.itens.length > 30) {
    throw erroApi_("INVALID_ORDER", "O pedido deve conter entre 1 e 30 itens.");
  }

  const itensCatalogo = {};
  CATEGORIAS_CATALOGO_.forEach(function(categoria) {
    (catalogo[categoria] || []).forEach(function(item) {
      itensCatalogo[item.nome] = item;
    });
  });

  const itens = pedidoRecebido.itens.map(function(item) {
    const nome = textoPedidoSeguro_(item && item.nome, 140, true);
    const quantidade = Number(item && item.quantidade);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 20) {
      throw erroApi_("INVALID_ORDER", "A quantidade de cada item deve ser de 1 a 20.");
    }

    const cadastrado = itensCatalogo[nome];
    let preco = 0;
    let tipo = "tapioca";
    let ingredientes = "";
    if (cadastrado) {
      preco = Number(cadastrado.preco);
      tipo = cadastrado.tipo === "bebida" ? "bebida" : "tapioca";
      ingredientes = textoPedidoSeguro_(cadastrado.ing, 500, false);
    } else if (nome.indexOf("Monte Sua:") === 0) {
      preco = precoMonteSua_(nome);
      ingredientes = textoPedidoSeguro_(item.ing, 500, false);
    } else {
      throw erroApi_(
        "INVALID_ORDER",
        "O item '" + nome + "' não está disponível no cardápio."
      );
    }

    return {
      nome: nome,
      preco: Math.round(preco * 100) / 100,
      tipo: tipo,
      ing: ingredientes,
      quantidade: quantidade,
      obs: textoPedidoSeguro_(item.obs, 300, false),
      pronto: false
    };
  });

  const pagamentos = [
    "PIX",
    "Cartão de Crédito",
    "Cartão de Débito",
    "VR (Vale Refeição)"
  ];
  let pagamento = textoPedidoSeguro_(pedidoRecebido.pagamentoDesejado, 100, true);
  if (pagamento.indexOf("Dinheiro (") !== 0 && pagamentos.indexOf(pagamento) === -1) {
    throw erroApi_("INVALID_ORDER", "A forma de pagamento é inválida.");
  }

  return {
    origem: "Online",
    nomeCliente: textoPedidoSeguro_(pedidoRecebido.nomeCliente, 100, true),
    telefoneCliente: textoPedidoSeguro_(pedidoRecebido.telefoneCliente, 20, true),
    enderecoCliente: textoPedidoSeguro_(pedidoRecebido.enderecoCliente, 180, true),
    pagamentoDesejado: pagamento,
    itens: itens,
    total: itens.reduce(function(total, item) {
      return total + item.quantidade * item.preco;
    }, 0),
    produzido: false
  };
}

function normalizarPedidoPdv_(pedidoRecebido) {
  if (!pedidoRecebido || typeof pedidoRecebido !== "object" || Array.isArray(pedidoRecebido)) {
    throw erroApi_("INVALID_ORDER", "Pedido do PDV inválido.");
  }
  if (!Array.isArray(pedidoRecebido.itens) ||
      pedidoRecebido.itens.length < 1 ||
      pedidoRecebido.itens.length > 50) {
    throw erroApi_("INVALID_ORDER", "O pedido deve conter entre 1 e 50 itens.");
  }
  const tipos = ["tapioca", "bebida", "extra"];
  const configOperacional = JSON.parse(obterConfiguracaoOperacional());
  const adicionaisPermitidos = {
    salgado: (configOperacional.adicionais && configOperacional.adicionais.salgado) || [],
    doce: (configOperacional.adicionais && configOperacional.adicionais.doce) || []
  };
  const valorAdicional = Number(configOperacional.adicionais && configOperacional.adicionais.valor) || 0;
  const itens = pedidoRecebido.itens.map(function(item) {
    const quantidade = Number(item && item.quantidade);
    const preco = Number(item && item.preco);
    const tipo = String(item && item.tipo || "");
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 20) {
      throw erroApi_("INVALID_ORDER", "A quantidade de cada item deve ser de 1 a 20.");
    }
    if (!isFinite(preco) || preco <= 0 || preco > 1000) {
      throw erroApi_("INVALID_ORDER", "O preço do item é inválido.");
    }
    if (tipos.indexOf(tipo) === -1) {
      throw erroApi_("INVALID_ORDER", "O tipo do item é inválido.");
    }
    const adicionais = Array.isArray(item.adicionais)
      ? item.adicionais.slice(0, 13).map(function(valor) {
          return textoPedidoSeguro_(valor, 100, true);
        })
      : [];
    if (adicionais.some(function(valor, indice) { return adicionais.indexOf(valor) !== indice; })) {
      throw erroApi_("INVALID_ORDER", "A tapioca possui adicionais duplicados.");
    }
    let categoriaAdicional = String(item && item.categoriaAdicional || "");
    if (adicionais.length) {
      if (tipo !== "tapioca" || !adicionaisPermitidos[categoriaAdicional]) {
        throw erroApi_("INVALID_ORDER", "A categoria dos adicionais é inválida.");
      }
      if (adicionais.some(function(valor) {
        return adicionaisPermitidos[categoriaAdicional].indexOf(valor) === -1;
      })) {
        throw erroApi_("INVALID_ORDER", "Há um adicional incompatível com esta tapioca.");
      }
    } else if (!adicionaisPermitidos[categoriaAdicional]) {
      categoriaAdicional = "";
    }
    let precoBase = Number(item && item.precoBase);
    if (!isFinite(precoBase) || precoBase <= 0) {
      precoBase = preco - (adicionais.length * valorAdicional);
    }
    precoBase = Math.round(precoBase * 100) / 100;
    const precoEsperado = Math.round((precoBase + adicionais.length * valorAdicional) * 100) / 100;
    if (tipo === "tapioca" && adicionais.length && Math.abs(preco - precoEsperado) > 0.001) {
      throw erroApi_("INVALID_ORDER", "O valor dos adicionais não corresponde ao total do item.");
    }
    return {
      nome: textoPedidoSeguro_(item.nome, 140, true),
      preco: Math.round(preco * 100) / 100,
      precoBase: precoBase,
      tipo: tipo,
      ing: textoPedidoSeguro_(item.ing, 500, false),
      quantidade: quantidade,
      obs: textoPedidoSeguro_(item.obs, 300, false),
      pronto: item.pronto === true,
      categoriaAdicional: categoriaAdicional,
      adicionais: adicionais,
      personalizacoes: Array.isArray(item.personalizacoes)
        ? item.personalizacoes.slice(0, 20).map(function(valor) {
            return textoPedidoSeguro_(valor, 100, false);
          })
        : []
    };
  });
  return {
    origem: "PDV",
    itens: itens,
    total: itens.reduce(function(total, item) {
      return total + item.quantidade * item.preco;
    }, 0),
    produzido: itens.filter(function(item) {
      return item.tipo !== "bebida";
    }).every(function(item) {
      return item.pronto;
    })
  };
}

function registrarPedidoPdv(pedidoJSON) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const pedido = normalizarPedidoPdv_(JSON.parse(pedidoJSON || "{}"));
    const props = obterScriptProperties_();
    const ativos = carregarFilaPdvAtivos_();
    const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const numerosHoje = ativos.filter(function(item) {
      const ts = item.timestampCriacao || item.timestamp;
      return ts && Utilities.formatDate(
        new Date(ts),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd"
      ) === hoje;
    }).map(function(item) {
      return Number(item.numero) || 0;
    });
    pedido.numero = (numerosHoje.length ? Math.max.apply(null, numerosHoje) : 0) + 1;
    pedido.timestampCriacao = Date.now();
    pedido.hora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm");
    ativos.push(pedido);
    lancarPedidoPlanilha(JSON.stringify(pedido));
    substituirFilaPdvAtivos_(ativos);
    return pedido;
  } finally {
    lock.releaseLock();
  }
}

function atualizarPedidoPdv(pedidoJSON) {
  const recebido = JSON.parse(pedidoJSON || "{}");
  const numero = Number(recebido.numero);
  if (!Number.isInteger(numero) || numero < 1) {
    throw erroApi_("INVALID_ORDER", "Número do pedido inválido.");
  }
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const props = obterScriptProperties_();
    const ativos = carregarFilaPdvAtivos_();
    const indice = ativos.findIndex(function(item) {
      return Number(item.numero) === numero;
    });
    if (indice === -1) {
      throw erroApi_("ORDER_NOT_FOUND", "O pedido não foi encontrado.");
    }
    const pedidoAnterior = ativos[indice];
    const pedido = normalizarPedidoPdv_(recebido);
    pedido.numero = numero;
    pedido.timestampCriacao = ativos[indice].timestampCriacao;
    pedido.hora = ativos[indice].hora;
    try {
      removerDaBaseDeVendasBackend(numero);
      lancarPedidoPlanilha(JSON.stringify(pedido));
    } catch (erro) {
      try {
        removerDaBaseDeVendasBackend(numero);
        lancarPedidoPlanilha(JSON.stringify(pedidoAnterior));
      } catch (erroRestauracao) {
        console.error("Falha ao restaurar pedido após erro de atualização:", erroRestauracao);
      }
      throw erro;
    }
    ativos[indice] = pedido;
    substituirFilaPdvAtivos_(ativos);
    return pedido;
  } finally {
    lock.releaseLock();
  }
}

function obterConfiguracaoOperacionalPedidoOnlineFresca_() {
  let ultimoErro = null;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const configuracaoSheets = lerConfiguracaoOperacionalSheets_();
      if (!configuracaoSheets) {
        throw new Error("As abas da Configuração Operacional não foram encontradas ou estão vazias.");
      }
      const normalizada = normalizarConfiguracaoOperacional_(configuracaoSheets);
      limparCacheConfiguracaoOperacional_();
      salvarCacheConfiguracaoOperacional_(normalizada);
      return normalizada;
    } catch (erro) {
      ultimoErro = erro;
      console.error(
        "Falha ao reler configuração operacional no envio do pedido online (tentativa " +
        tentativa + "):",
        erro
      );
      if (tentativa < 2) Utilities.sleep(120);
    }
  }

  throw erroApi_(
    "CONFIG_UNAVAILABLE",
    "Não foi possível validar o horário configurado no PDV. Atualize o cardápio e tente novamente."
  );
}

function registrarPedidoOnline(pedidoJSON) {
  const configOperacional = obterConfiguracaoOperacionalPedidoOnlineFresca_();
  const regraOperacional = obterRegraOperacionalHoje_(configOperacional, new Date());
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const props = obterScriptProperties_();
    const catalogo = catalogoConfigurado_("{}");
    const pedido = normalizarPedidoOnline_(JSON.parse(pedidoJSON || "{}"), catalogo);
    const diaSemana = regraOperacional.diaIso;
    const horarioHoje = regraOperacional.horario;
    const horaAtual = regraOperacional.agora;
    const rotasPermitidas = regraOperacional.rotas;
    const endereco = String(pedido.enderecoCliente || "").trim().toUpperCase();
    const itensIndisponiveis = JSON.parse(
      props.getProperty("cardapio_itens_indisponiveis") || "[]"
    );
    const itemEsgotado = (pedido.itens || []).find(function(item) {
      return itensIndisponiveis.indexOf(item.nome) !== -1;
    });
    if (!horarioHoje.ativo) {
      throw new Error("O cardápio on-line está fechado para pedidos hoje.");
    }
    if (horaAtual < horarioHoje.inicio || horaAtual >= horarioHoje.fim) {
      throw new Error("O cardápio digital funciona hoje das " + horarioHoje.inicio + " às " + horarioHoje.fim + ".");
    }
    if (!rotasPermitidas.some(function(rota) { return endereco.indexOf(rota) === 0; })) {
      throw new Error("O endereço informado não pertence à rota disponível hoje.");
    }
    if (itemEsgotado) {
      throw new Error("O item '" + itemEsgotado.nome + "' está esgotado no momento.");
    }
    const telefoneNumeros = String(pedido.telefoneCliente || "").replace(/\D/g, "");
    if (telefoneNumeros.length < 10 || telefoneNumeros.length > 11) {
      throw erroApi_("INVALID_ORDER", "Informe um WhatsApp válido com DDD.");
    }
    pedido.telefoneCliente = telefoneNumeros;

    const cache = CacheService.getScriptCache();
    const assinatura = hashSeguro_(JSON.stringify({
      nome: pedido.nomeCliente.toLocaleLowerCase(),
      telefone: pedido.telefoneCliente,
      endereco: pedido.enderecoCliente.toLocaleLowerCase(),
      pagamento: pedido.pagamentoDesejado,
      itens: pedido.itens.map(function(item) {
        return [item.nome, item.quantidade, item.obs];
      })
    }));
    const chaveDuplicidade = "pdv_pedido_duplicado_" + assinatura;
    const pedidoExistente = cache.get(chaveDuplicidade);
    if (pedidoExistente) {
      return JSON.parse(pedidoExistente);
    }

    const chaveLimite = "pdv_pedido_limite_" + hashSeguro_(
      pedido.nomeCliente.toLocaleLowerCase() + "|" +
      pedido.enderecoCliente.toLocaleLowerCase()
    );
    const quantidadeRecente = Number(cache.get(chaveLimite) || 0);
    if (quantidadeRecente >= 3) {
      throw erroApi_(
        "RATE_LIMITED",
        "Limite de pedidos atingido. Aguarde 10 minutos antes de tentar novamente."
      );
    }

    const pendentes = carregarFilaPedidosOnlinePendentes_();
    const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    let contadorOnline = {};
    try { contadorOnline = JSON.parse(props.getProperty("pedidos_online_contador") || "{}"); } catch (erro) {}
    pedido.numeroOnline = contadorOnline.dia === hoje ? Number(contadorOnline.valor || 0) + 1 : 1;
    props.setProperty("pedidos_online_contador", JSON.stringify({ dia: hoje, valor: pedido.numeroOnline }));
    pedido.codigoOnline = "ON" + String(pedido.numeroOnline).padStart(3, "0");
    pedido.statusOnline = "Aguardando";
    pedido.timestampCriacao = Date.now();
    pedido.hora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm");
    pendentes.push(pedido);
    substituirFilaPedidosOnlinePendentes_(pendentes);
    const resultado = { numero: pedido.codigoOnline, pedido: pedido };
    cache.put(chaveDuplicidade, JSON.stringify(resultado), 120);
    cache.put(chaveLimite, String(quantidadeRecente + 1), 600);
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

function listarPedidosOnlinePendentes() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const pendentes = carregarFilaPedidosOnlinePendentes_();
    return pendentes.sort(function(a, b) {
      return Number(a.timestampCriacao || 0) - Number(b.timestampCriacao || 0);
    });
  } finally {
    lock.releaseLock();
  }
}

function aceitarPedidoOnline(codigoOnline) {
  const codigo = textoPedidoSeguro_(codigoOnline, 30, true);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const props = obterScriptProperties_();
    const pendentes = carregarFilaPedidosOnlinePendentes_();
    const indice = pendentes.findIndex(function(item) {
      return String(item.codigoOnline) === codigo;
    });
    if (indice === -1) {
      throw erroApi_("ORDER_ALREADY_PROCESSED", "Este pedido já foi aceito ou recusado por outro operador.");
    }

    const pedido = pendentes[indice];
    const ativos = carregarFilaPdvAtivos_();
    const hoje = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
    const numerosHoje = ativos.filter(function(item) {
      const ts = item.timestampCriacao || item.timestamp;
      return ts && Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), "yyyy-MM-dd") === hoje;
    }).map(function(item) { return Number(item.numero) || 0; });

    pedido.numero = (numerosHoje.length ? Math.max.apply(null, numerosHoje) : 0) + 1;
    pedido.statusOnline = "Aceito";
    pedido.aceitoEm = Date.now();
    pedido.produzido = false;
    lancarPedidoPlanilha(JSON.stringify(pedido));
    ativos.push(pedido);
    pendentes.splice(indice, 1);
    substituirFilaPdvAtivos_(ativos);
    substituirFilaPedidosOnlinePendentes_(pendentes);
    return pedido;
  } finally {
    lock.releaseLock();
  }
}

function recusarPedidoOnline(codigoOnline, motivo) {
  const codigo = textoPedidoSeguro_(codigoOnline, 30, true);
  const motivoSeguro = textoPedidoSeguro_(motivo, 300, true);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const props = obterScriptProperties_();
    const pendentes = carregarFilaPedidosOnlinePendentes_();
    const indice = pendentes.findIndex(function(item) {
      return String(item.codigoOnline) === codigo;
    });
    if (indice === -1) {
      throw erroApi_("ORDER_ALREADY_PROCESSED", "Este pedido já foi aceito ou recusado por outro operador.");
    }
    const pedido = pendentes[indice];
    pedido.statusOnline = "Recusado";
    pedido.motivoRecusa = motivoSeguro;
    pedido.recusadoEm = Date.now();
    pendentes.splice(indice, 1);
    substituirFilaPedidosOnlinePendentes_(pendentes);
    return pedido;
  } finally {
    lock.releaseLock();
  }
}
