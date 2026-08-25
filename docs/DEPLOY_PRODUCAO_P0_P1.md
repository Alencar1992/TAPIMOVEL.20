# Deploy de produção — P0 + P1

## Escopo

Este procedimento promove para o Apps Script oficial as alterações já mescladas na `main`:

- **P0** — fechamento mensal recuperável e isolado por competência;
- **P1** — configuração operacional dinâmica para horários, rotas, Monte Sua e adicionais;
- compatibilidade transitória do frontend com backend anterior durante a janela de implantação.

Commit de referência da `main` no início desta promoção: `2381cc50b0a3c23a22c89e2e33f943e321f29aeb`.

## Arquivos que devem ser publicados no Apps Script

Use exatamente os arquivos da branch `main`:

- `apps-script/Code.gs`
- `apps-script/appsscript.json`

Não altere `frontend/config.js`. O frontend oficial já aponta para a implantação `/exec` existente.

## Estratégia recomendada

**Não criar uma nova implantação com nova URL.**

No Apps Script oficial, atualize o código e depois edite a implantação web existente selecionando **Nova versão**. Isso preserva a mesma URL `/exec` usada pelo GitHub Pages e reduz o risco de quebra de integração.

## Passo a passo no Apps Script

1. Abra o projeto Apps Script oficial.
2. Antes de alterar qualquer arquivo, confirme que você está no projeto oficial correto.
3. No editor, substitua integralmente o conteúdo de `Code.gs` pelo conteúdo de `apps-script/Code.gs` da `main`.
4. Abra `appsscript.json` no editor e substitua integralmente pelo conteúdo de `apps-script/appsscript.json` da `main`.
5. Salve o projeto.
6. Abra **Implantar > Gerenciar implantações**.
7. Localize a implantação web atualmente usada pelo frontend oficial.
8. Clique em **Editar**.
9. Em **Versão**, selecione **Nova versão**.
10. Mantenha o tipo como **Aplicativo da Web**.
11. Confirme que a execução continua como o usuário que implanta e que o nível de acesso permanece igual ao da implantação atual.
12. Clique em **Implantar**.
13. Confirme que a URL final `/exec` permanece a mesma já configurada no frontend.

## Validação imediata após o deploy

Executar nesta ordem:

### 1. Saúde básica da API

Abrir a URL `/exec` sem parâmetros. Esperado:

- serviço `Tapimóvel 2.0 API`;
- status `online`.

### 2. Endpoint P1

Abrir:

`<URL_EXEC>?action=obterConfiguracaoOperacional`

Esperado:

- resposta `ok`;
- configuração com `versao: 1`;
- horários de segunda a sexta ativos por padrão;
- sábado e domingo inativos por padrão;
- rotas atuais preservadas;
- adicionais com valor padrão de R$ 4,00;
- combinações atuais do Monte Sua preservadas.

### 3. Cardápio cliente

Validar:

- carregamento sem erro;
- rota do dia correta;
- endereço e número continuam obrigatórios;
- adicionais carregam normalmente;
- Monte Sua mostra os valores atuais;
- indisponibilidade/pausa diária continua funcionando.

### 4. PDV / administração

Validar:

- login administrativo;
- login do CEO Eliel;
- abertura da tela de Configuração;
- card **Configuração operacional** visível;
- leitura de horários e rotas;
- leitura do valor/listas de adicionais;
- leitura das combinações do Monte Sua.

**Não alterar valores ainda.** Primeiro confirmar somente leitura.

### 5. Teste controlado do P1

Depois da leitura aprovada:

1. alterar um valor não destrutivo e facilmente reversível na Configuração Operacional;
2. salvar;
3. recarregar a tela;
4. confirmar persistência;
5. confirmar que o cardápio/PDV refletem a mesma configuração;
6. restaurar o valor original se o teste tiver sido apenas de validação.

### 6. P0 — fechamento mensal

No Relatório Eliel:

- abrir a prévia de fechamento;
- confirmar que pedidos de outra competência não bloqueiam o mês selecionado;
- confirmar que fechamento já existente continua reconhecido;
- confirmar mensagem de recuperação segura apenas quando houver operação interrompida;
- **não executar fechamento real apenas para teste** se não houver uma competência pronta para fechamento.

## Critérios de sucesso

A promoção é considerada aprovada quando:

- a URL `/exec` permanece a mesma;
- API responde online;
- `obterConfiguracaoOperacional` responde corretamente;
- login admin e CEO Eliel continuam funcionando;
- Configuração Operacional abre e lê dados;
- cardápio cliente carrega normalmente;
- PDV continua operando normalmente;
- prévia do fechamento P0 funciona sem afetar outras competências;
- não há duplicação de fechamento, histórico ou log.

## Rollback

Se ocorrer erro grave após a publicação:

1. abrir **Implantar > Gerenciar implantações**;
2. editar a mesma implantação web;
3. selecionar a versão anterior que estava em produção;
4. implantar novamente;
5. confirmar que a URL `/exec` permaneceu inalterada;
6. validar login, cardápio e PDV;
7. registrar o erro observado antes de nova tentativa.

O rollback deve ser feito pela **versão da implantação**, sem apagar dados, sem recriar planilha e sem trocar a URL do frontend.

## Observação sobre o manifesto

O manifesto atual usa:

- fuso `America/Sao_Paulo`;
- runtime `V8`;
- execução como `USER_DEPLOYING`;
- acesso web `ANYONE_ANONYMOUS`.

Esses valores não devem ser alterados durante esta promoção sem uma mudança de segurança planejada separadamente.
