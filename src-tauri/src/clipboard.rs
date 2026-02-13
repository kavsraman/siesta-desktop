use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;

static MONITORING: AtomicBool = AtomicBool::new(false);

pub fn start_monitoring(app: tauri::AppHandle) {
    if MONITORING.load(Ordering::SeqCst) {
        return;
    }
    MONITORING.store(true, Ordering::SeqCst);

    let running = Arc::new(AtomicBool::new(true));

    std::thread::spawn(move || {
        let mut clipboard = match arboard::Clipboard::new() {
            Ok(c) => c,
            Err(_) => return,
        };

        let mut last_text = clipboard.get_text().unwrap_or_default();

        while running.load(Ordering::SeqCst) && MONITORING.load(Ordering::SeqCst) {
            std::thread::sleep(std::time::Duration::from_millis(500));

            if let Ok(current) = clipboard.get_text() {
                if current != last_text && !current.trim().is_empty() {
                    last_text = current.clone();
                    let _ = app.emit("clipboard-text", current);
                }
            }
        }
    });
}

pub fn stop_monitoring() {
    MONITORING.store(false, Ordering::SeqCst);
}
