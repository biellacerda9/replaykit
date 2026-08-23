import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  Execution,
  ExecutionError,
  HttpHeaders,
  HttpRequestSnapshot,
  HttpResponseSnapshot,
} from "@replaykit/core";

interface ExecutionRow {
  readonly id: string;
  readonly state: Execution["state"];
  readonly started_at: string;
  readonly finished_at: string | null;
  readonly duration_ms: number | null;
  readonly request_method: string;
  readonly request_url: string;
  readonly request_headers_json: string;
  readonly request_body_json: string | null;
  readonly response_status: number | null;
  readonly response_headers_json: string | null;
  readonly response_body_json: string | null;
  readonly error_name: string | null;
  readonly error_message: string | null;
  readonly error_stack: string | null;
}

type ExecutionParameters = ExecutionRow;

export class SqliteExecutionStore {
  private readonly database: DatabaseSync;

  constructor(databasePath = resolve(process.cwd(), ".data", "replaykit.db")) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        duration_ms INTEGER,
        request_method TEXT NOT NULL,
        request_url TEXT NOT NULL,
        request_headers_json TEXT NOT NULL,
        request_body_json TEXT,
        response_status INTEGER,
        response_headers_json TEXT,
        response_body_json TEXT,
        error_name TEXT,
        error_message TEXT,
        error_stack TEXT
      )
    `);
  }

  save(execution: Execution): void {
    const parameters = toParameters(execution);

    this.database
      .prepare(
        `
          INSERT INTO executions (
            id, state, started_at, finished_at, duration_ms,
            request_method, request_url, request_headers_json, request_body_json,
            response_status, response_headers_json, response_body_json,
            error_name, error_message, error_stack
          ) VALUES (
            $id, $state, $started_at, $finished_at, $duration_ms,
            $request_method, $request_url, $request_headers_json, $request_body_json,
            $response_status, $response_headers_json, $response_body_json,
            $error_name, $error_message, $error_stack
          )
          ON CONFLICT(id) DO UPDATE SET
            state = excluded.state,
            started_at = excluded.started_at,
            finished_at = excluded.finished_at,
            duration_ms = excluded.duration_ms,
            request_method = excluded.request_method,
            request_url = excluded.request_url,
            request_headers_json = excluded.request_headers_json,
            request_body_json = excluded.request_body_json,
            response_status = excluded.response_status,
            response_headers_json = excluded.response_headers_json,
            response_body_json = excluded.response_body_json,
            error_name = excluded.error_name,
            error_message = excluded.error_message,
            error_stack = excluded.error_stack
        `,
      )
      .run({ ...parameters });
  }

  findById(id: string): Execution | undefined {
    const row = this.database
      .prepare("SELECT * FROM executions WHERE id = ?")
      .get(id) as unknown as ExecutionRow | undefined;

    return row === undefined ? undefined : fromRow(row);
  }

  list(): Execution[] {
    const rows = this.database
      .prepare("SELECT * FROM executions ORDER BY started_at DESC")
      .all() as unknown as ExecutionRow[];

    return rows.map(fromRow);
  }

  close(): void {
    this.database.close();
  }
}

function toParameters(execution: Execution): ExecutionParameters {
  const response =
    execution.state === "finished" ? execution.response : undefined;
  const error = execution.state === "running" ? undefined : execution.error;

  return {
    id: execution.id,
    state: execution.state,
    started_at: execution.startedAt,
    finished_at: execution.state === "running" ? null : execution.finishedAt,
    duration_ms: execution.state === "running" ? null : execution.durationMs,
    request_method: execution.request.method,
    request_url: execution.request.url,
    request_headers_json: stringify(execution.request.headers) ?? "{}",
    request_body_json: stringify(execution.request.body),
    response_status: response?.status ?? null,
    response_headers_json:
      response === undefined ? null : stringify(response.headers),
    response_body_json:
      response === undefined ? null : stringify(response.body),
    error_name: error?.name ?? null,
    error_message: error?.message ?? null,
    error_stack: error?.stack ?? null,
  };
}

function fromRow(row: ExecutionRow): Execution {
  const request: HttpRequestSnapshot = {
    method: row.request_method,
    url: row.request_url,
    headers: parseJson(row.request_headers_json) as HttpHeaders,
    ...(row.request_body_json === null
      ? {}
      : { body: parseJson(row.request_body_json) }),
  };

  if (row.state === "running") {
    return {
      id: row.id,
      state: "running",
      startedAt: row.started_at,
      request,
    };
  }

  const error = toError(row);

  if (row.state === "aborted") {
    if (
      error === undefined ||
      row.finished_at === null ||
      row.duration_ms === null
    ) {
      throw new Error("Invalid aborted execution stored in the database");
    }

    return {
      id: row.id,
      state: "aborted",
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      durationMs: row.duration_ms,
      request,
      error,
    };
  }

  if (
    row.finished_at === null ||
    row.duration_ms === null ||
    row.response_status === null ||
    row.response_headers_json === null
  ) {
    throw new Error("Invalid finished execution stored in the database");
  }

  const response: HttpResponseSnapshot = {
    status: row.response_status,
    headers: parseJson(row.response_headers_json) as HttpHeaders,
    ...(row.response_body_json === null
      ? {}
      : { body: parseJson(row.response_body_json) }),
  };

  return {
    id: row.id,
    state: "finished",
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    request,
    response,
    ...(error === undefined ? {} : { error }),
  };
}

function toError(row: ExecutionRow): ExecutionError | undefined {
  if (row.error_name === null || row.error_message === null) {
    return undefined;
  }

  return {
    name: row.error_name,
    message: row.error_message,
    ...(row.error_stack === null ? {} : { stack: row.error_stack }),
  };
}

function stringify(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJson(value: string): unknown {
  return JSON.parse(value);
}
