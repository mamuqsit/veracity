# Veracity

Generate UAT cases from source code and run them with OpenAI Agents and Playwright.

Requires Python 3.12, uv, and Git. Install dependencies with `uv sync` and Chromium with `uv run browser-use install`.

## GitHub Actions

Add `.github/workflows/uat.yml` to the repository that contains `uat.json`:

```yaml
name: UAT
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  uat:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: YOUR_ORG/veracity@YOUR_COMMIT
        with:
          url: ${{ vars.UAT_URL }}
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

Replace `YOUR_ORG/veracity@YOUR_COMMIT` with this repository and a published commit or tag. Set the repository variable `UAT_URL` and secret `OPENAI_API_KEY`. The website must be reachable from the runner. Use an Ubuntu runner. The action installs the tools, runs the plan, and uploads `uat-output.json` and screenshots as the `veracity-uat` artifact. Failed or skipped tests fail the job.

Optional inputs are `plan` (default `uat.json`), `model` (default `openai:gpt-5.6-luna`), `workers` (default `4`), `instruction`, and `secrets`. For login credentials, pass environment variable names, one per line:

```yaml
      - uses: YOUR_ORG/veracity@YOUR_COMMIT
        with:
          url: ${{ vars.UAT_URL }}
          secrets: |
            UAT_USERNAME
            UAT_PASSWORD
          instruction: Log in with UAT_USERNAME and UAT_PASSWORD.
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          UAT_USERNAME: ${{ secrets.UAT_USERNAME }}
          UAT_PASSWORD: ${{ secrets.UAT_PASSWORD }}
```

For an OpenAI-compatible endpoint, also set `OPENAI_BASE_URL` in `env`.

## Generate

```sh
uv run veracity.py --model openai:gpt-5.6-luna audit \
  https://github.com/A4i-tech/Shiksha-Copilot uat.json json \
  --branch a4i/staging \
  --instruction "Audit functionality in shiksha-frontend for 3 roles - teacher, power teacher, and admin. FYI: shiksha-backend is run with devtools enabled, and during execution stage you will be given credentials to a superuser account. Skip presentation generation."
```

## Run

```sh
export SU_PHONE=6000000000 SU_PIN=1234

uv run veracity.py --model openai:gpt-5.6-luna run \
  http://localhost:4200 uat.json \
  --output uat-output.json \
  --repository https://github.com/A4i-tech/Shiksha-Copilot \
  --branch a4i/staging \
  --workers 4 \
  --secret SU_PHONE \
  --secret SU_PIN \
  --instruction "Superuser account credential: SU_PHONE (PIN: SU_PIN). Create disposable teacher, power teacher, and admin user accounts and test flows. shiksha-backend is hosted on https://localhost:8080/api."
```

Tests in one group run in order with one browser profile. Groups run concurrently. Each result and its screenshots are written immediately after the test.
Use `--resume` to run only tests missing from an existing output file.

## Markdown

```sh
uv run veracity.py markdown uat-output.json uat-output.md

uv run veracity.py markdown uat-output.json passed.md \
  --status succeeded \
  --status skipped \
  --embed-images
```

`--status` is repeatable and accepts `succeeded`, `skipped`, or `failed`.
