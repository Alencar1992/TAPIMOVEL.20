# Acesso Produção Restrito — Especificação

## Objetivo

Adicionar um perfil operacional `producao`, separado de `admin` e `eliel`, que use o login existente e tenha acesso somente a Produção, Online, Caixa e disponibilidade de Itens.

## Experiência aprovada

- O formulário de acesso aceita PINs entre 4 e 12 dígitos.
- Ao reconhecer o PIN de Produção, o sistema cria uma sessão própria, persiste-a em armazenamento separado e abre `Prod.`.
- O cabeçalho exibe somente `Prod.`, `Online` e `Caixa`; o menu lateral exibe somente `Itens`.
- `Itens` permite consultar, pausar e reativar produtos. Não permite criar, editar ou remover itens do catálogo.
- O botão de edição de pedido do Caixa não aparece para Produção, pois abriria o catálogo de lançamento.
- Rotas de tela fora da lista aprovada são bloqueadas mesmo se chamadas manualmente no navegador.
- Admin e CEO Eliel mantêm seus fluxos e permissões atuais.

## Segurança

- O PIN real não pode aparecer em arquivos, testes, Issue, commits, logs, URLs ou armazenamento do navegador.
- O administrador configura ou troca o PIN em uma área própria dentro de Configuração.
- O backend persiste somente salt e derivação criptográfica do PIN em Script Properties.
- O campo é limpo após a operação e nunca retorna o segredo para a interface.
- Tentativas inválidas permanecem limitadas no backend.
- A sessão de Produção recebe perfil e chave de armazenamento próprios.
- A autorização real fica no backend por allowlist; esconder botões é somente a primeira barreira.

## Permissões do backend

O perfil Produção pode executar somente as escritas e leituras autenticadas necessárias às quatro telas:

- carregar a fila operacional;
- listar, aceitar e recusar pedidos online;
- atualizar o estado de produção de pedidos;
- concluir ou cancelar pagamentos no Caixa;
- remover pedidos já baixados ou travados da fila ativa;
- salvar disponibilidade diária dos itens.

Criação/edição de pedido no catálogo, relatórios, fechamentos, configurações, rankings e gestão financeira permanecem negados.

## Critérios de aceite

1. Login reconhece Produção sem alterar Admin ou CEO Eliel.
2. Recarregar a página restaura a sessão Produção no mesmo dia.
3. Somente as quatro áreas aprovadas ficam visíveis e navegáveis.
4. Chamadas manuais fora da allowlist retornam `PERMISSION_DENIED`.
5. O PIN pode ser configurado somente por Admin.
6. Nenhuma ocorrência do PIN real existe no diff ou histórico produzido pela mudança.
7. Suíte completa, qualidade e auditoria final passam.

