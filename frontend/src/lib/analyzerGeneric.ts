/**
 * Generic file analyzer — covers:
 *  - Dockerfile
 *  - Shell scripts (.sh, .bash)
 *  - Config files (.yaml, .yml, .env, .toml, .json, .ini, .cfg)
 *  - Ruby (.rb), PHP (.php), Go (.go), Java (.java), Rust (.rs)
 *  - Any other text file: generic secrets scan
 */

import type { Issue, Severity, Category } from "./store";

// ─── Types ─────────────────────────────────────────────────────────────────

export type FileClass =
  | "dockerfile"
  | "shell"
  | "config"
  | "ruby"
  | "php"
  | "go"
  | "java"
  | "rust"
  | "c"
  | "generic";

interface Finding {
  lineNum: number | null;
  severity: Severity;
  category: Category;
  tool: string;
  ruleId: string;
  message: string;
  explanation: string;
  fix: string;
  before: string;
  after: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function codeCtx(lines: string[], lineNum: number, pre = 1, post = 1): string {
  const start = Math.max(0, lineNum - 1 - pre);
  const end   = Math.min(lines.length, lineNum + post);
  return lines
    .slice(start, end)
    .map((l, i) => {
      const n = start + i + 1;
      return `${n === lineNum ? " ►" : "  "} ${String(n).padStart(4)} │ ${l}`;
    })
    .join("\n");
}

function isComment(line: string, lang: FileClass): boolean {
  const t = line.trim();
  if (lang === "dockerfile" || lang === "shell" || lang === "config" || lang === "ruby")
    return t.startsWith("#");
  if (lang === "php" || lang === "java" || lang === "go")
    return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
  return t.startsWith("#") || t.startsWith("//");
}

// ─── Detect file class ────────────────────────────────────────────────────

export function classifyFile(path: string): FileClass {
  const base = path.split("/").pop()!.toLowerCase();
  const ext  = base.includes(".") ? "." + base.split(".").pop()! : "";

  if (base === "dockerfile" || base.startsWith("dockerfile.")) return "dockerfile";
  if ([".sh", ".bash", ".zsh", ".ksh", ".fish"].includes(ext)) return "shell";
  if ([".yaml", ".yml", ".env", ".toml", ".ini", ".cfg", ".conf", ".properties"].includes(ext)) return "config";
  if (base === ".env" || base.startsWith(".env.")) return "config";
  if ([".json"].includes(ext)) return "config";
  if (ext === ".rb") return "ruby";
  if (ext === ".php") return "php";
  if (ext === ".go") return "go";
  if ([".java", ".kt", ".kts", ".groovy", ".scala"].includes(ext)) return "java";
  if ([".rs"].includes(ext)) return "rust";
  if ([".c", ".h", ".cpp", ".hpp", ".cc", ".cxx"].includes(ext)) return "c";
  return "generic";
}

// ─── UNIVERSAL: Hardcoded secret detection ─────────────────────────────────

const SECRET_PATTERNS: Array<{ re: RegExp; key: string }> = [
  { re: /\b(password|passwd|secret|api_?key|access_?token|auth_?token|private_?key|client_?secret|db_?pass(?:word)?|database_?pass(?:word)?)\s*[:=]\s*['"`]?([^\s'"`${\[\]#]{4,})['"`]?/i, key: "password/secret" },
  { re: /\bAWSSecretAccessKey\s*[:=]\s*['"`]?([A-Za-z0-9/+=]{20,})['"`]?/, key: "AWS secret key" },
  { re: /\bAWS_?ACCESS_?KEY_?ID\s*[:=]\s*['"`]?(AKIA[A-Z0-9]{16})['"`]?/, key: "AWS access key" },
  { re: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, key: "private key" },
  { re: /\bghp_[A-Za-z0-9]{36}\b/, key: "GitHub PAT" },
  { re: /\bglpat-[A-Za-z0-9_-]{20}\b/, key: "GitLab PAT" },
  { re: /\bxox[baprs]-[0-9A-Za-z]{10,48}\b/, key: "Slack token" },
  { re: /\bSK[0-9a-f]{32}\b/, key: "Twilio/SendGrid API key" },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, key: "Google API key" },
];

function checkAnySecret(line: string, lineNum: number, lines: string[]): Finding | null {
  const t = line.trim();
  // Skip pure comments and obvious placeholders
  if (t.startsWith("#") || t.startsWith("//") || t.startsWith("*")) return null;
  if (/(example|placeholder|your[-_]|xxx|<|>|\$\{|changeme)/i.test(line)) return null;

  for (const { re, key } of SECRET_PATTERNS) {
    if (re.test(line)) {
      return {
        lineNum, severity: "HIGH", category: "security", tool: "secret-scan",
        ruleId: "detect-secrets",
        message: `Possible hardcoded ${key} — credential in source file`,
        explanation: `A ${key} appears to be hardcoded on line ${lineNum}. Credentials committed to source code are exposed to all repo contributors and remain in git history even after deletion.`,
        fix: `Use environment variables or a secrets manager.\n• Docker: --env-file .env\n• CI: use masked repository secrets\n• Never commit .env files with real credentials`,
        before: codeCtx(lines, lineNum),
        after: `  ${lineNum.toString().padStart(4)} │ ${line.replace(/(['"\s:=]+)[^\s'"`${\[\]#]{4,}/, "$1<from environment>")}\n  # Load from: process.env.KEY / os.environ['KEY'] / $KEY`,
      };
    }
  }
  return null;
}

// ─── DOCKERFILE rules ──────────────────────────────────────────────────────

function checkDockerfileRules(lines: string[]): Finding[] {
  const findings: Finding[] = [];
  let hasUser    = false;
  let hasHealthcheck = false;

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const lineNum = i + 1;
    const upper   = line.trim().toUpperCase();

    if (/^\s*USER\s+/i.test(line) && !/USER\s+root/i.test(line)) hasUser = true;
    if (/^\s*HEALTHCHECK/i.test(line)) hasHealthcheck = true;

    // ADD instead of COPY
    if (/^\s*ADD\s+(?!http)/.test(line) && !/\.tar\./.test(line)) {
      findings.push({
        lineNum, severity: "MEDIUM", category: "security", tool: "hadolint",
        ruleId: "DL3010",
        message: "ADD used instead of COPY — ADD can unpack archives and fetch URLs unexpectedly",
        explanation: `\`ADD\` on line ${lineNum} does more than copy: it auto-extracts archives and can download URLs. This makes the build non-deterministic. Use \`COPY\` for simple file copies.`,
        fix: "Replace `ADD` with `COPY` for local file copies. Only use `ADD` if you specifically need auto-extraction.",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/\bADD\b/, "COPY"),
      });
    }

    // :latest tag
    if (/^\s*FROM\s+\S+:latest/i.test(line)) {
      findings.push({
        lineNum, severity: "MEDIUM", category: "security", tool: "hadolint",
        ruleId: "DL3007",
        message: "FROM uses :latest tag — not reproducible, may pull vulnerable image",
        explanation: `\`:latest\` on line ${lineNum} is a moving target. A base image update can silently introduce breaking changes or security vulnerabilities in your builds.`,
        fix: "Pin to a specific version: `FROM node:20.12.0-alpine` instead of `FROM node:latest`.",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/:latest/, ":<pin-specific-version>"),
      });
    }

    // curl | bash
    if (/curl\s.+\|\s*(bash|sh)/i.test(line) || /wget\s.+\|\s*(bash|sh)/i.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "hadolint",
        ruleId: "DL3009",
        message: "curl/wget piped to shell — arbitrary code execution at build time",
        explanation: `Piping a download directly to \`bash\` on line ${lineNum} executes whatever the remote server returns. A compromised CDN or MITM attack can inject malicious code into every Docker build.`,
        fix: "Download the script, verify its checksum, then execute:\n`curl -fsSL https://… -o install.sh && sha256sum --check install.sh.sha256 && bash install.sh`",
        before: codeCtx(lines, lineNum),
        after: `  ${lineNum.toString().padStart(4)} │ # Download, verify checksum, then execute\n  ${lineNum.toString().padStart(4)} │ RUN curl -fsSL https://… -o install.sh \\\n  ${lineNum.toString().padStart(4)} │     && sha256sum --check install.sh.sha256 \\\n  ${lineNum.toString().padStart(4)} │     && bash install.sh`,
      });
    }

    // --privileged
    if (/--privileged/i.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "hadolint",
        ruleId: "DL3012",
        message: "--privileged flag — grants full host kernel capabilities to container",
        explanation: `\`--privileged\` on line ${lineNum} removes all Linux kernel security restrictions. A compromised process in the container can escape to the host.`,
        fix: "Use `--cap-add` to grant only the specific capability needed.\nExample: `--cap-add NET_ADMIN` instead of `--privileged`.",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/--privileged/, "--cap-add <SPECIFIC_CAP>"),
      });
    }

    // Secrets in ENV/ARG
    const envSecretMatch = line.match(/^\s*(ENV|ARG)\s+.*(PASSWORD|SECRET|KEY|TOKEN).*=\s*\S+/i);
    if (envSecretMatch && !/\$\{/.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "hadolint",
        ruleId: "DL3025",
        message: "Secret value in ENV/ARG instruction — embedded in image layer permanently",
        explanation: `ENV/ARG values on line ${lineNum} are baked into the image layers and visible in \`docker history\` even after overwriting in a later layer. Anyone with the image can extract these values.`,
        fix: "Pass secrets at runtime: `docker run --env-file .env …`\nOr use Docker secrets/Buildkit secret mounts: `RUN --mount=type=secret,id=mykey …`",
        before: codeCtx(lines, lineNum),
        after: `  ${lineNum.toString().padStart(4)} │ # Pass at runtime: docker run --env-file .env\n  ${lineNum.toString().padStart(4)} │ # or: RUN --mount=type=secret,id=mykey …`,
      });
    }

    // Generic secret scan
    const secretF = checkAnySecret(line, lineNum, lines);
    if (secretF) findings.push(secretF);
  }

  if (!hasUser) {
    findings.unshift({
      lineNum: null, severity: "MEDIUM", category: "security", tool: "hadolint",
      ruleId: "DL3002",
      message: "No USER instruction — container runs as root by default",
      explanation: "Without a `USER` instruction, Docker runs the container process as root. If the application is compromised, the attacker has root access inside the container.",
      fix: "Add before CMD/ENTRYPOINT:\n`RUN groupadd -r appuser && useradd -r -g appuser appuser\nUSER appuser`",
      before: "  (no USER instruction found in Dockerfile)",
      after: "  # Add near the end of your Dockerfile:\n  RUN useradd -r -u 1001 -g root appuser\n  USER appuser",
    });
  }

  if (!hasHealthcheck) {
    findings.push({
      lineNum: null, severity: "LOW", category: "quality", tool: "hadolint",
      ruleId: "DL3029",
      message: "No HEALTHCHECK instruction — container orchestrators cannot detect unhealthy state",
      explanation: "Without `HEALTHCHECK`, Docker and Kubernetes cannot tell if the container is actually serving traffic. A locked-up process won't be restarted automatically.",
      fix: "Add: `HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8080/health || exit 1`",
      before: "  (no HEALTHCHECK found)",
      after: "  HEALTHCHECK --interval=30s --timeout=5s --retries=3 \\\n    CMD curl -f http://localhost:8080/health || exit 1",
    });
  }

  return findings;
}

