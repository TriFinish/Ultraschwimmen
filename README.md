# Ultraschwimmen

Statische Landingpage („Link-in-Bio"-Seite) rund um Ultraschwimmen. Reines
HTML/CSS/JS, kein Build-Schritt. Inhalte werden aus einer YAML-Datei geladen
und clientseitig gerendert. Erreichbar unter `links.ultraschwimmen.de`.

## Architektur

Website und Analytics sind getrennte Systeme auf verschiedenen Hosts. Die
Website (GitHub Pages) bindet die self-hosted Umami-Instanz (Vercel + Neon)
nur über ein `<script>`-Tag ein.

```
Website (dieses Repo)              Umami Analytics (self-hosted)
GitHub Pages                       Vercel (Next.js) → Neon (PostgreSQL)
  site/index.html + <script> ──── Tracking-Events ────▶
```

### Wo liegt was?

| Bereich | Ort | Datei / Ressource |
|---|---|---|
| Seiten-Markup | Repo | [`site/index.html`](site/index.html) |
| Styles | Repo | [`site/assets/style.css`](site/assets/style.css) |
| Logik (rendert Links aus YAML) | Repo | [`site/assets/app.js`](site/assets/app.js) |
| Inhalte (Links, Texte) | Repo | [`site/data/info.yaml`](site/data/info.yaml) |
| Logo / Favicon | Repo | [`site/assets/logo.svg`](site/assets/logo.svg) |
| Website-Deployment | GitHub | [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) → GitHub Pages |
| Analytics-Instanz | Vercel | Umami (`umami-six-cyan.vercel.app`) |
| Analytics-Datenbank | Neon | PostgreSQL |
| Tracking-Einbindung | Repo | `<script>`-Tag im `<head>` von [`site/index.html`](site/index.html) |

## Lokale Entwicklung

Kein Build nötig — statischer Server, der `site/` ausliefert:

```bash
python3 -m http.server --directory site 8000
```

Dann <http://localhost:8000> öffnen.

## Deployment

Push auf `main` löst [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
aus und veröffentlicht `site/` auf GitHub Pages (Custom Domain
`links.ultraschwimmen.de`).
