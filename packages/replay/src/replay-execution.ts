import type {
  FinishedExecution,
  HttpHeaders,
  HttpResponseSnapshot,
  ReplayDifference,
  ReplayResult,
} from "@replaykit/core";

export async function replayExecution(
  baseUrl: string,
  execution: FinishedExecution,
): Promise<ReplayResult> {
  const accept = execution.request.headers.accept;
  const acceptHeader = typeof accept === "string" ? accept : "application/json";
  const url = new URL(execution.request.url, baseUrl);

  try {
    if (execution.request.method === "GET") {
      const response = await fetch(url, {
        method: "GET",
        headers: { accept: acceptHeader },
      });
      const replayedResponse: HttpResponseSnapshot = {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
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
    } else if (execution.request.method === "POST") {
      const response = await fetch(url, {
        method: "POST",
        headers: { accept: acceptHeader, "content-type": "application/json" },
        body: JSON.stringify(execution.request.body),
      });
      const replayedResponse: HttpResponseSnapshot = {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
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
    }
    return {
      executionId: execution.id,
      outcome: "failed",
      originalResponse: execution.response,
      error: {
        name: "UnsupportedReplayMethodError",
        message: "Only GET and POST requests can be replayed",
      },
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

  if (!compareHeaders(originalResponse.headers, replayedResponse.headers)) {
    differences.push("headers");
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

const allowedHeaders = [
  "content-type",
  "cache-control",
  "location",
  "allow",
  "content-language",
  "content-encoding",
  "vary",
];

function compareHeaders(
  originalHeaders: HttpHeaders,
  replayedHeaders: HttpHeaders,
): boolean {
  //para cada header da lista permitida
  //procura o valor nos headers originais e nos headers replayed

  for (const header of allowedHeaders) {
    const originalValue = originalHeaders[header];
    const replayedValue = replayedHeaders[header];

    //nenhum dos dois possui -> continua
    if (!originalValue && !replayedValue) {
      continue;
    }

    //só um possui -> retorna false
    if (!originalValue || !replayedValue) {
      return false;
    }

    //os dois possuem -> compara os valores

    if (originalValue === replayedValue) {
      continue;
    }

    if (originalValue !== replayedValue) {
      return false;
    }
  }
  return true;
}
