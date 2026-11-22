<img src="icon.png" alt="WinFinder" width="96" />

# WinFinder
A MacOS Finder inspired clone for Windows, written using specs and AI (Gemini 4 Neon), using Rust and Tauri.

![WinFinder Demo](demo.gif)

## Features

- **Very low memory footprint** — native Rust + Tauri v2 backend (~42 MB RAM at runtime)
- **Built-in file previews** — Gallery View previews images, videos, PDFs, HTML, Markdown, plain text, and syntax-highlighted source code
- **Fast search with Everything CLI** — optional `es` integration alongside Windows Search with full path results
- **Finder-style views & tabs** — Icons, expandable List, Miller Columns, and Gallery views with multi-tab browsing (`Ctrl+T` / `Ctrl+click`)
- **Native Windows integration** — Windows shell context menus (including Recycle Bin), inline rename (`F2`), and drag-and-drop Favorites
- **Dark & Light themes** — customizable sidebar visibility and persisted window/panel state in `~/.winfinder/config.json`

## Install

### Windows (Scoop)

```sh
scoop bucket add winfinder https://github.com/yetanotherchris/WinFinder
scoop install winfinder
```

## Development

```sh
npm install
npm run tauri dev
```
