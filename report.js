import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function report(directory) {
    const results = readdirSync(join(directory, 'results')).flatMap(file => JSON.parse(readFileSync(join(directory, 'results', file), 'utf8')));
    writeFileSync(join(directory, 'uat-output.json'), JSON.stringify({ results }, null, 2) + '\n');
    const rows = results.map(result => {
        const images = result.attachments.map(name => {
            const image = readFileSync(join(directory, 'screenshots', name)).toString('base64');
            return `<img alt="${escape(name)}" src="data:image/png;base64,${image}">`;
        }).join('');
        return `<tr><td>${escape(result.code)}</td><td class="${result.status}">${result.status}</td><td>${escape(result.note)}</td><td>${images}</td></tr>`;
    }).join('\n');
    writeFileSync(join(directory, 'uat-output.html'), `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Veracity UAT report</title>
<style>
body{font-family:system-ui;margin:2rem}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:.75rem;text-align:left;vertical-align:top;white-space:pre-wrap}
.succeeded{background:#dcfce7}.failed{background:#fee2e2}.skipped{background:#fef3c7}
img{display:block;max-width:100%;max-height:32rem;margin-bottom:.5rem}
</style><h1>Veracity UAT report</h1><table><thead><tr><th>Code</th><th>Status</th><th>Note</th><th>Screenshots</th></tr></thead>
<tbody>${rows}</tbody></table></html>\n`);
    return results;
}
