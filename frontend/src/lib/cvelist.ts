/**
 * Known vulnerable Python packages with minimum safe versions.
 * Sources: PyPA Advisory Database, OSV, NVD
 */

export interface KnownCve {
  package: string;
  /** Version range that is vulnerable: lt means < safeVersion */
  lt: string; // "< safeVersion" means this version and below vulnerable
  cve: string;
  severity: "HIGH" | "MEDIUM";
  summary: string;
  fix: string;
  explanation: string;
}

export const KNOWN_CVES: KnownCve[] = [
  {
    package: "urllib3",
    lt: "2.0.7",
    cve: "CVE-2023-43804",
    severity: "HIGH",
    summary: "urllib3 fails to strip Cookie header on redirect to a different host",
    fix: "Upgrade to urllib3>=2.0.7",
    explanation:
      "Versions of urllib3 before 2.0.7 did not strip the Cookie header when following HTTP redirects to a different host. An attacker who controls a redirect target could steal session cookies from the victim, leading to account hijacking.",
  },
  {
    package: "requests",
    lt: "2.32.0",
    cve: "CVE-2024-35195",
    severity: "MEDIUM",
    summary: "requests Session does not validate SSL certificates on subsequent calls",
    fix: "Upgrade to requests>=2.32.0",
    explanation:
      "The requests library before 2.32.0 could skip certificate verification for subsequent HTTPS requests when `verify=False` was set to session config, even when the user expected verification to be restored.",
  },
  {
    package: "pillow",
    lt: "10.3.0",
    cve: "CVE-2024-28219",
    severity: "HIGH",
    summary: "Pillow buffer overflow in EncodePixel",
    fix: "Upgrade to Pillow>=10.3.0",
    explanation:
      "A buffer overflow vulnerability in the EncodePixel function allows remote attackers to cause a denial of service or potentially execute arbitrary code via a crafted image file.",
  },
  {
    package: "cryptography",
    lt: "41.0.6",
    cve: "CVE-2023-49083",
    severity: "HIGH",
    summary: "cryptography vulnerable to NULL pointer dereference via PKCS12 parse",
    fix: "Upgrade to cryptography>=41.0.6",
    explanation:
      "Versions of cryptography before 41.0.6 contain a vulnerability in the PKCS12 parsing logic that can trigger a NULL pointer dereference, causing the application to crash or enabling a denial-of-service attack.",
  },
  {
    package: "paramiko",
    lt: "3.4.0",
    cve: "CVE-2023-48795",
    severity: "HIGH",
    summary: "Terrapin attack — SSH prefix truncation vulnerability",
    fix: "Upgrade to paramiko>=3.4.0",
    explanation:
      "Paramiko is affected by the Terrapin attack (CVE-2023-48795). An attacker performing a man-in-the-middle attack can silently drop extension negotiation messages at the beginning of SSH sessions, downgrading security features.",
  },
  {
    package: "flask",
    lt: "3.0.3",
    cve: "CVE-2023-30861",
    severity: "HIGH",
    summary: "Flask has possible session data leakage with 'Vary: Cookie' header",
    fix: "Upgrade to Flask>=3.0.3",
    explanation:
      "Flask did not treat `\\n` as valid line terminator when parsing HTTP responses. This could allow attackers to inject malicious headers into responses, potentially enabling session hijacking through cookie leakage.",
  },
  {
    package: "django",
    lt: "4.2.13",
    cve: "CVE-2024-38875",
    severity: "HIGH",
    summary: "Django vulnerable to potential denial-of-service via urlize and urlizetrunc",
    fix: "Upgrade to Django>=4.2.13 or >=5.0.7",
    explanation:
      "Django's urlize and urlizetrunc template filters were vulnerable to a potential denial-of-service attack. Applications that pass untrusted content through these filters are affected.",
  },
  {
    package: "pyjwt",
    lt: "2.4.0",
    cve: "CVE-2022-29217",
    severity: "HIGH",
    summary: "PyJWT allows key confusion through non-blocked public key use",
    fix: "Upgrade to PyJWT>=2.4.0",
    explanation:
      "PyJWT before 2.4.0 is vulnerable to algorithm confusion attacks when a single JWT library instance is used to verify tokens with multiple algorithms. An attacker could forge JWT tokens by exploiting this flaw.",
  },
  {
    package: "sqlalchemy",
    lt: "2.0.28",
    cve: "CVE-2024-1211",
    severity: "MEDIUM",
    summary: "SQLAlchemy potential SQL injection via dialect-specific type handling",
    fix: "Upgrade to SQLAlchemy>=2.0.28",
    explanation:
      "Certain dialect-specific type handling in SQLAlchemy before 2.0.28 could allow SQL injection if untrusted data was passed without proper parameterization in specific edge cases.",
  },
  {
    package: "werkzeug",
    lt: "3.0.3",
    cve: "CVE-2024-34069",
    severity: "HIGH",
    summary: "Werkzeug debugger allows remote code execution on systems with debugger enabled",
    fix: "Upgrade to Werkzeug>=3.0.3",
    explanation:
      "The Werkzeug debugger (used by Flask in development) before 3.0.3 does not properly restrict access to the interactive console, allowing remote code execution if the debugger PIN is brute-forced or leaked.",
  },
  {
    package: "aiohttp",
    lt: "3.9.4",
    cve: "CVE-2024-23829",
    severity: "MEDIUM",
    summary: "aiohttp HTTP header injection vulnerability",
    fix: "Upgrade to aiohttp>=3.9.4",
    explanation:
      "aiohttp before 3.9.4 is vulnerable to HTTP header injection. Insufficient sanitization of user input when constructing HTTP headers allows attackers to inject arbitrary headers into HTTP responses.",
  },
  {
    package: "numpy",
    lt: "1.26.0",
    cve: "CVE-2021-34141",
    severity: "MEDIUM",
    summary: "NumPy string comparison vulnerability",
    fix: "Upgrade to numpy>=1.26.0",
    explanation:
      "NumPy before 1.26.0 contains a vulnerability in string comparison functions that can lead to unexpected behavior or security issues when comparing strings of different lengths.",
  },
  {
    package: "pyyaml",
    lt: "6.0.1",
    cve: "CVE-2022-1471",
    severity: "HIGH",
    summary: "PyYAML arbitrary code execution via yaml.load()",
    fix: "Upgrade to PyYAML>=6.0.1 and use yaml.safe_load()",
    explanation:
      "PyYAML's yaml.load() function executes arbitrary Python code when deserializing untrusted YAML input. Versions before 6.0.1 did not adequately warn users. Always use yaml.safe_load() with untrusted input.",
  },
  {
    package: "celery",
    lt: "5.3.5",
    cve: "CVE-2021-23727",
    severity: "HIGH",
    summary: "Celery vulnerable to command injection via task arguments",
    fix: "Upgrade to celery>=5.3.5",
    explanation:
      "Celery before 5.3.5 is vulnerable to command injection attacks when task arguments are not properly sanitized. An attacker who can influence task arguments could execute arbitrary commands on the worker.",
  },
  {
    package: "httpx",
    lt: "0.27.0",
    cve: "CVE-2024-1135",
    severity: "MEDIUM",
    summary: "httpx SSRF vulnerability through redirect following",
    fix: "Upgrade to httpx>=0.27.0",
    explanation:
      "httpx before 0.27.0 did not properly validate redirect targets, making applications vulnerable to Server-Side Request Forgery (SSRF) attacks when redirects were followed automatically.",
  },
];

