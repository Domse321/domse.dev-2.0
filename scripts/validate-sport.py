#!/usr/bin/env python3
"""Statische Release-Prüfung für die eigenständige Sportseite."""

from __future__ import annotations

import hashlib
import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPORT = ROOT / "sport"
errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def jpeg_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        require(handle.read(2) == b"\xff\xd8", f"{path.name}: kein JPEG")
        while True:
            marker_start = handle.read(1)
            if not marker_start:
                raise ValueError("JPEG-Dimensionen fehlen")
            if marker_start != b"\xff":
                continue
            marker = handle.read(1)
            while marker == b"\xff":
                marker = handle.read(1)
            if marker in {bytes([value]) for value in range(0xC0, 0xC4)} | {b"\xc5", b"\xc6", b"\xc7", b"\xc9", b"\xca", b"\xcb", b"\xcd", b"\xce", b"\xcf"}:
                _length, _precision, height, width = struct.unpack(">HBHH", handle.read(7))
                return width, height
            if marker in (b"\xd8", b"\xd9"):
                continue
            length_raw = handle.read(2)
            if len(length_raw) != 2:
                raise ValueError("Ungültiges JPEG")
            length = struct.unpack(">H", length_raw)[0]
            handle.seek(length - 2, 1)


html = (SPORT / "index.html").read_text(encoding="utf-8")
css = (SPORT / "assets/sport.css").read_text(encoding="utf-8")
js = (SPORT / "assets/sport.js").read_text(encoding="utf-8")
manifest_path = SPORT / "assets/media/media-manifest.json"

require(html.lower().count("<h1") == 1, "genau eine H1 erforderlich")
require('rel="canonical" href="https://domse.dev/sport/"' in html, "Canonical fehlt")
require('name="referrer" content="no-referrer"' in html, "strikte Referrer-Policy fehlt")
require("default-src 'self';" in html and "connect-src 'none';" in html, "CSP ist nicht strikt")
require('class="skip-link" href="#inhalt"' in html, "Skip-Link fehlt")
require(not re.search(r"<script[^>]+src=[\"'](?:https?:)?//|<img[^>]+src=[\"'](?:https?:)?//|<link[^>]+rel=[\"']stylesheet[\"'][^>]+href=[\"'](?:https?:)?//", html, re.I), "externe Runtime-Ressource gefunden")
require(not re.search(r"\s(?:style|on\w+)=", html, re.I), "Inline-Style oder Inline-Handler gefunden")
require(len(re.findall(r'<article class="exercise-card"', html)) == 10, "nicht genau zehn Übungskarten")
require(len(re.findall(r'data-done="[^"]+"', html)) == 10, "nicht genau zehn Übungs-Checkboxen")
require(len(re.findall(r'class="block-divider"', html)) == 2, "Block A/B fehlt")
require('aria-labelledby="progressLabel"' in html, "Fortschritt hat keinen zugänglichen Namen")
require("domse-sport-done-v1" in js, "Legacy-Schlüssel fehlt")
require("domse-sport-session-v2:" in js, "datumsbezogener Session-Schlüssel fehlt")
require("Date.now() - state.timer.runningSince" in js, "Timer ist nicht timestamp-basiert")
require("localStorage.removeItem" not in js, "Daten werden unerwartet gelöscht")
require("window.confirm" in js, "Bestätigung vor Session-Reset fehlt")
require(":focus-visible" in css, "sichtbarer Tastaturfokus fehlt")
require("min-height: 44px" in css, "44-Pixel-Ziel fehlt")
require("prefers-reduced-motion: reduce" in css, "Reduced-Motion-Regel fehlt")
require("forced-colors: active" in css, "Forced-Colors-Regel fehlt")
exercise_images = sorted((SPORT / "assets/exercises").glob("*.webp")) if (SPORT / "assets/exercises").is_dir() else []
require(len(exercise_images) == 10, "genau zehn lokale Übungsbilder erforderlich")
require(len(re.findall(r'<figure class="exercise-visual">', html)) == 10, "jede Übung benötigt ein Bild")
for image in exercise_images:
    require(f'assets/exercises/{image.name}' in html, f"Übungsbild nicht eingebunden: {image.name}")
require(manifest_path.exists(), "Medienmanifest fehlt")

if manifest_path.exists():
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    media = manifest.get("media", [])
    require(1 <= len(media) <= 2, "genau ein bis zwei Medien erforderlich")
    for item in media:
        required = {"file", "title", "creator", "source_page", "license", "url", "width", "height", "sha256", "ai_provenance"}
        require(required.issubset(item), f"Manifestfelder fehlen bei {item.get('file', '?')}")
        path = SPORT / "assets/media" / item.get("file", "")
        require(path.is_file(), f"Mediendatei fehlt: {path.name}")
        require(item.get("ai_provenance") is False, f"AI-Provenienz nicht false: {path.name}")
        require(str(item.get("source_page", "")).startswith("https://commons.wikimedia.org/wiki/File:"), f"Commons-Quellseite ungültig: {path.name}")
        require(str(item.get("license", {}).get("url", "")).startswith("https://creativecommons.org/licenses/"), f"Lizenz-URL ungültig: {path.name}")
        require(item.get("license", {}).get("url", "") in html, f"direkter Lizenzlink fehlt: {path.name}")
        if path.is_file():
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            require(digest == item.get("sha256"), f"SHA-256 stimmt nicht: {path.name}")
            try:
                width, height = jpeg_size(path)
                require((width, height) == (item.get("width"), item.get("height")), f"Dimensionen stimmen nicht: {path.name}")
            except (OSError, ValueError, struct.error) as exc:
                errors.append(f"Bildprüfung fehlgeschlagen ({path.name}): {exc}")
        require(item.get("file", "") in html and item.get("creator", "") in html, f"sichtbare Attribution fehlt: {path.name}")

if errors:
    print("SPORT_VALIDATION_FAIL")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("SPORT_VALIDATION_PASS: CSP, 10 Übungen, Session-State, Barrierefreiheit und 1 Lizenzmedium geprüft.")
