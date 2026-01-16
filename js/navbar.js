import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// 1. মেনুর তালিকা (রোল-বেসড পারমিশন সহ)
const menuItems = [
    { name: 'Dashboard', link: 'dashboard.html', icon: '🏠', roles: ['owner', 'manager', 'cashier'] },
    { name: 'Billing', link: 'billing/billing.html', icon: '🧾', roles: ['owner', 'manager', 'cashier'] },
    { name: 'Inventory', link: 'inventory/inventory.html', icon: '📦', roles: ['owner', 'manager'] },
    { name: 'Add Product', link: 'add-product/add-product.html', icon: '➕', roles: ['owner', 'manager'] },
    { name: 'Purchase Record', link: 'purchase-record/purchase-dashboard.html', icon: '🛒', roles: ['owner', 'manager'] },
    { name: 'Sales Report', link: 'sales-report/report.html', icon: '📊', roles: ['owner', 'manager', 'cashier'] },
    { name: 'Profit/Loss', link: 'sales-report/profit-loss.html', icon: '📈', roles: ['owner'] },
    { name: 'Expense', link: 'expense/expense.html', icon: '💸', roles: ['owner', 'manager'] },
    { name: 'Advance Booking', link: 'advance-booking/index.html', icon: '📅', roles: ['owner', 'manager', 'cashier'] },
    { name: 'Barcode Print', link: 'label-printer/index.html', icon: '🖨️', roles: ['owner', 'manager'] },
    { name: 'Staff Manage', link: 'staff-management/index.html', icon: '👥', roles: ['owner'] },
    { name: 'Shop Details', link: 'shop-details/shop-details.html', icon: '🏪', roles: ['owner'] },
    { name: 'Admin Panel', link: 'admin.html', icon: '⚙️', roles: ['owner'], id: 'nav-item-admin' }
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
        currentPath.includes('/staff-management/') ||
        currentPath.includes('/label-printer/')) {
            
        return '../' + targetPath;
    }
    
    return targetPath;
}

