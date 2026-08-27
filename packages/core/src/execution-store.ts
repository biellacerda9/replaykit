import type { Execution } from "./execution.js";
import type { ReplayAttempt, ReplayResult } from "./replay.js";

export interface ExecutionStore {
  save(execution: Execution): Promise<void>;
  findById(id: string): Promise<Execution | undefined>;
  list(): Promise<Execution[]>;
  saveReplayAttempt(result: ReplayResult): Promise<ReplayAttempt>;
  listReplayAttempts(executionId: string): Promise<ReplayAttempt[]>;
}
