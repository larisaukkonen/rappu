
# Rappu – Hallinta & TV-esikatselu (Vercel + Vite)

Minimal project that matches your current canvas code and deploys to Vercel.

## Local dev
```bash
npm i
npm run dev
```

Open http://localhost:5173

## Deploy to Vercel
1. `npm i -g vercel` (if needed)
2. `vercel` (link project and deploy)
3. In Vercel dashboard, create/attach a **Blob Store** and link it to this project.
4. Redeploy. The API routes under `/api/ruutu` will save HTML into Blob.
5. The admin loads screens from `/ruutu/<SERIAL>.html` thanks to `vercel.json` rewrite to `api/serve-ruutu`.

## Deploy to VPS (Node + Vercel Blob or local storage)
1. Install deps and build:
   ```bash
   npm i
   npm run build
   ```
2. Choose storage:
   - **Vercel Blob** (default): set `BLOB_READ_WRITE_TOKEN`.
   - **Local disk**: set `STORAGE_DRIVER=local` and (optional) `DATA_DIR=/path/to/data`.
3. Run the server:
   ```bash
   npm run start
   ```

### VPS env vars
- `BLOB_READ_WRITE_TOKEN` (required for Vercel Blob)
- `STORAGE_DRIVER=local` (optional, for local files)
- `DATA_DIR=/path/to/data` (optional, default `./data`)
- `PUBLIC_BASE_URL=https://your-host` (optional, used for local file URLs)
- `FRAME_ANCESTORS=*` (optional CSP frame-ancestors)

## API quick test
- `GET /api/hello` → `{ ok: true }`
- After saving from the app with serial `TEST123`, the TV file will be at `/ruutu/TEST123.html` (served via Blob).

## Notes
- UI components are minimal, Tailwind-based versions of the shadcn-style API.
- If you later add the real shadcn/ui, you can swap imports without changing the App.
