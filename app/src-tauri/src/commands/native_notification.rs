use std::path::PathBuf;
use std::process::Command;

use tauri::{AppHandle, Runtime};

#[tauri::command]
pub fn get_native_notification_permission() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        return Ok(check_macos_notification_permission());
    }
    #[cfg(not(target_os = "macos"))]
    Ok("granted".to_string())
}

#[tauri::command]
pub fn request_native_notification_permission() -> Result<String, String> {
    Ok("granted".to_string())
}

#[tauri::command]
pub fn send_native_notification<R: Runtime>(
    _app: AppHandle<R>,
    title: String,
    body: String,
    sound: Option<String>,
    _group: Option<String>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // 声音与通知解耦：无论通知是否成功，声音都要播放
        play_macos_sound(sound.as_deref());
        send_macos_script_notification(&title, &body)
    }

    #[cfg(not(target_os = "macos"))]
    {
        send_plugin_notification(&app, &title, &body, sound.as_deref())
    }
}

#[cfg(not(target_os = "macos"))]
fn send_plugin_notification<R: Runtime>(
    app: &AppHandle<R>,
    title: &str,
    body: &str,
    sound: Option<&str>,
) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    let mut builder = app.notification().builder().title(title).body(body);
    if let Some(sound) = sound {
        builder = builder.sound(sound);
    }
    builder
        .show()
        .map_err(|e| format!("plugin notification failed: {e}"))
}

#[cfg(target_os = "macos")]
fn send_macos_script_notification(title: &str, body: &str) -> Result<(), String> {
    let script = format!(
        "display notification \"{}\" with title \"{}\"",
        escape_applescript(body),
        escape_applescript(title)
    );

    // 使用全路径，防止 production .app 的 PATH 环境变量不含 /usr/bin
    let output = Command::new("/usr/bin/osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| format!("failed to run osascript: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "osascript exited with {}: {}",
            output.status,
            stderr.trim()
        ));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn play_macos_sound(sound: Option<&str>) {
    let Some(sound) = sound else {
        return;
    };

    let Some(path) = resolve_macos_sound_path(sound) else {
        return;
    };

    // 使用全路径，防止 production .app 的 PATH 不含 /usr/bin
    let _ = Command::new("/usr/bin/afplay").arg(path).spawn();
}

#[cfg(target_os = "macos")]
fn resolve_macos_sound_path(sound: &str) -> Option<PathBuf> {
    let direct = PathBuf::from(sound);
    if direct.exists() {
        return Some(direct);
    }

    let system_dir = PathBuf::from("/System/Library/Sounds");
    let raw = system_dir.join(sound);
    if raw.exists() {
        return Some(raw);
    }

    let aiff = system_dir.join(format!("{sound}.aiff"));
    if aiff.exists() {
        return Some(aiff);
    }

    let caf = system_dir.join(format!("{sound}.caf"));
    if caf.exists() {
        return Some(caf);
    }

    None
}

#[cfg(target_os = "macos")]
fn check_macos_notification_permission() -> String {
    // 读取 macOS 通知中心偏好设置，检测 Script Editor 的通知权限
    // Script Editor (com.apple.ScriptEditor2) 是 osascript 通知的归属 app
    let output = Command::new("/usr/bin/defaults")
        .args(["read", "com.apple.ncprefs", "apps"])
        .output();

    if let Ok(o) = output {
        if o.status.success() {
            let stdout = String::from_utf8_lossy(&o.stdout);
            // 如果 Script Editor 在列表中，检查 flags（0 = 全部关闭）
            if let Some(idx) = stdout.find("com.apple.ScriptEditor") {
                let after = &stdout[idx..];
                if let Some(flags_pos) = after.find("flags = ") {
                    let after_flags = &after[flags_pos + 8..];
                    if let Some(end) = after_flags.find(';') {
                        if let Ok(flags) = after_flags[..end].trim().parse::<u32>() {
                            if flags == 0 {
                                return "denied".to_string();
                            }
                            return "granted".to_string();
                        }
                    }
                }
                // 找到条目但无法解析 flags，默认 granted
                return "granted".to_string();
            }
            // 未曾配置过，macOS 默认允许 → granted
            return "granted".to_string();
        }
    }
    // 无法查询时，返回 granted（osascript 默认有权限）
    "granted".to_string()
}

#[cfg(target_os = "macos")]
fn escape_applescript(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
}
