#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use notewren_core::{Branch, Library, Note, Revision};
use notewren_sync::SyncConfig;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::PathBuf,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex;
use uuid::Uuid;

type CommandResult<T> = Result<T, String>;

#[derive(Clone, Default, Deserialize, Serialize)]
struct Settings {
    server_url: String,
    library_id: Option<Uuid>,
    token: String,
    dark: bool,
    #[serde(default)]
    selected_note: Option<Uuid>,
    #[serde(default)]
    selected_branches: BTreeMap<Uuid, Uuid>,
}

#[derive(Serialize)]
struct PublicSettings {
    server_url: String,
    library_id: Option<Uuid>,
    has_token: bool,
    dark: bool,
    database_path: String,
    selected_note: Option<Uuid>,
    selected_branches: BTreeMap<Uuid, Uuid>,
}

#[derive(Serialize)]
struct SyncStatus {
    configured: bool,
    pending: usize,
    last_sync: Option<u64>,
    error: Option<String>,
}

struct Store {
    library: Library,
    settings: Settings,
    directory: PathBuf,
    last_sync: Option<u64>,
    sync_error: Option<String>,
}
struct DesktopState {
    store: Mutex<Store>,
    allow_exit: AtomicBool,
}

fn message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

impl Store {
    fn public_settings(&self) -> PublicSettings {
        PublicSettings {
            server_url: self.settings.server_url.clone(),
            library_id: self.settings.library_id,
            has_token: !self.settings.token.is_empty(),
            dark: self.settings.dark,
            database_path: self.directory.join("library.sqlite3").display().to_string(),
            selected_note: self.settings.selected_note,
            selected_branches: self.settings.selected_branches.clone(),
        }
    }
    fn sync_status(&self) -> CommandResult<SyncStatus> {
        Ok(SyncStatus {
            configured: self.settings.library_id.is_some()
                && !self.settings.server_url.is_empty()
                && !self.settings.token.is_empty(),
            pending: self.library.pending_operations().map_err(message)?.len(),
            last_sync: self.last_sync,
            error: self.sync_error.clone(),
        })
    }
    fn persist_settings(&self, settings: &Settings) -> CommandResult<()> {
        let temporary = self.directory.join("settings.json.tmp");
        let mut options = fs::OpenOptions::new();
        options.create(true).truncate(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(message)?;
        file.write_all(&serde_json::to_vec_pretty(settings).map_err(message)?)
            .map_err(message)?;
        file.sync_all().map_err(message)?;
        fs::rename(temporary, self.directory.join("settings.json")).map_err(message)?;
        Ok(())
    }
}

#[tauri::command]
async fn create_note(
    state: State<'_, DesktopState>,
    title: String,
    body: String,
) -> CommandResult<Note> {
    state
        .store
        .lock()
        .await
        .library
        .create_note(&title, &body)
        .map_err(message)
}
#[tauri::command]
async fn get_note(
    state: State<'_, DesktopState>,
    note_id: Uuid,
    branch_id: Uuid,
) -> CommandResult<Note> {
    state
        .store
        .lock()
        .await
        .library
        .get_note(note_id, branch_id)
        .map_err(message)
}
#[tauri::command]
async fn save_note(
    state: State<'_, DesktopState>,
    note_id: Uuid,
    branch_id: Uuid,
    title: String,
    body: String,
    expected_revision: Uuid,
) -> CommandResult<Note> {
    state
        .store
        .lock()
        .await
        .library
        .save_note(note_id, branch_id, &title, &body, expected_revision)
        .map_err(message)
}
#[tauri::command]
async fn list_notes(
    state: State<'_, DesktopState>,
    branch_id: Option<Uuid>,
) -> CommandResult<Vec<Note>> {
    state
        .store
        .lock()
        .await
        .library
        .list_notes(branch_id)
        .map_err(message)
}
#[tauri::command]
async fn list_branches(
    state: State<'_, DesktopState>,
    note_id: Uuid,
) -> CommandResult<Vec<Branch>> {
    state
        .store
        .lock()
        .await
        .library
        .list_branches(note_id)
        .map_err(message)
}
#[tauri::command]
async fn history(
    state: State<'_, DesktopState>,
    note_id: Uuid,
    branch_id: Uuid,
) -> CommandResult<Vec<Revision>> {
    state
        .store
        .lock()
        .await
        .library
        .history(note_id, branch_id)
        .map_err(message)
}
#[tauri::command]
async fn create_branch(
    state: State<'_, DesktopState>,
    note_id: Uuid,
    from_revision: Uuid,
    name: String,
) -> CommandResult<Branch> {
    state
        .store
        .lock()
        .await
        .library
        .create_branch(note_id, from_revision, &name)
        .map_err(message)
}
#[tauri::command]
async fn rename_branch(
    state: State<'_, DesktopState>,
    branch_id: Uuid,
    name: String,
) -> CommandResult<Branch> {
    state
        .store
        .lock()
        .await
        .library
        .rename_branch(branch_id, &name)
        .map_err(message)
}
#[tauri::command]
async fn archive_branch(
    state: State<'_, DesktopState>,
    branch_id: Uuid,
    archived: bool,
    active_branch_id: Uuid,
) -> CommandResult<Branch> {
    if archived && branch_id == active_branch_id {
        return Err("Switch your writing branch before archiving this one.".into());
    }
    state
        .store
        .lock()
        .await
        .library
        .archive_branch(branch_id, archived)
        .map_err(message)
}
#[tauri::command]
async fn delete_branch(
    state: State<'_, DesktopState>,
    branch_id: Uuid,
    active_branch_id: Uuid,
) -> CommandResult<()> {
    if branch_id == active_branch_id {
        return Err("Switch your writing branch before deleting this one.".into());
    }
    state
        .store
        .lock()
        .await
        .library
        .delete_branch(branch_id)
        .map_err(message)
}
#[tauri::command]
async fn get_settings(state: State<'_, DesktopState>) -> CommandResult<PublicSettings> {
    Ok(state.store.lock().await.public_settings())
}
#[tauri::command]
async fn set_selection(
    state: State<'_, DesktopState>,
    note_id: Uuid,
    branch_id: Uuid,
) -> CommandResult<()> {
    let mut store = state.store.lock().await;
    store
        .library
        .get_note(note_id, branch_id)
        .map_err(message)?;
    let mut settings = store.settings.clone();
    settings.selected_note = Some(note_id);
    settings.selected_branches.insert(note_id, branch_id);
    store.persist_settings(&settings)?;
    store.settings = settings;
    Ok(())
}
#[tauri::command]
async fn save_settings(
    state: State<'_, DesktopState>,
    server_url: String,
    library_id: Option<Uuid>,
    token: Option<String>,
    dark: bool,
) -> CommandResult<PublicSettings> {
    let mut store = state.store.lock().await;
    let server_url = server_url.trim().trim_end_matches('/').to_owned();
    if !server_url.is_empty() {
        let url = tauri::Url::parse(&server_url).map_err(message)?;
        if !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(
                "Use a server URL without credentials, query parameters or a fragment.".into(),
            );
        }
        let local = matches!(
            url.host_str(),
            Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
        );
        if url.scheme() != "https" && !(url.scheme() == "http" && local) {
            return Err("Use HTTPS, or HTTP on localhost for local testing.".into());
        }
        if library_id.is_none() {
            return Err("Enter the library ID issued by your sync server.".into());
        }
    }
    let settings = Settings {
        server_url,
        library_id,
        token: token.unwrap_or_else(|| store.settings.token.clone()),
        dark,
        selected_note: store.settings.selected_note,
        selected_branches: store.settings.selected_branches.clone(),
    };
    store.persist_settings(&settings)?;
    store.settings = settings;
    Ok(store.public_settings())
}
#[tauri::command]
async fn sync_status(state: State<'_, DesktopState>) -> CommandResult<SyncStatus> {
    state.store.lock().await.sync_status()
}
#[derive(Serialize)]
struct SyncResult {
    status: SyncStatus,
    conflicts: Vec<Branch>,
    pushed: usize,
}
#[tauri::command]
async fn sync_now(state: State<'_, DesktopState>) -> CommandResult<SyncResult> {
    let mut store = state.store.lock().await;
    let config = SyncConfig {
        server_url: store.settings.server_url.clone(),
        library_id: store
            .settings
            .library_id
            .ok_or("Configure a sync library first.")?,
        token: store.settings.token.clone(),
    };
    if config.token.is_empty() || config.server_url.is_empty() {
        return Err("Configure a server URL and token first.".into());
    }
    match notewren_sync::sync_now(&mut store.library, &config).await {
        Ok(report) => {
            store.last_sync = Some(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(message)?
                    .as_secs(),
            );
            store.sync_error = None;
            Ok(SyncResult {
                status: store.sync_status()?,
                conflicts: report.conflicts,
                pushed: report.pushed,
            })
        }
        Err(error) => {
            let text = error.to_string().replace(&config.token, "[redacted]");
            store.sync_error = Some(text.clone());
            Err(text)
        }
    }
}
#[tauri::command]
fn finish_exit(app: tauri::AppHandle, state: State<'_, DesktopState>) {
    state.allow_exit.store(true, Ordering::SeqCst);
    app.exit(0);
}

