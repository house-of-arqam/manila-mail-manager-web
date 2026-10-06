---
name: testing-static-site
description: How to run and end-to-end test the manila-mail-manager-web static GitHub Pages site (docs/) locally in a browser — serving it, pixel-diffing against a baseline branch, animation/sprite-icon checks, the Paddle checkout page, and CSP verification.
---

# Testing the Manila Mail Manager website (docs/)

## Serving

Everything is static under `docs/` — no build step, no dependencies, no credentials.

```bash
cd docs && python3 -m http.server 8899
```

Then browse `http://localhost:8899/index.html`, `privacy.html`, `terms.html`, `support.html`,
`checkout.html`. Check the browser console on every page; a healthy run has zero errors and zero 404s.

## Devin Secrets Needed

None for local testing. A real Paddle client-side token (sandbox `test_...` or production
`live_...`) from the project owner is needed only to render a complete checkout form / payment flow.

## Pixel-diffing against a baseline branch

The most reliable way to prove a refactor is visually neutral is to serve both versions and diff
screenshots taken at the same scroll offset:

```bash
git worktree add /tmp/baseline main
cd /tmp/baseline/docs && python3 -m http.server 8900
```

Load each page on both ports, scroll the same number of clicks, screenshot, then:

```python
from PIL import Image, ImageChops
A = Image.open(a).convert('RGB').crop((0, 55, 1024, 730))  # crop out Chrome chrome + taskbar
B = Image.open(b).convert('RGB').crop((0, 55, 1024, 730))
print(ImageChops.difference(A, B).getbbox())
```

Expect a small residual diff around x≈235–262 near the top: that is the **port number text in the
address bar**, not page content. Zoom-crop it to confirm before reporting a real diff.

## Things that need explicit verification (they are easy to silently break)

Home-page behavior lives in `docs/assets/home.js`. Effects play once, never loop: the hero
inbox scan, slot-machine digits (`slotRoll`: hero counts, the `#score-value` 72, and
`#pricing-amount` on a Monthly/Yearly click), and fade-up reveals for headings/cards that start
below the fold (`.reveal-pending` until seen). After scrolling the whole page,
`document.querySelectorAll('.reveal-pending').length` must be 0; blank space after that is a real
bug. With reduced motion none of them run and the static markup shows.

- **Web fonts** — Instrument Serif (headlines, `.serif`) and Geist are self-hosted from
  `docs/assets/fonts/` and every page's CSP carries `font-src 'self'`. Check
  `document.fonts.check('40px "Instrument Serif"')` and that headings do not render in Georgia; a CSP
  violation in the console means a page's meta tag lost `font-src`.
- **Espresso bands** — `.masthead`, `.plan-pro` and `.closing` set `color-scheme: dark` and stay
  dark in both themes; only the body sections flip with `data-theme` / the OS preference. The
  folder frame around the hero screenshot stays kraft (fixed colors) in both.
- **Pricing toggle** — `#billing-yearly` is pressed on load ($29.99 /year); `#billing-monthly`
  swaps `#pricing-amount`/`#pricing-period`/`#pricing-desc` to $4.99 /month.
- **Theme init race** — an extension in the test Chrome profile has been seen adding
  `class="js" data-theme="dark"` to `<html>` on first load; if a "light" screenshot comes out
  dark with `localStorage.mmm-theme` unset, that is the profile, not `theme.js`. Reload.
- **SVG sprite icons** — `index.html` defines a hidden `<svg class="icon-sprite">` with
  `#icon-plus` (FAQ), and `demo.html` with `#icon-folder`, `#icon-search`, referenced via
  `<use href="#...">`. A broken
  sprite id renders as *blank space*, not a broken-image marker, and the stripped DOM still shows
  `<svg></svg>`. **Always confirm icons visually in a zoomed screenshot** — DOM inspection will not
  catch this class of bug.
- **FAQ accordion** — clicking one `.faq-question` closes all others; check both the visual state
  and `aria-expanded`.
- **Mobile nav** — resize the OS window (`wmctrl -r :ACTIVE: -e 0,0,0,430,760`) rather than using
  devtools device mode; `#nav-toggle` appears and `#nav-links` gets `.open`.
  Measure the actual viewport: Chrome may clamp native windows to 500 CSS px despite a smaller
  requested width. For exact narrower coverage, use DevTools responsive mode (Ctrl+Shift+I,
  Ctrl+Shift+M), set width/height explicitly, and scroll inside the emulated page. In mobile
  emulation, compare `document.documentElement.clientWidth` and `visualViewport.width`;
  horizontal overflow can inflate `innerWidth`. Attribute unexpected overflow by checking the
  same viewport against a baseline worktree before treating it as a regression.

## The demo inbox (`docs/demo.html`, `docs/assets/demo.js`)

The demo lives on its own page (linked from the hero "Try the demo inbox →", the nav and the
footer); `demo.js` is a no-op without `#demo`, so it is not loaded on the home page. `#demo` is a
sandbox copy of the extension: 10 rows of mixed mail render on load, and a scan tags
only the subscription rows (`.is-sub` + checkbox + `Subscription · N/week` badge + Unsubscribe).

- Row controls live in `.demo-slot` / `.demo-tagslot` / `.demo-actionslot` wrappers, **not** as
  direct children of `.demo-row`. DOM surgery that assumes otherwise throws (`replaceChild`
  `NotFoundError`), so check the console after *every* demo click — the row can look half-updated
  while the header and status silently stop advancing.
