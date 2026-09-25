# MAVE Bus Tracking - Deployment Info

## Live Site
🌐 **URL**: https://pedromaia.github.io/quick-mobinoave/

## Repository
📦 **GitHub**: https://github.com/PedroMaia/quick-mobinoave

## Local Development
```bash
# Serve locally
python3 -m http.server 8000

# Open in browser
open http://localhost:8000
```

## Deployment
```bash
# Make changes and commit
git add .
git commit -m "Your message"

# Push to GitHub (auto-deploys)
git push origin main
```

## Verification Checklist
- [ ] Stop list loads (~2500 stops)
- [ ] Search filter works
- [ ] Recent stops save in cookies
- [ ] Click stop shows routes
- [ ] Live countdowns appear (during service hours)
- [ ] Auto-refresh every 20s
- [ ] Mobile responsive
- [ ] No console errors

## Tech Stack
- HTML5, CSS3, JavaScript (ES6+)
- Bootstrap 5 (CDN)
- MAVE API: https://mave.elevensystems.pt/api
- Hosted: GitHub Pages

## Features
✓ Real-time bus arrival countdowns
✓ 2500+ bus stops searchable
✓ Cookie-based history (last 8 stops)
✓ Auto-refresh every 20 seconds
✓ Mobile-friendly responsive design
✓ Portuguese interface
✓ Offline detection
✓ No backend required

Deployed: $(date)
