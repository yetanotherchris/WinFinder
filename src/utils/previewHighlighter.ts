import type { FileEntry } from "../types";

export type PreviewKind =
  | "image"
  | "video"
  | "pdf"
  | "html"
  | "markdown"
  | "code"
  | "text"
  | "none";

export type CodeLangFamily =
  | "clike"
  | "python"
  | "xml"
  | "json"
  | "css"
  | "yaml"
  | "ini"
  | "sql"
  | "shell"
  | "batch"
  | "plain";

export interface PreviewClassification {
  kind: PreviewKind;
  langFamily: CodeLangFamily;
  langLabel: string;
}

const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
]);

const VIDEO_EXTS = new Set([
  "mp4",
  "webm",
  "mov",
  "mkv",
  "ogg",
  "ogv",
  "m4v",
]);

const HTML_EXTS = new Set(["html", "htm"]);
const MARKDOWN_EXTS = new Set(["md", "markdown", "mdx"]);

const CODE_EXT_MAP: Record<string, { family: CodeLangFamily; label: string }> = {
  ts: { family: "clike", label: "TypeScript" },
  tsx: { family: "clike", label: "TSX" },
  js: { family: "clike", label: "JavaScript" },
  jsx: { family: "clike", label: "JSX" },
  mjs: { family: "clike", label: "JavaScript" },
  cjs: { family: "clike", label: "JavaScript" },
  rs: { family: "clike", label: "Rust" },
  py: { family: "python", label: "Python" },
  pyw: { family: "python", label: "Python" },
  cs: { family: "clike", label: "C#" },
  csproj: { family: "xml", label: "C# Project" },
  vbproj: { family: "xml", label: "VB Project" },
  fsproj: { family: "xml", label: "F# Project" },
  props: { family: "xml", label: "MSBuild Props" },
  targets: { family: "xml", label: "MSBuild Targets" },
  nuspec: { family: "xml", label: "NuSpec" },
  resx: { family: "xml", label: "Resource XML" },
  sln: { family: "ini", label: "Solution" },
  vb: { family: "clike", label: "Visual Basic" },
  fs: { family: "clike", label: "F#" },
  fsx: { family: "clike", label: "F# Script" },
  java: { family: "clike", label: "Java" },
  kt: { family: "clike", label: "Kotlin" },
  kts: { family: "clike", label: "Kotlin Script" },
  go: { family: "clike", label: "Go" },
  c: { family: "clike", label: "C" },
  h: { family: "clike", label: "C/C++ Header" },
  cpp: { family: "clike", label: "C++" },
  cc: { family: "clike", label: "C++" },
  cxx: { family: "clike", label: "C++" },
  hpp: { family: "clike", label: "C++ Header" },
  hh: { family: "clike", label: "C++ Header" },
  hxx: { family: "clike", label: "C++ Header" },
  rb: { family: "python", label: "Ruby" },
  php: { family: "clike", label: "PHP" },
  swift: { family: "clike", label: "Swift" },
  dart: { family: "clike", label: "Dart" },
  scala: { family: "clike", label: "Scala" },
  zig: { family: "clike", label: "Zig" },
  sh: { family: "shell", label: "Shell" },
  bash: { family: "shell", label: "Bash" },
  zsh: { family: "shell", label: "Zsh" },
  fish: { family: "shell", label: "Fish" },
  ps1: { family: "shell", label: "PowerShell" },
  psm1: { family: "shell", label: "PowerShell Module" },
  psd1: { family: "shell", label: "PowerShell Data" },
  bat: { family: "batch", label: "Batch" },
  cmd: { family: "batch", label: "Batch" },
  sql: { family: "sql", label: "SQL" },
  json: { family: "json", label: "JSON" },
  jsonc: { family: "json", label: "JSONC" },
  json5: { family: "json", label: "JSON5" },
  yaml: { family: "yaml", label: "YAML" },
  yml: { family: "yaml", label: "YAML" },
  toml: { family: "ini", label: "TOML" },
  xml: { family: "xml", label: "XML" },
  xaml: { family: "xml", label: "XAML" },
  axaml: { family: "xml", label: "Avalonia XAML" },
  plist: { family: "xml", label: "Property List" },
  config: { family: "xml", label: "Config" },
  vue: { family: "xml", label: "Vue" },
  svelte: { family: "xml", label: "Svelte" },
  css: { family: "css", label: "CSS" },
  scss: { family: "css", label: "SCSS" },
  sass: { family: "css", label: "Sass" },
  less: { family: "css", label: "Less" },
  dockerfile: { family: "shell", label: "Dockerfile" },
  ini: { family: "ini", label: "INI" },
  cfg: { family: "ini", label: "Config" },
  conf: { family: "ini", label: "Config" },
  env: { family: "ini", label: "Env" },
  properties: { family: "ini", label: "Properties" },
  reg: { family: "ini", label: "Registry" },
  lua: { family: "python", label: "Lua" },
  r: { family: "python", label: "R" },
  pl: { family: "python", label: "Perl" },
  ex: { family: "python", label: "Elixir" },
  exs: { family: "python", label: "Elixir" },
  graphql: { family: "clike", label: "GraphQL" },
  gql: { family: "clike", label: "GraphQL" },
  proto: { family: "clike", label: "Protobuf" },
  tf: { family: "ini", label: "Terraform" },
  cmake: { family: "shell", label: "CMake" },
  mk: { family: "shell", label: "Makefile" },
  gradle: { family: "clike", label: "Gradle" },
  groovy: { family: "clike", label: "Groovy" },
  diff: { family: "plain", label: "Diff" },
  patch: { family: "plain", label: "Patch" },
};