- Verify unsubscribe both ways: a single row's button, and bulk with 2+ ticked. A throw inside
  `markUnsubscribed()` aborts the bulk `forEach`, so bulk marking only the first row is the
  signature of that bug.
- The reduced-motion branch is read **at page load**, so set the DevTools rendering override and
  *then* reload, or the scan still animates.
- To prove tagging causes no layout shift, record `getBoundingClientRect().top` for every
  `.demo-row` before and after the scan and compare — cheaper and stricter than eyeballing.
- When re-testing a one-line fix, `curl http://localhost:8899/assets/demo.js | grep <expression>`
  first; it rules out a stale served/cached asset for free.

## checkout.html

`docs/checkout.html` loads real Paddle from `https://cdn.paddle.com/paddle/v2/paddle.js` and
branches on query params:

- No `txn`/`token` → `"Missing checkout parameters."` and **no** Try Again button.
- Any `txn`/`token` that Paddle rejects → Paddle shows its own "Something went wrong" overlay.
  **Close the overlay** (X, top-right) to fire `checkout.closed`, which renders `"Checkout closed."`
  **with** a Try Again button. This is the cheap way to exercise the retry render path without a
  real payment.
- The `checkout.completed` success state cannot be reached without a real Paddle transaction —
  report it as untested rather than claiming it works.

Once the param-validation work lands (checkout logic split into `docs/checkout.js`), the params are
also validated client-side before Paddle is touched:

- `txn` must match `/^txn_[a-z0-9]{1,64}$/`
- `token` must match `/^(live|test)_[a-z0-9]{16,80}$/`
- `env` is allowlisted to `production`; anything else falls back to `sandbox`
- invalid → `"Invalid checkout parameters."`; missing → `"Missing checkout parameters."`

A well-formed but fake token (e.g. `?txn=txn_01hzz&token=test_abcdefghijklmnop123456`) is enough to
prove paddle.js loads, the overlay iframe opens, and CSP allows frame/script/connect. Paddle will log
CORS/403 errors from `sandbox-checkout-service.paddle.com`; that is expected with a fake token, not a
site bug.

## key.html (license-key copy page)

`docs/key.html` + `docs/key.js` read the key from the URL **fragment** (`key.html#k=<jwt>`), so:

- The fragment never reaches the server; `key.js` runs once on load. **Changing only the hash does not
  re-run it** — after editing `#k=...` in the omnibox you must reload (`ctrl+r`), otherwise you are
  looking at the previous render and may wrongly report the wrong error string.
- States: no `#k` → `This link is missing your license key.`; `#k` failing
  `/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/` → `This link does not contain a valid license
  key.`; both add a purchase-email / "Restore purchase" hint plus a "Back to Manila Mail Manager"
  button. Valid → `<pre class="key-block">` + "Copy key" + 3-step list.
- Use a **synthetic** 3-segment base64url token (generate one with python base64) — never a real
  license key — and never type a long token into the omnibox: xdotool `type` drops characters in
  ~300-char strings and you will silently test a mangled key. Instead serve a tiny local launcher page
  containing an `<a href="https://manilamail.app/key.html#k=<token>">` and click it.
- To prove the clipboard really holds the key without devtools, serve a local paste-target page with a
  `<textarea>` that compares the pasted value against the expected token (fetch it from a sibling
  `expected.txt`) and prints `length` + `exact match: YES/NO`; then Ctrl+V into it. `xclip`/`xsel` are
  not installed on the box.
- Testing the real `navigator.clipboard` path requires a secure context, i.e. the live
  `https://manilamail.app/key.html`; over `http://localhost` Chrome still counts as secure, but the
  production URL is the only way to prove the deployed page.
- Mobile check: resize the OS window (`wmctrl -r :ACTIVE: -b remove,maximized_vert,maximized_horz`
  then `wmctrl -r :ACTIVE: -e 0,0,0,390,760`) rather than devtools device mode.

## Verifying CSP

CSP is delivered via `<meta http-equiv="Content-Security-Policy">` in each page (added by the
security-hardening work). When checking:

- Keep the DevTools Console open and look for `Refused to load/connect/frame ...` lines. Check *every*
  directive, not just `script-src` — third-party SDKs (e.g. Paddle) inject stylesheets and fonts too,
  so `style-src`/`font-src` gaps only show up in the console.
- `frame-ancestors` is always ignored in a `<meta>` CSP (Chrome logs an error). On GitHub Pages there
  is no way to set the header, so this directive is effectively dead — expect this console error on
  every page and don't treat it as a regression.
- To attribute a violation to the CSP change, copy the page with the meta tag stripped
  (`grep -v 'Content-Security-Policy' page.html > page-nocsp.html`) and compare. Delete the copy
  afterwards.

## Adversarial URL testing in Chrome's omnibox

Chrome inline-autocompletes previously visited URLs, which silently sends you to the wrong URL.
Always: click the omnibox → `ctrl+a` → type the URL → press `Delete` (kills the autocomplete suffix)
→ `Return`. Confirm the final URL in the screenshot before judging the result.

To prove nothing was injected, evaluate `document.getElementById('status').innerHTML` and check it
contains only the plain error `<div class="error">...</div>`.
