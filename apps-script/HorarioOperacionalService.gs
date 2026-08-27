// =========================================================
// SERVIÇO DE HORÁRIO OPERACIONAL CONFIÁVEL
// Fonte única para o cardápio público: Config_Horarios/Config_Rotas.
// Nunca converte falha de leitura em horário padrão de 18h–22h.
// =========================================================

function lerConfiguracaoOperacionalConfiavel_() {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const lock = LockService.getScriptLock();
    let bloqueado = false;
    try {
      // Usa o mesmo lock da gravação para impedir leitura entre a reescrita
      // das abas Config_Horarios, Config_Rotas, Config_MonteSua e Config_Adicionais.
      lock.waitLock(10000);
      bloqueado = true;

      const configuracaoSheets = lerConfiguracaoOperacionalSheets_();
      if (!configuracaoSheets) {
        throw new Error(
          "As abas da Configuração Operacional não foram encontradas ou estão vazias."
        );
      }

      const normalizada = normalizarConfiguracaoOperacional_(configuracaoSheets);
      limparCacheConfiguracaoOperacional_();
      salvarCacheConfiguracaoOperacional_(normalizada);
      return normalizada;
    } catch (erro) {
      ultimoErro = erro;
      console.error(
        "Falha ao ler Configuração Operacional confiável (tentativa " + tentativa + "):",
        erro
      );
    } finally {
      if (bloqueado) lock.releaseLock();
    }

    if (tentativa < 2 && Utilities && typeof Utilities.sleep === "function") {
      Utilities.sleep(120);
    }
  }

  console.error("Configuração Operacional indisponível após nova tentativa:", ultimoErro);
  throw erroApi_(
    "CONFIG_UNAVAILABLE",
    "Não foi possível consultar o horário configurado no PDV. Atualize a página e tente novamente."
  );
}

function obterConfiguracaoOperacionalConfiavel_() {
  return JSON.stringify(lerConfiguracaoOperacionalConfiavel_());
}

function obterStatusCardapioConfiavel_() {
  const config = lerConfiguracaoOperacionalConfiavel_();
  const regra = obterRegraOperacionalHoje_(config, new Date());
  const horario = regra.horario;
  const horaMinuto = String(regra.agora || "00:00");
  const aberto = horario.ativo === true &&
    horaMinuto >= horario.inicio &&
    horaMinuto < horario.fim &&
    regra.rotas.length > 0;

  return JSON.stringify({
    aberto: aberto,
    ativo: horario.ativo === true,
    diaSemana: regra.diaIso,
    // Mantém o contrato legado: `hora` continua sendo número inteiro.
    hora: Number(horaMinuto.split(":")[0]),
    // Novo campo com precisão de minuto para consumidores novos.
    horaMinuto: horaMinuto,
    abreAs: horario.inicio,
    fechaAs: horario.fim,
    rotas: regra.rotas.slice()
  });
}
