import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { finishExecution, startExecution } from "@replaykit/core";
import type { ReplayResult } from "@replaykit/core";
import { describe, expect, it } from "vitest";

import { SqliteExecutionStore } from "../src/index.js";

async function withStore(
  test: (store: SqliteExecutionStore) => Promise<void>,
): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "replaykit-storage-"));
  const store = new SqliteExecutionStore(join(directory, "replaykit.db"));

  try {
    await test(store);
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
  it("updates an execution when the same id is saved again", async () => {
    await withStore(async (store) => {
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

      await store.save(running);
      await store.save(finished);

      await expect(store.findById("execution-1")).resolves.toEqual(finished);
    });
  });

  it("lists the most recent executions first", async () => {
    await withStore(async (store) => {
      const oldest = createRunningExecution(
        "execution-1",
        "2026-08-23T17:00:00.000Z",
      );
      const newest = createRunningExecution(
        "execution-2",
        "2026-08-23T17:01:00.000Z",
      );

      await store.save(oldest);
      await store.save(newest);

      expect((await store.list()).map((execution) => execution.id)).toEqual([
        "execution-2",
        "execution-1",
      ]);
    });
  });

  it("persists body omission metadata", async () => {
    await withStore(async (store) => {
      const running = startExecution({
        id: "execution-omitted-body",
        startedAt: "2026-08-25T17:00:00.000Z",
        request: {
          method: "POST",
          url: "/import",
          headers: { "content-type": "application/json" },
          bodyOmitted: { reason: "size-limit", sizeBytes: 200000 },
        },
      });
      const finished = finishExecution(
        running,
        {
          status: 202,
          headers: { "content-type": "application/json" },
          bodyOmitted: { reason: "size-limit", sizeBytes: 300000 },
        },
        "2026-08-25T17:00:00.100Z",
      );

      await store.save(finished);

      await expect(store.findById(finished.id)).resolves.toEqual(finished);
    });
  });

  it("numbers replay attempts for the same execution", async () => {
    await withStore(async (store) => {
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
        outcome: "divergent",
        originalResponse: finished.response,
        replayedResponse: {
          ...finished.response,
          body: { status: "unavailable" },
        },
        differences: ["body"],
        skippedComparisons: ["body"],
      };

      await store.save(finished);
      const firstAttempt = await store.saveReplayAttempt(result);
      const secondAttempt = await store.saveReplayAttempt(result);

      expect(firstAttempt.attemptNumber).toBe(1);
      expect(secondAttempt.attemptNumber).toBe(2);
      expect(firstAttempt.differences).toEqual(["body"]);
      expect(firstAttempt.skippedComparisons).toEqual(["body"]);
      expect(
        (await store.listReplayAttempts(finished.id)).map(
          (attempt) => attempt.attemptNumber,
        ),
      ).toEqual([1, 2]);
      expect(
        (await store.listReplayAttempts(finished.id)).map(
          (attempt) => attempt.differences,
        ),
      ).toEqual([["body"], ["body"]]);
      expect(
        (await store.listReplayAttempts(finished.id)).map(
          (attempt) => attempt.skippedComparisons,
        ),
      ).toEqual([["body"], ["body"]]);
    });
  });
});