const CODE_FILENAME_MAP: Record<string, { family: CodeLangFamily; label: string }> = {
  dockerfile: { family: "shell", label: "Dockerfile" },
  makefile: { family: "shell", label: "Makefile" },
  gnumakefile: { family: "shell", label: "Makefile" },
  "cmakelists.txt": { family: "shell", label: "CMake" },
  jenkinsfile: { family: "clike", label: "Jenkinsfile" },
  vagrantfile: { family: "python", label: "Vagrantfile" },
  gemfile: { family: "python", label: "Gemfile" },
  rakefile: { family: "python", label: "Rakefile" },
  ".bashrc": { family: "shell", label: "Bash" },
  ".zshrc": { family: "shell", label: "Zsh" },
  ".bash_profile": { family: "shell", label: "Bash" },
  ".env": { family: "ini", label: "Env" },
  ".env.local": { family: "ini", label: "Env" },
  ".env.development": { family: "ini", label: "Env" },
  ".env.production": { family: "ini", label: "Env" },
  ".env.example": { family: "ini", label: "Env" },
  "cargo.lock": { family: "ini", label: "TOML" },
};

const TEXT_EXTS = new Set([
  "txt",
  "log",
  "csv",
  "tsv",
  "gitignore",
  "gitattributes",
  "gitmodules",
  "editorconfig",
  "dockerignore",
  "npmrc",
  "nvmrc",
  "rst",
  "nfo",
  "asc",
  "tex",
]);

const TEXT_FILENAMES = new Set([
  "license",
  "licence",
  "readme",
  "changelog",
  "contributing",
  "authors",
  "notice",
  "copying",
  "todo",
  "version",
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  ".editorconfig",
  ".dockerignore",
  ".npmrc",
  ".nvmrc",
  ".prettierrc",
  ".eslintrc",
]);

