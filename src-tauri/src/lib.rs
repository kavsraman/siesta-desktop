use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};

mod clipboard;
mod word_timer;

static SYNC_SERVER: Mutex<Option<Child>> = Mutex::new(None);

#[tauri::command]
async fn translate_text(
    text: String,
    target_language: String,
    api_key: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let system_prompt = format!(
        "You are Siesta's language learning assistant. You help users learn {} through immersion. When asked about a word or phrase:\n\
        1. Provide the translation and pronunciation\n\
        2. Give 1-2 example sentences showing natural usage\n\
        3. Note any dialect variations if relevant\n\
        4. Share a memorable way to remember it (mnemonic, etymology, or cultural context)\n\
        Keep responses concise and friendly. Format for easy scanning. Respond in JSON with fields: \
        translation, pronunciation, examples (array of strings), mnemonic, dialect_notes (optional).",
        target_language
    );

    let body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 500,
        "system": system_prompt,
        "messages": [
            {
                "role": "user",
                "content": format!("Translate and explain: \"{}\"", text)
            }
        ]
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Parse failed: {}", e))?;

    json["content"][0]["text"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "No response text".to_string())
}

#[tauri::command]
async fn quick_translate(
    text: String,
    target_language: String,
    api_key: String,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 100,
        "system": format!(
            "Translate the following text to {}. Respond with ONLY a JSON object: \
            {{\"translation\": \"...\", \"pronunciation\": \"...\"}}. Nothing else.",
            target_language
        ),
        "messages": [
            { "role": "user", "content": text }
        ]
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Parse failed: {}", e))?;

    json["content"][0]["text"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| "No response text".to_string())
}

#[tauri::command]
fn lookup_offline(text: String, target_language: String) -> Result<String, String> {
    let json_str = match target_language.to_lowercase().as_str() {
        "italian" => include_str!("../words/italian.json"),
        "spanish" => include_str!("../words/spanish.json"),
        "french" => include_str!("../words/french.json"),
        "german" => include_str!("../words/german.json"),
        "tamil" => include_str!("../words/tamil.json"),
        "hindi" => include_str!("../words/hindi.json"),
        "mandarin" => include_str!("../words/mandarin.json"),
        _ => include_str!("../words/italian.json"),
    };

    let parsed: serde_json::Value =
        serde_json::from_str(json_str).map_err(|e| e.to_string())?;

    let key = text.to_lowercase();
    if let Some(entry) = parsed.get(&key) {
        let translation = entry["word"].as_str().unwrap_or("");
        let pronunciation = entry["pronunciation"].as_str().unwrap_or("");
        Ok(serde_json::json!({
            "translation": translation,
            "pronunciation": pronunciation,
        })
        .to_string())
    } else {
        Err(format!("\"{}\" not found in dictionary. Add an API key in Settings for AI-powered lookups of any word.", text))
    }
}

#[tauri::command]
fn get_bundled_words(language: String) -> Result<String, String> {
    let json_str = match language.to_lowercase().as_str() {
        "italian" => include_str!("../words/italian.json"),
        "spanish" => include_str!("../words/spanish.json"),
        "french" => include_str!("../words/french.json"),
        "german" => include_str!("../words/german.json"),
        "tamil" => include_str!("../words/tamil.json"),
        "hindi" => include_str!("../words/hindi.json"),
        "mandarin" => include_str!("../words/mandarin.json"),
        _ => include_str!("../words/italian.json"),
    };
    Ok(json_str.to_string())
}

fn siesta_dir() -> Result<std::path::PathBuf, String> {
    let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
    Ok(std::path::PathBuf::from(home).join(".siesta"))
}

fn config_path() -> Result<std::path::PathBuf, String> {
    Ok(siesta_dir()?.join("config.json"))
}

fn vocab_path() -> Result<std::path::PathBuf, String> {
    Ok(siesta_dir()?.join("vocabulary.json"))
}

#[tauri::command]
fn load_shared_vocabulary(language: String) -> Result<String, String> {
    let path = vocab_path()?;
    if !path.exists() {
        return Ok("{}".to_string());
    }
    let contents = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let parsed: serde_json::Value =
        serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    let lang_key = language.to_lowercase();
    let words = parsed.get(&lang_key).cloned().unwrap_or(serde_json::json!({}));
    Ok(words.to_string())
}

