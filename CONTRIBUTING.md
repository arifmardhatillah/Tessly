# Contributing to Tessly

Thanks for your interest. Bug reports, ideas and pull requests are all welcome.

- **Found a bug?** Open an [issue](https://github.com/arifmardhatillah/Tessly/issues/new/choose). The form asks for your Tessly and Windows versions.
- **Want to change something?** For anything larger than a small fix, open an issue first so we can agree on the approach.

## Run it locally

Requires Windows and a current LTS version of Node.js.

```bash
npm install
npm run test:scan   # test the log reader without Electron
npm start           # run the app
npm run dist        # build the installer into dist/ (without publishing)
```

If you start it from the VS Code terminal and get a `requestSingleInstanceLock` error, unset `ELECTRON_RUN_AS_NODE` first (Bash: `env -u ELECTRON_RUN_AS_NODE npm start`).

## Development hooks

These only work when running from source, never in the installed app.

| Variable | Effect |
|---|---|
| `CLAUDE_CONFIG_DIR=folder` | Read test logs instead of your real ones. |
| `TM_SHOT=out.png` | Save a screenshot of the window and quit. |
| `TM_JS="..."` | Run a script in the page before the screenshot, for example to click a tab. |
| `TM_FAKE_UPDATE=9.9.9` | Show the update popup. `TM_FAKE_STATUS` (`downloading`, `ready`, `installing`) picks the stage. |
| `TM_FRAMES=120` | With `TM_SHOT`, save that many frames in a row (`out-000.png`, ...) every `TM_FRAME_MS` ms (default 80), for demo GIFs. |

## Project layout

| Path | Purpose |
|---|---|
| `src/scanner.js` | Reads logs incrementally, removes duplicate replies, sums per date and model |
| `src/history.js` | Keeps per date and model totals in `history.json` |
| `src/main.js` | Tray, window, log watching, settings |
| `src/updater.js` | Update checks and installs from GitHub Releases |
| `renderer/` | The dashboard: plain HTML, CSS and JS with SVG charts |
| `renderer/i18n.js` | All interface text, in English and Indonesian |
| `renderer/dropdown.js` | The custom dropdown component |

## How counting works

1. Windows notifies Tessly when Claude Code writes to a log (`fs.watch`), and Tessly reads only the new part of that file. As a fallback, all logs are rescanned every 30 seconds.
2. One model reply can appear in the log several times, so each reply is counted once by `message.id` + `requestId`.
3. Totals per date and model are saved in `%APPDATA%\Tessly\history.json`. Tessly keeps the highest value it has seen, so history survives when Claude Code deletes old logs.

## Guidelines

- Keep the app light: no frameworks in the renderer, no new runtime dependencies without a good reason.
- Never store or send conversation content. Only token counts per date and model.
- Every interface string goes in `renderer/i18n.js`, in both languages.
- Test with `CLAUDE_CONFIG_DIR` pointing at sample logs, not your own.

## Publishing a release (maintainer)

1. Bump `version` in `package.json`.
2. Write the changes in `build/release-notes.md` (shown in the update popup).
3. Create a fine-grained GitHub token for the repository with *Contents: Read and write*.
4. In PowerShell, from the project folder, run `powershell -ExecutionPolicy Bypass -File .\release.ps1`. The script asks for the token; it is not shown while you paste it.
