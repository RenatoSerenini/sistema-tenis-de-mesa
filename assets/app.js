document.querySelectorAll('[data-confirm]').forEach((element) => {
    element.addEventListener('click', (event) => {
        const message = element.getAttribute('data-confirm') || 'Confirma esta ação?';
        if (!window.confirm(message)) {
            event.preventDefault();
        }
    });
});
