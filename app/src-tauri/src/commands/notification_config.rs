use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NotificationChannel {
    pub id: String,
    #[serde(rename = "type")]
    pub channel_type: String,
    pub name: String,
    pub enabled: bool,
    pub url: Option<String>,
    pub token: Option<String>,
    pub chat_id: Option<String>,
    pub user_key: Option<String>,
    pub key: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct NotificationEvents {
    #[serde(default = "default_true")]
    pub training_complete: bool,
    #[serde(default = "default_true")]
    pub training_failed: bool,
    #[serde(default = "default_true")]
    pub export_complete: bool,
    #[serde(default = "default_true")]
    pub export_failed: bool,
    #[serde(default = "default_true")]
    pub dataset_complete: bool,
    #[serde(default = "default_true")]
    pub dataset_failed: bool,
}

fn default_true() -> bool {
    true
}

impl Default for NotificationEvents {
    fn default() -> Self {
        Self {
            training_complete: true,
            training_failed: true,
            export_complete: true,
            export_failed: true,
            dataset_complete: true,
            dataset_failed: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct NotificationConfig {
    #[serde(default)]
    pub channels: Vec<NotificationChannel>,
    #[serde(default)]
    pub events: NotificationEvents,
}

fn notification_config_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join("Courtyard").join("notification-config.json")
}

#[tauri::command]
pub fn get_notification_config() -> Result<NotificationConfig, String> {
    let path = notification_config_path();
    if path.exists() {
        let s = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&s).map_err(|e| e.to_string())
    } else {
        Ok(NotificationConfig::default())
    }
}

#[tauri::command]
pub fn save_notification_config(config: NotificationConfig) -> Result<(), String> {
    let path = notification_config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}
