import { initChatModel } from 'langchain';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import VeracityReporter, { screenshots } from './reporter.js';
import { report } from './report.js';

const output = resolve(process.env.VERACITY_OUTPUT);

export const config = {
    runner: 'local',
    specs: [join(resolve(process.env.VERACITY_TESTS), '**/*.e2e.{js,mjs,ts}')],
    baseUrl: process.env.VERACITY_URL,
    maxInstances: Number(process.env.VERACITY_WORKERS),
    capabilities: [{ browserName: 'chrome', 'goog:chromeOptions': { args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage'] } }],
    framework: 'mocha',
    mochaOpts: { timeout: 180000 },
    outputDir: output,
    services: [['ai', {
        model: await initChatModel(process.env.VERACITY_MODEL, {
            modelProvider: process.env.VERACITY_PROVIDER, configuration: { baseURL: process.env.VERACITY_BASE_URL },
            modelKwargs: { tool_choice: 'required' },
        }),
        cache: process.env.VERACITY_CACHE,
        cacheDir: spec => join(resolve(process.env.VERACITY_CACHE_DIR), relative(resolve(process.env.VERACITY_TESTS), dirname(spec))),
    }]],
    reporters: ['spec', [VeracityReporter, { outputDir: join(output, 'results') }]],
    onPrepare() {
        mkdirSync(join(output, 'results'), { recursive: true });
        mkdirSync(join(output, 'screenshots'), { recursive: true });
    },
    async afterTest(test, context) {
        const titles = [];
        for (let item = context.test; item && item.title; item = item.parent) titles.unshift(item.title);
        const title = titles.join('.');
        const name = createHash('sha256').update(`${test.file}:${title}`).digest('hex') + '.png';
        await browser.saveScreenshot(join(output, 'screenshots', name));
        screenshots.set(title, [name]);
    },
    onComplete() { report(output); },
};
