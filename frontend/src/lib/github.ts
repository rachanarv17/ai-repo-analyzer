/**
 * GitHub API helpers — fetch repo tree and file contents.
 * Supports multi-language analysis: Python, JavaScript, TypeScript.
 */

const GH_API = "https://api.github.com";
const GH_RAW = "https://raw.githubusercontent.com";

/** Parse "https://github.com/owner/repo" → { owner, repo } */
export function parseGithubUrl(url: string): { owner: string; repo: string } {
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (!m) throw new Error(`Invalid GitHub URL: ${url}`);
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

export interface TreeItem {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha: string;
  url: string;
}

// ─── Language support matrix ──────────────────────────────────────────────────

export type AnalyzedLanguage = "Python" | "JavaScript" | "TypeScript";

export interface LanguageSummary {
  language: AnalyzedLanguage;
  extensions: string[];
  fileCount: number;
}

export interface SelectedFiles {
  pythonFiles: TreeItem[];
  jsFiles:     TreeItem[];
  tsFiles:     TreeItem[];
  genericFiles: TreeItem[]; // Dockerfile, shell, config, ruby, php, go, java, etc.
  depFiles:    TreeItem[];
  languages:   LanguageSummary[];
}

// ─── Headers ─────────────────────────────────────────────────────────────────

let _githubToken: string | null = null;

function buildHeaders(): Record<string, string> {
  // Evaluate token lazily so hot-reload picks up env changes
  if (_githubToken === null) {
    _githubToken = process.env.GITHUB_TOKEN ?? "";
  }
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AI-Repo-Analyzer/2.0",
  };
  if (_githubToken) h["Authorization"] = `Bearer ${_githubToken}`;
  return h;
}

// ─── GitHub API calls ─────────────────────────────────────────────────────────

/** Fetch the default branch name and validate repo exists */
async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}`, {
    headers: buildHeaders(),
    cache: "no-store",
  });

  if (res.status === 404) {
    throw new Error(`Repository '${owner}/${repo}' not found or is private.`);
  }
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get("x-ratelimit-reset");
    const resetDate = reset
      ? new Date(Number(reset) * 1000).toLocaleTimeString()
      : "soon";
    throw new Error(
      `GitHub API rate limit exceeded (resets at ${resetDate}). ` +
      `Add a GITHUB_TOKEN to .env.local to increase limit to 5,000 req/hr. ` +
      `See: https://github.com/settings/tokens`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.default_branch ?? "main";
}

