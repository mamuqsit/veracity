#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Launcher } from '@wdio/cli';

const { values } = parseArgs({ options: {
    url: { type: 'string' },
    tests: { type: 'string' },
    provider: { type: 'string', default: 'openai' },
    model: { type: 'string', default: 'gpt-5.6-luna' },
    'base-url': { type: 'string' },
    workers: { type: 'string', default: '1' },
    output: { type: 'string', default: 'veracity-output' },
    'cache-dir': { type: 'string', default: '.veracity/act' },
    cache: { type: 'string', default: 'write' },
    help: { type: 'boolean' },
} });
if (values.help) {
    console.log('veracity --url URL --tests DIRECTORY [--provider openai] [--model gpt-5.6-luna] [--base-url URL] [--workers 1]\n' +
        '  [--output veracity-output] [--cache-dir .veracity/act] [--cache write|heal|locked|off]');
    process.exit(0);
}
if (!values.url || !values.tests) throw new Error('--url and --tests are required');
if (!statSync(values.tests).isDirectory()) throw new Error('--tests must be a directory');
if (!Number.isInteger(Number(values.workers)) || Number(values.workers) < 1) throw new Error('--workers must be a positive integer');
if (existsSync(values.output) && readdirSync(values.output).length) throw new Error('--output must be empty; use a new directory for each run');
mkdirSync(values.output, { recursive: true });
for (const [key, value] of Object.entries(values)) process.env[`VERACITY_${key.replaceAll('-', '_').toUpperCase()}`] = value;
const exitCode = await new Launcher(fileURLToPath(new URL('./wdio.conf.js', import.meta.url))).run();
const { results } = JSON.parse(readFileSync(resolve(values.output, 'uat-output.json'), 'utf8'));
process.exit(exitCode || Number(!results.length || results.some(result => result.status !== 'succeeded')));
