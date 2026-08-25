import type {
  FinishedExecution,
  HttpResponseSnapshot,
  ReplayDifference,
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
    const differences = findDifferences(execution.response, replayedResponse);

    return {
      executionId: execution.id,
      outcome: differences.length === 0 ? "matched" : "divergent",
      originalResponse: execution.response,
      replayedResponse,
      differences,
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

function findDifferences(
  originalResponse: HttpResponseSnapshot,
  replayedResponse: HttpResponseSnapshot,
): ReplayDifference[] {
  const differences: ReplayDifference[] = [];

  if (originalResponse.status !== replayedResponse.status) {
    differences.push("status");
  }

  if (!compareTypes(originalResponse.body, replayedResponse.body)) {
    differences.push("body");
  }

  return differences;
}

function compareTypes(originalValue: unknown, replayedValue: unknown): boolean {
  if (originalValue === replayedValue) {
    return true;
  }

  if (typeof originalValue !== typeof replayedValue) {
    return false;
  }

  if (originalValue === null || replayedValue === null) {
    return false;
  }

  if (Array.isArray(originalValue) || Array.isArray(replayedValue)) {
    if (!Array.isArray(originalValue) || !Array.isArray(replayedValue)) {
      return false;
    }

    if (originalValue.length !== replayedValue.length) {
      return false;
    }

    for (let index = 0; index < originalValue.length; index++) {
      if (!compareTypes(originalValue[index], replayedValue[index])) {
        return false;
      }
    }

    return true;
  }

  if (typeof originalValue !== "object" || typeof replayedValue !== "object") {
    return false;
  }

  const originalObject = originalValue as Record<string, unknown>;
  const replayedObject = replayedValue as Record<string, unknown>;
  const originalKeys = Object.keys(originalObject);
  const replayedKeys = Object.keys(replayedObject);

  if (originalKeys.length !== replayedKeys.length) {
    return false;
  }

  for (const key of originalKeys) {
    if (!replayedKeys.includes(key)) {
      return false;
    }

    if (!compareTypes(originalObject[key], replayedObject[key])) {
      return false;
    }
  }

  return true;
}
