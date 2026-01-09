// js/navbar.js

// 1. মেনুর তালিকা (রুট ফোল্ডার থেকে পাথ)
const menuItems = [
    { name: 'Dashboard', link: 'dashboard.html', icon: '🏠' },
    { name: 'Billing', link: 'billing/billing.html', icon: '🧾' },
    { name: 'Advance Booking', link: 'advance-booking/index.html', icon: '📅' },
    { name: 'Inventory', link: 'inventory/inventory.html', icon: '📦' },
    { name: 'Add Product', link: 'add-product/add-product.html', icon: '➕' },
    { name: 'Purchase Record', link: 'purchase-record/purchase-dashboard.html', icon: '🛒' },
    { name: 'Sales Report', link: 'sales-report/report.html', icon: '📊' },
    { name: 'Expense', link: 'expense/expense.html', icon: '💸' },
    { name: 'Profit/Loss', link: 'sales-report/profit-loss.html', icon: '📈' },
    { name: 'Shop Details', link: 'shop-details/shop-details.html', icon: '🏪' },
    { name: 'Barcode Print', link: 'label-printer/index.html', icon: '🖨️' },
    { name: 'Admin Panel', link: '#', icon: '⚙️', id: 'nav-item-admin' }
];

// 2. সঠিক পাথ বের করার ফাংশন (Robust Path Correction)
function getCorrectPath(targetPath) {
    const currentPath = window.location.pathname;
    
    // আমরা কি কোনো সাব-ফোল্ডারে আছি? (যেমন /purchase-record/...)
    // যদি URL এ '/' এর সংখ্যা ২ এর বেশি হয় (root '/' বাদে), তাহলে আমরা সাব-ফোল্ডারে আছি।
    // সহজ চেক: যদি currentPath এ 'purchase-record' বা অন্য ফোল্ডারের নাম থাকে।
    
    // আমরা ধরে নিচ্ছি index.html এবং dashboard.html রুটে আছে।
    // বাকি সব ফোল্ডারের ভেতরে।
    
    const pathSegments = currentPath.split('/').filter(Boolean); // খালি স্ট্রিং বাদ দিয়ে
    
    // যদি আমরা লোকালহোস্টে থাকি, প্রথম সেগমেন্ট হতে পারে প্রোজেক্ট ফোল্ডারের নাম।
    // তাই আমরা দেখব ফাইলের নাম কী।
    const fileName = pathSegments[pathSegments.length - 1];
    
    // যদি আমরা রুটে না থাকি (অর্থাৎ ফাইলের আগে ফোল্ডার আছে)
    // তবে dashboard.html এর জন্য '../' যোগ করতে হবে।
    
    // সহজ লজিক: যদি বর্তমান পেজটি কোনো ফোল্ডারের ভেতর থাকে (যেমন purchase-record/dashboard.html)
    // তাহলে রুটে যেতে '../' লাগবে।
    
    // আপনার স্ট্রাকচার অনুযায়ী:
    // Root: dashboard.html
    // Sub: purchase-record/purchase-dashboard.html
    
    // যদি বর্তমান লোকেশনে ফোল্ডার থাকে (যেমন purchase-record)
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
        // Active Class Logic
        const itemFileName = item.link.split('/').pop();
        const isActive = itemFileName === currentPage ? 'active' : '';
        
        // যদি আইটেমের ID থাকে (যেমন Admin Panel), সেটা যোগ করা হবে
        const idAttr = item.id ? `id="${item.id}"` : '';
        
        // Admin Panel এর জন্য লিংক ঠিক রাখা, বাকিদের জন্য getCorrectPath
        const finalLink = item.link === '#' ? '#' : getCorrectPath(item.link);
        
        menuHTML += `
            <li ${idAttr}>
                <a href="${finalLink}" class="${isActive}">
                    <span style="margin-right: 10px;">${item.icon}</span> ${item.name}
                </a>
            </li>
        `;
    });

    // ড্যাশবোর্ড লিংক (লোগোর জন্য)
    const dashboardLink = getCorrectPath('dashboard.html');

    // --- নতুন: অ্যাডমিন মডাল HTML ---
    const adminModalHTML = `
        <div id="admin-modal" class="admin-modal-overlay">
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
                    <h4 style="margin-top:0;">👥 User List</h4>
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
        
        <!-- মডাল যোগ করা হলো -->
        ${adminModalHTML}
    `;

    navContainer.innerHTML = navbarHTML;
    setupNavbarEvents();
}

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
}

document.addEventListener('DOMContentLoaded', loadNavbar);