export function classifyPreview(entry: FileEntry): PreviewClassification {
  if (
    entry.isDir ||
    entry.entryKind === "folder" ||
    entry.entryKind === "drive" ||
    entry.entryKind === "app" ||
    entry.path.startsWith("virtual://")
  ) {
    return { kind: "none", langFamily: "plain", langLabel: "" };
  }

  const lowerName = entry.name.toLowerCase();
  const ext = (entry.extension ?? "").toLowerCase();

  if (IMAGE_EXTS.has(ext)) {
    return { kind: "image", langFamily: "plain", langLabel: ext.toUpperCase() };
  }
  if (VIDEO_EXTS.has(ext)) {
    return { kind: "video", langFamily: "plain", langLabel: ext.toUpperCase() };
  }
  if (ext === "pdf") {
    return { kind: "pdf", langFamily: "plain", langLabel: "PDF" };
  }
  if (HTML_EXTS.has(ext)) {
    return { kind: "html", langFamily: "xml", langLabel: "HTML" };
  }
  if (MARKDOWN_EXTS.has(ext)) {
    return { kind: "markdown", langFamily: "plain", langLabel: "Markdown" };
  }

  const byFileName = CODE_FILENAME_MAP[lowerName];
  if (byFileName) {
    return { kind: "code", langFamily: byFileName.family, langLabel: byFileName.label };
  }

  const byExt = CODE_EXT_MAP[ext];
  if (byExt) {
    return { kind: "code", langFamily: byExt.family, langLabel: byExt.label };
  }

  if (TEXT_EXTS.has(ext) || TEXT_FILENAMES.has(lowerName) || lowerName.startsWith(".env.")) {
    return { kind: "text", langFamily: "plain", langLabel: "Plain Text" };
  }

  return { kind: "none", langFamily: "plain", langLabel: "" };
}

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function span(cls: string, text: string): string {
  return `<span class="hl-${cls}">${escapeHtml(text)}</span>`;
}

const CLIKE_KEYWORDS = new Set([
  "abstract", "as", "async", "await", "bool", "boolean", "break", "byte", "case", "catch",
  "char", "class", "const", "continue", "crate", "debugger", "default", "defer", "delegate",
  "delete", "do", "double", "dyn", "else", "enum", "event", "explicit", "export", "extends",
  "extern", "false", "final", "finally", "float", "fn", "for", "foreach", "from", "func",
  "function", "get", "go", "goto", "if", "impl", "implements", "import", "in", "inline",
  "instanceof", "int", "interface", "internal", "is", "let", "lock", "long", "loop", "match",
  "mod", "module", "move", "mut", "namespace", "new", "nil", "null", "object", "of",
  "operator", "out", "override", "package", "params", "private", "protected", "pub", "public",
  "range", "readonly", "record", "ref", "return", "sealed", "select", "self", "Self", "set",
  "short", "signed", "sizeof", "static", "string", "struct", "super", "switch", "template",
  "this", "throw", "throws", "trait", "true", "try", "type", "typedef", "typeof", "uint",
  "unchecked", "undefined", "union", "unsafe", "unsigned", "use", "using", "val", "var",
  "virtual", "void", "volatile", "where", "while", "with", "yield",
  // Rust / C / C# primitives
  "i8", "i16", "i32", "i64", "i128", "isize", "u8", "u16", "u32", "u64", "u128", "usize",
  "f32", "f64", "str", "size_t", "uint8_t", "uint16_t", "uint32_t", "uint64_t", "int32_t",
  "int64_t", "auto", "constexpr", "nullptr", "noexcept",
  // VB / F# extras
  "Dim", "Sub", "End", "Then", "Module", "Imports", "Function", "Class", "Property", "open",
  "rec", "fun", "elif",
]);

const PYTHON_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
  "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
  "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise", "return",
  "try", "while", "with", "yield", "match", "case", "self", "cls",
  // Ruby / Lua / Elixir
  "begin", "do", "end", "ensure", "module", "nil", "rescue", "then", "unless", "until",
  "when", "local", "function", "true", "false", "require", "include", "defmodule", "defp",
]);

const SHELL_KEYWORDS = new Set([
  "if", "then", "else", "elif", "fi", "for", "in", "do", "done", "while", "until", "case",
  "esac", "function", "return", "exit", "export", "local", "readonly", "unset", "shift",
  "echo", "printf", "set", "source", "true", "false", "param", "foreach", "switch", "try",
  "catch", "finally", "throw", "filter", "workflow", "begin", "process", "end",
  // Dockerfile
  "FROM", "RUN", "CMD", "LABEL", "EXPOSE", "ENV", "ADD", "COPY", "ENTRYPOINT", "VOLUME",
  "USER", "WORKDIR", "ARG", "ONBUILD", "STOPSIGNAL", "HEALTHCHECK", "SHELL", "AS",
]);

