const { test, expect } = require('@playwright/test');

test('test fetch for modalDescricao.html', async ({ page }) => {
    // We'll log the fetch requests
    const fetchLog = [];

    await page.route('**/modalDescricao.html', async route => {
        const response = await route.fetch();
        fetchLog.push({
            status: response.status(),
            url: response.url(),
            ok: response.ok()
        });
        // Continue the route
        await route.continue();
    });

    await page.goto('http://localhost:8000/Páginas/2.1 - Campeonatos/index.html');

    // Wait for the Descrição button and click it to open the modal
    const descricaoButton = page.locator('.action-card', { hasText: 'Descrição' });
    await descricaoButton.click();

    // Wait for the modal to appear (we can wait for the modal container to have a modal)
    await page.waitForSelector('.modal-container .modal');

    // Close the modal by clicking the close button (the X button)
    const closeButton = page.locator('.modal-close');
    await closeButton.click();

    // Wait for the modal to disappear
    await page.waitForSelector('.modal-container .modal', { state: 'detached' });

    // Now, click the Descrição button again to trigger the second fetch
    await descricaoButton.click();

    // Wait for the modal to appear again
    await page.waitForSelector('.modal-container .modal');

    // Close the modal again
    await closeButton.click();
    await page.waitForSelector('.modal-container .modal', { state: 'detached' });

    // Now, check the fetchLog
    console.log('Fetch log:', fetchLog);
    expect(fetchLog.length).toBe(2);
    expect(fetchLog[0].status).toBe(200);
    expect(fetchLog[1].status).toBe(200);
});