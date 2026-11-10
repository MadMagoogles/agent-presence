use serde::Deserialize;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, menu::{Menu, MenuItem}, tray::TrayIconBuilder};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Clone, Deserialize)]
struct HitRegion { x: f64, y: f64, width: f64, height: f64, radius: f64 }
impl HitRegion {
    fn contains(&self, x: f64, y: f64) -> bool {
        if x < self.x || y < self.y || x > self.x + self.width || y > self.y + self.height { return false; }
        let r = self.radius.min(self.width / 2.0).min(self.height / 2.0).max(0.0);
        let cx = x.clamp(self.x + r, self.x + self.width - r);
        let cy = y.clamp(self.y + r, self.y + self.height - r);
        (x - cx).powi(2) + (y - cy).powi(2) <= r * r
    }
}
type Regions = Arc<Mutex<Vec<HitRegion>>>;

#[tauri::command]
fn set_hit_regions(regions: Vec<HitRegion>, state: tauri::State<Regions>) {
    if let Ok(mut value) = state.lock() { *value = regions.into_iter().take(32).collect(); }
}
#[tauri::command]
fn quit_app(app: tauri::AppHandle) { app.exit(0); }

fn action(app: &tauri::AppHandle, id: &str) {
    if id == "quit" { app.exit(0); }
    else { let _ = app.emit("desktop-action", id); }
}

#[cfg(windows)]
fn click_through(window: tauri::WebviewWindow, regions: Regions) -> tauri::Result<()> {
    use windows_sys::Win32::{Foundation::POINT, UI::{WindowsAndMessaging::GetCursorPos, HiDpi::GetDpiForWindow, Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON}}};
    use windows_sys::Win32::Graphics::Gdi::ClientToScreen;
    let hwnd = window.hwnd()?.0 as isize;
    std::thread::spawn(move || {
        let mut ignored = false;
        let mut held = false;
        loop {
            // Native polling is necessary: JS receives no pointer-enter while the window ignores clicks.
            // Lock an interactive mouse-down until release so native dragging/popover interactions survive.
            let mut cursor = POINT { x: 0, y: 0 };
            let mut origin = POINT { x: 0, y: 0 };
            unsafe {
                if GetCursorPos(&mut cursor) != 0 && ClientToScreen(hwnd as _, &mut origin) != 0 {
                    let dpi = GetDpiForWindow(hwnd as _).max(96) as f64 / 96.0;
                    let x = (cursor.x - origin.x) as f64 / dpi;
                    let y = (cursor.y - origin.y) as f64 / dpi;
                    let down = GetAsyncKeyState(VK_LBUTTON as i32) < 0;
                    if !down { held = false; }
                    let hit = regions.lock().map(|r| r.iter().any(|r| r.contains(x, y))).unwrap_or(true);
                    if down && !ignored { held = true; }
                    let next = !(hit || held);
                    if next != ignored {
                        if window.set_ignore_cursor_events(next).is_ok() { ignored = next; }
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(Regions::default())
        .invoke_handler(tauri::generate_handler![set_hit_regions, quit_app])
        .setup(|app| {
            let items = [
                ("show", "Show agents"), ("toggle", "Hide / restore"),
                ("style:frosted", "1 — Frosted grain"), ("style:dark", "2 — Dark glass"),
                ("style:iridescent", "3 — Iridescent edge"), ("style:aurora", "4 — Aurora glow"),
                ("demo", "Demo: play sequence"), ("working", "Demo: working"), ("complete", "Demo: complete + confetti"),
                ("handoff", "Demo: message bubble"), ("needs", "Demo: needs you"),
                ("idle", "Reset to idle"), ("quit", "Quit Agent Presence"),
            ];
            let menu = Menu::new(app)?;
            for (id, text) in items {
                menu.append(&MenuItem::with_id(app, id, text, true, None::<&str>)?)?;
            }
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("App icon").clone())
                .tooltip("Agent Presence — Ctrl+Alt+H restores")
                .menu(&menu)
                .on_menu_event(|app, event| action(app, event.id.as_ref()))
                .build(app)?;
            // Registration failures should not kill an otherwise working overlay (tray is the fallback).
            let shortcuts = [
                ("Ctrl+Alt+1", "style:frosted"), ("Ctrl+Alt+2", "style:dark"),
                ("Ctrl+Alt+3", "style:iridescent"), ("Ctrl+Alt+4", "style:aurora"),
                ("Ctrl+Alt+BracketLeft", "previous"), ("Ctrl+Alt+BracketRight", "next"),
                ("Ctrl+Alt+W", "working"), ("Ctrl+Alt+C", "complete"),
                ("Ctrl+Alt+M", "handoff"), ("Ctrl+Alt+N", "needs"),
                ("Ctrl+Alt+I", "idle"), ("Ctrl+Alt+H", "toggle"),
                ("Ctrl+Alt+P", "demo"), ("Ctrl+Alt+F", "hover"), ("Ctrl+Alt+Q", "quit"),
            ];
            for (key, id) in shortcuts {
                if let Err(err) = app.global_shortcut().on_shortcut(key, move |app, _, event| {
                    if event.state == ShortcutState::Pressed { action(app, id); }
                }) { eprintln!("Shortcut {key} unavailable; use tray menu: {err}"); }
            }
            #[cfg(windows)]
            if let Some(window) = app.get_webview_window("main") {
                click_through(window, app.state::<Regions>().inner().clone())?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Unable to run Agent Presence");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn recording_shortcuts_parse() {
        for key in ["Ctrl+Alt+1", "Ctrl+Alt+2", "Ctrl+Alt+3", "Ctrl+Alt+4", "Ctrl+Alt+BracketLeft", "Ctrl+Alt+BracketRight", "Ctrl+Alt+W", "Ctrl+Alt+C", "Ctrl+Alt+M", "Ctrl+Alt+N", "Ctrl+Alt+I", "Ctrl+Alt+H", "Ctrl+Alt+F", "Ctrl+Alt+Q", "Ctrl+Alt+P"] {
            assert!(key.parse::<tauri_plugin_global_shortcut::Shortcut>().is_ok(), "Invalid recording shortcut: {key}");
        }
    }
    #[test]
    fn rounded_pill_bounds() {
        let r = HitRegion { x: 100.0, y: 180.0, width: 342.0, height: 90.0, radius: 24.0 };
        assert!(r.contains(270.0, 225.0));
        assert!(r.contains(124.0, 180.0));
        assert!(!r.contains(100.0, 180.0));
        assert!(!r.contains(270.0, 100.0)); // message flight is visual only
        assert!(!r.contains(443.0, 225.0));
    }
}
