from pathlib import Path

code_path = Path("apps-script/Code.gs")
code = code_path.read_text(encoding="utf-8")

old_const = 'const CHAVE_CONFIG_OPERACIONAL_ = "tapimovel_config_operacional_v1";'
new_const = '''const CHAVE_CONFIG_OPERACIONAL_ = "tapimovel_config_operacional_v1"; // legado: somente migração
const CACHE_CONFIG_OPERACIONAL_ = "tapimovel_config_operacional_cache_v2";
const CACHE_CONFIG_OPERACIONAL_TTL_ = 300;
const ABA_CONFIG_HORARIOS_ = "Config_Horarios";
const ABA_CONFIG_ROTAS_ = "Config_Rotas";
const ABA_CONFIG_MONTE_SUA_ = "Config_MonteSua";
const ABA_CONFIG_ADICIONAIS_ = "Config_Adicionais";'''
if old_const not in code:
    raise SystemExit("Constante de configuração operacional não encontrada")
code = code.replace(old_const, new_const, 1)

old_functions = '''function obterConfiguracaoOperacional() {
  const props = PropertiesService.getScriptProperties();
  const salva = props.getProperty(CHAVE_CONFIG_OPERACIONAL_);
  if (!salva) return JSON.stringify(configuracaoOperacionalPadrao_());
  try {
    return JSON.stringify(normalizarConfiguracaoOperacional_(JSON.parse(salva)));
  } catch (erro) {
    console.error("Configuração operacional inválida; usando padrão:", erro);
    return JSON.stringify(configuracaoOperacionalPadrao_());
  }
}

function salvarConfiguracaoOperacional(configJSON, responsavel) {
  const config = normalizarConfiguracaoOperacional_(JSON.parse(configJSON || "{}"));
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    PropertiesService.getScriptProperties().setProperty(CHAVE_CONFIG_OPERACIONAL_, JSON.stringify(config));
    if (typeof registrarLogConfiguracao_ === "function") {
      registrarLogConfiguracao_(normalizarResponsavelConfiguracao_(responsavel || "Administrador"), "CONFIGURAÇÃO OPERACIONAL ATUALIZADA", "Operação", "rotas/horários/Monte Sua/adicionais", null, { versao: config.versao });
    }
    return JSON.stringify(config);
  } finally {
    lock.releaseLock();
  }
}'''

