import { finishExecution, startExecution } from "@replaykit/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { replayExecution } from "../src/index.js";

function createFinishedGetExecution(body: unknown = { status: "ok" }) {
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
      body,
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

  it("returns matched when object keys are in a different order", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ age: 20, name: "Ana" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await replayExecution(
      "http://example.test",
      createFinishedGetExecution({ name: "Ana", age: 20 }),
    );

    expect(result).toMatchObject({
      outcome: "matched",
      differences: [],
    });
  });

  it("returns divergent when a nested object value changes", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ user: { name: "Bia" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await replayExecution(
      "http://example.test",
      createFinishedGetExecution({ user: { name: "Ana" } }),
    );

    expect(result).toMatchObject({
      outcome: "divergent",
      differences: ["body"],
    });
  });

  it("returns divergent when array items change position", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify(["b", "a"]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const result = await replayExecution(
      "http://example.test",
      createFinishedGetExecution(["a", "b"]),
    );

    expect(result).toMatchObject({
      outcome: "divergent",
      differences: ["body"],
    });
  });

  it("returns divergent when a relevant header changes", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );

    const result = await replayExecution(
      "http://example.test",
      createFinishedGetExecution(),
    );

    expect(result).toMatchObject({
      outcome: "divergent",
      differences: ["headers"],
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