/** Fetch the full recursive git tree */
export async function getRepoTree(
  owner: string,
  repo: string
): Promise<{ items: TreeItem[]; branch: string }> {
  const branch = await getDefaultBranch(owner, repo);
  const res = await fetch(
    `${GH_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: buildHeaders(), cache: "no-store" }
  );

  if (res.status === 403 || res.status === 429) {
    throw new Error(
      "GitHub API rate limit hit while fetching file tree. Try again in a minute, or add a GITHUB_TOKEN."
    );
  }
  if (!res.ok) {
    throw new Error(`Tree fetch failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  if (data.truncated) {
    console.warn(`[github] Tree truncated for ${owner}/${repo}`);
  }

  const items: TreeItem[] = (data.tree ?? []).filter(
    (item: TreeItem) => item.type === "blob"
  );
  return { items, branch };
}

/** Fetch raw file content (via raw.githubusercontent.com) */
export async function fetchFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GH_RAW}/${owner}/${repo}/${branch}/${encodeURIComponent(path).replace(/%2F/g, "/")}`,
      { headers: { "User-Agent": "AI-Repo-Analyzer/2.0" }, cache: "no-store" }
    );
    if (!res.ok) {
      console.warn(`[github] fetchFileContent failed for ${path}: HTTP ${res.status}`);
      return null;
    }
    const text = await res.text();
    if (text.includes("\x00")) return null; // binary
    return text;
  } catch (err) {
    console.warn(`[github] fetchFileContent error for ${path}:`, err);
    return null;
  }
}

// ─── File selection ────────────────────────────────────────────────────────────

const SKIP_DIRS = [
  "node_modules", "__pycache__", ".git", "dist", "build", "coverage",
  ".next", "out", "vendor", "target", "venv", ".venv", "env",
  "migrations", "__mocks__", ".cache", "public/static",
];

function shouldSkipPath(path: string): boolean {
  return SKIP_DIRS.some((d) => path.includes(`/${d}/`) || path.startsWith(`${d}/`));
}

function pickFiles(
  items: TreeItem[],
  ext: string | string[],
  cap: number
): TreeItem[] {
  const exts = Array.isArray(ext) ? ext : [ext];
  return items
    .filter((i) => {
      if (i.type !== "blob") return false;
      if (!exts.some((e) => i.path.endsWith(e))) return false;
      if (shouldSkipPath(i.path)) return false;
      if (i.size !== undefined && i.size > 600_000) return false;
      return true;
    })
    .sort((a, b) => {
      // Prioritize src/ and lib/ over test files
      const aTest = /test|spec|__tests__/.test(a.path) ? 1 : 0;
      const bTest = /test|spec|__tests__/.test(b.path) ? 1 : 0;
      return aTest - bTest;
    })
    .slice(0, cap);
}

/** Choose which files to analyze across all supported languages */
export function selectAnalysisFiles(items: TreeItem[]): SelectedFiles {
  // Count raw files by language (before cap)
  const rawPy     = items.filter((i) => i.path.endsWith(".py")              && !shouldSkipPath(i.path));
  const rawJs     = items.filter((i) => (i.path.endsWith(".js") || i.path.endsWith(".jsx")) && !shouldSkipPath(i.path));
  const rawTs     = items.filter((i) => (i.path.endsWith(".ts") || i.path.endsWith(".tsx")) && !shouldSkipPath(i.path));
  const rawRb     = items.filter((i) => i.path.endsWith(".rb")              && !shouldSkipPath(i.path));
  const rawPhp    = items.filter((i) => i.path.endsWith(".php")             && !shouldSkipPath(i.path));
  const rawGo     = items.filter((i) => i.path.endsWith(".go")              && !shouldSkipPath(i.path));
  const rawJava   = items.filter((i) => (i.path.endsWith(".java") || i.path.endsWith(".kt")) && !shouldSkipPath(i.path));

  // Config-type files (always include, up to 15 total)
  const rawDocker = items.filter((i) => {
    const b = i.path.split("/").pop()!.toLowerCase();
    return (b === "dockerfile" || b.startsWith("dockerfile.")) && !shouldSkipPath(i.path);
  });
  const rawShell  = items.filter((i) => {
    const ext = i.path.split(".").pop()!.toLowerCase();
    return ["sh", "bash", "zsh", "ksh"].includes(ext) && !shouldSkipPath(i.path);
  });
  const rawConfig = items.filter((i) => {
    const base = i.path.split("/").pop()!.toLowerCase();
    const ext  = "." + base.split(".").pop()!;
    const isEnvFile = base === ".env" || base.startsWith(".env.");
    return (
      isEnvFile ||
      ["dockerfile", "docker-compose.yml", "docker-compose.yaml"].includes(base) ||
      [".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf", ".properties"].includes(ext) ||
      (ext === ".json" && /config|settings|schema|(package\.json$)/.test(i.path))
    ) && !shouldSkipPath(i.path);
  });

  // Allocate source files proportionally (cap at 40 total)
  const CAP = 40;
  const totalSrc = rawPy.length + rawJs.length + rawTs.length +
                   rawRb.length + rawPhp.length + rawGo.length + rawJava.length;

  function proportional(group: TreeItem[]): number {
    if (totalSrc === 0) return 0;
    return Math.max(group.length > 0 ? 2 : 0, Math.round((group.length / totalSrc) * CAP));
  }

  const pythonFiles = pickFiles(items, ".py",           proportional(rawPy));
  const jsFiles     = pickFiles(items, [".js", ".jsx"],  proportional(rawJs));
  const tsFiles     = pickFiles(items, [".ts", ".tsx"],  proportional(rawTs));
  const rbFiles     = pickFiles(items, ".rb",           Math.min(proportional(rawRb), 8));
  const phpFiles    = pickFiles(items, ".php",          Math.min(proportional(rawPhp), 8));
  const goFiles     = pickFiles(items, ".go",           Math.min(proportional(rawGo), 8));
  const javaFiles   = pickFiles(items, [".java", ".kt"], Math.min(proportional(rawJava), 8));

  // Generic/config files (always included, up to 15)
  const dockerFiles = rawDocker.slice(0, 3);
  const shellFiles  = rawShell.slice(0, 6);
  const configFiles = rawConfig.slice(0, 10);
  const genericFiles = [...dockerFiles, ...shellFiles, ...configFiles, ...rbFiles, ...phpFiles, ...goFiles, ...javaFiles];

  // Python dependency files
  const DEP_NAMES = [
    "requirements.txt", "requirements-dev.txt", "requirements_dev.txt",
    "setup.py", "pyproject.toml", "Pipfile",
  ];
  const depFiles = items.filter((i) =>
    DEP_NAMES.some((n) => i.path === n || i.path.endsWith("/" + n))
  );

  // Language summary for UI
  const languages: LanguageSummary[] = [];
  if (rawPy.length  > 0) languages.push({ language: "Python",     extensions: [".py"],           fileCount: rawPy.length });
  if (rawJs.length  > 0) languages.push({ language: "JavaScript", extensions: [".js", ".jsx"],   fileCount: rawJs.length });
  if (rawTs.length  > 0) languages.push({ language: "TypeScript", extensions: [".ts", ".tsx"],   fileCount: rawTs.length });
  if (rawRb.length  > 0) languages.push({ language: "Ruby" as AnalyzedLanguage,       extensions: [".rb"],           fileCount: rawRb.length });
  if (rawPhp.length > 0) languages.push({ language: "PHP" as AnalyzedLanguage,        extensions: [".php"],          fileCount: rawPhp.length });
  if (rawGo.length  > 0) languages.push({ language: "Go" as AnalyzedLanguage,         extensions: [".go"],           fileCount: rawGo.length });
  if (rawJava.length > 0) languages.push({ language: "Java" as AnalyzedLanguage,      extensions: [".java"],         fileCount: rawJava.length });
  if (rawDocker.length > 0) languages.push({ language: "Dockerfile" as AnalyzedLanguage, extensions: ["Dockerfile"], fileCount: rawDocker.length });
  if (rawShell.length  > 0) languages.push({ language: "Shell" as AnalyzedLanguage,   extensions: [".sh"],           fileCount: rawShell.length });
  if (rawConfig.length > 0) languages.push({ language: "Config" as AnalyzedLanguage,  extensions: [".yaml",".env"],  fileCount: rawConfig.length });

  return { pythonFiles, jsFiles, tsFiles, genericFiles, depFiles, languages };
}

// ─── Language detection ───────────────────────────────────────────────────────

const EXT_TO_LANG: Record<string, string> = {
  ".py":     "Python",
  ".js":     "JavaScript",
  ".jsx":    "JavaScript (React)",
  ".ts":     "TypeScript",
  ".tsx":    "TypeScript (React)",
  ".java":   "Java",
  ".kt":     "Kotlin",
  ".go":     "Go",
  ".rs":     "Rust",
  ".rb":     "Ruby",
  ".php":    "PHP",
  ".cs":     "C#",
  ".cpp":    "C++",
  ".c":      "C",
  ".swift":  "Swift",
  ".dart":   "Dart",
  ".r":      "R",
  ".scala":  "Scala",
  ".ex":     "Elixir",
  ".exs":    "Elixir",
  ".lua":    "Lua",
  ".sh":     "Shell",
  ".bash":   "Bash",
  ".vue":    "Vue.js",
  ".svelte": "Svelte",
};

/** Detect all languages in a repo tree — for error messages */
export function detectRepoLanguages(items: TreeItem[]): string[] {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const parts = item.path.split(".");
    if (parts.length < 2) continue;
    const ext  = "." + parts.pop()!.toLowerCase();
    const lang = EXT_TO_LANG[ext];
    if (lang) counts[lang] = (counts[lang] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang);
}

/** Check if a repo has any files we can analyze across all supported types */
export function hasAnalyzableFiles(items: TreeItem[]): boolean {
  return items.some((i) => {
    if (shouldSkipPath(i.path)) return false;
    const base = i.path.split("/").pop()!.toLowerCase();
    const ext  = "." + base.split(".").pop()!.toLowerCase();
    // Source files
    if ([".py",".js",".jsx",".ts",".tsx",".rb",".php",".go",".java",".kt",".sh",".bash"].includes(ext)) return true;
    // Dockerfiles
    if (base === "dockerfile" || base.startsWith("dockerfile.")) return true;
    // Config files (only if meaningful)
    if ([".yaml",".yml",".env",".toml",".cfg",".conf",".ini",".properties"].includes(ext)) return true;
    if (base === ".env" || base.startsWith(".env.")) return true;
    return false;
  });
}
