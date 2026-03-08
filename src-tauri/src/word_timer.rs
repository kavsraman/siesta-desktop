use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::Emitter;

static TIMER_RUNNING: AtomicBool = AtomicBool::new(false);

static WORD_LIST: Mutex<Vec<(String, String, String)>> = Mutex::new(Vec::new());

fn load_words_for_language(language: &str) -> Vec<(String, String, String)> {
    // First, try to load from shared vocabulary (user's actual exposure history)
    let shared = load_shared_vocab(language);
    if !shared.is_empty() {
        return shared;
    }

    // Fall back to embedded word list
    load_embedded_words(language)
}

fn load_shared_vocab(language: &str) -> Vec<(String, String, String)> {
    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return Vec::new(),
    };
    let path = std::path::PathBuf::from(home)
        .join(".siesta")
        .join("vocabulary.json");
    if !path.exists() {
        return Vec::new();
    }

    let contents = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let parsed: Value = match serde_json::from_str(&contents) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let lang_key = language.to_lowercase();
    let lang_data = match parsed.get(&lang_key) {
        Some(Value::Object(map)) => map,
        _ => return Vec::new(),
    };

    // Collect words, prioritizing exposed/familiar (not yet acquired) for spaced repetition
    let mut exposed_familiar: Vec<(String, String, String)> = Vec::new();
    let mut acquired: Vec<(String, String, String)> = Vec::new();

    // Shared vocab keys are foreign words, "translation" field is the English meaning
    for (foreign_word, entry) in lang_data {
        let english = entry["translation"].as_str().unwrap_or("").to_string();
        let pronunciation = entry["pronunciation"].as_str().unwrap_or("").to_string();
        if english.is_empty() {
            continue;
        }
        let stage = entry["stage"].as_str().unwrap_or("exposed");
        if stage == "acquired" {
            acquired.push((english, foreign_word.clone(), pronunciation));
        } else {
            exposed_familiar.push((english, foreign_word.clone(), pronunciation));
        }
    }

    // Prioritize exposed/familiar words, then mix in acquired words
    let mut result = exposed_familiar;
    result.extend(acquired);
    result
}

fn load_embedded_words(language: &str) -> Vec<(String, String, String)> {
    let json_str = match language.to_lowercase().as_str() {
        "italian" => include_str!("../words/italian.json"),
        "spanish" => include_str!("../words/spanish.json"),
        "french" => include_str!("../words/french.json"),
        "german" => include_str!("../words/german.json"),
        "tamil" => include_str!("../words/tamil.json"),
        "hindi" => include_str!("../words/hindi.json"),
        "mandarin" => include_str!("../words/mandarin.json"),
        "korean" => include_str!("../words/korean.json"),
        _ => include_str!("../words/italian.json"),
    };

    let parsed: Value = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let mut words = Vec::new();
    if let Value::Object(map) = parsed {
        for (english, entry) in map {
            let word = entry["word"].as_str().unwrap_or("").to_string();
            let pronunciation = entry["pronunciation"].as_str().unwrap_or("").to_string();
            if !word.is_empty() {
                words.push((english, word, pronunciation));
            }
        }
    }
    words
}

pub fn start_timer(
    app: tauri::AppHandle,
    language: String,
    interval_minutes: u64,
    initial_delay_secs: u64,
) {
    let lang_for_thread = language.clone();
    if TIMER_RUNNING.load(Ordering::SeqCst) {
        stop_timer();
        // Small delay to let old thread exit
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    let words = load_words_for_language(&language);
    if words.is_empty() {
        return;
    }

    {
        let mut list = WORD_LIST.lock().unwrap();
        *list = words;
    }

    TIMER_RUNNING.store(true, Ordering::SeqCst);

    let lang = lang_for_thread;
    std::thread::spawn(move || {
        let interval = std::time::Duration::from_secs(interval_minutes * 60);
        let sleep_chunk = std::time::Duration::from_secs(1);
        let mut index = {
            use std::time::{SystemTime, UNIX_EPOCH};
            let seed = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            seed as usize
        };

        // Wait for remaining time from last delivery before emitting first word
        if initial_delay_secs > 0 {
            let delay = std::time::Duration::from_secs(initial_delay_secs);
            let mut waited = std::time::Duration::ZERO;
            while waited < delay && TIMER_RUNNING.load(Ordering::SeqCst) {
                std::thread::sleep(sleep_chunk);
                waited += sleep_chunk;
            }
            if !TIMER_RUNNING.load(Ordering::SeqCst) {
                return;
            }
        }

        while TIMER_RUNNING.load(Ordering::SeqCst) {
            let word_data = {
                let list = WORD_LIST.lock().unwrap();
                if list.is_empty() {
                    break;
                }
                let idx = index % list.len();
                index += 1;
                list[idx].clone()
            };

            let delivered_at = {
                use std::time::{SystemTime, UNIX_EPOCH};
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis()
                    .to_string()
            };

            let payload = serde_json::json!({
                "english": word_data.0,
                "translation": word_data.1,
                "pronunciation": word_data.2,
                "language": lang,
                "deliveredAt": delivered_at,
            });

            let _ = app.emit("new-word-of-hour", payload.clone());

            // Send notification
            #[cfg(not(target_os = "linux"))]
            {
                let _ = app.emit("send-notification", serde_json::json!({
                    "title": "Word of the Hour",
                    "body": format!("{} — {}", word_data.0, word_data.1),
                }));
            }

            // Sleep for the full interval before next word
            let mut elapsed = std::time::Duration::ZERO;
            while elapsed < interval && TIMER_RUNNING.load(Ordering::SeqCst) {
                std::thread::sleep(sleep_chunk);
                elapsed += sleep_chunk;
            }
        }
    });
}

pub fn stop_timer() {
    TIMER_RUNNING.store(false, Ordering::SeqCst);
}
