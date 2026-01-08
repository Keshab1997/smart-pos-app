// js/navbar.js

// 1. মেনুর তালিকা (এখানে নতুন মেনু অ্যাড করলে সব পেজে অ্যাড হয়ে যাবে)
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
    { name: 'Barcode Print', link: 'label-printer/index.html', icon: '🖨️' }
];

// 2. সঠিক পাথ বের করার ফাংশন (Path Correction)
function getCorrectPath(targetPath) {
    const currentPath = window.location.pathname;
    
    // যদি আমরা সাব-ফোল্ডারে থাকি (যেমন: /billing/billing.html)
    // তাহলে রুট ফোল্ডারে যেতে '../' যোগ করতে হবে।
    // এটা সিম্পল রাখার জন্য আমরা ধরে নিচ্ছি আপনার সব সাব-ফোল্ডার ১ লেভেলের।
    
    const isSubFolder = currentPath.split('/').length > 2 && !currentPath.includes('dashboard.html');

    if (isSubFolder) {
        // যদি টার্গেট রুট ফোল্ডারে হয় (যেমন dashboard.html)
        if (!targetPath.includes('/')) return '../' + targetPath;
        // যদি টার্গেট অন্য ফোল্ডারে হয় (যেমন billing/...)
        return '../' + targetPath; 
    } else {
        // যদি আমরা রুটে থাকি
        return targetPath;
    }
}

// 3. HTML তৈরি এবং ইনজেক্ট করা
function loadNavbar() {
    const navContainer = document.getElementById('navbar-placeholder');
    if (!navContainer) return;

    // বর্তমান পেজের নাম বের করা (Active class এর জন্য)
    const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

    let menuHTML = '';
    menuItems.forEach(item => {
        // Active Class Logic
        // item.link এর শেষ অংশ যদি currentPage এর সাথে মিলে যায়
        const isActive = item.link.endsWith(currentPage) ? 'active' : '';
        const finalLink = getCorrectPath(item.link);
        
        menuHTML += `
            <li>
                <a href="${finalLink}" class="${isActive}">
                    <span style="margin-right: 10px;">${item.icon}</span> ${item.name}
                </a>
            </li>
        `;
    });

    const navbarHTML = `
        <div class="top-navbar">
            <div class="nav-brand">
                <button id="toggle-sidebar" class="hamburger-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </button>
                <a href="${getCorrectPath('dashboard.html')}" class="logo">Smart POS</a>
            </div>
            <!-- ডানে প্রোফাইল বা নোটিফিকেশন আইকন চাইলে এখানে দেওয়া যাবে -->
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
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                    Logout
                </button>
            </div>
        </aside>
    `;

    navContainer.innerHTML = navbarHTML;

    // 4. ইভেন্ট লিসেনার সেটআপ
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

    // Logout Logic (Note: This dispatches an event that firebase-config.js listens to, OR we import signOut here)
    // সিম্পল রাখার জন্য আমরা এখানে ইভেন্ট ডিসপ্যাচ করব অথবা সরাসরি লগআউট ফাংশন কল করব।
    // আপনার আগের কোড অনুযায়ী dashboard.js এ লগআউট হ্যান্ডেল করা আছে, তাই আমরা বাটনটির আইডি 'logout-btn' এর বদলে 'global-logout-btn' দিয়েছি।
    // তবে ভালো হয় সব পেজের JS ফাইলে এই আইডি ধরে কাজ করা।
    
    // আমরা কাস্টম ইভেন্ট তৈরি করি যাতে মূল JS ফাইল লগআউট হ্যান্ডেল করতে পারে
    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
             // একটি কাস্টম ইভেন্ট ট্রিগার করা যা dashboard.js বা অন্য ফাইল শুনবে
             const event = new Event('trigger-logout');
             document.dispatchEvent(event);
        });
    }
}

// পেজ লোড হলে মেনু লোড হবে
document.addEventListener('DOMContentLoaded', loadNavbar);