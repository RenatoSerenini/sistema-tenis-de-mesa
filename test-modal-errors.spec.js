const { test, expect } = require('@playwright/test');

test('test modal open/close twice and check for console errors', async ({ page }) => {
    // We'll collect console errors
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push({
                text: msg.text(),
                url: msg.location().url,
                line: msg.location().lineNumber,
                column: msg.location().columnNumber
            });
        }
    });

    await page.goto('http://localhost:8000/Páginas/2.1 - Campeonatos/index.html');

    // First open
    const descricaoButton = page.locator('.action-card', { hasText: 'Descrição' });
    await descricaoButton.click();
    await page.waitForSelector('.modal-container .modal');
    const closeButton = page.locator('.modal-close');
    await closeButton.click();
    await page.waitForSelector('.modal-container .modal', { state: 'detached' });

    // Second open
    await descricaoButton.click();
    await page.waitForSelector('.modal-container .modal');
    await closeButton.click();
    await page.waitForSelector('.modal-container .modal', { state: 'detached' });

    // Log the errors
    console.log('Console errors:', errors);
    // We expect no errors related to the modal, but we know about favicon.ico
    // Let's filter out the favicon.ico error and see if there are any others
    const otherErrors = errors.filter(e => !e.url.includes('favicon.ico'));
    console.log('Errors excluding favicon.ico:', otherErrors);
    // If there are any other errors, we want to see them
    if (otherErrors.length > 0) {
        throw new Error(`Unexpected console errors: ${JSON.stringify(otherErrors, null, 2)}`);
    }
});