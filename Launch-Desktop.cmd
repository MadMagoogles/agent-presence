@echo off
set "APP=%~dp0src-tauri\target\release\agent-presence.exe"
if not exist "%APP%" (
  echo Build the desktop app first: npx tauri build
  pause
  exit /b 1
)
start "" "%APP%"
