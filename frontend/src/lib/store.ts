/**
 * Global in-memory scan store — survives Next.js hot-reloads via globalThis.
 * Persists to disk (scan-data.json in project root) so scans survive server restarts.
 */

import fs   from "fs";
import path from "path";

export type ScanStatus = "pending" | "running" | "completed" | "failed";
export type Severity   = "LOW" | "MEDIUM" | "HIGH";
export type Category   = "security" | "quality" | "dependency";

export interface Issue {
  id:              number;
  scan_id:         number;
  file_path:       string;
  line_number:     number | null;
  severity:        Severity;
  category:        Category;
  tool:            string;
  message:         string;
  rule_id:         string | null;
  ai_explanation:  string | null;
  suggested_fix:   string | null;
  before_code:     string | null;
  after_code:      string | null;
  created_at:      string;
}

export interface RepoStats {
  totalPyFiles:  number;
  totalJsFiles?: number;
  analyzedFiles: number;
  totalLines:    number;
  fileList:      string[];
  depFiles:      string[];
  analysisMs:    number;
  languages?:    string[];
}

export interface ScanScore {
  grade:       string;   // A-F
  score:       number;   // 0-100
  label:       string;
  color:       string;
  description: string;
}

export interface ScanRecord {
  id:            number;
  repo_id:       number;
  status:        ScanStatus;
  error_message: string | null;
  created_at:    string;
  updated_at:    string;
  repo: {
    id:         number;
    url:        string;
    name:       string;
    created_at: string;
  };
  issues:  Issue[];
  stats:   RepoStats | null;
  score?:  ScanScore | null;        // security grade
}

// ─── Persistence helpers ──────────────────────────────────────────────────────

const DATA_FILE = path.join(process.cwd(), "scan-data.json");

function loadFromDisk(): Map<number, ScanRecord> {
  try {
    if (!fs.existsSync(DATA_FILE)) return new Map();
    const raw  = fs.readFileSync(DATA_FILE, "utf-8");
    const obj  = JSON.parse(raw) as Record<string, ScanRecord>;
    const map  = new Map<number, ScanRecord>();
    for (const [k, v] of Object.entries(obj)) map.set(Number(k), v);
    console.log(`[store] Loaded ${map.size} scans from disk`);
    return map;
  } catch {
    console.warn("[store] Could not load scan-data.json — starting fresh");
    return new Map();
  }
}

function saveToDisk(store: Map<number, ScanRecord>) {
  try {
    const obj: Record<string, ScanRecord> = {};
    for (const [k, v] of store.entries()) {
      // Don't persist pending/running records — they can't be resumed
      if (v.status === "pending" || v.status === "running") continue;
      obj[k] = v;
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), "utf-8");
  } catch (e) {
    console.warn("[store] Could not persist scan-data.json:", e);
  }
}

// ─── Global store (survives hot-reload) ──────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __scanStore:     Map<number, ScanRecord> | undefined;
  // eslint-disable-next-line no-var
  var __scanIdCounter: number | undefined;
}

export const scanStore: Map<number, ScanRecord> =
  globalThis.__scanStore ?? (globalThis.__scanStore = loadFromDisk());

function nextId(): number {
  // Start from 1001 or max existing ID + 1
  const maxExisting = scanStore.size > 0 ? Math.max(...scanStore.keys()) : 1000;
  globalThis.__scanIdCounter = Math.max(
    (globalThis.__scanIdCounter ?? 1000),
    maxExisting
  ) + 1;
  return globalThis.__scanIdCounter;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export function createScan(repoUrl: string): ScanRecord {
  const now  = new Date().toISOString();
  const id   = nextId();
  const name = repoUrl.replace("https://github.com/", "");
  const record: ScanRecord = {
    id,
    repo_id: id,
    status:  "pending",
    error_message: null,
    created_at: now,
    updated_at: now,
    repo:  { id, url: repoUrl, name, created_at: now },
    issues: [],
    stats:  null,
    score:  null,
  };
  scanStore.set(id, record);
  return record;
}

export function updateScan(id: number, patch: Partial<ScanRecord>) {
  const rec = scanStore.get(id);
  if (!rec) return;
  Object.assign(rec, patch, { updated_at: new Date().toISOString() });
  // Persist after every terminal state update
  if (rec.status === "completed" || rec.status === "failed") {
    saveToDisk(scanStore);
  }
}

/** Return the N most recent scans (newest first), optionally filtered by status */
export function listScans(limit = 50): Omit<ScanRecord, "issues">[] {
  return Array.from(scanStore.values())
    .sort((a, b) => b.id - a.id)
    .slice(0, limit)
    .map(({ issues: _i, ...rest }) => rest);
}
