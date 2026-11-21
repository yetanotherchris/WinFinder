use std::fs;
use std::path::{Path, PathBuf};

pub fn extract_cli_path_arg<I, S>(args: I) -> Option<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    for arg in args {
        let trimmed = arg.as_ref().trim();
        if trimmed.is_empty() || trimmed.starts_with('-') {
            continue;
        }
        return Some(trimmed.to_string());
    }
    None
}

pub fn strip_verbatim_prefix(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let s = path.to_string_lossy();
        if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{}", rest));
        }
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(rest);
        }
    }
    path
}

pub fn resolve_cli_path_with(
    raw: &str,
    home_dir: Option<&Path>,
    current_dir: Option<&Path>,
) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let expanded = if trimmed == "~" {
        home_dir?.to_path_buf()
    } else if let Some(rest) = trimmed
        .strip_prefix("~/")
        .or_else(|| trimmed.strip_prefix(r"~\"))
    {
        let home = home_dir?;
        if rest.is_empty() {
            home.to_path_buf()
        } else {
            home.join(rest)
        }
    } else {
        let candidate = PathBuf::from(trimmed);
        if candidate.is_absolute() {
            candidate
        } else {
            current_dir?.join(candidate)
        }
    };

    let canonical = fs::canonicalize(&expanded).ok()?;
    let cleaned = strip_verbatim_prefix(canonical);

    if cleaned.is_dir() {
        Some(cleaned.to_string_lossy().into_owned())
    } else if cleaned.is_file() {
        let parent = cleaned.parent()?;
        if parent.is_dir() {
            Some(parent.to_string_lossy().into_owned())
        } else {
            None
        }
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::UNIX_EPOCH;

    struct TempTestDir {
        path: PathBuf,
    }

    impl TempTestDir {
        fn new(name: &str) -> Self {
            let unique = format!(
                "winfinder_cli_test_{}_{}_{}",
                name,
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            );
            let path = std::env::temp_dir().join(unique);
            fs::create_dir_all(&path).expect("failed to create temp test dir");
            Self { path }
        }
    }

    impl Drop for TempTestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn extract_cli_path_arg_skips_flags_and_blanks() {
        assert_eq!(extract_cli_path_arg::<_, &str>([]), None);
        assert_eq!(extract_cli_path_arg(["--debug", "-v", "   "]), None);
        assert_eq!(
            extract_cli_path_arg(["--flag", "~/Documents", "extra"]),
            Some("~/Documents".to_string())
        );
        assert_eq!(extract_cli_path_arg([" . "]), Some(".".to_string()));
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn strip_verbatim_prefix_handles_drive_and_unc() {
        assert_eq!(
            strip_verbatim_prefix(PathBuf::from(r"\\?\C:\Users\chris")),
            PathBuf::from(r"C:\Users\chris")
        );
        assert_eq!(
            strip_verbatim_prefix(PathBuf::from(r"\\?\UNC\server\share\folder")),
            PathBuf::from(r"\\server\share\folder")
        );
        assert_eq!(
            strip_verbatim_prefix(PathBuf::from(r"D:\blah\blah")),
            PathBuf::from(r"D:\blah\blah")
        );
    }

    #[test]
    fn resolve_cli_path_tilde_and_subpaths() {
        let tmp = TempTestDir::new("tilde");
        let home = tmp.path.join("home");
        let foo = home.join("foo");
        fs::create_dir_all(&foo).unwrap();

        let expected_home = strip_verbatim_prefix(fs::canonicalize(&home).unwrap())
            .to_string_lossy()
            .into_owned();
        let expected_foo = strip_verbatim_prefix(fs::canonicalize(&foo).unwrap())
            .to_string_lossy()
            .into_owned();

        assert_eq!(
            resolve_cli_path_with("~", Some(&home), Some(&tmp.path)),
            Some(expected_home.clone())
        );
        assert_eq!(
            resolve_cli_path_with("~/", Some(&home), Some(&tmp.path)),
            Some(expected_home.clone())
        );
        assert_eq!(
            resolve_cli_path_with(r"~\", Some(&home), Some(&tmp.path)),
            Some(expected_home)
        );
        assert_eq!(
            resolve_cli_path_with("~/foo", Some(&home), Some(&tmp.path)),
            Some(expected_foo.clone())
        );
        assert_eq!(
            resolve_cli_path_with(r"~\foo", Some(&home), Some(&tmp.path)),
            Some(expected_foo)
        );
    }

    #[test]
    fn resolve_cli_path_dot_relative_and_absolute() {
        let tmp = TempTestDir::new("rel_abs");
        let cwd = tmp.path.join("workspace");
        let nested = cwd.join("a").join("b");
        fs::create_dir_all(&nested).unwrap();

        let expected_cwd = strip_verbatim_prefix(fs::canonicalize(&cwd).unwrap())
            .to_string_lossy()
            .into_owned();
        let expected_nested = strip_verbatim_prefix(fs::canonicalize(&nested).unwrap())
            .to_string_lossy()
            .into_owned();

        assert_eq!(
            resolve_cli_path_with(".", Some(&tmp.path), Some(&cwd)),
            Some(expected_cwd)
        );
        assert_eq!(
            resolve_cli_path_with("a/b", Some(&tmp.path), Some(&cwd)),
            Some(expected_nested.clone())
        );
        assert_eq!(
            resolve_cli_path_with(
                nested.to_string_lossy().as_ref(),
                Some(&tmp.path),
                Some(&cwd)
            ),
            Some(expected_nested)
        );
    }

    #[test]
    fn resolve_cli_path_file_opens_parent_and_nonexistent_falls_back() {
        let tmp = TempTestDir::new("file_fallback");
        let dir = tmp.path.join("docs");
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("readme.txt");
        fs::write(&file, "hello").unwrap();

        let expected_dir = strip_verbatim_prefix(fs::canonicalize(&dir).unwrap())
            .to_string_lossy()
            .into_owned();

        assert_eq!(
            resolve_cli_path_with(
                file.to_string_lossy().as_ref(),
                Some(&tmp.path),
                Some(&tmp.path)
            ),
            Some(expected_dir)
        );
        assert_eq!(
            resolve_cli_path_with("does_not_exist_12345", Some(&tmp.path), Some(&tmp.path)),
            None
        );
        assert_eq!(
            resolve_cli_path_with("~/does_not_exist_12345", Some(&tmp.path), Some(&tmp.path)),
            None
        );
    }
}
