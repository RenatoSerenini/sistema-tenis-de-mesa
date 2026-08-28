// Debug script to investigate modal closing issue
(function() {
  // Store original methods to wrap them
  const originalCloseHandler = window.modalManager?.close;

  // Override closeHandler to add debugging
  if (originalCloseHandler) {
    window.modalManager.close = function(event) {
      console.log('[DEBUG] closeHandler called');
      console.log('[DEBUG] Event target:', event.target);

      // Call original handler
      const result = originalCloseHandler.call(this, event);

      // Check state after closing
      setTimeout(() => {
        console.log('[DEBUG] After closeHandler execution:');
        console.log('[DEBUG] currentModalType:', window.modalManager.currentModalType);

        // Check container state
        const container = document.getElementById('modal-container');
        if (container) {
          console.log('[DEBUG] Container style:', {
            display: container.style.display,
            pointerEvents: container.style.pointerEvents,
            opacity: container.style.opacity,
            visibility: container.style.visibility
          });

          // Check backdrop
          const backdrop = container.querySelector('.modal-stage');
          if (backdrop) {
            console.log('[DEBUG] Backdrop style:', {
              display: backdrop.style.display,
              pointerEvents: backdrop.style.pointerEvents,
              opacity: backdrop.style.opacity,
              visibility: backdrop.style.visibility
            });
          }
        }

        // Check if action cards still have listeners
        const buttons = document.querySelectorAll('.action-card');
        buttons.forEach((btn, index) => {
          const h4 = btn.querySelector('h4');
          if (h4) {
            console.log(`[DEBUG] Button ${index} (${h4.textContent.trim()}):`, {
              hasListeners: btn.hasAttribute('onclick') || btn.getAttribute('onclick') !== null,
              // Check for event listeners (this is approximate)
              onclick: btn.onclick
            });
          }
        });
      }, 100);

      return result;
    };
  }

  // Also add a global click listener to see what's getting clicks
  document.addEventListener('click', function(e) {
    // Only log clicks on action cards or near them
    if (e.target.classList.contains('action-card') ||
        e.target.closest('.action-card') ||
        (e.target.tagName === 'H4' && e.target.parentElement.classList.contains('action-card'))) {
      console.log('[DEBUG] Action card clicked:', {
        target: e.target,
        targetTag: e.target.tagName,
        targetClass: e.target.className,
        clientX: e.clientX,
        clientY: e.clientY
      });

      // Check what element is at this position
      const elementAtPoint = document.elementFromPoint(e.clientX, e.clientY);
      console.log('[DEBUG] Element at click point:', {
        tag: elementAtPoint.tagName,
        class: elementAtPoint.className,
        id: elementAtPoint.id,
        pointerEvents: getComputedStyle(elementAtPoint).pointerEvents,
        zIndex: getComputedStyle(elementAtPoint).zIndex,
        display: getComputedStyle(elementAtPoint).display,
        visibility: getComputedStyle(elementAtPoint).visibility,
        opacity: getComputedStyle(elementAtPoint).opacity
      });
    }
  }, true); // Use capture phase to see if something is preventing propagation

  console.log('[DEBUG] Debug modal script loaded');
})();