// ─── SHELL script rules ────────────────────────────────────────────────────

function checkShellRules(lines: string[]): Finding[] {
  const findings: Finding[] = [];
  const hasSete = lines.some((l) => /set\s+-[^-]*e/.test(l) || /set\s+-e/.test(l));
  const hasSetU = lines.some((l) => /set\s+-[^-]*u/.test(l) || /set\s+-u/.test(l));

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const lineNum = i + 1;
    if (line.trim().startsWith("#")) continue;

    // eval
    if (/\beval\s+/.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "shellcheck",
        ruleId: "SC2091",
        message: "eval — executes arbitrary string as shell code",
        explanation: `\`eval\` on line ${lineNum} executes its argument as shell code. Any user-controlled data in the string allows arbitrary command execution.`,
        fix: "Avoid eval. Use functions or arrays instead:\n`\"$@\"` to pass arguments safely, or an array: `cmd=('cmd' 'arg1'); \"${cmd[@]}\"`",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/\beval\s+/, "# eval removed — use direct execution: "),
      });
    }

    // curl | bash
    if (/curl\s.+\|\s*(bash|sh)\b/i.test(line) || /wget\s.+\|\s*(bash|sh)\b/i.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "shellcheck",
        ruleId: "SC2091-pipe",
        message: "curl/wget piped to shell — remote code execution risk",
        explanation: `Piping a download to shell on line ${lineNum} executes whatever the server returns with no verification. A MITM or compromised server can run any command as the current user.`,
        fix: "Download, verify checksum, then execute:\n`curl -fsSL URL -o script.sh && sha256sum --check script.sha256 && bash script.sh`",
        before: codeCtx(lines, lineNum),
        after: `  ${lineNum.toString().padStart(4)} │ # Safer alternative:\n  ${lineNum.toString().padStart(4)} │ curl -fsSL URL -o /tmp/install.sh\n  ${lineNum.toString().padStart(4)} │ sha256sum --check /tmp/install.sh.sha256\n  ${lineNum.toString().padStart(4)} │ bash /tmp/install.sh`,
      });
    }

    // rm -rf /  or rm -rf /*
    if (/\brm\s+-rf?\s+(\/[^a-z\s]|\/\s|"\/"|\$HOME\/\*)/.test(line) || /\brm\s+-rf\s+\*/.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "shellcheck",
        ruleId: "SC2114",
        message: "rm -rf on dangerous path — could delete system files",
        explanation: `\`rm -rf\` on a broad path on line ${lineNum} is destructive. If a variable is unset, shell expansion may widen the deletion scope (e.g., \`rm -rf $DIR/*\` becomes \`rm -rf /*\` if DIR is empty).`,
        fix: "Always quote variables, use `set -u` to catch unset variables, and double-check paths before recursive deletion.",
        before: codeCtx(lines, lineNum),
        after: `  ${lineNum.toString().padStart(4)} │ # Verify variable is set and non-empty before deletion\n  ${lineNum.toString().padStart(4)} │ [[ -n \"\$DIR\" ]] && rm -rf \"\$DIR\"`,
      });
    }

    // Unquoted variable in rm/cp/mv
    if (/\b(rm|cp|mv|chmod|chown)\s+[^"'].+\$[A-Z_]+[^"']/.test(line)) {
      findings.push({
        lineNum, severity: "MEDIUM", category: "security", tool: "shellcheck",
        ruleId: "SC2086",
        message: "Unquoted variable in file operation — word splitting may cause unintended behavior",
        explanation: `An unquoted variable in a file operation on line ${lineNum} undergoes word splitting and glob expansion. A variable containing spaces or glob chars can match unintended files.`,
        fix: "Always double-quote variables: `rm \"$FILE\"` not `rm $FILE`.",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/\$([A-Za-z_][A-Za-z0-9_]*)(?!")/g, '"$$$1"'),
      });
    }

    // chmod 777
    if (/\bchmod\s+(\d*7\d*7\d*7|a\+[rwx]+)\s/.test(line)) {
      findings.push({
        lineNum, severity: "MEDIUM", category: "security", tool: "shellcheck",
        ruleId: "SC2093",
        message: "chmod 777 — world-writable permissions are a security risk",
        explanation: `Setting world-writable permissions on line ${lineNum} allows any user on the system to modify the file, enabling privilege escalation or tampering with configuration.`,
        fix: "Use the least-privilege permissions needed:\n• Executable script: `chmod 755`\n• Private config: `chmod 600`\n• Shared but not writable: `chmod 644`",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/777/, "755"),
      });
    }

    // Generic secret scan
    const secretF = checkAnySecret(line, lineNum, lines);
    if (secretF) findings.push(secretF);
  }

  if (!hasSete) {
    findings.unshift({
      lineNum: null, severity: "LOW", category: "quality", tool: "shellcheck",
      ruleId: "SC2039",
      message: "Missing 'set -e' — errors in pipelines do not cause script to exit",
      explanation: "Without `set -e`, a failing command in the middle of the script is silently ignored and execution continues. This leads to scripts running in a partial/broken state.",
      fix: "Add at the top of the script after the shebang:\n`set -euo pipefail`",
      before: "  1 │ #!/bin/bash\n  2 │ # (no set -euo pipefail)",
      after: "  1 │ #!/bin/bash\n  2 │ set -euo pipefail",
    });
  }

  if (!hasSetU) {
    findings.push({
      lineNum: null, severity: "LOW", category: "quality", tool: "shellcheck",
      ruleId: "SC2040",
      message: "Missing 'set -u' — unset variables silently expand to empty string",
      explanation: "Without `set -u`, referencing an unset variable produces an empty string instead of an error. This can cause commands like `rm -rf $DIR/*` to become catastrophically destructive.",
      fix: "Add `set -u` (or `set -euo pipefail`) near the top of the script.",
      before: "  1 │ #!/bin/bash\n  2 │ # (no set -u)",
      after: "  1 │ #!/bin/bash\n  2 │ set -euo pipefail",
    });
  }

  return findings;
}

