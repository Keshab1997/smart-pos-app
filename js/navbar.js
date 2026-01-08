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
    { name: 'Barcode Print', link: 'label-printer/index.html', icon: '🖨️' }
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
        // item.link এর শেষ ফাইলের নাম যদি currentPage এর সাথে মিলে
        const itemFileName = item.link.split('/').pop();
        const isActive = itemFileName === currentPage ? 'active' : '';
        
        const finalLink = getCorrectPath(item.link);
        
        menuHTML += `
            <li>
                <a href="${finalLink}" class="${isActive}">
                    <span style="margin-right: 10px;">${item.icon}</span> ${item.name}
                </a>
            </li>
        `;
    });

    // ড্যাশবোর্ড লিংক (লোগোর জন্য)
    const dashboardLink = getCorrectPath('dashboard.html');

    const navbarHTML = `
        <div class="top-navbar">
            <div class="nav-brand">
                <button id="toggle-sidebar" class="hamburger-btn">
                    <i class="fas fa-bars"></i>
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
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            </div>
        </aside>
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