const SQL_KEYWORDS = new Set([
  "SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE",
  "CREATE", "ALTER", "DROP", "TABLE", "INDEX", "VIEW", "DATABASE", "SCHEMA", "TRIGGER",
  "PROCEDURE", "FUNCTION", "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "OUTER", "CROSS",
  "ON", "AS", "AND", "OR", "NOT", "IN", "IS", "NULL", "LIKE", "ILIKE", "BETWEEN", "EXISTS",
  "CASE", "WHEN", "THEN", "ELSE", "END", "GROUP", "BY", "HAVING", "ORDER", "ASC", "DESC",
  "LIMIT", "OFFSET", "UNION", "ALL", "DISTINCT", "PRIMARY", "KEY", "FOREIGN", "REFERENCES",
  "CONSTRAINT", "DEFAULT", "CHECK", "UNIQUE", "BEGIN", "COMMIT", "ROLLBACK", "TRANSACTION",
  "WITH", "RECURSIVE", "RETURNING", "CAST", "TRUE", "FALSE", "COUNT", "SUM", "AVG", "MIN", "MAX",
]);

const BATCH_KEYWORDS = new Set([
  "ECHO", "OFF", "ON", "SET", "SETLOCAL", "ENDLOCAL", "IF", "ELSE", "EXIST", "NOT", "FOR",
  "IN", "DO", "GOTO", "CALL", "EXIT", "START", "CD", "PUSHD", "POPD", "MKDIR", "MD", "RD",
  "RMDIR", "DEL", "COPY", "XCOPY", "ROBOCOPY", "MOVE", "REN", "RENAME", "TYPE", "PAUSE",
  "SHIFT", "TITLE", "CLS", "ERRORLEVEL", "DEFINED", "EQU", "NEQ", "LSS", "LEQ", "GTR", "GEQ",
]);

const MAX_HIGHLIGHT_CHARS = 120_000;

function highlightXml(code: string): string {
  const re =
    /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/?[A-Za-z_][\w:.-]*|\/?>|&[A-Za-z#][\w]+;|"[^"]*"|'[^']*'|\b[A-Za-z_][\w:.-]*(?=\s*=)/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("<!--")) {
      out += span("comment", tok);
    } else if (tok.startsWith("<?") || tok.startsWith("<!")) {
      out += span("meta", tok);
    } else if (tok.startsWith("</") || tok.startsWith("<")) {
      const prefix = tok.startsWith("</") ? "</" : "<";
      out += span("punct", prefix) + span("tag", tok.slice(prefix.length));
    } else if (tok === ">" || tok === "/>") {
      out += span("punct", tok);
    } else if (tok.startsWith('"') || tok.startsWith("'")) {
      out += span("string", tok);
    } else if (tok.startsWith("&")) {
      out += span("number", tok);
    } else {
      out += span("attr", tok);
    }
    last = re.lastIndex;
  }
  if (last < code.length) out += escapeHtml(code.slice(last));
  return out;
}

function highlightJson(code: string): string {
  const re =
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("//") || tok.startsWith("/*")) {
      out += span("comment", tok);
    } else if (tok.startsWith('"')) {
      const rest = code.slice(re.lastIndex);
      if (/^\s*:/.test(rest)) {
        out += span("attr", tok);
      } else {
        out += span("string", tok);
      }
    } else if (tok === "true" || tok === "false" || tok === "null") {
      out += span("keyword", tok);
    } else {
      out += span("number", tok);
    }
    last = re.lastIndex;
  }
  if (last < code.length) out += escapeHtml(code.slice(last));
  return out;
}

function highlightCss(code: string): string {
  const re =
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@[A-Za-z-]+|#[0-9a-fA-F]{3,8}\b|--[A-Za-z0-9_-]+|\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|s|ms|deg|fr)?\b|[A-Za-z-]+(?=\s*:)/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("/*") || tok.startsWith("//")) {
      out += span("comment", tok);
    } else if (tok.startsWith('"') || tok.startsWith("'")) {
      out += span("string", tok);
    } else if (tok.startsWith("@")) {
      out += span("keyword", tok);
    } else if (tok.startsWith("#") || /^\d/.test(tok)) {
      out += span("number", tok);
    } else if (tok.startsWith("--")) {
      out += span("var", tok);
    } else {
      out += span("attr", tok);
    }
    last = re.lastIndex;
  }
  if (last < code.length) out += escapeHtml(code.slice(last));
  return out;
}

