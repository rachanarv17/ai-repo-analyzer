/**
 * Python static analysis engine — runs entirely in Node.js.
 * Uses simple arrays (no generators) for maximum compatibility.
 * Shows ACTUAL code context with line numbers in every finding.
 */

import type { Issue, Severity, Category } from "./store";
import { checkDependencies } from "./cvelist";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Code context helpers ─────────────────────────────────────────────────────

/** Extract real code with ► annotation for the flagged line */
function ctx(lines: string[], lineNum: number, pre = 1, post = 1): string {
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

/** Apply a string replacement to a line and return the new context */
function ctxFixed(
  lines: string[],
  lineNum: number,
  replacement: string,
  pre = 1,
  post = 1
): string {
  const patched = [...lines];
  patched[lineNum - 1] = replacement;
  return ctx(patched, lineNum, pre, post);
}

function isComment(line: string): boolean {
  return /^\s*#/.test(line);
}

// ─── Rule: Hardcoded password/secret ─────────────────────────────────────────

function checkHardcodedSecret(
  line: string, lineNum: number, lines: string[], _path: string
): Finding | null {
  if (isComment(line)) return null;
  const m = line.match(
    /\b(password|passwd|pwd|secret_key|api_key|apikey|access_token|auth_token|private_key|secret)\s*=\s*['"]([^'"]{3,})['"]/i
  );
  if (!m) return null;
  const varName = m[1];
  const fixed   = line.replace(/=\s*['"][^'"]+['"]/, `= os.environ.get("${varName.toUpperCase()}", "")`);
  return {
    lineNum,
    severity: "HIGH",
    category: "security",
    tool: "bandit",
    ruleId: "B105",
    message: `Possible hardcoded ${varName} — sensitive string literal in source code`,
    explanation:
      `The variable \`${varName}\` on line ${lineNum} is assigned a hardcoded string value. ` +
      `If this file is committed to version control, the credential is exposed to everyone ` +
      `with repo access — including in git history even after deletion.`,
    fix:
      `Load from environment variable:\n` +
      `\`import os\n${varName} = os.environ.get("${varName.toUpperCase()}")\`\n` +
      `Store actual values in a .env file and add it to .gitignore.`,
    before: ctx(lines, lineNum),
    after: ctxFixed(lines, lineNum, fixed),
  };
}

// ─── Rule: subprocess shell=True ─────────────────────────────────────────────

function checkSubprocessShell(
  line: string, lineNum: number, lines: string[], _path: string
): Finding | null {
  if (isComment(line)) return null;
  if (
    /subprocess\.(call|run|Popen|check_output|check_call)\s*\(/.test(line) &&
    /shell\s*=\s*True/.test(line)
  ) {
    const fixed = line.replace(/,?\s*shell\s*=\s*True/, "");
    return {
      lineNum,
      severity: "HIGH",
      category: "security",
      tool: "bandit",
      ruleId: "B602",
      message: "subprocess call with shell=True — exposes code to shell injection",
      explanation:
        `\`shell=True\` on line ${lineNum} passes the command to the OS shell, ` +
        `which interprets special characters (; | & $()). If any part of the command ` +
        `string comes from user input, an attacker can inject arbitrary shell commands.`,
      fix: "Pass a list of arguments and remove shell=True:\n`subprocess.run(['cmd', 'arg1'], check=True)`",
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, fixed),
    };
  }
  return null;
}

// ─── Rule: pickle deserialization ────────────────────────────────────────────

function checkPickle(
  line: string, lineNum: number, lines: string[], _path: string
): Finding | null {
  if (isComment(line)) return null;
  if (/\bpickle\.(loads?|Unpickler)\s*\(/.test(line)) {
    return {
      lineNum,
      severity: "HIGH",
      category: "security",
      tool: "bandit",
      ruleId: "B301",
      message: "pickle deserialization — can execute arbitrary code from malicious data",
      explanation:
        `\`pickle.load\` on line ${lineNum} executes arbitrary Python code embedded in the ` +
        `pickled data. Deserializing from untrusted sources (network, uploads, databases) ` +
        `is equivalent to remote code execution.`,
      fix: "For untrusted data use `json.loads()`. If pickle is required for trusted data, sign payloads with HMAC before serializing.",
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, line.replace(/pickle\.loads?\(/, "json.loads(")),
    };
  }
  return null;
}

// ─── Rule: SSL verify=False ───────────────────────────────────────────────────

function checkSSLDisabled(
  line: string, lineNum: number, lines: string[], _path: string
): Finding | null {
  if (isComment(line)) return null;
  if (/verify\s*=\s*False/.test(line)) {
    const fixed = line.replace(/,?\s*verify\s*=\s*False/, "");
    return {
      lineNum,
      severity: "HIGH",
      category: "security",
      tool: "bandit",
      ruleId: "B501",
      message: "SSL certificate verification disabled — vulnerable to MITM attacks",
      explanation:
        `\`verify=False\` on line ${lineNum} strips TLS certificate validation. ` +
        `A network attacker can intercept the connection and silently read or modify all traffic.`,
      fix: "Remove `verify=False`. For custom CA: `verify='/path/to/ca-bundle.crt'`. Never disable in production.",
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, fixed),
    };
  }
  return null;
}

// ─── Rule: Weak hash MD5/SHA1 ─────────────────────────────────────────────────

function checkWeakHash(
  line: string, lineNum: number, lines: string[], _path: string
): Finding | null {
  if (isComment(line)) return null;
  const m = line.match(/hashlib\.(md5|sha1)\s*\(|\.new\s*\(\s*['"]?(md5|sha1)['"]?\s*\)/i);
  if (!m) return null;
  const algo  = (m[1] || m[2] || "md5").toUpperCase();
  const fixed = line.replace(/hashlib\.(md5|sha1)/i, "hashlib.sha256").replace(/['"](md5|sha1)['"]/i, '"sha256"');
  return {
    lineNum,
    severity: "HIGH",
    category: "security",
    tool: "bandit",
    ruleId: "B303",
    message: `Weak cryptographic hash: ${algo} — broken against collision attacks`,
    explanation:
      `${algo} on line ${lineNum} has known collision vulnerabilities — two different ` +
      `inputs can produce the same hash. It is blacklisted in FIPS 140-2 and most security standards.`,
    fix: "Use SHA-256: `hashlib.sha256()`. For passwords: `bcrypt`, `argon2-cffi`, or `hashlib.scrypt`.",
    before: ctx(lines, lineNum),
    after: ctxFixed(lines, lineNum, fixed),
  };
}

// ─── Rule: eval() ────────────────────────────────────────────────────────────

function checkEval(
  line: string, lineNum: number, lines: string[], path: string
): Finding | null {
  if (isComment(line)) return null;
  if (/\beval\s*\(/.test(line)) {
    return {
      lineNum,
      severity: "HIGH",
      category: "security",
      tool: "bandit",
      ruleId: "B307",
      message: "Use of eval() — executes arbitrary code from string input",
      explanation:
        `\`eval()\` on line ${lineNum} of \`${path.split("/").pop()}\` executes any Python ` +
        `expression in string form. If the string involves user input, this is remote code execution.`,
      fix: "Use `ast.literal_eval()` for safe evaluation of Python literals. For user queries, use a proper parser.",
      before: ctx(lines, lineNum, 1, 2),
      after: ctxFixed(lines, lineNum, line.replace(/\beval\b/, "ast.literal_eval"), 1, 2),
    };
  }
  return null;
}

// ─── Rule: yaml.load without Loader ──────────────────────────────────────────

function checkYamlLoad(
  line: string, lineNum: number, lines: string[], _path: string
): Finding | null {
  if (isComment(line)) return null;
  if (
    /\byaml\.load\s*\(/.test(line) &&
    !/Loader\s*=/.test(line) &&
    !/safe_load/.test(line)
  ) {
    const fixed = line.replace("yaml.load(", "yaml.safe_load(");
    return {
      lineNum,
      severity: "HIGH",
      category: "security",
      tool: "bandit",
      ruleId: "B506",
      message: "yaml.load() without Loader — arbitrary code execution via crafted YAML",
      explanation:
        `\`yaml.load()\` on line ${lineNum} without a Loader can execute Python code ` +
        `embedded in YAML (e.g., \`!!python/object/apply\`). Any YAML from untrusted sources becomes RCE.`,
      fix: "Always use `yaml.safe_load()` for external data.",
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, fixed),
    };
  }
  return null;
}

// ─── Rule: SQL injection ──────────────────────────────────────────────────────

function checkSQLInjection(
  line: string, lineNum: number, lines: string[], _path: string
): Finding | null {
  if (isComment(line)) return null;
  if (
    /\.execute\s*\(/.test(line) &&
    /f['"]|%[sd]|\.format\s*\(/.test(line) &&
    /SELECT|INSERT|UPDATE|DELETE|WHERE/i.test(line)
  ) {
    return {
      lineNum,
      severity: "HIGH",
      category: "security",
      tool: "bandit",
      ruleId: "B608",
      message: "SQL query built via string formatting — SQL injection risk",
      explanation:
        `Line ${lineNum} constructs a SQL query using string interpolation. If any interpolated ` +
        `value is user-controlled, an attacker can modify the SQL structure — bypassing auth, reading or deleting data.`,
      fix: "Use parameterized queries:\n`cursor.execute('SELECT * FROM t WHERE col = %s', (value,))`",
      before: ctx(lines, lineNum, 2, 1),
      after: `  # Parameterized query (safe):\n  cursor.execute("SELECT ... WHERE col = %s", (value,))`,
    };
  }
  return null;
}

// ─── Rule: os.system() ───────────────────────────────────────────────────────

function checkOsSystem(
  line: string, lineNum: number, lines: string[], _path: string
): Finding | null {
  if (isComment(line)) return null;
  if (/\bos\.system\s*\(/.test(line)) {
    return {
      lineNum,
      severity: "MEDIUM",
      category: "security",
      tool: "bandit",
      ruleId: "B605",
      message: "os.system() call — prefer subprocess for better security and error handling",
      explanation:
        `\`os.system()\` on line ${lineNum} executes commands via the shell with no output capture, ` +
        `error handling, or injection protection.`,
      fix: "Replace with: `subprocess.run(['cmd', 'arg'], check=True, capture_output=True, text=True)`",
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, line.replace(/os\.system\s*\(/, "subprocess.run([")),
    };
  }
  return null;
}

// ─── Rule: Bare except ───────────────────────────────────────────────────────

function checkBareExcept(
  line: string, lineNum: number, lines: string[], _path: string
): Finding | null {
  if (/^\s*except\s*:/.test(line)) {
    const indent = line.match(/^(\s*)/)?.[1] ?? "";
    const fixed  = `${indent}except Exception as e:`;
    return {
      lineNum,
      severity: "MEDIUM",
      category: "quality",
      tool: "pylint",
      ruleId: "W0702",
      message: "Bare 'except:' catches ALL exceptions including SystemExit and KeyboardInterrupt",
      explanation:
        `A bare \`except:\` on line ${lineNum} silently swallows every exception — ` +
        `including \`SystemExit\` and \`KeyboardInterrupt\`. This hides bugs and makes ` +
        `the program impossible to terminate normally.`,
      fix: "Specify exception types: `except (ValueError, RuntimeError) as e:`. Always log the error.",
      before: ctx(lines, lineNum, 2, 2),
      after: ctxFixed(lines, lineNum, fixed, 2, 2),
    };
  }
  return null;
}

// ─── Rule: Wildcard import ────────────────────────────────────────────────────

function checkWildcardImport(
  line: string, lineNum: number, lines: string[], _path: string
): Finding | null {
  if (isComment(line)) return null;
  if (/^\s*from\s+\S+\s+import\s+\*/.test(line)) {
    const mod = line.match(/from\s+(\S+)\s+import/)?.[1] || "module";
    return {
      lineNum,
      severity: "MEDIUM",
      category: "quality",
      tool: "pylint",
      ruleId: "W0401",
      message: `Wildcard import 'from ${mod} import *' — pollutes namespace`,
      explanation:
        `Line ${lineNum} imports every public symbol from \`${mod}\`. This makes it ` +
        `impossible to know where names come from, can shadow built-ins, and breaks static analysis.`,
      fix: `Be explicit: \`from ${mod} import SpecificClass, function_name\``,
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, `from ${mod} import SpecificClass, function_name  # be explicit`),
    };
  }
  return null;
}

// ─── Rule: assert in non-test production code ─────────────────────────────────

function checkAssertValidation(
  line: string, lineNum: number, lines: string[], path: string
): Finding | null {
  if (isComment(line)) return null;
  if (
    /^\s*assert\s+/.test(line) &&
    !path.includes("test") &&
    !path.includes("spec") &&
    // Only flag assert used for validation (not invariants)
    /assert\s+(isinstance|len\s*\(|type\s*\(|.*\s+is\s+not\s+None)/.test(line)
  ) {
    const cond   = line.match(/assert\s+(.+?)(?:,|$)/)?.[1]?.trim() || "condition";
    const indent = line.match(/^(\s*)/)?.[1] ?? "";
    return {
      lineNum,
      severity: "MEDIUM",
      category: "quality",
      tool: "bandit",
      ruleId: "B101",
      message: "assert used for input validation — silently disabled with python -O flag",
      explanation:
        `\`assert\` on line ${lineNum} is used for validation. Python's optimizer (-O flag) ` +
        `strips all assert statements, meaning this check disappears in optimized deployments.`,
      fix: `Replace with explicit raise:\n\`if not (${cond}):\n${indent}    raise ValueError("...")\``,
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, `${indent}if not (${cond}):\n${indent}    raise ValueError(f"Expected: ${cond}")`),
    };
  }
  return null;
}

// ─── Rule: Line too long ──────────────────────────────────────────────────────

function checkLineTooLong(
  line: string, lineNum: number, _lines: string[], path: string
): Finding | null {
  if (
    line.length > 130 &&
    !isComment(line) &&
    !path.endsWith(".txt") &&
    !path.endsWith(".toml") &&
    !path.endsWith(".md")
  ) {
    return {
      lineNum,
      severity: "LOW",
      category: "quality",
      tool: "flake8",
      ruleId: "E501",
      message: `Line too long: ${line.length} characters (max recommended: 99)`,
      explanation:
        `Line ${lineNum} in \`${path.split("/").pop()}\` has ${line.length} characters. ` +
        `Long lines cause horizontal scrolling in terminals, diff views, and code reviews. ` +
        `They often indicate a single expression doing too many things.`,
      fix: "Break at logical boundaries using implicit continuation inside brackets or backslash continuation.",
      before: `  ${lineNum.toString().padStart(4)} │ ${line.slice(0, 100)}… (${line.length} chars)`,
      after:  `  ${lineNum.toString().padStart(4)} │ result = (\n  ${(lineNum + 1).toString().padStart(4)} │     long_expression(arg1, arg2)\n  ${(lineNum + 2).toString().padStart(4)} │ )`,
    };
  }
  return null;
}

// ─── Rule: print() in library code ───────────────────────────────────────────

function checkPrintStatement(
  line: string, lineNum: number, lines: string[], path: string
): Finding | null {
  if (isComment(line)) return null;
  if (
    /^\s*print\s*\(/.test(line) &&
    !path.includes("test") &&
    !path.includes("script") &&
    !path.includes("manage.py") &&
    !path.includes("cli") &&
    !path.includes("__main__") &&
    !path.includes("conftest")
  ) {
    const fixed = line.replace(/\bprint\s*\(/, "logger.debug(");
    return {
      lineNum,
      severity: "LOW",
      category: "quality",
      tool: "pylint",
      ruleId: "T201",
      message: "print() in library code — use the logging module instead",
      explanation:
        `\`print()\` on line ${lineNum} cannot be filtered or redirected without code changes. ` +
        `In library code, \`logging\` gives callers full control over levels and destinations.`,
      fix: "Add `import logging; logger = logging.getLogger(__name__)` and use `logger.debug()` / `logger.info()`.",
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, fixed),
    };
  }
  return null;
}

// ─── Rule: TODO/FIXME/HACK ────────────────────────────────────────────────────

function checkTodoComment(
  line: string, lineNum: number, lines: string[], _path: string
): Finding | null {
  const m = isComment(line) && line.match(/\b(TODO|FIXME|HACK|XXX)\b/i);
  if (!m) return null;
  const tag  = m[1].toUpperCase();
  const rest = line.replace(/.*?(TODO|FIXME|HACK|XXX)[:\s]*/i, "").trim();
  return {
    lineNum,
    severity: "LOW",
    category: "quality",
    tool: "pylint",
    ruleId: "W0511",
    message: `${tag} comment — "${rest.slice(0, 60)}${rest.length > 60 ? "…" : ""}"`,
    explanation:
      `A \`${tag}\` comment on line ${lineNum} marks unresolved technical debt. ` +
      `These accumulate silently in main branch and are easy to forget.`,
    fix: `Track this as a GitHub issue and reference: \`# ${tag}: See https://github.com/org/repo/issues/NNN\``,
    before: ctx(lines, lineNum),
    after: ctxFixed(lines, lineNum, line.replace(/\b(TODO|FIXME|HACK|XXX)\b/i, `${tag}(GH-???)`)),
  };
}

// ─── Rule: global variable ────────────────────────────────────────────────────

function checkGlobalVar(
  line: string, lineNum: number, lines: string[], _path: string
): Finding | null {
  if (isComment(line)) return null;
  if (/^\s*global\s+\w/.test(line)) {
    const varNames = line.replace(/^\s*global\s+/, "").trim();
    return {
      lineNum,
      severity: "LOW",
      category: "quality",
      tool: "pylint",
      ruleId: "W0603",
      message: `Global variable declaration: '${varNames}'`,
      explanation:
        `\`global ${varNames}\` on line ${lineNum} creates mutable shared state that ` +
        `makes functions impure and hard to test. Global state causes subtle ordering-dependent bugs.`,
      fix: "Pass values as parameters and return updated values. For shared config, use a class or dependency injection.",
      before: ctx(lines, lineNum, 2, 3),
      after: `  # Refactor: pass state as parameters\n  def process(${varNames}):\n      ${varNames} = transform(${varNames})\n      return ${varNames}`,
    };
  }
  return null;
}

// ─── All line-level rules ─────────────────────────────────────────────────────

type LineRule = (line: string, lineNum: number, lines: string[], path: string) => Finding | null;

const LINE_RULES: LineRule[] = [
  checkHardcodedSecret,
  checkSubprocessShell,
  checkPickle,
  checkSSLDisabled,
  checkWeakHash,
  checkEval,
  checkYamlLoad,
  checkSQLInjection,
  checkOsSystem,
  checkBareExcept,
  checkWildcardImport,
  checkAssertValidation,
  checkLineTooLong,
  checkPrintStatement,
  checkTodoComment,
  checkGlobalVar,
];

// ─── File-level rules ─────────────────────────────────────────────────────────

/** Check for missing module docstring */
function checkModuleDocstring(lines: string[], path: string): Finding | null {
  if (!path.endsWith(".py")) return null;
  if (lines.length < 15) return null;

  // Find first non-blank, non-comment line
  const firstCode = lines.findIndex((l) => l.trim() && !l.startsWith("#"));
  if (firstCode < 0) return null;

  const firstLine = lines[firstCode] ?? "";
  const hasDocstring =
    /^\s*('''|""")/.test(firstLine) ||
    lines.slice(0, Math.min(4, lines.length)).some((l) => /^\s*('''|""")/.test(l));

  if (!hasDocstring) {
    const preview = lines.slice(0, 3).map((l, i) => `   ${i + 1} │ ${l}`).join("\n");
    const fileName = path.split("/").pop() ?? "module";
    const modName  = fileName.replace(".py", "");
    return {
      lineNum: 1,
      severity: "LOW",
      category: "quality",
      tool: "pylint",
      ruleId: "C0114",
      message: `Missing module docstring in '${fileName}'`,
      explanation:
        `\`${fileName}\` has no module-level docstring. Docstrings are shown by ` +
        `\`help()\`, Sphinx generators, and IDEs. Without them, developers must read the full file to understand its purpose.`,
      fix: `Add as the first non-comment statement:\n"""\n${modName} — Brief description.\n\nUsage examples or key exports here.\n"""`,
      before: preview,
      after: `   1 │ """\n   2 │ ${modName} — description.\n   3 │ """\n${lines.slice(0, 1).map((l) => `   4 │ ${l}`).join("")}`,
    };
  }
  return null;
}

/** Check for functions without docstrings */
function checkMissingDocstrings(lines: string[], path: string): Finding[] {
  if (!path.endsWith(".py")) return [];
  const findings: Finding[] = [];
  let count = 0;

  for (let i = 0; i < lines.length - 1 && count < 2; i++) {
    const line = lines[i];
    const fnMatch = line.match(/^(\s{4,12})def\s+([a-z]\w*)\s*\(/);
    if (!fnMatch) continue;
    const fnName = fnMatch[2];
    if (fnName.startsWith("_")) continue; // skip private/dunder

    // Check next non-blank line for docstring
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    const nextLine = lines[j]?.trimStart() ?? "";
    if (nextLine.startsWith('"""') || nextLine.startsWith("'''")) continue;

    const indent = fnMatch[1];
    findings.push({
      lineNum: i + 1,
      severity: "LOW",
      category: "quality",
      tool: "pylint",
      ruleId: "C0116",
      message: `Missing docstring in method '${fnName}'`,
      explanation:
        `The \`${fnName}\` method in \`${path.split("/").pop()}\` has no docstring. ` +
        `Docstrings enable \`help()\`, IDE autocompletion, and API documentation generation.`,
      fix: `Add as the first line of the method body:\ndef ${fnName}(self, ...):\n    """Brief description.\n\n    Args:\n        param: Description.\n    """\n    ...`,
      before: ctx(lines, i + 1, 0, 3),
      after: `${line}\n${indent}    """Brief description of ${fnName}.\n\n${indent}    Args:\n${indent}        ...: ...\n${indent}    """\n${lines[i + 1] ?? ""}`,
    });
    count++;
  }
  return findings;
}

/** Check for overly long functions */
function checkLongFunctions(lines: string[], path: string): Finding[] {
  if (!path.endsWith(".py")) return [];
  const findings: Finding[] = [];
  let fnStartIdx  = -1;
  let fnName      = "";
  let count       = 0;

  for (let i = 0; i < lines.length && count < 2; i++) {
    const m = lines[i].match(/^def\s+(\w+)\s*\(/);
    if (!m) continue;

    if (fnStartIdx >= 0 && fnName && !fnName.startsWith("__")) {
      const len = i - fnStartIdx;
      if (len > 55) {
        findings.push({
          lineNum: fnStartIdx + 1,
          severity: "MEDIUM",
          category: "quality",
          tool: "pylint",
          ruleId: "R0915",
          message: `Function '${fnName}' is too long: ${len} lines (limit: 50)`,
          explanation:
            `\`${fnName}\` in \`${path.split("/").pop()}\` spans ${len} lines — ` +
            `well above the recommended 50 line maximum. Long functions accumulate multiple ` +
            `responsibilities and become hard to test and maintain individually.`,
          fix: "Extract logical sub-steps into smaller, named helper functions. Each should do exactly one thing.",
          before: ctx(lines, fnStartIdx + 1, 0, 2),
          after:
            `def ${fnName}(...):\n` +
            `    result = _${fnName}_prepare(...)\n` +
            `    result = _${fnName}_process(result)\n` +
            `    return _${fnName}_format(result)\n\n` +
            `def _${fnName}_prepare(...):\n    ...\n\n` +
            `def _${fnName}_process(...):\n    ...`,
        });
        count++;
      }
    }
    fnStartIdx = i;
    fnName     = m[1];
  }
  return findings;
}

// ─── Dependency analysis ──────────────────────────────────────────────────────

export function analyzeDepFile(
  content: string,
  filePath: string,
  scanId: number,
  startId: number
): Issue[] {
  const matches = checkDependencies(content);
  const lines   = content.split("\n");

  return matches.map((m, i) => {
    const pkgLower  = m.package.replace(/_/g, "-");
    const lineIdx   = lines.findIndex((l) =>
      l.toLowerCase().includes(pkgLower) ||
      l.toLowerCase().includes(m.package.toLowerCase())
    );
    const lineNum   = lineIdx >= 0 ? lineIdx + 1 : null;

    const before = lineNum
      ? ctx(lines, lineNum, 1, 1)
      : `  ${filePath.split("/").pop()} │ ${m.package}==${m.installedVersion}`;

    const afterLine = lineNum
      ? lines[lineIdx].replace(`==${m.installedVersion}`, `>=${m.cve.lt}  # patched`)
      : `${m.package}>=${m.cve.lt}  # patched`;

    const after = lineNum
      ? ctxFixed(lines, lineNum, afterLine, 1, 1)
      : `  ${afterLine}`;

    return {
      id: startId + i,
      scan_id: scanId,
      file_path: filePath,
      line_number: lineNum,
      severity: m.cve.severity,
      category: "dependency" as Category,
      tool: "pip-audit",
      message: `${m.package}==${m.installedVersion} — ${m.cve.cve}: ${m.cve.summary}`,
      rule_id: m.cve.cve,
      ai_explanation: m.cve.explanation,
      suggested_fix: m.cve.fix,
      before_code: before,
      after_code: after,
      created_at: new Date().toISOString(),
    };
  });
}

// ─── Main Python file analysis ─────────────────────────────────────────────────

export function analyzePythonFile(
  content: string,
  filePath: string,
  scanId: number,
  startId: number
): Issue[] {
  const lines    = content.split("\n");
  const findings: Finding[] = [];
  const seenLines = new Set<number>(); // one finding per line

  // Run line-level rules
  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const lineNum = i + 1;

    // Skip overly long single lines (likely generated/minified)
    if (line.length > 10_000) continue;

    for (const rule of LINE_RULES) {
      const f = rule(line, lineNum, lines, filePath);
      if (f && !seenLines.has(lineNum)) {
        findings.push(f);
        seenLines.add(lineNum);
        break; // one finding per line — highest-priority rule wins
      }
    }
  }

  // File-level rules
  const modDoc = checkModuleDocstring(lines, filePath);
  if (modDoc) findings.push(modDoc);
  findings.push(...checkMissingDocstrings(lines, filePath));
  findings.push(...checkLongFunctions(lines, filePath));

  // Sort: HIGH → MEDIUM → LOW
  const ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  // Cap at 20 per file
  return findings.slice(0, 20).map((f, i) => ({
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
