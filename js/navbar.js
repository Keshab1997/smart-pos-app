import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 1. মেনুর তালিকা
const menuItems = [
    { name: 'Dashboard', link: 'dashboard.html', icon: '🏠' },
    { name: 'Billing', link: 'billing/billing.html', icon: '🧾' },
    { name: 'Inventory', link: 'inventory/inventory.html', icon: '📦' },
    { name: 'Add Product', link: 'add-product/add-product.html', icon: '➕' },
    { name: 'Purchase Record', link: 'purchase-record/purchase-dashboard.html', icon: '🛒' },
    { name: 'Sales Report', link: 'sales-report/report.html', icon: '📊' },
    { name: 'Profit/Loss', link: 'sales-report/profit-loss.html', icon: '📈' },
    { name: 'Expense', link: 'expense/expense.html', icon: '💸' },
    { name: 'Advance Booking', link: 'advance-booking/index.html', icon: '📅' },
    { name: 'Barcode Print', link: 'label-printer/index.html', icon: '🖨️' },
    { name: 'Shop Details', link: 'shop-details/shop-details.html', icon: '🏪' },
    { name: 'Admin Panel', link: 'admin.html', icon: '⚙️', id: 'nav-item-admin' }
];

// 2. সঠিক পাথ বের করার ফাংশন
function getCorrectPath(targetPath) {
    const currentPath = window.location.pathname;
    
    if (currentPath.includes('/purchase-record/') || 
        currentPath.includes('/billing/') || 
        currentPath.includes('/inventory/') ||
        currentPath.includes('/sales-report/') ||
        currentPath.includes('/expense/') ||
        currentPath.includes('/add-product/') ||
        currentPath.includes('/shop-details/') ||
        currentPath.includes('/advance-booking/') ||
        currentPath.includes('/label-printer/')) {
            
        return '../' + targetPath;
    }
    
    return targetPath;
}

// 3. HTML তৈরি এবং ইনজেক্ট করা
function loadNavbar() {
    const navContainer = document.getElementById('navbar-placeholder');
    if (!navContainer) return;

    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

    let menuHTML = '';
    menuItems.forEach(item => {
        const itemFileName = item.link.split('/').pop();
        const isActive = itemFileName === currentPage ? 'active' : '';
        const idAttr = item.id ? `id="${item.id}"` : '';
        const finalLink = getCorrectPath(item.link);
        
        menuHTML += `
            <li ${idAttr}>
                <a href="${finalLink}" class="${isActive}">
                    <span style="margin-right: 10px;">${item.icon}</span> ${item.name}
                </a>
            </li>
        `;
    });

    const dashboardLink = getCorrectPath('dashboard.html');

    // অ্যাডমিন মডাল HTML
    const adminModalHTML = `
        <div id="admin-modal" class="admin-modal-overlay" style="display:none;">
            <div class="admin-modal-content">
                <div class="admin-modal-header">
                    <h3 style="margin:0; color:#d32f2f;">👮‍♂️ Admin Control</h3>
                    <button id="close-admin-modal" class="admin-close-btn">&times;</button>
                </div>
                
                <div class="admin-section">
                    <h4 style="margin-top:0;">💾 Backup & Restore</h4>
                    <button id="btn-backup-now" class="btn" style="width:100%; background:#4361ee; color:white; padding:8px; border:none; border-radius:4px; cursor:pointer; margin-bottom:5px;">
                        📥 Download Full Backup
                    </button>
                    <p id="backup-progress" style="font-size:12px; color:#666; margin:5px 0;">Ready.</p>
                    
                    <div style="margin-top:10px; border-top:1px dashed #ccc; padding-top:10px;">
                        <input type="file" id="file-restore-json" accept=".json" style="display:none;">
                        <button onclick="document.getElementById('file-restore-json').click()" class="btn" style="width:100%; background:#dc3545; color:white; padding:8px; border:none; border-radius:4px; cursor:pointer;">
                            📤 Restore Database
                        </button>
                    </div>
                </div>

                <div class="admin-section">
                    <h4 style="margin-top:0;">📢 System Announcement</h4>
                    <textarea id="admin-announcement-text" placeholder="Enter message for all users..." style="width:100%; height:60px; padding:5px; border-radius:4px; border:1px solid #ccc;"></textarea>
                    <button id="btn-save-announcement" class="btn" style="width:100%; background:#ff9f1c; color:white; padding:8px; border:none; border-radius:4px; cursor:pointer; margin-top:5px;">
                        Post Announcement
                    </button>
                </div>

                <div class="admin-section">
                    <h4 style="margin-top:0;">👥 User Management</h4>
                    <button id="btn-load-users" class="btn" style="width:100%; background:#0d6efd; color:white; padding:8px; border:none; border-radius:4px; cursor:pointer;">
                        Show All Users
                    </button>
                    <div id="user-list-container" style="margin-top:10px; max-height:150px; overflow-y:auto; font-size:12px; border:1px solid #eee; padding:5px;">
                        Click button to load...
                    </div>
                </div>
            </div>
        </div>
    `;

    const navbarHTML = `
        <div class="top-navbar">
            <div class="nav-brand">
                <button id="toggle-sidebar" class="hamburger-btn" aria-label="Toggle Menu">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
                <a href="${dashboardLink}" class="logo">Smart POS</a>
            </div>
        </div>

        <div id="sidebar-overlay" class="sidebar-overlay"></div>
        
        <aside id="sidebar-menu" class="sidebar-menu">
            <div class="sidebar-header">
                <h3>Menu</h3>
                <button id="close-sidebar" class="close-btn">&times;</button>
            </div>
            
            <ul class="sidebar-links">
                ${menuHTML}
            </ul>

            <div class="sidebar-footer">
                <button id="global-logout-btn" class="logout-btn">
                    <span>🚪</span> Logout
                </button>
            </div>
        </aside>
        
        ${adminModalHTML}
    `;

    navContainer.innerHTML = navbarHTML;
    setupNavbarEvents();
}

