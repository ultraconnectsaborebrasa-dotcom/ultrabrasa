## Desktop packaging (Electron)

- The connected Windows edition loads the fixed HTTPS published app, not a bundled snapshot; web updates arrive on opening after publication without rebuilding the executable. Do not ship server output or secrets.
- Package with `@electron/packager --platform=win32 --arch=x64 --electron-version=<installed>`, never electron-builder (7zip errors in the sandbox). Keep the output outside the project directory (`electron-release` exceeds the repo per-file commit limit) — build to /tmp or move it out before finishing.
- Desktop remains single-instance with persistent browser storage on the published origin; clear only HTTP cache, never account storage, and require confirmation before a manual reload so active drafts are not silently lost. Native Electron updates still require a new verified package.
- Windows CI installs the Lightning CSS native package at the resolved wrapper version and validates a transform before building; this prevents missing or mismatched optional Windows binaries without changing project dependencies.
- Desktop uses an isolated preload exposing only fullscreen and confirmed reload actions, validates the exact app origin for IPC and sends external HTTP(S) links to the browser; F11/Escape remain in the main process.
