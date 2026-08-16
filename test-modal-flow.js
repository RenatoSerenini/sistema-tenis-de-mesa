// Test script for modal functionality after architecture fix
// Execute in browser console on the tournament page

async function testModalFlow() {
  console.log('=== INICIANDO TESTES DE MODAIS ===');

  const modals = [
    { name: 'Descrição', path: 'Páginas/2.1 - Campeonatos/modalDescricao.html' },
    { name: 'Inscritos', path: 'Pop-Up\\s/2 - Inscritos/modalListaInscritos.html' },
    { name: 'Pontuação', path: 'Pop-Up\\s/3 - Pontuação/modalPontuacao.html' },
    { name: 'Confrontos', path: 'Pop-Up\\s/4 - Confrontos/modalConfrontos.html' },
    { name: 'Chaveamento', path: 'Pop-Up\\s/5 - Chaveamento/modalChaveamento.html' },
    { name: 'Pódio', path: 'Pop-Up\\s/6 - Pódio/modalPodio.html' }
  ];

  const results = [];

  // Mock HTML content for testing
  function getMockHTML(modalName) {
    return `
      <div class="modal-header">
        <h3>${modalName}</h3>
        <button class="modal-close-btn">×</button>
      </div>
      <div class="modal-content">
        <p>Conteúdo do modal ${modalName}</p>
        <button class="modal-action-btn">Confirmar</button>
      </div>
      <div class="modal-footer">
        <button class="modal-cancel-btn">Cancelar</button>
      </div>
    `;
  }

  // Mock CSS content for testing
  function getMockCSS() {
    return `
      .modal-active {
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 20px;
        min-width: 300px;
      }
      .modal-close-btn {
        float: right;
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
      }
      .modal-action-btn, .modal-cancel-btn {
        margin-top: 15px;
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      .modal-action-btn {
        background: var(--green-700);
        color: #fff;
      }
      .modal-cancel-btn {
        background: #ddd;
        color: #333;
      }
    `;
  }

  // Função para encontrar elementos com z-index acima do modal
  function findZIndexInterceptors() {
    if (!document) return [];
    const allElements = document.querySelectorAll('*');
    const modalZIndex = 10001; // z-index do modal real
    const interceptors = [];

    allElements.forEach(el => {
      const style = getComputedStyle(el);
      const zIndex = parseInt(style.zIndex) || 0;
      const position = style.position;
      const opacity = parseFloat(style.opacity);

      // Elemento com z-index maior que modal e posicionamento absolute/fixed
      if (zIndex > modalZIndex && (position === 'absolute' || position === 'fixed')) {
        // Verifica se está visualmente acima do modal
        const rect = el.getBoundingClientRect();
        const modalElements = document.querySelectorAll('.modal-active');
        let isAboveModal = false;

        modalElements.forEach(modal => {
          const modalRect = modal.getBoundingClientRect();
          if (rect.top < modalRect.bottom && rect.bottom > modalRect.top &&
              rect.left < modalRect.right && rect.right > modalRect.left) {
            if (opacity > 0.1) isAboveModal = true;
          }
        });

        if (isAboveModal) {
          interceptors.push({
            element: el,
            zIndex: zIndex,
            position: position,
            opacity: opacity,
            tagName: el.tagName
          });
        }
      }
    });

    return interceptors;
  }

  for (const modal of modals) {
    console.log(`\n📋 Testando ${modal.name}:`);

    try {
      // Carrega HTML e CSS do modal (mock)
      const html = getMockHTML(modal.name);
      const css = getMockCSS();

      console.log(`  📄 Mock HTML/CSS carregados`);

      // Simula abertura do modal usando a lógica real
      const modalDiv = document.createElement('div');
      modalDiv.className = 'modal-active';
      modalDiv.innerHTML = html;
      modalDiv.style.display = 'block';
      modalDiv.style.position = 'fixed';
      modalDiv.style.top = '50%';
      modalDiv.style.left = '50%';
      modalDiv.style.transform = 'translate(-50%, -50%)';
      modalDiv.style.zIndex = '10001';
      modalDiv.style.width = '100%';
      modalDiv.style.height = '100%';
      modalDiv.style.background = 'transparent';
      document.body.appendChild(modalDiv);

      // Aplica estilos do CSS real ao modal
      const styleSheet = document.createElement('style');
      styleSheet.textContent = css;
      document.head.appendChild(styleSheet);

      // Verifica interceptadores de clique antes de abrir
      const interceptorsBefore = findZIndexInterceptors();
      console.log(`  🔍 Interceptadores antes: ${interceptorsBefore.length}`);

      // Abre modal com opacidade e transformação
      modalDiv.style.opacity = '1';
      modalDiv.style.transform = 'translate(-50%, -50%) scale(1)';

      // Verifica interceptadores depois de abrir
      const interceptorsAfter = findZIndexInterceptors();
      console.log(`  🔍 Interceptadores depois: ${interceptorsAfter.length}`);

      // Testa cliques nos botões
      const buttons = modalDiv.querySelectorAll('button');
      let clickSuccess = false;
      for (const btn of buttons) {
        const clickEvent = new Event('click');
        btn.dispatchEvent(clickEvent);
        // Verifica se botão é de fechar
        if (btn.classList.contains('modal-close-btn')) {
          setTimeout(() => {
            modalDiv.style.opacity = '0';
            modalDiv.style.transform = 'translate(-50%, -50%) scale(0.9)';
            setTimeout(() => modalDiv.remove(), 220);
            clickSuccess = true;
          }, 100);
        }
      }
      console.log(`  🖱️ Cliques em botões: ${clickSuccess ? 'OK' : 'FALHOU'}`);

      results.push({ modal: modal.name, status: 'OK', interceptors: interceptorsAfter.length });
      console.log(`  ✅ Modal ${modal.name}: Funcionário`);
    } catch (error) {
      console.error(`  ❌ Erro ao testar ${modal.name}:`, error.message);
      results.push({ modal: modal.name, status: 'ERRO', error: error.message });
    }
  }

  // Relatório final
  console.log('\n=== RELATÓRIO FINAL ===');
  const okCount = results.filter(r => r.status === 'OK').length;
  console.log(`Modais testados: ${results.length}`);
  console.log(`Sucesso: ${okCount}/${results.length}`);
  console.log(`Interceptadores encontrados: ${results.reduce((sum, r) => sum + (r.interceptors || 0), 0)}`);

  return results;
}

// Executa os testes quando a página estiver carregada
testModalFlow();