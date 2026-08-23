import { EventEmitter } from "node:events";

import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";

import type { Execution } from "@replaykit/core";
import { replayKitMiddleware } from "../src/index.js";

function captureExecution(
  requestHeaders: Record<string, string | string[] | undefined>,
  responseHeaders: Record<string, string | string[] | number | undefined>,
): Execution {
  let capturedExecution: Execution | undefined;
  const request = {
    method: "GET",
    originalUrl: "/health",
    headers: requestHeaders,
  } as Request;
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    getHeaders: () => responseHeaders,
  }) as Response;

  const middleware = replayKitMiddleware({
    onExecutionFinished(execution) {
      capturedExecution = execution;
    },
  });

  middleware(request, response, () => undefined);
  response.emit("finish");

  if (!capturedExecution) {
    throw new Error("Expected the middleware to capture an execution");
  }

  return capturedExecution;
}

describe("replayKitMiddleware", () => {
  it("keeps non-sensitive request headers", () => {
    const execution = captureExecution(
      {
        "content-type": "application/json",
        "x-request-id": "request-1",
      },
      {},
    );

    expect(execution.request.headers).toEqual({
      "content-type": "application/json",
      "x-request-id": "request-1",
    });
  });

  it("redacts sensitive request headers", () => {
    const execution = captureExecution(
      {
        authorization: "Basic secret",
        cookie: "session=secret",
        "x-internal-token": "secret",
      },
      {},
    );

    expect(execution.request.headers).toEqual({
      authorization: "Basic [REDACTED]",
      cookie: "[REDACTED]",
      "x-internal-token": "[REDACTED]",
    });
  });

  it("redacts response secrets and converts numeric headers to strings", () => {
    const execution = captureExecution(
      {},
      {
        "content-length": 42,
        "set-cookie": "session=secret",
      },
    );

    expect(execution.state).toBe("finished");

    if (execution.state !== "finished") {
      throw new Error("Expected a finished execution");
    }

    expect(execution.response.headers).toEqual({
      "content-length": "42",
      "set-cookie": "[REDACTED]",
    });
  });
});
