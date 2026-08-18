// Modal Manager Controller
// Arquitetura: página principal + container único + modal
// NÃO criar múltiplos containers, NÃO recarregar página, NÃO alterar design original

// Estado do fluxo de Confrontos
const confrontoState = {
  selectedMatch: null,
  setCount: 3, // padrão 3 sets
  currentStep: "list" // list | sets | result
};

// Elementos principais
const modalContainer = document.getElementById("modal-container");
if (!modalContainer) {
  console.error("Modal container not found");
  // Fallback para criação única em caso de erro
  const existing = document.querySelector("#modal-container");
  if (!existing) {
    const container = document.createElement("div");
    container.id = "modal-container";
    document.body.appendChild(container);
  }
}

// Função para abrir modal simples
function openSimpleModal(modalHtmlPath, modalCssPath, data = {}) {
  // Carregar HTML dinamicamente com cache
  fetch(modalHtmlPath)
    .then(r => r.text())
    .then(html => {
      // Carregar CSS se necessário
      if (modalCssPath && !document.querySelector(`link[href*="${modalCssPath}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = modalCssPath;
        document.head.appendChild(link);
      }

      // Inserir no container existente
      modalContainer.innerHTML = "";
      modalContainer.appendChild(
        document.createRange().createContextualFragment(html)
      );

      // Injetar dados personalizados
      if (Object.keys(data).length) {
        const modalContent = modalContainer.querySelector(".modal-confrontos");
        if (modalContent) {
          Object.entries(data).forEach(([key, value]) => {
            const el = modalContent.querySelector(`[data-${key}]`);
            if (el) el.textContent = value;
          });
        }
      }

      modalContainer.classList.add("active");
      modalContainer.style.display = "block";

      const firstFocusable = modalContainer.querySelector("button, select, input");
      if (firstFocusable) firstFocusable.focus();

      const closeHandler = (e) => {
        if (e.key === "Escape" || (e.type === "click" &&
          (e.target.closest(".modal-close") || e.target.closest(".botao-fechar")))) {
          closeModal();
        }
      };

      document.addEventListener("keydown", closeHandler);
      modalContainer._closeHandler = closeHandler;
    })
    .catch(err => console.error("Failed to load modal HTML:", err));
}

// Função para abrir modal de Confrontos (fluxo especial)
function openMatchModal(matchData) {
  const modalPath = "Pop-Up's/4 - Confrontos/Parte 1/modalConfrontos.html";
  const cssPath = "Pop-Up's/4 - Confrontos/Parte 1/modalConfrontos.css";

  openSimpleModal(modalPath, cssPath, {
    "jogador1": matchData.player1 || "",
    "jogador2": matchData.player2 || "",
    "mesa": matchData.table || "",
    "hora": matchData.time || ""
  });

  confrontoState.selectedMatch = matchData;
  confrontoState.currentStep = "list";
}

// Função para abrir etapa de escolha de sets
function openSetsModal() {
  const modalPath = "Pop-Up's/4 - Confrontos/Parte 2/modalEscolhaSets.html";
  const cssPath = "Pop-Up's/4 - Confrontos/Parte 2/modalEscolhaSets.css";

  openSimpleModal(modalPath, cssPath);
  confrontoState.currentStep = "sets";
}

// Função para abrir modal de resultado
function openResultModal() {
  const modalPath = "Pop-Up's/4 - Confrontos/Parte 3/modalRegistroResultado.html";
  const cssPath = "Pop-Up's/4 - Confrontos/Parte 3/modalRegistroResultado.css";

  openSimpleModal(modalPath, cssPath);
  confrontoState.currentStep = "result";

  const modalContent = modalContainer.querySelector(".modal-registro");
  if (modalContent) {
    const setsToShow = confrontoState.setCount;
    for (let i = 1; i <= 5; i++) {
      const setRow = modalContent.querySelector(`.set-${i}`);
      const inputs = setRow?.querySelectorAll("input");
      if (setRow && inputs) {
        if (i <= setsToShow) {
          setRow.style.display = "block";
          inputs.forEach(inp => inp.disabled = false);
        } else {
          setRow.style.display = "none";
          inputs.forEach(inp => inp.disabled = true);
        }
      }
    }
  }
}

// Função para fechar modal
function closeModal() {
  if (!modalContainer) return;

  const handler = modalContainer._closeHandler;
  if (handler) {
    document.removeEventListener("keydown", handler);
    delete modalContainer._closeHandler;
  }

  modalContainer.innerHTML = "";
  modalContainer.classList.remove("active");
  modalContainer.style.display = "none";

  if (confrontoState.currentStep === "result") {
    confrontoState.currentStep = "list";
  }
}

// Conexão com botões do Modal Manager
function initModalConnections() {
  const simpleButtons = document.querySelectorAll(".action-card");
  simpleButtons.forEach(btn => {
    const modalType = btn.dataset.modal;
    if (!modalType) return;

    btn.addEventListener("click", () => {
      const modalMap = {
        "descricao": "Pop-Up's/1 - Descrição/modalDescricao.html",
        "inscritos": "Pop-Up's/2 - Inscritos/modalListaInscritos.html",
        "pontuacao": "Pop-Up's/3 - Pontuação/modalGruposPontuacoes.html",
        "chaveamento": "Pop-Up's/5 - Chaveamento/modalChaveamento.html",
        "podio": "Pop-Up's/6 - Pódio/modalResultadosFinais.html"
      };

      const htmlPath = modalMap[modalType];
      const cssPath = htmlPath?.replace(".html", ".css");

      if (htmlPath) {
        openSimpleModal(htmlPath, cssPath);
      }
    });
  });

  const matchButtons = document.querySelectorAll(".abrirModal");
  matchButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const j1 = btn.dataset.j1 || "";
      const j2 = btn.dataset.j2 || "";
      const mesa = btn.dataset.mesa || "";
      const hora = btn.dataset.hora || "";

      const matchData = { player1: j1, player2: j2, table: mesa, time: hora };
      openMatchModal(matchData);
    });
  });

  const saveBtn = document.querySelector(".salvar");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      if (confrontoState.currentStep === "sets") {
        const selectedRadio = document.querySelector("input[name='sets']:checked");
        if (selectedRadio) {
          confrontoState.setCount = parseInt(selectedRadio.value);
          openResultModal();
        }
      } else if (confrontoState.currentStep === "result") {
        const inputs = document.querySelectorAll(".set input");
        const setsData = [];

        inputs.forEach((input, idx) => {
          if (idx % 2 === 0) {
            const setIndex = Math.floor(idx / 2) + 1;
            const j1Val = inputs[idx].value;
            const j2Val = inputs[idx + 1].value;
            setsData.push({ set: setIndex, j1: j1Val, j2: j2Val });
          }
        });

        console.log("Dados salvos:", setsData);
        closeModal();
      }
    });
  }

  const modalCloseBtns = document.querySelectorAll(".modal-close, .botao-fechar");
  modalCloseBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      closeModal();
    });
  });
}

// Inicialização
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initModalConnections);
} else {
  initModalConnections();
}

// Expor funções globais para depuração
window.openModal = openSimpleModal;
window.closeModal = closeModal;
window.setMatchCount = (count) => { confrontoState.setCount = count; };