function highlightYaml(code: string): string {
  const re =
    /#[^\n]*|"(?:\\.|[^"\\])*"|'(?:''|[^'])*'|^[ \t]*[A-Za-z0-9_.-]+(?=\s*:)|\b(?:true|false|null|yes|no|~)\b|\b\d+(?:\.\d+)?\b/gm;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("#")) {
      out += span("comment", tok);
    } else if (tok.startsWith('"') || tok.startsWith("'")) {
      out += span("string", tok);
    } else if (/^\s*[A-Za-z0-9_.-]+$/.test(tok) && /^\s*:/.test(code.slice(re.lastIndex))) {
      const lead = tok.match(/^[ \t]*/)?.[0] ?? "";
      out += escapeHtml(lead) + span("attr", tok.slice(lead.length));
    } else if (/^(?:true|false|null|yes|no|~)$/.test(tok)) {
      out += span("keyword", tok);
    } else {
      out += span("number", tok);
    }
    last = re.lastIndex;
  }
  if (last < code.length) out += escapeHtml(code.slice(last));
  return out;
}

function highlightIni(code: string): string {
  const re =
    /^[ \t]*[#;][^\n]*|^[ \t]*\[[^\]]+\]|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|^[ \t]*[A-Za-z0-9_.-]+(?=\s*=)|\b(?:true|false)\b|\b\d+(?:\.\d+)?\b/gm;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));
    const tok = m[0];
    const trimmed = tok.trimStart();
    if (trimmed.startsWith("#") || trimmed.startsWith(";")) {
      out += span("comment", tok);
    } else if (trimmed.startsWith("[")) {
      out += span("tag", tok);
    } else if (tok.startsWith('"') || tok.startsWith("'")) {
      out += span("string", tok);
    } else if (tok === "true" || tok === "false") {
      out += span("keyword", tok);
    } else if (/^\d/.test(tok)) {
      out += span("number", tok);
    } else {
      const lead = tok.match(/^[ \t]*/)?.[0] ?? "";
      out += escapeHtml(lead) + span("attr", tok.slice(lead.length));
    }
    last = re.lastIndex;
  }
  if (last < code.length) out += escapeHtml(code.slice(last));
  return out;
}

function highlightSql(code: string): string {
  const re =
    /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("--") || tok.startsWith("/*")) {
      out += span("comment", tok);
    } else if (tok.startsWith("'") || tok.startsWith('"')) {
      out += span("string", tok);
    } else if (/^\d/.test(tok)) {
      out += span("number", tok);
    } else if (SQL_KEYWORDS.has(tok.toUpperCase())) {
      out += span("keyword", tok);
    } else {
      out += escapeHtml(tok);
    }
    last = re.lastIndex;
  }
  if (last < code.length) out += escapeHtml(code.slice(last));
  return out;
}

function highlightShell(code: string): string {
  const re =
    /#[^\n]*|"(?:\\.|[^"\\])*"|'[^']*'|\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("#")) {
      out += span("comment", tok);
    } else if (tok.startsWith('"') || tok.startsWith("'")) {
      out += span("string", tok);
    } else if (tok.startsWith("$")) {
      out += span("var", tok);
    } else if (/^\d/.test(tok)) {
      out += span("number", tok);
    } else if (SHELL_KEYWORDS.has(tok) || SHELL_KEYWORDS.has(tok.toLowerCase())) {
      out += span("keyword", tok);
    } else {
      out += escapeHtml(tok);
    }
    last = re.lastIndex;
  }
  if (last < code.length) out += escapeHtml(code.slice(last));
  return out;
}

