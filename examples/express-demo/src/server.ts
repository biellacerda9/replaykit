import express from "express";

import type { ExecutionStore } from "@replaykit/core";
import { replayKitMiddleware } from "@replaykit/sdk";
import { SqliteExecutionStore } from "@replaykit/storage";
import { PostgresExecutionStore } from "@replaykit/storage-postgres";

import { replayExecution } from "@replaykit/replay";

const app = express();
const port = 3001;
const executionStore = createExecutionStore();
let healthStatus = "ok";

function createExecutionStore(): ExecutionStore {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString !== undefined) {
    return new PostgresExecutionStore({ connectionString });
  }

  return new SqliteExecutionStore();
}

app.use(express.json());

//.use() aplica o que tiver ai dentro em todas as rotas, então o replayKitMiddleware vai ser aplicado em todas as rotas
app.use(
  replayKitMiddleware({
    ignorePaths: ["/health"],
    ignorePathPrefixes: ["/executions", "/demo"],
    onExecutionFinished(execution) {
      void executionStore.save(execution).catch((error) => {
        console.error("Could not save execution to the store:", error);
      });

      console.log("ReplayKit captured execution:");
      console.log(JSON.stringify(execution, null, 2));
    },
  }),
);

// request começa com _ porque existe mas não é usado, então o typescript reclama, e o _ serve para dizer que ele existe mas não é usado
app.get("/health", (_request, response) => {
  response.json({ status: healthStatus });
});

app.post("/demo/health-status/:status", (request, response) => {
  healthStatus = request.params.status;
  response.json({ status: healthStatus });
});

app.get("/status", (_request, response) => {
  response.json({ status: healthStatus });
});

app.post("/echo", (request, response) => {
  response.json(request.body);
});

app.post("/session", (_request, response) => {
  response.json({
    message: "Session created",
    token: "demo-token",
  });
});

app.get("/executions", async (_request, response) => {
  const executions = await executionStore.list();
  const summaries = executions.map((execution) => ({
    id: execution.id,
    state: execution.state,
    method: execution.request.method,
    url: execution.request.url,
    durationMs: execution.state === "running" ? null : execution.durationMs,
    startedAt: execution.startedAt,
    finishedAt: execution.state === "running" ? null : execution.finishedAt,
    status: execution.state === "finished" ? execution.response.status : null,
  }));
  response.json(summaries);
});

app.get("/executions/:id", async (request, response) => {
  const execution = await executionStore.findById(request.params.id);
  if (!execution) {
    response.status(404).json({ error: "Execution not found" });
    return;
  }
  response.json(execution);
});

const baseUrl = `http://localhost:${port}`;

app.post("/executions/:id/replay", async (request, response) => {
  const id = request.params.id;
  const execution = await executionStore.findById(id);
  if (!execution) {
    response.status(404).json({ error: "Execution not found" });
    return;
  }
  if (execution.state !== "finished") {
    response.status(400).json({ error: "Execution is not finished" });
    return;
  }

  const result = await replayExecution(baseUrl, execution);
  const attempt = await executionStore.saveReplayAttempt(result);

  response.json(attempt);
});

app.get("/executions/:id/replays", async (request, response) => {
  const id = request.params.id;
  const execution = await executionStore.findById(id);
  if (!execution) {
    response.status(404).json({ error: "Execution not found" });
    return;
  }

  const attempts = await executionStore.listReplayAttempts(id);
  response.json({ execution, attempts });
});

app.listen(port, () => {
  console.log(`Express demo listening on http://localhost:${port}`);
});
