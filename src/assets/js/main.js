/**
 * Wordmark decode-in and ambient glitch.
 *
 * The wordmark ships as plain text in index.html so the page works without
 * JavaScript; this only takes over to animate it.
 */
(function () {
  'use strict';

  var el = document.getElementById('wordmark');
  if (!el) return;

  var text = el.textContent.trim();
  var DECODE_STEP = 80; // ms between each character appearing
  var DECODE_DURATION = 1800;
  var GLITCH_DURATION = 400; // must match the CSS animation length
  var SCRAMBLE_SWAP = 160; // how long a scrambled glyph stays swapped

  // Swap the plain text for per-character spans only once we're animating.
  el.setAttribute('aria-label', text);
  el.textContent = '';

  var frag = document.createDocumentFragment();
  for (var i = 0; i < text.length; i++) {
    var span = document.createElement('span');
    span.className = 'char';
    span.style.setProperty('--i', i);
    span.setAttribute('aria-hidden', 'true');
    span.textContent = text[i] === ' ' ? ' ' : text[i];
    frag.appendChild(span);
  }
  el.appendChild(frag);

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) {
    el.classList.add('settled');
    return; // no decode-in, no ambient flicker
  }

  var chars = Array.prototype.slice.call(el.querySelectorAll('.char'));
  var pool = chars.filter(function (c) {
    return c.textContent.trim().length > 0;
  });
  var variants = ['g-slice', 'g-jitter', 'g-invert', 'g-scramble'];
  var scrambleGlyphs = '#%&+=*?/\\<>01'.split('');

  var timers = [];
  function later(fn, ms) {
    var id = window.setTimeout(function () {
      timers.splice(timers.indexOf(id), 1);
      fn();
    }, ms);
    timers.push(id);
    return id;
  }
  function clearTimers() {
    timers.forEach(window.clearTimeout);
    timers.length = 0;
  }

  function randomInt(n) {
    return Math.floor(Math.random() * n);
  }

  function triggerGlitch(c) {
    if (!c) return;
    var variant = variants[randomInt(variants.length)];
    c.classList.remove.apply(c.classList, variants);
    void c.offsetWidth; // force reflow so the animation restarts
    c.classList.add(variant);

    if (variant === 'g-scramble') {
      // Cache the true glyph on the node: if a second glitch lands mid-swap
      // we must not save the scrambled character as the original.
      if (!c.dataset.char) c.dataset.char = c.textContent;
      c.textContent = scrambleGlyphs[randomInt(scrambleGlyphs.length)];
      later(function () {
        c.textContent = c.dataset.char;
        delete c.dataset.char;
      }, SCRAMBLE_SWAP);
    }

    later(function () {
      c.classList.remove(variant);
    }, GLITCH_DURATION);
  }

  var running = false;

  function scheduleNext() {
    if (!running) return;
    later(
      function () {
        if (!running) return;
        var n = Math.random() < 0.35 ? 2 : 1;
        for (var k = 0; k < n; k++) {
          triggerGlitch(pool[randomInt(pool.length)]);
        }
        scheduleNext();
      },
      2500 + Math.random() * 5000,
    );
  }

  function start() {
    if (running) return;
    running = true;
    scheduleNext();
  }

  function stop() {
    running = false;
    clearTimers();
    // Leave no character frozen mid-glitch when we pause.
    pool.forEach(function (c) {
      c.classList.remove.apply(c.classList, variants);
      if (c.dataset.char) {
        c.textContent = c.dataset.char;
        delete c.dataset.char;
      }
    });
  }

  later(
    function () {
      el.classList.add('settled');
      if (!document.hidden) start();
    },
    DECODE_DURATION + text.length * DECODE_STEP + 150,
  );

  // Don't burn cycles animating a tab nobody is looking at.
  document.addEventListener('visibilitychange', function () {
    if (!el.classList.contains('settled')) return;
    if (document.hidden) stop();
    else start();
  });

  // Honour the setting if it's toggled while the page is open.
  var onPrefChange = function () {
    if (reduceMotion.matches) stop();
    else if (!document.hidden && el.classList.contains('settled')) start();
  };
  if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onPrefChange);
  else if (reduceMotion.addListener) reduceMotion.addListener(onPrefChange);
})();
