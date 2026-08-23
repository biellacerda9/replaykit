import express from "express";

import { replayKitMiddleware } from "@replaykit/sdk";

const app = express();
const port = 3001;

app.use(express.json());

//.use() aplica o que tiver ai dentro em todas as rotas, então o replayKitMiddleware vai ser aplicado em todas as rotas
app.use(
  replayKitMiddleware({
    onExecutionFinished(execution) {
      console.log("ReplayKit captured execution:");
      console.log(JSON.stringify(execution, null, 2));
    },
  }),
);

// request começa com _ porque existe mas não é usado, então o typescript reclama, e o _ serve para dizer que ele existe mas não é usado
app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
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

app.listen(port, () => {
  console.log(`Express demo listening on http://localhost:${port}`);
});
