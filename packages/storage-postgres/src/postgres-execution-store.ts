import { randomUUID } from "node:crypto";

import type {
  BodyOmission,
  Execution,
  ExecutionError,
  ExecutionStore,
  HttpHeaders,
  HttpRequestSnapshot,
  HttpResponseSnapshot,
  ReplayAttempt,
  ReplayDifference,
  ReplayResult,
} from "@replaykit/core";
import { Pool } from "pg";

export interface PostgresExecutionStoreOptions {
  readonly connectionString: string;
}

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
  readonly request_body_omitted_json: string | null;
  readonly response_status: number | null;
  readonly response_headers_json: string | null;
  readonly response_body_json: string | null;
  readonly response_body_omitted_json: string | null;
  readonly error_name: string | null;
  readonly error_message: string | null;
  readonly error_stack: string | null;
}

interface ReplayAttemptRow {
  readonly id: string;
  readonly execution_id: string;
  readonly attempt_number: number;
  readonly replayed_at: string;
  readonly outcome: ReplayAttempt["outcome"];
  readonly differences_json: string;
  readonly skipped_comparisons_json: string;
  readonly replayed_status: number | null;
  readonly replayed_headers_json: string | null;
  readonly replayed_body_json: string | null;
  readonly error_name: string | null;
  readonly error_message: string | null;
}

export class PostgresExecutionStore implements ExecutionStore {
  private readonly pool: Pool;
  private readonly ready: Promise<void>;

  constructor(options: PostgresExecutionStoreOptions) {
    this.pool = new Pool({ connectionString: options.connectionString });
    this.ready = this.createTables();
  }

  async save(execution: Execution): Promise<void> {
    await this.ready;

    const response =
      execution.state === "finished" ? execution.response : undefined;
    const error = execution.state === "running" ? undefined : execution.error;

    await this.pool.query(
      `
        INSERT INTO executions (
          id, state, started_at, finished_at, duration_ms,
          request_method, request_url, request_headers_json, request_body_json, request_body_omitted_json,
          response_status, response_headers_json, response_body_json, response_body_omitted_json,
          error_name, error_message, error_stack
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17
        )
        ON CONFLICT (id) DO UPDATE SET
          state = EXCLUDED.state,
          started_at = EXCLUDED.started_at,
          finished_at = EXCLUDED.finished_at,
          duration_ms = EXCLUDED.duration_ms,
          request_method = EXCLUDED.request_method,
          request_url = EXCLUDED.request_url,
          request_headers_json = EXCLUDED.request_headers_json,
          request_body_json = EXCLUDED.request_body_json,
          request_body_omitted_json = EXCLUDED.request_body_omitted_json,
          response_status = EXCLUDED.response_status,
          response_headers_json = EXCLUDED.response_headers_json,
          response_body_json = EXCLUDED.response_body_json,
          response_body_omitted_json = EXCLUDED.response_body_omitted_json,
          error_name = EXCLUDED.error_name,
          error_message = EXCLUDED.error_message,
          error_stack = EXCLUDED.error_stack
      `,
      [
        execution.id,
        execution.state,
        execution.startedAt,
        execution.state === "running" ? null : execution.finishedAt,
        execution.state === "running" ? null : execution.durationMs,
        execution.request.method,
        execution.request.url,
        stringify(execution.request.headers) ?? "{}",
        stringify(execution.request.body),
        stringify(execution.request.bodyOmitted),
        response?.status ?? null,
        response === undefined ? null : stringify(response.headers),
        response === undefined ? null : stringify(response.body),
        response === undefined ? null : stringify(response.bodyOmitted),
        error?.name ?? null,
        error?.message ?? null,
        error?.stack ?? null,
      ],
    );
  }

  async findById(id: string): Promise<Execution | undefined> {
    await this.ready;

    const result = await this.pool.query<ExecutionRow>(
      "SELECT * FROM executions WHERE id = $1",
      [id],
    );
    const row = result.rows[0];

    return row === undefined ? undefined : fromExecutionRow(row);
  }

  async list(): Promise<Execution[]> {
    await this.ready;

    const result = await this.pool.query<ExecutionRow>(
      "SELECT * FROM executions ORDER BY started_at DESC",
    );

    return result.rows.map(fromExecutionRow);
  }

  async saveReplayAttempt(result: ReplayResult): Promise<ReplayAttempt> {
    await this.ready;

    const attemptNumberResult = await this.pool.query<{
      attempt_number: number | string;
    }>(
      `
        SELECT COALESCE(MAX(attempt_number), 0) + 1 AS attempt_number
        FROM replay_attempts
        WHERE execution_id = $1
      `,
      [result.executionId],
    );
    const attemptNumber = Number(attemptNumberResult.rows[0]?.attempt_number);
    const attempt = createReplayAttempt(result, attemptNumber);
    const response = attempt.replayedResponse;

    await this.pool.query(
      `
        INSERT INTO replay_attempts (
          id, execution_id, attempt_number, replayed_at, outcome, differences_json,
          skipped_comparisons_json, replayed_status, replayed_headers_json,
          replayed_body_json, error_name, error_message
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9,
          $10, $11, $12
        )
      `,
      [
        attempt.id,
        attempt.executionId,
        attempt.attemptNumber,
        attempt.replayedAt,
        attempt.outcome,
        stringify(attempt.differences) ?? "[]",
        stringify(attempt.skippedComparisons) ?? "[]",
        response?.status ?? null,
        response === undefined ? null : stringify(response.headers),
        response === undefined ? null : stringify(response.body),
        attempt.error?.name ?? null,
        attempt.error?.message ?? null,
      ],
    );

    return attempt;
  }

