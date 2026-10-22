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
- Desktop uses a single-instance loopback origin on a stable port for account persistence; packaged asset-pointer URLs must be materialized under dist/client so branding is served locally.
- Windows CI installs the Lightning CSS native package at the resolved wrapper version and validates a transform before building; this prevents missing or mismatched optional Windows binaries without changing project dependencies.

## PDV access and persistence
- Public home renders an inline account entry until a verified Cloud user has a database role; database RLS and RPC authorization enforce permissions independently of the UI.
- Roles live only in protected user_roles; the primary admin claim checks the confirmed Auth email server-side, never user-editable metadata.
- Shared PDV snapshots use serialized revision-checked writes to prevent silent overwrites; drafts remain terminal-local and the original local data is backed up before Cloud import.
- Operators receive prices and calculated totals only for active orders; their own attendance history is an explicit server allowlist without prices, totals or payments, so closed revenue cannot be recovered from the response.
- Customer contacts and order-linked visits live outside the shared snapshot with admin-only reads; optional contact capture is transactional with operator submission and idempotent by order, with normalized phone deduplication and explicit promotion consent to prevent unauthorized marketing.
- Promotions use consent-filtered CSV export and individual WhatsApp deep links, not automated sending; the customer directory never exposes connector credentials.
- Team removal revokes only operator roles and never deletes profiles or order history; role mutation RPCs serialize changes and reject administrator targets to protect all admin accounts.
- Android uses a HTTPS-only native WebView of the published site with no JavaScript bridge or separate data store; this keeps web releases, login and role-enforced shared data consistent across devices.
- Operator submissions derive prices, stock and seller identity in a locked database function; client amounts are never accepted, and idempotency prevents duplicate sends.
- Table selection is structured and validated against the fixed table list; kitchen and floor views share table labels to keep destinations unambiguous.
- Sales history uses payment timestamps, local inclusive calendar dates, product-ID aggregation, and stored service amounts for new orders to preserve historical details.
- Shared state Realtime subscriptions mount only for authorized accounts and clean up on exit; monotonic revisions and deferred updates preserve local drafts and in-flight writes.
- Desktop fullscreen uses an isolated preload exposing only window-mode actions, with F11 and Escape handled in the main process; browsers use the native fullscreen API.
- Settings use an administrator-only grouped editor with explicit validated saves; optional settings retain legacy defaults so existing shared snapshots remain compatible.
- The uploaded brand logo is served through its asset pointer and shared Brand component; never redraw it for navigation or account screens.
