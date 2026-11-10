export type ScanStatus = "idle" | "scanning" | "complete" | "error";

export interface CountedLabel {
  label: string;
  count: number;
}

export interface ScanReport {
  projectName: string;
  projectVersion: string | null;
  path: string;
  fileCount: number;
  codeLines: number;
  actionableCount: number;
  advisoryCount: number;
  totalFindings: number;
  score: number;
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
