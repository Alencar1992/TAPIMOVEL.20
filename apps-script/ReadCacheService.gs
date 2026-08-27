// =========================================================
// P12 — CACHE ANALÍTICO DE LEITURA
// Somente dados de relatório. Filas e fechamentos críticos nunca usam cache.
// =========================================================

const CACHE_LEITURA_ANALITICA_TTL_ = 30;
const CACHE_LEITURA_ANALITICA_PREFIXO_ = "tapimovel_analytics_v1:";
const CACHE_LEITURA_ANALITICA_LIMITE_ = 90000;
const ABAS_CACHE_LEITURA_ANALITICA_ = [
  "Historico_Diario",
  "Fechamentos_Diarios",
  "Tapiocas Diária",
  "Combustivel"
];

function abaPermitidaCacheLeituraAnalitica_(nomeAba) {
  return ABAS_CACHE_LEITURA_ANALITICA_.indexOf(String(nomeAba || "")) !== -1;
}

function chaveCacheLeituraAnalitica_(nomeAba) {
  return CACHE_LEITURA_ANALITICA_PREFIXO_ + String(nomeAba || "");
}

function lerAbaAnalitica_(nomeAba, forcarAtualizacao) {
  const nome = String(nomeAba || "");
  if (!abaPermitidaCacheLeituraAnalitica_(nome)) {
    throw new Error("A aba " + nome + " não pode usar o cache analítico.");
  }

  const cache = CacheService.getScriptCache();
  const chave = chaveCacheLeituraAnalitica_(nome);
  if (forcarAtualizacao !== true) {
    const salvo = cache.get(chave);
    if (salvo) {
      try {
        const dados = JSON.parse(salvo);
        if (Array.isArray(dados)) return dados;
      } catch (_) {
        cache.remove(chave);
      }
    }
  }

  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome);
  if (!aba) return [];
  const dados = aba.getDataRange().getDisplayValues();
  const serializado = JSON.stringify(dados);
  if (serializado.length <= CACHE_LEITURA_ANALITICA_LIMITE_) {
    cache.put(chave, serializado, CACHE_LEITURA_ANALITICA_TTL_);
  }
  return dados;
}

function invalidarCacheLeituraAnalitica_(nomeAba) {
  const nome = String(nomeAba || "");
  if (!abaPermitidaCacheLeituraAnalitica_(nome)) return false;
  CacheService.getScriptCache().remove(chaveCacheLeituraAnalitica_(nome));
  return true;
}

function invalidarCachesAnaliticos_() {
  const cache = CacheService.getScriptCache();
  ABAS_CACHE_LEITURA_ANALITICA_.forEach(function(nome) {
    cache.remove(chaveCacheLeituraAnalitica_(nome));
  });
  return true;
}
