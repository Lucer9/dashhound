# dashhound: notes for Claude

dashhound is a local dashcam for a developer's browser: a WebExtension records pages, clicks, field changes,
fetch/XHR calls with redacted bodies, console errors and a few screenshots on the sites the user lists, and one
Python file (`dashhound`) stores it on disk, loops it by hours or MB, and serves it to a CLI and an MCP server.
Read README.md first; it is the user-facing contract.

## Layout
- `extension/manifest.json`: Manifest V3, Firefox 128+ and Chromium. `background.scripts` (Firefox) and
  `background.service_worker` (Chrome) point at the same code.
- `extension/background.js`: settings, registers `content.js` and `page.js` only on listed sites, redacts bodies,
  screenshots, native messaging to the host.
- `extension/page.js`: runs in the page (`world: MAIN`), wraps fetch/XHR, catches console errors.
- `extension/content.js`: names clicks and field changes, relays page.js messages.
- `extension/redact.js`: body redaction (keys and card numbers). `test/redact.test.js` covers it.
- `dashhound`: native host + CLI (`log`, `shots`, `install`, `pack`, `mcp`, `selftest`). Python 3.8+, stdlib only.

## Rules
- **Privacy first.** Never record request or response headers, cookies or storage. Anything new that is recorded
  goes through redaction and is covered in README's privacy list. Nothing may be sent off the machine: no
  telemetry, no remote calls, no CDN scripts.
- **No dependencies.** Plain JS in the extension (no build step), Python standard library in `dashhound`.
- **Every browser.** Use the `api` alias (`globalThis.browser || globalThis.chrome`), not `browser` or `chrome`
  directly. If a browser API only exists in one browser, say so in README's limits.
- **README stays true.** A change to what is recorded, a setting, a command or a limit updates README in the same PR.
- **Comments:** a short doc comment on functions whose purpose is not obvious; no line-by-line narration.
- Bump `version` in `extension/manifest.json` and `VERSION` in `dashhound` together.

## Checks (all must pass)
```
./dashhound selftest
node test/redact.test.js
for f in extension/*.js; do node --check "$f"; done
```
The extension itself is checked by hand: `./dashhound install && ./dashhound pack`, install `dist/dashhound.xpi` in
Firefox Developer Edition (or load `extension/` unpacked in Chrome), browse a listed site, `./dashhound log`.

## Issues
A good bug report has: what happened vs. what was expected, browser and version, dashhound version, and a
`./dashhound log --since 15m --json` excerpt around the problem (already redacted, but ask the reporter to check it
before posting). Ask for whichever is missing. Label with `bug`, `enhancement`, `question`, `privacy` (anything
recorded that should not be), `browser-support`, and `needs-info` while waiting on the reporter.
