/**
 * Modal Manager - Integração dos modais de Campeonatos
 *
 * v3
 *
 * Arquitetura:
 * - Um único #modal-container.
 * - Cada Pop-Up é carregado no seu próprio iframe.
 * - O iframe aponta diretamente para o HTML original do Pop-Up.
 * - CSS, fontes, imagens, animações e caminhos relativos permanecem intactos.
 * - Nenhum CSS dos Pop-Up's é injetado, reescrito ou escopado na página principal.
 * - O iframe é dimensionado pelo conteúdo visual principal do documento interno.
 * - Quando necessário, cada modal pode informar contentSelector, width e height.
 *
 * Observação importante:
 * Os seletores contentSelector definidos abaixo foram usados somente quando
 * confirmados na estrutura CSS existente do repositório. Para os demais modais,
 * o gerenciador faz detecção automática do elemento visual principal sem alterar
 * o CSS ou o HTML original.
 */

(function () {
    'use strict';

    const MODAL_CONTAINER_ID = 'modal-container';
    const MODAL_IFRAME_CLASS = 'modal-manager-iframe';

    const DEFAULT_MODAL_WIDTH = '560px';
    const DEFAULT_MODAL_HEIGHT = '520px';
    const DEFAULT_CONTENT_SELECTOR = 'article';
    const VIEWPORT_MARGIN = 18;
    const SIZE_EPSILON = 2;


    /*
     * Os caminhos são os caminhos reais utilizados pelo projeto na página
     * Páginas/2.1 - Campeonatos.
     *
     * contentSelector só é informado quando o seletor do elemento principal
     * foi confirmado nos CSS existentes:
     * - Descrição: .modal
     * - Inscritos: .modal-inscritos
     * - Pontuação: .modal-grupos
     * - Confrontos Parte 1: .modal-confrontos
     */
    const modalMapping = {
        'btn-descricao': {
            html: "Pop-Up's/1 - Descrição/modalDescricao.html",
            width: '360px',
            height: 'auto',
            contentSelector: 'article'
        },

        'btn-inscritos': {
            html: "Pop-Up's/2 - Inscritos/modalListaInscritos.html",
            width: '520px',
            height: 'auto',
            contentSelector: 'article'
        },

        'btn-grupos': {
            html: "Pop-Up's/3 - Pontuação/modalGruposPontuacoes.html",
            width: '560px',
            height: '410px',
            contentSelector: 'article'
        },

        'btn-chaveamento': {
            html: "Pop-Up's/5 - Chaveamento/modalChaveamento.html",
            width: "900px",
            height: "613px"
        },

        'btn-resultados': {
            html: "Pop-Up's/6 - Pódio/modalResultadosFinais.html",
            width: DEFAULT_MODAL_WIDTH,
            height: DEFAULT_MODAL_HEIGHT
        }
    };

    const confrontosFlow = {
        parte1: {
            html: "Pop-Up's/4 - Confrontos/Parte 1/modalConfrontos.html",
            width: '470px',
            height: '600px',
            contentSelector: 'article'
        },

        parte2: {
            html: "Pop-Up's/4 - Confrontos/Parte 2/modalEscolhaSets.html",
            width: DEFAULT_MODAL_WIDTH,
            height: DEFAULT_MODAL_HEIGHT
        },

        parte3: {
            html: "Pop-Up's/4 - Confrontos/Parte 3/modalRegistroResultado.html",
            width: "760px",
            height: "571px"
        }
    };

    const state = {
        confrontoSelecionado: null,
        setsEscolhidos: null,
        currentModalKey: null,
        requestId: 0,
        escHandler: null,
        currentIframe: null
    };

    // ------------------------------------------------------------
    // Container único
    // ------------------------------------------------------------

    function getOrCreateContainer() {
        const containers = document.querySelectorAll(`#${MODAL_CONTAINER_ID}`);
        let container = containers[0] || null;

        if (containers.length > 1) {
            console.warn(
                `[ModalManager] ${containers.length} #${MODAL_CONTAINER_ID} encontrados. ` +
                'Removendo duplicados.'
            );

            containers.forEach((item, index) => {
                if (index > 0) {
                    item.remove();
                }
            });
        }

        if (!container) {
            container = document.createElement('div');
            container.id = MODAL_CONTAINER_ID;
            document.body.appendChild(container);
        }

        prepareContainer(container);
        return container;
    }

    function prepareContainer(container) {
        Object.assign(container.style, {
            position: 'fixed',
            inset: '0',
            width: '100%',
            height: '100%',
            display: 'none',
            zIndex: '10000',
            background: 'rgba(0, 0, 0, 0.45)',
            padding: `${VIEWPORT_MARGIN}px`,
            boxSizing: 'border-box',
            overflow: 'hidden',
            pointerEvents: 'none'
        });

        container.setAttribute('aria-hidden', 'true');
    }

    function showContainer(container) {
        prepareContainer(container);
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.pointerEvents = 'auto';
        container.setAttribute('aria-hidden', 'false');
    }

    function destroyIframe() {
        if (state.currentIframe) {
            state.currentIframe.onload = null;
            state.currentIframe.onerror = null;
            state.currentIframe.remove();
            state.currentIframe = null;
        }
    }

    function hideContainer(container) {
        if (!container) {
            return;
        }

        destroyIframe();
        container.replaceChildren();
        container.style.display = 'none';
        container.style.pointerEvents = 'none';
        container.setAttribute('aria-hidden', 'true');
    }

    // ------------------------------------------------------------
    // Iframe
    // ------------------------------------------------------------

    function createIframe(config) {
        const iframe = document.createElement('iframe');

        iframe.className = MODAL_IFRAME_CLASS;
        iframe.src = config.html;

        /*
         * Sem sandbox: os HTMLs fazem parte do mesmo projeto e o Modal Manager
         * precisa acessar o documento interno durante o fluxo de Confrontos.
         */
        iframe.setAttribute('title', 'Modal');
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('scrolling', 'no');

        Object.assign(iframe.style, {
            position: 'relative',
            flex: '0 0 auto',
            width: normalizeDimension(config.width, DEFAULT_MODAL_WIDTH),
            height: normalizeDimension(config.height, DEFAULT_MODAL_HEIGHT),
            maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
            maxHeight: `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`,
            border: '0',
            display: 'block',
            background: 'transparent',
            overflow: 'hidden'
        });

        return iframe;
    }

    function normalizeDimension(value, fallback) {
        if (value === undefined || value === null || value === '') {
            return fallback;
        }

        if (value === 'auto') {
            return fallback;
        }

        return String(value);
    }

    function getIframeDocument() {
        const iframe = state.currentIframe;

        if (!iframe) {
            return null;
        }

        try {
            return iframe.contentDocument ||
                iframe.contentWindow?.document ||
                null;
        } catch (error) {
            console.error(
                '[ModalManager] Não foi possível acessar o documento do iframe:',
                error
            );

            return null;
        }
    }

    // ------------------------------------------------------------
    // Dimensionamento e enquadramento
    // ------------------------------------------------------------

    function getViewportLimits() {
        return {
            maxWidth: Math.max(
                120,
                window.innerWidth - VIEWPORT_MARGIN * 2
            ),
            maxHeight: Math.max(
                120,
                window.innerHeight - VIEWPORT_MARGIN * 2
            )
        };
    }

    function isVisibleElement(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        const style = element.ownerDocument.defaultView?.getComputedStyle(element);

        if (!style) {
            return true;
        }

        if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.opacity === '0'
        ) {
            return false;
        }

        const rect = element.getBoundingClientRect();

        return rect.width > 0 && rect.height > 0;
    }

    function getArea(rect) {
        return Math.max(0, rect.width) * Math.max(0, rect.height);
    }

    function findContentRoot(modalDocument, config) {
        if (!modalDocument) {
            return null;
        }

        const contentSelector = config.contentSelector || DEFAULT_CONTENT_SELECTOR;

        try {
            const selected = modalDocument.querySelector(contentSelector);

            if (selected && isVisibleElement(selected)) {
                return selected;
            }
        } catch (error) {
            console.warn(
                '[ModalManager] contentSelector inválido:',
                contentSelector,
                error
            );
        }

        return null;
    }

    function getElementPathToBody(element) {
        const path = [];
        let current = element;

        while (current && current.nodeType === Node.ELEMENT_NODE) {
            path.push(current);

            if (current === current.ownerDocument.body) {
                break;
            }

            current = current.parentElement;
        }

        return path;
    }

    function isScriptOrNonVisualElement(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return true;
        }

        return [
            'SCRIPT',
            'STYLE',
            'HEAD',
            'LINK',
            'META',
            'TITLE',
            'NOSCRIPT',
            'TEMPLATE'
        ].includes(element.tagName);
    }

    function hideVisualSiblings(element, keepPath) {
        if (!element || !element.parentElement) {
            return;
        }

        Array.from(element.parentElement.children).forEach((sibling) => {
            if (sibling === element || keepPath.includes(sibling)) {
                return;
            }

            if (isScriptOrNonVisualElement(sibling)) {
                return;
            }

            sibling.dataset.modalManagerHidden = 'true';
            sibling.style.setProperty('display', 'none', 'important');
        });
    }

    function neutralizeExternalVisualLayer(element) {
        if (!element) {
            return;
        }

        const computed = element.ownerDocument.defaultView?.getComputedStyle(element);

        if (!computed) {
            return;
        }

        /*
         * Somente neutraliza propriedades do elemento que podem pintar a área
         * externa do documento. Não altera tipografia, dimensões ou layout do
         * article e não reescreve nenhuma folha CSS original.
         */
        if (
            computed.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
            computed.backgroundColor !== 'transparent'
        ) {
            element.style.setProperty('background', 'transparent', 'important');
            element.style.setProperty('background-color', 'transparent', 'important');
        }

        if (computed.backgroundImage !== 'none') {
            element.style.setProperty('background-image', 'none', 'important');
        }
    }

    function isolateArticleVisibility(modalDocument, config) {
        const article = findContentRoot(modalDocument, config);

        if (!article) {
            console.warn(
                '[ModalManager] Nenhum <article> visível foi encontrado no modal:',
                config.html
            );
            return null;
        }

        const body = modalDocument.body;
        const html = modalDocument.documentElement;
        const path = getElementPathToBody(article);

        /*
         * Mantém o HTML original carregado e os estilos internos intactos.
         * A intervenção é exclusivamente visual e acontece somente dentro do
         * documento isolado do iframe.
         */
        if (html) {
            html.style.setProperty('background', 'transparent', 'important');
            html.style.setProperty('background-color', 'transparent', 'important');
            html.style.setProperty('background-image', 'none', 'important');
        }

        if (body) {
            body.style.setProperty('background', 'transparent', 'important');
            body.style.setProperty('background-color', 'transparent', 'important');
            body.style.setProperty('background-image', 'none', 'important');
        }

        /*
         * Em cada nível, somente o ramo que leva ao article permanece visual.
         * Scripts e recursos não são removidos nem modificados.
         */
        path.forEach((node) => {
            if (node !== article) {
                neutralizeExternalVisualLayer(node);
            }
            hideVisualSiblings(node, path);
        });

        /*
         * O article continua com seu CSS original. Apenas garante que ele seja
         * a camada visual acima do documento externo.
         */
        article.style.setProperty('visibility', 'visible', 'important');
        article.style.setProperty('opacity', '1', 'important');
        article.dataset.modalManagerContent = 'true';

        return article;
    }

    function getContentRect(element) {
        if (!element) {
            return null;
        }

        const rect = element.getBoundingClientRect();

        if (!rect || rect.width <= 0 || rect.height <= 0) {
            return null;
        }

        return {
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height)
        };
    }

    function getArticleViewportOffset(article) {
        if (!article) {
            return { left: 0, top: 0 };
        }

        const rect = article.getBoundingClientRect();

        return {
            left: Math.max(0, Math.floor(rect.left + (article.ownerDocument.defaultView?.scrollX || 0))),
            top: Math.max(0, Math.floor(rect.top + (article.ownerDocument.defaultView?.scrollY || 0)))
        };
    }

    function alignIframeViewportToArticle(article) {
        const iframe = state.currentIframe;

        if (!iframe || !article || !iframe.contentWindow) {
            return;
        }

        const offset = getArticleViewportOffset(article);

        try {
            iframe.contentWindow.scrollTo({
                left: offset.left,
                top: offset.top,
                behavior: 'instant'
            });
        } catch (error) {
            try {
                iframe.contentWindow.scrollTo(offset.left, offset.top);
            } catch (ignored) {
                // O navegador pode não permitir reposicionamento programático.
            }
        }
    }

    function getConfiguredSize(config) {
        const width = parseDimensionToPixels(config.width);
        const height = parseDimensionToPixels(config.height);

        return {
            width: width > 0 ? width : null,
            height: height > 0 ? height : null
        };
    }

    function parseDimensionToPixels(value) {
        if (!value || value === 'auto') {
            return 0;
        }

        const numeric = Number.parseFloat(String(value));

        if (!Number.isFinite(numeric) || numeric <= 0) {
            return 0;
        }

        /*
         * Dimensões explícitas do projeto são em px. Para valores relativos,
         * o browser é usado por meio de uma medição temporária quando possível.
         */
        if (String(value).trim().endsWith('px')) {
            return numeric;
        }

        return 0;
    }

    function clampSize(width, height) {
        const limits = getViewportLimits();

        return {
            width: Math.max(
                1,
                Math.min(Math.ceil(width), limits.maxWidth)
            ),
            height: Math.max(
                1,
                Math.min(Math.ceil(height), limits.maxHeight)
            )
        };
    }

    function applyIframeSize(config, modalDocument) {
        const iframe = state.currentIframe;

        if (!iframe) {
            return;
        }

        const configured = getConfiguredSize(config);
        const root = isolateArticleVisibility(modalDocument, config);
        const contentRect = getContentRect(root);

        let width = configured.width;
        let height = configured.height;

        /*
         * Quando height é "auto", usa exatamente a altura visual do modal.
         * Isso elimina o espaço externo que antes aparecia dentro do iframe.
         */
        if (!height && contentRect) {
            height = contentRect.height;
        }

        /*
         * Quando width não foi configurado, usa a largura real do conteúdo.
         */
        if (!width && contentRect) {
            width = contentRect.width;
        }

        /*
         * Fallback seguro.
         */
        width = width || parseDimensionToPixels(DEFAULT_MODAL_WIDTH);
        height = height || parseDimensionToPixels(DEFAULT_MODAL_HEIGHT);

        const finalSize = clampSize(width, height);

        iframe.style.width = `${finalSize.width}px`;
        iframe.style.height = `${finalSize.height}px`;
        iframe.style.maxWidth = `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`;
        iframe.style.maxHeight = `calc(100vh - ${VIEWPORT_MARGIN * 2}px)`;

        alignIframeViewportToArticle(root);

        /*
         * Se o documento possui uma margem externa pequena, o iframe já foi
         * reduzido ao elemento principal e o fundo do body deixa de participar
         * visualmente da janela do Modal Manager.
         */
        if (contentRect) {
            const widthDifference = Math.abs(finalSize.width - contentRect.width);
            const heightDifference = Math.abs(finalSize.height - contentRect.height);

            iframe.dataset.contentWidth = String(contentRect.width);
            iframe.dataset.contentHeight = String(contentRect.height);
            iframe.dataset.contentWidthDelta = String(widthDifference);
            iframe.dataset.contentHeightDelta = String(heightDifference);
        }

        return finalSize;
    }

    function scheduleIframeResize(config, modalDocument) {
        applyIframeSize(config, modalDocument);

        /*
         * Alguns Pop-Up's ajustam altura/largura depois que fontes e imagens
         * terminam de carregar. Pequenas medições posteriores não alteram o CSS
         * original; apenas redimensionam o elemento iframe externo.
         */
        const delays = [0, 50, 150, 300];

        delays.forEach((delay) => {
            window.setTimeout(() => {
                if (
                    state.currentIframe &&
                    getIframeDocument() === modalDocument
                ) {
                    applyIframeSize(config, modalDocument);
                }
            }, delay);
        });

        if (modalDocument.fonts?.ready) {
            modalDocument.fonts.ready
                .then(() => {
                    if (
                        state.currentIframe &&
                        getIframeDocument() === modalDocument
                    ) {
                        applyIframeSize(config, modalDocument);
                    }
                })
                .catch(() => {
                    // Fontes não disponíveis não impedem o modal de funcionar.
                });
        }
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

    function setupEscHandler() {
        removeEscHandler();

        state.escHandler = (event) => {
            if (event.key === 'Escape') {
                closeModal();
            }
        };

        document.addEventListener('keydown', state.escHandler);
    }

    function setupModalClose(modalDocument) {
        if (!modalDocument) {
            return;
        }

        const closeButtons = modalDocument.querySelectorAll(
            [
                '[aria-label="Fechar modal"]',
                '.modal-close',
                '.icon-button',
                '.botao-fechar'
            ].join(', ')
        );

        closeButtons.forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                closeModal();
            });
        });

        setupEscHandler();

        /*
         * Também escuta Escape dentro do documento interno, pois o foco pode
         * estar completamente dentro do iframe.
         */
        modalDocument.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeModal();
            }
        });
    }

    function closeModal() {
        state.requestId++;
        removeEscHandler();

        const container = document.getElementById(MODAL_CONTAINER_ID);

        if (container) {
            hideContainer(container);
        }

        state.currentModalKey = null;
        resetConfrontosState();
    }

    // ------------------------------------------------------------
    // Carregamento genérico
    // ------------------------------------------------------------

    function renderModal(config, modalKey, setup) {
        const requestId = ++state.requestId;
        const container = getOrCreateContainer();

        hideContainer(container);
        prepareContainer(container);

        state.currentModalKey = modalKey;

        const iframe = createIframe(config);
        state.currentIframe = iframe;

        container.appendChild(iframe);
        showContainer(container);

        iframe.addEventListener(
            'load',
            () => {
                if (
                    requestId !== state.requestId ||
                    iframe !== state.currentIframe
                ) {
                    return;
                }

                const modalDocument = getIframeDocument();

                if (!modalDocument) {
                    console.error(
                        '[ModalManager] Documento interno do iframe não disponível.'
                    );
                    return;
                }

                /*
                 * O HTML interno é preservado integralmente.
                 * Nenhuma regra CSS é copiada para o documento principal.
                 */
                setupModalClose(modalDocument);

                scheduleIframeResize(config, modalDocument);

                if (typeof setup === 'function') {
                    setup(modalDocument, iframe);
                }

                /*
                 * Uma segunda medição acontece depois da configuração do fluxo,
                 * porque os handlers podem alterar o conteúdo visível.
                 */
                window.setTimeout(() => {
                    if (
                        requestId === state.requestId &&
                        iframe === state.currentIframe
                    ) {
                        applyIframeSize(config, modalDocument);
                    }
                }, 0);

                container.dispatchEvent(
                    new CustomEvent('modalOpened', {
                        detail: {
                            type: modalKey,
                            config
                        }
                    })
                );
            },
            { once: true }
        );

        iframe.addEventListener(
            'error',
            () => {
                if (requestId !== state.requestId) {
                    return;
                }

                console.error(
                    `[ModalManager] Erro ao carregar o modal: ${config.html}`
                );

                closeModal();
            },
            { once: true }
        );
    }

    function openSimpleModal(config, modalKey) {
        renderModal(config, modalKey || 'simple', null);
    }

    // ------------------------------------------------------------
    // Fluxo de Confrontos
    // ------------------------------------------------------------

    function openConfrontosParte1() {
        renderModal(
            confrontosFlow.parte1,
            'confrontos-parte-1',
            (modalDocument) => {
                setupConfrontosClick(modalDocument);
            }
        );
    }

    function setupConfrontosClick(modalDocument) {
        const confrontos = modalDocument.querySelectorAll('.confronto');

        confrontos.forEach((confronto, index) => {
            confronto.style.cursor = 'pointer';

            confronto.addEventListener('click', () => {
                const jogador1El = confronto.querySelector(
                    '.jogador-esquerda, .jogador'
                );

                const jogador2El = confronto.querySelector(
                    '.jogador-direita, .jogador:not(.jogador-esquerda)'
                );

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

    function openConfrontosParte2() {
        renderModal(
            confrontosFlow.parte2,
            'confrontos-parte-2',
            (modalDocument) => {
                setupSetsButtons(modalDocument);
            }
        );
    }

    function setupSetsButtons(modalDocument) {
        const btn3Sets = modalDocument.querySelector('.btn-3-sets');
        const btn5Sets = modalDocument.querySelector('.btn-5-sets');

        if (btn3Sets) {
            btn3Sets.addEventListener('click', (event) => {
                event.preventDefault();
                state.setsEscolhidos = 3;
                openConfrontosParte3();
            });
        }

        if (btn5Sets) {
            btn5Sets.addEventListener('click', (event) => {
                event.preventDefault();
                state.setsEscolhidos = 5;
                openConfrontosParte3();
            });
        }
    }

    function openConfrontosParte3() {
        renderModal(
            confrontosFlow.parte3,
            'confrontos-parte-3',
            (modalDocument) => {
                setupJogadores(modalDocument);
                setupSetsFields(modalDocument);
                setupEnviarResultado(modalDocument);
            }
        );
    }

    function setupJogadores(modalDocument) {
        const jogador1El = modalDocument.querySelector(
            '.jogador-1, [data-jogador="1"]'
        );

        const jogador2El = modalDocument.querySelector(
            '.jogador-2, [data-jogador="2"]'
        );

        if (jogador1El && state.confrontoSelecionado) {
            jogador1El.textContent = state.confrontoSelecionado.jogador1;
        }

        if (jogador2El && state.confrontoSelecionado) {
            jogador2El.textContent = state.confrontoSelecionado.jogador2;
        }

        const colunasJogador = modalDocument.querySelectorAll(
            '.coluna-jogador'
        );

        if (
            colunasJogador.length >= 2 &&
            state.confrontoSelecionado
        ) {
            colunasJogador[0].textContent =
                state.confrontoSelecionado.jogador1;

            colunasJogador[1].textContent =
                state.confrontoSelecionado.jogador2;
        }
    }

    function setupSetsFields(modalDocument) {
        const totalSets = state.setsEscolhidos || 3;

        for (let i = 1; i <= 5; i++) {
            const setLinha = modalDocument.querySelector(
                `.set-linha[data-set="${i}"]`
            );

            if (!setLinha) {
                continue;
            }

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

    function setupEnviarResultado(modalDocument) {
        const btnEnviar = modalDocument.querySelector(
            '.botao-enviar, .btn-enviar'
        );

        if (!btnEnviar) {
            return;
        }

        btnEnviar.addEventListener('click', (event) => {
            event.preventDefault();

            const resultado = collectResultado(modalDocument);

            console.log('Resultado registrado:', resultado);

            alert(
                `Resultado registrado com sucesso!\n\n` +
                `${state.confrontoSelecionado?.jogador1 || ''} × ` +
                `${state.confrontoSelecionado?.jogador2 || ''}\n` +
                `${resultado.placar}`
            );

            resetConfrontosState();
            closeModal();
        });
    }

    function collectResultado(modalDocument) {
        const totalSets = state.setsEscolhidos || 3;
        const sets = [];

        let pontosJogador1 = 0;
        let pontosJogador2 = 0;

        for (let i = 1; i <= totalSets; i++) {
            const input1 = modalDocument.querySelector(
                `.set${i}-jogador1`
            );

            const input2 = modalDocument.querySelector(
                `.set${i}-jogador2`
            );

            const p1 = Number.parseInt(input1?.value, 10) || 0;
            const p2 = Number.parseInt(input2?.value, 10) || 0;

            sets.push({
                set: i,
                jogador1: p1,
                jogador2: p2
            });

            if (p1 > p2) {
                pontosJogador1++;
            }

            if (p2 > p1) {
                pontosJogador2++;
            }
        }

        const jogador1 =
            state.confrontoSelecionado?.jogador1 || '';

        const jogador2 =
            state.confrontoSelecionado?.jogador2 || '';

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
                action: () =>
                    openSimpleModal(
                        modalMapping['btn-descricao'],
                        'descricao'
                    )
            },
            {
                selector: '.action-card:nth-child(2)',
                action: () =>
                    openSimpleModal(
                        modalMapping['btn-inscritos'],
                        'inscritos'
                    )
            },
            {
                selector: '.action-card:nth-child(3)',
                action: () =>
                    openSimpleModal(
                        modalMapping['btn-grupos'],
                        'grupos'
                    )
            },
            {
                selector: '.action-card:nth-child(4)',
                action: () =>
                    openConfrontosParte1()
            },
            {
                selector: '.action-card:nth-child(5)',
                action: () =>
                    openSimpleModal(
                        modalMapping['btn-chaveamento'],
                        'chaveamento'
                    )
            },
            {
                selector: '.action-card:nth-child(6)',
                action: () =>
                    openSimpleModal(
                        modalMapping['btn-resultados'],
                        'resultados'
                    )
            }
        ];

        buttons.forEach(({ selector, action }) => {
            const button = document.querySelector(selector);

            if (!button) {
                return;
            }

            button.addEventListener('click', (event) => {
                event.preventDefault();
                action();
            });
        });
    }

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener(
                'DOMContentLoaded',
                initializeButtons,
                { once: true }
            );
        } else {
            initializeButtons();
        }

        console.log(
            '[ModalManager] v4 inicializado com iframe isolado e enquadramento por conteúdo'
        );
    }

    // API de diagnóstico.
    window.modalManager = {
        openSimpleModal,
        openConfrontosParte1,
        close: closeModal,

        countContainers: () =>
            document.querySelectorAll(
                `#${MODAL_CONTAINER_ID}`
            ).length,

        countIframes: () =>
            document.querySelectorAll(
                `#${MODAL_CONTAINER_ID} iframe`
            ).length,

        getContainer: () =>
            document.getElementById(
                MODAL_CONTAINER_ID
            ),

        getIframe: () =>
            state.currentIframe,

        getIframeDocument,

        getContentRoot: () => {
            const iframeDocument = getIframeDocument();

            if (!iframeDocument) {
                return null;
            }

            const configMap = {
                descricao: modalMapping['btn-descricao'],
                inscritos: modalMapping['btn-inscritos'],
                grupos: modalMapping['btn-grupos'],
                chaveamento: modalMapping['btn-chaveamento'],
                resultados: modalMapping['btn-resultados'],
                'confrontos-parte-1': confrontosFlow.parte1,
                'confrontos-parte-2': confrontosFlow.parte2,
                'confrontos-parte-3': confrontosFlow.parte3
            };

            const config = configMap[state.currentModalKey] || null;

            return config
                ? findContentRoot(iframeDocument, config)
                : null;
        },

        getState: () => ({
            ...state
        })
    };

    init();
})();