function highlightBatch(code: string): string {
  const re =
    /^[ \t]*(?:REM\b|::)[^\n]*|"(?:""|[^"])*"|%[^%\n]+%|![^!\n]+!|^[ \t]*:[A-Za-z0-9_.-]+|\b[A-Za-z_][A-Za-z0-9_]*\b/gim;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));
    const tok = m[0];
    const trimmed = tok.trimStart();
    if (/^(?:rem\b|::)/i.test(trimmed)) {
      out += span("comment", tok);
    } else if (tok.startsWith('"')) {
      out += span("string", tok);
    } else if (tok.startsWith("%") || tok.startsWith("!")) {
      out += span("var", tok);
    } else if (trimmed.startsWith(":")) {
      out += span("tag", tok);
    } else if (BATCH_KEYWORDS.has(tok.toUpperCase())) {
      out += span("keyword", tok);
    } else {
      out += escapeHtml(tok);
    }
    last = re.lastIndex;
  }
  if (last < code.length) out += escapeHtml(code.slice(last));
  return out;
}

function highlightPythonLike(code: string): string {
  const re =
    /#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|@[A-Za-z_][\w.]*|\b0[xXbBoO][\da-fA-F_]+\b|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("#")) {
      out += span("comment", tok);
    } else if (tok.startsWith('"') || tok.startsWith("'")) {
      out += span("string", tok);
    } else if (tok.startsWith("@")) {
      out += span("meta", tok);
    } else if (/^\d/.test(tok)) {
      out += span("number", tok);
    } else if (PYTHON_KEYWORDS.has(tok)) {
      out += span("keyword", tok);
    } else if (/^[A-Z][A-Za-z0-9_]*$/.test(tok)) {
      out += span("type", tok);
    } else if (code[re.lastIndex] === "(") {
      out += span("func", tok);
    } else {
      out += escapeHtml(tok);
    }
    last = re.lastIndex;
  }
  if (last < code.length) out += escapeHtml(code.slice(last));
  return out;
}

function highlightCLike(code: string): string {
  const re =
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#!?\[[^\]]*\]|@[A-Za-z_][\w.]*|^[ \t]*#[A-Za-z_]+|\b0[xXbBoO][\da-fA-F_]+\b|\b\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b/gm;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) out += escapeHtml(code.slice(last, m.index));
    const tok = m[0];
    const trimmed = tok.trimStart();
    if (tok.startsWith("//") || tok.startsWith("/*")) {
      out += span("comment", tok);
    } else if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith("`")) {
      out += span("string", tok);
    } else if (trimmed.startsWith("#") || tok.startsWith("@")) {
      out += span("meta", tok);
    } else if (/^\d/.test(tok)) {
      out += span("number", tok);
    } else if (CLIKE_KEYWORDS.has(tok)) {
      out += span("keyword", tok);
    } else if (/^[A-Z][A-Za-z0-9_]*$/.test(tok)) {
      out += span("type", tok);
    } else if (code[re.lastIndex] === "(") {
      out += span("func", tok);
    } else {
      out += escapeHtml(tok);
    }
    last = re.lastIndex;
  }
  if (last < code.length) out += escapeHtml(code.slice(last));
  return out;
}

export function highlightCodeToHtml(code: string, family: CodeLangFamily): string {
  if (family === "plain") {
    return escapeHtml(code);
  }
  const head = code.length > MAX_HIGHLIGHT_CHARS ? code.slice(0, MAX_HIGHLIGHT_CHARS) : code;
  const tail = code.length > MAX_HIGHLIGHT_CHARS ? escapeHtml(code.slice(MAX_HIGHLIGHT_CHARS)) : "";

  let highlighted: string;
  switch (family) {
    case "xml":
      highlighted = highlightXml(head);
      break;
    case "json":
      highlighted = highlightJson(head);
      break;
    case "css":
      highlighted = highlightCss(head);
      break;
    case "yaml":
      highlighted = highlightYaml(head);
      break;
    case "ini":
      highlighted = highlightIni(head);
      break;
    case "sql":
      highlighted = highlightSql(head);
      break;
    case "shell":
      highlighted = highlightShell(head);
      break;
    case "batch":
      highlighted = highlightBatch(head);
      break;
    case "python":
      highlighted = highlightPythonLike(head);
      break;
    case "clike":
    default:
      highlighted = highlightCLike(head);
      break;
  }

  return highlighted + tail;
}

