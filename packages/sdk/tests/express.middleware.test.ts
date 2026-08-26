import { EventEmitter } from "node:events";

import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";

import type { Execution } from "@replaykit/core";
import { replayKitMiddleware } from "../src/index.js";

interface CaptureOptions {
  readonly sensitiveBodyFields?: readonly string[];
  readonly maxBodySizeBytes?: number;
}

function captureExecution(
  requestHeaders: Record<string, string | string[] | undefined>,
  responseHeaders: Record<string, string | string[] | number | undefined>,
  requestBody?: unknown,
  options?: CaptureOptions,
): Execution {
  let capturedExecution: Execution | undefined;
  const request = {
    method: "GET",
    originalUrl: "/health",
    headers: requestHeaders,
    body: requestBody,
  } as Request;
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    getHeaders: () => responseHeaders,
  }) as Response;

  const middleware = replayKitMiddleware({
    ...options,
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

function captureJsonResponse(
  responseBody: unknown,
  options?: CaptureOptions,
): {
  execution: Execution;
  sentBody: unknown;
} {
  let capturedExecution: Execution | undefined;
  let sentBody: unknown;
  const request = {
    method: "POST",
    originalUrl: "/session",
    headers: {},
  } as Request;
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    getHeaders: () => ({ "content-type": "application/json" }),
    json(body: unknown) {
      sentBody = body;
      return response;
    },
  }) as Response;

  const middleware = replayKitMiddleware({
    ...options,
    onExecutionFinished(execution) {
      capturedExecution = execution;
    },
  });

  middleware(request, response, () => undefined);
  response.json(responseBody);
  response.emit("finish");

  if (!capturedExecution) {
    throw new Error("Expected the middleware to capture an execution");
  }

  return { execution: capturedExecution, sentBody };
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

  it("captures a safe copy of an object body", () => {
    const requestBody = {
      email: "ana@example.com",
      profile: {
        password: "secret-password",
      },
      users: [{ apiKey: "secret-key" }],
    };

    const execution = captureExecution({}, {}, requestBody);

    expect(execution.request.body).toEqual({
      email: "ana@example.com",
      profile: {
        password: "[REDACTED]",
      },
      users: [{ apiKey: "[REDACTED]" }],
    });
    expect(requestBody).toEqual({
      email: "ana@example.com",
      profile: {
        password: "secret-password",
      },
      users: [{ apiKey: "secret-key" }],
    });
  });

  it("captures a safe response body without changing the body sent to the client", () => {
    const responseBody = {
      message: "Session created",
      token: "secret-token",
    };

    const { execution, sentBody } = captureJsonResponse(responseBody);

    expect(sentBody).toEqual({
      message: "Session created",
      token: "secret-token",
    });

    if (execution.state !== "finished") {
      throw new Error("Expected a finished execution");
    }

    expect(execution.response.body).toEqual({
      message: "Session created",
      token: "[REDACTED]",
    });
  });

  it("redacts configured request body fields without changing the original body", () => {
    const requestBody = {
      customer: {
        cpf: "123.456.789-00",
      },
    };

    const execution = captureExecution({}, {}, requestBody, {
      sensitiveBodyFields: ["CPF"],
    });

    expect(execution.request.body).toEqual({
      customer: {
        cpf: "[REDACTED]",
      },
    });
    expect(requestBody).toEqual({
      customer: {
        cpf: "123.456.789-00",
      },
    });
  });

  it("redacts configured response body fields", () => {
    const { execution, sentBody } = captureJsonResponse(
      { creditCard: "4111 1111 1111 1111" },
      { sensitiveBodyFields: ["creditCard"] },
    );

    expect(sentBody).toEqual({ creditCard: "4111 1111 1111 1111" });

    if (execution.state !== "finished") {
      throw new Error("Expected a finished execution");
    }

    expect(execution.response.body).toEqual({
      creditCard: "[REDACTED]",
    });
  });

  it("omits a request body that exceeds the configured size limit", () => {
    const execution = captureExecution(
      {},
      {},
      { message: "this body is too large" },
      { maxBodySizeBytes: 10 },
    );

    expect(execution.request.body).toBeUndefined();
    expect(execution.request.bodyOmitted).toMatchObject({
      reason: "size-limit",
    });
    expect(execution.request.bodyOmitted?.sizeBytes).toBeGreaterThan(10);
  });

  it("omits a response body without changing the body sent to the client", () => {
    const responseBody = { message: "this body is too large" };
    const { execution, sentBody } = captureJsonResponse(responseBody, {
      maxBodySizeBytes: 10,
    });

    expect(sentBody).toEqual(responseBody);

    if (execution.state !== "finished") {
      throw new Error("Expected a finished execution");
    }

    expect(execution.response.body).toBeUndefined();
    expect(execution.response.bodyOmitted).toMatchObject({
      reason: "size-limit",
    });
    expect(execution.response.bodyOmitted?.sizeBytes).toBeGreaterThan(10);
  });

  it("does not capture an ignored exact path", () => {
    let wasCaptured = false;
    let nextWasCalled = false;
    const request = {
      method: "GET",
      originalUrl: "/health?full=true",
      headers: {},
    } as Request;
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      getHeaders: () => ({}),
    }) as Response;

    const middleware = replayKitMiddleware({
      ignorePaths: ["/health"],
      onExecutionFinished() {
        wasCaptured = true;
      },
    });

    middleware(request, response, () => {
      nextWasCalled = true;
    });
    response.emit("finish");

    expect(nextWasCalled).toBe(true);
    expect(wasCaptured).toBe(false);
  });

  it("does not capture a path inside an ignored prefix", () => {
    let wasCaptured = false;
    const request = {
      method: "GET",
      originalUrl: "/executions/123/replays",
      headers: {},
    } as Request;
    const response = Object.assign(new EventEmitter(), {
      statusCode: 200,
      getHeaders: () => ({}),
    }) as Response;

    const middleware = replayKitMiddleware({
      ignorePathPrefixes: ["/executions"],
      onExecutionFinished() {
        wasCaptured = true;
      },
    });

    middleware(request, response, () => undefined);
    response.emit("finish");

    expect(wasCaptured).toBe(false);
  });
});
