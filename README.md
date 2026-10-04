# Veracity

Run UAT cases against your website from GitHub Actions. The action installs all required tools.

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
      - uses: mamuqsit/veracity@main
        with:
          url: ${{ vars.UAT_URL }}
          model: openai:gpt-6.1-sol # Default: openai:gpt-5.6-luna
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_BASE_URL: ${{ vars.OPENAI_BASE_URL || 'https://api.openai.com/v1' }} # Default: OpenAI
```

Set the repository variable `UAT_URL` and secret `OPENAI_API_KEY` under **Settings → Secrets and variables → Actions**. Commit the workflow and `uat.json`, then select **Actions → UAT → Run workflow**.

The website must be reachable from the Ubuntu runner. Download `uat-output.html`, `uat-output.json`, and screenshots from the run's `veracity-uat` artifact. Open the HTML report in a browser. It includes all recorded results and embedded screenshots in one file. The action generates the report even if tests fail. Failed or skipped tests fail the job.

Optional inputs are `plan` (default `uat.json`), `model` (default `openai:gpt-5.6-luna`), `workers` (default `4`), `instruction`, and `secrets`. For login credentials, pass environment variable names, one per line:

```yaml
      - uses: mamuqsit/veracity@main
        with:
          url: ${{ vars.UAT_URL }}
          model: openai:gpt-6.1-sol # Default: openai:gpt-5.6-luna
          secrets: |
            UAT_USERNAME
            UAT_PASSWORD
          instruction: Log in with UAT_USERNAME and UAT_PASSWORD.
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_BASE_URL: ${{ vars.OPENAI_BASE_URL || 'https://api.openai.com/v1' }} # Default: OpenAI
          UAT_USERNAME: ${{ secrets.UAT_USERNAME }}
          UAT_PASSWORD: ${{ secrets.UAT_PASSWORD }}
```

For an OpenAI-compatible endpoint, also set `OPENAI_BASE_URL` in `env`.

## Local CLI

For local use, install Python 3.12, uv, and Git. Clone this repository, then run `uv sync` and `uv run browser-use install`. Set `OPENAI_API_KEY` before you generate or run tests.

### Generate

```sh
uv run veracity.py --model openai:gpt-5.6-luna audit \
  https://github.com/A4i-tech/Shiksha-Copilot uat.json json \
  --branch a4i/staging \
  --instruction "Audit functionality in shiksha-frontend for 3 roles - teacher, power teacher, and admin. FYI: shiksha-backend is run with devtools enabled, and during execution stage you will be given credentials to a superuser account. Skip presentation generation."
```

### Run

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

### HTML report

```sh
uv run veracity.py html uat-output.json uat-output.html

uv run veracity.py html uat-output.json passed.html \
  --status succeeded \
  --status skipped
```

`--status` is repeatable and accepts `succeeded`, `skipped`, or `failed`.
Screenshots are read from the `screenshots/` directory beside the source JSON and embedded in the report.
