import { finishExecution, startExecution } from "@replaykit/core";
import type { ReplayResult } from "@replaykit/core";
import { afterEach, describe, expect, it } from "vitest";

import { PostgresExecutionStore } from "../src/index.js";

const connectionString = process.env.TEST_DATABASE_URL;
const describePostgres =
  connectionString === undefined ? describe.skip : describe;

describePostgres("PostgresExecutionStore", () => {
  const stores: PostgresExecutionStore[] = [];

  afterEach(async () => {
    await Promise.all(stores.splice(0).map((store) => store.close()));
  });

  it("persists executions and replay attempts", async () => {
    const store = new PostgresExecutionStore({
      connectionString: connectionString ?? "",
    });
    stores.push(store);
    const id = `postgres-execution-${randomUUID()}`;
    const running = startExecution({
      id,
      startedAt: "2026-08-27T17:00:00.000Z",
      request: {
        method: "GET",
        url: "/health",
        headers: { accept: "application/json" },
      },
    });
    const finished = finishExecution(
      running,
      {
        status: 200,
        headers: { "content-type": "application/json" },
        body: { status: "ok" },
      },
      "2026-08-27T17:00:00.100Z",
    );
    const result: ReplayResult = {
      executionId: id,
      outcome: "matched",
      originalResponse: finished.response,
      replayedResponse: finished.response,
      differences: [],
      skippedComparisons: [],
    };

    await store.save(finished);
    await expect(store.findById(id)).resolves.toEqual(finished);

    const attempt = await store.saveReplayAttempt(result);

    expect(attempt.attemptNumber).toBe(1);
    await expect(store.listReplayAttempts(id)).resolves.toEqual([attempt]);
  });
});
import { randomUUID } from "node:crypto";