// 4. ইভেন্ট লিসেনার সেটআপ
function setupNavbarEvents() {
    const body = document.body;
    const toggleBtn = document.getElementById('toggle-sidebar');
    const closeBtn = document.getElementById('close-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const logoutBtn = document.getElementById('global-logout-btn');

    function toggleMenu() {
        body.classList.toggle('sidebar-open');
    }

    if(toggleBtn) toggleBtn.addEventListener('click', toggleMenu);
    if(closeBtn) closeBtn.addEventListener('click', toggleMenu);
    if(overlay) overlay.addEventListener('click', toggleMenu);

    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
             const event = new Event('trigger-logout');
             document.dispatchEvent(event);
        });
    }

    // অ্যাডমিন মডাল ক্লোজ বাটন
    const adminModal = document.getElementById('admin-modal');
    const closeAdminModal = document.getElementById('close-admin-modal');
    
    if (closeAdminModal) {
        closeAdminModal.addEventListener('click', () => {
            if (adminModal) adminModal.style.display = 'none';
        });
    }
}

// DOM লোড হওয়ার পর নেভবার লোড করা
document.addEventListener('DOMContentLoaded', loadNavbar);

// 5. অথেনটিকেশন লজিক
onAuthStateChanged(auth, (user) => {
    const adminBtn = document.getElementById('nav-item-admin');
    const ADMIN_EMAIL = "keshabsarkar2018@gmail.com";

    if (user && user.email === ADMIN_EMAIL) {
        if (adminBtn) adminBtn.style.display = 'block';
    } else {
        if (adminBtn) adminBtn.style.display = 'none';
    }
});

// 6. কিবোর্ড শর্টকাট লজিক (Universal Fix for Mac & Windows)
document.addEventListener('keydown', (e) => {
    // ডিবাগিং-এর জন্য: কনসোলে দেখাবে আপনি কী চাপছেন
    // console.log(`Pressed: ${e.code}, Alt: ${e.altKey}, Ctrl: ${e.ctrlKey}`);

    // শুধুমাত্র Alt কি চাপা হলে (Mac এ Option Key)
    if (e.altKey) {
        let targetPage = "";

        // e.key এর বদলে e.code ব্যবহার করা হচ্ছে যাতে Mac এ সমস্যা না হয়
        switch (e.code) {
            case 'KeyD': targetPage = 'dashboard.html'; break;
            case 'KeyB': targetPage = 'billing/billing.html'; break;
            case 'KeyI': targetPage = 'inventory/inventory.html'; break;
            case 'KeyS': targetPage = 'sales-report/report.html'; break;
            case 'KeyE': targetPage = 'expense/expense.html'; break;
            case 'KeyP': targetPage = 'sales-report/profit-loss.html'; break;
        }

        if (targetPage) {
            e.preventDefault(); // ব্রাউজারের ডিফল্ট অ্যাকশন বন্ধ করা
            const finalPath = getCorrectPath(targetPage);
            console.log("🚀 Shortcut Triggered! Going to: " + finalPath);
            window.location.href = finalPath;
        }
    }

    // Escape বাটন চাপলে মডাল বা সাইডবার বন্ধ হবে
    if (e.code === 'Escape') {
        // সাইডবার বন্ধ করা
        document.body.classList.remove('sidebar-open');

        // অ্যাডমিন মডাল বন্ধ করা
        const adminModal = document.getElementById('admin-modal');
        if (adminModal) adminModal.style.display = 'none';
        
        // অন্যান্য মডাল বন্ধ করা
        document.querySelectorAll('.modal-overlay, .modal').forEach(m => m.classList.add('hidden'));
    }
});