// ─── CONFIG / ENV / YAML / TOML / JSON rules ──────────────────────────────

function checkConfigRules(lines: string[], filePath: string): Finding[] {
  const findings: Finding[] = [];
  const isYaml  = filePath.endsWith(".yaml") || filePath.endsWith(".yml");
  const isEnv   = filePath.endsWith(".env") || filePath.split("/").pop()?.startsWith(".env");
  const isJson  = filePath.endsWith(".json");

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const lineNum = i + 1;
    if (line.trim().startsWith("#")) continue;

    // Secret scan (universal)
    const secretF = checkAnySecret(line, lineNum, lines);
    if (secretF) { findings.push(secretF); continue; }

    // SSL/TLS verification disabled
    if (/verify\s*[:=]\s*(false|0|no|off)/i.test(line) || /ssl_verify\s*[:=]\s*(false|0)/i.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "config-audit",
        ruleId: "insecure-ssl",
        message: "SSL/TLS verification disabled — vulnerable to MITM attacks",
        explanation: `Disabling certificate verification on line ${lineNum} allows connections to servers with invalid or self-signed certificates. Attackers on the same network can intercept and read all traffic.`,
        fix: "Enable verification (default behavior). If you need self-signed certs, add the CA cert to the trust store instead of disabling verification.",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/(verify\s*[:=]\s*)(false|0|no|off)/i, "$1true"),
      });
    }

    // Debug mode enabled
    if (/debug\s*[:=]\s*(true|1|yes|on)/i.test(line) && !line.trim().startsWith("#")) {
      findings.push({
        lineNum, severity: "MEDIUM", category: "security", tool: "config-audit",
        ruleId: "debug-enabled",
        message: "Debug mode enabled in config — may expose stack traces and internal data",
        explanation: `\`debug: true\` on line ${lineNum} typically enables verbose error output including stack traces, SQL queries, and internal paths — all visible to end users in production.`,
        fix: "Set `debug: false` for production. Use environment-specific config files and ensure the production config has debug disabled.",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/(debug\s*[:=]\s*)(true|1|yes|on)/i, "$1false"),
      });
    }

    // YAML: allow_unsafe / unsafe_load
    if (isYaml && /allow_?unsafe\s*:\s*true|unsafe_?load/i.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "config-audit",
        ruleId: "yaml-unsafe",
        message: "YAML unsafe loading enabled — allows arbitrary Python/Ruby object instantiation",
        explanation: `Enabling unsafe YAML loading on line ${lineNum} allows the YAML file to instantiate arbitrary objects. Malicious YAML can execute code when parsed.`,
        fix: "Use safe loading: `yaml.safe_load()` in Python, or remove `allow_unsafe: true` from config.",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/allow_?unsafe\s*:\s*true/i, "allow_unsafe: false"),
      });
    }

    // Database URL with embedded credentials
    if (/(?:DATABASE_URL|DB_URL|MONGO_URL|REDIS_URL)\s*[:=]\s*\w+:\/\/[^:]+:[^@\s]+@/i.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "secret-scan",
        ruleId: "database-url-credentials",
        message: "Database URL contains embedded credentials — sensitive value in config",
        explanation: `The connection string on line ${lineNum} includes a username and password embedded in the URL. These are committed to source control and visible to all contributors.`,
        fix: "Use separate env vars: `DB_HOST`, `DB_USER`, `DB_PASS` — or load the full URL from `process.env.DATABASE_URL` / the platform's secret manager.",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/(:\/\/[^:]+):[^@]+@/, "$1:<DB_PASS>@"),
      });
    }

    // CORS: allow all origins
    if (/allowed_?origins?\s*[:=]\s*['"]\s*\*\s*['"]/i.test(line) || /cors.*origins?.*\*/i.test(line)) {
      findings.push({
        lineNum, severity: "MEDIUM", category: "security", tool: "config-audit",
        ruleId: "cors-wildcard",
        message: "CORS wildcard origin (*) — any website can make credentialed requests",
        explanation: `\`*\` as the allowed CORS origin on line ${lineNum} permits any website to read responses from your API, including with cookies/credentials if credentials are also enabled.`,
        fix: "List specific allowed origins: `allowed_origins: ['https://yourapp.com', 'https://staging.yourapp.com']`",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/['"]\\s*\*\\s*['"]/, "'https://yourapp.com'"),
      });
    }

    // package.json: insecure script patterns
    if (isJson && /"scripts"/.test(line)) continue; // handled inline below

    // npm package integrity: --ignore-scripts is better but skip for now
  }

  return findings;
}

