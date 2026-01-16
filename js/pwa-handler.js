window.deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPrompt = e;
    
    const navInstallBtn = document.getElementById('pwa-install-nav');
    if (navInstallBtn) {
        navInstallBtn.style.display = 'block';
    }
});

window.addEventListener('appinstalled', () => {
    window.deferredPrompt = null;
    const navInstallBtn = document.getElementById('pwa-install-nav');
    if (navInstallBtn) navInstallBtn.style.display = 'none';
});
