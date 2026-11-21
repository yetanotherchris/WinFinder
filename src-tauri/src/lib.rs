use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, UNIX_EPOCH};
use tauri::Manager;

const TRACKED_PANELS: &[&str] = &["recents", "desktop", "documents", "downloads", "home"];
const MAX_FAVORITES: usize = 10;

fn is_tracked_panel(panel_id: &str) -> bool {
    TRACKED_PANELS.contains(&panel_id)
}

fn normalize_path_key(raw: &str) -> String {
    let trimmed = raw.trim();
    let stripped = trimmed.trim_end_matches(|c| c == '/' || c == '\\');
    let canonical = if stripped.is_empty() {
        trimmed.to_string()
    } else if stripped.len() == 2 && stripped.as_bytes()[1] == b':' {
        format!("{}\\", stripped)
    } else {
        stripped.to_string()
    };

    #[cfg(target_os = "windows")]
    {
        canonical.to_lowercase()
    }

    #[cfg(not(target_os = "windows"))]
    {
        canonical
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteFolder {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: 1040,
            height: 660,
            x: None,
            y: None,
            maximized: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PersistedSortConfig {
    pub field: String,
    pub direction: String,
    pub folders_first: bool,
}

impl Default for PersistedSortConfig {
    fn default() -> Self {
        Self {
            field: "name".to_string(),
            direction: "asc".to_string(),
            folders_first: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PanelState {
    pub view_mode: String,
    pub sort: PersistedSortConfig,
    pub last_path: Option<String>,
    pub expanded_paths: Vec<String>,
    pub column_paths: Vec<String>,
}

impl Default for PanelState {
    fn default() -> Self {
        Self {
            view_mode: "icons".to_string(),
            sort: PersistedSortConfig::default(),
            last_path: None,
            expanded_paths: Vec::new(),
            column_paths: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub use_windows_window_controls: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PersistedAppState {
    pub window: Option<WindowState>,
    pub active_panel: String,
    pub panels: BTreeMap<String, PanelState>,
    pub custom_favorites: Vec<FavoriteFolder>,
    pub settings: AppSettings,
}

impl Default for PersistedAppState {
    fn default() -> Self {
        Self {
            window: None,
            active_panel: "home".to_string(),
            panels: BTreeMap::new(),
            custom_favorites: Vec::new(),
            settings: AppSettings::default(),
        }
    }
}

impl PersistedAppState {
    fn sanitize(&mut self) {
        if !is_tracked_panel(&self.active_panel) {
            self.active_panel = "home".to_string();
        }
        self.panels.retain(|k, _| is_tracked_panel(k));
        for panel in self.panels.values_mut() {
            if !matches!(
                panel.view_mode.as_str(),
                "icons" | "list" | "columns" | "gallery"
            ) {
                panel.view_mode = "icons".to_string();
            }
            if !matches!(
                panel.sort.field.as_str(),
                "name" | "kind" | "dateModified" | "size"
            ) {
                panel.sort.field = "name".to_string();
            }
            if !matches!(panel.sort.direction.as_str(), "asc" | "desc") {
                panel.sort.direction = "asc".to_string();
            }
        }

        let mut seen = std::collections::HashSet::new();
        let mut cleaned = Vec::new();
        for fav in std::mem::take(&mut self.custom_favorites) {
            let trimmed_path = fav.path.trim().to_string();
            if trimmed_path.is_empty() || trimmed_path.starts_with("virtual://") {
                continue;
            }
            let key = normalize_path_key(&trimmed_path);
            if !seen.insert(key) {
                continue;
            }
            let name = if fav.name.trim().is_empty() {
                display_name_for_path(Path::new(&trimmed_path))
            } else {
                fav.name.trim().to_string()
            };
            cleaned.push(FavoriteFolder {
                name,
                path: trimmed_path,
            });
            if cleaned.len() >= MAX_FAVORITES {
                break;
            }
        }
        self.custom_favorites = cleaned;
    }
}

struct AppStateStore {
    state_path: Option<PathBuf>,
    state: Mutex<PersistedAppState>,
    dirty: Mutex<bool>,
    dirty_cv: Condvar,
}

impl AppStateStore {
    fn load() -> Arc<Self> {
        let state_path = dirs::home_dir().map(|h| h.join(".winfinder"));
        let mut initial = state_path
            .as_ref()
            .and_then(|p| fs::read_to_string(p).ok())
            .and_then(|raw| serde_json::from_str::<PersistedAppState>(&raw).ok())
            .unwrap_or_default();
        initial.sanitize();

        let store = Arc::new(Self {
            state_path,
            state: Mutex::new(initial),
            dirty: Mutex::new(false),
            dirty_cv: Condvar::new(),
        });
        store.start_debounced_writer();
        store
    }

    fn start_debounced_writer(self: &Arc<Self>) {
        let store = Arc::clone(self);
        std::thread::spawn(move || {
            let flush_interval = Duration::from_secs(5);
            loop {
                let mut dirty = store.dirty.lock().unwrap();
                while !*dirty {
                    dirty = store.dirty_cv.wait(dirty).unwrap();
                }
                drop(dirty);

                // Batch dirty state changes and flush to ~/.winfinder every 5 seconds
                std::thread::sleep(flush_interval);

                let mut dirty = store.dirty.lock().unwrap();
                if *dirty {
                    *dirty = false;
                    drop(dirty);
                    store.save_now();
                }
            }
        });
    }

    fn schedule_save(&self) {
        let mut dirty = self.dirty.lock().unwrap();
        *dirty = true;
        self.dirty_cv.notify_one();
    }

    fn save_now(&self) {
        let Some(path) = &self.state_path else {
            return;
        };
        let snapshot = self.state.lock().unwrap().clone();
        let Ok(json) = serde_json::to_string_pretty(&snapshot) else {
            return;
        };
        let tmp_path = path.with_file_name(".winfinder.tmp");
        if fs::write(&tmp_path, &json).is_ok() {
            if fs::rename(&tmp_path, path).is_ok() {
                return;
            }
            let _ = fs::remove_file(&tmp_path);
        }
        let _ = fs::write(path, json);
    }

    fn snapshot(&self) -> PersistedAppState {
        self.state.lock().unwrap().clone()
    }

    fn update_window_size(&self, width: u32, height: u32, maximized: bool) {
        let mut guard = self.state.lock().unwrap();
        let win = guard.window.get_or_insert_with(WindowState::default);
        win.maximized = maximized;
        if !maximized && width >= 200 && height >= 200 {
            win.width = width;
            win.height = height;
        }
        drop(guard);
        self.schedule_save();
    }

    fn update_window_position(&self, x: i32, y: i32) {
        let mut guard = self.state.lock().unwrap();
        let win = guard.window.get_or_insert_with(WindowState::default);
        win.x = Some(x);
        win.y = Some(y);
        drop(guard);
        self.schedule_save();
    }

    fn update_panels(&self, active_panel: String, panels: BTreeMap<String, PanelState>) {
        let mut guard = self.state.lock().unwrap();
        if is_tracked_panel(&active_panel) {
            guard.active_panel = active_panel;
        }
        guard.panels = panels
            .into_iter()
            .filter(|(k, _)| is_tracked_panel(k))
            .collect();
        guard.sanitize();
        drop(guard);
        self.schedule_save();
    }

    fn update_custom_favorites(&self, favorites: Vec<FavoriteFolder>) {
        let mut guard = self.state.lock().unwrap();
        guard.custom_favorites = favorites;
        guard.sanitize();
        drop(guard);
        self.save_now();
    }

    fn update_settings(&self, settings: AppSettings) {
        let mut guard = self.state.lock().unwrap();
        guard.settings = settings;
        drop(guard);
        self.save_now();
    }
}

fn is_rect_visible_on_monitors(
    window: &tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> bool {
    let Ok(monitors) = window.available_monitors() else {
        return true;
    };
    if monitors.is_empty() {
        return true;
    }

    let win_right = x.saturating_add(width as i32);
    let win_bottom = y.saturating_add(height as i32);

    monitors.iter().any(|m| {
        let pos = m.position();
        let size = m.size();
        let mon_left = pos.x;
        let mon_top = pos.y;
        let mon_right = mon_left.saturating_add(size.width as i32);
        let mon_bottom = mon_top.saturating_add(size.height as i32);

        let overlap_x = win_right.min(mon_right) - x.max(mon_left);
        let overlap_y = win_bottom.min(mon_bottom) - y.max(mon_top);
        overlap_x >= 80 && overlap_y >= 60
    })
}

fn clamped_window_dimensions(state: &WindowState) -> (u32, u32) {
    (state.width.max(700), state.height.max(420))
}

fn restore_window_state(window: &tauri::WebviewWindow, state: &WindowState) {
    let (width, height) = clamped_window_dimensions(state);

    let positioned = match (state.x, state.y) {
        (Some(x), Some(y)) if is_rect_visible_on_monitors(window, x, y, width, height) => {
            // Move to the target monitor before sizing so cross-DPI WM_DPICHANGED
            // does not rescale the saved physical dimensions.
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(
                x, y,
            )));
            true
        }
        _ => false,
    };

    let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
        width, height,
    )));

    if !positioned {
        let _ = window.center();
    }

    if state.maximized {
        let _ = window.maximize();
    }
}

fn resolve_existing_dir(saved_path: Option<&str>, root_path: &str) -> String {
    if root_path.starts_with("virtual://") {
        return root_path.to_string();
    }

    if let Some(raw) = saved_path {
        let trimmed = raw.trim();
        if !trimmed.is_empty() && !trimmed.starts_with("virtual://") {
            let mut candidate = PathBuf::from(trimmed);
            loop {
                if candidate.is_dir() {
                    return candidate.to_string_lossy().into_owned();
                }
                match candidate.parent() {
                    Some(parent) if parent != candidate.as_path() => {
                        candidate = parent.to_path_buf();
                    }
                    _ => break,
                }
            }
        }
    }

    let root = Path::new(root_path);
    if root.is_dir() {
        return root_path.to_string();
    }

    dirs::home_dir()
        .map(|h| h.to_string_lossy().into_owned())
        .unwrap_or_else(|| root_path.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BreadcrumbItem {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// One of: "folder", "file", "app", "drive"
    pub entry_kind: String,
    pub extension: Option<String>,
    pub size: u64,
    pub modified_ms: Option<u64>,
    pub icon_data_url: Option<String>,
}

enum AppsLoadState {
    Loading,
    Ready(Vec<FileEntry>),
    Failed(String),
}

struct AppsCache {
    state: Mutex<AppsLoadState>,
    ready: Condvar,
}

impl AppsCache {
    fn new() -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(AppsLoadState::Loading),
            ready: Condvar::new(),
        })
    }

    fn start_preload(self: &Arc<Self>) {
        let cache = Arc::clone(self);
        std::thread::spawn(move || {
            let result = load_applications_entries();
            let mut guard = cache.state.lock().unwrap();
            *guard = match result {
                Ok(entries) => AppsLoadState::Ready(entries),
                Err(err) => AppsLoadState::Failed(err),
            };
            cache.ready.notify_all();
        });
    }

    fn get_or_wait(&self) -> Result<Vec<FileEntry>, String> {
        let mut guard = self.state.lock().unwrap();
        while matches!(*guard, AppsLoadState::Loading) {
            guard = self.ready.wait(guard).unwrap();
        }
        match &*guard {
            AppsLoadState::Ready(entries) => Ok(entries.clone()),
            AppsLoadState::Failed(err) => Err(err.clone()),
            AppsLoadState::Loading => unreachable!(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryListing {
    pub current_path: String,
    pub current_name: String,
    pub home_path: String,
    pub home_name: String,
    pub breadcrumbs: Vec<BreadcrumbItem>,
    pub entries: Vec<FileEntry>,
    pub empty_message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarLocations {
    pub home_path: String,
    pub home_name: String,
    pub desktop_path: Option<String>,
    pub documents_path: Option<String>,
    pub downloads_path: Option<String>,
}

fn is_hidden_entry(name: &str, metadata: &fs::Metadata) -> bool {
    if name.starts_with('.') {
        return true;
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        const FILE_ATTRIBUTE_SYSTEM: u32 = 0x4;
        let attrs = metadata.file_attributes();
        if (attrs & (FILE_ATTRIBUTE_HIDDEN | FILE_ATTRIBUTE_SYSTEM)) != 0 {
            return true;
        }
    }

    let _ = metadata;
    false
}

fn display_name_for_path(path: &Path) -> String {
    if let Some(name) = path.file_name() {
        let s = name.to_string_lossy().into_owned();
        if !s.is_empty() {
            return s;
        }
    }
    path.to_string_lossy().into_owned()
}

fn build_breadcrumbs(current: &Path) -> Vec<BreadcrumbItem> {
    // Always build the full path from filesystem root (e.g. C:\ > Users > chris > Documents or / > Users > chris > Documents)
    let mut crumbs = Vec::new();
    let mut running = PathBuf::new();

    for comp in current.components() {
        match comp {
            Component::Prefix(prefix) => {
                running.push(prefix.as_os_str());
            }
            Component::RootDir => {
                running.push(comp.as_os_str());
                let label = running.to_string_lossy().into_owned();
                crumbs.push(BreadcrumbItem {
                    name: label,
                    path: running.to_string_lossy().into_owned(),
                });
            }
            Component::Normal(seg) => {
                running.push(seg);
                crumbs.push(BreadcrumbItem {
                    name: seg.to_string_lossy().into_owned(),
                    path: running.to_string_lossy().into_owned(),
                });
            }
            _ => {}
        }
    }

    if crumbs.is_empty() {
        crumbs.push(BreadcrumbItem {
            name: display_name_for_path(current),
            path: current.to_string_lossy().into_owned(),
        });
    }

    crumbs
}

fn home_info() -> Result<(PathBuf, String, String), String> {
    let home = dirs::home_dir().ok_or_else(|| "Could not locate home directory".to_string())?;
    let home_path = home.to_string_lossy().into_owned();
    let home_name = display_name_for_path(&home);
    Ok((home, home_path, home_name))
}

fn list_fs_directory(target: &Path, show_hidden: bool) -> Result<DirectoryListing, String> {
    let (_home, home_path, home_name) = home_info()?;

    let read_dir =
        fs::read_dir(target).map_err(|e| format!("Unable to read folder contents: {}", e))?;

    let mut entries = Vec::new();
    for item in read_dir.flatten() {
        let entry_path = item.path();
        let name = item.file_name().to_string_lossy().into_owned();

        let metadata = match item.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        if !show_hidden && is_hidden_entry(&name, &metadata) {
            continue;
        }

        let is_dir = metadata.is_dir();
        let extension = if is_dir {
            None
        } else {
            entry_path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase())
        };
        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);

        entries.push(FileEntry {
            name,
            path: entry_path.to_string_lossy().into_owned(),
            is_dir,
            entry_kind: if is_dir {
                "folder".to_string()
            } else {
                "file".to_string()
            },
            extension,
            size: if is_dir { 0 } else { metadata.len() },
            modified_ms,
            icon_data_url: None,
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    let breadcrumbs = build_breadcrumbs(target);

    Ok(DirectoryListing {
        current_path: target.to_string_lossy().into_owned(),
        current_name: display_name_for_path(target),
        home_path,
        home_name,
        breadcrumbs,
        entries,
        empty_message: None,
    })
}

fn list_recents(show_hidden: bool) -> Result<DirectoryListing, String> {
    let (home, home_path, home_name) = home_info()?;

    let mut search_dirs: Vec<PathBuf> = vec![home.clone()];
    for maybe_dir in [
        dirs::desktop_dir(),
        dirs::document_dir(),
        dirs::download_dir(),
        dirs::picture_dir(),
        dirs::audio_dir(),
        dirs::video_dir(),
    ] {
        if let Some(d) = maybe_dir {
            if !search_dirs.contains(&d) {
                search_dirs.push(d);
            }
        }
    }

    let mut collected: Vec<(u128, FileEntry)> = Vec::new();
    for dir in search_dirs {
        let Ok(read_dir) = fs::read_dir(&dir) else {
            continue;
        };
        for item in read_dir.flatten() {
            let entry_path = item.path();
            let name = item.file_name().to_string_lossy().into_owned();
            let Ok(metadata) = item.metadata() else {
                continue;
            };
            if metadata.is_dir() || (!show_hidden && is_hidden_entry(&name, &metadata)) {
                continue;
            }
            let modified_ms = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis())
                .unwrap_or(0);
            let extension = entry_path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase());

            collected.push((
                modified_ms,
                FileEntry {
                    name,
                    path: entry_path.to_string_lossy().into_owned(),
                    is_dir: false,
                    entry_kind: "file".to_string(),
                    extension,
                    size: metadata.len(),
                    modified_ms: if modified_ms > 0 { Some(modified_ms as u64) } else { None },
                    icon_data_url: None,
                },
            ));
        }
    }

    collected.sort_by(|a, b| b.0.cmp(&a.0));
    let entries: Vec<FileEntry> = collected.into_iter().take(60).map(|(_, e)| e).collect();

    Ok(DirectoryListing {
        current_path: "virtual://recents".to_string(),
        current_name: "Recents".to_string(),
        home_path,
        home_name,
        breadcrumbs: vec![BreadcrumbItem {
            name: "Recents".to_string(),
            path: "virtual://recents".to_string(),
        }],
        entries,
        empty_message: Some("No recent files found".to_string()),
    })
}

#[cfg(target_os = "windows")]
mod win_shell {
    use super::FileEntry;
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
    use std::collections::HashSet;
    use std::mem::size_of;
    use windows::ApplicationModel::DataTransfer::{
        DataRequestedEventArgs, DataTransferManager,
    };
    use windows::Foundation::TypedEventHandler;
    use windows::Storage::{IStorageItem, StorageFile};
    use windows::core::{Interface, HSTRING, PCSTR, PCWSTR, PWSTR};
    use windows::Win32::Foundation::{
        E_UNEXPECTED, GlobalFree, HANDLE, HWND, LPARAM, POINT, SIZE, WPARAM,
    };
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
    };
    use windows::Win32::Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives};
    use windows::Win32::System::Com::{
        CoInitializeEx, CoTaskMemFree, CoUninitialize, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{
        GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT,
    };
    use windows::Win32::System::Ole::CF_HDROP;
    use windows::Win32::UI::Shell::{
        BHID_EnumItems, BHID_SFUIObject, FOLDERID_AppsFolder, FOLDERID_RecycleBinFolder,
        IContextMenu, IDataTransferManagerInterop, IEnumShellItems, IShellItem,
        IShellItemImageFactory, SHCreateItemFromParsingName, SHCreateItemFromRelativeName,
        SHEmptyRecycleBinW, SHGetKnownFolderItem, CMF_EXPLORE, CMF_NORMAL, CMIC_MASK_PTINVOKE,
        CMINVOKECOMMANDINFO, CMINVOKECOMMANDINFOEX, DROPFILES, KF_FLAG_DEFAULT, SEE_MASK_UNICODE,
        SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SIGDN_DESKTOPABSOLUTEPARSING, SIGDN_FILESYSPATH,
        SIGDN_NORMALDISPLAY, SIGDN_PARENTRELATIVEPARSING, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreatePopupMenu, DestroyMenu, GetCursorPos, PostMessageW, SetForegroundWindow,
        TrackPopupMenuEx, SW_SHOWNORMAL, TPM_RETURNCMD, TPM_RIGHTBUTTON, WM_NULL,
    };

    const DRIVE_REMOTE: u32 = 4;

    unsafe fn pwstr_to_string(ptr: PWSTR) -> Option<String> {
        if ptr.is_null() {
            return None;
        }
        let s = ptr.to_string().ok();
        CoTaskMemFree(Some(ptr.0 as *const _));
        s
    }

    unsafe fn hbitmap_to_png_data_url(hbmp: HBITMAP) -> Option<String> {
        let mut bm = BITMAP::default();
        if GetObjectW(hbmp.into(), size_of::<BITMAP>() as i32, Some(&mut bm as *mut _ as *mut _))
            == 0
        {
            return None;
        }

        let width = bm.bmWidth;
        let height = bm.bmHeight;
        if width <= 0 || height <= 0 || width > 256 || height > 256 {
            return None;
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // top-down DIB
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut pixels = vec![0u8; (width as usize) * (height as usize) * 4];
        let hdc = CreateCompatibleDC(None);
        if hdc.is_invalid() {
            return None;
        }

        let lines = GetDIBits(
            hdc,
            hbmp,
            0,
            height as u32,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        let _ = DeleteDC(hdc);

        if lines == 0 {
            return None;
        }

        // Convert BGRA -> RGBA and check if alpha channel is completely zero
        let mut any_alpha = false;
        for px in pixels.chunks_exact_mut(4) {
            px.swap(0, 2);
            if px[3] != 0 {
                any_alpha = true;
            }
        }
        if !any_alpha {
            for px in pixels.chunks_exact_mut(4) {
                px[3] = 255;
            }
        }

        let mut png_bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut png_bytes, width as u32, height as u32);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().ok()?;
            writer.write_image_data(&pixels).ok()?;
        }

        Some(format!("data:image/png;base64,{}", BASE64.encode(&png_bytes)))
    }

    fn should_include_app(name: &str, aumid: &str) -> bool {
        let n = name.trim().to_lowercase();
        let p = aumid.trim().to_lowercase();

        if n.is_empty() {
            return false;
        }

        // 1. Web links, docs, help files, manuals, licenses, config files
        if p.starts_with("http://") || p.starts_with("https://") {
            return false;
        }
        for ext in [".url", ".chm", ".html", ".htm", ".pdf", ".rtf", ".ini", ".txt", ".md"] {
            if p.ends_with(ext) {
                return false;
            }
        }
        if n == "website"
            || n == "faq"
            || n.ends_with(" help")
            || n.contains("documentation")
            || n.contains("user manual")
            || n.contains("user guide")
            || n.contains("getting started")
            || n.contains("release notes")
            || n.contains("module docs")
            || n.contains("license (")
            || n.contains("on the web")
            || n.contains("config file")
            || n.contains("faqs")
        {
            return false;
        }

        // 2. WSL Linux GUI app shortcuts (keep the distro terminal itself)
        if p.starts_with("microsoft.autogenerated.")
            && (n.contains("(ubuntu")
                || n.contains("(debian")
                || n.contains("(kali")
                || n.contains("(fedora")
                || n.contains("(opensuse")
                || n.contains("(arch"))
        {
            return false;
        }

        // 3. Uninstallers, updaters, error reporters, install helpers
        if p.contains("uninstall")
            || p.ends_with("updater.exe")
            || p.ends_with("errorreporter.exe")
            || n.starts_with("uninstall ")
            || n.starts_with("install additional tools")
            || n.ends_with(" updater")
            || n.contains("error reporter")
            || n.contains("redeem launcher")
        {
            return false;
        }

        // 4. Steam / Epic / GeForce NOW game shortcuts
        if p.starts_with("steam://")
            || p.starts_with("com.epicgames.launcher://")
            || n.contains(" on geforce now")
        {
            return false;
        }

        // 5. Driver control panels, MMC snap-ins, CPLs, batch scripts, dev prompts & admin tools
        if p.ends_with(".msc") || p.ends_with(".cpl") || p.ends_with(".bat") {
            return false;
        }
        if p.contains("driver\\") && n.ends_with("control panel") {
            return false;
        }
        if n.contains("system tray icon")
            || n.contains("command prompt for vs")
            || n.contains("powershell for vs")
            || n == "node.js command prompt"
            || n.starts_with("odbc data sources")
            || n.starts_with("application verifier")
            || n.ends_with(" (x86)")
            || matches!(
                n.as_str(),
                "iscsi initiator"
                    | "local security policy"
                    | "event viewer"
                    | "computer management"
                    | "task scheduler"
                    | "performance monitor"
                    | "resource monitor"
                    | "defragment and optimise drives"
                    | "defragment and optimize drives"
                    | "disk clean-up"
                    | "disk cleanup"
                    | "windows memory diagnostic"
                    | "recovery drive"
                    | "steps recorder"
                    | "windows app cert kit"
                    | "debuggable package manager"
                    | "windows software development kit"
                    | "app recovery"
            )
        {
            return false;
        }

        true
    }

    pub fn enumerate_apps() -> Result<Vec<FileEntry>, String> {
        unsafe {
            let co_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let should_uninit = co_hr.is_ok();

            let result = (|| -> Result<Vec<FileEntry>, String> {
                let apps_folder: IShellItem =
                    SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None)
                        .map_err(|e| format!("Could not open Windows Applications folder: {}", e))?;

                let enum_items: IEnumShellItems = apps_folder
                    .BindToHandler(None, &BHID_EnumItems)
                    .map_err(|e| format!("Could not enumerate installed applications: {}", e))?;

                let mut entries = Vec::new();
                let mut seen_names = HashSet::new();
                loop {
                    let mut batch: [Option<IShellItem>; 32] = Default::default();
                    let mut fetched = 0u32;
                    let hr = enum_items.Next(&mut batch, Some(&mut fetched));
                    if fetched == 0 {
                        break;
                    }

                    for item in batch.into_iter().take(fetched as usize).flatten() {
                        let name = item
                            .GetDisplayName(SIGDN_NORMALDISPLAY)
                            .ok()
                            .and_then(|p| pwstr_to_string(p));
                        let aumid = item
                            .GetDisplayName(SIGDN_PARENTRELATIVEPARSING)
                            .ok()
                            .and_then(|p| pwstr_to_string(p));

                        let (Some(name), Some(aumid)) = (name, aumid) else {
                            continue;
                        };
                        if !should_include_app(&name, &aumid) {
                            continue;
                        }
                        if !seen_names.insert(name.trim().to_lowercase()) {
                            continue;
                        }

                        let icon_data_url = item
                            .cast::<IShellItemImageFactory>()
                            .ok()
                            .and_then(|factory| {
                                factory
                                    .GetImage(
                                        SIZE { cx: 64, cy: 64 },
                                        SIIGBF_ICONONLY | SIIGBF_BIGGERSIZEOK,
                                    )
                                    .ok()
                            })
                            .and_then(|hbmp| {
                                let url = hbitmap_to_png_data_url(hbmp);
                                let _ = DeleteObject(hbmp.into());
                                url
                            });

                        entries.push(FileEntry {
                            name,
                            path: format!("app://{}", aumid),
                            is_dir: false,
                            entry_kind: "app".to_string(),
                            extension: None,
                            size: 0,
                            modified_ms: None,
                            icon_data_url,
                        });
                    }

                    if hr.is_err() || fetched < 32 {
                        break;
                    }
                }

                entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
                Ok(entries)
            })();

            if should_uninit {
                CoUninitialize();
            }

            result
        }
    }

    pub fn enumerate_drives(network_only: bool) -> Vec<FileEntry> {
        let mask = unsafe { GetLogicalDrives() };
        let mut drives = Vec::new();

        for i in 0..26u8 {
            if (mask & (1 << i)) == 0 {
                continue;
            }
            let letter = (b'A' + i) as char;
            let root = format!("{}:\\", letter);
            let wide = HSTRING::from(&root);
            let drive_type = unsafe { GetDriveTypeW(&wide) };
            let is_remote = drive_type == DRIVE_REMOTE;

            if network_only != is_remote {
                continue;
            }

            let label = if is_remote {
                format!("Network Drive ({}:)", letter)
            } else {
                format!("Local Disk ({}:)", letter)
            };

            drives.push(FileEntry {
                name: label,
                path: root,
                is_dir: true,
                entry_kind: "drive".to_string(),
                extension: None,
                size: 0,
                modified_ms: None,
                icon_data_url: None,
            });
        }

        drives
    }

    pub fn show_shell_context_menu(
        hwnd_raw: isize,
        path: &str,
        entry_kind: &str,
    ) -> Result<bool, String> {
        unsafe {
            let co_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let should_uninit = co_hr.is_ok();

            let result = (|| -> Result<bool, String> {
                let shell_item: IShellItem = if entry_kind == "app" {
                    let aumid = path.strip_prefix("app://").unwrap_or(path);
                    let apps_folder: IShellItem =
                        SHGetKnownFolderItem(&FOLDERID_AppsFolder, KF_FLAG_DEFAULT, None)
                            .map_err(|e| format!("Failed to open AppsFolder: {}", e))?;
                    SHCreateItemFromRelativeName(&apps_folder, &HSTRING::from(aumid), None)
                        .map_err(|e| format!("Failed to resolve app item: {}", e))?
                } else {
                    SHCreateItemFromParsingName(&HSTRING::from(path), None)
                        .map_err(|e| format!("Failed to resolve shell item: {}", e))?
                };

                let context_menu: IContextMenu = shell_item
                    .BindToHandler(None, &BHID_SFUIObject)
                    .map_err(|e| format!("Failed to bind context menu: {}", e))?;

                let hmenu = CreatePopupMenu()
                    .map_err(|e| format!("Failed to create popup menu: {}", e))?;

                let query_res = context_menu.QueryContextMenu(
                    hmenu,
                    0,
                    1,
                    0x7FFF,
                    CMF_NORMAL | CMF_EXPLORE,
                );
                if query_res.is_err() {
                    let _ = DestroyMenu(hmenu);
                    return Err("Failed to populate context menu".to_string());
                }

                let hwnd = HWND(hwnd_raw as *mut _);
                let mut pt = POINT::default();
                let _ = GetCursorPos(&mut pt);
                let _ = SetForegroundWindow(hwnd);

                let cmd = TrackPopupMenuEx(
                    hmenu,
                    (TPM_RETURNCMD | TPM_RIGHTBUTTON).0,
                    pt.x,
                    pt.y,
                    hwnd,
                    None,
                );

                let mut invoked = false;
                if cmd.0 > 0 {
                    let verb_id = (cmd.0 as usize) - 1;
                    let ici = CMINVOKECOMMANDINFOEX {
                        cbSize: size_of::<CMINVOKECOMMANDINFOEX>() as u32,
                        fMask: SEE_MASK_UNICODE | CMIC_MASK_PTINVOKE,
                        hwnd,
                        lpVerb: PCSTR(verb_id as *const u8),
                        lpVerbW: PCWSTR(verb_id as *const u16),
                        nShow: SW_SHOWNORMAL.0,
                        ptInvoke: pt,
                        ..Default::default()
                    };
                    let _ = context_menu
                        .InvokeCommand(&ici as *const _ as *const CMINVOKECOMMANDINFO);
                    invoked = true;
                }

                let _ = PostMessageW(Some(hwnd), WM_NULL, WPARAM(0), LPARAM(0));
                let _ = DestroyMenu(hmenu);
                Ok(invoked)
            })();

            if should_uninit {
                CoUninitialize();
            }

            result
        }
    }

    pub fn copy_file_to_clipboard(path: &str) -> Result<(), String> {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let wide: Vec<u16> = OsStr::new(path)
            .encode_wide()
            .chain(std::iter::once(0))
            .chain(std::iter::once(0)) // double null-terminated
            .collect();

        let header_size = size_of::<DROPFILES>();
        let total_bytes = header_size + wide.len() * size_of::<u16>();

        unsafe {
            let hglobal = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_bytes)
                .map_err(|e| format!("Failed to allocate clipboard memory: {}", e))?;

            let ptr = GlobalLock(hglobal);
            if ptr.is_null() {
                let _ = GlobalFree(Some(hglobal));
                return Err("Failed to lock clipboard memory".to_string());
            }

            let dropfiles = ptr as *mut DROPFILES;
            (*dropfiles).pFiles = header_size as u32;
            (*dropfiles).fWide = true.into();

            let dest = (ptr as *mut u8).add(header_size) as *mut u16;
            std::ptr::copy_nonoverlapping(wide.as_ptr(), dest, wide.len());
            let _ = GlobalUnlock(hglobal);

            if OpenClipboard(None).is_err() {
                let _ = GlobalFree(Some(hglobal));
                return Err("Failed to open clipboard".to_string());
            }

            let _ = EmptyClipboard();
            let set_res = SetClipboardData(CF_HDROP.0 as u32, Some(HANDLE(hglobal.0)));
            let _ = CloseClipboard();

            if set_res.is_err() {
                let _ = GlobalFree(Some(hglobal));
                return Err("Failed to copy file to clipboard".to_string());
            }
        }

        Ok(())
    }

    pub fn show_windows_share_sheet(hwnd_raw: isize, path: &str) -> Result<(), String> {
        let file_path = path.to_string();
        let file_name = std::path::Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "File".to_string());

        unsafe {
            let interop: IDataTransferManagerInterop =
                windows::core::factory::<DataTransferManager, IDataTransferManagerInterop>()
                    .map_err(|e| format!("Windows Share is unavailable: {}", e))?;

            let hwnd = HWND(hwnd_raw as *mut _);
            let dtm: DataTransferManager = interop
                .GetForWindow(hwnd)
                .map_err(|e| format!("Failed to initialize Windows Share: {}", e))?;

            let handler = TypedEventHandler::<DataTransferManager, DataRequestedEventArgs>::new(
                move |_sender, args| {
                    if let Some(args) = args.as_ref() {
                        let request = args.Request()?;
                        let deferral = request.GetDeferral()?;
                        let data = request.Data()?;
                        data.Properties()?.SetTitle(&HSTRING::from(&file_name))?;

                        let storage_file =
                            StorageFile::GetFileFromPathAsync(&HSTRING::from(&file_path))?.join()?;
                        let storage_item: IStorageItem = storage_file.cast()?;
                        let list = windows_collections::IIterable::<IStorageItem>::from(vec![Some(
                            storage_item,
                        )]);
                        data.SetStorageItems(&list, true)?;
                        deferral.Complete()?;
                    }
                    Ok(())
                },
            );

            let _token = dtm
                .DataRequested(&handler)
                .map_err(|e| format!("Failed to attach share handler: {}", e))?;

            interop
                .ShowShareUIForWindow(hwnd)
                .map_err(|e| format!("Failed to open Windows Share dialog: {}", e))?;
        }

        Ok(())
    }

    pub fn enumerate_recycle_bin() -> Result<Vec<FileEntry>, String> {
        use std::path::Path;
        use std::time::UNIX_EPOCH;

        unsafe {
            let co_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let should_uninit = co_hr.is_ok();

            let result = (|| -> Result<Vec<FileEntry>, String> {
                let recycle_bin: IShellItem =
                    SHGetKnownFolderItem(&FOLDERID_RecycleBinFolder, KF_FLAG_DEFAULT, None)
                        .map_err(|e| format!("Could not open Windows Recycle Bin: {}", e))?;

                let enum_items: IEnumShellItems = recycle_bin
                    .BindToHandler(None, &BHID_EnumItems)
                    .map_err(|e| format!("Could not enumerate Recycle Bin items: {}", e))?;

                let mut entries = Vec::new();
                let mut index = 0usize;

                loop {
                    let mut batch: [Option<IShellItem>; 32] = Default::default();
                    let mut fetched = 0u32;
                    let hr = enum_items.Next(&mut batch, Some(&mut fetched));
                    if fetched == 0 {
                        break;
                    }

                    for item in batch.into_iter().take(fetched as usize).flatten() {
                        index += 1;
                        let name = item
                            .GetDisplayName(SIGDN_NORMALDISPLAY)
                            .ok()
                            .and_then(|p| pwstr_to_string(p))
                            .filter(|s| !s.trim().is_empty());

                        let fs_path = item
                            .GetDisplayName(SIGDN_FILESYSPATH)
                            .ok()
                            .and_then(|p| pwstr_to_string(p));

                        let parsing_path = fs_path.clone().or_else(|| {
                            item.GetDisplayName(SIGDN_DESKTOPABSOLUTEPARSING)
                                .ok()
                                .and_then(|p| pwstr_to_string(p))
                        });

                        let path = parsing_path.unwrap_or_else(|| format!("trash://item-{}", index));
                        let display_name = name.unwrap_or_else(|| {
                            Path::new(&path)
                                .file_name()
                                .map(|n| n.to_string_lossy().into_owned())
                                .unwrap_or_else(|| format!("Item {}", index))
                        });

                        let meta = fs_path.as_deref().and_then(|p| std::fs::metadata(p).ok());
                        let is_dir = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
                        let size = if is_dir {
                            0
                        } else {
                            meta.as_ref().map(|m| m.len()).unwrap_or(0)
                        };
                        let modified_ms = meta.as_ref().and_then(|m| {
                            m.modified()
                                .ok()
                                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                                .map(|d| d.as_millis() as u64)
                        });
                        let extension = if is_dir {
                            None
                        } else {
                            Path::new(&display_name)
                                .extension()
                                .map(|e| e.to_string_lossy().to_lowercase())
                        };

                        entries.push(FileEntry {
                            name: display_name,
                            path,
                            is_dir,
                            entry_kind: if is_dir {
                                "folder".to_string()
                            } else {
                                "file".to_string()
                            },
                            extension,
                            size,
                            modified_ms,
                            icon_data_url: None,
                        });
                    }

                    if hr.is_err() || fetched < 32 {
                        break;
                    }
                }

                entries.sort_by(|a, b| {
                    b.is_dir
                        .cmp(&a.is_dir)
                        .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                });
                Ok(entries)
            })();

            if should_uninit {
                CoUninitialize();
            }

            result
        }
    }

    pub fn empty_recycle_bin() -> Result<(), String> {
        unsafe {
            let res = SHEmptyRecycleBinW(
                None,
                PCWSTR::null(),
                SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI,
            );
            match res {
                Ok(()) => Ok(()),
                Err(e) if e.code() == E_UNEXPECTED => Ok(()),
                Err(e) => Err(format!("Failed to empty Recycle Bin: {}", e)),
            }
        }
    }
}

fn load_applications_entries() -> Result<Vec<FileEntry>, String> {
    #[cfg(target_os = "windows")]
    {
        win_shell::enumerate_apps()
    }

    #[cfg(target_os = "macos")]
    {
        let listing = list_fs_directory(Path::new("/Applications"), false)?;
        Ok(listing
            .entries
            .into_iter()
            .map(|mut e| {
                e.entry_kind = "app".to_string();
                e.is_dir = false;
                e
            })
            .collect())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Ok(Vec::new())
    }
}

fn list_applications(cache: &AppsCache) -> Result<DirectoryListing, String> {
    let (_home, home_path, home_name) = home_info()?;
    let entries = cache.get_or_wait()?;

    Ok(DirectoryListing {
        current_path: "virtual://applications".to_string(),
        current_name: "Applications".to_string(),
        home_path,
        home_name,
        breadcrumbs: vec![BreadcrumbItem {
            name: "Applications".to_string(),
            path: "virtual://applications".to_string(),
        }],
        entries,
        empty_message: Some("No applications found".to_string()),
    })
}

fn list_computer() -> Result<DirectoryListing, String> {
    #[cfg(target_os = "windows")]
    {
        let (_home, home_path, home_name) = home_info()?;
        let entries = win_shell::enumerate_drives(false);
        Ok(DirectoryListing {
            current_path: "virtual://computer".to_string(),
            current_name: "Drives".to_string(),
            home_path,
            home_name,
            breadcrumbs: vec![BreadcrumbItem {
                name: "Drives".to_string(),
                path: "virtual://computer".to_string(),
            }],
            entries,
            empty_message: Some("No drives found".to_string()),
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        list_fs_directory(Path::new("/"), false)
    }
}

fn list_network() -> Result<DirectoryListing, String> {
    let (_home, home_path, home_name) = home_info()?;

    #[cfg(target_os = "windows")]
    let entries = win_shell::enumerate_drives(true);

    #[cfg(not(target_os = "windows"))]
    let entries = Vec::new();

    Ok(DirectoryListing {
        current_path: "virtual://network".to_string(),
        current_name: "Network".to_string(),
        home_path,
        home_name,
        breadcrumbs: vec![BreadcrumbItem {
            name: "Network".to_string(),
            path: "virtual://network".to_string(),
        }],
        entries,
        empty_message: Some("No network drives connected".to_string()),
    })
}

fn list_trash(show_hidden: bool) -> Result<DirectoryListing, String> {
    let (_home, home_path, home_name) = home_info()?;

    #[cfg(target_os = "windows")]
    let entries = {
        let _ = show_hidden;
        win_shell::enumerate_recycle_bin()?
    };

    #[cfg(target_os = "macos")]
    let entries = {
        let trash_dir = dirs::home_dir().map(|h| h.join(".Trash"));
        match trash_dir {
            Some(dir) if dir.is_dir() => list_fs_directory(&dir, show_hidden)?.entries,
            _ => Vec::new(),
        }
    };

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let entries = {
        let trash_files = dirs::data_local_dir().map(|d| d.join("Trash").join("files"));
        match trash_files {
            Some(dir) if dir.is_dir() => list_fs_directory(&dir, show_hidden)?.entries,
            _ => Vec::new(),
        }
    };

    Ok(DirectoryListing {
        current_path: "virtual://trash".to_string(),
        current_name: "Trash".to_string(),
        home_path,
        home_name,
        breadcrumbs: vec![BreadcrumbItem {
            name: "Trash".to_string(),
            path: "virtual://trash".to_string(),
        }],
        entries,
        empty_message: Some("Trash is empty".to_string()),
    })
}

#[cfg(not(target_os = "windows"))]
fn clear_dir_contents(dir: &Path) -> Result<(), String> {
    if !dir.is_dir() {
        return Ok(());
    }
    let read_dir = fs::read_dir(dir).map_err(|e| format!("Unable to access Trash: {}", e))?;
    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(&path)
                .map_err(|e| format!("Failed to remove trashed folder: {}", e))?;
        } else {
            fs::remove_file(&path)
                .map_err(|e| format!("Failed to remove trashed file: {}", e))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    let (_, home_path, _) = home_info()?;
    Ok(home_path)
}

#[tauri::command]
fn get_sidebar_locations() -> Result<SidebarLocations, String> {
    let (_, home_path, home_name) = home_info()?;
    Ok(SidebarLocations {
        home_path,
        home_name,
        desktop_path: dirs::desktop_dir().map(|p| p.to_string_lossy().into_owned()),
        documents_path: dirs::document_dir().map(|p| p.to_string_lossy().into_owned()),
        downloads_path: dirs::download_dir().map(|p| p.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
async fn list_directory(
    path: Option<String>,
    show_hidden: Option<bool>,
    apps_cache: tauri::State<'_, Arc<AppsCache>>,
) -> Result<DirectoryListing, String> {
    let target = path.unwrap_or_default();
    let include_hidden = show_hidden.unwrap_or(false);
    let cache = Arc::clone(apps_cache.inner());

    tauri::async_runtime::spawn_blocking(move || match target.as_str() {
        "" => {
            let (home, _, _) = home_info()?;
            list_fs_directory(&home, include_hidden)
        }
        "virtual://recents" => list_recents(include_hidden),
        "virtual://applications" => list_applications(&cache),
        "virtual://computer" => list_computer(),
        "virtual://network" => list_network(),
        "virtual://trash" => list_trash(include_hidden),
        raw => list_fs_directory(Path::new(raw), include_hidden),
    })
    .await
    .map_err(|e| format!("Failed to load location: {}", e))?
}

#[tauri::command]
fn open_item(path: String, entry_kind: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        if entry_kind == "app" {
            let aumid = path.strip_prefix("app://").unwrap_or(&path);
            Command::new("explorer.exe")
                .arg(format!("shell:AppsFolder\\{}", aumid))
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Failed to launch application: {}", e))?;
            return Ok(());
        }

        Command::new("cmd")
            .args(["/C", "start", "", &path])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to open item: {}", e))?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        let _ = entry_kind;
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open item: {}", e))?;
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = entry_kind;
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open item: {}", e))?;
        Ok(())
    }
}

#[tauri::command]
async fn show_context_menu(
    window: tauri::Window,
    path: String,
    entry_kind: String,
) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd_raw = window
            .hwnd()
            .map_err(|e| format!("Failed to get window handle: {}", e))?
            .0 as isize;
        let (tx, rx) = std::sync::mpsc::channel();
        window
            .run_on_main_thread(move || {
                let res = win_shell::show_shell_context_menu(hwnd_raw, &path, &entry_kind);
                let _ = tx.send(res);
            })
            .map_err(|e| format!("Failed to dispatch context menu: {}", e))?;

        tauri::async_runtime::spawn_blocking(move || {
            rx.recv()
                .map_err(|_| "Context menu task cancelled".to_string())?
        })
        .await
        .map_err(|e| format!("Context menu failed: {}", e))?
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, path, entry_kind);
        Ok(false)
    }
}

#[tauri::command]
fn copy_file_to_clipboard(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        win_shell::copy_file_to_clipboard(&path)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("Copy File is not yet implemented on this OS".to_string())
    }
}

#[tauri::command]
fn reveal_in_file_manager(path: String, select: Option<bool>) -> Result<(), String> {
    let should_select = select.unwrap_or(true);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = Command::new("explorer.exe");
        if should_select {
            cmd.arg(format!("/select,{}", path));
        } else {
            cmd.arg(&path);
        }
        cmd.creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to open File Explorer: {}", e))?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("open");
        if should_select {
            cmd.args(["-R", &path]);
        } else {
            cmd.arg(&path);
        }
        cmd.spawn()
            .map_err(|e| format!("Failed to reveal in Finder: {}", e))?;
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let target = if should_select {
            Path::new(&path)
                .parent()
                .unwrap_or_else(|| Path::new(&path))
        } else {
            Path::new(&path)
        };
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
        Ok(())
    }
}

#[tauri::command]
fn create_new_folder(parent_path: String) -> Result<String, String> {
    let parent = Path::new(&parent_path);
    if !parent.is_dir() {
        return Err("Cannot create a folder in this location".to_string());
    }

    let mut candidate = parent.join("New folder");
    let mut index = 2u32;
    while candidate.exists() {
        if index > 999 {
            return Err("Too many folders named 'New folder' already exist".to_string());
        }
        candidate = parent.join(format!("New folder ({})", index));
        index += 1;
    }

    fs::create_dir(&candidate).map_err(|e| format!("Failed to create folder: {}", e))?;
    Ok(candidate.to_string_lossy().into_owned())
}

#[tauri::command]
fn open_in_terminal(path: String) -> Result<(), String> {
    let raw = Path::new(&path);
    let dir = if raw.is_dir() {
        raw.to_path_buf()
    } else if raw.exists() {
        raw.parent()
            .filter(|p| p.is_dir())
            .map(Path::to_path_buf)
            .ok_or_else(|| "Cannot determine parent folder for this item".to_string())?
    } else {
        return Err("Cannot open terminal for this location".to_string());
    };
    let dir_str = dir.to_string_lossy().into_owned();

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // Prefer Windows Terminal if installed, otherwise fall back to PowerShell
        if Command::new("wt.exe")
            .args(["-d", &dir_str])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .is_ok()
        {
            return Ok(());
        }

        Command::new("cmd")
            .args(["/C", "start", "powershell.exe", "-NoExit"])
            .current_dir(&dir)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to open Terminal: {}", e))?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-a", "Terminal", &dir_str])
            .spawn()
            .map_err(|e| format!("Failed to open Terminal: {}", e))?;
        Ok(())
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = dir_str;
        std::process::Command::new("x-terminal-emulator")
            .current_dir(&dir)
            .spawn()
            .map_err(|e| format!("Failed to open Terminal: {}", e))?;
        Ok(())
    }
}

#[tauri::command]
async fn share_with_os(window: tauri::Window, path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd_raw = window
            .hwnd()
            .map_err(|e| format!("Failed to get window handle: {}", e))?
            .0 as isize;
        let (tx, rx) = std::sync::mpsc::channel();
        window
            .run_on_main_thread(move || {
                let res = win_shell::show_windows_share_sheet(hwnd_raw, &path);
                let _ = tx.send(res);
            })
            .map_err(|e| format!("Failed to open Windows Share: {}", e))?;

        tauri::async_runtime::spawn_blocking(move || {
            rx.recv()
                .map_err(|_| "Windows Share task cancelled".to_string())?
        })
        .await
        .map_err(|e| format!("Windows Share failed: {}", e))?
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, path);
        Err("Native OS Share is not yet implemented on this OS".to_string())
    }
}

