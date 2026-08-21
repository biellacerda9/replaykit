import type { HttpRequestSnapshot, HttpResponseSnapshot } from "./http.js";

export interface ExecutionError {
  name: string;
  message: string;
  stack?: string;
}

export interface Execution {
  id: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  request: HttpRequestSnapshot;
  response?: HttpResponseSnapshot;
  error?: ExecutionError;
}
