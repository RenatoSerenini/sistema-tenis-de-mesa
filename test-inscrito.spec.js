const { test, expect } = require('@playwright/test');

test('test inscritos modal specifically', async ({ page }) => {
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

    // Find the Inscritos button
    const inscritosButton = page.locator('.action-card', { hasText: 'Inscritos' });
    console.log('Found Inscritos button');

    // Click to open
    await inscritosButton.click();
    console.log('Clicked Inscritos button');

    // Wait a bit to see what happens
    await page.waitForTimeout(2000);

    // Check if modal is present
    const modal = page.locator('.modal-container');
    const htmlContent = await modal.innerHTML();
    console.log('Modal container HTML after click:', htmlContent);

    // Check for any elements with role=dialog
    const dialogs = page.locator('[role="dialog"]');
    const count = await dialogs.count();
    console.log('Number of elements with role="dialog":', count);
    if (count > 0) {
        const firstDialog = dialogs.first();
        const className = await firstDialog.getAttribute('class');
        console.log('First dialog class:', className);
    }

    // Log the errors
    console.log('Console errors:', errors);
    // Filter out favicon.ico errors
    const otherErrors = errors.filter(e => !e.url.includes('favicon.ico'));
    console.log('Errors excluding favicon.ico:', otherErrors);
});