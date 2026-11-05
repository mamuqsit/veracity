import { z } from 'zod';

describe('Login', () => {
    it('opens the account page', async () => {
        await browser.url('/login');
        await browser.act('Log in with email {{email}} and password {{password}}', {
            id: 'login',
            values: { email: process.env.UAT_EMAIL, password: process.env.UAT_PASSWORD },
        });
        await expect(browser).toHaveUrl(expect.stringContaining('/account'));
        await expect($('h1')).toHaveText('Account');
        const heading = await browser.extract('Read the main page heading text.', z.string());
        expect(heading).toBe('Account');
    });
});