#[tauri::command]
fn load_app_state(store: tauri::State<'_, Arc<AppStateStore>>) -> PersistedAppState {
    store.snapshot()
}

#[tauri::command]
fn save_panel_states(
    active_panel: String,
    panels: BTreeMap<String, PanelState>,
    store: tauri::State<'_, Arc<AppStateStore>>,
) {
    store.update_panels(active_panel, panels);
}

#[tauri::command]
fn resolve_panel_path(saved_path: Option<String>, root_path: String) -> String {
    resolve_existing_dir(saved_path.as_deref(), &root_path)
}

#[tauri::command]
fn save_custom_favorites(
    favorites: Vec<FavoriteFolder>,
    store: tauri::State<'_, Arc<AppStateStore>>,
) {
    store.update_custom_favorites(favorites);
}

#[tauri::command]
fn save_settings(
    settings: AppSettings,
    store: tauri::State<'_, Arc<AppStateStore>>,
) {
    store.update_settings(settings);
}

#[tauri::command]
fn check_directory_exists(path: String) -> bool {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed.starts_with("virtual://") {
        return false;
    }
    Path::new(trimmed).is_dir()
}

#[tauri::command]
fn validate_favorite_dirs(paths: Vec<String>) -> Vec<FavoriteFolder> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();
    for raw in paths {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with("virtual://") {
            continue;
        }
        let p = Path::new(trimmed);
        if !p.is_dir() {
            continue;
        }
        let key = normalize_path_key(trimmed);
        if !seen.insert(key) {
            continue;
        }
        result.push(FavoriteFolder {
            name: display_name_for_path(p),
            path: trimmed.to_string(),
        });
    }
    result
}

