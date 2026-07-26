'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'sport/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'sport/assets/sport.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'sport/assets/sport.js'), 'utf8');

function count(pattern, text) { return [...text.matchAll(pattern)].length; }

test('Sportseite ist eigenständig, semantisch und strikt abgesichert', () => {
  assert.equal(count(/<h1\b/gi, html), 1);
  assert.match(html, /<html lang="de">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/domse\.dev\/sport\/">/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'self';/);
  assert.doesNotMatch(html, /\s(?:style|onclick|onchange|onload)="/i);
  assert.doesNotMatch(html, /<script(?![^>]+src=)/i);
});

test('zehn Übungen bleiben als verständlicher Inhalt ohne Technikbilder erhalten', () => {
  assert.equal(count(/<article class="exercise-card"/g, html), 10);
  assert.equal(count(/data-done="/g, html), 10);
  for (const title of ['Goblet Squat', 'Romanian Deadlift', 'One-Arm Row', 'Floor Press', 'Reverse Lunge', 'Shoulder Press', 'Lateral Raise', 'Biceps Curl', 'Overhead Triceps Extension', 'Reverse Fly']) {
    assert.match(html, new RegExp(title));
  }
  assert.doesNotMatch(html, /assets\/exercises|Übungsbild|Anleitungsbild/i);
  assert.doesNotMatch(html + css + js, /\breveal\b|IntersectionObserver|conic-gradient|fractalNoise/i);
});

test('Fotografie ist lokal, sichtbar attribuiert und vollständig dokumentiert', () => {
  const manifestPath = path.join(root, 'sport/assets/media/media-manifest.json');
  assert.ok(fs.existsSync(manifestPath));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.ok(Array.isArray(manifest.media) && manifest.media.length >= 1 && manifest.media.length <= 2);
  for (const item of manifest.media) {
    assert.equal(item.ai_provenance, false);
    assert.match(item.source_page, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    assert.match(item.license.url, /^https:\/\/creativecommons\.org\/licenses\//);
    assert.ok(item.title && item.creator && item.width >= 1000 && item.height >= 600);
    const asset = path.join(root, 'sport/assets/media', item.file);
    assert.ok(fs.existsSync(asset), item.file);
    const hash = crypto.createHash('sha256').update(fs.readFileSync(asset)).digest('hex');
    assert.equal(hash, item.sha256);
    assert.match(html, new RegExp(item.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, new RegExp(item.creator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Sessionzustand ist datumsbezogen, legacy-kompatibel und storage-resilient', () => {
  assert.match(js, /domse-sport-done-v1/);
  assert.match(js, /domse-sport-session-v2:/);
  assert.match(js, /try\s*\{[\s\S]*localStorage\.getItem/);
  assert.match(js, /try\s*\{[\s\S]*localStorage\.setItem/);
  assert.doesNotMatch(js, /removeItem\(['"]domse-sport-done-v1/);
  assert.match(js, /runningSince/);
  assert.match(js, /Date\.now\(\)\s*-\s*state\.timer\.runningSince/);
  assert.doesNotMatch(js, /timer\+\+/);
});

test('Bedienung und Layout berücksichtigen Tastatur, Touch und reduzierte Bewegung', () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /overflow-wrap:/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<progress[^>]+max="10"/);
  assert.match(js, /window\.confirm/);
});
