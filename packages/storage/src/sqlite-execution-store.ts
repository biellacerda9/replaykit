import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  Execution,
  ExecutionError,
  HttpHeaders,
  HttpRequestSnapshot,
  HttpResponseSnapshot,
  ReplayAttempt,
  ReplayResult,
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

interface ReplayAttemptRow {
  readonly id: string;
  readonly execution_id: string;
  readonly attempt_number: number;
  readonly replayed_at: string;
  readonly outcome: ReplayAttempt["outcome"];
  readonly replayed_status: number | null;
  readonly replayed_headers_json: string | null;
  readonly replayed_body_json: string | null;
  readonly error_name: string | null;
  readonly error_message: string | null;
}

type ReplayAttemptParameters = ReplayAttemptRow;

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
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS replay_attempts (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        attempt_number INTEGER NOT NULL,
        replayed_at TEXT NOT NULL,
        outcome TEXT NOT NULL,
        replayed_status INTEGER,
        replayed_headers_json TEXT,
        replayed_body_json TEXT,
        error_name TEXT,
        error_message TEXT,
        UNIQUE(execution_id, attempt_number),
        FOREIGN KEY(execution_id) REFERENCES executions(id)
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

  saveReplayAttempt(result: ReplayResult): ReplayAttempt {
    const row = this.database
      .prepare(
        "SELECT COUNT(*) AS count FROM replay_attempts WHERE execution_id = ?",
      )
      .get(result.executionId) as unknown as { count: number };
    const attempt = toReplayAttempt(result, row.count + 1);
    const parameters = toReplayAttemptParameters(attempt);

    this.database
      .prepare(
        `
          INSERT INTO replay_attempts (
            id, execution_id, attempt_number, replayed_at, outcome,
            replayed_status, replayed_headers_json, replayed_body_json,
            error_name, error_message
          ) VALUES (
            $id, $execution_id, $attempt_number, $replayed_at, $outcome,
            $replayed_status, $replayed_headers_json, $replayed_body_json,
            $error_name, $error_message
          )
        `,
      )
      .run({ ...parameters });

    return attempt;
  }

  listReplayAttempts(executionId: string): ReplayAttempt[] {
    const rows = this.database
      .prepare(
        "SELECT * FROM replay_attempts WHERE execution_id = ? ORDER BY attempt_number ASC",
      )
      .all(executionId) as unknown as ReplayAttemptRow[];

    return rows.map(fromReplayAttemptRow);
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

function toReplayAttempt(
  result: ReplayResult,
  attemptNumber: number,
): ReplayAttempt {
  return {
    id: randomUUID(),
    executionId: result.executionId,
    attemptNumber,
    replayedAt: new Date().toISOString(),
    outcome: result.outcome,
    ...(result.outcome === "failed"
      ? { error: result.error }
      : { replayedResponse: result.replayedResponse }),
  };
}

function toReplayAttemptParameters(
  attempt: ReplayAttempt,
): ReplayAttemptParameters {
  const response = attempt.replayedResponse;

  return {
    id: attempt.id,
    execution_id: attempt.executionId,
    attempt_number: attempt.attemptNumber,
    replayed_at: attempt.replayedAt,
    outcome: attempt.outcome,
    replayed_status: response?.status ?? null,
    replayed_headers_json:
      response === undefined ? null : stringify(response.headers),
    replayed_body_json:
      response === undefined ? null : stringify(response.body),
    error_name: attempt.error?.name ?? null,
    error_message: attempt.error?.message ?? null,
  };
}

function fromReplayAttemptRow(row: ReplayAttemptRow): ReplayAttempt {
  if (row.outcome === "failed") {
    if (row.error_name === null || row.error_message === null) {
      throw new Error("Invalid failed replay attempt stored in the database");
    }

    return {
      id: row.id,
      executionId: row.execution_id,
      attemptNumber: row.attempt_number,
      replayedAt: row.replayed_at,
      outcome: "failed",
      error: {
        name: row.error_name,
        message: row.error_message,
      },
    };
  }

  if (row.replayed_status === null || row.replayed_headers_json === null) {
    throw new Error("Invalid successful replay attempt stored in the database");
  }

  return {
    id: row.id,
    executionId: row.execution_id,
    attemptNumber: row.attempt_number,
    replayedAt: row.replayed_at,
    outcome: row.outcome,
    replayedResponse: {
      status: row.replayed_status,
      headers: parseJson(row.replayed_headers_json) as HttpHeaders,
      ...(row.replayed_body_json === null
        ? {}
        : { body: parseJson(row.replayed_body_json) }),
    },
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
