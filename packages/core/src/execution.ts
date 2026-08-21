import type { HttpRequestSnapshot, HttpResponseSnapshot } from "./http.js";

export interface ExecutionError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
}

interface ExecutionBase {
  readonly id: string;
  readonly startedAt: string;
  readonly request: HttpRequestSnapshot;
}

export interface RunningExecution extends ExecutionBase {
  readonly state: "running";
}

export interface FinishedExecution extends ExecutionBase {
  readonly state: "finished";
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly response: HttpResponseSnapshot;
  readonly error?: ExecutionError;
}

export interface AbortedExecution extends ExecutionBase {
  readonly state: "aborted";
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly error: ExecutionError;
}

export type Execution = RunningExecution | FinishedExecution | AbortedExecution;

export type ExecutionState = Execution["state"];

export interface StartExecutionInput {
  readonly id: string;
  readonly startedAt: string;
  readonly request: HttpRequestSnapshot;
}

export function startExecution(input: StartExecutionInput): RunningExecution {
  return {
    id: input.id,
    state: "running",
    startedAt: input.startedAt,
    request: input.request,
  };
}

export function finishExecution(
  execution: RunningExecution,
  response: HttpResponseSnapshot,
  finishedAt: string,
  error?: ExecutionError,
): FinishedExecution {
  const durationMs =
    new Date(finishedAt).getTime() - new Date(execution.startedAt).getTime();

  if (durationMs < 0) {
    throw new RangeError("finishedAt cannot be earlier than startedAt");
  }

  return {
    id: execution.id,
    startedAt: execution.startedAt,
    request: execution.request,
    state: "finished",
    finishedAt,
    durationMs,
    response,
    ...(error === undefined ? {} : { error }),
  };
}
