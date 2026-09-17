# Daily Intelligence — GitHub Pages Secure Edition

Free hosting via GitHub Pages + scheduled news generation via GitHub Actions.

## Architecture
Public RSS sources → GitHub Action → clustering + optional OpenAI summaries → `docs/data/latest.json` → GitHub Pages.

The OpenAI API key is **not stored in the repository**. Add it as the repository Actions secret `OPENAI_API_KEY`. The workflow passes it only to the news-generation step. Only the `docs/` folder is deployed to GitHub Pages.

See **SETUP_GITHUB.md** for the exact step-by-step setup and **SECURITY.md** for security notes.

## AI summaries
The updater uses `gpt-5.6-luna` by default and reuses existing AI summaries for unchanged story clusters. It limits new AI summaries per refresh to control API usage. If the secret is absent, the dashboard still works with deterministic fallback briefs.

## Automatic refresh
The workflow is scheduled at minute 17 and 47 each hour using `Asia/Kolkata`.

## Public data
Everything under `docs/` is public by design. Do not put secrets or private data there.
