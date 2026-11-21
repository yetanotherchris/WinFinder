import type { FileEntry, SortConfig } from "../types";

const EXT_KIND_MAP: Record<string, string> = {
  png: "PNG Image",
  jpg: "JPEG Image",
  jpeg: "JPEG Image",
  gif: "GIF Image",
  webp: "WebP Image",
  svg: "SVG Image",
  bmp: "BMP Image",
  ico: "Icon File",
  heic: "HEIC Image",
  pdf: "PDF Document",
  md: "Markdown Document",
  txt: "Plain Text Document",
  rtf: "Rich Text Document",
  doc: "Word Document",
  docx: "Word Document",
  xls: "Excel Spreadsheet",
  xlsx: "Excel Spreadsheet",
  csv: "CSV Document",
  ppt: "PowerPoint Presentation",
  pptx: "PowerPoint Presentation",
  zip: "ZIP Archive",
  rar: "RAR Archive",
  "7z": "7-Zip Archive",
  tar: "TAR Archive",
  gz: "GZIP Archive",
  mp3: "MP3 Audio",
  wav: "WAV Audio",
  flac: "FLAC Audio",
  m4a: "MPEG-4 Audio",
  ogg: "OGG Audio",
  mp4: "MPEG-4 Movie",
  mov: "QuickTime Movie",
  mkv: "Matroska Video",
  avi: "AVI Movie",
  webm: "WebM Video",
  ts: "TypeScript Source",
  tsx: "TypeScript JSX",
  js: "JavaScript Source",
  jsx: "JavaScript JSX",
  rs: "Rust Source",
  py: "Python Script",
  go: "Go Source",
  json: "JSON Document",
  toml: "TOML Configuration",
  yaml: "YAML Document",
  yml: "YAML Document",
  html: "HTML Document",
  css: "CSS Stylesheet",
  exe: "Windows Executable",
  msi: "Windows Installer",
  lnk: "Shortcut",
};

export function getKindLabel(entry: FileEntry): string {
  if (entry.entryKind === "drive") return "Volume";
  if (entry.entryKind === "app") return "Application";
  if (entry.isDir) return "Folder";
  if (!entry.extension) return "Document";
  const ext = entry.extension.toLowerCase();
  return EXT_KIND_MAP[ext] ?? `${ext.toUpperCase()} File`;
}

export function formatFileSize(entry: FileEntry): string {
  if (entry.isDir || entry.entryKind === "app" || entry.entryKind === "drive") {
    return "--";
  }
  const bytes = entry.size;
  if (bytes === 0) return "Zero bytes";
  if (bytes < 1024) return `${bytes} bytes`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx++;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, "")} ${units[unitIdx]}`;
}

export function formatDateModified(ms: number | null): string {
  if (!ms) return "--";
  const date = new Date(ms);
  const now = new Date();
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;

  if (ms >= startOfToday) {
    return `Today at ${timeStr}`;
  }
  if (ms >= startOfYesterday) {
    return `Yesterday at ${timeStr}`;
  }
  const dateStr = date.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${dateStr} at ${timeStr}`;
}

export function sortEntries(entries: FileEntry[], sort: SortConfig): FileEntry[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...entries].sort((a, b) => {
    if (sort.foldersFirst && a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1;
    }

    let cmp = 0;
    switch (sort.field) {
      case "name":
        cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        break;
      case "kind":
        cmp = getKindLabel(a).localeCompare(getKindLabel(b), undefined, { sensitivity: "base" });
        break;
      case "dateModified":
        cmp = (a.modifiedMs ?? 0) - (b.modifiedMs ?? 0);
        break;
      case "size":
        cmp = a.size - b.size;
        break;
    }

    if (cmp !== 0) return cmp * dir;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

let measureCanvas: HTMLCanvasElement | null = null;

export function measureTextPx(text: string, font = '12.5px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'): number {
  if (typeof document === "undefined") return text.length * 7.5;
  if (!measureCanvas) {
    measureCanvas = document.createElement("canvas");
  }
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return text.length * 7.5;
  ctx.font = font;
  return Math.ceil(ctx.measureText(text).width);
}
