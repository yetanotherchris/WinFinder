import React, { useEffect, useMemo, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { FileEntry, TextFilePreview } from "../types";
import { formatDateModified, formatFileSize, getKindLabel } from "../utils/format";
import {
  classifyPreview,
  highlightCodeToHtml,
  renderMarkdownToHtml,
} from "../utils/previewHighlighter";
import { FileIcon } from "./FileIcon";

interface FilePreviewProps {
  entry: FileEntry;
  isRenaming: boolean;
  renameInput?: React.ReactNode;
  dragProps?: React.HTMLAttributes<HTMLElement>;
  onClick?: React.MouseEventHandler<HTMLElement>;
  onAuxClick?: React.MouseEventHandler<HTMLElement>;
  onContextMenu?: React.MouseEventHandler<HTMLElement>;
  onDoubleClick?: React.MouseEventHandler<HTMLElement>;
  onOpenExternal: () => void;
}

const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FilePreview: React.FC<FilePreviewProps> = ({
  entry,
  isRenaming,
  renameInput,
  dragProps,
  onClick,
  onAuxClick,
  onContextMenu,
  onDoubleClick,
  onOpenExternal,
}) => {
  const classification = useMemo(() => classifyPreview(entry), [entry]);
  const [textData, setTextData] = useState<TextFilePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const [viewTab, setViewTab] = useState<"rendered" | "source">("rendered");

  const isTextLike =
    classification.kind === "code" ||
    classification.kind === "text" ||
    classification.kind === "markdown" ||
    classification.kind === "html";

  useEffect(() => {
    setMediaError(false);
    setViewTab("rendered");
  }, [entry.path]);

  useEffect(() => {
    if (!isTextLike || !isTauriRuntime()) {
      setTextData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setError(null);
    setTextData(null);

    const spinnerTimer = window.setTimeout(() => {
      if (!cancelled) {
        setLoading(true);
      }
    }, 90);

    invoke<TextFilePreview>("read_file_preview", { path: entry.path })
      .then((res) => {
        if (cancelled) return;
        window.clearTimeout(spinnerTimer);
        setLoading(false);
        setTextData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        window.clearTimeout(spinnerTimer);
        setLoading(false);
        setError(typeof err === "string" ? err : String(err));
      });

    return () => {
      cancelled = true;
      window.clearTimeout(spinnerTimer);
    };
  }, [entry.path, isTextLike]);

  const assetUrl = useMemo(() => {
    if (
      !isTauriRuntime() ||
      (classification.kind !== "image" &&
        classification.kind !== "video" &&
        classification.kind !== "pdf")
    ) {
      return null;
    }
    try {
      return convertFileSrc(entry.path);
    } catch {
      return null;
    }
  }, [entry.path, classification.kind]);

  const highlightedCodeHtml = useMemo(() => {
    if (!textData || textData.isBinary) return "";
    if (
      classification.kind === "code" ||
      (classification.kind === "html" && viewTab === "source")
    ) {
      return highlightCodeToHtml(textData.content, classification.langFamily);
    }
    return "";
  }, [textData, classification.kind, classification.langFamily, viewTab]);

  const renderedMarkdownHtml = useMemo(() => {
    if (!textData || textData.isBinary || classification.kind !== "markdown") return "";
    if (viewTab !== "rendered") return "";
    return renderMarkdownToHtml(textData.content);
  }, [textData, classification.kind, viewTab]);

  const renderFallbackHero = (notice?: string) => (
    <div
      className="gallery-hero"
      {...dragProps}
      onClick={onClick}
      onAuxClick={onAuxClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      <div className="gallery-hero-icon">
        <FileIcon
          name={entry.name}
          isDir={entry.isDir}
          entryKind={entry.entryKind}
          extension={entry.extension}
          iconDataUrl={entry.iconDataUrl}
          isLocked={entry.isLocked}
          size={124}
        />
      </div>
      {isRenaming ? renameInput : <div className="gallery-hero-name">{entry.name}</div>}
      <div className="gallery-hero-meta">
        <span>{getKindLabel(entry)}</span>
        {formatFileSize(entry) !== "--" && (
          <>
            <span className="meta-dot">•</span>
            <span>{formatFileSize(entry)}</span>
          </>
        )}
        {entry.modifiedMs && (
          <>
            <span className="meta-dot">•</span>
            <span>{formatDateModified(entry.modifiedMs)}</span>
          </>
        )}
      </div>
      {notice && <div className="gallery-preview-notice">{notice}</div>}
    </div>
  );

  // Fall back to icon hero for folders, virtual items, unsupported types, non-Tauri dev, or binary files
  if (
    classification.kind === "none" ||
    !isTauriRuntime() ||
    (textData && textData.isBinary)
  ) {
    return renderFallbackHero();
  }

  if (mediaError) {
    const msg =
      classification.kind === "video"
        ? "Video codec not supported for inline preview — double-click to open externally."
        : "Preview unavailable — double-click to open externally.";
    return renderFallbackHero(msg);
  }

  const showModeToggle =
    classification.kind === "markdown" || classification.kind === "html";

  const renderPreviewContent = () => {
    if (classification.kind === "image" && assetUrl) {
      return (
        <div
          className="gallery-preview-media-wrap"
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
        >
          <img
            key={entry.path}
            src={assetUrl}
            alt={entry.name}
            className="gallery-preview-img"
            draggable={false}
            onError={() => setMediaError(true)}
          />
        </div>
      );
    }

    if (classification.kind === "video" && assetUrl) {
      return (
        <div
          className="gallery-preview-media-wrap"
          onContextMenu={onContextMenu}
        >
          <video
            key={entry.path}
            src={assetUrl}
            className="gallery-preview-video"
            controls
            muted
            playsInline
            preload="metadata"
            onError={() => setMediaError(true)}
          />
        </div>
      );
    }

    if (classification.kind === "pdf" && assetUrl) {
      return (
        <div
          className="gallery-preview-frame-wrap"
          onContextMenu={onContextMenu}
        >
          <iframe
            key={entry.path}
            src={assetUrl}
            title={entry.name}
            className="gallery-preview-pdf"
            onError={() => setMediaError(true)}
          />
        </div>
      );
    }

    if (loading) {
      return (
        <div className="gallery-preview-state">
          <div className="finder-spinner" aria-hidden="true" />
          <span className="gallery-preview-state-text">Loading preview…</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="gallery-preview-state">
          <span className="gallery-preview-state-text">{error}</span>
        </div>
      );
    }

    if (!textData) {
      return null;
    }

    if (textData.content.length === 0) {
      return (
        <div className="gallery-preview-state">
          <span className="gallery-preview-state-text">Empty file</span>
        </div>
      );
    }

    if (classification.kind === "html") {
      if (viewTab === "rendered") {
        return (
          <div className="gallery-preview-frame-wrap" onContextMenu={onContextMenu}>
            <iframe
              key={entry.path}
              title={entry.name}
              className="gallery-preview-html"
              sandbox=""
              srcDoc={textData.content}
            />
          </div>
        );
      }
      return (
        <div className="gallery-preview-code-scroll" onContextMenu={onContextMenu}>
          <pre className="gallery-preview-code">
            <code dangerouslySetInnerHTML={{ __html: highlightedCodeHtml }} />
          </pre>
        </div>
      );
    }

    if (classification.kind === "markdown") {
      if (viewTab === "rendered") {
        return (
          <div className="gallery-preview-doc-scroll" onContextMenu={onContextMenu}>
            <article
              className="gallery-preview-markdown"
              dangerouslySetInnerHTML={{ __html: renderedMarkdownHtml }}
            />
          </div>
        );
      }
      return (
        <div className="gallery-preview-code-scroll" onContextMenu={onContextMenu}>
          <pre className="gallery-preview-text">{textData.content}</pre>
        </div>
      );
    }

    if (classification.kind === "code") {
      return (
        <div className="gallery-preview-code-scroll" onContextMenu={onContextMenu}>
          <pre className="gallery-preview-code">
            <code dangerouslySetInnerHTML={{ __html: highlightedCodeHtml }} />
          </pre>
        </div>
      );
    }

    // Plain text
    return (
      <div className="gallery-preview-code-scroll" onContextMenu={onContextMenu}>
        <pre className="gallery-preview-text">{textData.content}</pre>
      </div>
    );
  };

  return (
    <div
      className={`gallery-preview-panel kind-${classification.kind}`}
      onContextMenu={onContextMenu}
    >
      <div className="gallery-preview-viewport">{renderPreviewContent()}</div>

      <div className="gallery-preview-bar" onDoubleClick={onDoubleClick}>
        <div className="gallery-preview-bar-left">
          {isRenaming ? (
            renameInput
          ) : (
            <span className="gallery-preview-title" title={entry.name}>
              {entry.name}
            </span>
          )}
          <div className="gallery-preview-meta">
            <span>{classification.langLabel || getKindLabel(entry)}</span>
            {formatFileSize(entry) !== "--" && (
              <>
                <span className="meta-dot">•</span>
                <span>{formatFileSize(entry)}</span>
              </>
            )}
            {entry.modifiedMs && (
              <>
                <span className="meta-dot">•</span>
                <span>{formatDateModified(entry.modifiedMs)}</span>
              </>
            )}
            {textData?.truncated && (
              <>
                <span className="meta-dot">•</span>
                <span className="gallery-preview-truncated">
                  Showing first {formatByteSize(textData.bytesRead)} of{" "}
                  {formatByteSize(textData.totalBytes)}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="gallery-preview-bar-right">
          {showModeToggle && (
            <div className="gallery-preview-toggle" role="tablist" aria-label="Preview mode">
              <button
                type="button"
                role="tab"
                aria-selected={viewTab === "rendered"}
                className={`gallery-toggle-btn ${viewTab === "rendered" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setViewTab("rendered");
                }}
              >
                Preview
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewTab === "source"}
                className={`gallery-toggle-btn ${viewTab === "source" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setViewTab("source");
                }}
              >
                Source
              </button>
            </div>
          )}
          <button
            type="button"
            className="gallery-preview-open-btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpenExternal();
            }}
            title="Open with default application"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
};
