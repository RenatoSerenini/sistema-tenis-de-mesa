/**
 * Modal Manager - Integração dos modais de Campeonatos
 *
 * Arquitetura:
 * - Um único #modal-container, criado somente quando um modal é aberto.
 * - CSS dos Pop-Up's carregado como texto e escopado para #modal-container.
 * - Nenhum CSS de modal é acumulado no <head>.
 * - As funções do fluxo de Confrontos recebem/reutilizam o mesmo container.
 */
(function () {
    'use strict';

    const MODAL_CONTAINER_ID = 'modal-container';
    const MODAL_STYLE_ID = 'modal-runtime-style';
    const MODAL_STAGE_CLASS = 'modal-stage';

    const modalMapping = {
        'btn-descricao': {
            html: "Pop-Up's/1 - Descrição/modalDescricao.html",
            css: "Pop-Up's/1 - Descrição/modalDescricao.css"
        },
        'btn-inscritos': {
            html: "Pop-Up's/2 - Inscritos/modalListaInscritos.html",
            css: "Pop-Up's/2 - Inscritos/modalListaInscritos.css"
        },
        'btn-grupos': {
            html: "Pop-Up's/3 - Pontuação/modalGruposPontuacoes.html",
            css: "Pop-Up's/3 - Pontuação/modalGruposPontuacoes.css"
        },
        'btn-chaveamento': {
            html: "Pop-Up's/5 - Chaveamento/modalChaveamento.html",
            css: "Pop-Up's/5 - Chaveamento/modalChaveamento.css"
        },
        'btn-resultados': {
            html: "Pop-Up's/6 - Pódio/modalResultadosFinais.html",
            css: "Pop-Up's/6 - Pódio/modalResultadosFinais.css"
        }
    };

    const confrontosFlow = {
        parte1: {
            html: "Pop-Up's/4 - Confrontos/Parte 1/modalConfrontos.html",
            css: "Pop-Up's/4 - Confrontos/Parte 1/modalConfrontos.css"
        },
        parte2: {
            html: "Pop-Up's/4 - Confrontos/Parte 2/modalEscolhaSets.html",
            css: "Pop-Up's/4 - Confrontos/Parte 2/modalEscolhaSets.css"
        },
        parte3: {
            html: "Pop-Up's/4 - Confrontos/Parte 3/modalRegistroResultado.html",
            css: "Pop-Up's/4 - Confrontos/Parte 3/modalRegistroResultado.css"
        }
    };

    const state = {
        confrontoSelecionado: null,
        setsEscolhidos: null,
        currentModalKey: null,
        requestId: 0,
        escHandler: null
    };

    // ------------------------------------------------------------
    // Container único
    // ------------------------------------------------------------

    function getOrCreateContainer() {
        let containers = document.querySelectorAll(`#${MODAL_CONTAINER_ID}`);
        let container = containers[0] || null;

        // Recuperação defensiva caso alguma versão anterior tenha deixado
        // containers duplicados no DOM.
        if (containers.length > 1) {
            console.warn(`[ModalManager] ${containers.length} #${MODAL_CONTAINER_ID} encontrados. Removendo duplicados.`);
            containers.forEach((item, index) => {
                if (index > 0) item.remove();
            });
        }

        if (!container) {
            container = document.createElement('div');
            container.id = MODAL_CONTAINER_ID;
            document.body.appendChild(container);
        }

        container.className = MODAL_CONTAINER_CLASS;
        return container;
    }

    const MODAL_CONTAINER_CLASS = 'modal-manager-container';

    function prepareContainer(container) {
        Object.assign(container.style, {
            position: 'fixed',
            inset: '0',
            width: '100%',
            height: '100%',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '10000',
            background: 'transparent',
            padding: '18px',
            boxSizing: 'border-box',
            pointerEvents: 'none'
        });

        container.setAttribute('aria-hidden', 'true');
    }

    function showContainer(container) {
        prepareContainer(container);
        container.style.display = 'flex';
        container.style.pointerEvents = 'auto';
        container.setAttribute('aria-hidden', 'false');
    }

    function hideContainer(container) {
        if (!container) return;

        container.style.display = 'none';
        container.style.pointerEvents = 'none';
        container.setAttribute('aria-hidden', 'true');
        container.innerHTML = '';
    }

    // ------------------------------------------------------------
    // CSS isolado
    // ------------------------------------------------------------

    async function fetchCSS(href) {
        const response = await fetch(href, { cache: 'no-cache' });

        if (!response.ok) {
            throw new Error(`Erro ao carregar CSS ${href}: HTTP ${response.status}`);
        }

        return response.text();
    }

    function removeRuntimeModalCSS() {
        const style = document.getElementById(MODAL_STYLE_ID);
        if (style) style.remove();
    }

    function addScopeToSelector(selector) {
        const scope = `#${MODAL_CONTAINER_ID}`;
        const trimmed = selector.trim();

        if (!trimmed) return trimmed;

        if (trimmed.includes(scope)) {
            return trimmed;
        }

        // Pseudo selectors globais.
        if (trimmed === ':root') {
            return scope;
        }

        // O Pop-Up é inserido dentro de #modal-container, então body/html
        // precisam representar o próprio container, não a página inteira.
        if (trimmed === 'html' || trimmed === 'body' || trimmed === 'html, body' || trimmed === 'body, html') {
            return scope;
        }

        // :root combinado com outros seletores.
        if (trimmed.startsWith(':root')) {
            return scope + trimmed.slice(':root'.length);
        }

        // Seletores que começam por html/body.
        if (/^(html|body)(\s|[.#:[>+~])/.test(trimmed)) {
            const withoutRoot = trimmed.replace(/^(html|body)\s*/, '').trim();
            return withoutRoot ? `${scope} ${withoutRoot}` : scope;
        }

        // O seletor universal continua válido dentro do container.
        if (trimmed === '*') {
            return `${scope} *`;
        }

        return `${scope} ${trimmed}`;
    }

    function scopeSelectorList(selectorText) {
        return selectorText
            .split(',')
            .map(addScopeToSelector)
            .join(', ');
    }

    function findMatchingBrace(text, openIndex) {
        let depth = 0;
        let quote = null;
        let comment = false;

        for (let i = openIndex; i < text.length; i++) {
            const ch = text[i];
            const next = text[i + 1];

            if (comment) {
                if (ch === '*' && next === '/') {
                    comment = false;
                    i++;
                }
                continue;
            }

            if (!quote && ch === '/' && next === '*') {
                comment = true;
                i++;
                continue;
            }

            if (quote) {
                if (ch === '\\') {
                    i++;
                    continue;
                }
                if (ch === quote) quote = null;
                continue;
            }

            if (ch === '"' || ch === "'") {
                quote = ch;
                continue;
            }

            if (ch === '{') depth++;
            if (ch === '}') {
                depth--;
                if (depth === 0) return i;
            }
        }

        return -1;
    }

    function scopeCSS(css) {
        let output = '';
        let i = 0;

        while (i < css.length) {
            // Comentário.
            if (css.startsWith('/*', i)) {
                const end = css.indexOf('*/', i + 2);
                if (end === -1) {
                    output += css.slice(i);
                    break;
                }
                output += css.slice(i, end + 2);
                i = end + 2;
                continue;
            }

            // Texto até a próxima abertura de bloco.
            const open = css.indexOf('{', i);
            if (open === -1) {
                output += css.slice(i);
                break;
            }

            const header = css.slice(i, open).trim();
            const close = findMatchingBrace(css, open);

            if (close === -1) {
                output += css.slice(i);
                break;
            }

            const body = css.slice(open + 1, close);

            if (header.startsWith('@')) {
                const atName = header.match(/^@([a-z-]+)/i)?.[1]?.toLowerCase();

                // @media, @supports, @container, @layer etc. possuem
                // seletores dentro do bloco e precisam ser processados
                // recursivamente.
                if (['media', 'supports', 'container', 'layer', 'document'].includes(atName)) {
                    output += `${header}{${scopeCSS(body)}}`;
                } else {
                    // @font-face, @keyframes, @import etc. permanecem
                    // estruturalmente intactos.
                    output += `${header}{${body}}`;
                }
            } else {
                output += `${scopeSelectorList(header)}{${body}}`;
            }

            i = close + 1;
        }

        return output;
    }

    async function loadModalCSS(cssPath) {
        removeRuntimeModalCSS();

        const css = await fetchCSS(cssPath);
        const style = document.createElement('style');
        style.id = MODAL_STYLE_ID;
        style.dataset.modalCss = cssPath;
        style.textContent = scopeCSS(css);

        document.head.appendChild(style);
    }

    // ------------------------------------------------------------
    // HTML
    // ------------------------------------------------------------

    async function loadHTML(url) {
        const response = await fetch(url, { cache: 'no-cache' });

        if (!response.ok) {
            throw new Error(`Erro ao carregar ${url}: HTTP ${response.status}`);
        }

        return response.text();
    }

    function createStage(container) {
        const stage = document.createElement('div');
        stage.className = MODAL_STAGE_CLASS;
        stage.addEventListener('click', (event) => {
            if (event.target === stage) {
                closeModal();
            }
        });

        container.appendChild(stage);
        return stage;
    }

    function findModalRoot(root) {
        if (!root) return null;

        return root.querySelector(
            '[role="dialog"], article, section, .modal, .modal-content'
        );
    }

    // ------------------------------------------------------------
    // Fechamento
    // ------------------------------------------------------------

    function removeEscHandler() {
        if (state.escHandler) {
            document.removeEventListener('keydown', state.escHandler);
            state.escHandler = null;
        }
    }

    function setupModalClose(modalElement) {
        if (!modalElement) return;

        const closeButtons = modalElement.querySelectorAll(
            '[aria-label="Fechar modal"], .modal-close, .icon-button, .botao-fechar, .primary-button, .modal-button, .modal-action'
        );

        closeButtons.forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                closeModal();
            });
        });

        removeEscHandler();

        state.escHandler = (event) => {
            if (event.key === 'Escape') {
                closeModal();
            }
        };

        document.addEventListener('keydown', state.escHandler);
    }

    function closeModal() {
        state.requestId++;
        removeEscHandler();

        const container = document.getElementById(MODAL_CONTAINER_ID);

        if (container) {
            hideContainer(container);
        }

        removeRuntimeModalCSS();

        state.currentModalKey = null;
        resetConfrontosState();
    }

    // ------------------------------------------------------------
    // Carregamento genérico
    // ------------------------------------------------------------

    async function renderModal(config, modalKey, setup) {
        const requestId = ++state.requestId;
        const container = getOrCreateContainer();

        prepareContainer(container);
        container.innerHTML = '';
        state.currentModalKey = modalKey;

        try {
            // Carrega HTML e CSS do mesmo modal. O CSS é isolado antes
            // de ser inserido no head.
            const [html, css] = await Promise.all([
                loadHTML(config.html),
                fetchCSS(config.css)
            ]);

            if (requestId !== state.requestId) return;

            removeRuntimeModalCSS();

            const style = document.createElement('style');
            style.id = MODAL_STYLE_ID;
            style.dataset.modalCss = config.css;
            style.textContent = scopeCSS(css);
            document.head.appendChild(style);

            const stage = createStage(container);
            stage.innerHTML = html;

            showContainer(container);

            const modal = findModalRoot(stage);
            setupModalClose(modal);

            if (typeof setup === 'function') {
                setup(container, modal);
            }

            container.dispatchEvent(
                new CustomEvent('modalOpened', {
                    detail: { type: modalKey, config }
                })
            );
        } catch (error) {
            console.error('[ModalManager] Erro ao abrir modal:', error);

            if (requestId !== state.requestId) return;

            removeRuntimeModalCSS();

            container.innerHTML = `
                <div class="modal-error">
                    <p>Erro ao carregar o modal.</p>
                    <p>${escapeHTML(error.message)}</p>
                </div>
            `;

            showContainer(container);
        }
    }

    function escapeHTML(value) {
        return String(value)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    async function openSimpleModal(config) {
        await renderModal(config, 'simple', null);
    }

    // ------------------------------------------------------------
    // Fluxo de Confrontos
    // ------------------------------------------------------------

    async function openConfrontosParte1() {
        await renderModal(confrontosFlow.parte1, 'confrontos-parte-1', (container) => {
            setupConfrontosClick(container);
        });
    }

    function setupConfrontosClick(container) {
        const confrontos = container.querySelectorAll('.confronto');

        confrontos.forEach((confronto, index) => {
            confronto.style.cursor = 'pointer';

            confronto.addEventListener('click', () => {
                const jogador1El = confronto.querySelector('.jogador-esquerda, .jogador');
                const jogador2El = confronto.querySelector('.jogador-direita, .jogador:not(.jogador-esquerda)');

                const jogador1 = jogador1El?.textContent?.trim() || '';
                const jogador2 = jogador2El?.textContent?.trim() || '';

                state.confrontoSelecionado = {
                    index,
                    jogador1: jogador1.replace(/✓/g, '').trim(),
                    jogador2: jogador2.replace(/✓/g, '').trim()
                };

                openConfrontosParte2();
            });
        });
    }

    async function openConfrontosParte2() {
        await renderModal(confrontosFlow.parte2, 'confrontos-parte-2', (container) => {
            setupSetsButtons(container);
        });
    }

    function setupSetsButtons(container) {
        const btn3Sets = container.querySelector('.btn-3-sets');
        const btn5Sets = container.querySelector('.btn-5-sets');

        if (btn3Sets) {
            btn3Sets.addEventListener('click', () => {
                state.setsEscolhidos = 3;
                openConfrontosParte3();
            });
        }

        if (btn5Sets) {
            btn5Sets.addEventListener('click', () => {
                state.setsEscolhidos = 5;
                openConfrontosParte3();
            });
        }
    }

    async function openConfrontosParte3() {
        await renderModal(confrontosFlow.parte3, 'confrontos-parte-3', (container) => {
            setupJogadores(container);
            setupSetsFields(container);
            setupEnviarResultado(container);
        });
    }

    function setupJogadores(container) {
        const jogador1El = container.querySelector('.jogador-1, [data-jogador="1"]');
        const jogador2El = container.querySelector('.jogador-2, [data-jogador="2"]');

        if (jogador1El && state.confrontoSelecionado) {
            jogador1El.textContent = state.confrontoSelecionado.jogador1;
        }

        if (jogador2El && state.confrontoSelecionado) {
            jogador2El.textContent = state.confrontoSelecionado.jogador2;
        }

        const colunasJogador = container.querySelectorAll('.coluna-jogador');

        if (colunasJogador.length >= 2 && state.confrontoSelecionado) {
            colunasJogador[0].textContent = state.confrontoSelecionado.jogador1;
            colunasJogador[1].textContent = state.confrontoSelecionado.jogador2;
        }
    }

    function setupSetsFields(container) {
        const totalSets = state.setsEscolhidos || 3;

        for (let i = 1; i <= 5; i++) {
            const setLinha = container.querySelector(`.set-linha[data-set="${i}"]`);
            if (!setLinha) continue;

            const inputs = setLinha.querySelectorAll('input');

            if (i <= totalSets) {
                setLinha.classList.remove('set-linha-desativada');

                inputs.forEach((input) => {
                    input.disabled = false;
                    input.removeAttribute('disabled');
                });
            } else {
                setLinha.classList.add('set-linha-desativada');

                inputs.forEach((input) => {
                    input.disabled = true;
                    input.setAttribute('disabled', 'disabled');
                    input.value = '';
                });
            }
        }
    }

    function setupEnviarResultado(container) {
        const btnEnviar = container.querySelector('.botao-enviar, .btn-enviar');

        if (!btnEnviar) return;

        btnEnviar.addEventListener('click', () => {
            const resultado = collectResultado(container);

            console.log('Resultado registrado:', resultado);

            alert(
                `Resultado registrado com sucesso!\n\n` +
                `${state.confrontoSelecionado?.jogador1 || ''} × ${state.confrontoSelecionado?.jogador2 || ''}\n` +
                `${resultado.placar}`
            );

            resetConfrontosState();
            closeModal();
        });
    }

    function collectResultado(container) {
        const totalSets = state.setsEscolhidos || 3;
        const sets = [];
        let pontosJogador1 = 0;
        let pontosJogador2 = 0;

        for (let i = 1; i <= totalSets; i++) {
            const input1 = container.querySelector(`.set${i}-jogador1`);
            const input2 = container.querySelector(`.set${i}-jogador2`);

            const p1 = Number.parseInt(input1?.value, 10) || 0;
            const p2 = Number.parseInt(input2?.value, 10) || 0;

            sets.push({
                set: i,
                jogador1: p1,
                jogador2: p2
            });

            if (p1 > p2) pontosJogador1++;
            if (p2 > p1) pontosJogador2++;
        }

        const jogador1 = state.confrontoSelecionado?.jogador1 || '';
        const jogador2 = state.confrontoSelecionado?.jogador2 || '';

        return {
            confronto: state.confrontoSelecionado,
            totalSets,
            sets,
            placar: `${pontosJogador1} × ${pontosJogador2}`,
            vencedor:
                pontosJogador1 > pontosJogador2
                    ? jogador1
                    : pontosJogador2 > pontosJogador1
                        ? jogador2
                        : 'Empate'
        };
    }

    function resetConfrontosState() {
        state.confrontoSelecionado = null;
        state.setsEscolhidos = null;
    }

    // ------------------------------------------------------------
    // Inicialização
    // ------------------------------------------------------------

    function initializeButtons() {
        const buttons = [
            {
                selector: '.action-card:nth-child(1)',
                action: () => openSimpleModal(modalMapping['btn-descricao'])
            },
            {
                selector: '.action-card:nth-child(2)',
                action: () => openSimpleModal(modalMapping['btn-inscritos'])
            },
            {
                selector: '.action-card:nth-child(3)',
                action: () => openSimpleModal(modalMapping['btn-grupos'])
            },
            {
                selector: '.action-card:nth-child(4)',
                action: () => openConfrontosParte1()
            },
            {
                selector: '.action-card:nth-child(5)',
                action: () => openSimpleModal(modalMapping['btn-chaveamento'])
            },
            {
                selector: '.action-card:nth-child(6)',
                action: () => openSimpleModal(modalMapping['btn-resultados'])
            }
        ];

        buttons.forEach(({ selector, action }) => {
            const button = document.querySelector(selector);

            if (button) {
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    action();
                });
            }
        });
    }

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeButtons, { once: true });
        } else {
            initializeButtons();
        }

        console.log('[ModalManager] inicializado');
    }

    // Pequena API de diagnóstico, útil durante os testes.
    window.modalManager = {
        openSimpleModal,
        openConfrontosParte1,
        close: closeModal,
        countContainers: () => document.querySelectorAll(`#${MODAL_CONTAINER_ID}`).length,
        getContainer: () => document.getElementById(MODAL_CONTAINER_ID),
        getState: () => ({ ...state })
    };

    init();
})();
