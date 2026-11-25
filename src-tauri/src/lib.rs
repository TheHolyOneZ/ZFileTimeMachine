use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use rusqlite::Connection;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

pub mod commands;
pub mod config;
pub mod db;
pub mod diff;
pub mod error;
pub mod events;
pub mod rename;
pub mod snapshot;
pub mod store;
pub mod util;
pub mod watcher;

pub use error::AppError;


pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub cas: Arc<store::cas::CasStore>,
    pub data_dir: PathBuf,
    pub activity_log_path: PathBuf,
    pub supervisor: Mutex<watcher::supervisor::Supervisor>,

    pub close_to_tray: Arc<Mutex<bool>>,
}

impl AppState {
    pub fn db_arc(&self) -> Arc<Mutex<Connection>> {
        Arc::clone(&self.db)
    }
}

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "zfiletimemachine=info".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,

            Some(vec!["--hidden"]),
        ))
        .setup(|app| {
            let data_dir = resolve_data_dir();
            std::fs::create_dir_all(&data_dir)?;
            watcher::ignore::protect_path(&data_dir);
            {
                let paths = app.path();
                for dir in [
                    paths.app_data_dir(),
                    paths.app_local_data_dir(),
                    paths.app_cache_dir(),
                    paths.app_config_dir(),
                    paths.app_log_dir(),
                ]
                .into_iter()
                .flatten()
                {
                    watcher::ignore::protect_path(&dir);
                }
                #[cfg(target_os = "macos")]
                if let Ok(home) = paths.home_dir() {
                    watcher::ignore::protect_path(&home.join("Library").join("WebKit").join(&app.config().identifier));
                }
            }

            let cas_dir = data_dir.join("cas");
            std::fs::create_dir_all(&cas_dir)?;

            let db_path = data_dir.join("db.sqlite");
            let conn = Connection::open(&db_path)?;
            db::migrations::run(&conn)?;


            let initial_close_to_tray = db::repo::get_setting(&conn, "global_settings")
                .ok()
                .flatten()
                .and_then(|j| serde_json::from_str::<config::GlobalSettings>(&j).ok())
                .map(|s| s.close_to_tray)
                .unwrap_or(false);

            let close_to_tray = Arc::new(Mutex::new(initial_close_to_tray));

            let db = Arc::new(Mutex::new(conn));
            let cas = Arc::new(store::cas::CasStore::new(cas_dir));
            let supervisor = watcher::supervisor::Supervisor::new();


            {
                let guard = db.lock().expect("db lock");
                let _ = db::repo::purge_stale_deletions(&guard);
            }


            let folders = {
                let guard = db.lock().expect("db lock");
                let folders = db::repo::list_folders(&guard).unwrap_or_default();
                for folder in &folders {
                    watcher::supervisor::purge_protected_files(&guard, &cas, folder.id, &PathBuf::from(&folder.path));
                }
                folders
            };
            let mut sup = supervisor;
            for folder in folders {
                if folder.paused { continue; }
                let folder_path = PathBuf::from(&folder.path);
                if folder_path.exists() {
                    sup.start_folder(
                        folder.id,
                        folder_path,
                        folder.config.clone(),
                        Arc::clone(&db),
                        Arc::clone(&cas),
                        app.handle().clone(),
                    );
                }
            }

            let activity_log_path = data_dir.join("activity.log");
            app.manage(AppState {
                db,
                cas,
                activity_log_path,
                data_dir,
                supervisor: Mutex::new(sup),
                close_to_tray,
            });


            let show_i = MenuItem::with_id(app, "show", "Open ZFileTimeMachine", true, None::<&str>)?;
            let sep    = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit ZFileTimeMachine", true, None::<&str>)?;
            let menu   = Menu::with_items(app, &[&show_i, &sep, &quit_i])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("ZFileTimeMachine")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            tray_builder.build(app)?;


            #[cfg(target_os = "windows")]
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_shadow(windows_version::OsVersion::current().build >= 22000);
            }

            if std::env::args().any(|a| a == "--hidden") {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.hide();
                }
            }

            tracing::info!("ZFileTimeMachine started");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let should_hide = window
                    .app_handle()
                    .try_state::<AppState>()
                    .map(|s| s.close_to_tray.lock().map(|g| *g).unwrap_or(false))
                    .unwrap_or(false);
                if should_hide {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::dev::run_qa_suite,
            commands::folders::get_platform,
            commands::folders::list_folders,
            commands::folders::add_folder,
            commands::folders::update_folder_config,
            commands::folders::rename_folder,
            commands::folders::remove_folder,
            commands::folders::toggle_folder_pause,
            commands::folders::undelete_folder,
            commands::snapshots::list_files,
            commands::snapshots::list_files_paged,
            commands::snapshots::list_snapshots,
            commands::snapshots::trigger_manual_snapshot,
            commands::snapshots::run_gc,
            commands::snapshots::set_file_override,
            commands::snapshots::set_path_override,
            commands::snapshots::cleanup_orphaned_files,
            commands::snapshots::get_dedup_stats,
            commands::snapshots::get_cas_size,
            commands::snapshots::list_activity_log,
            commands::snapshots::run_integrity_check,
            commands::snapshots::get_storage_breakdown,
            commands::recover::bulk_recover,
            commands::recover::open_path,
            commands::rewind::preview_diff,
            commands::rewind::rewind_to,
            commands::settings::get_global_settings,
            commands::settings::update_global_settings,
            commands::notes::set_file_note,
            commands::notes::set_snapshot_note,
            commands::notes::search_notes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZFileTimeMachine");
}

fn resolve_data_dir() -> PathBuf {
    if let Some(dirs) = directories::ProjectDirs::from("com", "zfiletimemachine", "ZFileTimeMachine") {
        dirs.data_local_dir().to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(".zfiletimemachine")
    }
}
