mod cli;

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, UNIX_EPOCH};
use tauri::{Emitter, Manager};

const TRACKED_PANELS: &[&str] = &["recents", "desktop", "documents", "downloads", "home"];
const MAX_FAVORITES: usize = 10;

fn is_custom_favorite_panel(panel_id: &str) -> bool {
    panel_id
        .strip_prefix("fav:")
        .map(|p| {
            let trimmed = p.trim();
            !trimmed.is_empty() && !trimmed.starts_with("virtual://")
        })
        .unwrap_or(false)
}

fn is_tracked_panel(panel_id: &str) -> bool {
    TRACKED_PANELS.contains(&panel_id) || is_custom_favorite_panel(panel_id)
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

fn normalize_for_subtree_check(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with("virtual://") {
        return trimmed.to_lowercase();
    }
    let slashed = trimmed.replace('\\', "/");
    let stripped = slashed.trim_end_matches('/');
    let canonical = if stripped.is_empty() {
        "/".to_string()
    } else if stripped.len() == 2 && stripped.as_bytes()[1] == b':' {
        format!("{}/", stripped)
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

fn is_path_within_root(path: &str, root: &str) -> bool {
    let norm_path = normalize_for_subtree_check(path);
    let norm_root = normalize_for_subtree_check(root);
    if norm_path.is_empty() || norm_root.is_empty() {
        return false;
    }
    if norm_root.starts_with("virtual://") {
        return norm_path == norm_root;
    }
    if norm_path == norm_root {
        return true;
    }
    if norm_root.ends_with('/') {
        norm_path.starts_with(&norm_root)
    } else {
        norm_path.starts_with(&norm_root)
            && norm_path.as_bytes().get(norm_root.len()) == Some(&b'/')
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

fn default_theme() -> String {
    "light".to_string()
}

fn sanitize_theme(theme: &str) -> String {
    if theme.eq_ignore_ascii_case("dark") {
        "dark".to_string()
    } else {
        "light".to_string()
    }
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct SidebarVisibilitySettings {
    #[serde(default = "default_true")]
    pub recents: bool,
    #[serde(default = "default_true")]
    pub applications: bool,
    #[serde(default = "default_true")]
    pub desktop: bool,
    #[serde(default = "default_true")]
    pub documents: bool,
    #[serde(default = "default_true")]
    pub downloads: bool,
    #[serde(default = "default_true")]
    pub home: bool,
    #[serde(default = "default_true")]
    pub drives: bool,
    #[serde(default = "default_true")]
    pub network: bool,
    #[serde(default = "default_true")]
    pub trash: bool,
}

impl Default for SidebarVisibilitySettings {
    fn default() -> Self {
        Self {
            recents: true,
            applications: true,
            desktop: true,
            documents: true,
            downloads: true,
            home: true,
            drives: true,
            network: true,
            trash: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub use_windows_window_controls: bool,
    pub sidebar_visibility: SidebarVisibilitySettings,
    pub use_everything_cli: Option<bool>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub use_beige_app_icon: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            use_windows_window_controls: false,
            sidebar_visibility: SidebarVisibilitySettings::default(),
            use_everything_cli: None,
            theme: default_theme(),
            use_beige_app_icon: false,
        }
    }
}

const APP_ICON_PNG: &[u8] = include_bytes!("../icons/128x128@2x.png");

fn decode_png_rgba(bytes: &[u8]) -> Result<(Vec<u8>, u32, u32), String> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder
        .read_info()
        .map_err(|e| format!("Failed to decode app icon PNG: {}", e))?;
    let mut buf = vec![0u8; reader.output_buffer_size().unwrap_or(256 * 256 * 4)];
    let info = reader
        .next_frame(&mut buf)
        .map_err(|e| format!("Failed to read app icon PNG frame: {}", e))?;
    let raw = &buf[..info.buffer_size()];
    let rgba = match info.color_type {
        png::ColorType::Rgba => raw.to_vec(),
        png::ColorType::Rgb => {
            let mut out = Vec::with_capacity((info.width * info.height * 4) as usize);
            for chunk in raw.chunks_exact(3) {
                out.extend_from_slice(&[chunk[0], chunk[1], chunk[2], 255]);
            }
            out
        }
        _ => return Err("Unsupported app icon PNG color type".to_string()),
    };
    Ok((rgba, info.width, info.height))
}

fn recolor_icon_to_explorer_beige(rgba: &mut [u8], width: u32, height: u32) {
    let w_denom = width.saturating_sub(1).max(1) as f32;
    let h_denom = height.saturating_sub(1).max(1) as f32;
    for y in 0..height {
        for x in 0..width {
            let idx = ((y * width + x) * 4) as usize;
            let r = rgba[idx] as f32;
            let g = rgba[idx + 1] as f32;
            let b = rgba[idx + 2] as f32;
            let a = rgba[idx + 3] as f32;
            if a <= 12.0 {
                continue;
            }
            let lum = 0.299 * r + 0.587 * g + 0.114 * b;
            let is_square_region = (b > r + 15.0) || (lum > 170.0);
            if !is_square_region {
                continue;
            }
            let t = ((x as f32 / w_denom) * 0.55 + (y as f32 / h_denom) * 0.45).clamp(0.0, 1.0);
            // Classic Windows Explorer folder beige/manila gradient
            let beige_r = 248.0 * (1.0 - t) + 216.0 * t;
            let beige_g = 223.0 * (1.0 - t) + 172.0 * t;
            let beige_b = 152.0 * (1.0 - t) + 84.0 * t;

            let expected_blue_r = 98.0 * (1.0 - t) + 12.0 * t;
            let mut white_mix = ((r - expected_blue_r - 12.0) / (255.0 - expected_blue_r - 12.0))
                .clamp(0.0, 1.0);
            if a <= 40.0 || lum <= 110.0 {
                white_mix = 0.0;
            }
            white_mix = ((white_mix - 0.06) / 0.88).clamp(0.0, 1.0);

            let expected_blue_g = 205.0 * (1.0 - t) + 122.0 * t;
            let mut shadow_darken = ((expected_blue_g - g) / 140.0).clamp(0.0, 0.22);
            if a <= 200.0 || white_mix >= 0.05 || b <= r + 40.0 {
                shadow_darken = 0.0;
            }

            let black_val = 22.0f32;
            let sq_r = beige_r * (1.0 - shadow_darken * 0.6);
            let sq_g = beige_g * (1.0 - shadow_darken * 0.6);
            let sq_b = beige_b * (1.0 - shadow_darken * 0.6);

            rgba[idx] = (sq_r * (1.0 - white_mix) + black_val * white_mix).clamp(0.0, 255.0) as u8;
            rgba[idx + 1] =
                (sq_g * (1.0 - white_mix) + black_val * white_mix).clamp(0.0, 255.0) as u8;
            rgba[idx + 2] =
                (sq_b * (1.0 - white_mix) + black_val * white_mix).clamp(0.0, 255.0) as u8;
        }
    }
}

fn apply_app_icon(window: &tauri::WebviewWindow, use_beige: bool) {
    if let Ok((mut rgba, width, height)) = decode_png_rgba(APP_ICON_PNG) {
        if use_beige {
            recolor_icon_to_explorer_beige(&mut rgba, width, height);
        }
        let icon = tauri::image::Image::new_owned(rgba, width, height);
        let _ = window.set_icon(icon);
    }
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
        // 1. Clean custom_favorites first so we know which fav:<path> panel keys are valid
        let mut seen = std::collections::HashSet::new();
        let mut fav_panel_by_key: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        let mut cleaned = Vec::new();
        for fav in std::mem::take(&mut self.custom_favorites) {
            let trimmed_path = fav.path.trim().to_string();
            if trimmed_path.is_empty() || trimmed_path.starts_with("virtual://") {
                continue;
            }
            let key = normalize_path_key(&trimmed_path);
            if !seen.insert(key.clone()) {
                continue;
            }
            let name = if fav.name.trim().is_empty() {
                display_name_for_path(Path::new(&trimmed_path))
            } else {
                fav.name.trim().to_string()
            };
            fav_panel_by_key.insert(key, format!("fav:{}", trimmed_path));
            cleaned.push(FavoriteFolder {
                name,
                path: trimmed_path,
            });
            if cleaned.len() >= MAX_FAVORITES {
                break;
            }
        }
        self.custom_favorites = cleaned;

        // 2. Validate & canonicalize active_panel
        if let Some(fav_path) = self.active_panel.strip_prefix("fav:") {
            let key = normalize_path_key(fav_path);
            if let Some(canonical_panel) = fav_panel_by_key.get(&key) {
                self.active_panel = canonical_panel.clone();
            } else {
                self.active_panel = "home".to_string();
            }
        } else if !TRACKED_PANELS.contains(&self.active_panel.as_str()) {
            self.active_panel = "home".to_string();
        }

        // 3. Retain & canonicalize tracked panels (built-in + existing custom favorites)
        let mut sanitized_panels = BTreeMap::new();
        for (panel_key, mut panel) in std::mem::take(&mut self.panels) {
            let canonical_key = if let Some(fav_path) = panel_key.strip_prefix("fav:") {
                let key = normalize_path_key(fav_path);
                match fav_panel_by_key.get(&key) {
                    Some(canonical) => {
                        let root_path = &canonical[4..];
                        if let Some(last_path) = panel.last_path.as_deref() {
                            if !is_path_within_root(last_path, root_path) {
                                panel.last_path = Some(root_path.to_string());
                                panel.expanded_paths.clear();
                                panel.column_paths.clear();
                            }
                        }
                        canonical.clone()
                    }
                    None => continue,
                }
            } else if TRACKED_PANELS.contains(&panel_key.as_str()) {
                panel_key
            } else {
                continue;
            };

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

            sanitized_panels.insert(canonical_key, panel);
        }
        self.panels = sanitized_panels;
        self.settings.theme = sanitize_theme(&self.settings.theme);
    }
}

fn config_file_path_for_home(home: &Path) -> PathBuf {
    home.join(".winfinder").join("config.json")
}

/// Migrates a legacy `~/.winfinder` regular file to `~/.winfinder/config.json`.
/// Returns `Some(state)` if a legacy file existed and parsed as valid `PersistedAppState`.
fn migrate_legacy_config_file(home: &Path) -> Option<PersistedAppState> {
    let legacy_path = home.join(".winfinder");
    if !legacy_path.is_file() {
        return None;
    }

    let raw = fs::read_to_string(&legacy_path).ok();
    let parsed = raw
        .as_deref()
        .and_then(|s| serde_json::from_str::<PersistedAppState>(s).ok());

    let backup_path = home.join(".winfinder.legacy.tmp");
    let _ = fs::remove_file(&backup_path);
    if fs::rename(&legacy_path, &backup_path).is_err() {
        return parsed;
    }

    if fs::create_dir_all(&legacy_path).is_err() {
        // Roll back so the legacy file is not lost.
        let _ = fs::rename(&backup_path, &legacy_path);
        return parsed;
    }

    let target_path = config_file_path_for_home(home);
    if parsed.is_some() {
        if fs::rename(&backup_path, &target_path).is_err() {
            if let Some(raw_str) = raw {
                let _ = fs::write(&target_path, raw_str);
            }
            let _ = fs::remove_file(&backup_path);
        }
    } else {
        let _ = fs::remove_file(&backup_path);
    }

    parsed
}

struct AppStateStore {
    state_path: Option<PathBuf>,
    state: Mutex<PersistedAppState>,
    dirty: Mutex<bool>,
    dirty_cv: Condvar,
}

impl AppStateStore {
    fn from_home(home: Option<PathBuf>) -> Self {
        let (state_path, mut initial) = match home {
            Some(home_dir) => {
                let migrated = migrate_legacy_config_file(&home_dir);
                let config_path = config_file_path_for_home(&home_dir);
                let loaded = migrated
                    .or_else(|| {
                        fs::read_to_string(&config_path)
                            .ok()
                            .and_then(|raw| serde_json::from_str::<PersistedAppState>(&raw).ok())
                    })
                    .unwrap_or_default();
                (Some(config_path), loaded)
            }
            None => (None, PersistedAppState::default()),
        };
        initial.sanitize();

        Self {
            state_path,
            state: Mutex::new(initial),
            dirty: Mutex::new(false),
            dirty_cv: Condvar::new(),
        }
    }

    fn load() -> Arc<Self> {
        let store = Arc::new(Self::from_home(dirs::home_dir()));
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

                // Batch dirty state changes and flush to ~/.winfinder/config.json every 5 seconds
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
        if let Some(parent) = path.parent() {
            if parent.is_file() {
                let _ = fs::remove_file(parent);
            }
            if fs::create_dir_all(parent).is_err() {
                return;
            }
        }
        let tmp_path = path.with_file_name("config.json.tmp");
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

    fn update_settings(&self, mut settings: AppSettings) {
        settings.theme = sanitize_theme(&settings.theme);
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
        if !trimmed.is_empty()
            && !trimmed.starts_with("virtual://")
            && is_path_within_root(trimmed, root_path)
        {
            let mut candidate = PathBuf::from(trimmed);
            loop {
                let candidate_str = candidate.to_string_lossy();
                if !is_path_within_root(&candidate_str, root_path) {
                    break;
                }
                if candidate.is_dir() {
                    return candidate_str.into_owned();
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
    pub is_locked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockDriveResult {
    pub unlocked: bool,
    pub cancelled: bool,
    pub drive_root: String,
    pub message: Option<String>,
}

/// Extracts a normalized Windows drive root (e.g. `D:\`) from a drive path or subfolder path.
fn extract_windows_drive_root(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let stripped = trimmed
        .strip_prefix(r"\\?\")
        .or_else(|| trimmed.strip_prefix(r"\\.\"))
        .unwrap_or(trimmed);
    let bytes = stripped.as_bytes();
    if bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' {
        if bytes.len() == 2 || bytes[2] == b'\\' || bytes[2] == b'/' {
            let letter = (bytes[0] as char).to_ascii_uppercase();
            return Some(format!("{}:\\", letter));
        }
    }
    None
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

    let read_dir = fs::read_dir(target).map_err(|e| {
        #[cfg(target_os = "windows")]
        {
            if let Some(drive_root) = win_shell::check_bitlocker_locked_error(target, &e) {
                return format!("BITLOCKER_LOCKED:{}", drive_root);
            }
        }
        format!("Unable to read folder contents: {}", e)
    })?;

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
            is_locked: false,
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
                    is_locked: false,
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
    use super::{extract_windows_drive_root, ContextMenuResult, FileEntry, UnlockDriveResult};
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
    use std::collections::HashSet;
    use std::mem::size_of;
    use std::path::Path;
    use windows::ApplicationModel::DataTransfer::{
        DataRequestedEventArgs, DataTransferManager,
    };
    use windows::Foundation::TypedEventHandler;
    use windows::Storage::{IStorageItem, StorageFile};
    use windows::core::{GUID, HSTRING, Interface, PCSTR, PCWSTR, PSTR, PWSTR};
    use windows::Win32::Foundation::{
        CloseHandle, E_UNEXPECTED, GetLastError, GlobalFree, HANDLE, HWND, LPARAM, POINT,
        PROPERTYKEY, SIZE, WAIT_EVENT, WAIT_OBJECT_0, WPARAM,
    };
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
    };
    use windows::Win32::Storage::FileSystem::{
        FindCloseChangeNotification, FindFirstChangeNotificationW, FindNextChangeNotification,
        GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW, FILE_NOTIFY_CHANGE_ATTRIBUTES,
        FILE_NOTIFY_CHANGE_DIR_NAME, FILE_NOTIFY_CHANGE_FILE_NAME, FILE_NOTIFY_CHANGE_LAST_WRITE,
        FILE_NOTIFY_CHANGE_SIZE,
    };
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
    use windows::Win32::System::Threading::{
        CreateEventW, SetEvent, WaitForMultipleObjects, WaitForSingleObject, INFINITE,
    };
    use windows::Win32::UI::Shell::{
        BHID_EnumItems, BHID_SFUIObject, FOLDERID_AppsFolder, FOLDERID_RecycleBinFolder,
        IContextMenu, IDataTransferManagerInterop, IEnumShellItems, IShellItem, IShellItem2,
        IShellItemImageFactory, SHCreateItemFromParsingName, SHCreateItemFromRelativeName,
        SHEmptyRecycleBinW, SHGetKnownFolderItem, ShellExecuteExW, CMF_CANRENAME, CMF_EXPLORE,
        CMF_NORMAL, CMIC_MASK_PTINVOKE, CMINVOKECOMMANDINFO, CMINVOKECOMMANDINFOEX, DROPFILES,
        GCS_VERBA, GCS_VERBW, KF_FLAG_DEFAULT, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOCLOSEPROCESS,
        SEE_MASK_UNICODE,
        SHELLEXECUTEINFOW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI,
        SIGDN_DESKTOPABSOLUTEPARSING, SIGDN_FILESYSPATH, SIGDN_NORMALDISPLAY,
        SIGDN_PARENTRELATIVEPARSING, SIIGBF_BIGGERSIZEOK, SIIGBF_ICONONLY,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreatePopupMenu, DestroyMenu, GetCursorPos, InsertMenuW, PostMessageW, SetForegroundWindow,
        TrackPopupMenuEx, MF_BYPOSITION, MF_SEPARATOR, MF_STRING, SW_SHOWNORMAL, TPM_RETURNCMD,
        TPM_RIGHTBUTTON, WM_NULL,
    };

    const DRIVE_REMOTE: u32 = 4;
    /// `FVE_E_LOCKED_VOLUME` (`0x80310000` / `2150694912`): This drive is locked by BitLocker Drive Encryption.
    pub(super) const FVE_E_LOCKED_VOLUME: u32 = 0x8031_0000;
    const ERROR_ACCESS_DENIED_CODE: u32 = 5;
    /// `System.Volume.BitLockerProtection` property key (`{49691C90-7E17-101A-A91C-08002B2ECDA9}`, pid 2).
    /// Value `6` indicates the volume is BitLocker-encrypted and currently locked.
    const PKEY_VOLUME_BITLOCKER_PROTECTION: PROPERTYKEY = PROPERTYKEY {
        fmtid: GUID::from_u128(0x49691c90_7e17_101a_a91c_08002b2ecda9),
        pid: 2,
    };
    const BITLOCKER_PROTECTION_LOCKED: i32 = 6;

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
                            is_locked: false,
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

    fn is_drive_bitlocker_locked_via_shell_prop(root: &str) -> bool {
        unsafe {
            let co_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let should_uninit = co_hr.is_ok();

            let locked = (|| -> bool {
                let Ok(item): Result<IShellItem2, _> =
                    SHCreateItemFromParsingName(&HSTRING::from(root), None)
                else {
                    return false;
                };
                match item.GetInt32(&PKEY_VOLUME_BITLOCKER_PROTECTION) {
                    Ok(status) => status == BITLOCKER_PROTECTION_LOCKED,
                    Err(_) => false,
                }
            })();

            if should_uninit {
                CoUninitialize();
            }
            locked
        }
    }

    pub fn is_drive_bitlocker_locked(root: &str) -> bool {
        let wide = HSTRING::from(root);
        let vol_res = unsafe { GetVolumeInformationW(&wide, None, None, None, None, None) };
        if vol_res.is_ok() {
            return false;
        }
        let err_code = unsafe { GetLastError().0 };
        if err_code == FVE_E_LOCKED_VOLUME {
            return true;
        }
        if err_code == ERROR_ACCESS_DENIED_CODE {
            return is_drive_bitlocker_locked_via_shell_prop(root);
        }
        false
    }

    pub fn check_bitlocker_locked_error(target: &Path, err: &std::io::Error) -> Option<String> {
        let raw = err.raw_os_error()? as u32;
        let drive_root = extract_windows_drive_root(&target.to_string_lossy())?;
        if raw == FVE_E_LOCKED_VOLUME {
            return Some(drive_root);
        }
        if raw == ERROR_ACCESS_DENIED_CODE && is_drive_bitlocker_locked(&drive_root) {
            return Some(drive_root);
        }
        None
    }

    pub fn prompt_bitlocker_unlock(hwnd_raw: isize, path: &str) -> Result<UnlockDriveResult, String> {
        let drive_root = extract_windows_drive_root(path)
            .ok_or_else(|| "Only Windows drive volumes can be unlocked with BitLocker.".to_string())?;

        if !is_drive_bitlocker_locked(&drive_root) && std::fs::read_dir(&drive_root).is_ok() {
            return Ok(UnlockDriveResult {
                unlocked: true,
                cancelled: false,
                drive_root,
                message: None,
            });
        }

        let hwnd = HWND(hwnd_raw as *mut _);
        unsafe {
            let co_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let should_uninit = co_hr.is_ok();

            let result = (|| -> Result<UnlockDriveResult, String> {
                // Primary: invoke the native Windows Shell "unlock-bde" verb on the drive root (e.g. D:\)
                let verb = HSTRING::from("unlock-bde");
                let file = HSTRING::from(&drive_root);
                let mut sei = SHELLEXECUTEINFOW {
                    cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
                    fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_UNICODE | SEE_MASK_FLAG_NO_UI,
                    hwnd,
                    lpVerb: PCWSTR(verb.as_ptr()),
                    lpFile: PCWSTR(file.as_ptr()),
                    nShow: SW_SHOWNORMAL.0,
                    ..Default::default()
                };

                let launched_primary = ShellExecuteExW(&mut sei).is_ok();
                let mut proc_handle = sei.hProcess;

                if !launched_primary {
                    // Fallback: launch native bdeunlock.exe directly with drive letter (e.g. "D:")
                    let drive_arg = drive_root.trim_end_matches('\\').to_string();
                    let open_verb = HSTRING::from("open");
                    let exe_name = HSTRING::from("bdeunlock.exe");
                    let params = HSTRING::from(&drive_arg);
                    let mut sei_fallback = SHELLEXECUTEINFOW {
                        cbSize: size_of::<SHELLEXECUTEINFOW>() as u32,
                        fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_UNICODE,
                        hwnd,
                        lpVerb: PCWSTR(open_verb.as_ptr()),
                        lpFile: PCWSTR(exe_name.as_ptr()),
                        lpParameters: PCWSTR(params.as_ptr()),
                        nShow: SW_SHOWNORMAL.0,
                        ..Default::default()
                    };

                    ShellExecuteExW(&mut sei_fallback).map_err(|e| {
                        format!(
                            "Failed to open Windows BitLocker unlock prompt for {}: {}",
                            drive_root, e
                        )
                    })?;
                    proc_handle = sei_fallback.hProcess;
                }

                let waited_for_process = !proc_handle.is_invalid() && !proc_handle.0.is_null();
                if waited_for_process {
                    let _ = WaitForSingleObject(proc_handle, INFINITE);
                    let _ = CloseHandle(proc_handle);
                }

                let is_unlocked =
                    !is_drive_bitlocker_locked(&drive_root) && std::fs::read_dir(&drive_root).is_ok();
                if is_unlocked {
                    Ok(UnlockDriveResult {
                        unlocked: true,
                        cancelled: false,
                        drive_root,
                        message: None,
                    })
                } else if waited_for_process {
                    Ok(UnlockDriveResult {
                        unlocked: false,
                        cancelled: true,
                        drive_root: drive_root.clone(),
                        message: Some(format!(
                            "Drive {} is still locked with BitLocker.",
                            drive_root
                        )),
                    })
                } else {
                    Ok(UnlockDriveResult {
                        unlocked: false,
                        cancelled: false,
                        drive_root: drive_root.clone(),
                        message: Some(format!(
                            "BitLocker unlock prompt opened for {}. Open the drive again once unlocked.",
                            drive_root
                        )),
                    })
                }
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

            let is_locked = if is_remote {
                false
            } else {
                is_drive_bitlocker_locked(&root)
            };

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
                is_locked,
            });
        }

        drives
    }

    pub(super) fn is_recycle_bin_path(path: &str) -> bool {
        let lower = path.replace('/', "\\").to_lowercase();
        lower.contains("\\$recycle.bin\\")
            || lower.contains("::{645ff040-5081-101b-9f08-00aa002f954e}")
            || lower.starts_with("trash://")
    }

    unsafe fn resolve_recycle_bin_shell_item(path: &str) -> Result<IShellItem, String> {
        let recycle_bin: IShellItem =
            SHGetKnownFolderItem(&FOLDERID_RecycleBinFolder, KF_FLAG_DEFAULT, None)
                .map_err(|e| format!("Could not open Windows Recycle Bin: {}", e))?;

        let relative_item: Result<IShellItem, _> =
            SHCreateItemFromRelativeName(&recycle_bin, &HSTRING::from(path), None);
        if let Ok(item) = relative_item {
            return Ok(item);
        }

        let target_key = super::normalize_path_key(path);
        let enum_items: IEnumShellItems = recycle_bin
            .BindToHandler(None, &BHID_EnumItems)
            .map_err(|e| format!("Could not enumerate Recycle Bin items: {}", e))?;

        loop {
            let mut batch: [Option<IShellItem>; 32] = Default::default();
            let mut fetched = 0u32;
            let hr = enum_items.Next(&mut batch, Some(&mut fetched));
            if fetched == 0 {
                break;
            }

            for item in batch.into_iter().take(fetched as usize).flatten() {
                let matches_candidate = [
                    SIGDN_FILESYSPATH,
                    SIGDN_DESKTOPABSOLUTEPARSING,
                    SIGDN_PARENTRELATIVEPARSING,
                ]
                .into_iter()
                .any(|sigdn| {
                    item.GetDisplayName(sigdn)
                        .ok()
                        .and_then(|p| pwstr_to_string(p))
                        .map(|candidate| super::normalize_path_key(&candidate) == target_key)
                        .unwrap_or(false)
                });

                if matches_candidate {
                    return Ok(item);
                }
            }

            if hr.is_err() || fetched < 32 {
                break;
            }
        }

        Err("Could not locate the selected item in the Recycle Bin".to_string())
    }

    unsafe fn get_context_menu_verb(
        context_menu: &IContextMenu,
        verb_id: usize,
    ) -> Option<String> {
        let mut wide_buf = [0u16; 128];
        if context_menu
            .GetCommandString(
                verb_id,
                GCS_VERBW,
                None,
                PSTR(wide_buf.as_mut_ptr() as *mut u8),
                wide_buf.len() as u32,
            )
            .is_ok()
        {
            let len = wide_buf
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(wide_buf.len());
            if len > 0 {
                return Some(String::from_utf16_lossy(&wide_buf[..len]));
            }
        }

        let mut ansi_buf = [0u8; 128];
        if context_menu
            .GetCommandString(
                verb_id,
                GCS_VERBA,
                None,
                PSTR(ansi_buf.as_mut_ptr()),
                ansi_buf.len() as u32,
            )
            .is_ok()
        {
            let len = ansi_buf
                .iter()
                .position(|&b| b == 0)
                .unwrap_or(ansi_buf.len());
            if len > 0 {
                return Some(String::from_utf8_lossy(&ansi_buf[..len]).into_owned());
            }
        }

        None
    }

    pub fn show_shell_context_menu(
        hwnd_raw: isize,
        path: &str,
        entry_kind: &str,
        is_dir: bool,
        is_trash: bool,
    ) -> Result<ContextMenuResult, String> {
        const CUSTOM_OPEN_IN_NEW_TAB_ID: usize = 0x7FFF;
        let is_trash_item = is_trash || is_recycle_bin_path(path);
        let can_rename = !is_trash_item
            && (entry_kind == "file" || entry_kind == "folder")
            && !path.starts_with("virtual://")
            && !path.starts_with("app://")
            && !path.starts_with("trash://");
        unsafe {
            let co_hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let should_uninit = co_hr.is_ok();

            let result = (|| -> Result<ContextMenuResult, String> {
                let shell_item: IShellItem = if is_trash_item {
                    resolve_recycle_bin_shell_item(path)?
                } else if entry_kind == "app" {
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

                let mut query_flags = CMF_NORMAL | CMF_EXPLORE;
                if can_rename {
                    query_flags |= CMF_CANRENAME;
                }

                let query_res = context_menu.QueryContextMenu(
                    hmenu,
                    0,
                    1,
                    0x7FFE,
                    query_flags,
                );
                if query_res.is_err() {
                    let _ = DestroyMenu(hmenu);
                    return Err("Failed to populate context menu".to_string());
                }

                if is_dir && !is_trash_item && !path.starts_with("virtual://") {
                    let open_tab_label = HSTRING::from("Open in New Tab");
                    let _ = InsertMenuW(
                        hmenu,
                        0,
                        MF_BYPOSITION | MF_STRING,
                        CUSTOM_OPEN_IN_NEW_TAB_ID,
                        PCWSTR(open_tab_label.as_ptr()),
                    );
                    let _ = InsertMenuW(
                        hmenu,
                        1,
                        MF_BYPOSITION | MF_SEPARATOR,
                        0,
                        PCWSTR::null(),
                    );
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
                let mut open_in_new_tab = false;
                let mut rename_requested = false;
                if cmd.0 as usize == CUSTOM_OPEN_IN_NEW_TAB_ID {
                    open_in_new_tab = true;
                } else if cmd.0 > 0 {
                    let verb_id = (cmd.0 as usize) - 1;
                    let is_rename_verb = can_rename
                        && get_context_menu_verb(&context_menu, verb_id)
                            .map(|verb| verb.trim().eq_ignore_ascii_case("rename"))
                            .unwrap_or(false);
                    if is_rename_verb {
                        rename_requested = true;
                    } else {
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
                }

                let _ = PostMessageW(Some(hwnd), WM_NULL, WPARAM(0), LPARAM(0));
                let _ = DestroyMenu(hmenu);
                Ok(ContextMenuResult {
                    invoked,
                    open_in_new_tab,
                    rename_requested,
                })
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
                            is_locked: false,
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

    pub struct WinDirWatchHandle {
        stop_event_raw: isize,
        join: Option<std::thread::JoinHandle<()>>,
    }

    impl WinDirWatchHandle {
        pub fn stop(&mut self) {
            if self.stop_event_raw != 0 {
                unsafe {
                    let _ = SetEvent(HANDLE(self.stop_event_raw as *mut _));
                }
            }
            if let Some(join) = self.join.take() {
                let _ = join.join();
            }
            if self.stop_event_raw != 0 {
                unsafe {
                    let _ = CloseHandle(HANDLE(self.stop_event_raw as *mut _));
                }
                self.stop_event_raw = 0;
            }
        }
    }

    impl Drop for WinDirWatchHandle {
        fn drop(&mut self) {
            self.stop();
        }
    }

    pub fn start_directory_watcher<F>(path: String, on_change: F) -> Result<WinDirWatchHandle, String>
    where
        F: Fn(&str) + Send + 'static,
    {
        let stop_event = unsafe { CreateEventW(None, true, false, PCWSTR::null()) }
            .map_err(|e| format!("Failed to create watcher stop event: {}", e))?;
        let stop_event_raw = stop_event.0 as isize;

        let wide_path = HSTRING::from(&path);
        let notify_filter = FILE_NOTIFY_CHANGE_FILE_NAME
            | FILE_NOTIFY_CHANGE_DIR_NAME
            | FILE_NOTIFY_CHANGE_SIZE
            | FILE_NOTIFY_CHANGE_LAST_WRITE
            | FILE_NOTIFY_CHANGE_ATTRIBUTES;

        let change_handle = unsafe {
            FindFirstChangeNotificationW(PCWSTR(wide_path.as_ptr()), false, notify_filter)
        };
        let change_handle = match change_handle {
            Ok(h) => h,
            Err(e) => {
                unsafe {
                    let _ = CloseHandle(stop_event);
                }
                return Err(format!("Failed to watch directory: {}", e));
            }
        };
        let change_handle_raw = change_handle.0 as isize;

        let join = std::thread::spawn(move || {
            let stop_h = HANDLE(stop_event_raw as *mut _);
            let change_h = HANDLE(change_handle_raw as *mut _);
            let handles = [stop_h, change_h];

            loop {
                let wait_res = unsafe { WaitForMultipleObjects(&handles, false, INFINITE) };
                if wait_res == WAIT_OBJECT_0 {
                    // Stop signaled
                    break;
                }
                if wait_res == WAIT_EVENT(WAIT_OBJECT_0.0 + 1) {
                    // Drain rapid burst of changes for ~220ms before notifying UI
                    if unsafe { FindNextChangeNotification(change_h) }.is_err() {
                        on_change(&path);
                        break;
                    }
                    let mut stopped = false;
                    loop {
                        let drain_res = unsafe { WaitForMultipleObjects(&handles, false, 220) };
                        if drain_res == WAIT_OBJECT_0 {
                            stopped = true;
                            break;
                        }
                        if drain_res == WAIT_EVENT(WAIT_OBJECT_0.0 + 1) {
                            if unsafe { FindNextChangeNotification(change_h) }.is_err() {
                                break;
                            }
                            continue;
                        }
                        // WAIT_TIMEOUT: burst settled
                        break;
                    }
                    if stopped {
                        break;
                    }
                    on_change(&path);
                } else {
                    break;
                }
            }

            unsafe {
                let _ = FindCloseChangeNotification(change_h);
            }
        });

        Ok(WinDirWatchHandle {
            stop_event_raw,
            join: Some(join),
        })
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

const MAX_SEARCH_RESULTS: usize = 200;
const MAX_SEARCH_WALK_DIRS: usize = 4000;
const MAX_SEARCH_WALK_DURATION: Duration = Duration::from_secs(4);

fn file_entry_from_metadata(entry_path: &Path, name: String, metadata: &fs::Metadata) -> FileEntry {
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

    FileEntry {
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
        is_locked: false,
    }
}

fn resolve_search_scope(scope_path: Option<&str>) -> Result<PathBuf, String> {
    if let Some(raw) = scope_path {
        let trimmed = raw.trim();
        if !trimmed.is_empty() && !trimmed.starts_with("virtual://") {
            let candidate = PathBuf::from(trimmed);
            if candidate.is_dir() {
                return Ok(candidate);
            }
        }
    }
    let (home, _, _) = home_info()?;
    Ok(home)
}

#[cfg(target_os = "windows")]
fn escape_windows_search_sql_literal(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(target_os = "windows")]
fn build_windows_search_sql(scope: &Path, query: &str) -> String {
    let mut scope_slash = scope.to_string_lossy().replace('\\', "/");
    while scope_slash.len() > 3 && scope_slash.ends_with('/') {
        scope_slash.pop();
    }
    format!(
        "SELECT TOP {} System.ItemPathDisplay FROM SystemIndex WHERE SCOPE='file:{}' AND System.FileName LIKE '%{}%'",
        MAX_SEARCH_RESULTS,
        escape_windows_search_sql_literal(&scope_slash),
        escape_windows_search_sql_literal(query)
    )
}

#[cfg(target_os = "windows")]
fn query_windows_search_index(
    scope: &Path,
    query: &str,
    show_hidden: bool,
) -> Result<Vec<FileEntry>, String> {
    use std::collections::HashSet;
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let sql = build_windows_search_sql(scope, query);
    let ps_script = r#"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$sql = $env:WINFINDER_SEARCH_SQL
$conn = New-Object System.Data.OleDb.OleDbConnection("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
try {
  $conn.Open()
  $cmd = $conn.CreateCommand()
  $cmd.CommandTimeout = 4
  $cmd.CommandText = $sql
  $reader = $cmd.ExecuteReader()
  while ($reader.Read()) {
    $p = $reader.GetValue(0)
    if ($p -and $p -is [string] -and $p.Length -gt 0) {
      [Console]::Out.WriteLine($p)
    }
  }
  $reader.Close()
} finally {
  if ($conn.State -ne 'Closed') { $conn.Close() }
}
"#;

    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            ps_script,
        ])
        .env("WINFINDER_SEARCH_SQL", sql)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to query Windows Search: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Windows Search query failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut seen = HashSet::new();
    let mut entries = Vec::new();

    for line in stdout.lines() {
        let raw_path = line.trim();
        if raw_path.is_empty() {
            continue;
        }
        let key = normalize_path_key(raw_path);
        if !seen.insert(key) {
            continue;
        }
        let entry_path = Path::new(raw_path);
        let Ok(metadata) = fs::metadata(entry_path) else {
            continue;
        };
        let name = display_name_for_path(entry_path);
        if !show_hidden && is_hidden_entry(&name, &metadata) {
            continue;
        }
        entries.push(file_entry_from_metadata(entry_path, name, &metadata));
        if entries.len() >= MAX_SEARCH_RESULTS {
            break;
        }
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

fn walk_search_directory(scope: &Path, query: &str, show_hidden: bool) -> Vec<FileEntry> {
    use std::collections::VecDeque;
    use std::time::Instant;

    let query_lower = query.to_lowercase();
    let started = Instant::now();
    let mut queue = VecDeque::new();
    queue.push_back(scope.to_path_buf());

    let mut entries = Vec::new();
    let mut visited_dirs = 0usize;

    while let Some(dir) = queue.pop_front() {
        if entries.len() >= MAX_SEARCH_RESULTS
            || visited_dirs >= MAX_SEARCH_WALK_DIRS
            || started.elapsed() >= MAX_SEARCH_WALK_DURATION
        {
            break;
        }
        visited_dirs += 1;

        let Ok(read_dir) = fs::read_dir(&dir) else {
            continue;
        };

        for item in read_dir.flatten() {
            let entry_path = item.path();
            let name = item.file_name().to_string_lossy().into_owned();
            let Ok(metadata) = fs::symlink_metadata(&entry_path) else {
                continue;
            };
            if !show_hidden && is_hidden_entry(&name, &metadata) {
                continue;
            }

            let is_symlink = metadata.file_type().is_symlink();
            if name.to_lowercase().contains(&query_lower) {
                let effective_meta = if is_symlink {
                    fs::metadata(&entry_path).unwrap_or(metadata)
                } else {
                    metadata
                };
                entries.push(file_entry_from_metadata(&entry_path, name, &effective_meta));
                if entries.len() >= MAX_SEARCH_RESULTS {
                    break;
                }
                if effective_meta.is_dir() && !is_symlink {
                    queue.push_back(entry_path);
                }
            } else if metadata.is_dir() && !is_symlink {
                queue.push_back(entry_path);
            }
        }
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    entries
}

fn find_executable_in_paths<I, P>(dirs: I, names: &[&str]) -> Option<PathBuf>
where
    I: IntoIterator<Item = P>,
    P: AsRef<Path>,
{
    for dir in dirs {
        let dir_path = dir.as_ref();
        if dir_path.as_os_str().is_empty() {
            continue;
        }
        for name in names {
            let candidate = dir_path.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn find_everything_cli_in_path() -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    find_executable_in_paths(
        std::env::split_paths(&path_var),
        &["es.exe", "es.cmd", "es.bat"],
    )
}

fn build_search_entries_from_paths(
    scope: &Path,
    raw_lines: &str,
    show_hidden: bool,
) -> Vec<FileEntry> {
    use std::collections::HashSet;

    let scope_key = normalize_path_key(&scope.to_string_lossy());
    let mut seen = HashSet::new();
    let mut entries = Vec::new();

    for line in raw_lines.lines() {
        let raw_path = line.trim();
        if raw_path.is_empty() {
            continue;
        }
        let key = normalize_path_key(raw_path);
        if key == scope_key || !seen.insert(key) {
            continue;
        }
        let entry_path = Path::new(raw_path);
        let Ok(metadata) = fs::metadata(entry_path) else {
            continue;
        };
        let name = display_name_for_path(entry_path);
        if !show_hidden && is_hidden_entry(&name, &metadata) {
            continue;
        }
        entries.push(file_entry_from_metadata(entry_path, name, &metadata));
        if entries.len() >= MAX_SEARCH_RESULTS {
            break;
        }
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    entries
}

#[cfg(target_os = "windows")]
fn query_everything_cli(
    scope: &Path,
    query: &str,
    show_hidden: bool,
) -> Result<Vec<FileEntry>, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let es_path = find_everything_cli_in_path()
        .ok_or_else(|| "Everything CLI (es) is not installed in PATH".to_string())?;
    let fetch_limit = if show_hidden {
        MAX_SEARCH_RESULTS
    } else {
        MAX_SEARCH_RESULTS * 3
    };

    let output = Command::new(&es_path)
        .arg("-n")
        .arg(fetch_limit.to_string())
        .arg("-path")
        .arg(scope)
        .arg(query)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Failed to run Everything CLI: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else {
            stdout.trim().to_string()
        };
        return Err(format!("Everything CLI exited with error: {}", detail));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(build_search_entries_from_paths(scope, &stdout, show_hidden))
}

fn perform_search(
    query: &str,
    scope_path: Option<&str>,
    show_hidden: bool,
    use_everything_cli: bool,
) -> Result<DirectoryListing, String> {
    let trimmed = query.trim();
    let (_home, home_path, home_name) = home_info()?;
    let scope = resolve_search_scope(scope_path)?;
    let breadcrumbs = build_breadcrumbs(&scope);

    if trimmed.is_empty() {
        return Ok(DirectoryListing {
            current_path: format!("virtual://search?q="),
            current_name: "Search".to_string(),
            home_path,
            home_name,
            breadcrumbs,
            entries: Vec::new(),
            empty_message: Some("Type to search files and folders".to_string()),
        });
    }

    #[cfg(target_os = "windows")]
    let entries = if use_everything_cli {
        match query_everything_cli(&scope, trimmed, show_hidden) {
            Ok(found) => found,
            Err(_) => match query_windows_search_index(&scope, trimmed, show_hidden) {
                Ok(found) if !found.is_empty() => found,
                _ => walk_search_directory(&scope, trimmed, show_hidden),
            },
        }
    } else {
        match query_windows_search_index(&scope, trimmed, show_hidden) {
            Ok(found) if !found.is_empty() => found,
            _ => walk_search_directory(&scope, trimmed, show_hidden),
        }
    };

    #[cfg(not(target_os = "windows"))]
    let entries = {
        let _ = use_everything_cli;
        walk_search_directory(&scope, trimmed, show_hidden)
    };

    Ok(DirectoryListing {
        current_path: format!("virtual://search?q={}", trimmed),
        current_name: format!("Search: \"{}\"", trimmed),
        home_path,
        home_name,
        breadcrumbs,
        entries,
        empty_message: Some(format!("No items matching \"{}\"", trimmed)),
    })
}

#[tauri::command]
async fn search_directory(
    query: String,
    scope_path: Option<String>,
    show_hidden: Option<bool>,
    store: tauri::State<'_, Arc<AppStateStore>>,
) -> Result<DirectoryListing, String> {
    let include_hidden = show_hidden.unwrap_or(false);
    let use_everything_cli = store.snapshot().settings.use_everything_cli.unwrap_or(true);
    tauri::async_runtime::spawn_blocking(move || {
        perform_search(&query, scope_path.as_deref(), include_hidden, use_everything_cli)
    })
    .await
    .map_err(|e| format!("Search failed: {}", e))?
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextMenuResult {
    invoked: bool,
    open_in_new_tab: bool,
    rename_requested: bool,
}

#[tauri::command]
async fn show_context_menu(
    window: tauri::Window,
    path: String,
    entry_kind: String,
    is_dir: Option<bool>,
    is_trash: Option<bool>,
) -> Result<ContextMenuResult, String> {
    let dir_flag = is_dir.unwrap_or_else(|| entry_kind == "folder" || entry_kind == "drive");
    let trash_flag = is_trash.unwrap_or(false);
    #[cfg(target_os = "windows")]
    {
        let hwnd_raw = window
            .hwnd()
            .map_err(|e| format!("Failed to get window handle: {}", e))?
            .0 as isize;
        let (tx, rx) = std::sync::mpsc::channel();
        window
            .run_on_main_thread(move || {
                let res = win_shell::show_shell_context_menu(
                    hwnd_raw,
                    &path,
                    &entry_kind,
                    dir_flag,
                    trash_flag,
                );
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
        let _ = (window, path, entry_kind, dir_flag, trash_flag);
        Ok(ContextMenuResult {
            invoked: false,
            open_in_new_tab: false,
            rename_requested: false,
        })
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

#[cfg(target_os = "windows")]
fn is_windows_reserved_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).trim_end();
    matches!(
        stem.to_ascii_uppercase().as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn validate_rename_name(raw_name: &str) -> Result<String, String> {
    let name = raw_name.trim();
    if name.is_empty() {
        return Err("Name cannot be empty.".to_string());
    }
    if name == "." || name == ".." {
        return Err("Invalid name.".to_string());
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err("Name cannot contain path separators.".to_string());
    }
    if name.chars().any(|c| c.is_control()) {
        return Err("Name contains invalid control characters.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        const INVALID_WIN_CHARS: &[char] = &['<', '>', ':', '"', '|', '?', '*'];
        if name.chars().any(|c| INVALID_WIN_CHARS.contains(&c)) {
            return Err(
                "Name cannot contain any of the following characters: < > : \" / \\ | ? *"
                    .to_string(),
            );
        }
        if name.ends_with('.') {
            return Err("Name cannot end with a period.".to_string());
        }
        if is_windows_reserved_name(name) {
            return Err(format!("\"{}\" is a reserved device name on Windows.", name));
        }
    }

    let mut comps = Path::new(name).components();
    match (comps.next(), comps.next()) {
        (Some(Component::Normal(_)), None) => Ok(name.to_string()),
        _ => Err("Invalid name.".to_string()),
    }
}

fn rename_fs_item(path: &str, new_name: &str) -> Result<String, String> {
    let trimmed_path = path.trim();
    if trimmed_path.is_empty()
        || trimmed_path.starts_with("virtual://")
        || trimmed_path.starts_with("app://")
        || trimmed_path.starts_with("trash://")
    {
        return Err("This item cannot be renamed.".to_string());
    }

    let source = Path::new(trimmed_path);
    let source_meta = fs::symlink_metadata(source)
        .map_err(|_| "The item to rename could not be found.".to_string())?;

    let parent = source
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| "Cannot rename a root drive or folder.".to_string())?;

    let current_name = source
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| "Cannot determine current item name.".to_string())?;

    let validated = validate_rename_name(new_name)?;
    if validated == current_name {
        return Ok(source.to_string_lossy().into_owned());
    }

    let target = parent.join(&validated);
    let is_case_only = current_name.to_lowercase() == validated.to_lowercase();

    if is_case_only {
        #[cfg(not(target_os = "windows"))]
        {
            if let Ok(target_meta) = fs::symlink_metadata(&target) {
                use std::os::unix::fs::MetadataExt;
                if target_meta.dev() != source_meta.dev() || target_meta.ino() != source_meta.ino()
                {
                    return Err(format!(
                        "An item named \"{}\" already exists in this location.",
                        validated
                    ));
                }
            }
        }
        #[cfg(target_os = "windows")]
        let _ = &source_meta;

        let pid = std::process::id();
        let nanos = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let mut temp_path = parent.join(format!(".winfinder-rename-tmp-{}-{}", pid, nanos));
        let mut attempt = 0u32;
        while fs::symlink_metadata(&temp_path).is_ok() {
            attempt += 1;
            temp_path = parent.join(format!(
                ".winfinder-rename-tmp-{}-{}-{}",
                pid, nanos, attempt
            ));
        }

        fs::rename(source, &temp_path)
            .map_err(|e| format!("Failed to rename \"{}\": {}", current_name, e))?;
        if let Err(e) = fs::rename(&temp_path, &target) {
            let _ = fs::rename(&temp_path, source);
            return Err(format!("Failed to rename \"{}\": {}", current_name, e));
        }
        return Ok(target.to_string_lossy().into_owned());
    }

    if fs::symlink_metadata(&target).is_ok() {
        return Err(format!(
            "An item named \"{}\" already exists in this location.",
            validated
        ));
    }

    fs::rename(source, &target)
        .map_err(|e| format!("Failed to rename \"{}\": {}", current_name, e))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn rename_item(path: String, new_name: String) -> Result<String, String> {
    rename_fs_item(&path, &new_name)
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

struct InitialPath(Option<String>);

fn resolve_initial_path_from_args<I, S>(args: I) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let raw = cli::extract_cli_path_arg(args)?;
    let home = dirs::home_dir();
    let cwd = std::env::current_dir().ok();
    cli::resolve_cli_path_with(&raw, home.as_deref(), cwd.as_deref())
}

#[tauri::command]
fn get_initial_path(initial_path: tauri::State<'_, InitialPath>) -> Option<String> {
    initial_path.0.clone()
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedGoToPath {
    pub directory_path: String,
    pub select_file_path: Option<String>,
}

fn strip_wrapping_quotes(raw: &str) -> &str {
    let trimmed = raw.trim();
    if trimmed.len() >= 2 {
        let bytes = trimmed.as_bytes();
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return trimmed[1..trimmed.len() - 1].trim();
        }
    }
    trimmed
}

fn expand_env_vars(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == '%' {
            if let Some(rel_end) = chars[i + 1..].iter().position(|&c| c == '%') {
                let end = i + 1 + rel_end;
                let var_name: String = chars[i + 1..end].iter().collect();
                if !var_name.is_empty()
                    && !var_name.contains('/')
                    && !var_name.contains('\\')
                {
                    if let Ok(val) = std::env::var(&var_name) {
                        out.push_str(&val);
                        i = end + 1;
                        continue;
                    }
                }
            }
            out.push('%');
            i += 1;
        } else if chars[i] == '$' {
            if i + 1 < chars.len() && chars[i + 1] == '{' {
                if let Some(rel_end) = chars[i + 2..].iter().position(|&c| c == '}') {
                    let end = i + 2 + rel_end;
                    let var_name: String = chars[i + 2..end].iter().collect();
                    if !var_name.is_empty() {
                        if let Ok(val) = std::env::var(&var_name) {
                            out.push_str(&val);
                            i = end + 1;
                            continue;
                        }
                    }
                }
                out.push('$');
                i += 1;
            } else if i + 1 < chars.len() && (chars[i + 1].is_ascii_alphabetic() || chars[i + 1] == '_') {
                let mut end = i + 2;
                while end < chars.len() && (chars[end].is_ascii_alphanumeric() || chars[end] == '_') {
                    end += 1;
                }
                let var_name: String = chars[i + 1..end].iter().collect();
                if let Ok(val) = std::env::var(&var_name) {
                    out.push_str(&val);
                    i = end;
                    continue;
                }
                out.push('$');
                i += 1;
            } else {
                out.push('$');
                i += 1;
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }

    out
}

fn normalize_path_lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    let mut has_root = false;

    for comp in path.components() {
        match comp {
            Component::Prefix(prefix) => {
                out.push(prefix.as_os_str());
            }
            Component::RootDir => {
                has_root = true;
                out.push(comp.as_os_str());
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if matches!(out.components().next_back(), Some(Component::Normal(_))) {
                    out.pop();
                } else if !has_root {
                    out.push(comp.as_os_str());
                }
            }
            Component::Normal(seg) => {
                out.push(seg);
            }
        }
    }

    if out.as_os_str().is_empty() {
        path.to_path_buf()
    } else {
        out
    }
}

fn resolve_user_path(raw_path: &str, base_dir: Option<&str>) -> Result<ResolvedGoToPath, String> {
    let cleaned = strip_wrapping_quotes(raw_path);
    if cleaned.is_empty() {
        return Err("Please enter a folder or file path.".to_string());
    }

    let expanded = expand_env_vars(cleaned);
    let expanded = expanded.trim();
    if expanded.is_empty() {
        return Err("Please enter a folder or file path.".to_string());
    }

    let mut candidate = if expanded == "~" {
        dirs::home_dir().ok_or_else(|| "Could not locate home directory.".to_string())?
    } else if let Some(rest) = expanded.strip_prefix("~/").or_else(|| expanded.strip_prefix("~\\")) {
        let home = dirs::home_dir().ok_or_else(|| "Could not locate home directory.".to_string())?;
        home.join(rest)
    } else {
        #[cfg(target_os = "windows")]
        let adjusted = if expanded.len() == 2
            && expanded.as_bytes()[0].is_ascii_alphabetic()
            && expanded.as_bytes()[1] == b':'
        {
            format!("{}\\", expanded)
        } else {
            expanded.to_string()
        };

        #[cfg(not(target_os = "windows"))]
        let adjusted = expanded.to_string();

        PathBuf::from(adjusted)
    };

    if !candidate.is_absolute() {
        let base = base_dir
            .map(str::trim)
            .filter(|b| !b.is_empty() && !b.starts_with("virtual://"))
            .map(PathBuf::from)
            .filter(|p| p.is_dir())
            .or_else(dirs::home_dir)
            .ok_or_else(|| "Could not determine base folder for relative path.".to_string())?;
        candidate = base.join(candidate);
    }

    let resolved = normalize_path_lexical(&candidate);

    let metadata = fs::metadata(&resolved)
        .map_err(|_| format!("The folder \"{}\" can't be found.", cleaned))?;

    if metadata.is_dir() {
        Ok(ResolvedGoToPath {
            directory_path: resolved.to_string_lossy().into_owned(),
            select_file_path: None,
        })
    } else {
        let parent = resolved
            .parent()
            .filter(|p| p.is_dir())
            .ok_or_else(|| format!("Cannot open parent folder for \"{}\".", cleaned))?;
        Ok(ResolvedGoToPath {
            directory_path: parent.to_string_lossy().into_owned(),
            select_file_path: Some(resolved.to_string_lossy().into_owned()),
        })
    }
}

#[tauri::command]
fn resolve_go_to_path(
    raw_path: String,
    base_dir: Option<String>,
) -> Result<ResolvedGoToPath, String> {
    resolve_user_path(&raw_path, base_dir.as_deref())
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
    app: tauri::AppHandle,
    settings: AppSettings,
    store: tauri::State<'_, Arc<AppStateStore>>,
) {
    let use_beige = settings.use_beige_app_icon;
    store.update_settings(settings);
    if let Some(window) = app.get_webview_window("main") {
        apply_app_icon(&window, use_beige);
    }
}

struct DirWatcherManager {
    state: Mutex<DirWatcherState>,
}

enum ActiveWatcher {
    #[cfg(target_os = "windows")]
    Win(win_shell::WinDirWatchHandle),
    Poll {
        stop: Arc<(Mutex<bool>, Condvar)>,
        join: Option<std::thread::JoinHandle<()>>,
    },
}

impl ActiveWatcher {
    fn stop(mut self) {
        match &mut self {
            #[cfg(target_os = "windows")]
            ActiveWatcher::Win(h) => h.stop(),
            ActiveWatcher::Poll { stop, join } => {
                {
                    let mut stopped = stop.0.lock().unwrap();
                    *stopped = true;
                    stop.1.notify_all();
                }
                if let Some(j) = join.take() {
                    let _ = j.join();
                }
            }
        }
    }
}

struct DirWatcherState {
    watched_path: Option<String>,
    handle: Option<ActiveWatcher>,
}

fn dir_fingerprint(path: &Path) -> Option<(Option<std::time::SystemTime>, usize)> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok();
    let count = fs::read_dir(path).ok()?.count();
    Some((modified, count))
}

impl DirWatcherManager {
    fn new() -> Self {
        Self {
            state: Mutex::new(DirWatcherState {
                watched_path: None,
                handle: None,
            }),
        }
    }

    fn stop(&self) {
        let old = {
            let mut guard = self.state.lock().unwrap();
            guard.watched_path = None;
            guard.handle.take()
        };
        if let Some(h) = old {
            h.stop();
        }
    }

    fn watch(&self, app: tauri::AppHandle, target_path: Option<String>) {
        let next_path = target_path
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty() && !p.starts_with("virtual://") && Path::new(p).is_dir());

        let old = {
            let mut guard = self.state.lock().unwrap();
            let same = match (&guard.watched_path, &next_path) {
                (Some(a), Some(b)) => normalize_path_key(a) == normalize_path_key(b),
                (None, None) => true,
                _ => false,
            };
            if same {
                return;
            }
            guard.watched_path = next_path.clone();
            guard.handle.take()
        };

        if let Some(h) = old {
            h.stop();
        }

        let Some(watch_path) = next_path else {
            return;
        };

        let watcher = Self::spawn_watcher(app, watch_path.clone());
        let mut guard = self.state.lock().unwrap();
        if guard
            .watched_path
            .as_deref()
            .map(|p| normalize_path_key(p) == normalize_path_key(&watch_path))
            .unwrap_or(false)
        {
            guard.handle = Some(watcher);
        } else {
            drop(guard);
            watcher.stop();
        }
    }

    fn spawn_watcher(app: tauri::AppHandle, path: String) -> ActiveWatcher {
        #[cfg(target_os = "windows")]
        {
            let app_clone = app.clone();
            if let Ok(handle) = win_shell::start_directory_watcher(path.clone(), move |changed| {
                let _ = app_clone.emit("directory-changed", changed.to_string());
            }) {
                return ActiveWatcher::Win(handle);
            }
        }

        // Cross-platform / fallback lightweight polling watcher
        let stop = Arc::new((Mutex::new(false), Condvar::new()));
        let stop_clone = Arc::clone(&stop);
        let join = std::thread::spawn(move || {
            let p = PathBuf::from(&path);
            let mut last = dir_fingerprint(&p);
            let interval = Duration::from_secs(2);
            loop {
                let guard = stop_clone.0.lock().unwrap();
                if *guard {
                    break;
                }
                let (guard, _) = stop_clone.1.wait_timeout(guard, interval).unwrap();
                if *guard {
                    break;
                }
                drop(guard);

                let current = dir_fingerprint(&p);
                if current != last {
                    last = current;
                    let _ = app.emit("directory-changed", path.clone());
                }
            }
        });

        ActiveWatcher::Poll {
            stop,
            join: Some(join),
        }
    }
}

#[tauri::command]
fn watch_directory(
    app: tauri::AppHandle,
    path: Option<String>,
    watcher: tauri::State<'_, Arc<DirWatcherManager>>,
) {
    watcher.watch(app, path);
}

#[tauri::command]
fn check_everything_cli_installed() -> bool {
    #[cfg(target_os = "windows")]
    {
        find_everything_cli_in_path().is_some()
    }

    #[cfg(not(target_os = "windows"))]
    {
        false
    }
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
async fn unlock_bitlocker_drive(
    window: tauri::Window,
    path: String,
) -> Result<UnlockDriveResult, String> {
    #[cfg(target_os = "windows")]
    {
        let hwnd_raw = window
            .hwnd()
            .map_err(|e| format!("Failed to get window handle: {}", e))?
            .0 as isize;
        tauri::async_runtime::spawn_blocking(move || {
            win_shell::prompt_bitlocker_unlock(hwnd_raw, &path)
        })
        .await
        .map_err(|e| format!("BitLocker unlock task failed: {}", e))?
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = window;
        Ok(UnlockDriveResult {
            unlocked: false,
            cancelled: false,
            drive_root: path,
            message: Some("BitLocker unlock is only supported on Windows.".to_string()),
        })
    }
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
    let dir_watcher = Arc::new(DirWatcherManager::new());
    let initial_path = InitialPath(resolve_initial_path_from_args(std::env::args().skip(1)));
    let window_ready = Arc::new(AtomicBool::new(false));
    let window_ready_for_setup = Arc::clone(&window_ready);
    let window_ready_for_events = Arc::clone(&window_ready);

    tauri::Builder::default()
        .manage(apps_cache)
        .manage(Arc::clone(&state_store))
        .manage(Arc::clone(&dir_watcher))
        .manage(initial_path)
        .setup(move |app| {
            if let Some(window) = app.get_webview_window("main") {
                let store = app.state::<Arc<AppStateStore>>();
                let snapshot = store.snapshot();
                if let Some(win_state) = &snapshot.window {
                    restore_window_state(&window, win_state);
                }
                if snapshot.settings.use_beige_app_icon {
                    apply_app_icon(&window, true);
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
                    let watcher = window.state::<Arc<DirWatcherManager>>();
                    watcher.stop();
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_home_dir,
            get_sidebar_locations,
            get_initial_path,
            list_directory,
            search_directory,
            open_item,
            show_context_menu,
            copy_file_to_clipboard,
            reveal_in_file_manager,
            create_new_folder,
            rename_item,
            open_in_terminal,
            share_with_os,
            watch_directory,
            load_app_state,
            save_panel_states,
            resolve_panel_path,
            resolve_go_to_path,
            save_custom_favorites,
            save_settings,
            check_everything_cli_installed,
            check_directory_exists,
            validate_favorite_dirs,
            unlock_bitlocker_drive,
            empty_trash,
            read_file_preview
        ])
        .run(tauri::generate_context!())
        .expect("error while running WinFinder");
}

const MAX_TEXT_PREVIEW_BYTES: usize = 512 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFilePreview {
    pub content: String,
    pub truncated: bool,
    pub total_bytes: u64,
    pub bytes_read: usize,
    pub is_binary: bool,
}

fn read_file_preview_impl(path_str: &str, max_bytes: usize) -> Result<TextFilePreview, String> {
    use std::io::Read;

    let trimmed = path_str.trim();
    if trimmed.is_empty() || trimmed.starts_with("virtual://") {
        return Err("Cannot preview virtual or empty path.".to_string());
    }

    let path = Path::new(trimmed);
    let meta = fs::metadata(path).map_err(|e| format!("Unable to read file metadata: {e}"))?;
    if meta.is_dir() {
        return Err("Cannot preview a directory as text.".to_string());
    }

    let total_bytes = meta.len();
    let cap = max_bytes.clamp(1024, 2 * 1024 * 1024);
    let mut file = fs::File::open(path).map_err(|e| format!("Unable to open file: {e}"))?;
    let mut buf = Vec::with_capacity((total_bytes as usize).min(cap));
    file.by_ref()
        .take(cap as u64)
        .read_to_end(&mut buf)
        .map_err(|e| format!("Unable to read file: {e}"))?;

    let bytes_read = buf.len();
    let truncated = total_bytes > bytes_read as u64;

    let sample_len = bytes_read.min(8192);
    let is_utf16_le = bytes_read >= 2 && buf[0] == 0xFF && buf[1] == 0xFE;
    let is_utf16_be = bytes_read >= 2 && buf[0] == 0xFE && buf[1] == 0xFF;

    if !is_utf16_le && !is_utf16_be && buf[..sample_len].contains(&0) {
        return Ok(TextFilePreview {
            content: String::new(),
            truncated,
            total_bytes,
            bytes_read,
            is_binary: true,
        });
    }

    let content = if is_utf16_le {
        let u16s: Vec<u16> = buf[2..]
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&u16s)
    } else if is_utf16_be {
        let u16s: Vec<u16> = buf[2..]
            .chunks_exact(2)
            .map(|c| u16::from_be_bytes([c[0], c[1]]))
            .collect();
        String::from_utf16_lossy(&u16s)
    } else {
        let slice = buf.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&buf);
        String::from_utf8_lossy(slice).into_owned()
    };

    Ok(TextFilePreview {
        content,
        truncated,
        total_bytes,
        bytes_read,
        is_binary: false,
    })
}

#[tauri::command]
fn read_file_preview(path: String, max_bytes: Option<usize>) -> Result<TextFilePreview, String> {
    read_file_preview_impl(&path, max_bytes.unwrap_or(MAX_TEXT_PREVIEW_BYTES))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persisted_app_state_defaults_settings_when_missing() {
        let legacy_json = r#"{"activePanel":"home","panels":{}}"#;
        let state: PersistedAppState = serde_json::from_str(legacy_json).unwrap();
        assert!(!state.settings.use_windows_window_controls);
        assert_eq!(state.settings.use_everything_cli, None);
        assert_eq!(state.settings.theme, "light");
        assert_eq!(
            state.settings.sidebar_visibility,
            SidebarVisibilitySettings::default()
        );
        assert!(state.settings.sidebar_visibility.recents);
        assert!(state.settings.sidebar_visibility.home);
        assert!(state.settings.sidebar_visibility.trash);

        let explicit_json =
            r#"{"activePanel":"home","panels":{},"settings":{"useEverythingCli":false}}"#;
        let explicit_state: PersistedAppState = serde_json::from_str(explicit_json).unwrap();
        assert_eq!(explicit_state.settings.use_everything_cli, Some(false));
    }

    #[test]
    fn persisted_app_state_defaults_partial_sidebar_visibility() {
        let partial_json = r#"{"activePanel":"home","panels":{},"settings":{"sidebarVisibility":{"recents":false,"network":false}}}"#;
        let state: PersistedAppState = serde_json::from_str(partial_json).unwrap();
        assert!(!state.settings.sidebar_visibility.recents);
        assert!(!state.settings.sidebar_visibility.network);
        assert!(state.settings.sidebar_visibility.applications);
        assert!(state.settings.sidebar_visibility.desktop);
        assert!(state.settings.sidebar_visibility.documents);
        assert!(state.settings.sidebar_visibility.downloads);
        assert!(state.settings.sidebar_visibility.home);
        assert!(state.settings.sidebar_visibility.drives);
        assert!(state.settings.sidebar_visibility.trash);
    }

    #[test]
    fn find_executable_in_paths_locates_matching_binary() {
        let unique = format!(
            "winfinder-es-path-test-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let base = std::env::temp_dir().join(unique);
        let dir_a = base.join("a");
        let dir_b = base.join("b");
        fs::create_dir_all(&dir_a).unwrap();
        fs::create_dir_all(&dir_b).unwrap();

        let es_file = dir_b.join("es.exe");
        fs::write(&es_file, b"").unwrap();

        let found = find_executable_in_paths([&dir_a, &dir_b], &["es.exe", "es.cmd"]);
        assert_eq!(found, Some(es_file));

        let missing = find_executable_in_paths([&dir_a], &["es.exe", "es.cmd"]);
        assert_eq!(missing, None);

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn build_search_entries_from_paths_filters_hidden_scope_and_deduplicates() {
        let unique = format!(
            "winfinder-es-parse-test-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let root = std::env::temp_dir().join(unique);
        let sub = root.join("Reports");
        fs::create_dir_all(&sub).unwrap();
        let visible_file = sub.join("quarterly.txt");
        let hidden_file = sub.join(".secret.txt");
        fs::write(&visible_file, "ok").unwrap();
        fs::write(&hidden_file, "hidden").unwrap();

        let output = format!(
            "{}\n{}\n{}\n{}\n{}\n",
            root.display(),
            visible_file.display(),
            visible_file.display(),
            sub.display(),
            hidden_file.display(),
        );

        let visible = build_search_entries_from_paths(&root, &output, false);
        let visible_names: Vec<&str> = visible.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(visible_names, vec!["Reports", "quarterly.txt"]);

        let with_hidden = build_search_entries_from_paths(&root, &output, true);
        let all_names: Vec<&str> = with_hidden.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(all_names, vec!["Reports", ".secret.txt", "quarterly.txt"]);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn persisted_app_state_roundtrips_settings() {
        let mut state = PersistedAppState::default();
        state.settings.use_windows_window_controls = true;
        state.settings.theme = "dark".to_string();
        state.settings.sidebar_visibility.recents = false;
        state.settings.sidebar_visibility.trash = false;
        let json = serde_json::to_string(&state).unwrap();
        assert!(json.contains("useWindowsWindowControls"));
        assert!(json.contains(r#""theme":"dark""#));
        assert!(json.contains("sidebarVisibility"));
        let decoded: PersistedAppState = serde_json::from_str(&json).unwrap();
        assert!(decoded.settings.use_windows_window_controls);
        assert_eq!(decoded.settings.theme, "dark");
        assert!(!decoded.settings.sidebar_visibility.recents);
        assert!(!decoded.settings.sidebar_visibility.trash);
        assert!(decoded.settings.sidebar_visibility.home);
    }

    #[test]
    fn persisted_app_state_sanitizes_invalid_theme() {
        let mut state = PersistedAppState::default();
        state.settings.theme = "neon".to_string();
        state.sanitize();
        assert_eq!(state.settings.theme, "light");

        state.settings.theme = "DARK".to_string();
        state.sanitize();
        assert_eq!(state.settings.theme, "dark");
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

    #[cfg(target_os = "windows")]
    #[test]
    fn is_path_within_root_windows_cases() {
        let root = r"C:\Users\chris\Downloads";
        assert!(is_path_within_root(r"C:\Users\chris\Downloads", root));
        assert!(is_path_within_root(r"c:\users\chris\downloads\", root));
        assert!(is_path_within_root(r"C:\Users\chris\Downloads\Sub\Deep", root));
        assert!(is_path_within_root("C:/Users/chris/Downloads/Sub", root));
        assert!(!is_path_within_root(r"C:\Users\chris\Downloads2", root));
        assert!(!is_path_within_root(r"C:\Users\chris", root));
        assert!(!is_path_within_root(r"C:\", root));
        assert!(!is_path_within_root(r"D:\Users\chris\Downloads", root));
        assert!(is_path_within_root(r"C:\Users", r"C:\"));
        assert!(!is_path_within_root(r"D:\Users", r"C:\"));
        assert!(is_path_within_root("virtual://recents", "virtual://recents"));
        assert!(!is_path_within_root(r"C:\", "virtual://recents"));
    }

    #[test]
    fn resolve_existing_dir_rejects_saved_path_outside_root() {
        let base = std::env::temp_dir().join(format!(
            "winfinder_test_root_reset_{}",
            std::process::id()
        ));
        let root = base.join("downloads");
        let sub = root.join("sub");
        let outside = base.join("outside");
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&sub).unwrap();
        fs::create_dir_all(&outside).unwrap();

        let root_str = root.to_string_lossy().into_owned();
        let sub_str = sub.to_string_lossy().into_owned();
        let outside_str = outside.to_string_lossy().into_owned();
        let missing_sub_str = sub.join("deleted_child").to_string_lossy().into_owned();

        // Out-of-root saved path resets to root
        assert_eq!(resolve_existing_dir(Some(&outside_str), &root_str), root_str);
        // Valid subfolder is preserved
        assert_eq!(resolve_existing_dir(Some(&sub_str), &root_str), sub_str);
        // Missing child inside root walks up to existing parent inside root
        assert_eq!(resolve_existing_dir(Some(&missing_sub_str), &root_str), sub_str);

        let _ = fs::remove_dir_all(&base);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_search_sql_escapes_quotes_and_normalizes_scope() {
        let sql = build_windows_search_sql(Path::new(r"C:\Users\O'Brien\Docs\"), "john's");
        assert!(sql.contains("SCOPE='file:C:/Users/O''Brien/Docs'"));
        assert!(sql.contains("System.FileName LIKE '%john''s%'"));
    }

    #[test]
    fn walk_search_directory_finds_nested_matches_and_respects_hidden() {
        let unique = format!(
            "winfinder-search-test-{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let root = std::env::temp_dir().join(unique);
        let sub = root.join("SubFolder");
        fs::create_dir_all(&sub).unwrap();
        fs::write(root.join("AlphaReport.txt"), "hello").unwrap();
        fs::write(sub.join("beta_report.md"), "world").unwrap();
        fs::write(sub.join(".hidden_report.txt"), "secret").unwrap();

        let visible = walk_search_directory(&root, "report", false);
        let visible_names: Vec<&str> = visible.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(visible_names, vec!["AlphaReport.txt", "beta_report.md"]);

        let with_hidden = walk_search_directory(&root, "report", true);
        let hidden_names: Vec<&str> = with_hidden.iter().map(|e| e.name.as_str()).collect();
        assert!(hidden_names.contains(&".hidden_report.txt"));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn extract_windows_drive_root_parses_drive_and_subfolders() {
        assert_eq!(extract_windows_drive_root("D:"), Some("D:\\".to_string()));
        assert_eq!(extract_windows_drive_root("d:\\"), Some("D:\\".to_string()));
        assert_eq!(extract_windows_drive_root("e:/Projects/WinFinder"), Some("E:\\".to_string()));
        assert_eq!(extract_windows_drive_root(r"\\?\F:\Secret"), Some("F:\\".to_string()));
        assert_eq!(extract_windows_drive_root("virtual://computer"), None);
        assert_eq!(extract_windows_drive_root("/Users/chris"), None);
        assert_eq!(extract_windows_drive_root(r"\\server\share"), None);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn check_bitlocker_locked_error_detects_fve_locked_volume() {
        let err = std::io::Error::from_raw_os_error(win_shell::FVE_E_LOCKED_VOLUME as i32);
        assert_eq!(
            win_shell::check_bitlocker_locked_error(Path::new(r"D:\"), &err),
            Some("D:\\".to_string())
        );
        assert_eq!(
            win_shell::check_bitlocker_locked_error(Path::new(r"D:\Work"), &err),
            Some("D:\\".to_string())
        );
        let not_ready = std::io::Error::from_raw_os_error(21); // ERROR_NOT_READY
        assert_eq!(
            win_shell::check_bitlocker_locked_error(Path::new(r"D:\"), &not_ready),
            None
        );
    }

    #[test]
    fn path_within_root_checks_segment_boundaries() {
        #[cfg(target_os = "windows")]
        {
            assert!(is_path_within_root(
                r"C:\Users\chris\Projects",
                r"C:\Users\chris\Projects"
            ));
            assert!(is_path_within_root(
                r"C:\Users\chris\Projects\WinFinder",
                r"C:\Users\chris\Projects"
            ));
            assert!(is_path_within_root(
                r"c:\users\chris\projects\winfinder",
                r"C:\Users\chris\Projects"
            ));
            assert!(!is_path_within_root(
                r"C:\Users\chris\Projects2",
                r"C:\Users\chris\Projects"
            ));
            assert!(!is_path_within_root(r"C:\", r"C:\Users\chris\Projects"));
            assert!(is_path_within_root(r"C:\Users", r"C:\"));
        }

        #[cfg(not(target_os = "windows"))]
        {
            assert!(is_path_within_root("/Users/chris/Projects", "/Users/chris/Projects"));
            assert!(is_path_within_root("/Users/chris/Projects/WinFinder", "/Users/chris/Projects"));
            assert!(!is_path_within_root("/Users/chris/Projects2", "/Users/chris/Projects"));
            assert!(!is_path_within_root("/", "/Users/chris/Projects"));
            assert!(is_path_within_root("/Users", "/"));
        }
    }

    #[test]
    fn sanitize_keeps_valid_custom_favorite_state_and_prunes_removed() {
        let fav_root = if cfg!(target_os = "windows") {
            r"C:\Users\chris\Projects"
        } else {
            "/Users/chris/Projects"
        };
        let fav_sub = if cfg!(target_os = "windows") {
            r"C:\Users\chris\Projects\WinFinder"
        } else {
            "/Users/chris/Projects/WinFinder"
        };
        let outside = if cfg!(target_os = "windows") {
            r"C:\"
        } else {
            "/"
        };
        let removed_root = if cfg!(target_os = "windows") {
            r"C:\Users\chris\OldFav"
        } else {
            "/Users/chris/OldFav"
        };

        let fav_panel = format!("fav:{}", fav_root);
        let removed_panel = format!("fav:{}", removed_root);

        let mut panels = BTreeMap::new();
        panels.insert(
            fav_panel.clone(),
            PanelState {
                view_mode: "list".to_string(),
                sort: PersistedSortConfig::default(),
                last_path: Some(fav_sub.to_string()),
                expanded_paths: vec![fav_sub.to_string()],
                column_paths: vec![],
            },
        );
        panels.insert(
            removed_panel.clone(),
            PanelState {
                view_mode: "columns".to_string(),
                sort: PersistedSortConfig::default(),
                last_path: Some(removed_root.to_string()),
                expanded_paths: vec![],
                column_paths: vec![],
            },
        );

        let mut state = PersistedAppState {
            window: None,
            active_panel: fav_panel.clone(),
            panels,
            custom_favorites: vec![FavoriteFolder {
                name: "Projects".to_string(),
                path: fav_root.to_string(),
            }],
            settings: AppSettings::default(),
        };

        state.sanitize();
        assert_eq!(state.active_panel, fav_panel);
        assert!(state.panels.contains_key(&fav_panel));
        assert!(!state.panels.contains_key(&removed_panel));
        assert_eq!(
            state.panels.get(&fav_panel).unwrap().last_path.as_deref(),
            Some(fav_sub)
        );

        // Outside last_path resets to favorite root
        state.panels.get_mut(&fav_panel).unwrap().last_path = Some(outside.to_string());
        state.sanitize();
        assert_eq!(
            state.panels.get(&fav_panel).unwrap().last_path.as_deref(),
            Some(fav_root)
        );
        assert!(state.panels.get(&fav_panel).unwrap().expanded_paths.is_empty());

        // Removing the favorite prunes its panel state and resets active_panel to home
        state.custom_favorites.clear();
        state.sanitize();
        assert_eq!(state.active_panel, "home");
        assert!(!state.panels.contains_key(&fav_panel));
    }

    #[test]
    fn strip_wrapping_quotes_handles_double_and_single() {
        assert_eq!(strip_wrapping_quotes("  \"C:\\Users\\test\"  "), "C:\\Users\\test");
        assert_eq!(strip_wrapping_quotes("'~/Documents'"), "~/Documents");
        assert_eq!(strip_wrapping_quotes("\"unmatched"), "\"unmatched");
    }

    #[test]
    fn expand_env_vars_supports_windows_and_unix_syntax() {
        std::env::set_var("WINFINDER_TEST_VAR", "WinFinderVal");
        assert_eq!(expand_env_vars("%WINFINDER_TEST_VAR%/sub"), "WinFinderVal/sub");
        assert_eq!(expand_env_vars("$WINFINDER_TEST_VAR/sub"), "WinFinderVal/sub");
        assert_eq!(expand_env_vars("${WINFINDER_TEST_VAR}/sub"), "WinFinderVal/sub");
        assert_eq!(expand_env_vars("%WINFINDER_NONEXISTENT_XYZ%"), "%WINFINDER_NONEXISTENT_XYZ%");
        std::env::remove_var("WINFINDER_TEST_VAR");
    }

    #[test]
    fn resolve_user_path_handles_dir_file_relative_quotes_and_missing() {
        let temp_root = std::env::temp_dir().join(format!(
            "winfinder_goto_test_{}",
            std::process::id()
        ));
        let sub_dir = temp_root.join("nested");
        let file_path = sub_dir.join("hello.txt");
        let _ = fs::remove_dir_all(&temp_root);
        fs::create_dir_all(&sub_dir).unwrap();
        fs::write(&file_path, "hi").unwrap();

        // Quoted directory path
        let quoted_dir = format!("\"{}\"", sub_dir.to_string_lossy());
        let res_dir = resolve_user_path(&quoted_dir, None).unwrap();
        assert_eq!(PathBuf::from(&res_dir.directory_path), sub_dir);
        assert!(res_dir.select_file_path.is_none());

        // File path resolves to parent dir + select_file_path
        let res_file = resolve_user_path(&file_path.to_string_lossy(), None).unwrap();
        assert_eq!(PathBuf::from(&res_file.directory_path), sub_dir);
        assert_eq!(res_file.select_file_path.map(PathBuf::from), Some(file_path.clone()));

        // Relative path against base_dir
        let res_rel = resolve_user_path("nested", Some(&temp_root.to_string_lossy())).unwrap();
        assert_eq!(PathBuf::from(&res_rel.directory_path), sub_dir);
        assert!(res_rel.select_file_path.is_none());

        // Tilde resolves to home directory
        if let Some(home) = dirs::home_dir() {
            let res_home = resolve_user_path("~", None).unwrap();
            assert_eq!(PathBuf::from(&res_home.directory_path), home);
        }

        // Missing path returns error
        let missing = temp_root.join("does_not_exist_12345");
        let err = resolve_user_path(&missing.to_string_lossy(), None).unwrap_err();
        assert!(err.contains("can't be found"));

        // Empty input returns error
        assert!(resolve_user_path("   \"\"   ", None).is_err());

        let _ = fs::remove_dir_all(&temp_root);
    }

    #[test]
    fn config_store_creates_dot_winfinder_dir_and_saves_config_json() {
        let unique = format!(
            "winfinder_config_fresh_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let fake_home = std::env::temp_dir().join(unique);
        let _ = fs::remove_dir_all(&fake_home);
        fs::create_dir_all(&fake_home).unwrap();

        let store = AppStateStore::from_home(Some(fake_home.clone()));
        assert_eq!(
            store.state_path.as_deref(),
            Some(fake_home.join(".winfinder").join("config.json").as_path())
        );

        store.update_settings(AppSettings {
            use_windows_window_controls: true,
            ..AppSettings::default()
        });

        let config_path = fake_home.join(".winfinder").join("config.json");
        assert!(fake_home.join(".winfinder").is_dir());
        assert!(config_path.is_file());

        let reloaded = AppStateStore::from_home(Some(fake_home.clone()));
        assert!(reloaded.snapshot().settings.use_windows_window_controls);

        let _ = fs::remove_dir_all(&fake_home);
    }

    #[test]
    fn config_store_migrates_legacy_dot_winfinder_file() {
        let unique = format!(
            "winfinder_config_migrate_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let fake_home = std::env::temp_dir().join(unique);
        let _ = fs::remove_dir_all(&fake_home);
        fs::create_dir_all(&fake_home).unwrap();

        let legacy_file = fake_home.join(".winfinder");
        let legacy_json = r#"{"activePanel":"documents","panels":{},"settings":{"useWindowsWindowControls":true}}"#;
        fs::write(&legacy_file, legacy_json).unwrap();

        let store = AppStateStore::from_home(Some(fake_home.clone()));
        let snap = store.snapshot();
        assert_eq!(snap.active_panel, "documents");
        assert!(snap.settings.use_windows_window_controls);
        assert!(fake_home.join(".winfinder").is_dir());
        assert!(fake_home.join(".winfinder").join("config.json").is_file());
        assert!(!fake_home.join(".winfinder.legacy.tmp").exists());

        let _ = fs::remove_dir_all(&fake_home);
    }

    #[test]
    fn config_store_handles_corrupt_legacy_dot_winfinder_file() {
        let unique = format!(
            "winfinder_config_corrupt_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let fake_home = std::env::temp_dir().join(unique);
        let _ = fs::remove_dir_all(&fake_home);
        fs::create_dir_all(&fake_home).unwrap();

        let legacy_file = fake_home.join(".winfinder");
        fs::write(&legacy_file, "{ not valid json").unwrap();

        let store = AppStateStore::from_home(Some(fake_home.clone()));
        let snap = store.snapshot();
        assert_eq!(snap.active_panel, "home");
        assert!(!snap.settings.use_windows_window_controls);
        assert!(fake_home.join(".winfinder").is_dir());
        assert!(!fake_home.join(".winfinder.legacy.tmp").exists());

        // Subsequent save succeeds into ~/.winfinder/config.json
        store.update_settings(AppSettings {
            use_windows_window_controls: true,
            ..AppSettings::default()
        });
        assert!(fake_home.join(".winfinder").join("config.json").is_file());

        let _ = fs::remove_dir_all(&fake_home);
    }

    #[test]
    fn rename_fs_item_validates_renames_and_prevents_overwrites() {
        let unique = format!(
            "winfinder_rename_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let root = std::env::temp_dir().join(unique);
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();

        let file_a = root.join("notes.txt");
        let file_b = root.join("existing.txt");
        fs::write(&file_a, "hello").unwrap();
        fs::write(&file_b, "world").unwrap();

        // Validation errors
        assert!(rename_fs_item(&file_a.to_string_lossy(), "   ").is_err());
        assert!(rename_fs_item(&file_a.to_string_lossy(), "sub/name.txt").is_err());
        assert!(rename_fs_item(&file_a.to_string_lossy(), r"sub\name.txt").is_err());
        assert!(rename_fs_item(&file_a.to_string_lossy(), "..").is_err());
        assert!(rename_fs_item("virtual://recents", "other").is_err());

        #[cfg(target_os = "windows")]
        {
            assert!(rename_fs_item(&file_a.to_string_lossy(), "bad:name.txt").is_err());
            assert!(rename_fs_item(&file_a.to_string_lossy(), "CON.txt").is_err());
            assert!(rename_fs_item(&file_a.to_string_lossy(), "trailing.").is_err());
        }

        // Prevent overwriting a different existing entry
        let overwrite_err = rename_fs_item(&file_a.to_string_lossy(), "existing.txt").unwrap_err();
        assert!(overwrite_err.contains("already exists"));

        // Normal rename
        let renamed_path = rename_fs_item(&file_a.to_string_lossy(), "renamed.txt").unwrap();
        assert_eq!(PathBuf::from(&renamed_path), root.join("renamed.txt"));
        assert!(root.join("renamed.txt").is_file());
        assert!(!file_a.exists());

        // No-op rename returns same path
        let noop_path = rename_fs_item(&renamed_path, "renamed.txt").unwrap();
        assert_eq!(noop_path, renamed_path);

        // Case-only rename
        let cased_path = rename_fs_item(&renamed_path, "Renamed.TXT").unwrap();
        assert_eq!(PathBuf::from(&cased_path), root.join("Renamed.TXT"));
        let actual_names: Vec<String> = fs::read_dir(&root)
            .unwrap()
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect();
        assert!(actual_names.contains(&"Renamed.TXT".to_string()));

        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn is_recycle_bin_path_detects_recycle_bin_variants() {
        assert!(win_shell::is_recycle_bin_path(
            r"C:\$Recycle.Bin\S-1-5-21-12345\$RABCDEF.txt"
        ));
        assert!(win_shell::is_recycle_bin_path(
            r"d:/$RECYCLE.BIN/S-1-5-21-12345/$RFOLDER"
        ));
        assert!(win_shell::is_recycle_bin_path(
            r"::{645FF040-5081-101B-9F08-00AA002F954E}\C:\$Recycle.Bin\S-1-5-21-12345\$R1.txt"
        ));
        assert!(win_shell::is_recycle_bin_path("trash://item-1"));
        assert!(!win_shell::is_recycle_bin_path(r"C:\Users\chris\Documents\notes.txt"));
        assert!(!win_shell::is_recycle_bin_path("virtual://trash"));
    }

    #[test]
    fn read_file_preview_handles_text_truncation_binary_and_errors() {
        let unique = format!(
            "winfinder_preview_test_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        let root = std::env::temp_dir().join(unique);
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();

        // Normal UTF-8 file with BOM
        let txt_path = root.join("hello.txt");
        let mut utf8_bom = vec![0xEF, 0xBB, 0xBF];
        utf8_bom.extend_from_slice(b"Hello WinFinder!\nLine 2");
        fs::write(&txt_path, utf8_bom).unwrap();
        let res = read_file_preview_impl(&txt_path.to_string_lossy(), MAX_TEXT_PREVIEW_BYTES).unwrap();
        assert_eq!(res.content, "Hello WinFinder!\nLine 2");
        assert!(!res.truncated);
        assert!(!res.is_binary);

        // Truncation at cap (min clamp is 1024 bytes)
        let big_path = root.join("big.log");
        fs::write(&big_path, "a".repeat(2048)).unwrap();
        let big_res = read_file_preview_impl(&big_path.to_string_lossy(), 1024).unwrap();
        assert!(big_res.truncated);
        assert_eq!(big_res.bytes_read, 1024);
        assert_eq!(big_res.total_bytes, 2048);
        assert!(!big_res.is_binary);

        // Binary detection
        let bin_path = root.join("data.bin");
        fs::write(&bin_path, [0x7F, 0x45, 0x4C, 0x46, 0x00, 0x01, 0x02]).unwrap();
        let bin_res = read_file_preview_impl(&bin_path.to_string_lossy(), MAX_TEXT_PREVIEW_BYTES).unwrap();
        assert!(bin_res.is_binary);
        assert!(bin_res.content.is_empty());

        // Rejects directory & virtual paths
        assert!(read_file_preview_impl(&root.to_string_lossy(), MAX_TEXT_PREVIEW_BYTES).is_err());
        assert!(read_file_preview_impl("virtual://recents", MAX_TEXT_PREVIEW_BYTES).is_err());

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn beige_app_icon_recolor_transforms_embedded_png() {
        let (mut rgba, w, h) = decode_png_rgba(APP_ICON_PNG).unwrap();
        assert!(w >= 128 && h >= 128);
        recolor_icon_to_explorer_beige(&mut rgba, w, h);
        // Sample a pixel in top-left square interior (around 20%, 20%): should be warm beige (R > G > B)
        let sx = (w / 5) as usize;
        let sy = (h / 5) as usize;
        let idx = (sy * (w as usize) + sx) * 4;
        assert!(rgba[idx + 3] > 200);
        assert!(rgba[idx] > rgba[idx + 1] && rgba[idx + 1] > rgba[idx + 2]);
    }

    #[test]
    fn app_settings_defaults_beige_icon_false() {
        let legacy: PersistedAppState =
            serde_json::from_str(r#"{"activePanel":"home","panels":{}}"#).unwrap();
        assert!(!legacy.settings.use_beige_app_icon);
        let toggled: PersistedAppState = serde_json::from_str(
            r#"{"activePanel":"home","panels":{},"settings":{"useBeigeAppIcon":true}}"#,
        )
        .unwrap();
        assert!(toggled.settings.use_beige_app_icon);
    }
}