fn spawn_sync_server() {
    // Check if port 7749 is already in use
    if std::net::TcpStream::connect("127.0.0.1:7749").is_ok() {
        return; // Server already running
    }

    // Use the standalone sync server at ~/siesta/sync-server/server.js
    let home = std::env::var("HOME").unwrap_or_default();
    let script_path = std::path::PathBuf::from(&home)
        .join("siesta")
        .join("sync-server")
        .join("server.js");

    if !script_path.exists() {
        return;
    }

    match Command::new("node")
        .arg(&script_path)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        Ok(child) => {
            let mut server = SYNC_SERVER.lock().unwrap();
            *server = Some(child);
        }
        Err(_) => {} // Node not installed, skip silently
    }
}

fn stop_sync_server() {
    let mut server = SYNC_SERVER.lock().unwrap();
    if let Some(ref mut child) = *server {
        let _ = child.kill();
        let _ = child.wait();
    }
    *server = None;
}

#[tauri::command]
fn load_persisted_config() -> Result<String, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok("{}".to_string());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_persisted_config(json: String) -> Result<(), String> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_clipboard_monitor(app: tauri::AppHandle, enabled: bool) {
    if enabled {
        clipboard::start_monitoring(app);
    } else {
        clipboard::stop_monitoring();
    }
}

#[tauri::command]
fn start_word_timer(
    app: tauri::AppHandle,
    language: String,
    interval_minutes: u64,
    initial_delay_secs: u64,
) {
    word_timer::start_timer(app, language, interval_minutes, initial_delay_secs);
}

#[tauri::command]
fn stop_word_timer() {
    word_timer::stop_timer();
}

#[tauri::command]
fn open_lookup_window(app: tauri::AppHandle) {
    create_lookup_window(&app);
}

#[tauri::command]
fn open_flashcard_window(app: tauri::AppHandle) {
    create_flashcard_window(&app);
}

fn create_lookup_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("lookup") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(app, "lookup", WebviewUrl::App("/".into()))
        .title("Siesta Lookup")
        .inner_size(440.0, 520.0)
        .center()
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .visible(true)
        .build();
}

fn create_flashcard_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("flashcard") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(app, "flashcard", WebviewUrl::App("/".into()))
        .title("Siesta Flashcard")
        .inner_size(220.0, 170.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .visible(true)
        .build();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            // Start the sync server for Chrome extension communication
            spawn_sync_server();

            // Build tray menu
            let open_lookup = MenuItem::with_id(app, "open_lookup", "Open Lookup", true, None::<&str>)?;
            let toggle_clipboard = MenuItem::with_id(app, "toggle_clipboard", "Toggle Clipboard Monitor", true, None::<&str>)?;
            let open_flashcard = MenuItem::with_id(app, "open_flashcard", "Flashcard Widget", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Siesta", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &open_lookup,
                    &toggle_clipboard,
                    &open_flashcard,
                    &settings,
                    &quit,
                ],
            )?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Siesta")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "open_lookup" => create_lookup_window(app),
                    "open_flashcard" => create_flashcard_window(app),
                    "toggle_clipboard" => {
                        let _ = app.emit("toggle-clipboard", ());
                    }
                    "settings" => {
                        let _ = app.emit("open-settings", ());
                    }
                    "quit" => {
                        stop_sync_server();
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Register global shortcut: CmdOrCtrl+Shift+O
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            let app_handle = app.handle().clone();
            app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+O", move |_app, _shortcut, event| {
                if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    create_lookup_window(&app_handle);
                }
            })?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            translate_text,
            quick_translate,
            lookup_offline,
            toggle_clipboard_monitor,
            open_lookup_window,
            open_flashcard_window,
            start_word_timer,
            stop_word_timer,
            load_persisted_config,
            save_persisted_config,
            load_shared_vocabulary,
            get_bundled_words,
        ])
        .run(tauri::generate_context!())
        .expect("error while running siesta");
}
