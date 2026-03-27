// toast.js - Toastify Wrapper for Beautiful Notifications

class ToastNotification {
    constructor() {
        // Default configuration
        this.defaultConfig = {
            duration: 4000,
            gravity: "top",
            position: "right",
            stopOnFocus: true,
            close: true,
            style: {
                borderRadius: "10px",
                fontFamily: "'Poppins', sans-serif",
                fontSize: "14px",
                padding: "16px 20px",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)"
            }
        };
    }

    show(type, title, message, duration = 4000) {
        const colors = {
            success: {
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                icon: "✓"
            },
            error: {
                background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                icon: "✕"
            },
            warning: {
                background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                icon: "⚠"
            },
            info: {
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                icon: "ℹ"
            }
        };

        const config = colors[type] || colors.info;
        const displayText = message ? `<strong>${title}</strong><br>${message}` : `<strong>${title}</strong>`;

        Toastify({
            text: displayText,
            duration: duration,
            gravity: this.defaultConfig.gravity,
            position: this.defaultConfig.position,
            stopOnFocus: this.defaultConfig.stopOnFocus,
            close: this.defaultConfig.close,
            style: {
                ...this.defaultConfig.style,
                background: config.background
            },
            escapeMarkup: false,
            onClick: function(){} // Callback after click
        }).showToast();
    }

    // Shorthand methods
    success(title, message, duration) {
        return this.show('success', title, message, duration);
    }

    error(title, message, duration) {
        return this.show('error', title, message, duration);
    }

    warning(title, message, duration) {
        return this.show('warning', title, message, duration);
    }

    info(title, message, duration) {
        return this.show('info', title, message, duration);
    }
}

// Create global instance
window.toast = new ToastNotification();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ToastNotification;
}
