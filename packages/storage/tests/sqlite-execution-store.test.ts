import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { finishExecution, startExecution } from "@replaykit/core";
import type { ReplayResult } from "@replaykit/core";
import { describe, expect, it } from "vitest";

import { SqliteExecutionStore } from "../src/index.js";

function withStore(test: (store: SqliteExecutionStore) => void): void {
  const directory = mkdtempSync(join(tmpdir(), "replaykit-storage-"));
  const store = new SqliteExecutionStore(join(directory, "replaykit.db"));

  try {
    test(store);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function createRunningExecution(id: string, startedAt: string) {
  return startExecution({
    id,
    startedAt,
    request: {
      method: "POST",
      url: "/checkout",
      headers: { "content-type": "application/json" },
      body: { productId: "product-1" },
    },
  });
}

describe("SqliteExecutionStore", () => {
  it("updates an execution when the same id is saved again", () => {
    withStore((store) => {
      const running = createRunningExecution(
        "execution-1",
        "2026-08-23T17:00:00.000Z",
      );
      const finished = finishExecution(
        running,
        {
          status: 201,
          headers: { "content-type": "application/json" },
          body: { orderId: "order-1" },
        },
        "2026-08-23T17:00:00.100Z",
      );

      store.save(running);
      store.save(finished);

      expect(store.findById("execution-1")).toEqual(finished);
    });
  });

  it("lists the most recent executions first", () => {
    withStore((store) => {
      const oldest = createRunningExecution(
        "execution-1",
        "2026-08-23T17:00:00.000Z",
      );
      const newest = createRunningExecution(
        "execution-2",
        "2026-08-23T17:01:00.000Z",
      );

      store.save(oldest);
      store.save(newest);

      expect(store.list().map((execution) => execution.id)).toEqual([
        "execution-2",
        "execution-1",
      ]);
    });
  });

  it("numbers replay attempts for the same execution", () => {
    withStore((store) => {
      const running = createRunningExecution(
        "execution-1",
        "2026-08-24T17:00:00.000Z",
      );
      const finished = finishExecution(
        running,
        { status: 200, headers: {}, body: { status: "ok" } },
        "2026-08-24T17:00:00.100Z",
      );
      const result: ReplayResult = {
        executionId: finished.id,
        outcome: "matched",
        originalResponse: finished.response,
        replayedResponse: finished.response,
      };

      store.save(finished);
      const firstAttempt = store.saveReplayAttempt(result);
      const secondAttempt = store.saveReplayAttempt(result);

      expect(firstAttempt.attemptNumber).toBe(1);
      expect(secondAttempt.attemptNumber).toBe(2);
      expect(
        store
          .listReplayAttempts(finished.id)
          .map((attempt) => attempt.attemptNumber),
      ).toEqual([1, 2]);
    });
  });
});
