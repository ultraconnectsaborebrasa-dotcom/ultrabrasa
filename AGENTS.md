<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Desktop packaging (Electron)

- The Windows executable is built with `vite.electron.config.ts` (static client build with `base: "./"` and prerender of `/`), then the generated `dist/client/index.html` paths are rewritten from `/assets/` to `./assets/`. Never ship the nitro server output (`dist/server`) in the package — Electron serves `dist/client` through an internal http server in `electron/main.cjs` so SPA routing works without `file://` quirks.
- Package with `@electron/packager --platform=win32 --arch=x64 --electron-version=<installed>`, never electron-builder (7zip errors in the sandbox). Keep the output outside the project directory (`electron-release` exceeds the repo per-file commit limit) — build to /tmp or move it out before finishing.

## PDV access and persistence
- Public home renders an inline account entry until a verified Cloud user has a database role; database RLS and RPC authorization enforce permissions independently of the UI.
- Roles live only in protected user_roles; the primary admin claim checks the confirmed Auth email server-side, never user-editable metadata.
- Shared PDV snapshots use serialized revision-checked writes to prevent silent overwrites; drafts remain terminal-local and the original local data is backed up before Cloud import.
- Operators may sell, edit active shared orders, work the kitchen and manage cash; only admins change the catalog/settings, cancel orders, or grant access.
- Sales history uses payment timestamps, local inclusive calendar dates, product-ID aggregation, and stored service amounts for new orders to preserve historical details.
- Shared state Realtime subscriptions mount only for authorized accounts and clean up on exit; monotonic revisions and deferred updates preserve local drafts and in-flight writes.
- Desktop fullscreen uses an isolated preload exposing only window-mode actions, with F11 and Escape handled in the main process; browsers use the native fullscreen API.
