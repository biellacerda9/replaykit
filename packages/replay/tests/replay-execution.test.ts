import { finishExecution, startExecution } from "@replaykit/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { replayExecution } from "../src/index.js";

function createFinishedGetExecution() {
  const execution = startExecution({
    id: "execution-1",
    startedAt: "2026-08-24T17:00:00.000Z",
    request: {
      method: "GET",
      url: "/health",
      headers: { accept: "application/json" },
    },
  });

  return finishExecution(
    execution,
    {
      status: 200,
      headers: { "content-type": "application/json" },
      body: { status: "ok" },
    },
    "2026-08-24T17:00:00.100Z",
  );
}

describe("replayExecution", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns matched when status and body are unchanged", async () => {
    let requestedUrl = "";

    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      requestedUrl = String(input);

      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const result = await replayExecution(
      "http://example.test",
      createFinishedGetExecution(),
    );

    expect(requestedUrl).toBe("http://example.test/health");
    expect(result).toMatchObject({
      outcome: "matched",
      differences: [],
    });
  });

  it("returns divergent when the response body changes", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ status: "unavailable" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await replayExecution(
      "http://example.test",
      createFinishedGetExecution(),
    );

    expect(result).toMatchObject({
      outcome: "divergent",
      differences: ["body"],
    });
  });

  it("returns failed when fetch throws an error", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Network error");
    });

    const result = await replayExecution(
      "http://example.test",
      createFinishedGetExecution(),
    );

    expect(result).toMatchObject({
      outcome: "failed",
      error: { name: "ReplayError", message: "Network error" },
    });
  });

  it("returns failed without calling fetch for a non-GET execution", async () => {
    const execution = startExecution({
      id: "execution-2",
      startedAt: "2026-08-24T17:00:00.000Z",
      request: {
        method: "POST",
        url: "/checkout",
        headers: {},
      },
    });
    const finished = finishExecution(
      execution,
      { status: 201, headers: {} },
      "2026-08-24T17:00:00.100Z",
    );

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await replayExecution("http://example.test", finished);

    expect(result).toMatchObject({
      outcome: "failed",
      error: { name: "UnsupportedReplayMethodError" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
