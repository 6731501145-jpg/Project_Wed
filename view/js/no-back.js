(function () {
    if (window.__foodAppNoBack) return;
    window.__foodAppNoBack = true;

    function lockCurrentPage() {
        try {
            window.history.pushState({ locked: true }, '', window.location.href);
        } catch (error) {
            // Some embedded browsers can reject history writes; ignore and keep the app usable.
        }
    }

    lockCurrentPage();

    window.addEventListener('popstate', () => {
        lockCurrentPage();
    });

    window.addEventListener('pageshow', (event) => {
        if (event.persisted) lockCurrentPage();
    });

    document.addEventListener('DOMContentLoaded', lockCurrentPage);
})();
