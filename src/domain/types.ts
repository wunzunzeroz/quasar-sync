export type Scale = "harbor" | "approach" | "coastal" | "general" | "overview";

export interface Repository {
  key: string; // Unique identifier used as PostgreSQL schema name
  name: string;
  category: string;
  scale: Scale;
  url: string;
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
