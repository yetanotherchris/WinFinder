import React from "react";
import type { EntryKind } from "../types";

interface FileIconProps {
  name: string;
  isDir: boolean;
  entryKind: EntryKind;
  extension: string | null;
  iconDataUrl: string | null;
  isLocked?: boolean;
  size?: number;
}

function getFolderBadge(name: string): "desktop" | "documents" | "downloads" | "pictures" | "music" | "videos" | null {
  const lower = name.toLowerCase();
  if (lower === "desktop") return "desktop";
  if (lower === "documents") return "documents";
  if (lower === "downloads") return "downloads";
  if (lower === "pictures" || lower === "photos") return "pictures";
  if (lower === "music") return "music";
  if (lower === "videos" || lower === "movies") return "videos";
  return null;
}

function getFileCategory(ext: string | null): { label: string; accent: string } {
  if (!ext) return { label: "", accent: "#8E8E93" };
  const e = ext.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "heic"].includes(e)) {
    return { label: e.toUpperCase().slice(0, 4), accent: "#34C759" };
  }
  if (e === "pdf") {
    return { label: "PDF", accent: "#FF3B30" };
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(e)) {
    return { label: e.toUpperCase().slice(0, 4), accent: "#AF52DE" };
  }
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(e)) {
    return { label: e.toUpperCase().slice(0, 4), accent: "#FF2D55" };
  }
  if (["mp4", "mov", "mkv", "avi", "webm"].includes(e)) {
    return { label: e.toUpperCase().slice(0, 4), accent: "#5856D6" };
  }
  if (["ts", "tsx", "js", "jsx", "rs", "py", "go", "c", "cpp", "h", "json", "toml", "yaml", "yml", "html", "css", "sh", "ps1"].includes(e)) {
    return { label: e.toUpperCase().slice(0, 4), accent: "#007AFF" };
  }
  if (["md", "txt", "doc", "docx", "rtf"].includes(e)) {
    return { label: e.toUpperCase().slice(0, 4), accent: "#5AC8FA" };
  }
  return { label: e.toUpperCase().slice(0, 4), accent: "#8E8E93" };
}