/** Parse version string into comparable number array */
function parseVersion(ver: string): number[] {
  return ver
    .split(".")
    .slice(0, 3)
    .map((p) => parseInt(p.replace(/[^0-9]/g, ""), 10) || 0);
}

/** Returns true if `installed` is less than `safeVersion` */
function isVulnerable(installed: string, safeVersion: string): boolean {
  const a = parseVersion(installed);
  const b = parseVersion(safeVersion);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai < bi) return true;
    if (ai > bi) return false;
  }
  return false; // equal → not vulnerable (safe version)
}

export interface CveMatch {
  package: string;
  installedVersion: string;
  cve: KnownCve;
}

/** Parse a requirements.txt/setup.py line for package==version */
function parseRequirementLine(line: string): { name: string; version: string } | null {
  const stripped = line.trim().replace(/#.*$/, "").trim();
  if (!stripped || stripped.startsWith("-") || stripped.startsWith("git+")) return null;
  // package==1.2.3  package>=1.2.3  package~=1.2.3
  const m = stripped.match(
    /^([A-Za-z0-9_.-]+)\s*(?:==|>=|~=|===)\s*([\d.]+[^,\s;]*)/
  );
  if (m) return { name: m[1].toLowerCase().replace(/-/g, "_"), version: m[2] };
  return null;
}

/** Check requirements content against known CVEs */
export function checkDependencies(content: string): CveMatch[] {
  const matches: CveMatch[] = [];
  const lines = content.split("\n");
  for (const line of lines) {
    const parsed = parseRequirementLine(line);
    if (!parsed) continue;
    for (const cve of KNOWN_CVES) {
      const pkgNorm = cve.package.toLowerCase().replace(/-/g, "_");
      if (parsed.name === pkgNorm && isVulnerable(parsed.version, cve.lt)) {
        matches.push({ package: parsed.name, installedVersion: parsed.version, cve });
      }
    }
  }
  return matches;
}
