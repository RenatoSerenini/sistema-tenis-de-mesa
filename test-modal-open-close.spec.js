const { test, expect } = require('@playwright/test');

test('test open and close modal multiple times and check for console errors', async ({ page }) => {
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

    const descricaoButton = page.locator('.action-card', { hasText: 'Descrição' });

    // We'll do 3 cycles of open and close
    for (let i = 0; i < 3; i++) {
        // Click to open
        await descricaoButton.click();
        // Wait for modal to appear
        await page.waitForSelector('.modal-container .modal', { state: 'attached' });
        // Check that the modal is visible
        const modal = page.locator('.modal-container .modal');
        await expect(modal).toBeVisible();
        // Close by clicking the X button
        const closeButton = page.locator('.modal-close');
        await closeButton.click();
        // Wait for modal to be detached
        await page.waitForSelector('.modal-container .modal', { state: 'detached' });
    }

    // Log the errors
    console.log('Console errors:', errors);
    // Filter out favicon.ico errors
    const otherErrors = errors.filter(e => !e.url.includes('favicon.ico'));
    console.log('Errors excluding favicon.ico:', otherErrors);
    // If there are any other errors, we want to see them
    if (otherErrors.length > 0) {
        throw new Error(`Unexpected console errors: ${JSON.stringify(otherErrors, null, 2)}`);
    }
});