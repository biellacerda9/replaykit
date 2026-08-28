# ReplayKit

ReplayKit captura requisições de uma aplicação Express, guarda a resposta produzida e permite repetir uma execução para descobrir se o comportamento mudou.

Ele transforma uma pergunta como “esta rota ainda responde igual para esta entrada?” em uma comparação clara entre a resposta original e uma nova tentativa.

> O projeto ainda está em desenvolvimento e seus pacotes não foram publicados no npm. Você pode experimentá-lo pelo demo deste repositório.

## Principais recursos

- captura de request, response, duração e estado da execução;
- armazenamento local com SQLite ou opcionalmente com Postgres;
- replay protegido de requisições `GET`;
- detecção de diferenças de status, headers e body;
- histórico das tentativas de replay por execução;
- proteção contra armazenamento acidental de dados sensíveis.

## Rodando o demo

Requisitos: Node.js 22+ e pnpm 11.22.0.

```bash
pnpm install
pnpm demo
```

O demo inicia em `http://localhost:3001` e usa SQLite automaticamente. O banco é criado em `.data/replaykit.db`; não é necessário instalar nem iniciar um servidor de banco.

Em outro terminal:

```bash
# Cria uma captura
curl http://localhost:3001/status

# Lista as capturas e obtém o id
curl http://localhost:3001/executions

# Repete uma captura GET
curl -X POST http://localhost:3001/executions/SEU_ID/replay

# Consulta o histórico de tentativas
curl http://localhost:3001/executions/SEU_ID/replays
```

## Postgres local

Postgres é opcional, indicado para testar uma configuração mais próxima de produção.

```bash
cp .env.example .env
pnpm db:up
pnpm demo:postgres
```

| Comando              | Uso                             |
| -------------------- | ------------------------------- |
| `pnpm db:up`         | Inicia o Postgres no Docker     |
| `pnpm db:down`       | Para o Postgres local           |
| `pnpm db:logs`       | Mostra os logs do banco         |
| `pnpm demo`          | Inicia o demo com SQLite        |
| `pnpm demo:postgres` | Inicia o demo com Postgres      |
| `pnpm test:postgres` | Testa a integração com Postgres |

Se a porta `5432` estiver ocupada, altere a porta e as URLs correspondentes no `.env`.

## Uso em uma aplicação Express

```ts
import express from "express";
import { replayKitMiddleware } from "@replaykit/sdk";
import { SqliteExecutionStore } from "@replaykit/storage";

const app = express();
const executionStore = new SqliteExecutionStore();

app.use(express.json());
app.use(
  replayKitMiddleware({
    ignorePaths: ["/health"],
    ignorePathPrefixes: ["/executions"],
    sensitiveBodyFields: ["cpf", "creditCard"],
    onExecutionFinished(execution) {
      void executionStore.save(execution);
    },
  }),
);
```

Para usar Postgres, substitua o store por `PostgresExecutionStore` e informe `DATABASE_URL`.

## Segurança e limites

Antes de salvar uma execução, o ReplayKit mascara headers e campos sensíveis, como tokens, senhas, cookies e chaves de API. Também permite definir campos próprios, como CPF ou cartão de crédito.

Bodies acima de 100 KB e conteúdos que não são JSON não são armazenados. A omissão fica registrada para evitar uma comparação enganosa.

O replay executa somente `GET`. Métodos que podem alterar dados (`POST`, `PUT`, `PATCH` e `DELETE`) falham de forma protegida, sem realizar uma nova chamada. Nesta versão, chamadas HTTP externas feitas internamente pela aplicação ainda não são capturadas nem reproduzidas.

## Desenvolvimento

```bash
pnpm check
```

Esse comando roda formatação, lint, build, tipos e testes — a mesma validação executada pelo CI.