// ─── RUBY rules ────────────────────────────────────────────────────────────

function checkRubyRules(lines: string[]): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const lineNum = i + 1;
    if (line.trim().startsWith("#")) continue;

    // eval
    if (/\beval\s*\(/.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "brakeman",
        ruleId: "RB101",
        message: "eval() — executes arbitrary Ruby code from string",
        explanation: `\`eval()\` on line ${lineNum} parses and executes a string as Ruby code. User-controlled input passed here is Remote Code Execution (RCE).`,
        fix: "Never eval user input. Use whitelists, safe parsers, or Proc/lambda objects for dynamic behavior.",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/\beval\s*\(/, "# UNSAFE eval removed — use safe parser: JSON.parse( or safe_eval("),
      });
    }

    // system() / exec() / backtick
    if (/\bsystem\s*\(|`[^`]+`|\bexec\s*\(|\bspawn\s*\(/.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "brakeman",
        ruleId: "RB102",
        message: "Shell execution — command injection if user data is included",
        explanation: `Command execution on line ${lineNum} via \`system()\`, \`exec()\`, or backticks is vulnerable to injection if any argument includes user-controlled data.`,
        fix: "Pass arguments as an array (no shell interpretation): `system('cmd', arg1, arg2)`\nOr use Open3 for safe subprocess execution.",
        before: codeCtx(lines, lineNum),
        after: `  ${lineNum.toString().padStart(4)} │ # Safe: pass arguments as array\n  ${lineNum.toString().padStart(4)} │ system('cmd', safe_arg1, safe_arg2)`,
      });
    }

    // SQL via string interpolation
    if (/\.where\s*\(\s*["'`][^"'`]+#\{/.test(line) || /\.find_by_sql\s*\(\s*["'`][^"'`]+#\{/.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "brakeman",
        ruleId: "RB103",
        message: "SQL query with string interpolation — SQL injection vulnerability",
        explanation: `Building a SQL query with \`#{}\` on line ${lineNum} directly interpolates user data into SQL. An attacker can inject SQL to read/modify/delete data or authenticate without credentials.`,
        fix: "Use parameterized queries:\n`Model.where('name = ?', params[:name])`\nNever interpolate user input directly into SQL strings.",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/#\{([^}]+)\}/, "?  # bind: [$1]"),
      });
    }

    // Secret scan
    const secretF = checkAnySecret(line, lineNum, lines);
    if (secretF) findings.push(secretF);
  }

  return findings;
}

