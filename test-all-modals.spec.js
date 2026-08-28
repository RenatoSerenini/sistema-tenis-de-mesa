const { test, expect } = require('@playwright/test');

test('test all modals for console errors', async ({ page }) => {
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

    // Get all action-card buttons
    const buttons = await page.locator('.action-card').all();

    // Test each button
    for (let i = 0; i < buttons.length; i++) {
        const buttonText = await buttons[i].locator('h4').textContent();
        console.log(`Testing modal: ${buttonText.trim()}`);

        // Click to open
        await buttons[i].click();
        // Wait for modal to appear
        await page.waitForSelector('.modal-container .modal', { state: 'attached' });
        // Close by clicking the X button
        const closeButton = page.locator('.modal-close');
        await closeButton.click();
        // Wait for modal to be detached
        await page.waitForSelector('.modal-container .modal', { state: 'detached' });

        // Small delay between modals
        await page.waitForTimeout(500);
    }

    // Log the errors
    console.log('All console errors:', errors);
    // Filter out favicon.ico errors
    const otherErrors = errors.filter(e => !e.url.includes('favicon.ico'));
    console.log('Errors excluding favicon.ico:', otherErrors);
    // If there are any other errors, we want to see them
    if (otherErrors.length > 0) {
        throw new Error(`Unexpected console errors: ${JSON.stringify(otherErrors, null, 2)}`);
    }
});