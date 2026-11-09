mod analysis;
mod commands;

use commands::{ScanState, cancel_scan, scan_project};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .manage(ScanState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scan_project, cancel_scan])
        .run(tauri::generate_context!());
    if let Err(error) = result {
        eprintln!("Spaghetti Meter failed to start: {error}");
        std::process::exit(1);
    }
}
