export type ScanStatus = "idle" | "scanning" | "complete" | "error";

export interface CountedLabel {
  label: string;
  count: number;
}

export interface ScanReport {
  projectName: string;
  path: string;
  fileCount: number;
  actionableCount: number;
  advisoryCount: number;
  totalFindings: number;
  score: number;
  findingsPerFile: number;
  durationMs: number;
  groups: CountedLabel[];
  topRules: CountedLabel[];
}

export interface AppState {
  selectedPath: string;
  report: ScanReport | null;
  status: ScanStatus;
  errorMessage: string;
  requestId: string;
  showingInfo: boolean;
}
