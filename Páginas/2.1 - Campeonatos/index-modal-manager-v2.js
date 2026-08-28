/**
 * Modal Manager - Integração dos modais de Campeonatos
 *
 * Arquitetura:
 * - Um único #modal-container.
 * - Cada Pop-Up é carregado no seu próprio iframe.
 * - O iframe aponta diretamente para o HTML original do Pop-Up.
 * - CSS, fontes, imagens, animações e caminhos relativos permanecem intactos.
 * - Nenhum CSS dos Pop-Up's é injetado ou alterado na página principal.
 */

(function () {
    'use strict';

    const MODAL_CONTAINER_ID = 'modal-container';
    const MODAL_IFRAME_CLASS = 'modal-manager-iframe';

    const modalMapping = {
        'btn-descricao': { html: "Pop-Up's/1 - Descrição/modalDescricao.html" },
        'btn-inscritos': { html: "Pop-Up's/2 - Inscritos/modalListaInscritos.html" },
        'btn-grupos': { html: "Pop-Up's/3 - Pontuação/modalGruposPontuacoes.html" },
        'btn-chaveamento': { html: "Pop-Up's/5 - Chaveamento/modalChaveamento.html" },
        'btn-resultados': { html: "Pop-Up's/6 - Pódio/modalResultadosFinais.html" }
    };

    const confrontosFlow = {
        parte1: { html: "Pop-Up's/4 - Confrontos/Parte 1/modalConfrontos.html" },
        parte2: { html: "Pop-Up's/4 - Confrontos/Parte 2/modalEscolhaSets.html" },
        parte3: { html: "Pop-Up's/4 - Confrontos/Parte 3/modalRegistroResultado.html" }
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
            padding: '18px',
            boxSizing: 'border-box',
            overflow: 'hidden',
            pointerEvents: 'none'
        });

        container.setAttribute('aria-hidden', 'true');
    }

    function showContainer(container) {
        prepareContainer(container);
        container.style.display = 'block';
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
        if (!container) return;

        destroyIframe();
        container.replaceChildren();
        container.style.display = 'none';
        container.style.pointerEvents = 'none';
        container.setAttribute('aria-hidden', 'true');
    }

    // ------------------------------------------------------------
    // Iframe
    // ------------------------------------------------------------

    function createIframe(htmlPath) {
        const iframe = document.createElement('iframe');

        iframe.className = MODAL_IFRAME_CLASS;
        iframe.src = htmlPath;

        // Sem sandbox: os HTMLs fazem parte do mesmo projeto e o Modal Manager
        // precisa interagir com o documento interno durante o fluxo de Confrontos.
        iframe.setAttribute('title', 'Modal');
        iframe.setAttribute('frameborder', '0');

        Object.assign(iframe.style, {
            position: 'absolute',
            inset: '0',
            width: '100%',
            height: '100%',
            border: '0',
            display: 'block',
            background: 'transparent'
        });

        return iframe;
    }

    function getIframeDocument() {
        const iframe = state.currentIframe;
        if (!iframe) return null;

        try {
            return iframe.contentDocument || iframe.contentWindow?.document || null;
        } catch (error) {
            console.error('[ModalManager] Não foi possível acessar o documento do iframe:', error);
            return null;
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
        if (!modalDocument) return;

        const closeButtons = modalDocument.querySelectorAll(
            '[aria-label="Fechar modal"], .modal-close, .icon-button, .botao-fechar'
        );

        closeButtons.forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                closeModal();
            });
        });

        setupEscHandler();
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

        const iframe = createIframe(config.html);
        state.currentIframe = iframe;
        container.appendChild(iframe);
        showContainer(container);

        iframe.addEventListener('load', () => {
            if (requestId !== state.requestId || iframe !== state.currentIframe) {
                return;
            }

            const modalDocument = getIframeDocument();

            if (!modalDocument) {
                console.error('[ModalManager] Documento interno do iframe não disponível.');
                return;
            }

            setupModalClose(modalDocument);

            // Fecha pelo Escape também quando o foco está dentro do iframe.
            modalDocument.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                    closeModal();
                }
            });

            if (typeof setup === 'function') {
                setup(modalDocument, iframe);
            }

            container.dispatchEvent(
                new CustomEvent('modalOpened', {
                    detail: { type: modalKey, config }
                })
            );
        }, { once: true });

        iframe.addEventListener('error', () => {
            if (requestId !== state.requestId) return;

            console.error(`[ModalManager] Erro ao carregar o modal: ${config.html}`);
            closeModal();
        }, { once: true });
    }

    function openSimpleModal(config) {
        renderModal(config, 'simple', null);
    }

    // ------------------------------------------------------------
    // Fluxo de Confrontos
    // ------------------------------------------------------------

    function openConfrontosParte1() {
        renderModal(confrontosFlow.parte1, 'confrontos-parte-1', (modalDocument) => {
            setupConfrontosClick(modalDocument);
        });
    }

    function setupConfrontosClick(modalDocument) {
        const confrontos = modalDocument.querySelectorAll('.confronto');

        confrontos.forEach((confronto, index) => {
            confronto.style.cursor = 'pointer';

            confronto.addEventListener('click', () => {
                const jogador1El = confronto.querySelector('.jogador-esquerda, .jogador');
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
        renderModal(confrontosFlow.parte2, 'confrontos-parte-2', (modalDocument) => {
            setupSetsButtons(modalDocument);
        });
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
        renderModal(confrontosFlow.parte3, 'confrontos-parte-3', (modalDocument) => {
            setupJogadores(modalDocument);
            setupSetsFields(modalDocument);
            setupEnviarResultado(modalDocument);
        });
    }

    function setupJogadores(modalDocument) {
        const jogador1El = modalDocument.querySelector('.jogador-1, [data-jogador="1"]');
        const jogador2El = modalDocument.querySelector('.jogador-2, [data-jogador="2"]');

        if (jogador1El && state.confrontoSelecionado) {
            jogador1El.textContent = state.confrontoSelecionado.jogador1;
        }

        if (jogador2El && state.confrontoSelecionado) {
            jogador2El.textContent = state.confrontoSelecionado.jogador2;
        }

        const colunasJogador = modalDocument.querySelectorAll('.coluna-jogador');

        if (colunasJogador.length >= 2 && state.confrontoSelecionado) {
            colunasJogador[0].textContent = state.confrontoSelecionado.jogador1;
            colunasJogador[1].textContent = state.confrontoSelecionado.jogador2;
        }
    }

    function setupSetsFields(modalDocument) {
        const totalSets = state.setsEscolhidos || 3;

        for (let i = 1; i <= 5; i++) {
            const setLinha = modalDocument.querySelector(`.set-linha[data-set="${i}"]`);
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

    function setupEnviarResultado(modalDocument) {
        const btnEnviar = modalDocument.querySelector('.botao-enviar, .btn-enviar');

        if (!btnEnviar) return;

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
            const input1 = modalDocument.querySelector(`.set${i}-jogador1`);
            const input2 = modalDocument.querySelector(`.set${i}-jogador2`);

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

        console.log('[ModalManager] inicializado com iframe isolado');
    }

    // API de diagnóstico.
    window.modalManager = {
        openSimpleModal,
        openConfrontosParte1,
        close: closeModal,
        countContainers: () => document.querySelectorAll(`#${MODAL_CONTAINER_ID}`).length,
        countIframes: () => document.querySelectorAll(`#${MODAL_CONTAINER_ID} iframe`).length,
        getContainer: () => document.getElementById(MODAL_CONTAINER_ID),
        getIframe: () => state.currentIframe,
        getState: () => ({ ...state })
    };

    init();
})();
