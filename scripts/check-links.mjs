#!/usr/bin/env node
/**
 * Pre-deploy guard.
 *
 * The prototype shipped with href="https://www.linkedin.com/" — a link that
 * looks fine in review but goes to a login wall, not a profile. This catches
 * that class of mistake before it reaches production:
 *
 *   - bare social domains with no profile path
 *   - leftover placeholder markers (TODO, FIXME, example.com, #)
 *   - referenced local assets that don't exist on disk
 *   - outbound links that don't resolve (skipped with --offline)
 */

import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const OFFLINE = process.argv.includes('--offline');

const problems = [];
const fail = (msg) => problems.push(msg);

/** Social URLs that are just the site root, i.e. never a real profile. */
const BARE_SOCIAL = [
  /^https?:\/\/(www\.)?linkedin\.com\/?$/i,
  /^https?:\/\/(www\.)?bsky\.app\/?$/i,
  /^https?:\/\/(www\.)?x\.com\/?$/i,
  /^https?:\/\/(www\.)?twitter\.com\/?$/i,
  /^https?:\/\/(www\.)?github\.com\/?$/i,
  /^https?:\/\/(www\.)?instagram\.com\/?$/i,
  /^https?:\/\/(www\.)?mastodon\.social\/?$/i,
];

const PLACEHOLDER = /\b(TODO|FIXME|XXX|CHANGEME|example\.com|your-domain|lorem ipsum)\b/i;

const html = await readFile(join(SRC, 'index.html'), 'utf8');

// The CSS references the font by URL, so it needs checking too.
const css = await readFile(join(SRC, 'assets/css/main.css'), 'utf8');
for (const m of css.matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) {
  const ref = m[1];
  if (ref.startsWith('data:') || /^https?:/i.test(ref)) continue;
  try {
    await access(join(SRC, ref.replace(/^\//, '')));
  } catch {
    fail(`main.css references a missing file: ${ref}`);
  }
}

// --- placeholder text anywhere in the page ---------------------------------
const placeholderHit = html.match(PLACEHOLDER);
if (placeholderHit) fail(`placeholder text left in index.html: "${placeholderHit[0]}"`);

// --- collect hrefs and srcs -------------------------------------------------
const urls = [...html.matchAll(/(?:href|src|content)="([^"]+)"/gi)]
  .map((m) => m[1])
  .filter((u) => u && !u.startsWith('data:'));

const external = [];

for (const url of urls) {
  if (/^https?:\/\//i.test(url)) {
    if (BARE_SOCIAL.some((re) => re.test(url))) {
      fail(`link points at a site root, not a profile: ${url}`);
    }
    external.push(url);
  } else if (url === '#') {
    fail('empty "#" link found');
  } else if (url.startsWith('/')) {
    // Local asset — must exist under src/
    const localPath = join(SRC, url.replace(/^\//, ''));
    try {
      await access(localPath);
    } catch {
      fail(`referenced file missing from src/: ${url}`);
    }
  }
}

// --- outbound reachability --------------------------------------------------
if (!OFFLINE) {
  const unique = [...new Set(external)].filter((u) => !u.includes('idiotique.org'));
  await Promise.all(
    unique.map(async (url) => {
      try {
        const ctl = AbortSignal.timeout(10_000);
        // Some sites (LinkedIn especially) reject HEAD but allow GET.
        let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctl });
        if (res.status === 405 || res.status === 403) {
          res = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctl });
        }
        // 999 is LinkedIn's bot-block; it means reachable, not broken.
        if (!res.ok && res.status !== 999) {
          fail(`${url} returned HTTP ${res.status}`);
        }
      } catch (err) {
        fail(`${url} unreachable: ${err.message}`);
      }
    }),
  );
}

// --- report -----------------------------------------------------------------
if (problems.length) {
  console.error('\n[check-links] FAILED\n');
  for (const p of problems) console.error('  ✗ ' + p);
  console.error('');
  process.exit(1);
}

console.log(`[check-links] OK — ${urls.length} references checked` + (OFFLINE ? ' (offline)' : ''));