// ─── PHP rules ────────────────────────────────────────────────────────────

function checkPhpRules(lines: string[]): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const lineNum = i + 1;
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    // eval
    if (/\beval\s*\(/.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "phpstan",
        ruleId: "PHP001",
        message: "eval() — executes arbitrary PHP code, critical RCE risk",
        explanation: `\`eval()\` on line ${lineNum} executes its argument as PHP code. It is one of the most dangerous functions in PHP — any user-controlled input here is Remote Code Execution.`,
        fix: "Remove eval() entirely. Use switch/match statements, closures, or configuration-driven behavior instead.",
        before: codeCtx(lines, lineNum),
        after: `  ${lineNum.toString().padStart(4)} │ // eval() removed — use static dispatch or match expression`,
      });
    }

    // exec/system/shell_exec/passthru
    if (/\b(exec|system|shell_exec|passthru|popen|proc_open)\s*\(/.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "phpstan",
        ruleId: "PHP002",
        message: `Shell execution function — command injection if user data included`,
        explanation: `Shell execution on line ${lineNum} can run arbitrary OS commands. User-controlled data in the argument allows an attacker to execute any command the web server can run.`,
        fix: "Avoid shell execution. If necessary, use `escapeshellarg()` on every user-supplied argument and `escapeshellcmd()` on the command.",
        before: codeCtx(lines, lineNum),
        after: `  ${lineNum.toString().padStart(4)} │ // Use: exec(escapeshellcmd($cmd), escapeshellarg($arg))`,
      });
    }

    // SQL via concatenation
    if (/\$_(GET|POST|REQUEST|COOKIE)\[/.test(line) && /SELECT|INSERT|UPDATE|DELETE|WHERE/i.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "phpstan",
        ruleId: "PHP003",
        message: "SQL query with $_GET/$_POST — SQL injection vulnerability",
        explanation: `Inserting superglobal user input into a SQL query on line ${lineNum} is SQL injection. An attacker can manipulate the query to read any data in the database or authenticate without a password.`,
        fix: "Use PDO prepared statements:\n`$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');\n$stmt->execute([$_GET['id']]);`",
        before: codeCtx(lines, lineNum),
        after: `  ${lineNum.toString().padStart(4)} │ $stmt = $pdo->prepare('SELECT … WHERE col = ?');\n  ${lineNum.toString().padStart(4)} │ $stmt->execute([$_GET['param']]);`,
      });
    }

    // Secret scan
    const secretF = checkAnySecret(line, lineNum, lines);
    if (secretF) findings.push(secretF);
  }

  return findings;
}

