// Modal Manager Integration
// Integrates action-card buttons with actual modals without modifying existing files

(function() {
  "use strict";

  // Configuration — paths relative to current page
  const CONFIG = {
    modalContainerId: "modal-container",
    modalSelector: ".modal",
    closeSelector: ".modal-close",
    backdropSelector: ".modal-stage",
    // Modal mappings
    modalMap: {
      "Descrição": {
        html: "./Pop-Up's/1 - Descrição/modalDescricao.html",
        css: "./Pop-Up's/1 - Descrição/modalDescricao.css"
      },
      "Inscritos": {
        html: "./Pop-Up's/2 - Inscritos/modalListaInscritos.html",
        css: "./Pop-Up's/2 - Inscritos/modalListaInscritos.css"
      },
      "Grupos": {
        html: "./Pop-Up's/3 - Pontuação/modalGruposPontuacoes.html",
        css: "./Pop-Up's/3 - Pontuação/modalGruposPontuacoes.css"
      },
      "Confrontos": {
        html: "./Pop-Up's/4 - Confrontos/Parte 1/modalConfrontos.html",
        css: "./Pop-Up's/4 - Confrontos/Parte 1/modalConfrontos.css"
      },
      "Chaveamento": {
        html: "./Pop-Up's/5 - Chaveamento/modalChaveamento.html",
        css: "./Pop-Up's/5 - Chaveamento/modalChaveamento.css"
      },
      "Resultados Finais": {
        html: "./Pop-Up's/6 - Pódio/modalResultadosFinais.html",
        css: "./Pop-Up's/6 - Pódio/modalResultadosFinais.css"
      }
    },
    // Confrontos flow steps
    confrontosSteps: [
      { html: "./Pop-Up's/4 - Confrontos/Parte 1/modalConfrontos.html", css: "./Pop-Up's/4 - Confrontos/Parte 1/modalConfrontos.css" },
      { html: "./Pop-Up's/4 - Confrontos/Parte 2/modalEscolhaSets.html", css: "./Pop-Up's/4 - Confrontos/Parte 2/modalEscolhaSets.css" },
      { html: "./Pop-Up's/4 - Confrontos/Parte 3/modalRegistroResultado.html", css: "./Pop-Up's/4 - Confrontos/Parte 3/modalRegistroResultado.css" }
    ]
  };

  // State management
  let currentModalType = null;
  let confrontosState = {
    selectedMatch: null,
    setCount: null,
    currentStep: 0
  };

  // Helper: ensure container exists
  function ensureContainer() {
    let container = document.getElementById(CONFIG.modalContainerId);
    if (!container) {
      container = document.createElement("div");
      container.id = CONFIG.modalContainerId;
      container.className = "modal-container";
      document.body.appendChild(container);
    }
    return container;
  }

  // Helper: inject CSS if not already present
  function ensureCSS(cssPath) {
    const link = document.querySelector(`link[href*="${cssPath}"]`);
    if (!link) {
      const newLink = document.createElement("link");
      newLink.rel = "stylesheet";
      newLink.href = cssPath;
      document.head.appendChild(newLink);
    }
  }

  // Helper: load modal HTML into container
  async function loadModal(htmlPath, cssPath) {
    const container = ensureContainer();
    container.innerHTML = ""; // Clear previous content

    try {
      const response = await fetch(htmlPath);
      if (!response.ok) throw new Error(`Failed to load ${htmlPath}`);
      const htmlContent = await response.text();

      // Create absolute base URL for resolving relative paths
      const modalUrl = new URL(htmlPath, window.location.href);
      modalUrl.pathname = modalUrl.pathname.substring(0, modalUrl.pathname.lastIndexOf('/') + 1);
      const base = modalUrl.href;

      // Function to resolve relative URLs
      function resolveUrl(url) {
        // If already absolute or protocol-relative, return as is
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
          return url;
        }
        // Resolve relative to base
        return new URL(url, base).href;
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, "text/html");

      // Process all elements with src, href, or style attributes
      const elements = doc.querySelectorAll('[src], [href], [style]');
      elements.forEach(el => {
        // Handle src attribute
        if (el.hasAttribute('src')) {
          const originalUrl = el.getAttribute('src');
          if (originalUrl) {
            const resolvedUrl = resolveUrl(originalUrl);
            if (resolvedUrl !== originalUrl) {
              el.setAttribute('src', resolvedUrl);
            }
          }
        }
        // Handle href attribute
        if (el.hasAttribute('href')) {
          const originalUrl = el.getAttribute('href');
          if (originalUrl) {
            const resolvedUrl = resolveUrl(originalUrl);
            if (resolvedUrl !== originalUrl) {
              el.setAttribute('href', resolvedUrl);
            }
          }
        }
        // Handle style attribute for background-image
        if (el.hasAttribute('style')) {
          const style = el.getAttribute('style');
          const matches = style.match(/background-image:\s*url\(([^)]+)\)/gi);
          if (matches) {
            matches.forEach(match => {
              // Extract URL from url(...)
              const originalUrl = match.replace(/background-image:\s*url\(([^)]+)\)/i, '$1').trim();
              if (originalUrl && !originalUrl.startsWith('http')) {
                const resolvedUrl = resolveUrl(originalUrl);
                if (resolvedUrl !== originalUrl) {
                  const newStyle = style.replace(match, `background-image: url(${resolvedUrl})`);
                  el.setAttribute('style', newStyle);
                }
              }
            });
          }
        }
      });

      // Find the modal element
      const modalElement = doc.querySelector(CONFIG.modalSelector);
      if (!modalElement) throw new Error("Modal element not found in HTML");

      // Clone modal with its original styling
      const clonedModal = modalElement.cloneNode(true);

      // Ensure backdrop exists in container
      let backdrop = container.querySelector(CONFIG.backdropSelector);
      if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.className = "modal-stage";
        container.appendChild(backdrop);
      }

      // Clear backdrop and insert cloned modal
      backdrop.innerHTML = "";
      backdrop.appendChild(clonedModal);

      // Load CSS for this modal
      ensureCSS(cssPath);

      // Wire up close functionality
      setupCloseListeners(clonedModal);

      // Show modal
      requestAnimationFrame(() => {
        clonedModal.style.display = "block";
        clonedModal.classList.add("active");
      });

      return clonedModal;
    } catch (error) {
      console.error("Error loading modal:", error);
      return null;
    }
  }

  // Helper: setup close listeners for a modal
  function setupCloseListeners(modalElement) {
    const closeButtons = modalElement.querySelectorAll(CONFIG.closeSelector);
    closeButtons.forEach(btn => {
      btn.removeEventListener("click", closeHandler);
      btn.addEventListener("click", closeHandler);
    });

    // Click outside modal
    const backdrop = modalElement.closest(CONFIG.backdropSelector);
    if (backdrop) {
      backdrop.removeEventListener("click", outsideClickHandler);
      backdrop.addEventListener("click", outsideClickHandler);
    }

    // ESC key
    document.removeEventListener("keydown", escHandler);
    document.addEventListener("keydown", escHandler);
  }

  // Close handlers
  function closeHandler(event) {
    const modal = event.target.closest(CONFIG.modalSelector) || event.target.closest(CONFIG.backdropSelector);
    if (modal) {
      modal.style.display = "none";
      modal.classList.remove("active");
      // Clean up state
      if (currentModalType === "Confrontos") {
        resetConfrontosState();
      }
      // Remove listeners
      const closeButtons = modal.querySelectorAll(CONFIG.closeSelector);
      closeButtons.forEach(btn => {
        btn.removeEventListener("click", closeHandler);
      });
      const backdrop = modal.closest(CONFIG.backdropSelector);
      if (backdrop) {
        backdrop.removeEventListener("click", outsideClickHandler);
      }
      document.removeEventListener("keydown", escHandler);
    }
  }

  function outsideClickHandler(event) {
    if (event.target === event.target.closest(CONFIG.backdropSelector)) {
      closeHandler(event);
    }
  }

  function escHandler(event) {
    if (event.key === "Escape") {
      closeHandler(event);
    }
  }

  // Reset confrontos state
  function resetConfrontosState() {
    confrontosState = {
      selectedMatch: null,
      setCount: null,
      currentStep: 0
    };
  }

  // Confrontos flow: handle selection in first modal
  function handleConfrontosSelection(event) {
    const matchElement = event.target.closest(".confronto");
    if (!matchElement) return;

    // Extract match data
    const jogadorEsquerda = matchElement.querySelector(".jogador-esquerda")?.textContent || "";
    const jogadorDireita = matchElement.querySelector(".jogador-direita")?.textContent || "";
    const rodada = matchElement.closest(".rodada")?.dataset.rodada || "1";

    confrontosState.selectedMatch = {
      jogadores: [jogadorEsquerda, jogadorDireita],
      rodada: rodada
    };

    // Transition to step 2 (choose sets)
    loadConfrontosStep(1);
  }

  // Load next step in confrontos flow
  function loadConfrontosStep(stepIndex) {
    const step = CONFIG.confrontosSteps[stepIndex];
    if (!step) return;

    loadModal(step.html, step.css).then(modal => {
      if (!modal) return;

      if (stepIndex === 0) {
        // Step 1: list of matches — attach selection listeners
        const matches = modal.querySelectorAll(".confronto");
        matches.forEach(match => {
          match.removeEventListener("click", handleConfrontosSelection);
          match.addEventListener("click", handleConfrontosSelection);
        });
      } else if (stepIndex === 1) {
        // Step 2: choose sets — attach set selection listeners
        const setButtons = modal.querySelectorAll(".botao-set");
        setButtons.forEach(btn => {
          btn.removeEventListener("click", handleSetSelection);
          btn.addEventListener("click", handleSetSelection);
        });
      } else if (stepIndex === 2) {
        // Step 3: result registration — setup form state
        setupResultadoForm(modal);
      }
    });
  }

  // Handle set selection in step 2
  function handleSetSelection(event) {
    const button = event.target.closest(".botao-set");
    if (!button) return;

    const setCount = button.textContent.trim() === "3 SETS" ? 3 : 5;
    confrontosState.setCount = setCount;
    confrontosState.currentStep = 2;

    // Transition to step 3
    loadConfrontosStep(2);
  }

  // Setup form state in resultado modal based on set count
  function setupResultadoForm(modal) {
    const inputs = modal.querySelectorAll("input[type='number']");
    const setsCount = confrontosState.setCount || 3;

    inputs.forEach((input, index) => {
      const setNumber = Math.floor(index / 2) + 1;
      const playerIndex = index % 2 === 0 ? 0 : 1;
      const playerName = confrontosState.selectedMatch?.jogadores[playerIndex] || "";

      // Update labels with player names
      const label = input.closest(".campo")?.querySelector(".jogador-nome") || input.parentElement;
      if (label) {
        label.textContent = playerName;
      }

      // Show/hide sets based on count
      const isActiveSet = setNumber <= setsCount;
      const parentField = input.closest(".campo") || input.parentElement.parentElement;
      if (parentField) {
        parentField.style.display = isActiveSet ? "block" : "none";
      }

      // Disable/enable inputs
      input.disabled = !isActiveSet;
      input.value = ""; // Reset input
    });
  }

  // Initialize modal manager
  function init() {
    // Find all action-card buttons
    const buttons = document.querySelectorAll(".action-card");
    buttons.forEach(button => {
      const h4 = button.querySelector("h4");
      if (!h4) return;

      const buttonLabel = h4.textContent.trim();
      const modalConfig = CONFIG.modalMap[buttonLabel];
      if (!modalConfig) return;

      // Remove existing listeners to avoid duplicates
      button.removeEventListener("click", buttonClickHandler);
      button.addEventListener("click", buttonClickHandler);
    });
  }

  // Main button click handler
  function buttonClickHandler(event) {
    const button = event.target.closest(".action-card");
    if (!button) return;

    const h4 = button.querySelector("h4");
    const buttonLabel = h4?.textContent.trim();
    if (!buttonLabel) return;

    const modalConfig = CONFIG.modalMap[buttonLabel];
    if (!modalConfig) return;

    currentModalType = buttonLabel;

    if (buttonLabel === "Confrontos") {
      // Start confrontos flow from step 0
      loadConfrontosStep(0);
    } else {
      // Simple modal load
      loadModal(modalConfig.html, modalConfig.css);
    }
  }

  // Public API for external use if needed
  window.modalManager = {
    close: closeHandler,
    init: init
  };

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();