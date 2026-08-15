/**
 * Modal Manager - Integração dos modais de Campeonatos
 * Conecta o Modal Manager aos modais existentes e implementa o fluxo de Confrontos
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURAÇÃO E MAPEAMENTO
    // ============================================

    // Mapeamento de botões para modais (Tipo A - Interação simples)
    const modalMapping = {
        'btn-descricao': {
            html: 'Pop-Up\'s/1 - Descrição/modalDescricao.html',
            css: 'Pop-Up\'s/1 - Descrição/modalDescricao.css',
            containerId: 'modal-container'
        },
        'btn-inscritos': {
            html: 'Pop-Up\'s/2 - Inscritos/modalListaInscritos.html',
            css: 'Pop-Up\'s/2 - Inscritos/modalListaInscritos.css',
            containerId: 'modal-container'
        },
        'btn-grupos': {
            html: 'Pop-Up\'s/3 - Pontuação/modalGruposPontuacoes.html',
            css: 'Pop-Up\'s/3 - Pontuação/modalGruposPontuacoes.css',
            containerId: 'modal-container'
        },
        'btn-chaveamento': {
            html: 'Pop-Up\'s/5 - Chaveamento/modalChaveamento.html',
            css: 'Pop-Up\'s/5 - Chaveamento/modalChaveamento.css',
            containerId: 'modal-container'
        },
        'btn-resultados': {
            html: 'Pop-Up\'s/6 - Pódio/modalResultadosFinais.html',
            css: 'Pop-Up\'s/6 - Pódio/modalResultadosFinais.css',
            containerId: 'modal-container'
        }
    };

    // Configuração do fluxo de Confrontos (Tipo B - Fluxo especial)
    const confrontosFlow = {
        parte1: {
            html: 'Pop-Up\'s/4 - Confrontos/Parte 1/modalConfrontos.html',
            css: 'Pop-Up\'s/4 - Confrontos/Parte 1/modalConfrontos.css'
        },
        parte2: {
            html: 'Pop-Up\'s/4 - Confrontos/Parte 2/modalEscolhaSets.html',
            css: 'Pop-Up\'s/4 - Confrontos/Parte 2/modalEscolhaSets.css'
        },
        parte3: {
            html: 'Pop-Up\'s/4 - Confrontos/Parte 3/modalRegistroResultado.html',
            css: 'Pop-Up\'s/4 - Confrontos/Parte 3/modalRegistroResultado.css'
        }
    };

    // Estado da aplicação
    let state = {
        confrontoSelecionado: null,
       SetsEscolhidos: null,
        loadedStyles: new Set()
    };

    // ============================================
    // UTILITÁRIOS
    // ============================================

    /**
     * Carrega um arquivo CSS dinamicamente
     * Usa uma abordagem mais simples: carrega o CSS original e adiciona isolamento
     */
    function loadCSS(href) {
        return new Promise((resolve, reject) => {
            // Verifica se já foi carregado
            const existingLink = document.querySelector(`link[data-modal-css="${href}"]`);
            if (existingLink) {
                console.log(`[ModalManager] CSS já carregado: ${href}`);
                resolve();
                return;
            }

            console.log(`[ModalManager] Carregando CSS: ${href}`);

            // Cria um link para o CSS original
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.dataset.modalCss = href;

            link.onload = () => {
                console.log(`[ModalManager] CSS carregado com sucesso: ${href}`);
                resolve();
            };

            link.onerror = (error) => {
                console.error(`[ModalManager] Erro ao carregar CSS ${href}:`, error);
                reject(new Error(`Erro ao carregar ${href}`));
            };

            document.head.appendChild(link);
        });
    }

    /**
     * Aplica o CSS de isolamento para proteger o Modal Manager
     * Este CSS inverte as regras globais que os modais usam
     */
    function applyIsolationCSS() {
        // Verifica se já foi aplicado
        if (document.getElementById('modal-isolation-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'modal-isolation-style';
        style.textContent = `
            /* Restaura o layout do body e html da página principal */
            body {
                margin: 0 !important;
                padding: 0 !important;
                min-height: auto !important;
                display: block !important;
                background: var(--surface) !important;
            }
            html {
                margin: 0 !important;
                padding: 0 !important;
            }
            /* Define o layout grid da página principal */
            .layout {
                display: grid !important;
                grid-template-columns: clamp(202px, 16.5vw, 224px) 1fr !important;
                min-height: 100vh !important;
            }
            /* Restaura a sidebar */
            .sidebar {
                display: grid !important;
            }
            /* Restaura o main */
            .main {
                display: grid !important;
                grid-template-rows: auto 1fr !important;
                min-height: 0 !important;
            }
            /* Restaura o content */
            .content {
                display: grid !important;
                gap: 18px !important;
                align-content: start !important;
                min-height: 0 !important;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Remove o CSS de isolamento quando não há modais abertos
     */
    function removeIsolationCSS() {
        const style = document.getElementById('modal-isolation-style');
        if (style) {
            style.remove();
        }
    }

    /**
     * Escopa o CSS para aplicar apenas dentro do container do modal
     * Adiciona o seletor #modal-container como ancestor para todos os seletores
     */
    function scopeCSSToModal(css) {
        if (!css || !css.trim()) return '';

        // Preserva todos os comentários para não perdê-los
        let comments = [];
        let processed = css.replace(/\/\*[\s\S]*?\*\//g, (match) => {
            comments.push(match);
            return `__COMMENT_${comments.length - 1}__`;
        });

        // Divide o CSS em regras usando uma abordagem mais simples
        // Primeiro, separa as @rules do resto
        const result = [];

        // Regex para encontrar @rules completas (ate o fecha chave correspondente)
        const atRuleRegex = /(@[a-z-]+[^{]*\{[\s\S]*?\})/g;
        const parts = processed.split(atRuleRegex);

        let match;
        const atRules = [];

        // Encontra todas as @rules
        while ((match = atRuleRegex.exec(processed)) !== null) {
            atRules.push(match[0]);
        }

        // Processa cada parte
        let atRuleIndex = 0;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];

            if (part.trim().startsWith('@')) {
                // É uma @rule - adiciona como está
                result.push(part);
            } else {
                // É CSS normal - escopa
                result.push(scopeSimpleRules(part));
            }
        }

        let finalCSS = result.join('');

        // Restaura os comentários
        for (let i = 0; i < comments.length; i++) {
            finalCSS = finalCSS.replace(`__COMMENT_${i}__`, comments[i]);
        }

        return finalCSS;
    }

    /**
     * Escopa regras CSS simples (não @rules)
     */
    function scopeSimpleRules(css) {
        if (!css || !css.trim()) return css;

        const result = [];

        // Divide em regras olhando para as chaves
        let braceLevel = 0;
        let ruleStart = 0;

        for (let i = 0; i < css.length; i++) {
            const char = css[i];

            if (char === '{') {
                if (braceLevel === 0) ruleStart = i;
                braceLevel++;
            } else if (char === '}') {
                braceLevel--;
                if (braceLevel === 0 && ruleStart >= 0) {
                    const rule = css.substring(ruleStart, i + 1);
                    result.push(scopeSingleRule(rule));
                    ruleStart = -1;
                }
            }
        }

        return result.join('');
    }

    /**
     * Escopa uma única regra CSS
     */
    function scopeSingleRule(rule) {
        rule = rule.trim();
        if (!rule) return rule;

        // Separa o seletor do conteúdo
        const firstBrace = rule.indexOf('{');
        if (firstBrace === -1) return rule;

        const selector = rule.substring(0, firstBrace).trim();
        const content = rule.substring(firstBrace);

        // Se já tem nosso escopo, retorna como está
        if (selector.includes('#modal-container')) {
            return rule;
        }

        // Escopa o seletor
        const scopedSelector = scopeSelector(selector);

        return scopedSelector + content;
    }

    /**
     * Escopa um seletor CSS adicionando #modal-container como ancestor
     * Também trata o caso especial de 'body' que não existe dentro do container
     */
    function scopeSelector(selector) {
        // Divide múltiplos seletores (separados por vírgula)
        const parts = selector.split(',');

        const scopedParts = parts.map(part => {
            let sel = part.trim();
            if (!sel) return sel;

            // Não escopa se já tem nosso seletor
            if (sel.includes('#modal-container')) {
                return sel;
            }

            // TRATAMENTO ESPECIAL para seletores globais:
            // Os modais usam body {}, html {}, * {} para resets e contexto visual
            // Como não existe <body> ou <html> dentro do container, precisamos mapear

            // Para 'body' - mapeia para o container
            if (sel === 'body' || sel === 'html' || sel === 'body, html' || sel === 'html, body') {
                return '#modal-container';
            }

            // Para 'html, body, ...' com outros elementos
            // Precisamos separar e tratar cada um
            if ((sel.includes('html') || sel.includes('body')) && sel.includes(',')) {
                const subParts = sel.split(',').map(s => {
                    const sTrimmed = s.trim();
                    if (sTrimmed === 'html' || sTrimmed === 'body') {
                        return '#modal-container';
                    }
                    return `#modal-container ${sTrimmed}`;
                });
                return subParts.join(', ');
            }

            // Para todos os outros seletores, adiciona o escopo
            return `#modal-container ${sel}`;
        });

        return scopedParts.join(', ');
    }

    /**
     * Carrega um HTML via fetch
     */
    async function loadHTML(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro ao carregar ${url}: ${response.status}`);
        }
        return await response.text();
    }

    /**
     * Cria o container de modal se não existir
     * Fornece o contexto visual que os modais esperam (flexbox centralizado)
     */
    function getOrCreateContainer() {
        let container = document.getElementById('modal-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'modal-container';

            // Estilos básicos para o container de modal
            // Fornece o contexto visual que os modais esperam (antes era body {})
            container.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                display: none;
                justify-content: center;
                align-items: center;
                z-index: 10000;
                background: rgba(0, 0, 0, 0.6);
                padding: 18px;
                box-sizing: border-box;
            `;

            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * Configura o fechamento do modal
     */
    function setupModalClose(modalElement) {
        const closeButtons = modalElement.querySelectorAll('.modal-close, .icon-button, .botao-fechar, .primary-button, .modal-button, .modal-action');

        closeButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeModal();
            });
        });

        // Fecha ao clicar no overlay
        const overlay = modalElement.closest('.modal-overlay, .modal-stage');
        if (overlay) {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeModal();
                }
            });
        }

        // Fecha com ESC
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }

    /**
     * Fecha o modal atual
     */
    function closeModal() {
        const container = getOrCreateContainer();
        container.innerHTML = '';
        container.style.display = 'none';
    }

    /**
     * Abre um modal simples (Tipo A)
     */
    async function openSimpleModal(config) {
        const container = getOrCreateContainer();

        try {
            // Aplica isolamento para proteger o Modal Manager
            applyIsolationCSS();

            // Carrega CSS
            await loadCSS(config.css);

            // Carrega HTML
            const html = await loadHTML(config.html);
            container.innerHTML = html;
            container.style.display = 'flex';

            // Configura fechamento
            const modal = container.querySelector('article, section');
            if (modal) {
                setupModalClose(modal);
            }

            // Dispara evento de sucesso
            container.dispatchEvent(new CustomEvent('modalOpened', { detail: { type: 'simple', config } }));

        } catch (error) {
            console.error('Erro ao abrir modal:', error);
            container.innerHTML = `<div class="modal-error"><p>Erro ao carregar o modal.</p><p>${error.message}</p></div>`;
            container.style.display = 'flex';
        }
    }

    // ============================================
    // FLUXO DE CONFRONTOS (TIPO B)
    // ============================================

    /**
     * Abre a Parte 1 - Lista de Confrontos
     */
    async function openConfrontosParte1() {
        const container = getOrCreateContainer();

        try {
            // Aplica isolamento para proteger o Modal Manager
            applyIsolationCSS();

            await loadCSS(confrontosFlow.parte1.css);
            const html = await loadHTML(confrontosFlow.parte1.html);
            container.innerHTML = html;
            container.style.display = 'flex';

            // Configura cliques nos confrontos
            setupConfrontosClick();

            // Configura fechamento
            const modal = container.querySelector('article');
            if (modal) {
                setupModalClose(modal);
            }

        } catch (error) {
            console.error('Erro ao carregar confrontos:', error);
        }
    }

    /**
     * Configura cliques nos confrontos da Parte 1
     */
    function setupConfrontosClick() {
        const container = getOrCreateContainer();
        const confrontos = container.querySelectorAll('.confronto');

        confrontos.forEach((confronto, index) => {
            confronto.style.cursor = 'pointer';
            confronto.addEventListener('click', () => {
                // Extrai informações dos jogadores
                const jogador1 = confronto.querySelector('.jogador-esquerda, .jogador').textContent.trim();
                const jogador2 = confronto.querySelector('.jogador-direita, .jogador:not(.jogador-esquerda)').textContent.trim();

                // Remove a classe 'vencedor' do texto se existir
                const nomeJogador1 = jogador1.replace(/✓/g, '').trim();
                const nomeJogador2 = jogador2.replace(/✓/g, '').trim();

                state.confrontoSelecionado = {
                    index: index,
                    jogador1: nomeJogador1,
                    jogador2: nomeJogador2
                };

                // Abre Parte 2
                openConfrontosParte2();
            });
        });
    }

    /**
     * Abre a Parte 2 - Escolha de Sets
     */
    async function openConfrontosParte2() {
        const container = getOrCreateContainer();

        try {
            // Aplica isolamento para proteger o Modal Manager
            applyIsolationCSS();

            await loadCSS(confrontosFlow.parte2.css);
            const html = await loadHTML(confrontosFlow.parte2.html);
            container.innerHTML = html;
            container.style.display = 'flex';

            // Configura botões de escolha de sets
            setupSetsButtons();

            // Configura fechamento (fecha todo o fluxo)
            const modal = container.querySelector('article');
            if (modal) {
                const closeBtn = modal.querySelector('.modal-close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        resetConfrontosState();
                        closeModal();
                    });
                }
            }

        } catch (error) {
            console.error('Erro ao carregar escolha de sets:', error);
        }
    }

    /**
     * Configura botões de escolha de sets
     */
    function setupSetsButtons() {
        const container = getOrCreateContainer();
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

    /**
     * Abre a Parte 3 - Registro de Resultado
     */
    async function openConfrontosParte3() {
        const container = getOrCreateContainer();

        try {
            // Aplica isolamento para proteger o Modal Manager
            applyIsolationCSS();

            await loadCSS(confrontosFlow.parte3.css);
            const html = await loadHTML(confrontosFlow.parte3.html);
            container.innerHTML = html;
            container.style.display = 'flex';

            // Configura nomes dos jogadores
            setupJogadores();

            // Configura campos de sets conforme escolha
            setupSetsFields();

            // Configura envio do resultado
            setupEnviarResultado();

            // Configura fechamento
            const modal = container.querySelector('article');
            if (modal) {
                const closeBtn = modal.querySelector('.modal-close');
                if (closeBtn) {
                    closeBtn.addEventListener('click', () => {
                        resetConfrontosState();
                        closeModal();
                    });
                }
            }

        } catch (error) {
            console.error('Erro ao carregar registro de resultado:', error);
        }
    }

    /**
     * Configura nomes dos jogadores no formulário
     */
    function setupJogadores() {
        const container = getOrCreateContainer();

        // Atualiza nomes dos jogadores na área de confronto
        const jogador1El = container.querySelector('.jogador-1, [data-jogador="1"]');
        const jogador2El = container.querySelector('.jogador-2, [data-jogador="2"]');

        if (jogador1El && state.confrontoSelecionado) {
            jogador1El.textContent = state.confrontoSelecionado.jogador1;
        }
        if (jogador2El && state.confrontoSelecionado) {
            jogador2El.textContent = state.confrontoSelecionado.jogador2;
        }

        // Atualiza cabeçalhos das colunas
        const colunasJogador = container.querySelectorAll('.coluna-jogador');
        if (colunasJogador.length >= 2 && state.confrontoSelecionado) {
            colunasJogador[0].textContent = state.confrontoSelecionado.jogador1;
            colunasJogador[1].textContent = state.confrontoSelecionado.jogador2;
        }
    }

    /**
     * Configura campos de sets (3 ou 5)
     */
    function setupSetsFields() {
        const container = getOrCreateContainer();
        const totalSets = state.setsEscolhidos || 3;

        // Configura cada set
        for (let i = 1; i <= 5; i++) {
            const setLinha = container.querySelector(`.set-linha[data-set="${i}"]`);
            if (!setLinha) continue;

            if (i <= totalSets) {
                // Habilita o set
                setLinha.classList.remove('set-linha-desativada');
                const inputs = setLinha.querySelectorAll('input');
                inputs.forEach(input => {
                    input.disabled = false;
                    input.removeAttribute('disabled');
                });
            } else {
                // Desabilita o set
                setLinha.classList.add('set-linha-desativada');
                const inputs = setLinha.querySelectorAll('input');
                inputs.forEach(input => {
                    input.disabled = true;
                    input.setAttribute('disabled', 'disabled');
                    input.value = '';
                });
            }
        }
    }

    /**
     * Configura botão de enviar resultado
     */
    function setupEnviarResultado() {
        const container = getOrCreateContainer();
        const btnEnviar = container.querySelector('.botao-enviar, .btn-enviar');

        if (btnEnviar) {
            btnEnviar.addEventListener('click', () => {
                // Coleta os dados do formulário
                const resultado = collectResultado();

                console.log('Resultado registrado:', resultado);

                // Feedback visual
                alert(`Resultado registrado com sucesso!\n\n${state.confrontoSelecionado.jogador1} × ${state.confrontoSelecionado.jogador2}\n${resultado.placar}`);

                // Reseta estado e fecha
                resetConfrontosState();
                closeModal();
            });
        }
    }

    /**
     * Coleta dados do resultado
     */
    function collectResultado() {
        const container = getOrCreateContainer();
        const totalSets = state.setsEscolhidos || 3;

        const sets = [];
        let pontosJogador1 = 0;
        let pontosJogador2 = 0;

        for (let i = 1; i <= totalSets; i++) {
            const input1 = container.querySelector(`.set${i}-jogador1`);
            const input2 = container.querySelector(`.set${i}-jogador2`);

            const p1 = parseInt(input1?.value) || 0;
            const p2 = parseInt(input2?.value) || 0;

            sets.push({ set: i, jogador1: p1, jogador2: p2 });

            if (p1 > p2) pontosJogador1++;
            else if (p2 > p1) pontosJogador2++;
        }

        return {
            confronto: state.confrontoSelecionado,
            totalSets: totalSets,
            sets: sets,
            placar: `${pontosJogador1} × ${pontosJogador2}`,
            vencedor: pontosJogador1 > pontosJogador2 ? state.confrontoSelecionado.jogador1 :
                      pontosJogador2 > pontosJogador1 ? state.confrontoSelecionado.jogador2 : 'Empate'
        };
    }

    /**
     * Reseta o estado do fluxo de confrontos
     */
    function resetConfrontosState() {
        state.confrontoSelecionado = null;
        state.setsEscolhidos = null;
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================

    /**
     * Mapeia os botões do Modal Manager
     */
    function initializeButtons() {
        // Botões de interação simples
        const btnDescricao = document.querySelector('.action-card:nth-child(1)');
        const btnInscritos = document.querySelector('.action-card:nth-child(2)');
        const btnGrupos = document.querySelector('.action-card:nth-child(3)');
        const btnConfrontos = document.querySelector('.action-card:nth-child(4)');
        const btnChaveamento = document.querySelector('.action-card:nth-child(5)');
        const btnResultados = document.querySelector('.action-card:nth-child(6)');

        if (btnDescricao) {
            btnDescricao.addEventListener('click', () => openSimpleModal(modalMapping['btn-descricao']));
        }

        if (btnInscritos) {
            btnInscritos.addEventListener('click', () => openSimpleModal(modalMapping['btn-inscritos']));
        }

        if (btnGrupos) {
            btnGrupos.addEventListener('click', () => openSimpleModal(modalMapping['btn-grupos']));
        }

        if (btnConfrontos) {
            btnConfrontos.addEventListener('click', () => openConfrontosParte1());
        }

        if (btnChaveamento) {
            btnChaveamento.addEventListener('click', () => openSimpleModal(modalMapping['btn-chaveamento']));
        }

        if (btnResultados) {
            btnResultados.addEventListener('click', () => openSimpleModal(modalMapping['btn-resultados']));
        }
    }

    /**
     * Inicializa o Modal Manager
     */
    function init() {
        // Aguarda DOM estar pronto
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeButtons);
        } else {
            initializeButtons();
        }

        console.log('Modal Manager inicializado');
    }

    // Inicia
    init();

})();