// ─── GO rules ─────────────────────────────────────────────────────────────

function checkGoRules(lines: string[]): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const lineNum = i + 1;
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    // fmt.Sprintf in SQL
    if (/fmt\.Sprintf\s*\(.*SELECT|SELECT.*fmt\.Sprintf/i.test(line) ||
        /fmt\.Sprintf\s*\(.*(?:WHERE|FROM|INSERT|UPDATE)/i.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "gosec",
        ruleId: "G201",
        message: "SQL query built with fmt.Sprintf — SQL injection vulnerability",
        explanation: `\`fmt.Sprintf\` is used to build a SQL string on line ${lineNum}. Any user-supplied value interpolated here allows SQL injection.`,
        fix: "Use parameterized queries:\n`db.QueryContext(ctx, 'SELECT * FROM users WHERE id = ?', userID)`",
        before: codeCtx(lines, lineNum),
        after: `  ${lineNum.toString().padStart(4)} │ // Use parameterized query:\n  ${lineNum.toString().padStart(4)} │ rows, err := db.QueryContext(ctx, "SELECT … WHERE id = ?", id)`,
      });
    }

    // os/exec with variable
    if (/exec\.Command\s*\(/.test(line) && /\+\s*\w|Sprintf/.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "gosec",
        ruleId: "G204",
        message: "exec.Command with dynamic argument — potential command injection",
        explanation: `Building a command string dynamically with \`exec.Command\` on line ${lineNum} may allow command injection if the argument contains user input.`,
        fix: "Pass arguments as separate strings to exec.Command — never concatenate:\n`exec.Command('git', 'clone', userRepo)` not `exec.Command('git clone ' + userRepo)`",
        before: codeCtx(lines, lineNum),
        after: `  ${lineNum.toString().padStart(4)} │ // Pass args separately:\n  ${lineNum.toString().padStart(4)} │ cmd := exec.Command("prog", arg1, arg2)`,
      });
    }

    // InsecureSkipVerify
    if (/InsecureSkipVerify\s*:\s*true/.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "gosec",
        ruleId: "G402",
        message: "InsecureSkipVerify: true — TLS certificate verification disabled",
        explanation: `Disabling TLS verification on line ${lineNum} allows connections to servers with invalid or self-signed certificates. Network attackers can intercept and decrypt traffic (MITM).`,
        fix: "Remove `InsecureSkipVerify`. To use self-signed certs: load the CA cert into a `tls.Config.RootCAs` pool.",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/InsecureSkipVerify\s*:\s*true/, "InsecureSkipVerify: false // removed"),
      });
    }

    // Weak hash
    if (/md5\.New\(\)|sha1\.New\(\)|crypto\/md5|crypto\/sha1/.test(line) && !/comment/i.test(line)) {
      findings.push({
        lineNum, severity: "HIGH", category: "security", tool: "gosec",
        ruleId: "G401",
        message: "Weak cryptographic hash (MD5/SHA1) — vulnerable to collision attacks",
        explanation: `MD5/SHA1 on line ${lineNum} are cryptographically broken. Collision attacks are practical and FIPS 140-2 forbids their use for security purposes.`,
        fix: "Use `crypto/sha256` or `crypto/sha512`. For passwords: use `golang.org/x/crypto/bcrypt`.",
        before: codeCtx(lines, lineNum),
        after: codeCtx(lines, lineNum).replace(/md5\.New\(\)|sha1\.New\(\)/, "sha256.New() // from crypto/sha256"),
      });
    }

    // Secret scan
    const secretF = checkAnySecret(line, lineNum, lines);
    if (secretF) findings.push(secretF);
  }

  return findings;
}

