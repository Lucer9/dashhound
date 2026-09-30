# dashhound

**A dashcam for your dev browser.** Named for dogfooding (and for a dog).

You're using your own app and something breaks. You try again and it works fine. You weren't screen recording, the
reload cleared the console, and localhost has no Datadog to point at it. dashhound is the dashcam that was already
rolling: a local log of what happened on the sites you choose (pages, clicks, what you typed, API calls with what
they sent and got back, errors) and a screenshot when something goes wrong. When the bug shows up, you, or your coding
agent, look back instead of trying to reproduce it.

The story behind it, and Dash the pixel hound: [carlosaguirre.workers.dev/work/dashhound](https://www.carlosaguirre.workers.dev/work/dashhound/)

```
14:02:11 tab 3 page    http://localhost:3000/cart  Your cart
14:02:15 tab 3 field   Quantity = '0' on /cart
14:02:18 tab 3 field   Promo code = 'SPRING' on /cart
14:02:19 tab 3 click   'Apply' (button) on /cart
14:02:19 tab 3 net     POST 422 http://localhost:3000/api/cart/promo
14:02:20 tab 3 shot    HTTP 422 POST /api/cart/promo -> ~/.local/share/dashhound/shots/20260930-140220-3.jpg
14:02:24 tab 3 click   'Checkout' (button) on /cart
14:02:24 tab 3 console uncaught: TypeError: Cannot read properties of undefined (reading 'total')
```

- **Local only.** Everything is written to `~/.local/share/dashhound` by a small local program. No account, no
  server, no upload.
- **Only the sites you list.** Default: `http://localhost/*` and `http://127.0.0.1/*`. Add your staging or QA
  hosts in the extension's settings. dashhound's scripts are only injected there; other sites never run them.
- **Private by default.** Password and card fields, anything matching your private selectors, values under keys
  like `password`, `token`, `secret`, `authorization`, `apiKey`, `session` or `cookie`, any extra body keys you
  list in settings (one per line: a plain word matches a whole key name ignoring case, `/regex/` for patterns),
  and anything that passes a card-number checksum are stored as `[private]`. Request headers are never recorded.
- **Loop recording.** Like a dashcam: the oldest recording is deleted when either limit is hit, 24 hours or 500 MB
  by default (both configurable). It is a dashcam, not an archive.
- **Readable by agents.** `dashhound mcp` is an MCP server, so Claude Code, Cursor or any MCP client can ask "what
  did the user just do, and what failed?" before asking you.

## What it records

| Kind | When | What |
|---|---|---|
| `page` | the URL changes (single-page app routes included) | URL and title |
| `click` | you click | the words on the button or link (aria-label / title / text), or `field <name>` |
| `field` | a field changes and loses focus, or a select/checkbox changes | `name = value` |
| `submit` | a form is submitted | the form's name |
| `net` | a `fetch` or `XMLHttpRequest` finishes | method, status (or error), URL, time, and the request and response bodies (text only, redacted, 32 KB each by default) |
| `console` | `console.error`, an uncaught error, an unhandled rejection | the message |
| `shot` | after a save-type click (save, add, confirm, delete, submit, pay…), a form submit, HTTP ≥ 400, or a console error | a JPEG of the tab, at most one every 4 s, only of the tab on screen |

Shadow DOM is fine: clicks and fields inside open shadow roots are named from the real element.

## Install

Needs Python 3.8+ (standard library only).

With pipx, no clone:

```sh
pipx install git+https://github.com/Lucer9/dashhound
dashhound install            # registers the local host with Firefox
dashhound pack               # builds ./dist/dashhound.xpi in the current folder
```

Or from a clone (the commands below are written for this way; with pipx drop the `./`):

```sh
git clone https://github.com/Lucer9/dashhound ~/dashhound && cd ~/dashhound
./dashhound install          # registers the local host with Firefox
./dashhound pack             # builds dist/dashhound.xpi
```

Either way, `install` writes a small launcher, `~/.local/share/dashhound/dashhound-host`, that runs dashhound with
the Python it was installed for, and registers that with the browser. Run `install` again if you move the clone or
reinstall with a different Python. Unpacked Chrome loading needs a folder: with pipx the extension is at
`<pipx venv>/share/dashhound/extension`, or unzip the `.xpi`.

**Firefox:** until dashhound is signed on addons.mozilla.org, load it in Firefox Developer Edition or Nightly with
`xpinstall.signatures.required = false` (about:config), then *Install Add-on From File* → `dist/dashhound.xpi`.
Or, for a session, `about:debugging` → *Load Temporary Add-on* → `extension/manifest.json`.

**Chrome / Edge / Brave:** `chrome://extensions` → Developer mode → *Load unpacked* → `extension/`. Copy the id it
shows, then `./dashhound install --chrome-id <id>`.

Then open the extension's settings to choose which sites to record.

## The toolbar button

The toolbar icon is Dash, a pixel dachshund. He wears a **red bandana** on tabs that are being recorded and takes it
off everywhere else, so there is no badge. Click him for the menu:

- the site, and whether it is **Recording**, **Paused** or **Not recorded**;
- one action that fits: **Record this site** (adds `<scheme>://<host>/*`, any port, then offers to reload, since the
  scripts only reach pages loaded after the site is listed), **Pause** or **Resume recording** (stops everything
  without touching the list; kept across restarts);
- what just happened in this tab: the last 5 events with their time, failed calls and errors in red (never field
  values or bodies; kept in memory for the browser session only);
- the **coat**: dapple (default), cream, black (hard to see on dark toolbars), or your own colours for coat, muzzle,
  ears and bandana;
- **Copy log command** (`dashhound log --since 10m`, to paste for your agent) and Settings.

The dog was drawn in `art/icon.json` (16×16, one letter per colour). `python3 art/export.py` writes the store icons
and `extension/dog.js`, which the extension uses to draw him in any colours at runtime.

## Reading it

```sh
./dashhound log                       # last hour
./dashhound log --since 10m --kind click,net,console
./dashhound log --grep checkout --since 2h
./dashhound log --kind net --bodies   # what each API call sent and got back
./dashhound log --grep expired        # searches bodies too
./dashhound log --json                # raw events
./dashhound shots                     # screenshots with their reason
./dashhound status                    # data folder, size vs. the MB cap, oldest/newest event, last hour, browser connected
./dashhound report --since 30m -o bug.html   # one HTML file to attach to a bug report
```

`report` takes the same `--since`, `--grep` and `--kind` as `log` and prints the path it wrote (default
`dashhound-report.html`). The file has no external assets and opens offline: the timeline, screenshots inline, and
each API call's bodies in a collapsible block. The bodies are already redacted, but read the file before you share it.

## Deleting recordings

If something sensitive got recorded by mistake:

```sh
./dashhound clear --since 10m         # deletes the last 10 minutes of events and screenshots
./dashhound clear                     # deletes everything
./dashhound clear --yes               # no confirmation prompt
```

`clear` asks for confirmation unless you pass `--yes`. Screenshots are matched by the time they were taken. A browser
that is recording right now keeps writing new events after the clear.

`status` shows "connected" when a dashhound host process is running, which means a browser with the extension is
open. The MB cap shown is the one the extension last sent; until then it shows the 500 MB default.

## For coding agents (MCP)

```sh
claude mcp add dashhound -- dashhound mcp                        # Claude Code, installed with pipx
claude mcp add dashhound -- ~/dashhound/dashhound mcp            # Claude Code, from a clone
```

Any MCP client works the same way: command `dashhound` (or `~/dashhound/dashhound`), argument `mcp`. Tools:

- `recent_activity(since?, grep?, kinds?, bodies?)`: the timeline as text, newest last; `bodies` adds what each
  API call sent and got back.
- `get_screenshot(file)`: one of the screenshots listed in the timeline, as an image.

## How it works

`extension/` is a Manifest V3 extension (Firefox 140+, Chrome, Edge, Brave). The background registers two scripts,
only on the sites you list: `page.js` runs in the page itself and wraps `fetch` and `XMLHttpRequest` (reading a copy
of each response, so the page's own reading is untouched) and catches console errors; `content.js` names clicks and
field changes. `background.js` redacts bodies (`redact.js`), adds page loads, takes screenshots, and streams
everything over native messaging to `dashhound`, which appends one JSON Lines file per hour and runs the loop.

Capturing in the page rather than through the browser's network API is what makes bodies work the same in every
browser: Chrome's Manifest V3 cannot read response bodies from an extension without attaching the debugger.

Checks: `./dashhound selftest` (writer, loop limits, reader, report, MCP) and `node test/redact.test.js` (redaction).

## Limits

- Screenshots need the tab to be the visible one in its window (browser rule).
- Requests made by web workers and service workers are not seen (only the page's own `fetch`/XHR).
- Tabs that were open before a site was added to the list start recording after a reload.
- `status` finds the running host with `ps`, so on systems without it (Windows) it reports the browser as "unknown".
- Pausing stops what is recorded, not the page scripts: they stay injected on listed sites and simply have their events dropped.
- Safari is not supported yet (its extensions package and talk to native apps differently).
- Values typed into fields are recorded unless private: keep the site list to development and test environments.

## License

MIT
