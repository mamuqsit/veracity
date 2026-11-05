# Veracity

Run WebdriverIO UAT specs with AI actions. Veracity saves action recordings for later runs and produces screenshots, status, failure reasons, and JSON/HTML reports.

## GitHub Actions

Commit your specs in `tests/uat/` and add this workflow:

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
          tests: tests/uat
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          UAT_EMAIL: ${{ vars.UAT_EMAIL }}
          UAT_PASSWORD: ${{ secrets.UAT_PASSWORD }}
```

The website must be reachable from the runner. The action installs Node.js 22 and Veracity. WDIO installs Chrome and its driver when required. Set the `base-url` input to use a custom model API endpoint.

Use `.e2e.js`, `.e2e.mjs`, or `.e2e.ts` spec filenames. Specs use WDIO globals (`browser`, `$`, `expect`, `describe`, and `it`). Keep related tests in one spec to share a browser session. Specs run in separate sessions. Use relative imports for local helpers. If specs import other packages, install those packages in your workflow before you run Veracity.

```js
describe('Login', () => {
    it('opens the account page', async () => {
        await browser.url('/login');
        await browser.act('Log in with email {{email}} and password {{password}}', {
            id: 'login',
            values: { email: process.env.UAT_EMAIL, password: process.env.UAT_PASSWORD },
        });
        await expect(browser).toHaveUrl(expect.stringContaining('/account'));
    });
});
```

`act()` performs actions. Use assertions to check the outcome. Use placeholder values for credentials so the model does not receive them in the instruction. Tests can read environment variables and upload files with standard WDIO commands.

Use stable spec paths, test titles, and action IDs. WDIO records each `act()` call. Later runs replay its commands. Changed instructions record new commands. The action restores recordings before each run and saves updates even when tests fail. GitHub cache scope, retention, and eviction rules apply. Download the recordings from the artifact to keep a permanent copy. You can also commit them in `.veracity/act/` after you remove that path from `.gitignore`.

Optional inputs:

| Input | Default | Purpose |
| --- | --- | --- |
| `provider` | `openai` | Model provider. The OpenAI provider is installed. |
| `model` | `gpt-5.6-luna` | Model name. |
| `base-url` | Provider default | Custom model API endpoint. |
| `workers` | `1` | Concurrent spec workers. |
| `cache-dir` | `.veracity/act` | Recording directory in the checked-out repository. |
| `cache` | `write` | `write` replays, records, and repairs; `locked` replays without model calls; `heal` writes repairs to the output directory; `off` disables recordings. |

`browser.extract()` reads live data and calls the model on each run. Use standard assertions when you need runs without model calls. Other model providers require their LangChain package.

Download the `veracity-uat` artifact for `veracity-output/uat-output.json`, `uat-output.html`, screenshots, WDIO logs, AI evidence, and recordings. The HTML report embeds screenshots. Each result has `code`, `status` (`succeeded`, `failed`, or `skipped`), `note`, and `attachments`. Passed tests have an empty note. Assertion and action errors supply failure reasons. Skipped tests have no screenshot. Failed setup hooks appear as failed results. Failed or skipped tests, zero results, and runner errors fail the job.

## Local use

Install Node.js 22.19 or later, then run:

```sh
npm ci
export OPENAI_API_KEY=...
node veracity.js --url http://localhost:3000 --tests tests/uat
```

Use `--provider`, `--model`, `--base-url`, `--workers`, `--cache-dir`, and `--cache` to set the same options as the action. Use `--output path/to/run` to change the report directory. The output directory must be empty for each run. Keep the cache directory between runs.

Specs define the tests; recordings define the commands used by AI actions. See the [WDIO AI Service documentation](https://webdriver.io/docs/ai-service) for action, extraction, and cache options.

## Tests

`npm test` checks login, action recording, structured extraction, cached replay, and report output in Chrome against a local HTTP server. The first run records the login action. The second run uses locked mode, which requires the recorded action. Both runs use the model for extraction.

CI runs this test on pushes, pull requests, and manual runs. Set the repository secret `OPENAI_API_KEY`. Optional repository variables `VERACITY_PROVIDER`, `VERACITY_MODEL`, and `VERACITY_BASE_URL` select the provider, model, and endpoint.

CI uploads reports, screenshots, and runner logs in the `e2e-results` artifact, including failed runs. To run locally, set the same environment variables and run `npm test`.