function resolveFenceLangFamily(langHint: string): CodeLangFamily {
  const hint = langHint.trim().toLowerCase();
  if (!hint) return "plain";
  const mapped = CODE_EXT_MAP[hint];
  if (mapped) return mapped.family;
  if (hint === "typescript" || hint === "javascript" || hint === "rust" || hint === "csharp" || hint === "c#") {
    return "clike";
  }
  if (hint === "python" || hint === "ruby") return "python";
  if (hint === "html" || hint === "svg") return "xml";
  if (hint === "shell" || hint === "powershell" || hint === "pwsh") return "shell";
  return "plain";
}

function sanitizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("#")
  ) {
    return escapeHtml(trimmed);
  }
  return null;
}

function renderInlineMarkdown(raw: string): string {
  // First extract inline code spans so their contents aren't formatted
  const codePlaceholders: string[] = [];
  let text = raw.replace(/`([^`]+)`/g, (_m, code: string) => {
    const idx = codePlaceholders.length;
    codePlaceholders.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000CODE${idx}\u0000`;
  });

  text = escapeHtml(text);

  // Images: ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt: string, url: string) => {
    const safe = sanitizeUrl(url);
    if (!safe) return alt;
    return `<img src="${safe}" alt="${alt}" loading="lazy" />`;
  });

  // Links: [label](url)
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const safe = sanitizeUrl(url);
    if (!safe) return label;
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Bold + italic, bold, italic, strikethrough
  text = text.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  text = text.replace(/~~([^~]+)~~/g, "<del>$1</del>");

  // Restore inline code spans
  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_m, idxStr: string) => {
    return codePlaceholders[Number(idxStr)] ?? "";
  });

  return text;
}

function parseTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

export function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // Fenced code block
    const fenceMatch = line.match(/^```([^\s`]*)/);
    if (fenceMatch) {
      const lang = fenceMatch[1] ?? "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      const family = resolveFenceLangFamily(lang);
      const highlighted = highlightCodeToHtml(codeLines.join("\n"), family);
      out.push(`<pre class="md-code-block"><code>${highlighted}</code></pre>`);
      continue;
    }

    // ATX Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^\s*(?:[-*_]\s*){3,}$/.test(line)) {
      out.push("<hr />");
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderMarkdownToHtml(quoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    // GFM Table
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])
    ) {
      const headers = parseTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && !/^\s*$/.test(lines[i])) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      const thead = `<thead><tr>${headers.map((h) => `<th>${renderInlineMarkdown(h)}</th>`).join("")}</tr></thead>`;
      const tbody =
        rows.length > 0
          ? `<tbody>${rows
              .map(
                (r) =>
                  `<tr>${headers
                    .map((_, idx) => `<td>${renderInlineMarkdown(r[idx] ?? "")}</td>`)
                    .join("")}</tr>`
              )
              .join("")}</tbody>`
          : "";
      out.push(`<div class="md-table-wrap"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const rawItem = lines[i].replace(/^\s*[-*+]\s+/, "");
        const taskMatch = rawItem.match(/^\[( |x|X)\]\s+(.*)$/);
        if (taskMatch) {
          const checked = taskMatch[1].toLowerCase() === "x";
          items.push(
            `<li class="md-task-item"><input type="checkbox" disabled ${checked ? "checked" : ""} /><span>${renderInlineMarkdown(taskMatch[2])}</span></li>`
          );
        } else {
          items.push(`<li>${renderInlineMarkdown(rawItem)}</li>`);
        }
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const rawItem = lines[i].replace(/^\s*\d+\.\s+/, "");
        items.push(`<li>${renderInlineMarkdown(rawItem)}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // Paragraph (collect consecutive plain lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !lines[i].startsWith("```") &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*(?:[-*_]\s*){3,}$/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInlineMarkdown(paraLines.join("\n")).replace(/\n/g, "<br />")}</p>`);
  }

  return out.join("\n");
}
