# Roadmap do ReplayKit

Este documento registra o estado da primeira versão do ReplayKit e suas possíveis evoluções.

## Concluído na versão 0.1

- domínio de execuções HTTP, com estados `running`, `finished` e `aborted`;
- middleware para captura de request, response e duração em aplicações Express;
- sanitização de headers e bodies sensíveis;
- configuração de campos sensíveis, rotas ignoradas e limite de body;
- omissão segura de conteúdo grande ou não JSON;
- armazenamento por contrato assíncrono (`ExecutionStore`);
- implementações com SQLite e Postgres;
- replay protegido de requisições `GET`;
- comparação de status, headers relevantes e body;
- histórico de tentativas de replay;
- demo executável, ambiente local com Docker opcional e CI com Postgres.

## Limitações conhecidas

- apenas respostas JSON enviadas por `response.json(...)` têm body capturado;
- apenas `GET` pode ser repetido, para evitar efeitos colaterais;
- chamadas HTTP externas feitas pela aplicação não são gravadas nem reproduzidas;
- o suporte atual é focado em Express e TypeScript/Node.js;
- os pacotes ainda não foram publicados no npm.

## Próximas evoluções possíveis

1. CLI para configurar SQLite ou Postgres em outro projeto.
2. Publicação dos pacotes no npm sob um escopo próprio.
3. Painel para consultar execuções, respostas e divergências.
4. Suporte a outros frameworks Node.js.
5. Regras de retenção e armazenamento para cenários de produção.

O projeto considera a versão 0.1 concluída como demonstração de portfólio. As evoluções acima não são pré-requisitos para usá-lo ou apresentá-lo.