new_functions = r'''function obterOuCriarAbaConfigOperacional_(nomeAba, cabecalho) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let aba = ss.getSheetByName(nomeAba);
  if (!aba) aba = ss.insertSheet(nomeAba);
  if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, cabecalho.length)
      .setFontWeight("bold")
      .setBackground("#d9ead3");
  }
  return aba;
}

function linhasAbaConfigOperacional_(aba, colunas) {
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha <= 1) return [];
  return aba.getRange(2, 1, ultimaLinha - 1, colunas).getValues();
}

function reescreverAbaConfigOperacional_(nomeAba, cabecalho, linhas) {
  const aba = obterOuCriarAbaConfigOperacional_(nomeAba, cabecalho);
  const ultimaLinha = aba.getLastRow();
  if (ultimaLinha > 1) {
    aba.getRange(2, 1, ultimaLinha - 1, cabecalho.length).clearContent();
  }
  if (linhas.length) {
    aba.getRange(2, 1, linhas.length, cabecalho.length).setValues(linhas);
  }
}

function booleanoConfiguracaoSheets_(valor) {
  if (valor === true) return true;
  const texto = String(valor == null ? "" : valor).trim().toLowerCase();
  return texto === "true" || texto === "verdadeiro" || texto === "sim" || texto === "1";
}

function lerConfiguracaoOperacionalSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const horariosAba = ss.getSheetByName(ABA_CONFIG_HORARIOS_);
  const rotasAba = ss.getSheetByName(ABA_CONFIG_ROTAS_);
  const monteAba = ss.getSheetByName(ABA_CONFIG_MONTE_SUA_);
  const adicionaisAba = ss.getSheetByName(ABA_CONFIG_ADICIONAIS_);

  if (!horariosAba || !rotasAba || !monteAba || !adicionaisAba) return null;
  if (horariosAba.getLastRow() <= 1 || monteAba.getLastRow() <= 1) return null;

  const config = configuracaoOperacionalPadrao_();
  config.rotas = { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [] };
  config.monteSua.combinacoes = {};
  config.adicionais.salgado = [];
  config.adicionais.doce = [];

  linhasAbaConfigOperacional_(horariosAba, 4).forEach(function(linha) {
    const dia = String(Number(linha[0]));
    if (!/^[1-7]$/.test(dia)) return;
    config.horarios[dia] = {
      ativo: booleanoConfiguracaoSheets_(linha[1]),
      inicio: String(linha[2] || config.horarios[dia].inicio),
      fim: String(linha[3] || config.horarios[dia].fim)
    };
  });

  linhasAbaConfigOperacional_(rotasAba, 3)
    .sort(function(a, b) { return Number(a[1] || 0) - Number(b[1] || 0); })
    .forEach(function(linha) {
      const dia = String(Number(linha[0]));
      const rota = String(linha[2] || "").trim();
      if (/^[1-7]$/.test(dia) && rota) config.rotas[dia].push(rota);
    });

  linhasAbaConfigOperacional_(monteAba, 3).forEach(function(linha) {
    const base = String(linha[0] || "").trim();
    const queijo = String(linha[1] || "").trim();
    const preco = Number(linha[2]);
    if (!base || !queijo || !isFinite(preco)) return;
    if (!config.monteSua.combinacoes[base]) config.monteSua.combinacoes[base] = {};
    config.monteSua.combinacoes[base][queijo] = preco;
  });

  let valorAdicional = null;
  linhasAbaConfigOperacional_(adicionaisAba, 4)
    .sort(function(a, b) { return Number(a[1] || 0) - Number(b[1] || 0); })
    .forEach(function(linha) {
      const tipo = String(linha[0] || "").trim().toLowerCase();
      const item = String(linha[2] || "").trim();
      const valor = Number(linha[3]);
      if ((tipo === "salgado" || tipo === "doce") && item) {
        config.adicionais[tipo].push(item);
      }
      if (valorAdicional == null && isFinite(valor)) valorAdicional = valor;
    });
  if (valorAdicional != null) config.adicionais.valor = valorAdicional;

  return normalizarConfiguracaoOperacional_(config);
}

function gravarConfiguracaoOperacionalSheets_(config) {
  const normalizada = normalizarConfiguracaoOperacional_(config);
  const horarios = [];
  const rotas = [];
  const monte = [];
  const adicionais = [];

  for (let dia = 1; dia <= 7; dia++) {
    const chave = String(dia);
    const regra = normalizada.horarios[chave];
    horarios.push([dia, regra.ativo === true, regra.inicio, regra.fim]);
    (normalizada.rotas[chave] || []).forEach(function(rota, indice) {
      rotas.push([dia, indice + 1, valorStorageSeguro_(rota)]);
    });
  }

  Object.keys(normalizada.monteSua.combinacoes).forEach(function(base) {
    Object.keys(normalizada.monteSua.combinacoes[base]).forEach(function(queijo) {
      monte.push([
        valorStorageSeguro_(base),
        valorStorageSeguro_(queijo),
        Number(normalizada.monteSua.combinacoes[base][queijo])
      ]);
    });
  });

  ["salgado", "doce"].forEach(function(tipo) {
    (normalizada.adicionais[tipo] || []).forEach(function(item, indice) {
      adicionais.push([
        tipo,
        indice + 1,
        valorStorageSeguro_(item),
        Number(normalizada.adicionais.valor)
      ]);
    });
  });

  reescreverAbaConfigOperacional_(
    ABA_CONFIG_HORARIOS_,
    ["Dia ISO", "Ativo", "Início", "Fim"],
    horarios
  );
  reescreverAbaConfigOperacional_(
    ABA_CONFIG_ROTAS_,
    ["Dia ISO", "Ordem", "Rota"],
    rotas
  );
  reescreverAbaConfigOperacional_(
    ABA_CONFIG_MONTE_SUA_,
    ["Base", "Queijo", "Preço"],
    monte
  );
  reescreverAbaConfigOperacional_(
    ABA_CONFIG_ADICIONAIS_,
    ["Tipo", "Ordem", "Item", "Valor Unitário"],
    adicionais
  );
  return normalizada;
}

function obterCacheConfiguracaoOperacional_() {
  const bruto = CacheService.getScriptCache().get(CACHE_CONFIG_OPERACIONAL_);
  if (!bruto) return null;
  try {
    return normalizarConfiguracaoOperacional_(JSON.parse(bruto));
  } catch (erro) {
    CacheService.getScriptCache().remove(CACHE_CONFIG_OPERACIONAL_);
    return null;
  }
}

function salvarCacheConfiguracaoOperacional_(config) {
  const bruto = JSON.stringify(config);
  // Evita exceder o limite por item do CacheService se a configuração crescer muito.
  if (bruto.length <= 90000) {
    CacheService.getScriptCache().put(
      CACHE_CONFIG_OPERACIONAL_,
      bruto,
      CACHE_CONFIG_OPERACIONAL_TTL_
    );
  }
}

function limparCacheConfiguracaoOperacional_() {
  CacheService.getScriptCache().remove(CACHE_CONFIG_OPERACIONAL_);
}

function carregarConfiguracaoOperacionalPersistida_() {
  const props = PropertiesService.getScriptProperties();
  const legadoBruto = props.getProperty(CHAVE_CONFIG_OPERACIONAL_);

  if (legadoBruto != null) {
    let legado;
    try {
      legado = normalizarConfiguracaoOperacional_(JSON.parse(legadoBruto || "{}"));
    } catch (erro) {
      console.error(
        "Configuração operacional legada inválida; legado preservado e padrão usado:",
        erro
      );
      return { config: configuracaoOperacionalPadrao_(), persistida: false };
    }

    try {
      gravarConfiguracaoOperacionalSheets_(legado);
      props.deleteProperty(CHAVE_CONFIG_OPERACIONAL_);
      console.info(
        "Migração da configuração operacional concluída: PropertiesService -> Google Sheets"
      );
      return { config: legado, persistida: true };
    } catch (erro) {
      console.error(
        "Falha ao migrar configuração operacional para Sheets; legado preservado:",
        erro
      );
      return { config: legado, persistida: false };
    }
  }

  try {
    const sheets = lerConfiguracaoOperacionalSheets_();
    if (sheets) return { config: sheets, persistida: true };
  } catch (erro) {
    console.error("Falha ao ler configuração operacional do Sheets:", erro);
    return { config: configuracaoOperacionalPadrao_(), persistida: false };
  }

  const padrao = configuracaoOperacionalPadrao_();
  try {
    gravarConfiguracaoOperacionalSheets_(padrao);
    return { config: padrao, persistida: true };
  } catch (erro) {
    console.error("Falha ao inicializar configuração operacional no Sheets:", erro);
    return { config: padrao, persistida: false };
  }
}

function obterConfiguracaoOperacional() {
  const emCache = obterCacheConfiguracaoOperacional_();
  if (emCache) return JSON.stringify(emCache);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const cacheAposLock = obterCacheConfiguracaoOperacional_();
    if (cacheAposLock) return JSON.stringify(cacheAposLock);

    const resultado = carregarConfiguracaoOperacionalPersistida_();
    if (resultado.persistida) salvarCacheConfiguracaoOperacional_(resultado.config);
    return JSON.stringify(resultado.config);
  } finally {
    lock.releaseLock();
  }
}

function salvarConfiguracaoOperacional(configJSON, responsavel) {
  const config = normalizarConfiguracaoOperacional_(JSON.parse(configJSON || "{}"));
  const lock = LockService.getScriptLock();
  let anterior = null;
  let tinhaLegado = false;

  try {
    lock.waitLock(10000);
    const props = PropertiesService.getScriptProperties();
    const legadoBruto = props.getProperty(CHAVE_CONFIG_OPERACIONAL_);
    tinhaLegado = legadoBruto != null;

    if (tinhaLegado) {
      try {
        anterior = normalizarConfiguracaoOperacional_(JSON.parse(legadoBruto || "{}"));
      } catch (erro) {
        anterior = configuracaoOperacionalPadrao_();
      }
    } else {
      try {
        anterior = lerConfiguracaoOperacionalSheets_() || configuracaoOperacionalPadrao_();
      } catch (erro) {
        anterior = configuracaoOperacionalPadrao_();
      }
    }

    try {
      gravarConfiguracaoOperacionalSheets_(config);
      props.deleteProperty(CHAVE_CONFIG_OPERACIONAL_);
      limparCacheConfiguracaoOperacional_();
      salvarCacheConfiguracaoOperacional_(config);
    } catch (erroGravacao) {
      limparCacheConfiguracaoOperacional_();
      if (!tinhaLegado && anterior) {
        try {
          gravarConfiguracaoOperacionalSheets_(anterior);
        } catch (erroRollback) {
          console.error("Falha no rollback da configuração operacional:", erroRollback);
        }
      }
      throw erroGravacao;
    }

    if (typeof registrarLogConfiguracao_ === "function") {
      try {
        registrarLogConfiguracao_(
          normalizarResponsavelConfiguracao_(responsavel || "Administrador"),
          "CONFIGURAÇÃO OPERACIONAL ATUALIZADA",
          "Operação",
          "rotas/horários/Monte Sua/adicionais",
          null,
          { versao: config.versao, storage: "Google Sheets" }
        );
      } catch (erroLog) {
        console.error("Configuração salva, mas o log falhou:", erroLog);
      }
    }
    return JSON.stringify(config);
  } finally {
    lock.releaseLock();
  }
}'''

