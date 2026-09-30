# tabcam

**A dashcam for your dev browser.** tabcam quietly keeps a local log of what you did on the sites you choose
(pages, clicks, field changes, API calls, errors) and takes a screenshot when something worth seeing happens.
When something breaks, you, or your coding agent, can look back instead of trying to reproduce it.

```
14:02:11 tab 3 page    http://localhost:3000/cart  Your cart
14:02:15 tab 3 field   Quantity = '0' on /cart
14:02:18 tab 3 field   Promo code = 'SPRING' on /cart
14:02:19 tab 3 click   'Apply' (button) on /cart
14:02:19 tab 3 net     POST 422 http://localhost:3000/api/cart/promo
14:02:20 tab 3 shot    HTTP 422 POST /api/cart/promo -> ~/.local/share/tabcam/shots/20260930-140220-3.jpg
14:02:24 tab 3 click   'Checkout' (button) on /cart
14:02:24 tab 3 console uncaught: TypeError: Cannot read properties of undefined (reading 'total')
```

- **Local only.** Everything is written to `~/.local/share/tabcam` by a small local program. No account, no
  server, no upload.
- **Only the sites you list.** Default: `http://localhost/*` and `http://127.0.0.1/*`. Add your staging or QA
  hosts in the extension's settings.
- **Private by default.** Password and card fields, anything matching your private selectors, and any value that
  looks like a card number are stored as `[private]`.
- **Short memory.** Files older than 24 hours (configurable) are deleted. It is a dashcam, not an archive.
- **Readable by agents.** `tabcam mcp` is an MCP server, so Claude Code, Cursor or any MCP client can ask "what
  did the user just do, and what failed?" before asking you.

## What it records

| Kind | When | What |
|---|---|---|
| `page` | the URL changes (single-page app routes included) | URL and title |
| `click` | you click | the words on the button or link (aria-label / title / text), or `field <name>` |
| `field` | a field changes and loses focus, or a select/checkbox changes | `name = value` |
| `submit` | a form is submitted | the form's name |
| `net` | an XHR/fetch finishes | method, status (or error), URL |
| `console` | `console.error`, an uncaught error, an unhandled rejection | the message |
| `shot` | after a save-type click (save, add, confirm, delete, submit, pay…), a form submit, HTTP ≥ 400, or a console error | a JPEG of the tab, at most one every 4 s, only of the tab on screen |

Shadow DOM is fine: clicks and fields inside open shadow roots are named from the real element.

## Install

Needs Python 3.8+ (standard library only).

```sh
git clone <this repo> ~/tabcam && cd ~/tabcam
./tabcam install          # registers the local host with Firefox
./tabcam pack             # builds dist/tabcam.xpi
```

**Firefox:** until tabcam is signed on addons.mozilla.org, load it in Firefox Developer Edition or Nightly with
`xpinstall.signatures.required = false` (about:config), then *Install Add-on From File* → `dist/tabcam.xpi`.
Or, for a session, `about:debugging` → *Load Temporary Add-on* → `extension/manifest.json`.

**Chrome / Edge / Brave:** `chrome://extensions` → Developer mode → *Load unpacked* → `extension/`. Copy the id it
shows, then `./tabcam install --chrome-id <id>`.

Then open the extension's settings to choose which sites to record.

## Reading it

```sh
./tabcam log                       # last hour
./tabcam log --since 10m --kind click,net,console
./tabcam log --grep checkout --since 2h
./tabcam log --json                # raw events
./tabcam shots                     # screenshots with their reason
```

## For coding agents (MCP)

```sh
claude mcp add tabcam -- ~/tabcam/tabcam mcp            # Claude Code
```

Any MCP client works the same way: command `~/tabcam/tabcam`, argument `mcp`. Tools:

- `recent_activity(since?, grep?, kinds?)`: the timeline as text, newest last.
- `get_screenshot(file)`: one of the screenshots listed in the timeline, as an image.

## How it works

`extension/` is a Manifest V3 extension (Firefox 128+, Chromium). `page.js` runs in the page to catch console
errors; `content.js` names clicks and field changes; `background.js` adds page loads and API calls, applies the
site list, takes screenshots, and streams everything over native messaging to `tabcam`, which appends one JSON
Lines file per hour. `tabcam selftest` checks the writer, the reader and the MCP server.

## Limits

- Screenshots need the tab to be the visible one in its window (browser rule).
- Request and response bodies are not recorded; status and URL are.
- Values typed into fields are recorded unless private: keep the site list to development and test environments.

## License

MIT
