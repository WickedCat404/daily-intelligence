# Daily Intelligence — Secure GitHub Pages Setup

## 1. Create the repository
Create a new PUBLIC GitHub repository, e.g. `daily-intelligence`.
Do not initialize it with extra files if you plan to upload this bundle directly.

## 2. Upload the project files
Upload the CONTENTS of this folder to the repository root. The root should contain:

- `.github/workflows/update-news.yml`
- `docs/index.html`
- `docs/app.js`
- `docs/styles.css`
- `docs/data/latest.json`
- `docs/data/archives.json`
- `docs/data/archive/2026-09-17.json`
- `scripts/update_news.py`
- `.gitignore`
- `requirements.txt`
- `README.md`
- `SECURITY.md`
- `SETUP_GITHUB.md`
- `UPLOAD_CHECKLIST.txt`

Do NOT upload any `.env` file or any file containing an API key.

## 3. Add the OpenAI key as a GitHub Actions secret
In GitHub open:

Repository → Settings → Secrets and variables → Actions → Secrets → New repository secret

Name:
`OPENAI_API_KEY`

Value:
Paste the real API key.

Click **Add secret**.

The value will not be displayed again. Do not paste the key into repository code, commit messages, issues, screenshots, or README files.

## 4. Enable GitHub Pages
Repository → Settings → Pages → Build and deployment → Source → **GitHub Actions**.

## 5. Allow the workflow to write generated data
Repository → Settings → Actions → General → Workflow permissions.
Choose **Read and write permissions** if your repository/account settings require it, then save.

The checked-in workflow also declares only the permissions it needs: repository contents write, Pages write, and OIDC token write.

## 6. Run the first update
Repository → Actions → **Update Daily Intelligence** → Run workflow → Run workflow.

Watch the run. It should:
1. Check out the repository.
2. Install Python packages.
3. Fetch and cluster news.
4. Read `OPENAI_API_KEY` only inside the summarization step.
5. Save public summaries to `docs/data`.
6. Deploy only the `docs` folder to GitHub Pages.

## 7. Open the site
After the first successful workflow, go to Settings → Pages. GitHub will show the site URL, normally:
`https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`

## 8. Verify the key is not public
On GitHub, use repository search for:
- `sk-`
- your exact key prefix (first 6–8 characters only; never search the full secret on a shared screen)
- `OPENAI_API_KEY`

You should see only variable references such as `${{ secrets.OPENAI_API_KEY }}` and `os.getenv('OPENAI_API_KEY')`. You should never see the actual value.

Also open the live site's browser source/network panel. The API key should not appear anywhere because Pages publishes only `docs/`.

## 9. Custom domain (optional)
Settings → Pages → Custom domain. For a subdomain such as `brief.example.com`, create the CNAME record GitHub instructs you to create, wait for DNS verification, then enable **Enforce HTTPS**.

## Important security rules
- Keep repository write access restricted to trusted people. A collaborator with write access can edit a workflow that has access to repository secrets.
- Never echo or print the API key in Actions steps.
- If the key is ever committed, consider it compromised: revoke it immediately and create a new key/secret.
- The site output (`docs/data/*.json`) is public. Never put private information in prompts or generated data.
