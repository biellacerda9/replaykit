# Roadmap do ReplayKit

O objetivo da primeira versão é gravar uma execução HTTP de uma aplicação Node.js e reproduzi-la sem realizar novamente suas chamadas externas.

Cada sprint precisa terminar com um comportamento executável e testado. Uma sprint não está pronta apenas porque seus arquivos foram criados.

## Sprint 0 — Ambiente de desenvolvimento

**Estado:** concluída.

- monorepo com pnpm;
- TypeScript estrito;
- build, lint, formatação e testes;
- configuração do VS Code;
- integração contínua no GitHub Actions;
- pacote inicial `@replaykit/core`.

**Pronta quando:** `pnpm check` passa localmente e na integração contínua.

## Sprint 1 — Domínio de uma execução

- definir os estados de uma execução;
- impedir combinações inválidas de dados;
- iniciar, concluir e falhar uma execução;
- representar request, response e erro;
- testar todas as transições do ciclo de vida.

**Pronta quando:** conseguimos criar uma execução em memória e provar por testes que ela termina com uma resposta ou com um erro, sem estados impossíveis.

## Sprint 2 — SDK para Express

- criar o pacote `@replaykit/sdk`;
- criar um middleware Express;
- gerar um identificador por request;
- propagar o contexto com `AsyncLocalStorage`;
- capturar request, response, duração e erros;
- testar requests concorrentes para garantir que seus contextos não se misturam.

**Pronta quando:** uma aplicação Express de exemplo produz uma `Execution` completa para cada request.

## Sprint 3 — Gravação de chamadas HTTP externas

- interceptar `fetch` com instalação e desinstalação controladas;
- capturar método, URL, headers relevantes e body;
- clonar e registrar a response sem quebrar a aplicação;
- associar cada chamada à execução atual;
- registrar a ordem das chamadas;
- limitar tamanhos e remover dados sensíveis.

**Pronta quando:** o endpoint de exemplo mostra a request principal, suas chamadas externas e o resultado completo em uma timeline.

## Sprint 4 — Motor de replay

- introduzir os modos `record` e `replay`;
- carregar uma execução gravada;
- comparar método, URL, body normalizado e ordem;
- devolver responses gravadas;
- bloquear chamadas externas desconhecidas;
- detectar chamadas gravadas que não foram consumidas;
- relatar divergências no resultado final.

**Pronta quando:** desligamos a API externa e a aplicação ainda reproduz a execução usando somente os dados gravados.

## Sprint 5 — Persistência e API

- definir uma abstração de repositório;
- configurar PostgreSQL e migrações;
- persistir execuções, eventos e gravações HTTP;
- criar uma API para listar, consultar e iniciar replays;
- manter o motor de replay independente do banco.

**Pronta quando:** uma execução continua disponível após reiniciar o ReplayKit.

## Sprint 6 — Dashboard

- listar execuções;
- exibir detalhes de request, response e erro;
- apresentar a timeline;
- destacar dados removidos por segurança;
- iniciar um replay e exibir suas divergências.

**Pronta quando:** toda a demonstração principal pode ser realizada pela interface.

## Sprint 7 — Projeto de portfólio

- documentação de instalação e uso;
- exemplo reproduzível de um bug;
- vídeo ou GIF da demonstração;
- limites de payload, redaction configurável e mensagens de erro úteis;
- cobertura dos fluxos críticos;
- publicação dos pacotes e versionamento, se fizer sentido.

**Pronta quando:** outra pessoa consegue clonar o projeto, executar a demonstração e entender as decisões e limitações sem ajuda do autor.

## Método de trabalho

Para cada tarefa:

1. entender o problema;
2. formular uma hipótese;
3. implementar a menor solução real;
4. provar o comportamento com testes;
5. revisar limites e decisões;
6. fazer um commit pequeno e descritivo.
