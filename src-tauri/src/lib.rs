use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};

mod clipboard;
mod word_timer;

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
            toggle_clipboard_monitor,
            open_lookup_window,
            open_flashcard_window,
            start_word_timer,
            stop_word_timer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running siesta");
}
