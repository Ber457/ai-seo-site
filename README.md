# AI SEO Site (Starter)

This starter includes:
- `scripts/generate-monthly-content.mjs` – generates a few Markdown articles using Claude (Anthropic API)
- `prompts/article-template.txt` – the base prompt template
- `scripts/deploy.mjs` – placeholder (we'll connect Netlify in a later phase)
- `.gitignore` – ignores `node_modules` and `.env`

## Quick start
1) Set your `CLAUDE_API_KEY` in Windows **User** environment variables.
2) Open a terminal in this folder and run:
   ```bash
   npm install
   npm run generate-monthly-content
   ```
3) Generated files will be in `content/YYYY-MM-DD/`.
4) Commit and push with Git/GitHub CLI.
