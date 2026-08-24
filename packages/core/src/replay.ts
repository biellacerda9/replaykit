import type { ExecutionError } from "./execution.js";
import type { HttpResponseSnapshot } from "./http.js";

export type ReplayOutcome = "matched" | "divergent" | "failed";

interface ReplayResultBase {
  readonly executionId: string;
  readonly originalResponse: HttpResponseSnapshot;
}

export interface SuccessfulReplayResult extends ReplayResultBase {
  readonly outcome: "matched" | "divergent";
  readonly replayedResponse: HttpResponseSnapshot;
}

export interface FailedReplayResult extends ReplayResultBase {
  readonly outcome: "failed";
  readonly error: ExecutionError;
}

export type ReplayResult = SuccessfulReplayResult | FailedReplayResult;

export interface ReplayAttempt {
  readonly id: string;
  readonly executionId: string;
  readonly attemptNumber: number;
  readonly replayedAt: string;
  readonly outcome: ReplayOutcome;
  readonly replayedResponse?: HttpResponseSnapshot;
  readonly error?: ExecutionError;
}
