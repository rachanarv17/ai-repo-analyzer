/**
 * JavaScript / TypeScript static analysis engine.
 * Detects real security and quality issues in .js/.ts/.jsx/.tsx files.
 */

import type { Issue, Severity, Category } from "./store";

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function ctxFixed(lines: string[], lineNum: number, replacement: string, pre = 1, post = 1): string {
  const patched = [...lines];
  patched[lineNum - 1] = replacement;
  return ctx(patched, lineNum, pre, post);
}

function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function isTestFile(path: string): boolean {
  return (
    path.includes(".test.") || path.includes(".spec.") ||
    path.includes("__tests__") || path.includes("/test/") ||
    path.includes("/tests/")
  );
}

// ─── Rule: eval() / new Function() ───────────────────────────────────────────

function checkEval(line: string, lineNum: number, lines: string[], path: string): Finding | null {
  if (isComment(line)) return null;
  const m = line.match(/\beval\s*\(/) || line.match(/new\s+Function\s*\(/);
  if (!m) return null;
  const isNewFn = /new\s+Function/.test(line);
  const fixed = line.replace(/\beval\s*\(/, "JSON.parse(").replace(/new\s+Function\s*\(/, "/* REMOVE: new Function( */");
  return {
    lineNum, severity: "HIGH", category: "security", tool: "eslint",
    ruleId: "no-eval",
    message: `${isNewFn ? "new Function()" : "eval()"} — executes arbitrary code from string input`,
    explanation: `\`${isNewFn ? "new Function()" : "eval()"}\` on line ${lineNum} of \`${path.split("/").pop()}\` parses and runs a string as JavaScript. If the string contains any user data, this is remote code execution (RCE).`,
    fix: "For JSON: use `JSON.parse()`. For user expressions: use a safe parser library. Never pass user input to eval().",
    before: ctx(lines, lineNum, 1, 2),
    after: ctxFixed(lines, lineNum, fixed, 1, 2),
  };
}

// ─── Rule: innerHTML assignment ───────────────────────────────────────────────

function checkInnerHTML(line: string, lineNum: number, lines: string[], path: string): Finding | null {
  if (isComment(line)) return null;
  if (/\.innerHTML\s*=(?!=)/.test(line) || /\.outerHTML\s*=(?!=)/.test(line)) {
    const prop = /outerHTML/.test(line) ? "outerHTML" : "innerHTML";
    const fixed = line.replace(/\.(inner|outer)HTML\s*=/, ".textContent =");
    return {
      lineNum, severity: "HIGH", category: "security", tool: "eslint",
      ruleId: "no-inner-html",
      message: `${prop} assignment — XSS vulnerability if value contains user data`,
      explanation: `Assigning to \`.${prop}\` on line ${lineNum} parses the string as HTML. If it contains user-supplied data, attackers can inject \`<script>\` tags or event handlers (Cross-Site Scripting / XSS).`,
      fix: "Use `.textContent =` for plain text. For rich content: sanitize with DOMPurify first: `el.innerHTML = DOMPurify.sanitize(userHtml)`.",
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, fixed),
    };
  }
  return null;
}

// ─── Rule: dangerouslySetInnerHTML ────────────────────────────────────────────

function checkDangerousHTML(line: string, lineNum: number, lines: string[], _path: string): Finding | null {
  if (isComment(line)) return null;
  if (/dangerouslySetInnerHTML/.test(line)) {
    return {
      lineNum, severity: "HIGH", category: "security", tool: "eslint",
      ruleId: "react/no-danger",
      message: "dangerouslySetInnerHTML — XSS risk if HTML comes from user data",
      explanation: `\`dangerouslySetInnerHTML\` on line ${lineNum} bypasses React's XSS protection by directly setting raw HTML. If the \`__html\` value includes user content, attackers can inject malicious scripts.`,
      fix: "Sanitize with DOMPurify: `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}`\nOr render user content as plain text via JSX children.",
      before: ctx(lines, lineNum, 1, 2),
      after: `${line.replace("dangerouslySetInnerHTML={{", "dangerouslySetInnerHTML={{ /* sanitize first */")}\n  // dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}`,
    };
  }
  return null;
}

// ─── Rule: document.write ────────────────────────────────────────────────────

function checkDocumentWrite(line: string, lineNum: number, lines: string[], _path: string): Finding | null {
  if (isComment(line)) return null;
  if (/document\.write\s*\(/.test(line)) {
    return {
      lineNum, severity: "HIGH", category: "security", tool: "eslint",
      ruleId: "no-document-write",
      message: "document.write() — XSS risk and blocks page rendering",
      explanation: `\`document.write()\` on line ${lineNum} injects raw HTML into the DOM and is vulnerable to XSS if user data is included. It also overwrites the entire page if called after load.`,
      fix: "Use `document.createElement()` and `appendChild()` instead, or inject via `textContent`.",
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, line.replace("document.write(", "// REPLACED: use createElement() ")),
    };
  }
  return null;
}

// ─── Rule: hardcoded secret ───────────────────────────────────────────────────

function checkHardcodedSecret(line: string, lineNum: number, lines: string[], _path: string): Finding | null {
  if (isComment(line)) return null;
  const m = line.match(
    /\b(password|passwd|secret|apiKey|api_key|apikey|accessToken|access_token|authToken|auth_token|privateKey|private_key|clientSecret|client_secret)\s*[:=]\s*['"`]([^'"`\s]{4,})['"`]/i
  );
  if (!m) return null;
  const varName = m[1];
  const fixed = line.replace(/:\s*['"`][^'"`\s]+['"`]/, `: process.env.${varName.toUpperCase()}`).replace(/=\s*['"`][^'"`\s]+['"`]/, ` = process.env.${varName.toUpperCase()}`);
  return {
    lineNum, severity: "HIGH", category: "security", tool: "eslint",
    ruleId: "no-hardcoded-credentials",
    message: `Possible hardcoded ${varName} — sensitive value in source code`,
    explanation: `A string that looks like a ${varName} is hardcoded on line ${lineNum}. When this file is committed, the credential is exposed to everyone with repo access, including in git history after deletion.`,
    fix: `Load from environment: \`process.env.${varName.toUpperCase()}\`. Store in .env and add to .gitignore. Never commit credentials.`,
    before: ctx(lines, lineNum),
    after: ctxFixed(lines, lineNum, fixed),
  };
}

// ─── Rule: child_process exec/shell ──────────────────────────────────────────

function checkChildProcessExec(line: string, lineNum: number, lines: string[], _path: string): Finding | null {
  if (isComment(line)) return null;
  if (/\b(exec|execSync|spawn|spawnSync)\s*\(/.test(line) && /shell\s*:\s*true/.test(line)) {
    const fixed = line.replace(/,?\s*shell\s*:\s*true/, "");
    return {
      lineNum, severity: "HIGH", category: "security", tool: "eslint",
      ruleId: "security/detect-child-process",
      message: "child_process with shell:true — command injection vulnerability",
      explanation: `\`shell: true\` on line ${lineNum} passes the command through the shell, which processes special characters (; | & \`\`). User input in the command becomes OS command injection.`,
      fix: "Pass an array of arguments and remove `shell: true`:\n`spawn('cmd', ['arg1', 'arg2'], { shell: false })`",
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, fixed),
    };
  }
  if (/\b(exec|execSync)\s*\(`/.test(line) || /\b(exec|execSync)\s*\(\s*[`]/.test(line)) {
    return {
      lineNum, severity: "HIGH", category: "security", tool: "eslint",
      ruleId: "security/detect-child-process",
      message: "exec() with template literal — command injection if string includes user data",
      explanation: `Template literal in \`exec()\` on line ${lineNum} can include variable data. If any variable contains shell metacharacters, this allows arbitrary command execution.`,
      fix: "Use `execFile()` with an argument array instead of `exec()` with a string.\n`execFile('cmd', [arg1], callback)`",
      before: ctx(lines, lineNum, 1, 2),
      after: ctxFixed(lines, lineNum, line.replace(/exec\(`/, "execFile('cmd', [")),
    };
  }
  return null;
}

// ─── Rule: http:// in non-localhost URL ───────────────────────────────────────

function checkHttpUrl(line: string, lineNum: number, lines: string[], path: string): Finding | null {
  if (isComment(line)) return null;
  if (isTestFile(path)) return null;
  const m = line.match(/['"`]http:\/\/(?!localhost|127\.0\.0\.1)([^'"`\s]{4,})['"`]/);
  if (!m) return null;
  const fixed = line.replace(/http:\/\//g, "https://");
  return {
    lineNum, severity: "MEDIUM", category: "security", tool: "eslint",
    ruleId: "no-http-url",
    message: `Plaintext HTTP URL — data transmitted without encryption`,
    explanation: `An \`http://\` URL on line ${lineNum} sends data in plaintext. Network observers (ISPs, Wi-Fi operators) can read and modify the content. Modern browsers may also block mixed content.`,
    fix: "Change to `https://`. For development: use localhost which doesn't require TLS.",
    before: ctx(lines, lineNum),
    after: ctxFixed(lines, lineNum, fixed),
  };
}

// ─── Rule: Math.random() for security ────────────────────────────────────────

function checkMathRandom(line: string, lineNum: number, lines: string[], _path: string): Finding | null {
  if (isComment(line)) return null;
  if (
    /Math\.random\s*\(/.test(line) &&
    /(token|secret|nonce|salt|id|key|password|random|crypto)/i.test(line)
  ) {
    const fixed = line.replace("Math.random()", "crypto.randomUUID()");
    return {
      lineNum, severity: "MEDIUM", category: "security", tool: "eslint",
      ruleId: "security/insecure-random",
      message: "Math.random() for security-sensitive value — not cryptographically secure",
      explanation: `\`Math.random()\` on line ${lineNum} uses a pseudo-random number generator that is predictable. Attackers can reproduce the sequence if they know the seed — dangerous for tokens, salts, and IDs.`,
      fix: "Use `crypto.randomUUID()` for unique IDs or `crypto.getRandomValues()` for random bytes in browsers. In Node.js: `require('crypto').randomBytes(32)`.",
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, fixed),
    };
  }
  return null;
}

// ─── Rule: TypeScript 'any' ──────────────────────────────────────────────────

function checkTypeScriptAny(line: string, lineNum: number, lines: string[], path: string): Finding | null {
  if (isComment(line)) return null;
  if (!path.endsWith(".ts") && !path.endsWith(".tsx")) return null;
  const m = line.match(/:\s*any\b/) || line.match(/as\s+any\b/);
  if (!m) return null;
  return {
    lineNum, severity: "MEDIUM", category: "quality", tool: "typescript",
    ruleId: "@typescript-eslint/no-explicit-any",
    message: "Explicit 'any' type — disables TypeScript's type checking",
    explanation: `The \`any\` type on line ${lineNum} tells TypeScript to skip all type checks for that value. This defeats the purpose of using TypeScript and can hide runtime type errors.`,
    fix: "Use the actual type, or `unknown` if the type is genuinely unknown (forces type narrowing before use).",
    before: ctx(lines, lineNum),
    after: ctxFixed(lines, lineNum, line.replace(/:\s*any\b/, ": unknown").replace(/as\s+any\b/, "as unknown")),
  };
}

// ─── Rule: == instead of === ─────────────────────────────────────────────────

function checkLooseEquality(line: string, lineNum: number, lines: string[], _path: string): Finding | null {
  if (isComment(line)) return null;
  const m = line.match(/[^!=<>]==[^=]|[^!=<>]!=[^=]/);
  if (!m) return null;
  if (/typeof/.test(line.slice(Math.max(0, line.indexOf(m[0]) - 7), line.indexOf(m[0])))) return null;
  const op   = m[0].includes("==") ? "==" : "!=";
  const safe = op === "==" ? "===" : "!==";
  return {
    lineNum, severity: "LOW", category: "quality", tool: "eslint",
    ruleId: "eqeqeq",
    message: `Loose equality '${op}' — use strict '${safe}' instead`,
    explanation: `\`${op}\` on line ${lineNum} performs type coercion before comparing (\`0 == ""\` is \`true\`). This causes subtle bugs that are hard to track down. Strict \`${safe}\` never coerces.`,
    fix: `Replace \`${op}\` with \`${safe}\`. Fix any resulting type errors by explicitly converting types first.`,
    before: ctx(lines, lineNum),
    after: ctxFixed(lines, lineNum, line.replace(/([^!=<>])==([^=])/, `$1===$2`).replace(/([^!=<>])!=([^=])/, `$1!==$2`)),
  };
}

// ─── Rule: var declaration ────────────────────────────────────────────────────

function checkVarDeclaration(line: string, lineNum: number, lines: string[], _path: string): Finding | null {
  if (isComment(line)) return null;
  if (/^\s*var\s+\w/.test(line)) {
    const fixed = line.replace(/\bvar\b/, "const");
    return {
      lineNum, severity: "LOW", category: "quality", tool: "eslint",
      ruleId: "no-var",
      message: "var declaration — use const or let instead",
      explanation: `\`var\` on line ${lineNum} is function-scoped and hoisted, causing confusing behavior in loops and closures. \`let\` and \`const\` are block-scoped and predictable.`,
      fix: "Use `const` for values that don't change, `let` for values that do. Never use `var`.",
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, fixed),
    };
  }
  return null;
}

// ─── Rule: console.log ────────────────────────────────────────────────────────

function checkConsoleLog(line: string, lineNum: number, lines: string[], path: string): Finding | null {
  if (isComment(line)) return null;
  if (isTestFile(path)) return null;
  if (
    /^\s*console\.(log|debug|info|warn|error)\s*\(/.test(line) &&
    !path.includes("debug") && !path.includes("logger") && !path.includes("log")
  ) {
    const level = line.match(/console\.(\w+)/)?.[1] ?? "log";
    const fixed = line.replace(/console\.\w+/, "logger.debug");
    return {
      lineNum, severity: "LOW", category: "quality", tool: "eslint",
      ruleId: "no-console",
      message: `console.${level}() in production code — use a structured logger`,
      explanation: `\`console.${level}()\` on line ${lineNum} cannot be disabled in production, may leak sensitive debug data to users, and doesn't support log levels or centralized collection.`,
      fix: "Use a structured logger like `winston`, `pino`, or `loglevel`. Set `LOG_LEVEL` env var to control output.",
      before: ctx(lines, lineNum),
      after: ctxFixed(lines, lineNum, fixed),
    };
  }
  return null;
}

// ─── Rule: TODO/FIXME ─────────────────────────────────────────────────────────

function checkTodoComment(line: string, lineNum: number, lines: string[], _path: string): Finding | null {
  const m = isComment(line) && line.match(/\b(TODO|FIXME|HACK|XXX)\b/i);
  if (!m) return null;
  const tag  = m[1].toUpperCase();
  const rest = line.replace(/.*?(TODO|FIXME|HACK|XXX)[:\s]*/i, "").trim();
  return {
    lineNum, severity: "LOW", category: "quality", tool: "eslint",
    ruleId: "no-warning-comments",
    message: `${tag}: "${rest.slice(0, 70)}${rest.length > 70 ? "…" : ""}"`,
    explanation: `A \`${tag}\` comment on line ${lineNum} marks unresolved technical debt that tends to get committed and forgotten in main branch.`,
    fix: `Track in your issue tracker and reference: \`// ${tag}: https://github.com/org/repo/issues/NNN\``,
    before: ctx(lines, lineNum),
    after: ctxFixed(lines, lineNum, line.replace(/\b(TODO|FIXME|HACK|XXX)\b/i, `${tag}(GH-???)`)),
  };
}

// ─── Rule: prototype pollution ────────────────────────────────────────────────

function checkPrototypePollution(line: string, lineNum: number, lines: string[], _path: string): Finding | null {
  if (isComment(line)) return null;
  if (/\.__proto__\s*[=[]/i.test(line) || /Object\.assign\s*\(\s*[A-Z][\w.]+\.prototype/.test(line)) {
    return {
      lineNum, severity: "HIGH", category: "security", tool: "eslint",
      ruleId: "security/detect-object-injection",
      message: "__proto__ / prototype mutation — prototype pollution vulnerability",
      explanation: `Mutating \`__proto__\` or \`Object.prototype\` on line ${lineNum} affects all objects in the application. Attackers who control the key being assigned can inject properties into the global prototype chain, bypassing security checks.`,
      fix: "Use `Object.create(null)` for plain dictionaries with no prototype. Never assign to `__proto__`.",
      before: ctx(lines, lineNum, 1, 2),
      after: `  // Use Object.create(null) for prototype-free objects\n  const safeObj = Object.create(null);`,
    };
  }
  return null;
}

// ─── Rule: RegExp from user input (ReDoS) ─────────────────────────────────────

function checkRegexFromInput(line: string, lineNum: number, lines: string[], _path: string): Finding | null {
  if (isComment(line)) return null;
  if (/new\s+RegExp\s*\(\s*(?!['"`])/.test(line) && !/new\s+RegExp\s*\(\s*['"`]/.test(line)) {
    return {
      lineNum, severity: "MEDIUM", category: "security", tool: "eslint",
      ruleId: "security/detect-non-literal-regexp",
      message: "RegExp from non-literal string — ReDoS (Regular Expression Denial of Service) risk",
      explanation: `Creating a \`RegExp\` from a variable on line ${lineNum} may include user input. Crafted inputs with catastrophic backtracking can stall the JavaScript event loop for seconds or minutes.`,
      fix: "Validate/sanitize the pattern before use. Consider libraries like `safe-regex` to check for catastrophic patterns.",
      before: ctx(lines, lineNum),
      after: `  // Validate regex pattern first\n  if (!safeRegex(pattern)) throw new Error('Unsafe regex');\n${line}`,
    };
  }
  return null;
}

// ─── All line-level rules ─────────────────────────────────────────────────────

type LineRule = (line: string, lineNum: number, lines: string[], path: string) => Finding | null;

const LINE_RULES_JS: LineRule[] = [
  checkEval,
  checkInnerHTML,
  checkDangerousHTML,
  checkDocumentWrite,
  checkHardcodedSecret,
  checkChildProcessExec,
  checkHttpUrl,
  checkMathRandom,
  checkPrototypePollution,
  checkRegexFromInput,
  checkTypeScriptAny,
  checkLooseEquality,
  checkVarDeclaration,
  checkConsoleLog,
  checkTodoComment,
];

// ─── File-level rules ─────────────────────────────────────────────────────────

function checkMissingUseStrict(lines: string[], path: string): Finding | null {
  if (path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".mjs")) return null;
  if (path.includes("config") || path.includes("vite") || path.includes("next")) return null;
  const hasStrict = lines.slice(0, 5).some((l) => /['"]use strict['"]/.test(l));
  const hasImport = lines.slice(0, 10).some((l) => /^import\s/.test(l));
  if (!hasStrict && !hasImport && lines.length > 20) {
    return {
      lineNum: 1, severity: "LOW", category: "quality", tool: "eslint",
      ruleId: "strict",
      message: "Missing 'use strict' directive in non-module JS file",
      explanation: "Without 'use strict', JavaScript allows many silent errors like implicit globals, duplicate properties, and deleting variables.",
      fix: "Add `'use strict';` as the first statement, or convert to ES modules (import/export).",
      before: lines.slice(0, 3).map((l, i) => `   ${i + 1} │ ${l}`).join("\n"),
      after: `   1 │ 'use strict';\n${lines.slice(0, 3).map((l, i) => `   ${i + 2} │ ${l}`).join("\n")}`,
    };
  }
  return null;
}

// ─── Main JS/TS file analysis ─────────────────────────────────────────────────

export function analyzeJSFile(
  content: string,
  filePath: string,
  scanId: number,
  startId: number
): Issue[] {
  const lines     = content.split("\n");
  const findings: Finding[] = [];
  const seenLines = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line    = lines[i];
    const lineNum = i + 1;
    if (line.length > 10_000) continue;

    for (const rule of LINE_RULES_JS) {
      const f = rule(line, lineNum, lines, filePath);
      if (f && !seenLines.has(lineNum)) {
        findings.push(f);
        seenLines.add(lineNum);
        break;
      }
    }
  }

  const strict = checkMissingUseStrict(lines, filePath);
  if (strict) findings.push(strict);

  const ORDER: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

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
