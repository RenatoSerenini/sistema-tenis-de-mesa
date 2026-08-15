/**
 * Teste visual dos modais usando Playwright
 */
const { chromium } = require('playwright');
const path = require('path');

async function runVisualTest() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
    });
    const page = await context.newPage();

    const baseDir = path.join(__dirname, '2.1 - Campeonatos');
    const filePath = `file://${baseDir}/index.html`;

    console.log('Abrindo página:', filePath);

    try {
        await page.goto(filePath, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        // Screenshot inicial - Modal Manager
        await page.screenshot({ path: 'test-output/00-initial-state.png' });
        console.log('Screenshot: 00-initial-state.png');

        // Teste 1: Botão Descrição
        console.log('\n--- Teste 1: Botão Descrição ---');
        await page.click('.action-card:nth-child(1)');
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'test-output/01-modal-descricao-open.png' });
        console.log('Screenshot: 01-modal-descricao-open.png (durante animação)');

        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'test-output/01-modal-descricao-complete.png' });
        console.log('Screenshot: 01-modal-descricao-complete.png (animação completa)');

        // Verificar console
        const logs = [];
        page.on('console', msg => {
            if (msg.type() === 'error' || msg.text().includes('[ModalManager]')) {
                logs.push(`[${msg.type()}] ${msg.text()}`);
            }
        });

        // Tentar fechar
        const closeBtn = await page.$('.modal-close, .modal-button, .icon-button, .primary-button');
        if (closeBtn) {
            await closeBtn.click();
            await page.waitForTimeout(500);
            await page.screenshot({ path: 'test-output/01-modal-descricao-closed.png' });
            console.log('Screenshot: 01-modal-descricao-closed.png');
        }

        // Verificar estado do Modal Manager
        await page.screenshot({ path: 'test-output/01-after-modal-closed.png' });
        console.log('Screenshot: 01-after-modal-closed.png (verificar Modal Manager)');

        // Teste 2: Botão Inscritos
        console.log('\n--- Teste 2: Botão Inscritos ---');
        await page.click('.action-card:nth-child(2)');
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'test-output/02-modal-inscritos-open.png' });
        await page.waitForTimeout(1000);

        // Tentar fechar
        const closeBtn2 = await page.$('.modal-close, .modal-button, .icon-button, .primary-button');
        if (closeBtn2) {
            await closeBtn2.click();
            await page.waitForTimeout(500);
        }
        await page.screenshot({ path: 'test-output/02-after-inscritos-closed.png' });

        // Teste 3: Botão Confrontos
        console.log('\n--- Teste 3: Botão Confrontos ---');
        await page.click('.action-card:nth-child(4)');
        await page.waitForTimeout(500);
        await page.screenshot({ path: 'test-output/03-confrontos-parte1.png' });
        console.log('Screenshot: 03-confrontos-parte1.png');

        // Verificar se existe lista de confrontos
        const confrontos = await page.$$('.confronto');
        console.log(`Encontrados ${confrontos.length} confrontos`);

        if (confrontos.length > 0) {
            // Clicar no primeiro confronto
            await confrontos[0].click();
            await page.waitForTimeout(500);
            await page.screenshot({ path: 'test-output/04-confrontos-parte2-sets.png' });
            console.log('Screenshot: 04-confrontos-parte2-sets.png');

            // Selecionar 3 sets
            const btn3Sets = await page.$('.btn-3-sets');
            if (btn3Sets) {
                await btn3Sets.click();
                await page.waitForTimeout(500);
                await page.screenshot({ path: 'test-output/05-confrontos-parte3-3sets.png' });
                console.log('Screenshot: 05-confrontos-parte3-3sets.png');

                // Verificar campos bloqueados
                const disabledInputs = await page.$$('input[disabled]');
                console.log(`Encontrados ${disabledInputs.length} campos desabilitados (esperado: 4 para 3 sets)`);
            }
        }

        // Fechar modal
        const closeBtn3 = await page.$('.modal-close, .botao-fechar');
        if (closeBtn3) {
            await closeBtn3.click();
            await page.waitForTimeout(500);
        }
        await page.screenshot({ path: 'test-output/06-after-confrontos-closed.png' });

        // Teste 4: Verificar Modal Manager final
        console.log('\n--- Verificação Final ---');
        await page.screenshot({ path: 'test-output/07-final-state.png' });

        // Verificar elementos visíveis
        const modalVisible = await page.$eval('#modal-container', el => el.style.display !== 'none').catch(() => false);
        console.log(`Modal container visível: ${modalVisible}`);

        const body = await page.$('body');
        const bodyStyles = await body.evaluate(el => {
            const comp = window.getComputedStyle(el);
            return {
                margin: comp.margin,
                padding: comp.padding,
                minHeight: comp.minHeight,
                display: comp.display,
                background: comp.background
            };
        });
        console.log('Body styles:', JSON.stringify(bodyStyles, null, 2));

        console.log('\n=== Testes concluídos ===');
        console.log('Screenshots salvos em: test-output/');

    } catch (error) {
        console.error('Erro durante o teste:', error);
    } finally {
        await browser.close();
    }
}

runVisualTest();