if old_functions not in code:
    raise SystemExit("Bloco obter/salvar configuração operacional não encontrado")
code = code.replace(old_functions, new_functions, 1)
code_path.write_text(code, encoding="utf-8")

backend_path = Path("tests/backend-security.test.js")
backend = backend_path.read_text(encoding="utf-8")
marker = 'test("configuração operacional migra legado e persiste no Google Sheets"'
if marker not in backend:
    backend += r'''

test("configuração operacional migra legado e persiste no Google Sheets", () => {
  const { context, properties } = createContext();
  const legado = context.configuracaoOperacionalPadrao_();
  legado.adicionais.valor = 5;
  legado.horarios["2"].inicio = "17:30";
  properties.set("tapimovel_config_operacional_v1", JSON.stringify(legado));

  const migrada = JSON.parse(context.obterConfiguracaoOperacional());
  assert.equal(migrada.adicionais.valor, 5);
  assert.equal(migrada.horarios["2"].inicio, "17:30");
  assert.equal(properties.has("tapimovel_config_operacional_v1"), false);

  const ss = context.SpreadsheetApp.getActiveSpreadsheet();
  ["Config_Horarios", "Config_Rotas", "Config_MonteSua", "Config_Adicionais"].forEach(nome => {
    assert.ok(ss.getSheetByName(nome), `aba ${nome} deve existir`);
  });

  const nova = JSON.parse(JSON.stringify(migrada));
  nova.adicionais.valor = 6;
  nova.rotas["2"].push("ROTA TESTE");
  context.registrarLogConfiguracao_ = () => {};
  context.salvarConfiguracaoOperacional(JSON.stringify(nova), "Administrador");

  const recarregada = JSON.parse(context.obterConfiguracaoOperacional());
  assert.equal(recarregada.adicionais.valor, 6);
  assert.ok(recarregada.rotas["2"].includes("ROTA TESTE"));
  assert.equal(properties.has("tapimovel_config_operacional_v1"), false);
});
'''
backend_path.write_text(backend, encoding="utf-8")

