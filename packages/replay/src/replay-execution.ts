import type {
  FinishedExecution,
  HttpResponseSnapshot,
  ReplayResult,
} from "@replaykit/core";

export async function replayExecution(
  baseUrl: string,
  execution: FinishedExecution,
): Promise<ReplayResult> {
  if (execution.request.method !== "GET") {
    return {
      executionId: execution.id,
      outcome: "failed",
      originalResponse: execution.response,
      error: {
        name: "UnsupportedReplayMethodError",
        message: "Only GET requests can be replayed",
      },
    };
  }

  const accept = execution.request.headers.accept;
  const acceptHeader = typeof accept === "string" ? accept : "application/json";
  const url = new URL(execution.request.url, baseUrl);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: acceptHeader },
    });
    const replayedResponse: HttpResponseSnapshot = {
      status: response.status,
      headers: {},
      body: await response.json(),
    };
    const responsesAreEqual =
      execution.response.status === replayedResponse.status &&
      JSON.stringify(execution.response.body) ===
        JSON.stringify(replayedResponse.body);

    return {
      executionId: execution.id,
      outcome: responsesAreEqual ? "matched" : "divergent",
      originalResponse: execution.response,
      replayedResponse,
    };
  } catch (error) {
    return {
      executionId: execution.id,
      outcome: "failed",
      originalResponse: execution.response,
      error: {
        name: "ReplayError",
        message:
          error instanceof Error ? error.message : "Could not replay request",
      },
    };
  }
}