fn main() {
    let app = tauri::Builder::default()
        .setup(|app| {
            let directory = std::env::var_os("NOTEWREN_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(app.path().app_data_dir()?);
            fs::create_dir_all(&directory)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&directory, fs::Permissions::from_mode(0o700))?;
            }
            let settings_path = directory.join("settings.json");
            let settings = match fs::read(&settings_path) {
                Ok(bytes) => serde_json::from_slice(&bytes)?,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => Settings::default(),
                Err(error) => return Err(error.into()),
            };
            let library = Library::open(directory.join("library.sqlite3"))?;
            app.manage(DesktopState {
                store: Mutex::new(Store {
                    library,
                    settings,
                    directory,
                    last_sync: None,
                    sync_error: None,
                }),
                allow_exit: AtomicBool::new(false),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_note,
            get_note,
            save_note,
            list_notes,
            list_branches,
            history,
            create_branch,
            rename_branch,
            archive_branch,
            delete_branch,
            get_settings,
            save_settings,
            set_selection,
            sync_status,
            sync_now,
            finish_exit
        ])
        .build(tauri::generate_context!())
        .expect("Could not open the NoteWren local library");
    app.run(|app, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if !app
                .state::<DesktopState>()
                .allow_exit
                .load(Ordering::SeqCst)
            {
                api.prevent_exit();
                if let Err(error) = app.emit("save-before-exit", ()) {
                    eprintln!("Could not request editor save: {error}");
                }
            }
        }
    });
}
