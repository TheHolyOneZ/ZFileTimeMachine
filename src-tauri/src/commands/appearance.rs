use std::sync::OnceLock;
use tauri::{Runtime, Theme, WebviewWindow};

static MATERIAL: OnceLock<&'static str> = OnceLock::new();

pub fn apply_window_material<R: Runtime>(window: &WebviewWindow<R>) -> &'static str {
    let material = choose_material(window);
    let _ = MATERIAL.set(material);
    material
}

#[cfg(target_os = "macos")]
fn choose_material<R: Runtime>(window: &WebviewWindow<R>) -> &'static str {
    use tauri::window::{Effect, EffectState, EffectsBuilder};
    let effects = EffectsBuilder::new()
        .effect(Effect::Sidebar)
        .state(EffectState::FollowsWindowActiveState)
        .build();
    match window.set_effects(effects) {
        Ok(()) => "vibrancy",
        Err(_) => "none",
    }
}

#[cfg(target_os = "windows")]
fn choose_material<R: Runtime>(window: &WebviewWindow<R>) -> &'static str {
    use tauri::window::{Effect, EffectsBuilder};
    if windows_version::OsVersion::current().build < 22000 {
        return "none";
    }
    match window.set_effects(EffectsBuilder::new().effect(Effect::Mica).build()) {
        Ok(()) => "mica",
        Err(_) => "none",
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn choose_material<R: Runtime>(_window: &WebviewWindow<R>) -> &'static str {
    "none"
}

#[tauri::command]
pub fn get_window_material() -> &'static str {
    MATERIAL.get().copied().unwrap_or("none")
}

#[tauri::command]
pub fn set_window_theme<R: Runtime>(theme: String, window: WebviewWindow<R>) -> Result<(), String> {
    let dark = theme != "light";
    window
        .set_theme(Some(if dark { Theme::Dark } else { Theme::Light }))
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    if get_window_material() == "mica" {
        use tauri::window::{Effect, EffectsBuilder};
        let effect = if dark { Effect::MicaDark } else { Effect::MicaLight };
        window
            .set_effects(EffectsBuilder::new().effect(effect).build())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
