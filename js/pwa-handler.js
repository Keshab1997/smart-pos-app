// pwa-handler.js - Smart PWA Update System

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

// Smart Service Worker Registration with Update Detection
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('Service Worker registered successfully');
            
            // আপডেট চেক করা
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                console.log('New service worker found!');
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // নতুন আপডেট পাওয়া গেছে!
                        console.log('New update available!');
                        showUpdateToast(reg);
                    }
                });
            });
            
            // প্রতি ঘন্টায় আপডেট চেক করা
            setInterval(() => {
                reg.update();
            }, 60 * 60 * 1000); // 1 hour
            
        }).catch(err => {
            console.error('Service Worker registration failed:', err);
        });
    });
}

// আপডেট টোস্ট দেখানো
function showUpdateToast(registration) {
    // একটি টোস্ট এলিমেন্ট তৈরি করা
    const toast = document.createElement('div');
    toast.innerHTML = `
        <div id="pwa-update-toast" style="position: fixed; bottom: 20px; right: 20px; background: linear-gradient(135deg, #4361ee 0%, #3f37c9 100%); color: white; padding: 18px 25px; border-radius: 12px; box-shadow: 0 8px 25px rgba(67, 97, 238, 0.4); z-index: 10000; display: flex; align-items: center; gap: 15px; animation: slideIn 0.5s ease-out; max-width: 400px;">
            <div style="flex: 1;">
                <div style="font-weight: 700; font-size: 15px; margin-bottom: 4px;">🚀 New Update Available!</div>
                <div style="font-size: 12px; opacity: 0.9;">Click to update and get the latest features</div>
            </div>
            <button id="btn-update-now" style="background: white; color: #4361ee; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 13px; transition: all 0.2s; white-space: nowrap;">
                Update Now
            </button>
            <button id="btn-dismiss-toast" style="background: transparent; color: white; border: none; cursor: pointer; font-size: 20px; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; opacity: 0.7; transition: opacity 0.2s;">
                ×
            </button>
        </div>
        <style>
            @keyframes slideIn { 
                from { transform: translateX(100%); opacity: 0; } 
                to { transform: translateX(0); opacity: 1; } 
            }
            @keyframes slideOut { 
                from { transform: translateX(0); opacity: 1; } 
                to { transform: translateX(100%); opacity: 0; } 
            }
            #btn-update-now:hover {
                transform: scale(1.05);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }
            #btn-dismiss-toast:hover {
                opacity: 1;
            }
        </style>
    `;
    document.body.appendChild(toast);

    // আপডেট বাটনে ক্লিক করলে
    document.getElementById('btn-update-now').addEventListener('click', () => {
        if (registration.waiting) {
            // সার্ভিস ওয়ার্কারকে নতুন ভার্সনে যেতে বলা
            registration.waiting.postMessage('SKIP_WAITING');
        }
        // পেজ রিলোড করা
        window.location.reload();
    });
    
    // ডিসমিস বাটনে ক্লিক করলে
    document.getElementById('btn-dismiss-toast').addEventListener('click', () => {
        const toastElement = document.getElementById('pwa-update-toast');
        if (toastElement) {
            toastElement.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => toastElement.remove(), 300);
        }
    });
    
    // অটো ডিসমিস (30 সেকেন্ড পর)
    setTimeout(() => {
        const toastElement = document.getElementById('pwa-update-toast');
        if (toastElement) {
            toastElement.style.opacity = '0';
            setTimeout(() => toastElement.remove(), 500);
        }
    }, 30000);
}

// নোটিফিকেশন পারমিশন রিকোয়েস্ট ফাংশন
window.requestNotificationPermission = async function() {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            return true;
        }
    }
    return false;
};

// ইয়ুজারকে নোটিফাই করার ফাংশন
window.notifyUser = function(title, body, icon = 'https://cdn-icons-png.flaticon.com/512/4964/4964387.png') {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: icon,
            badge: icon,
            vibrate: [200, 100, 200]
        });
    }
};
