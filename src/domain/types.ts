export interface Repository {
  name: string;
  category: string;
  url: string;
  schema?: string; // Optional override; defaults to sanitized name from URL
}

export interface SyncSuccess {
  status: "success";
  repository: Repository;
  schema: string;
  durationMs: number;
}

export interface SyncFailure {
  status: "failure";
  repository: Repository;
  error: Error;
  durationMs: number;
}

export type SyncResult = SyncSuccess | SyncFailure;

export interface SyncSummary {
  total: number;
  succeeded: number;
  failed: number;
  results: SyncResult[];
}
