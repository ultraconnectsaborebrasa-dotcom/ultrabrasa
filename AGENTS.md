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
