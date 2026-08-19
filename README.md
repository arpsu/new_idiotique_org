# idiotique.org

Personal landing page. One page, no framework, no tracking.

A wordmark decodes in character by character, then glitches occasionally.
Below it sit links to LinkedIn and Bluesky. That's the whole site.

## Quick start

The site is plain HTML/CSS/JS with no build required to develop:

```bash
# any static server works — the site is just files
npx serve src            # or: python3 -m http.server -d src 8000
```

Open <http://localhost:3000>. Edit `src/index.html` and reload.

## Commands

| Command               | What it does                                             |
| --------------------- | -------------------------------------------------------- |
| `npm run dev`         | Serve `src/` for development                             |
| `npm run build`       | Produce optimised `dist/` (minify HTML/CSS/JS, OG image) |
| `npm run preview`     | Build, then serve `dist/` — what actually ships          |
| `npm run lint`        | Prettier format check                                    |
| `npm run format`      | Rewrite files to match formatting                        |
| `npm run check:links` | Verify links resolve and referenced assets exist         |
| `npm test`            | lint + build + link check (what CI runs)                 |

`npm install` is only needed for `sharp`, which rasterises the OG image.
Everything else runs on stock Node 18+.

## Structure

```
src/
  index.html                     markup only
  site.webmanifest               PWA/install metadata
  robots.txt  sitemap.xml        crawler hints
  _headers                       CSP + caching (Netlify / Cloudflare Pages)
  assets/
    css/main.css                 all styling, including the glitch keyframes
    js/main.js                   decode-in and ambient glitch
    fonts/space-grotesk-latin.woff2   self-hosted, latin subset (22 KB)
    icons/                            favicon set + OG card source
scripts/
  build.mjs                      src/ -> dist/
  check-links.mjs                pre-deploy link and asset guard
```

Markup, styling and behaviour are separate files. The script is loaded with
`defer` so it never blocks the first paint, and because both are external the
CSP can use `'self'` with no inline hashes and no `'unsafe-inline'`.

## Deploying

The build output is static files. Point any host at `dist/`.

**Netlify / Cloudflare Pages** — build command `npm run build`, publish
directory `dist`. Both read `_headers` automatically, so the CSP and cache
rules apply with no extra configuration.

**GitHub Pages / S3 / nginx** — `_headers` is ignored; port those rules to
the host's own config, or you lose the CSP and long-lived asset caching.

### Pre-deploy checklist

- [ ] `npm test` passes
- [ ] Social links point at the intended profiles
- [ ] `og:url` and `canonical` in `index.html` match the real domain
- [ ] Share the URL somewhere private and confirm the card image renders
- [ ] Check the page on a phone once — the decode animation is the product

## Design notes

Decisions worth knowing before changing things:

**The wordmark ships as text.** `<h1>idiotique.org</h1>` is real content;
JavaScript replaces it with per-character spans only to animate. Without JS
the page still renders and the links still work. Don't move the text into
the script.

**Screen readers get one string.** The `<h1>` carries `aria-label`, and every
generated `.char` span is `aria-hidden`. Otherwise assistive tech announces
thirteen separate letters.

**The animation stops when nobody is watching.** The glitch loop pauses on
`visibilitychange` and clears its timers, so a backgrounded tab costs nothing.

**Reduced motion is fully honoured.** `prefers-reduced-motion: reduce` skips
the decode-in and never starts the glitch loop — the JS returns early rather
than relying on CSS alone, because the scramble effect swaps text content.

**Colours are constrained by contrast, not taste.** `--dim` is `#757575`
(4.56:1 on black). The prototype's `#6b6b6b` was 3.94:1, below WCAG AA. Going
dimmer fails the only interactive elements on the page.

**The dim-flash used to be an invert.** `g-invert` originally applied
`filter:invert(1)`, which flashed a white block on a black page. It now dims
instead — same read, without the photosensitivity risk.

**The font is self-hosted.** One 22 KB latin-subset WOFF2 covers the wordmark
and every glitch glyph. This removes a third-party request to Google Fonts
(also the associated GDPR question) and the flash of fallback text.

**CSS and JS have short cache lifetimes.** `main.css` and `main.js` are served
without content hashes in their filenames, so `_headers` gives them one hour
plus revalidation rather than the font's `immutable` year. If you ever add
build-time hashing to the filenames, raise those two rules to match.

## Licence

Site code: MIT, see `LICENSE`.
Space Grotesk: SIL Open Font License 1.1, see `src/assets/fonts/OFL.txt`.
