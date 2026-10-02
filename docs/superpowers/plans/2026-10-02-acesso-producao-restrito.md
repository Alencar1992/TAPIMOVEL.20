# Acesso Produção Restrito Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o perfil Produção com PIN provisionado fora do código e acesso limitado a Prod., Online, Caixa e Itens.

**Architecture:** O serviço de autenticação ganha uma credencial derivada com salt em Script Properties e uma sessão `producao`. A API aplica uma allowlist operacional própria, enquanto o frontend usa o perfil retornado para separar armazenamento, navegação e visibilidade.

**Tech Stack:** Google Apps Script, JavaScript no navegador, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-10-02-acesso-producao-restrito.md`

## Global Constraints

- Nunca registrar o PIN real em código, testes, documentação, Issue, commit, URL, log ou localStorage.
- Admin e CEO Eliel mantêm os contratos e permissões existentes.
- Produção só acessa `view-producao`, `view-pedidos-online`, `view-painel` e `view-itens`.
- Configuração de PIN é exclusiva do perfil Admin.
- Toda autorização deve ser aplicada novamente no backend.

## Review Focus

- PIN curto ou malformado: rejeitar configuração fora de exatamente 4 dígitos.
- Sessão Produção após recarga: usar prefixo e modo próprios, sem sobrescrever Admin.
- Navegação manual: negar qualquer view fora da lista operacional.
- Chamada manual de endpoint: negar criação de pedido, relatórios e configurações.
- Caixa operacional: concluir/cancelar pedidos sem expor edição pelo catálogo.

---

### Task 1: Autenticação e armazenamento seguro do PIN

**Files:**
- Modify: `apps-script/Code.gs`
- Modify: `apps-script/SecurityUtils.gs`
- Modify: `apps-script/AuthService.gs`
- Test: `tests/backend-security.test.js`

**Interfaces:**
- Produces: `configurarPinProducao(pin)`, sessão `{ perfil: "producao", nome: "Produção" }` e verificação de derivação com salt.

- [x] Escrever testes falhando para configuração exclusiva de 4 dígitos, ausência de texto puro e login Produção.
- [x] Executar `node --test tests/backend-security.test.js` e confirmar falha.
- [x] Implementar constantes, derivação com salt, configuração e detecção do perfil Produção.
- [x] Executar o teste focado e confirmar aprovação.
- [x] Commitar a unidade autenticável.

### Task 2: Autorização operacional no backend

**Files:**
- Modify: `apps-script/Api.gs`
- Test: `tests/backend-security.test.js`

**Interfaces:**
- Consumes: sessão `perfil === "producao"` da Task 1.
- Produces: allowlist `acoesProducao` e configuração de PIN restrita a Admin.

- [x] Escrever testes falhando para ações permitidas e negadas.
- [x] Executar o teste focado e confirmar falha.
- [x] Implementar a matriz de autorização e identidade automática de disponibilidade.
- [x] Executar o teste focado e confirmar aprovação.
- [x] Commitar a autorização do servidor.

### Task 3: Sessão e navegação Produção no frontend

**Files:**
- Modify: `frontend/api-client.js`
- Modify: `frontend/index.html`
- Test: `tests/frontend-integrity.test.js`

**Interfaces:**
- Consumes: sessão Produção da Task 1.
- Produces: modo `producao`, prefixo `tapimovel_producao_` e guarda de views.

- [x] Escrever testes falhando para persistência separada, redirecionamento, visibilidade e guarda de telas.
- [x] Executar `node --test tests/frontend-integrity.test.js` e confirmar falha.
- [x] Implementar o perfil visual, abertura em Prod., menu Itens e bloqueio do botão Editar no Caixa.
- [x] Executar o teste focado e confirmar aprovação.
- [x] Commitar a experiência operacional.

### Task 4: Configuração administrativa do PIN

**Files:**
- Modify: `frontend/index.html`
- Modify: `frontend/configuracao.js`
- Modify: `frontend/configuracao.css`
- Test: `tests/frontend-integrity.test.js`
- Test: `tests/backend-security.test.js`

**Interfaces:**
- Consumes: `configurarPinProducao(pin)` e sessão Admin.
- Produces: formulário administrativo que envia e limpa o PIN sem persistência local.

- [x] Escrever testes falhando para formulário Admin, validação e limpeza do segredo.
- [x] Executar os testes focados e confirmar falha.
- [x] Implementar o cartão de segurança e chamada autenticada.
- [x] Executar os testes focados e confirmar aprovação.
- [x] Commitar o provisionamento administrativo.

### Task 5: Verificação integral e entrega GitHub

**Files:**
- Modify: `docs/superpowers/plans/2026-10-02-acesso-producao-restrito.md`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: branch revisada e pull request ligado à Issue #100.

- [x] Procurar o PIN real no diff e confirmar zero ocorrências introduzidas.
- [x] Executar `npm run ci` e `npm run deploy:validate`.
- [x] Revisar o diff e marcar este plano conforme o resultado real.
- [ ] Enviar a branch e abrir PR com `Closes #100`.
