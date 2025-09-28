# Hallway Tenant Manager (starter from ChatGPT canvas)

This is a ready-to-run Vite + React + TypeScript project containing the layout you built in ChatGPT.

## Run locally
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Push to GitHub
1) Create a new empty repository on GitHub (no README).
2) In this folder:
```bash
git init
git add .
git commit -m "init: hallway tenant manager starter"
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main
```

## Notes
- Minimal UI components are included in `src/components/ui/` so the code compiles without external UI kit.
- `fetch('/api/hallways/:id')` will 404 in dev; the code already falls back to demo data.