// ─── JAVA rules ───────────────────────────────────────────────────────────

function checkJavaRules(lines: string[]): Finding[] {
  const findings: Finding[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const lineNum = i + 1;
    if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

    // XML External Entity (XXE)
    if (/DocumentBuilderFactory\.newInstance/.test(line) || /SAXParserFactory\.newInstance/.test(line)) {
      if (!lines.slice(i, i + 10).some(l => /setFeature\(.*\b(external-general-entities|-parameter-entities)\b.*false/.test(l))) {
        findings.push({
          lineNum, severity: "HIGH", category: "security", tool: "spotbugs-sec", ruleId: "XXE_DEFENSE_DISABLED",
          message: "XML parser factory initialized without disabling external entities (XXE risk)",
          explanation: `The XML parser on line ${lineNum} is not configured to disable external entities. Attackers may inject malicious entities in XML to read arbitrary host files, cause denial of service, or initiate server-side request forgery (SSRF).`,
          fix: `Always configure the factory to disable DTD/entities:\nfactory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);`,
          before: codeCtx(lines, lineNum),
          after: codeCtx(lines, lineNum) + "\n  // Must disable entities:\n  // factory.setFeature(\"http://apache.org/xml/features/disallow-doctype-decl\", true);",
        });
      }
    }

    // Hardcoded encryption key
    if (/SecretKeySpec/.test(line) && /"/.test(line)) {
        findings.push({
          lineNum, severity: "HIGH", category: "security", tool: "spotbugs-sec", ruleId: "HARDCODED_KEY",
          message: "Hardcoded encryption key found in SecretKeySpec",
          explanation: `A cryptographic key appears to be hardcoded as a string on line ${lineNum}. Keys should never be stored in source code.`,
          fix: `Load the key from a secure key management system at runtime, or from environment variables.`,
          before: codeCtx(lines, lineNum),
          after: codeCtx(lines, lineNum).replace(/".*"/, "System.getenv(\"ENCRYPTION_KEY\").getBytes()"),
        });
    }

    // SQL Injection via concatenation
    if (/Statement.*createStatement/.test(line) && /\+/.test(lines[i+1] || "")) {
       // Too noisy to accurately detect via regex, but basic check
    }
    if (/createQuery\(.*" *[+]/i.test(line) || /\+ *".*WHERE/i.test(line)) {
        findings.push({
          lineNum, severity: "HIGH", category: "security", tool: "spotbugs-sec", ruleId: "SQL_INJECTION",
          message: "Possible SQL Injection / HQL Injection via string concatenation",
          explanation: `Dynamically constructing queries via string concatenation on line ${lineNum} exposes the application to injection attacks.`,
          fix: `Use prepared statements / named query parameters.`,
          before: codeCtx(lines, lineNum),
          after: `  // Use: .setParameter(\"name\", value)`,
        });
    }

    // Generic secret scan
    const secretF = checkAnySecret(line, lineNum, lines);
    if (secretF) findings.push(secretF);
  }

  return findings;
}

// ─── RUST rules ───────────────────────────────────────────────────────────

function checkRustRules(lines: string[]): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line    = lines[i];
      const lineNum = i + 1;
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

      // unsafe blocks
      if (/\bunsafe\s*\{/.test(line)) {
         findings.push({
           lineNum, severity: "LOW", category: "security", tool: "clippy", ruleId: "unsafe-code",
           message: "Use of 'unsafe' code block",
           explanation: `The \`unsafe\` keyword on line ${lineNum} bypasses Rust's memory safety guarantees. This block requires manual scrutiny to ensure it doesn't introduce memory safety issues (buffer overflows, use-after-free, etc.).`,
           fix: `Isolate and minimize the unsafe block. Provide a safe API boundary around it, and add a comment explaining the safety preconditions.`,
           before: codeCtx(lines, lineNum),
           after: `  // SAFETY: Explain exactly why this unsafe block is actually safe\n` + codeCtx(lines, lineNum),
         });
      }

      // command injection
      if (/Command::new\s*\(/.test(line) && /format!/.test(lines[i-1] || "") || /Command::new\s*\(/.test(line) && /format!/.test(line) && /sh/.test(line)) {
          findings.push({
            lineNum, severity: "HIGH", category: "security", tool: "clippy", ruleId: "command-injection",
            message: "Running system command from formatted string (Potential Command Injection)",
            explanation: `Building a shell command with a dynamically formatted string can lead to command injection if user inputs are present.`,
            fix: `Use \`Command::new("prog").arg("arg1").arg("arg2")\` rather than executing \`sh -c format!("…")\`.`,
            before: codeCtx(lines, lineNum),
            after: `  // Pass arguments via .arg() rather than string formatting`,
          });
      }

      // Generic secret scan
      const secretF = checkAnySecret(line, lineNum, lines);
      if (secretF) findings.push(secretF);
    }

    return findings;
}

// ─── C/C++ rules ───────────────────────────────────────────────────────────

function checkCRules(lines: string[]): Finding[] {
    const findings: Finding[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line    = lines[i];
        const lineNum = i + 1;
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;

        // strcpy / sprintf / gets (buffer overflows)
        if (/\b(?:strcpy|sprintf|gets|strcat)\s*\(/.test(line)) {
            findings.push({
              lineNum, severity: "HIGH", category: "security", tool: "flawfinder", ruleId: "buffer-overflow-func",
              message: "Dangerous unbounded string function used",
              explanation: `The use of \`strcpy\`, \`sprintf\`, \`gets\`, or \`strcat\` on line ${lineNum} does not check the bounds of the destination buffer, leading to classic buffer overflow vulnerabilities.`,
              fix: `Use bounded alternatives like \`strncpy\`, \`snprintf\`, \`fgets\`, or \`strncat\`. In C++, use \`std::string\`.`,
              before: codeCtx(lines, lineNum),
              after: codeCtx(lines, lineNum).replace(/\bstrcpy\b/, "strncpy").replace(/\bsprintf\b/, "snprintf"),
            });
        }

        // system()
        if (/\bsystem\s*\(/.test(line)) {
            findings.push({
              lineNum, severity: "HIGH", category: "security", tool: "flawfinder", ruleId: "system-call",
              message: "system() execution — prone to command injection",
              explanation: `Using \`system()\` passes the string to \`/bin/sh\`. If any part of the string comes from an untrusted source, it allows arbitrary command execution.`,
              fix: `Use \`execve()\` / \`execvp()\` directly instead, which allows passing arguments as arrays without shell interpretation.`,
              before: codeCtx(lines, lineNum),
              after: `  // Replace system() with execve() / execvp()`,
            });
        }

        // Generic secret scan
        const secretF = checkAnySecret(line, lineNum, lines);
        if (secretF) findings.push(secretF);
    }

    return findings;
}


// ─── Generic text-file scan ────────────────────────────────────────────────

function checkGenericRules(lines: string[]): Finding[] {
  const findings: Finding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const f = checkAnySecret(lines[i], i + 1, lines);
    if (f) findings.push(f);
  }
  return findings;
}

// ─── Dispatch ──────────────────────────────────────────────────────────────

function runRules(lines: string[], cls: FileClass, filePath: string): Finding[] {
  switch (cls) {
    case "dockerfile": return checkDockerfileRules(lines);
    case "shell":      return checkShellRules(lines);
    case "config":     return checkConfigRules(lines, filePath);
    case "ruby":       return checkRubyRules(lines);
    case "php":        return checkPhpRules(lines);
    case "go":         return checkGoRules(lines);
    case "java":       return checkJavaRules(lines);
    case "rust":       return checkRustRules(lines);
    case "c":          return checkCRules(lines);
    default:           return checkGenericRules(lines);
  }
}

// ─── Main export ───────────────────────────────────────────────────────────

export function analyzeGenericFile(
  content: string,
  filePath: string,
  scanId: number,
  startId: number
): Issue[] {
  const lines   = content.split("\n");
  const cls     = classifyFile(filePath);
  const raw     = runRules(lines, cls, filePath);

  // Sort HIGH → MEDIUM → LOW
  const ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  raw.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  return raw.slice(0, 25).map((f, i) => ({
    id: startId + i,
    scan_id: scanId,
    file_path: filePath,
    line_number: f.lineNum,
    severity: f.severity,
    category: f.category,
    tool: f.tool,
    message: f.message,
    rule_id: f.ruleId,
    ai_explanation: f.explanation,
    suggested_fix: f.fix,
    before_code: f.before,
    after_code: f.after,
    created_at: new Date().toISOString(),
  }));
}