#[tauri::command]
async fn empty_trash() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(|| {
        #[cfg(target_os = "windows")]
        {
            win_shell::empty_recycle_bin()
        }

        #[cfg(target_os = "macos")]
        {
            if let Some(trash_dir) = dirs::home_dir().map(|h| h.join(".Trash")) {
                clear_dir_contents(&trash_dir)?;
            }
            Ok(())
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            if let Some(base) = dirs::data_local_dir().map(|d| d.join("Trash")) {
                clear_dir_contents(&base.join("files"))?;
                clear_dir_contents(&base.join("info"))?;
            }
            Ok(())
        }
    })
    .await
    .map_err(|e| format!("Failed to empty Trash: {}", e))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let apps_cache = AppsCache::new();
    apps_cache.start_preload();
    let state_store = AppStateStore::load();
    let window_ready = Arc::new(AtomicBool::new(false));
    let window_ready_for_setup = Arc::clone(&window_ready);
    let window_ready_for_events = Arc::clone(&window_ready);

    tauri::Builder::default()
        .manage(apps_cache)
        .manage(Arc::clone(&state_store))
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                let store = app.state::<Arc<AppStateStore>>();
                let snapshot = store.snapshot();
                if let Some(win_state) = &snapshot.window {
                    restore_window_state(&window, win_state);
                }
                let _ = window.show();
                let _ = window.set_focus();
            }
            window_ready_for_setup.store(true, Ordering::Release);
            Ok(())
        })
        .on_window_event(move |window, event| {
            if window.label() != "main" {
                return;
            }
            let store = window.state::<Arc<AppStateStore>>();
            match event {
                tauri::WindowEvent::Resized(size) => {
                    if !window_ready_for_events.load(Ordering::Acquire) {
                        return;
                    }
                    if size.width == 0 || size.height == 0 {
                        return;
                    }
                    if window.is_minimized().unwrap_or(false) {
                        return;
                    }
                    let maximized = window.is_maximized().unwrap_or(false);
                    store.update_window_size(size.width, size.height, maximized);
                }
                tauri::WindowEvent::Moved(pos) => {
                    if !window_ready_for_events.load(Ordering::Acquire) {
                        return;
                    }
                    if window.is_minimized().unwrap_or(false) {
                        return;
                    }
                    let maximized = window.is_maximized().unwrap_or(false);
                    if !maximized {
                        store.update_window_position(pos.x, pos.y);
                    }
                }
                tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => {
                    // Capture current bounds if window state was never recorded yet
                    if !window.is_minimized().unwrap_or(false) {
                        let maximized = window.is_maximized().unwrap_or(false);
                        if let Ok(size) = window.inner_size() {
                            if size.width > 0 && size.height > 0 {
                                store.update_window_size(size.width, size.height, maximized);
                            }
                        }
                        if !maximized {
                            if let Ok(pos) = window.outer_position() {
                                store.update_window_position(pos.x, pos.y);
                            }
                        }
                    }
                    store.save_now();
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_home_dir,
            get_sidebar_locations,
            list_directory,
            open_item,
            show_context_menu,
            copy_file_to_clipboard,
            reveal_in_file_manager,
            create_new_folder,
            open_in_terminal,
            share_with_os,
            load_app_state,
            save_panel_states,
            resolve_panel_path,
            save_custom_favorites,
            save_settings,
            check_directory_exists,
            validate_favorite_dirs,
            empty_trash
        ])
        .run(tauri::generate_context!())
        .expect("error while running WinFinder");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persisted_app_state_defaults_settings_when_missing() {
        let legacy_json = r#"{"activePanel":"home","panels":{}}"#;
        let state: PersistedAppState = serde_json::from_str(legacy_json).unwrap();
        assert!(!state.settings.use_windows_window_controls);
    }

    #[test]
    fn persisted_app_state_roundtrips_settings() {
        let mut state = PersistedAppState::default();
        state.settings.use_windows_window_controls = true;
        let json = serde_json::to_string(&state).unwrap();
        assert!(json.contains("useWindowsWindowControls"));
        let decoded: PersistedAppState = serde_json::from_str(&json).unwrap();
        assert!(decoded.settings.use_windows_window_controls);
    }

    #[test]
    fn clamped_window_dimensions_enforces_minimums() {
        let too_small = WindowState {
            width: 300,
            height: 200,
            x: Some(100),
            y: Some(100),
            maximized: false,
        };
        assert_eq!(clamped_window_dimensions(&too_small), (700, 420));

        let normal = WindowState {
            width: 1440,
            height: 900,
            x: Some(50),
            y: Some(60),
            maximized: true,
        };
        assert_eq!(clamped_window_dimensions(&normal), (1440, 900));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn build_breadcrumbs_full_windows_path_inside_home() {
        let crumbs = build_breadcrumbs(Path::new(r"C:\Users\chris\Documents"));
        let pairs: Vec<(&str, &str)> = crumbs
            .iter()
            .map(|c| (c.name.as_str(), c.path.as_str()))
            .collect();
        assert_eq!(
            pairs,
            vec![
                (r"C:\", r"C:\"),
                ("Users", r"C:\Users"),
                ("chris", r"C:\Users\chris"),
                ("Documents", r"C:\Users\chris\Documents"),
            ]
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn build_breadcrumbs_windows_root_and_deep_path() {
        let root = build_breadcrumbs(Path::new(r"C:\"));
        assert_eq!(root.len(), 1);
        assert_eq!(root[0].name, r"C:\");
        assert_eq!(root[0].path, r"C:\");

        let deep = build_breadcrumbs(Path::new(r"C:\Users\chris\Documents\GitHub\WinFinder\src\components"));
        let names: Vec<&str> = deep.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(
            names,
            vec![r"C:\", "Users", "chris", "Documents", "GitHub", "WinFinder", "src", "components"]
        );
    }

    #[cfg(not(target_os = "windows"))]
    #[test]
    fn build_breadcrumbs_full_unix_path() {
        let crumbs = build_breadcrumbs(Path::new("/Users/chris/Documents"));
        let pairs: Vec<(&str, &str)> = crumbs
            .iter()
            .map(|c| (c.name.as_str(), c.path.as_str()))
            .collect();
        assert_eq!(
            pairs,
            vec![
                ("/", "/"),
                ("Users", "/Users"),
                ("chris", "/Users/chris"),
                ("Documents", "/Users/chris/Documents"),
            ]
        );
    }
}
