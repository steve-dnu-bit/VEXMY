# Deploy workflow (branch + manual preview)

Use this workflow to **save Netlify build minutes**: work on a Git branch, build locally, and deploy a preview only when you choose. Production (`velbok.com`) stays on `main` until you deploy it manually.

## One-time Netlify setup

1. **Install & link CLI** (once per machine):

   ```powershell
   cd inkaholics-29cc97fa-main
   npx netlify-cli login
   npx netlify-cli link
   ```

   Pick the **velbok.com** site when prompted.

2. **Turn off automatic builds** (saves credits):

   Netlify dashboard → **Site configuration** → **Build & deploy** → **Continuous deployment**:

   - Set **Build settings** → leave build command as `npm run build` (used if you ever deploy with `--build`).
   - Under **Deploy contexts**, set **Branch deploys** to **None** (or only branches you explicitly want).
   - Optional: **Stop builds** on the site if you will *only* use CLI deploys.

   Pushes to GitHub will no longer trigger Netlify builds unless you re-enable this.

3. **Environment variables** stay in Netlify for production. For local builds, use `.env` (same `VITE_*` vars). Preview deploys bake in whatever is in your local `.env` at build time.

---

## Day-to-day workflow

### 1. Create a branch and push

```powershell
git checkout main
git pull origin main
git checkout -b feature/my-change
# ... edit files ...
git add .
git commit -m "Describe your change"
git push -u origin feature/my-change
```

GitHub holds the branch; Netlify does **not** build (if auto-builds are off).

### 2. Build locally

```powershell
npm run build
```

Fix any errors before deploying.

### 3. Deploy a preview (draft URL)

```powershell
npm run deploy:preview
```

Or:

```powershell
.\scripts\deploy-preview.ps1
```

Netlify prints a **Draft URL** (e.g. `https://abc123--Velbok.netlify.app`). Share that link to review changes. This uploads your local `dist/` folder — **no remote build**, minimal credit use.

### 4. Promote to production when ready

After merging to `main` locally (or on GitHub):

```powershell
git checkout main
git pull origin main
npm run deploy:prod
```

Or:

```powershell
.\scripts\deploy-production.ps1
```

Confirms before updating **velbok.com**.

---

## npm scripts

| Script | What it does |
|--------|----------------|
| `npm run deploy:preview` | `npm run build` → `netlify deploy --dir=dist` (draft URL) |
| `npm run deploy:prod` | `npm run build` → `netlify deploy --prod --dir=dist` (velbok.com) |
| `npm run deploy:preview:only` | Upload existing `dist/` without rebuilding |

---

## Tips

- **Skip rebuild** if you already built: `.\scripts\deploy-preview.ps1 -SkipBuild`
- **Local preview without Netlify**: `npm run build` then `npm run preview` (localhost only).
- **Forms**: Contact form uses Netlify Forms; test on a preview deploy URL after first deploy of that build.
- **Supabase**: Preview uses the same Supabase project as your local `.env` unless you use a separate env file.

---

## Re-enable CI deploys later

Netlify dashboard → turn **Continuous deployment** back on and set production branch to `main` if you want pushes to `main` to auto-deploy again.
