# Governança e CI — TAPIMOVEL.20

## Fluxo oficial de mudanças

1. Toda alteração nasce em uma branch dedicada.
2. A branch abre Pull Request para `main`.
3. O check **Qualidade e segurança / validar** precisa ficar verde.
4. A PR é revisada antes do merge.
5. O merge deve ser preferencialmente **Squash and merge**.
6. Alterações de Apps Script são publicadas somente depois do merge e da validação.
7. Mudanças de storage ou schema são validadas primeiro em homologação quando puderem afetar dados existentes.

## CI obrigatório

O comando canônico é:

```bash
npm run ci
```

Ele executa:

- validação de sintaxe do `Code.gs` e JavaScript do frontend;
- validação dos JSONs do projeto;
- verificação de timezone e runtime do Apps Script;
- detecção de marcadores de conflito de merge;
- bloqueio contra reintrodução dos storages legados no `PropertiesService`;
- suíte completa de testes Node.

## Regra de storage

Não voltar a persistir grandes estados nestas propriedades:

- `pdv_vendas_ativas`
- `pedidos_online_pendentes`
- `tapimovel_config_operacional_v1`

O Google Sheets é a fonte persistente oficial para esses dados. `PropertiesService` deve ficar restrito a estados pequenos e adequados ao limite da plataforma.

## Proteção recomendada para `main`

Configuração-alvo no GitHub:

- Require a pull request before merging: **ON**
- Require approvals: **1**
- Dismiss stale approvals when new commits are pushed: **ON**
- Require review from Code Owners: **ON**
- Require status checks to pass before merging: **ON**
- Status check obrigatório: **Qualidade e segurança / validar**
- Require branches to be up to date before merging: **ON**
- Block force pushes: **ON**
- Block deletions: **ON**

## Deploy

### Backend Apps Script

O deploy de produção continua controlado:

1. `main` verde;
2. copiar `apps-script/Code.gs` e, quando necessário, `apps-script/appsscript.json`;
3. publicar **Nova versão** na implantação existente;
4. preservar a URL `/exec`;
5. executar smoke test do fluxo alterado;
6. em migrações, validar as abas e os dados resultantes no Sheets.

### Frontend / GitHub Pages

Publicar apenas conteúdo já mesclado na `main` e com CI verde.

## Rollback

Se uma publicação apresentar regressão:

1. identificar o último commit estável da `main`;
2. reverter via nova PR, sem editar diretamente a `main`;
3. publicar nova versão do Apps Script com o código revertido, quando aplicável;
4. não apagar dados migrados até confirmar a integridade do rollback.
