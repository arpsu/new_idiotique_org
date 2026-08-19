#!/usr/bin/env node
/**
 * Builds src/ into dist/.
 *
 * The site works when opened straight from src/ — this build is purely an
 * optimisation pass:
 *   1. copy static assets
 *   2. rasterise the OG card from SVG, with the real font embedded
 *   3. minify index.html, main.css and main.js
 *
 * CSS and JS are external files, so the CSP in _headers uses 'self' and needs
 * no hashing step here.
 */

import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

const log = (...a) => console.log('[build]', ...a);

async function buildOgImage() {
  const svgPath = join(SRC, 'assets/icons/og-image.svg');
  const outPath = join(DIST, 'assets/icons/og-image.png');
  if (!existsSync(svgPath)) {
    log('no og-image.svg, skipping');
    return;
  }

  // A pre-rendered og-image.png is committed to src/, so social cards work
  // even without a build. Only regenerate when sharp is available.
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch {
    if (existsSync(outPath)) {
      log('sharp not installed — keeping the committed og-image.png');
    } else {
      log('WARNING: sharp missing and no committed og-image.png — cards will 404');
    }
    return;
  }

  // Inline the WOFF2 as a data URI so the rasteriser uses the real font
  // rather than falling back to whatever the build machine has installed.
  const fontData = await readFile(join(SRC, 'assets/fonts/space-grotesk-latin.woff2'));
  const fontFace =
    `<style>@font-face{font-family:'Space Grotesk';font-weight:500;` +
    `src:url(data:font/woff2;base64,${fontData.toString('base64')}) format('woff2');}</style>`;

  let svg = await readFile(svgPath, 'utf8');
  svg = svg.replace('<title>', `${fontFace}<title>`);

  await sharp(Buffer.from(svg), { density: 144 })
    .resize(1200, 630, { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  log('og-image.png 1200x630');
}

/** Conservative minifiers. No parser dependency; safe on these files. */

function minifyHtml(html) {
  return html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '') // drop comments, keep conditionals
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/\s+/g, ' ')
    .trim();
}

function minifyJs(js) {
  // Strips block comments and collapses indentation only. Deliberately does
  // NOT touch line comments or strings — mangling "https://" or a regex
  // literal here would be a silent production break, and the file is small
  // enough that the extra bytes do not matter.
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  await cp(SRC, DIST, { recursive: true });
  log('copied src -> dist');

  await buildOgImage();

  // The SVG is a build input, not something to serve.
  await rm(join(DIST, 'assets/icons/og-image.svg'), { force: true });

  const targets = [
    ['index.html', minifyHtml],
    ['assets/css/main.css', minifyCss],
    ['assets/js/main.js', minifyJs],
  ];

  for (const [rel, minify] of targets) {
    const from = join(SRC, rel);
    if (!existsSync(from)) {
      throw new Error(`missing source file: ${rel}`);
    }
    const before = await readFile(from, 'utf8');
    const after = minify(before);
    await writeFile(join(DIST, rel), after);
    const pct = (100 - (100 * after.length) / before.length).toFixed(1);
    log(`${rel}: ${before.length} -> ${after.length} bytes (-${pct}%)`);
  }

  const files = await readdir(DIST, { recursive: true });
  log(`done — ${files.length} entries in dist/`);
}

main().catch((err) => {
  console.error('[build] failed:', err);
  process.exit(1);
});
