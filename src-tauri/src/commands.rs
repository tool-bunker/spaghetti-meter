use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Instant;

use tauri::{AppHandle, State};
use tauri_plugin_shell::{ShellExt, process::CommandEvent};
use tokio::sync::oneshot;

use crate::analysis::{ScanReport, parse_report};

#[derive(Default)]
pub struct ScanState {
    active: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

#[tauri::command]
pub async fn scan_project(
    request_id: String,
    path: String,
    app: AppHandle,
    state: State<'_, ScanState>,
) -> Result<ScanReport, String> {
    let project_path = validate_project_path(&path)?;
    let (cancel_tx, cancel_rx) = oneshot::channel();
    {
        let mut active = state
            .active
            .lock()
            .map_err(|_| "Scan state is unavailable".to_owned())?;
        if active.contains_key(&request_id) {
            return Err("A scan with this request identifier is already running".to_owned());
        }
        active.insert(request_id.clone(), cancel_tx);
    }

    let started = Instant::now();
    let output = run_code_buster(&app, &project_path, cancel_rx).await;
    if let Ok(mut active) = state.active.lock() {
        active.remove(&request_id);
    }

    let stdout = output?;
    let duration_ms = started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64;
    parse_report(&stdout, &project_path, duration_ms)
}

#[tauri::command]
pub fn cancel_scan(request_id: String, state: State<'_, ScanState>) -> Result<bool, String> {
    let sender = state
        .active
        .lock()
        .map_err(|_| "Scan state is unavailable".to_owned())?
        .remove(&request_id);
    Ok(sender.is_some_and(|sender| sender.send(()).is_ok()))
}

fn validate_project_path(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.is_dir() {
        return Err("Choose an existing project folder".to_owned());
    }
    path.canonicalize()
        .map_err(|error| format!("Could not open the selected folder: {error}"))
}

async fn run_code_buster(
    app: &AppHandle,
    project_path: &Path,
    mut cancel_rx: oneshot::Receiver<()>,
) -> Result<Vec<u8>, String> {
    let command = app
        .shell()
        .sidecar("cb")
        .map_err(|error| format!("Could not resolve the bundled Code Buster engine: {error}"))?
        .args([
            "review",
            "--advisory",
            "--no-cache",
            "--format=json",
            "--root",
        ])
        .arg(project_path)
        .set_raw_out(true);
    let (mut events, child) = command
        .spawn()
        .map_err(|error| format!("Could not start the bundled Code Buster engine: {error}"))?;
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();

    let termination = loop {
        tokio::select! {
            event = events.recv() => {
                match event {
                    Some(CommandEvent::Stdout(bytes)) => stdout.extend_from_slice(&bytes),
                    Some(CommandEvent::Stderr(bytes)) => stderr.extend_from_slice(&bytes),
                    Some(CommandEvent::Error(error)) => {
                        stderr.extend_from_slice(error.as_bytes());
                        stderr.push(b'\n');
                    }
                    Some(CommandEvent::Terminated(termination)) => break termination,
                    Some(_) => {}
                    None => {
                        let _ = child.kill();
                        return Err("The bundled Code Buster engine stopped without an exit status".to_owned());
                    }
                }
            }
            _ = &mut cancel_rx => {
                let _ = child.kill();
                return Err("Scan cancelled".to_owned());
            }
        }
    };

    if termination.code == Some(0) {
        return Ok(stdout);
    }

    let status = termination
        .code
        .map(|code| format!("exit code {code}"))
        .or_else(|| termination.signal.map(|signal| format!("signal {signal}")))
        .unwrap_or_else(|| "an unknown status".to_owned());
    let diagnostics = String::from_utf8_lossy(&stderr);
    let diagnostics = diagnostics.trim();
    if diagnostics.is_empty() {
        Err(format!("Code Buster exited with {status}"))
    } else {
        Err(format!("Code Buster exited with {status}: {diagnostics}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_missing_project_directories() {
        let error = validate_project_path("/definitely/not/a/project").unwrap_err();
        assert_eq!(error, "Choose an existing project folder");
    }
}