  async listReplayAttempts(executionId: string): Promise<ReplayAttempt[]> {
    await this.ready;

    const result = await this.pool.query<ReplayAttemptRow>(
      `
        SELECT * FROM replay_attempts
        WHERE execution_id = $1
        ORDER BY attempt_number ASC
      `,
      [executionId],
    );

    return result.rows.map(fromReplayAttemptRow);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async createTables(): Promise<void> {
    await this.pool.query(`
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
        request_body_omitted_json TEXT,
        response_status INTEGER,
        response_headers_json TEXT,
        response_body_json TEXT,
        response_body_omitted_json TEXT,
        error_name TEXT,
        error_message TEXT,
        error_stack TEXT
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS replay_attempts (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL REFERENCES executions(id),
        attempt_number INTEGER NOT NULL,
        replayed_at TEXT NOT NULL,
        outcome TEXT NOT NULL,
        differences_json TEXT NOT NULL DEFAULT '[]',
        skipped_comparisons_json TEXT NOT NULL DEFAULT '[]',
        replayed_status INTEGER,
        replayed_headers_json TEXT,
        replayed_body_json TEXT,
        error_name TEXT,
        error_message TEXT,
        UNIQUE(execution_id, attempt_number)
      )
    `);
  }
}

function createReplayAttempt(
  result: ReplayResult,
  attemptNumber: number,
): ReplayAttempt {
  return {
    id: randomUUID(),
    executionId: result.executionId,
    attemptNumber,
    replayedAt: new Date().toISOString(),
    outcome: result.outcome,
    differences: result.outcome === "failed" ? [] : result.differences,
    skippedComparisons:
      result.outcome === "failed" ? [] : result.skippedComparisons,
    ...(result.outcome === "failed"
      ? { error: result.error }
      : { replayedResponse: result.replayedResponse }),
  };
}

function fromExecutionRow(row: ExecutionRow): Execution {
  const request: HttpRequestSnapshot = {
    method: row.request_method,
    url: row.request_url,
    headers: parseJson(row.request_headers_json) as HttpHeaders,
    ...(row.request_body_json === null
      ? {}
      : { body: parseJson(row.request_body_json) }),
    ...(row.request_body_omitted_json === null
      ? {}
      : {
          bodyOmitted: parseJson(row.request_body_omitted_json) as BodyOmission,
        }),
  };

  if (row.state === "running") {
    return { id: row.id, state: "running", startedAt: row.started_at, request };
  }

  const error = toError(row);

  if (row.state === "aborted") {
    if (
      error === undefined ||
      row.finished_at === null ||
      row.duration_ms === null
    ) {
      throw new Error("Invalid aborted execution stored in Postgres");
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
    throw new Error("Invalid finished execution stored in Postgres");
  }

  const response: HttpResponseSnapshot = {
    status: row.response_status,
    headers: parseJson(row.response_headers_json) as HttpHeaders,
    ...(row.response_body_json === null
      ? {}
      : { body: parseJson(row.response_body_json) }),
    ...(row.response_body_omitted_json === null
      ? {}
      : {
          bodyOmitted: parseJson(
            row.response_body_omitted_json,
          ) as BodyOmission,
        }),
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

function fromReplayAttemptRow(row: ReplayAttemptRow): ReplayAttempt {
  if (row.outcome === "failed") {
    if (row.error_name === null || row.error_message === null) {
      throw new Error("Invalid failed replay attempt stored in Postgres");
    }

    return {
      id: row.id,
      executionId: row.execution_id,
      attemptNumber: row.attempt_number,
      replayedAt: row.replayed_at,
      outcome: "failed",
      differences: parseJson(row.differences_json) as ReplayDifference[],
      skippedComparisons: parseJson(
        row.skipped_comparisons_json,
      ) as ReplayAttempt["skippedComparisons"],
      error: { name: row.error_name, message: row.error_message },
    };
  }

  if (row.replayed_status === null || row.replayed_headers_json === null) {
    throw new Error("Invalid successful replay attempt stored in Postgres");
  }

  return {
    id: row.id,
    executionId: row.execution_id,
    attemptNumber: row.attempt_number,
    replayedAt: row.replayed_at,
    outcome: row.outcome,
    differences: parseJson(row.differences_json) as ReplayDifference[],
    skippedComparisons: parseJson(
      row.skipped_comparisons_json,
    ) as ReplayAttempt["skippedComparisons"],
    replayedResponse: {
      status: row.replayed_status,
      headers: parseJson(row.replayed_headers_json) as HttpHeaders,
      ...(row.replayed_body_json === null
        ? {}
        : { body: parseJson(row.replayed_body_json) }),
    },
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
