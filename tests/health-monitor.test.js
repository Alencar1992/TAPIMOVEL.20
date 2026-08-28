const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const raiz = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(raiz, "scripts", "health-check.mjs"), "utf8");
const workflow = fs.readFileSync(path.join(raiz, ".github", "workflows", "health-monitor.yml"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(raiz, "package.json"), "utf8"));

test("health-check cobre PDV, cliente, API e configuração operacional", () => {
  assert.match(script, /GitHub Pages — PDV\/ADM/);
  assert.match(script, /GitHub Pages — Cardápio cliente/);
  assert.match(script, /Apps Script — API/);
  assert.match(script, /Apps Script — Configuração operacional/);
  assert.match(script, /obterStatusCardapio/);
});

test("health-check é estritamente somente leitura", () => {
  assert.match(script, /method:\s*"GET"/);
  assert.doesNotMatch(script, /method:\s*"POST"/);
  assert.doesNotMatch(script, /registrarPedido|salvar|fecharMes|SpreadsheetApp|PropertiesService/);
});

test("workflow executa a cada hora e também após mudança relevante na main", () => {
  assert.match(workflow, /cron:\s*"17 \* \* \* \*"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /scripts\/health-check\.mjs/);
});

test("incidente é aberto em falha e encerrado automaticamente na recuperação", () => {
  assert.match(workflow, /issues:\s*write/);
  assert.match(workflow, /gh issue create/);
  assert.match(workflow, /gh issue edit/);
  assert.match(workflow, /gh issue comment/);
  assert.match(workflow, /gh issue close/);
  assert.match(workflow, /steps\.health\.outputs\.status == 'unhealthy'/);
});

test("health-check fica disponível como comando oficial do projeto", () => {
  assert.equal(packageJson.scripts["health:check"], "node scripts/health-check.mjs");
});
