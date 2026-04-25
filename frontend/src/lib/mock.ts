/**
 * Mock data for demo / offline mode.
 * When the backend is unreachable, the app falls back to these fixtures
 * so the full UI can be explored without a running server.
 */
import type { Scan, Issue } from "./api";

export const MOCK_SCAN_ID = 9999;

export const MOCK_SCAN: Scan = {
  id: MOCK_SCAN_ID,
  repo_id: 1,
  status: "completed",
  error_message: null,
  created_at: new Date(Date.now() - 120_000).toISOString(),
  updated_at: new Date().toISOString(),
  repo: {
    id: 1,
    url: "https://github.com/psf/requests",
    name: "psf/requests",
    created_at: new Date(Date.now() - 120_000).toISOString(),
  },
};

export const MOCK_ISSUES: Issue[] = [
  {
    id: 1,
    scan_id: MOCK_SCAN_ID,
    file_path: "src/requests/auth.py",
    line_number: 58,
    severity: "HIGH",
    category: "security",
    tool: "bandit",
    rule_id: "B106",
    message: "Possible hardcoded password: 'password'",
    ai_explanation:
      "This line contains the string 'password' as a function argument name. Bandit flags this because hardcoded credentials are a serious security risk — if committed to source control, they can be discovered by attackers who gain read access to the repository.",
    suggested_fix:
      "Replace hardcoded credentials with environment variables. Use `os.environ.get('MY_PASSWORD')` to load sensitive values at runtime, and store secrets in a `.env` file excluded from version control.",
    before_code: `def connect(host, username, password='secret123'):\n    ...`,
    after_code: `import os\n\ndef connect(host, username, password=None):\n    password = password or os.environ.get('APP_PASSWORD')\n    ...`,
    created_at: new Date().toISOString(),
  },
  {
    id: 2,
    scan_id: MOCK_SCAN_ID,
    file_path: "src/requests/sessions.py",
    line_number: 203,
    severity: "HIGH",
    category: "security",
    tool: "bandit",
    rule_id: "B501",
    message: "ssl.wrap_socket called with insecure defaults",
    ai_explanation:
      "The `ssl.wrap_socket` function is called without explicitly setting `cert_reqs=ssl.CERT_REQUIRED` or `ssl_version=ssl.PROTOCOL_TLS`. This means the connection may not verify the server certificate, making it vulnerable to man-in-the-middle attacks.",
    suggested_fix:
      "Always pass `ssl_version=ssl.PROTOCOL_TLS` and `cert_reqs=ssl.CERT_REQUIRED` when creating SSL contexts. Better yet, use `ssl.create_default_context()` which applies secure defaults automatically.",
    before_code: `ssl.wrap_socket(sock, keyfile=keyfile, certfile=certfile)`,
    after_code: `ctx = ssl.create_default_context()\nctx.verify_mode = ssl.CERT_REQUIRED\nssl_sock = ctx.wrap_socket(sock, server_hostname=host)`,
    created_at: new Date().toISOString(),
  },
  {
    id: 3,
    scan_id: MOCK_SCAN_ID,
    file_path: "src/requests/utils.py",
    line_number: 412,
    severity: "MEDIUM",
    category: "quality",
    tool: "pylint",
    rule_id: "W0611",
    message: "Unused import 'urllib3.exceptions.ConnectTimeoutError'",
    ai_explanation:
      "This import statement brings `ConnectTimeoutError` into the module namespace, but the symbol is never referenced in the code. Unused imports increase cognitive load and may cause confusion about the module's actual dependencies.",
    suggested_fix:
      "Remove the unused import. If the import was intended for re-export, add an explicit `__all__` list to make the intent clear.",
    before_code: `from urllib3.exceptions import ConnectTimeoutError, ReadTimeoutError`,
    after_code: `from urllib3.exceptions import ReadTimeoutError  # ConnectTimeoutError removed`,
    created_at: new Date().toISOString(),
  },
  {
    id: 4,
    scan_id: MOCK_SCAN_ID,
    file_path: "src/requests/models.py",
    line_number: 78,
    severity: "MEDIUM",
    category: "quality",
    tool: "flake8",
    rule_id: "E501",
    message: "Line too long (127 > 79 characters)",
    ai_explanation:
      "PEP 8 recommends keeping lines to 79 characters maximum to improve readability, especially in terminals and side-by-side diff views. Many projects use 88 or 99 characters as a more practical limit.",
    suggested_fix:
      "Break the long line using Python's implicit line continuation inside brackets, or use backslash continuation. Consider configuring `max-line-length` in your `.flake8` config to agree with your team's standard.",
    before_code: `result = some_function(argument_one, argument_two, argument_three, argument_four, argument_five)`,
    after_code: `result = some_function(\n    argument_one, argument_two,\n    argument_three, argument_four,\n    argument_five,\n)`,
    created_at: new Date().toISOString(),
  },
  {
    id: 5,
    scan_id: MOCK_SCAN_ID,
    file_path: "requirements.txt",
    line_number: null,
    severity: "HIGH",
    category: "dependency",
    tool: "pip-audit",
    rule_id: "PYSEC-2023-74",
    message: "urllib3 2.0.2 is affected by CVE-2023-43804 (Cookie header stripping)",
    ai_explanation:
      "urllib3 versions before 2.0.7 failed to strip the `Cookie` header during HTTP redirects to a different host. An attacker who can control a redirect target could steal session cookies, leading to session hijacking.",
    suggested_fix: "Upgrade urllib3 to version 2.0.7 or later. Run: `pip install --upgrade urllib3`",
    before_code: `# requirements.txt\nurllib3==2.0.2`,
    after_code: `# requirements.txt\nurllib3>=2.0.7`,
    created_at: new Date().toISOString(),
  },
  {
    id: 6,
    scan_id: MOCK_SCAN_ID,
    file_path: "src/requests/adapters.py",
    line_number: 341,
    severity: "LOW",
    category: "quality",
    tool: "pylint",
    rule_id: "C0116",
    message: "Missing function or method docstring",
    ai_explanation:
      "The function `build_response` lacks a docstring. Docstrings are used by `help()`, documentation generators like Sphinx, and IDEs to provide inline documentation to developers consuming this code.",
    suggested_fix:
      "Add a concise docstring that describes what the function does, its parameters, and its return value. Follow the Google or NumPy docstring style for consistency.",
    before_code: `def build_response(self, request, resp):\n    response = Response()\n    response.status_code = ...`,
    after_code: `def build_response(self, request, resp):\n    """Build a :class:\`Response <Response>\` object from an urllib3 response.\n\n    Args:\n        request: The PreparedRequest used to generate the response.\n        resp: The urllib3 response object.\n    Returns:\n        Response: A populated Response object.\n    """\n    response = Response()\n    response.status_code = ...`,
    created_at: new Date().toISOString(),
  },
  {
    id: 7,
    scan_id: MOCK_SCAN_ID,
    file_path: "src/requests/cookies.py",
    line_number: 167,
    severity: "LOW",
    category: "quality",
    tool: "flake8",
    rule_id: "W291",
    message: "Trailing whitespace",
    ai_explanation:
      "There are trailing whitespace characters at the end of this line. While functionally harmless, trailing whitespace causes noisy diffs in version control and is considered a style violation.",
    suggested_fix:
      "Configure your editor to automatically strip trailing whitespace on save. Most editors (VS Code, PyCharm, Vim) have this as a built-in option.",
    before_code: `return self.get_dict()   `,
    after_code: `return self.get_dict()`,
    created_at: new Date().toISOString(),
  },
  {
    id: 8,
    scan_id: MOCK_SCAN_ID,
    file_path: "src/requests/structures.py",
    line_number: 42,
    severity: "MEDIUM",
    category: "quality",
    tool: "pylint",
    rule_id: "R0201",
    message: "Method could be a function (no-self-use)",
    ai_explanation:
      "The method `lower_items` never uses `self`. When a method doesn't access instance state, it should either be a standalone function or decorated with `@staticmethod`. This improves clarity and allows calling it without an instance.",
    suggested_fix:
      "Add the `@staticmethod` decorator to the method, or move it out of the class if it doesn't conceptually belong there.",
    before_code: `def lower_items(self):\n    return ((k.lower(), v) for k, v in self._store.values())`,
    after_code: `@staticmethod\ndef lower_items(store):\n    return ((k.lower(), v) for k, v in store.values())`,
    created_at: new Date().toISOString(),
  },
  {
    id: 9,
    scan_id: MOCK_SCAN_ID,
    file_path: "Dockerfile",
    line_number: null,
    severity: "MEDIUM",
    category: "security",
    tool: "hadolint",
    rule_id: "DL3002",
    message: "No USER instruction — container runs as root by default",
    ai_explanation:
      "Without a `USER` instruction, Docker runs the container process as root. If the application is compromised, the attacker gains root access inside the container and may be able to escape to the host kernel.",
    suggested_fix:
      "Add before CMD/ENTRYPOINT:\n`RUN groupadd -r appuser && useradd -r -g appuser appuser\nUSER appuser`",
    before_code: "  (no USER instruction found in Dockerfile)",
    after_code:
      "  # Add near the end of your Dockerfile:\n  RUN useradd -r -u 1001 -g root appuser\n  USER appuser",
    created_at: new Date().toISOString(),
  },
  {
    id: 10,
    scan_id: MOCK_SCAN_ID,
    file_path: "Dockerfile",
    line_number: 14,
    severity: "HIGH",
    category: "security",
    tool: "hadolint",
    rule_id: "DL3009",
    message: "curl/wget piped to shell — arbitrary code execution at build time",
    ai_explanation:
      "Piping a download directly to `bash` executes whatever the remote server returns. A compromised CDN or MITM attack can inject malicious code into every Docker build, affecting all environments.",
    suggested_fix:
      "Download the script, verify its checksum, then execute:\n`curl -fsSL https://… -o install.sh && sha256sum --check install.sh.sha256 && bash install.sh`",
    before_code: "   14 │ RUN curl -fsSL https://get.helm.sh/install.sh | bash",
    after_code:
      "   14 │ # Download, verify, then execute\n   15 │ RUN curl -fsSL https://get.helm.sh/install.sh -o /tmp/install.sh \\\n   16 │     && sha256sum --check /tmp/install.sh.sha256 \\\n   17 │     && bash /tmp/install.sh",
    created_at: new Date().toISOString(),
  },
  {
    id: 11,
    scan_id: MOCK_SCAN_ID,
    file_path: "scripts/deploy.sh",
    line_number: null,
    severity: "LOW",
    category: "quality",
    tool: "shellcheck",
    rule_id: "SC2039",
    message: "Missing 'set -e' — errors in pipelines do not cause script to exit",
    ai_explanation:
      "Without `set -e`, a failing command in the middle of the script is silently ignored and execution continues. This leads to scripts running in a partial/broken state — for example, a failed database migration followed by a traffic switch that would cause data corruption.",
    suggested_fix:
      "Add at the top of the script after the shebang:\n`set -euo pipefail`",
    before_code: "  1 │ #!/bin/bash\n  2 │ # (no set -euo pipefail)",
    after_code: "  1 │ #!/bin/bash\n  2 │ set -euo pipefail",
    created_at: new Date().toISOString(),
  },
  {
    id: 12,
    scan_id: MOCK_SCAN_ID,
    file_path: ".env.example",
    line_number: 7,
    severity: "HIGH",
    category: "security",
    tool: "secret-scan",
    rule_id: "detect-secrets",
    message: "Possible hardcoded api_key — credential in source file",
    ai_explanation:
      "An API key appears to be hardcoded on line 7. Credentials committed to source code are exposed to all repo contributors and remain in git history even after deletion — `git log` can reveal them forever.",
    suggested_fix:
      "Use environment variables or a secrets manager.\n• Docker: --env-file .env\n• CI: use masked repository secrets\n• Never commit .env files with real credentials",
    before_code: "   7 │ OPENAI_API_KEY=sk-proj-abc123xyz456def789",
    after_code:
      "   7 │ OPENAI_API_KEY=<from environment>\n  # Load from: process.env.OPENAI_API_KEY / os.environ['OPENAI_API_KEY']",
    created_at: new Date().toISOString(),
  },
];


/** Simulates a scan that is still running (for demo of loading state). */
export const MOCK_SCAN_RUNNING: Scan = {
  ...MOCK_SCAN,
  id: 9998,
  status: "running",
};

/** Key used to store scan history in localStorage */
export const HISTORY_KEY = "ai-repo-analyzer:history";

export interface HistoryEntry {
  scanId: number;
  repoUrl: string;
  repoName: string;
  status: string;
  issueCount: number;
  highCount: number;
  scannedAt: string;
  isMock?: boolean;
}

export function saveToHistory(entry: HistoryEntry) {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const existing: HistoryEntry[] = raw ? JSON.parse(raw) : [];
    // Deduplicate by scanId
    const filtered = existing.filter((e) => e.scanId !== entry.scanId);
    const updated = [entry, ...filtered].slice(0, 50); // keep last 50
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable (SSR / private mode)
  }
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {}
}