// 3. HTML তৈরি এবং ইনজেক্ট করা
function loadNavbar() {
    const navContainer = document.getElementById('navbar-placeholder');
    if (!navContainer) return;

    const userRole = localStorage.getItem('userRole') || 'cashier';
    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

    // রোল অনুযায়ী কালার কোড
    const roleColors = {
        'owner': '#ffc107',
        'manager': '#28a745',
        'cashier': '#17a2b8'
    };

    let menuHTML = '';
    menuItems.forEach(item => {
        // শুধুমাত্র পারমিশন থাকা মেনুগুলো দেখাবে
        if (item.roles && item.roles.includes(userRole)) {
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
        }
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

            <!-- User Profile Section -->
            <div class="user-nav-profile" id="nav-user-details">
                <div class="user-text">
                    <span id="nav-user-name" class="nav-name">Loading...</span>
                    <span class="nav-role" style="background: ${roleColors[userRole] || '#666'}">
                        ${userRole.toUpperCase()}
                    </span>
                </div>
                <img id="nav-user-img" src="https://cdn-icons-png.flaticon.com/512/149/149071.png" class="nav-avatar" alt="User">
            </div>
        </div>

        <div id="sidebar-overlay" class="sidebar-overlay"></div>
        
        <aside id="sidebar-menu" class="sidebar-menu">
            <div class="sidebar-header">
                <h3>Menu</h3>
                <button id="close-sidebar" class="close-btn">&times;</button>
            </div>
            
            <!-- PWA Install Button -->
            <div id="pwa-install-nav" style="display:none; margin: 15px; padding: 12px; background: #4361ee; color: white; text-align: center; border-radius: 8px; font-weight: bold; cursor: pointer;">
                📲 Install Smart POS
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
    updateNavUserInfo();
}

// ইউজার তথ্য ডাইনামিকালি সেট করার ফাংশন
async function updateNavUserInfo() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const nameEl = document.getElementById('nav-user-name');
            const imgEl = document.getElementById('nav-user-img');
            const userRole = localStorage.getItem('userRole');
            const activeShopId = localStorage.getItem('activeShopId');

            if (userRole === 'owner') {
                // মালিকের জন্য গুগল প্রোফাইল ছবি
                if (nameEl) nameEl.textContent = user.displayName || user.email.split('@')[0];
                if (imgEl && user.photoURL) imgEl.src = user.photoURL;
            } else {
                // স্টাফের জন্য ডাটাবেস থেকে ছবি আনা
                try {
                    const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
                    const { db } = await import('./firebase-config.js');
                    const staffDoc = await getDoc(doc(db, 'shops', activeShopId, 'staffs', user.email));
                    if (staffDoc.exists()) {
                        const data = staffDoc.data();
                        if (nameEl) nameEl.textContent = data.name;
                        if (imgEl && data.photoUrl) imgEl.src = data.photoUrl;
                    }
                } catch (e) { console.error("Error fetching staff photo", e); }
            }
        }
    });
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
            if (confirm("Are you sure you want to logout?")) {
                signOut(auth).then(() => {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.href = getCorrectPath('index.html');
                }).catch((error) => {
                    console.error("Logout error", error);
                    alert("Logout failed!");
                });
            }
        });
    }

    // PWA Install Button Handler
    const navInstallBtn = document.getElementById('pwa-install-nav');
    if (navInstallBtn) {
        if (window.deferredPrompt) {
            navInstallBtn.style.display = 'block';
        }
        
        navInstallBtn.onclick = async () => {
            if (window.deferredPrompt) {
                window.deferredPrompt.prompt();
                const { outcome } = await window.deferredPrompt.userChoice;
                console.log(`User response: ${outcome}`);
                window.deferredPrompt = null;
                navInstallBtn.style.display = 'none';
            }
        };
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
document.addEventListener('DOMContentLoaded', () => {
    // প্রথমে একবার লোড করা
    loadNavbar();
});

// 5. অথেনটিকেশন লজিক
onAuthStateChanged(auth, (user) => {
    const ADMIN_EMAIL = "keshabsarkar2018@gmail.com";

    if (user) {
        // যদি অ্যাডমিন লগইন করে, তবে তাকে অটোমেটিক 'owner' রোল দেওয়া
        if (user.email === ADMIN_EMAIL) {
            localStorage.setItem('userRole', 'owner');
            localStorage.setItem('activeShopId', user.uid);
            localStorage.setItem('isStaff', 'false');
        }
        
        // মেনু পুনরায় রেন্ডার করা যাতে সঠিক রোল দিয়ে লোড হয়
        setTimeout(() => {
            loadNavbar();
            
            // অ্যাডমিন বাটন দেখানো/লুকানো
            const adminBtn = document.getElementById('nav-item-admin');
            if (adminBtn) {
                adminBtn.style.display = (user.email === ADMIN_EMAIL) ? 'block' : 'none';
            }
        }, 100);
    }
});

// 6. কিবোর্ড শর্টকাট লজিক (All Menu Items Added)
document.addEventListener('keydown', (e) => {
    // শুধুমাত্র Alt কি চাপা হলে
    if (e.altKey) {
        let targetPage = "";

        switch (e.code) {
            // 🏠 Dashboard
            case 'KeyD': targetPage = 'dashboard.html'; break;
            
            // 🧾 Billing
            case 'KeyB': targetPage = 'billing/billing.html'; break;
            
            // 📦 Inventory
            case 'KeyI': targetPage = 'inventory/inventory.html'; break;
            
            // ➕ Add Product (A)
            case 'KeyA': targetPage = 'add-product/add-product.html'; break;
            
            // 🛒 Purchase Record (R - Record)
            case 'KeyR': targetPage = 'purchase-record/purchase-dashboard.html'; break;
            
            // 📊 Sales Report (S)
            case 'KeyS': targetPage = 'sales-report/report.html'; break;
            
            // 📈 Profit/Loss (P)
            case 'KeyP': targetPage = 'sales-report/profit-loss.html'; break;
            
            // 💸 Expense (E)
            case 'KeyE': targetPage = 'expense/expense.html'; break;
            
            // 📅 Advance Booking (V - AdVance)
            case 'KeyV': targetPage = 'advance-booking/index.html'; break;
            
            // 🖨️ Barcode Print (L - Label)
            case 'KeyL': targetPage = 'label-printer/index.html'; break;
            
            // 🏪 Shop Details (H - SHop)
            case 'KeyH': targetPage = 'shop-details/shop-details.html'; break;

            // ⚙️ Admin (M - AdMin)
            case 'KeyM': targetPage = 'admin.html'; break;
        }

        if (targetPage) {
            e.preventDefault();
            const finalPath = getCorrectPath(targetPage);
            console.log("🚀 Shortcut Triggered! Going to: " + finalPath);
            window.location.href = finalPath;
        }
    }

    // Escape বাটন চাপলে মডাল বা সাইডবার বন্ধ হবে
    if (e.code === 'Escape') {
        document.body.classList.remove('sidebar-open');
        const adminModal = document.getElementById('admin-modal');
        if (adminModal) adminModal.style.display = 'none';
        document.querySelectorAll('.modal-overlay, .modal').forEach(m => m.classList.add('hidden'));
    }
});