export const FileIcon: React.FC<FileIconProps> = ({
  name,
  isDir,
  entryKind,
  extension,
  iconDataUrl,
  isLocked = false,
  size = 62,
}) => {
  const uid = React.useId().replace(/:/g, "");

  if (iconDataUrl) {
    const imgSize = Math.max(16, Math.round(size * 0.84));
    return (
      <img
        src={iconDataUrl}
        alt=""
        className="finder-app-icon-img"
        style={{ width: imgSize, height: imgSize }}
        draggable={false}
      />
    );
  }

  if (entryKind === "drive") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="finder-svg-icon"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`drive-top-${uid}`} x1="32" y1="14" x2="32" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ECEEF1" />
            <stop offset="100%" stopColor="#CFD4DC" />
          </linearGradient>
          <linearGradient id={`drive-front-${uid}`} x1="32" y1="40" x2="32" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#B8BFC9" />
            <stop offset="100%" stopColor="#949CA8" />
          </linearGradient>
          <filter id={`drive-shadow-${uid}`} x="4" y="12" width="56" height="44" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.18" />
          </filter>
        </defs>
        <g filter={`url(#drive-shadow-${uid})`}>
          <path
            d="M14 17.5C14 15.6 15.6 14 17.5 14H46.5C48.4 14 50 15.6 50 17.5L55 41.5H9L14 17.5Z"
            fill={`url(#drive-top-${uid})`}
          />
          <rect x="9" y="39.5" width="46" height="12" rx="4" fill={`url(#drive-front-${uid})`} />
          <path d="M12 40.2H52" stroke="rgba(255,255,255,0.65)" strokeWidth="1" />
          <circle cx="46.5" cy="45.5" r="2" fill={isLocked ? "#FF9F0A" : "#34C759"} />
          <rect x="15" y="44.2" width="16" height="2.6" rx="1.3" fill="rgba(0,0,0,0.18)" />
        </g>
        {isLocked && (
          <g>
            <circle cx="48.5" cy="18.5" r="10.5" fill="#F59E0B" stroke="#FFFFFF" strokeWidth="2" />
            <path
              d="M45.2 17.5V15.8C45.2 14.0 46.7 12.6 48.5 12.6C50.3 12.6 51.8 14.0 51.8 15.8V17.5"
              stroke="#FFFFFF"
              strokeWidth="1.9"
              strokeLinecap="round"
              fill="none"
            />
            <rect x="43.8" y="17.3" width="9.4" height="6.8" rx="1.8" fill="#FFFFFF" />
          </g>
        )}
      </svg>
    );
  }

  if (entryKind === "app") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="finder-svg-icon"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`app-bg-${uid}`} x1="32" y1="8" x2="32" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60B8FF" />
            <stop offset="100%" stopColor="#0A7AFF" />
          </linearGradient>
          <filter id={`app-shadow-${uid}`} x="4" y="6" width="56" height="56" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#003B80" floodOpacity="0.22" />
          </filter>
        </defs>
        <g filter={`url(#app-shadow-${uid})`}>
          <rect x="8" y="8" width="48" height="48" rx="12" fill={`url(#app-bg-${uid})`} />
          <path
            d="M32 19L43 43H37.8L35.4 37.5H28.6L26.2 43H21L32 19ZM32 26.2L29.9 33H34.1L32 26.2Z"
            fill="#FFFFFF"
          />
        </g>
      </svg>
    );
  }

  if (isDir) {
    const badge = getFolderBadge(name);
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="finder-svg-icon"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`folder-back-${uid}`} x1="32" y1="10" x2="32" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#65BDF9" />
            <stop offset="100%" stopColor="#43A4F2" />
          </linearGradient>
          <linearGradient id={`folder-front-${uid}`} x1="32" y1="19" x2="32" y2="54" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7AD0FF" />
            <stop offset="14%" stopColor="#5BBDFB" />
            <stop offset="100%" stopColor="#2A95EB" />
          </linearGradient>
          <filter id={`folder-shadow-${uid}`} x="2" y="10" width="60" height="50" filterUnits="userSpaceOnUse">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.4" floodColor="#0B3B66" floodOpacity="0.18" />
          </filter>
        </defs>

        <g filter={`url(#folder-shadow-${uid})`}>
          <path
            d="M6 15.5C6 12.7386 8.23858 10.5 11 10.5H23.1716C24.4977 10.5 25.7694 11.0268 26.7071 11.9645L29.2426 14.5C29.7115 14.9688 30.3474 15.2322 31.0104 15.2322H53C55.7614 15.2322 58 17.4708 58 20.2322V25H6V15.5Z"
            fill={`url(#folder-back-${uid})`}
          />
          <rect
            x="5"
            y="18.5"
            width="54"
            height="35.5"
            rx="5.5"
            fill={`url(#folder-front-${uid})`}
          />
          <path
            d="M10.5 19.25H53.5"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth="1"
            strokeLinecap="round"
          />
          <path
            d="M6.5 50.5C7.6 52.4 9.5 53.5 11.5 53.5H52.5C54.5 53.5 56.4 52.4 57.5 50.5"
            stroke="rgba(12, 74, 134, 0.22)"
            strokeWidth="1"
          />
        </g>

        {badge === "downloads" && (
          <g stroke="rgba(16, 86, 152, 0.36)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="32" cy="36.5" r="8.5" fill="none" />
            <path d="M32 32.5V40.5M28.8 37.5L32 40.7L35.2 37.5" />
          </g>
        )}
        {badge === "documents" && (
          <g stroke="rgba(16, 86, 152, 0.36)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M26.5 29H34L38 33V44H26.5V29Z" fill="none" />
            <path d="M29.5 36H35M29.5 39.5H35" />
          </g>
        )}
        {badge === "desktop" && (
          <g stroke="rgba(16, 86, 152, 0.36)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="24" y="30" width="16" height="11" rx="1.8" fill="none" />
            <path d="M29 44H35M32 41V44" />
          </g>
        )}
        {badge === "pictures" && (
          <g stroke="rgba(16, 86, 152, 0.36)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="24" y="30" width="16" height="12.5" rx="2" fill="none" />
            <circle cx="28.5" cy="34.5" r="1.2" fill="rgba(16, 86, 152, 0.36)" stroke="none" />
            <path d="M25.5 41L29.5 37L32.5 39.5L35.5 36L39 41" />
          </g>
        )}
        {badge === "music" && (
          <g stroke="rgba(16, 86, 152, 0.36)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M29 40.5V31.5L37 30V39" />
            <circle cx="27" cy="40.5" r="2" fill="none" />
            <circle cx="35" cy="39" r="2" fill="none" />
          </g>
        )}
        {badge === "videos" && (
          <g stroke="rgba(16, 86, 152, 0.36)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="24" y="30.5" width="16" height="12" rx="2" fill="none" />
            <path d="M30.5 34L35 36.5L30.5 39V34Z" fill="rgba(16, 86, 152, 0.32)" />
          </g>
        )}
      </svg>
    );
  }

  const { label, accent } = getFileCategory(extension);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="finder-svg-icon"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`doc-bg-${uid}`} x1="32" y1="8" x2="32" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F3F4F6" />
        </linearGradient>
        <filter id={`doc-shadow-${uid}`} x="10" y="6" width="44" height="54" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#000000" floodOpacity="0.14" />
        </filter>
      </defs>

      <g filter={`url(#doc-shadow-${uid})`}>
        <path
          d="M15 10.5C15 9.11929 16.1193 8 17.5 8H38.5L49 18.5V53.5C49 54.8807 47.8807 56 46.5 56H17.5C16.1193 56 15 54.8807 15 53.5V10.5Z"
          fill={`url(#doc-bg-${uid})`}
          stroke="rgba(0, 0, 0, 0.1)"
          strokeWidth="1"
        />
        <path
          d="M38.5 8V16.5C38.5 17.6046 39.3954 18.5 40.5 18.5H49L38.5 8Z"
          fill="#E5E7EB"
        />
        <path
          d="M38.5 8V16.5C38.5 17.6046 39.3954 18.5 40.5 18.5H49"
          stroke="rgba(0, 0, 0, 0.08)"
          strokeWidth="0.9"
        />
      </g>

      <rect x="21" y="24" width="16" height="2" rx="1" fill="#D1D5DB" />
      <rect x="21" y="29" width="22" height="2" rx="1" fill="#D1D5DB" />
      <rect x="21" y="34" width="18" height="2" rx="1" fill="#E5E7EB" />

      {label && (
        <g>
          <rect x="19" y="40.5" width="26" height="10.5" rx="3" fill={accent} />
          <text
            x="32"
            y="48"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="7.2"
            fontWeight="700"
            fontFamily="-apple-system, BlinkMacSystemFont, Inter, sans-serif"
            letterSpacing="0.3"
          >
            {label}
          </text>
        </g>
      )}
    </svg>
  );
};
