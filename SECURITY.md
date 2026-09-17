# Security notes

## API key
Never commit an OpenAI API key to this repository.

The workflow expects a GitHub Actions repository secret named `OPENAI_API_KEY`.
The secret is exposed only to the `Fetch, cluster and summarize news` step as an environment variable.
It is not embedded in HTML, JavaScript, JSON, CSS, or Git history.

## Never upload real secrets in files
Do not upload `.env`, `.env.*`, `*.key`, `*.pem`, or files beginning with `secret` / `secrets`.
These patterns are ignored by Git, but do not rely on `.gitignore` as your only protection.

## If a key is ever committed
Treat it as compromised immediately: revoke/rotate it at the provider, remove it from the repository and Git history, then create a new GitHub Actions secret.

## Repository access
Anyone with write access can modify Actions workflows and potentially use repository secrets. Keep write access limited to people you trust.