static_test = r'''const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const code = fs.readFileSync(path.join(__dirname, "../apps-script/Code.gs"), "utf8");

test("configuração operacional usa tabelas estruturadas no Google Sheets", () => {
  assert.match(code, /ABA_CONFIG_HORARIOS_ = "Config_Horarios"/);
  assert.match(code, /ABA_CONFIG_ROTAS_ = "Config_Rotas"/);
  assert.match(code, /ABA_CONFIG_MONTE_SUA_ = "Config_MonteSua"/);
  assert.match(code, /ABA_CONFIG_ADICIONAIS_ = "Config_Adicionais"/);
  assert.match(code, /function lerConfiguracaoOperacionalSheets_\(/);
  assert.match(code, /function gravarConfiguracaoOperacionalSheets_\(/);
  assert.match(code, /CacheService\.getScriptCache\(\)/);
});

test("PropertiesService fica somente como fonte legada de migração", () => {
  assert.doesNotMatch(code, /setProperty\(CHAVE_CONFIG_OPERACIONAL_/);
  assert.match(code, /getProperty\(CHAVE_CONFIG_OPERACIONAL_\)/);
  assert.match(code, /deleteProperty\(CHAVE_CONFIG_OPERACIONAL_\)/);
  assert.match(code, /Migração da configuração operacional concluída/);
});

test("contratos públicos de configuração permanecem compatíveis", () => {
  assert.match(code, /function obterConfiguracaoOperacional\(\)/);
  assert.match(code, /function salvarConfiguracaoOperacional\(configJSON, responsavel\)/);
  assert.match(code, /return JSON\.stringify\(config\)/);
});
'''
Path("tests/config-operacional-sheets.test.js").write_text(static_test, encoding="utf-8")

print("P3 aplicado: configuração operacional estruturada no Google Sheets.")
