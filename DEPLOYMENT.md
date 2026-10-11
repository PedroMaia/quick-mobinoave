# MAVE Bus Tracking - Deployment Guide

🌐 **Live site**: https://pedromaia.github.io/quick-mobinoave/
📦 **Repository**: https://github.com/PedroMaia/quick-mobinoave

The app is a static site (HTML/CSS/JS, no build step) hosted on **GitHub Pages**.
Every push to `main` deploys automatically.

---

## Step 1 — Prerequisites

- `git` installed and configured (`git config user.name` / `user.email`)
- Push access to the GitHub repository
- Python 3 (only for the local test server)

## Step 2 — Run locally

```bash
cd quick-mobinoave
python3 -m http.server 8000
```

Open http://localhost:8000 in your browser. Stop the server with `Ctrl+C`.

## Step 3 — Test before deploying

Go through this checklist locally (use DevTools → responsive mode at ~375px for mobile):

- [ ] Stop list loads (~2500 stops)
- [ ] Search by stop name works
- [ ] Bus line dropdown lists the lines (e.g. `100 – CIRCULAR SANTO TIRSO`)
- [ ] Selecting a line shows only its stops, in route order, with a stop count
- [ ] Typing a bus number (e.g. `100`) in the search box selects that line
- [ ] `✕` clears the line filter
- [ ] Opening a stop and going back keeps the line filter
- [ ] ☆ on a stop adds it to **Favoritos**; ★ removes it
- [ ] Favorites survive a page reload
- [ ] Live countdowns appear (during service hours) and refresh every 20s
- [ ] Page load does not request Leaflet (DevTools → Network)
- [ ] **Perto de mim** asks for location, then shows the map, a 2 km circle and the nearby stops sorted by distance (fake a location in DevTools → Sensors, e.g. Guimarães `41.4425, -8.2918`)
- [ ] Moving the radius slider updates the label immediately and the list/map/count smoothly
- [ ] Opening a stop from the nearby list or a map popup, then **← Voltar**, returns to **Perto de mim**
- [ ] Denying location shows an error with **Tentar novamente**; the **Paragens** tab still works
- [ ] In a stop, **🔔 Avisar-me** opens the dialog; **Ativar alerta** asks for notification permission and shows the alert in **Alertas ativos**
- [ ] An alert with minutes ≥ the live countdown fires right away (notification + banner + beep), then disappears from the bar
- [ ] Tapping the notification opens that stop; ✕ in the bar cancels an alert
- [ ] **🗺️ Ver no mapa** (lines with live buses) shows the stop, the route line and the bus, and the bus moves on each 20s refresh
- [ ] DevTools → Application → Service workers shows `sw.js` activated; Manifest shows no errors
- [ ] No errors in the DevTools console

## Step 4 — Commit your changes

> **Changed a JS or CSS file?** Bump the `?v=` number on its `<script>`/`<link>` tag in `index.html` (e.g. `?v=2` → `?v=3`).
> GitHub Pages caches assets for ~10 minutes; without the bump, visitors can get the new `index.html` with an old `app.js`.

```bash
git status                     # review what changed
git add index.html js/ css/ icons/ sw.js manifest.webmanifest README.md DEPLOYMENT.md
git commit -m "Describe your change"
```

## Step 5 — Push to GitHub

```bash
git push origin main
```

## Step 6 — One-time GitHub Pages setup (only if not done yet)

1. Open the repository on GitHub → **Settings** → **Pages**
2. **Source**: *Deploy from a branch*
3. **Branch**: `main`, folder `/ (root)` → **Save**
4. Tick **Enforce HTTPS**. The **Perto de mim** tab needs HTTPS: browsers block location on `http://`

## Step 7 — Confirm the deploy

1. On GitHub, open the **Actions** tab → run **"pages build and deployment"**
2. Wait for the green check (usually 1–2 minutes)
3. Open https://pedromaia.github.io/quick-mobinoave/
4. Hard refresh to bypass the cache: **Cmd+Shift+R** (macOS) / **Ctrl+Shift+R** (Windows/Linux)
5. Quickly repeat the key checks from Step 3 on the live site (desktop and phone)
6. On a phone, open **Perto de mim**, allow location and confirm the map tiles, your blue dot and the nearby stops appear

## Arrival alerts — how they work on a phone

The site has no server, so alerts are checked **by the open app** every 30 seconds.

1. **Install the app**: Chrome menu ⋮ → **Add to Home screen** / **Install app**. An installed app is less likely to be paused by Android.
2. Open a stop → **🔔 Avisar-me** on your line → pick the minutes → **Ativar alerta** → allow notifications.
3. **Keep the app open.** You can lock the screen, but if the app stays in the background for a long time Android may pause it and the alert won't fire.
4. Optional: **Manter ecrã ligado** in the *Alertas ativos* bar keeps the screen on (and the app awake) while you wait.
5. Each alert warns **once** and then switches off. Forgotten alerts expire after 3 hours.

## Step 8 — Rollback (if something breaks)

```bash
git log --oneline              # find the bad commit
git revert <commit-sha>        # creates a commit that undoes it
git push origin main           # redeploys the previous behavior
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Site shows 404 | Check Step 6: Pages enabled, branch `main`, folder `/ (root)` |
| Old version still showing | Hard refresh, or wait a few minutes for the GitHub CDN cache |
| "Erro de conexão" / no stops | The MAVE API (`https://mave.elevensystems.pt/api`) may be down. Test it directly in the browser |
| Bus line dropdown missing | `/routes` request failed. The rest of the app still works, so reload later |
| Deploy failed in Actions | Open the failed run for details, fix, commit and push again |
| Location never asked / "Permissão negada" | iPhone: Settings → Privacy → Location Services → Safari Websites → *While Using*. Chrome: 🔒 icon in the address bar → Location → Allow. Then tap **Tentar novamente** |
| Android: "Não foi possível determinar a sua localização" | Turn on device location (swipe down → **Localização**), and in Settings → Location → Location services enable **Google Location Accuracy** so Wi-Fi/network location works indoors. Then tap **Tentar novamente** |
| Map is grey (no tiles) | OpenStreetMap tiles are blocked by an ad blocker, or you're offline. The stop list still works |
| Map doesn't appear at all | The jsdelivr CDN (Leaflet) is unreachable. The stop list still works without the map |
| Tabs don't work after a deploy | Stale cached JS: hard refresh, and check the `?v=` numbers were bumped in `index.html` |
| No alert notification | Chrome: 🔒 icon → Notifications → Allow. Android: Settings → Apps → Chrome → Notifications on. Keep the app open (see *Arrival alerts*) |
| Alert fired late or not at all with the phone locked | Android paused the page. Install the app, turn on **Manter ecrã ligado**, or exclude Chrome from battery optimization |
| "Install app" not offered | The manifest uses an SVG icon; some Android versions want PNG icons. Add `icons/icon-192.png` and `icon-512.png` and list them in `manifest.webmanifest` |

---

## Tech Stack
- HTML5, CSS3, JavaScript (ES6+)
- Bootstrap 5 (CDN)
- Leaflet 1.9.4 (jsdelivr CDN, lazy-loaded) + OpenStreetMap tiles
- Service worker (`sw.js`, notifications only) + web app manifest
- MAVE API: https://mave.elevensystems.pt/api
- Hosting: GitHub Pages
