import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';

async function run(args, env) {
    const child = spawn(process.execPath, args, { env, stdio: 'inherit', timeout: 110000 });
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, 'Veracity run failed');
}

test('records and replays a login', { timeout: 240000 }, async t => {
    assert.ok(process.env.OPENAI_API_KEY, 'OPENAI_API_KEY is required');
    const env = { ...process.env, UAT_EMAIL: 'user@example.com', UAT_PASSWORD: 'test-password' };
    const server = createServer(async (request, response) => {
        if (request.url === '/login') {
            response.setHeader('Content-Type', 'text/html');
            response.end('<form method="post" action="/session"><label>Email<input name="email" type="email"></label><label>Password<input name="password" type="password"></label><button>Log in</button></form>');
        } else if (request.method === 'POST' && request.url === '/session') {
            let body = '';
            for await (const chunk of request) body += chunk;
            const form = new URLSearchParams(body);
            if (form.get('email') !== env.UAT_EMAIL || form.get('password') !== env.UAT_PASSWORD) {
                response.writeHead(401).end('Invalid credentials');
                return;
            }
            response.writeHead(303, { Location: '/account', 'Set-Cookie': 'session=valid; Path=/' }).end();
        } else if (request.url === '/account' && request.headers.cookie === 'session=valid') {
            response.setHeader('Content-Type', 'text/html');
            response.end('<h1>Account</h1>');
        } else {
            response.writeHead(404).end();
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    mkdirSync('veracity-output', { recursive: true });
    const directory = mkdtempSync('veracity-output/test-');
    const args = ['veracity.js', '--url', `http://127.0.0.1:${server.address().port}`, '--tests', 'tests', '--cache-dir', join(directory, 'cache')];
    if (process.env.VERACITY_PROVIDER) args.push('--provider', process.env.VERACITY_PROVIDER);
    if (process.env.VERACITY_MODEL) args.push('--model', process.env.VERACITY_MODEL);
    if (process.env.VERACITY_BASE_URL) args.push('--base-url', process.env.VERACITY_BASE_URL);
    await run([...args, '--cache', 'write', '--output', join(directory, 'record')], env);
    const recording = JSON.parse(readFileSync(join(directory, 'cache', 'login.e2e.js.json'), 'utf8'));
    assert.ok(recording.entries.login.steps.length > 0);
    await run([...args, '--cache', 'locked', '--output', join(directory, 'replay')], env);
    for (const name of ['record', 'replay']) {
        const output = join(directory, name);
        const { results } = JSON.parse(readFileSync(join(output, 'uat-output.json'), 'utf8'));
        assert.equal(results.length, 1);
        assert.equal(results[0].status, 'succeeded');
        assert.equal(results[0].attachments.length, 1);
        const png = readFileSync(join(output, 'screenshots', results[0].attachments[0]));
        assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.match(readFileSync(join(output, 'uat-output.html'), 'utf8'), /data:image\/png;base64,/);
    }
});
