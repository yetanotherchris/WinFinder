# 043 — Gallery View Rich Previews

- **Status:** Archived
- **Date:** 2026-11-22
- **Request:** "For gallery view, it should show a preview in the main frame where possible. This should include image files, video files (if possible), markdown files, text files (using fixed width font), source code files (using syntax highlighting component if possible) - common coding extensions for all language including files such as .csproj, and html files. if possible PDF too. I am assuming these can be viewed using the webviewer equivalent in Tauri, as a panel"

## Summary
Upgraded Gallery View's main stage from a static icon display to a rich, responsive inline preview panel supporting images, videos, PDFs, HTML documents, rendered Markdown, syntax-highlighted source code, and fixed-width plain text, with graceful fallback to the large icon view for unsupported files, folders, and virtual items.

## Requirements
- [x] Backend: Enable Tauri v2 `asset` protocol (`protocol-asset` feature + `assetProtocol` scope in `tauri.conf.json`) so images, videos, and PDFs stream directly via `convertFileSrc` without bloating IPC memory.
- [x] Backend: Add `read_file_preview` Tauri command that safely reads text-based files up to a byte cap (512 KB), returning UTF-8 lossy text, total file size, bytes read, and a truncation flag, while rejecting directories, virtual paths, and binary content cleanly.
- [x] Images (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`, `.bmp`, `.ico`, `.avif`): Display crisp contained image preview with graceful fallback on load error.
- [x] Video (`.mp4`, `.webm`, `.mov`, `.mkv`, `.ogg`, `.m4v`): Display `<video controls muted playsInline>` preview with graceful unsupported-codec fallback.
- [x] PDF (`.pdf`): Display embedded WebView2 native PDF viewer panel (`<iframe>` using asset URL) with graceful fallback.
- [x] HTML (`.html`, `.htm`): Display sandboxed `<iframe sandbox="" srcDoc={...}>` preview with a toggle between Preview and Source views.
- [x] Markdown (`.md`, `.markdown`, `.mdx`): Display styled rendered Markdown (sanitized HTML with no script execution) with a toggle between Preview and Source views, styled for both Light and Dark themes.
- [x] Source code (common languages including `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.rs`, `.py`, `.cs`, `.csproj`, `.sln`, `.vb`, `.fs`, `.java`, `.kt`, `.go`, `.c`, `.h`, `.cpp`, `.hpp`, `.rb`, `.php`, `.swift`, `.sh`, `.ps1`, `.bat`, `.cmd`, `.sql`, `.json`, `.yaml`, `.yml`, `.toml`, `.xml`, `.xaml`, `.css`, `.scss`, `.less`, `.dockerfile`, `Dockerfile`, `Makefile`, `.ini`, `.cfg`, `.env`, etc.): Display fixed-width monospace code view with syntax highlighting adapted for both Light and Dark themes.
- [x] Plain text (`.txt`, `.log`, `.csv`, `.tsv`, `.gitignore`, `.editorconfig`, `LICENSE`, `README`, etc.): Display fixed-width monospace text preview.
- [x] Unsupported / binary / directories / virtual items: Fall back cleanly to the existing large icon preview.
- [x] Handle loading states, errors, truncation indicators, and race-safe async cancellation when switching selection quickly.
- [x] Preserve existing Gallery View interactions (double-click to open, right-click context menu, inline rename, folder drag-to-favorites, Left/Right arrow key navigation).

## Edge Cases
- Rapidly switching between items with arrow keys or clicks cancels stale `read_file_preview` IPC results via effect cleanup so the wrong file never flashes.
- Files larger than 512 KB display the first 512 KB with a clear truncation badge in the preview footer bar rather than freezing the UI; syntax highlighting also caps tokenization at 120,000 characters while preserving escaped remainder text.
- Binary files with text extensions (containing NUL bytes in the first 8 KB, excluding UTF-16 LE/BE BOM files) are detected in Rust (`isBinary: true`) and fall back cleanly to the icon preview.
- UTF-8 BOM and UTF-16 LE/BE BOM files are decoded cleanly.
- Non-Tauri browser dev mode falls back cleanly to the icon preview without throwing IPC errors.
- Empty text/code/markdown files show a subtle "Empty file" message.
- Locked/unreadable files show a clean error message without crashing Gallery View.
- Markdown rendering escapes all raw HTML and restricts links/images to `http:`, `https:`, `mailto:`, and `#` schemes to prevent script execution.

## Implementation Notes
- `src-tauri/Cargo.toml`: Enabled `protocol-asset` feature on `tauri`.
- `src-tauri/tauri.conf.json`: Enabled `app.security.assetProtocol` with `scope: ["**"]`.
- `src-tauri/src/lib.rs`: Added `TextFilePreview` struct, `read_file_preview_impl`, `read_file_preview` Tauri command, and unit test `read_file_preview_handles_text_truncation_binary_and_errors`.
- `src/types.ts`: Added `TextFilePreview` TypeScript interface.
- `src/utils/previewHighlighter.ts`: Added zero-dependency preview classifier (`classifyPreview`), multi-family syntax highlighter (`highlightCodeToHtml`), and XSS-safe Markdown renderer (`renderMarkdownToHtml`).
- `src/components/FilePreview.tsx`: Added Gallery View preview component handling images, video, PDF, HTML (Preview/Source), Markdown (Preview/Source), syntax-highlighted code, plain text, loading/error/truncation states, and fallback icon hero.
- `src/components/MainView.tsx`: Integrated `FilePreview` into Gallery View stage while preserving rename, context menu, double-click, and folder drag interactions.
- `src/index.css`: Added Light and Dark theme styles for `.gallery-preview-*`, `.hl-*` syntax tokens, and `.gallery-preview-markdown`.

## Amendments
- Implemented a lightweight zero-dependency syntax highlighter and safe Markdown renderer in `src/utils/previewHighlighter.ts` to keep bundle size small and avoid extra npm dependencies while supporting all requested languages (including XML/`.csproj`, C-like, Python/Ruby, Shell/PowerShell/Dockerfile/Makefile, Batch, SQL, JSON, YAML, INI/TOML, CSS).
