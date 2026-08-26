# P8 — Deploy seguro do Google Apps Script

## Objetivo

Eliminar o risco de publicação manual incompleta no Apps Script sem transformar produção em deploy automático a cada merge.

O GitHub passa a ser a fonte do código e a publicação é iniciada manualmente. O workflow só pode publicar a ponta atual da `main`, reexecuta o CI, valida os módulos do Apps Script, confere o deployment existente e então atualiza esse mesmo deployment.

## Fluxo

1. PR aprovada e mesclada na `main`.
2. CI oficial verde.
3. Operador abre o workflow **Deploy Apps Script - produção**.
4. Seleciona `main` e informa `PUBLICAR`.
5. O job entra no environment `apps-script-production`.
6. Se o environment tiver Required reviewers, a execução aguarda aprovação manual.
7. O workflow reexecuta `npm run ci` e `npm run deploy:validate`.
8. O deployment ID configurado é validado antes de qualquer `clasp push`.
9. O código de `apps-script/` é enviado ao projeto oficial.
10. O mesmo deployment é atualizado com `clasp update-deployment`, preservando sua URL `/exec`.

## Configuração única necessária no GitHub

### 1. Criar o Environment

No repositório:

`Settings > Environments > New environment`

Nome exato:

`apps-script-production`

Recomendado: configurar **Required reviewers** para exigir aprovação antes do job de produção continuar.

### 2. Secret `APPS_SCRIPT_DEPLOYMENT_ID`

Dentro do environment `apps-script-production`, criar o secret:

`APPS_SCRIPT_DEPLOYMENT_ID`

O valor é o ID da implantação oficial atual — a parte da URL do Web App localizada entre `/s/` e `/exec`.

Não use um deployment de teste e não crie um deployment novo para o P8.

### 3. Secret `CLASPRC_JSON`

Primeiro habilite a **Google Apps Script API** para a conta que é proprietária/autorizada no projeto.

Em uma máquina confiável, faça login com a versão fixada pelo projeto:

```bash
npx -y @google/clasp@3.3.0 login
```

O clasp grava a autenticação em `.clasprc.json` no diretório do usuário. No Windows normalmente fica em:

`%USERPROFILE%\.clasprc.json`

Copie o conteúdo completo desse arquivo para o secret do environment:

`CLASPRC_JSON`

**Nunca** commite esse arquivo e não envie seu conteúdo por chat, issue ou PR. Ele contém credenciais OAuth reutilizáveis.

## Segurança incorporada

- workflow somente por `workflow_dispatch`;
- confirmação textual `PUBLICAR`;
- environment dedicado a produção;
- apenas `main`;
- somente a ponta atual da `main`;
- `npm run ci` executado novamente no momento do deploy;
- preflight estrutural do Apps Script;
- autenticação guardada apenas em secret;
- deployment ID validado **antes** do push;
- `concurrency` impede dois deploys simultâneos;
- `clasp update-deployment` atualiza o deployment existente;
- o workflow não usa `create-deployment`.

## Arquivos implantados

`.clasp.json` define `rootDir` como `apps-script`, portanto o deploy usa apenas os arquivos do backend Apps Script e o seu `appsscript.json`. O frontend do GitHub Pages não é enviado ao Apps Script.

## Primeira execução

A primeira execução deve ser tratada como validação do P8:

1. conferir secrets e environment;
2. executar o workflow na `main`;
3. aprovar o environment;
4. acompanhar os passos de validação;
5. confirmar que o deployment ID final é o mesmo;
6. abrir o PDV e executar smoke test de login, pedidos online, produção/caixa e configuração.

Se qualquer validação prévia falhar, corrigir a configuração e rodar novamente. Não contornar as verificações.

## Rollback

O P8 não substitui a estratégia de rollback de código. Em regressão:

1. reverta o commit problemático na `main` por PR;
2. aguarde CI verde;
3. execute novamente **Deploy Apps Script - produção**;
4. o mesmo deployment receberá a versão revertida.
