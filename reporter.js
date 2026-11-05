import WDIOReporter from '@wdio/reporter';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const screenshots = new Map();

export default class VeracityReporter extends WDIOReporter {
    results = [];

    onRunnerStart(runner) {
        this.spec = relative(process.cwd(), fileURLToPath(runner.specs[0]));
    }

    onTestEnd(test) {
        if (test.state === 'passed' && !screenshots.has(test.fullTitle)) throw new Error(`Missing screenshot for ${test.fullTitle}`);
        this.results.push({
            code: `${this.spec} › ${test.fullTitle}`,
            status: { passed: 'succeeded', failed: 'failed', skipped: 'skipped' }[test.state],
            note: test.state === 'failed' ? test.errors.map(error => error.message).join('\n') : (test.pendingReason || ''),
            attachments: screenshots.has(test.fullTitle) ? screenshots.get(test.fullTitle) : [],
        });
    }

    onHookEnd(hook) {
        if (hook.error) {
            this.results.push({ code: `${this.spec} › ${hook.title}`, status: 'failed', note: hook.error.message, attachments: [] });
        }
    }

    onRunnerEnd(runner) {
        mkdirSync(this.options.outputDir, { recursive: true });
        writeFileSync(join(this.options.outputDir, `${runner.cid}.json`), JSON.stringify(this.results));
    }
}
