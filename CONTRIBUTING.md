# Contributing to Anamnesies

Thanks for your interest in improving Anamnesies! Bug reports, ideas, translations, documentation and code are all welcome.

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go through the private process in [SECURITY.md](SECURITY.md), never into public issues.

## Ways to contribute

- **Report a bug** – open an issue with the bug template. Steps to reproduce help most.
- **Suggest a feature** – open an issue with the feature template and describe the problem it solves.
- **Translate** – the UI texts live in `apps/web/lib/i18n.ts`, `apps/web/lib/i18n-extra.ts` (German and English) and `apps/web/lib/locales/` (Spanish, Portuguese, Chinese, Japanese).
- **Write code** – for anything larger than a small fix, please open an issue first so we can agree on the approach.

## Development setup

You need **Node.js 20+** and **Python 3.11+**. The [README](README.md#local-development) has the details; the short version:

```bash
# web app
npm ci
npm --prefix apps/web run dev            # http://localhost:3000

# API (in a second terminal)
cd apps/api
python -m venv .venv
source .venv/bin/activate                # Windows: .venv\Scripts\activate
pip install -e .
DATABASE_URL=sqlite:///./plm.sqlite3 uvicorn app.main:app --reload --port 8000
```

`python -m scripts.seed_demo` (in `apps/api`) fills the database with realistic demo data.

## Before you open a pull request

Run the same checks as the CI:

```bash
npx tsc --noEmit -p apps/web             # type check the web app
npm --prefix apps/web run build          # production build
cd apps/api && pytest -q                 # API tests
```

- Add or update tests in `apps/api/tests` when you change API behaviour.
- Add new UI texts in **all** languages (German and English at least; the other locales must contain the same keys, the type check enforces it).
- Never commit `.env` files, databases (`*.sqlite3`), uploads or tokens. The secret scan in the CI blocks them.

## Pull requests

- Branch off `main` and keep one topic per pull request.
- Write commit messages in English, in the imperative ("Add …", "Fix …"), with a short body that explains *why*.
- Fill in the pull request template; link the issue it closes (`Closes #123`).
- The CI must be green: type check, build, tests, CodeQL and the secret scan.
- UI changes: add a screenshot or a short clip, in light and dark mode if relevant.

## Code style

- **TypeScript / React:** function components, the existing design system components in `apps/web/components/ui`, Tailwind classes, no new UI libraries without discussion. Respect `prefers-reduced-motion` for animations.
- **Python:** type hints, FastAPI routers in `app/api/v1/endpoints`, business logic in `app/services`.
- Comments explain *why*, not *what*.
- The [`.editorconfig`](.editorconfig) sets indentation and line endings.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
