import { describe, expect, it } from "vitest";

import { finishExecution, startExecution } from "../src/execution.js";

const execution = startExecution({
  id: "execution-1",
  startedAt: "2026-08-21T17:00:00.000Z",
  request: {
    method: "POST",
    url: "/checkout",
    headers: {
      "content-type": "application/json",
    },
    body: {
      productId: "product-1",
      quantity: 2,
    },
  },
});

describe("execution lifecycle", () => {
  it("starts in the running state", () => {
    expect(execution.state).toBe("running");
    expect(execution.request.url).toBe("/checkout");
  });

  it("finishes with a response, error, and duration", () => {
    const finished = finishExecution(
      execution,
      {
        status: 500,
        headers: {},
      },
      "2026-08-21T17:00:00.100Z",
      {
        name: "PaymentError",
        message: "Payment failed",
      },
    );

    expect(finished.state).toBe("finished");
    expect(finished.durationMs).toBe(100);
    expect(finished.response.status).toBe(500);
    expect(finished.error?.name).toBe("PaymentError");
  });

  it("rejects a finish time earlier than the start", () => {
    expect(() =>
      finishExecution(
        execution,
        { status: 200, headers: {} },
        "2026-08-21T16:59:59.999Z",
      ),
    ).toThrow("finishedAt cannot be earlier than startedAt");
  });
});
