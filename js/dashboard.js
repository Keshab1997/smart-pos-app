import { db, auth } from './firebase-config.js';
import { getActiveShopId } from './shop-helper.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    doc,
    getDoc,
    orderBy, 
    limit, 
    Timestamp,
    addDoc,
    serverTimestamp,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// DOM Elements (Sales/Profit Cards)
const todaySalesEl = document.getElementById('today-sales');
const todayProfitEl = document.getElementById('today-profit');
const todayCanceledEl = document.getElementById('today-canceled');
const todayExpensesEl = document.getElementById('today-expenses');
const lowStockCountEl = document.getElementById('low-stock-count');

// Welcome Section Elements
const greetingMsgEl = document.getElementById('greeting-msg');
const displayShopNameEl = document.getElementById('display-shop-name');
const displayUserEmailEl = document.getElementById('display-user-email');
const currentTimeEl = document.getElementById('current-time');
const currentDateEl = document.getElementById('current-date');
const userProfilePicEl = document.getElementById('user-profile-pic');

// Lists
const topProductsList = document.getElementById('topProductsList');
const recentExpensesList = document.getElementById('recentExpensesList');
const lowStockSummaryList = document.getElementById('lowStockSummaryList');
const recentActivityList = document.getElementById('recentActivityList');

// Charts
let salesProfitChartInstance = null;
let categoryPieChartInstance = null;

// User State
let currentUserId = null;
let activeShopId = null;

// ==========================================
// 1. Authentication Check & Init
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        activeShopId = getActiveShopId();
        if (activeShopId) {
            initializeDashboard(user);
        }
    } else {
        window.location.href = 'index.html';
    }
});

// ==========================================
// 2. Initialize Dashboard
// ==========================================
async function initializeDashboard(user) {
    // UI Updates (Clock starts immediately)
    startClock();
    
    // Check user status and announcements
    await checkUserStatus(user.uid);
    listenForAnnouncements();
    
    // Fetch and Update Profile/Shop Info from Firestore & Auth
    await updateWelcomeSection(user);
    
    // Data Loading
    await loadDashboardData();
    
    // Event Listeners
    setupDashboardEventListeners();
}

// ==========================================
// 3. UI Helpers (Clock, Welcome)
// ==========================================
function startClock() {
    const updateTime = () => {
        const now = new Date();
        if(currentTimeEl) currentTimeEl.textContent = now.toLocaleTimeString('en-US', { hour12: true });
        if(currentDateEl) currentDateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    };
    updateTime();
    setInterval(updateTime, 1000);
}

async function updateWelcomeSection(user) {
    updateGreeting();
    if(displayUserEmailEl) displayUserEmailEl.textContent = user.email;

    // --- জিমেইল থেকে প্রোফাইল ছবি সেট করা ---
    if (user.photoURL && userProfilePicEl) {
        // গুগল একাউন্টের ছবি সেট করা হচ্ছে
        userProfilePicEl.src = user.photoURL;
    } else if (userProfilePicEl) {
        // ছবি না থাকলে ডিফল্ট ছবি
        userProfilePicEl.src = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
    }

    try {
        // Firestore-এর 'shops' কালেকশন থেকে ইউজারের ডকুমেন্ট আনা
        const shopDocRef = doc(db, 'shops', activeShopId);
        const shopSnap = await getDoc(shopDocRef);

        if (shopSnap.exists()) {
            const shopData = shopSnap.data();
            // দোকানের নাম আপডেট করা
            if(displayShopNameEl) {
                displayShopNameEl.textContent = shopData.shopName || "My Smart Shop";
            }
        } else {
            if(displayShopNameEl) displayShopNameEl.textContent = "Setup Your Shop";
        }
    } catch (error) {
        console.error("Error fetching shop details:", error);
        if(displayShopNameEl) displayShopNameEl.textContent = "My Smart Shop";
    }
}

function updateGreeting() {
    const hour = new Date().getHours();
    let greeting = "Good Morning!";
    if (hour >= 12 && hour < 17) greeting = "Good Afternoon!";
    else if (hour >= 17 && hour < 21) greeting = "Good Evening!";
    else if (hour >= 21 || hour < 5) greeting = "Good Night!";
    
    if(greetingMsgEl) greetingMsgEl.textContent = greeting;
}

// ==========================================
// 4. Main Data Loading Logic
// ==========================================
async function loadDashboardData() {
    if (!activeShopId) return;

    try {
        // ডেট রেঞ্জ ঠিক করা (আজকের জন্য)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayStart = Timestamp.fromDate(today);
        const todayEnd = Timestamp.fromDate(tomorrow);

        // --- A. Fetch Sales Data ---
        const salesRef = collection(db, 'shops', activeShopId, 'sales');
        const salesQuery = query(salesRef, where('createdAt', '>=', todayStart), where('createdAt', '<', todayEnd));
        const salesSnapshot = await getDocs(salesQuery);

        let totalSales = 0;
        let totalProfit = 0;
        let totalCanceled = 0;
        const categoryMap = {}; // পাই চার্টের জন্য

        salesSnapshot.forEach(doc => {
            const sale = doc.data();
            
            if (sale.status === 'canceled') {
                totalCanceled += (sale.total || 0);
            } else {
                totalSales += (sale.total || 0);
                
                // Profit Calculation (Sales - Cost)
                let saleCost = 0;
                if (sale.items && Array.isArray(sale.items)) {
                    sale.items.forEach(item => {
                        const costPrice = item.purchasePrice || item.costPrice || 0;
                        saleCost += (costPrice * item.quantity);
                        
                        // Category Data
                        const cat = item.category || 'General';
                        categoryMap[cat] = (categoryMap[cat] || 0) + (item.price * item.quantity);
                    });
                }
                totalProfit += (sale.total - saleCost);
            }
        });

        // --- B. Fetch Expenses ---
        const expenseRef = collection(db, 'shops', activeShopId, 'expenses');
        const expenseQuery = query(expenseRef, where('date', '>=', todayStart), where('date', '<', todayEnd));
        const expenseSnapshot = await getDocs(expenseQuery);
        
        let totalExpenses = 0;
        const recentExpenses = [];

        expenseSnapshot.forEach(doc => {
            const exp = doc.data();
            totalExpenses += (exp.amount || 0);
            recentExpenses.push({ ...exp, id: doc.id });
        });

        // --- C. Fetch Low Stock ---
        const inventoryRef = collection(db, 'shops', activeShopId, 'inventory');
        const inventorySnapshot = await getDocs(inventoryRef);
        let lowStockCount = 0;
        const lowStockItems = [];

        inventorySnapshot.forEach(doc => {
            const item = doc.data();
            const stock = parseInt(item.stock) || 0;
            const minStock = parseInt(item.minStockAlert) || 5; // Default alert level

            if (stock <= minStock) {
                lowStockCount++;
                lowStockItems.push(item);
            }
        });

        // --- UPDATE KPI CARDS ---
        if(todaySalesEl) todaySalesEl.textContent = formatCurrency(totalSales);
        if(todayProfitEl) todayProfitEl.textContent = formatCurrency(totalProfit);
        if(todayCanceledEl) todayCanceledEl.textContent = formatCurrency(totalCanceled);
        if(todayExpensesEl) todayExpensesEl.textContent = formatCurrency(totalExpenses);
        if(lowStockCountEl) lowStockCountEl.textContent = lowStockCount;

        // --- UPDATE LISTS & CHARTS ---
        updateLists(recentExpenses, lowStockItems);
        updateLowStockSummary();
        updateDailyGoal(totalSales);
        calculateValuation();
        loadRecentActivity();
        updateCharts(totalSales, totalProfit, categoryMap);

    } catch (error) {
        console.error("Error loading dashboard data:", error);
    }
}

// ==========================================
// 5. Update UI Helpers
// ==========================================
function formatCurrency(amount) {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function updateLists(expenses, lowStockItems) {
    // Recent Expenses
    if (recentExpensesList) {
        recentExpensesList.innerHTML = '';
        if (expenses.length === 0) {
            recentExpensesList.innerHTML = '<li>No expenses today.</li>';
        } else {
            expenses.slice(0, 5).forEach(exp => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${exp.description || exp.category}</span>
                    <span class="amount">-${formatCurrency(exp.amount)}</span>
                `;
                recentExpensesList.appendChild(li);
            });
        }
    }
    
    // Top Selling (Placeholder logic - requires complex aggregation or separate collection)
    if (topProductsList) {
        topProductsList.innerHTML = '<li style="color: #777;">Data collection in progress...</li>';
    }
}

function updateCharts(sales, profit, categoryMap) {
    // 1. Sales vs Profit (Dummy data for trend, Real data for today)
    const ctx1 = document.getElementById('salesProfitChart');
    if (ctx1) {
        if (salesProfitChartInstance) salesProfitChartInstance.destroy();
        
        salesProfitChartInstance = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'],
                datasets: [
                    {
                        label: 'Sales',
                        data: [0, 0, 0, 0, 0, 0, sales], // Previous days 0 for now
                        borderColor: '#4361ee',
                        tension: 0.4
                    },
                    {
                        label: 'Profit',
                        data: [0, 0, 0, 0, 0, 0, profit],
                        borderColor: '#2a9d8f',
                        tension: 0.4
                    }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // 2. Category Pie Chart
    const ctx2 = document.getElementById('categoryPieChart');
    if (ctx2) {
        if (categoryPieChartInstance) categoryPieChartInstance.destroy();
        
        const labels = Object.keys(categoryMap);
        const data = Object.values(categoryMap);
        
        if (labels.length === 0) {
            // Show empty state
            labels.push('No Sales');
            data.push(1);
        }

        categoryPieChartInstance = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: ['#4361ee', '#3f37c9', '#4895ef', '#4cc9f0', '#f72585']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

// Low Stock Summary Function
async function updateLowStockSummary() {
    if (!lowStockSummaryList || !activeShopId) return;

    try {
        const inventoryRef = collection(db, 'shops', activeShopId, 'inventory');
        const q = query(inventoryRef, where('stock', '<=', 5));
        const querySnapshot = await getDocs(q);

        let listHtml = '';
        let count = 0;

        if (querySnapshot.empty) {
            listHtml = '<li style="text-align:center; color: #28a745; padding: 20px;">✅ All items are well stocked!</li>';
        } else {
            querySnapshot.forEach((doc) => {
                const p = doc.data();
                count++;
                listHtml += `
                    <li style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #eee;">
                        <div>
                            <span style="font-weight: 600; display: block;">${p.name}</span>
                            <small style="color: #666;">Cat: ${p.category || 'N/A'}</small>
                        </div>
                        <div style="text-align: right;">
                            <span style="color: #dc3545; font-weight: bold; font-size: 1.1rem;">${p.stock}</span>
                            <small style="color: #dc3545; font-weight: 600;"> ${p.uom || 'Pcs'}</small>
                        </div>
                    </li>
                `;
            });
        }

        lowStockSummaryList.innerHTML = listHtml;
        if (lowStockCountEl) lowStockCountEl.textContent = count;

    } catch (error) {
        console.error("Error loading low stock summary:", error);
        lowStockSummaryList.innerHTML = '<li class="text-danger">Failed to load alerts.</li>';
    }
}

// Daily Goal Update Function
function updateDailyGoal(currentSales) {
    const target = 5000; // You can make this configurable
    const percent = Math.min(Math.round((currentSales / target) * 100), 100);
    
    const goalPercentEl = document.getElementById('goal-percent');
    const targetAmountEl = document.getElementById('target-amount');
    const remainingAmountEl = document.getElementById('remaining-amount');
    
    if (goalPercentEl) goalPercentEl.textContent = `${percent}%`;
    if (targetAmountEl) targetAmountEl.textContent = `₹${target.toLocaleString()}`;
    if (remainingAmountEl) remainingAmountEl.textContent = `₹${Math.max(0, target - currentSales).toLocaleString()}`;
    
    const progress = document.querySelector('.circular-progress');
    if (progress) {
        progress.style.background = `conic-gradient(#4361ee ${percent * 3.6}deg, #ededed 0deg)`;
    }
}

// Inventory Valuation Function
async function calculateValuation() {
    if (!activeShopId) return;
    
    try {
        const invRef = collection(db, 'shops', activeShopId, 'inventory');
        const snap = await getDocs(invRef);
        
        let totalCost = 0;
        let totalSale = 0;

        snap.forEach(doc => {
            const p = doc.data();
            const stock = parseInt(p.stock) || 0;
            totalCost += (stock * (parseFloat(p.costPrice) || 0));
            totalSale += (stock * (parseFloat(p.sellingPrice) || 0));
        });

        const totalCostEl = document.getElementById('total-cost-value');
        const totalSaleEl = document.getElementById('total-sale-value');
        const potentialProfitEl = document.getElementById('potential-profit');
        
        if (totalCostEl) totalCostEl.textContent = formatCurrency(totalCost);
        if (totalSaleEl) totalSaleEl.textContent = formatCurrency(totalSale);
        if (potentialProfitEl) potentialProfitEl.textContent = formatCurrency(totalSale - totalCost);
        
    } catch (error) {
        console.error("Error calculating valuation:", error);
    }
}

// Recent Activity Function
async function loadRecentActivity() {
    if (!recentActivityList || !activeShopId) return;
    
    try {
        const salesRef = collection(db, 'shops', activeShopId, 'sales');
        const q = query(salesRef, orderBy('createdAt', 'desc'), limit(5));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            recentActivityList.innerHTML = '<li style="text-align:center; color:#999;">No recent sales found.</li>';
            return;
        }
        
        let listHtml = '';
        snap.forEach(doc => {
            const s = doc.data();
            const time = s.createdAt ? s.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Just now';
            const itemCount = s.items ? s.items.length : 0;
            
            listHtml += `
                <li>
                    <strong>${formatCurrency(s.total || 0)}</strong> sale completed
                    <br><small>${time} • ${itemCount} items</small>
                </li>
            `;
        });
        
        recentActivityList.innerHTML = listHtml;
        
    } catch (error) {
        console.error("Error loading recent activity:", error);
        recentActivityList.innerHTML = '<li style="color:red;">Failed to load activities.</li>';
    }
}

// ==========================================
// 6. Setup Event Listeners (শুধুমাত্র ড্যাশবোর্ডের জন্য)
// ==========================================
function setupDashboardEventListeners() {
    // Modal Elements
    const addExpenseBtn = document.getElementById('add-expense-btn');
    const expenseModal = document.getElementById('expense-modal');
    const closeExpenseModalBtn = document.getElementById('close-expense-modal-btn');
    const expenseForm = document.getElementById('expense-form');

    // Modal Logic
    if (addExpenseBtn && expenseModal) {
        addExpenseBtn.addEventListener('click', () => {
            expenseModal.classList.remove('hidden');
        });
    }

    if (closeExpenseModalBtn && expenseModal) {
        closeExpenseModalBtn.addEventListener('click', () => {
            expenseModal.classList.add('hidden');
        });
    }
    
    // Close modal on outside click
    window.addEventListener('click', (e) => {
        if (expenseModal && e.target === expenseModal) {
            expenseModal.classList.add('hidden');
        }
    });

    // Handle Expense Form Submit
    if (expenseForm) {
        expenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const description = document.getElementById('expense-description').value;
            const amount = parseFloat(document.getElementById('expense-amount').value);
            const category = document.getElementById('expense-category').value;
            const date = new Date(document.getElementById('expense-date').value);

            if (!description || !amount || !activeShopId) {
                alert('Please fill all required fields.');
                return;
            }

            try {
                await addDoc(collection(db, 'shops', activeShopId, 'expenses'), {
                    description,
                    amount,
                    category,
                    date: Timestamp.fromDate(date),
                    createdAt: serverTimestamp()
                });

                expenseForm.reset();
                document.getElementById('expense-date').valueAsDate = new Date();
                expenseModal.classList.add('hidden');
                
                // Reload dashboard data
                await loadDashboardData();
                alert('Expense added successfully!');

            } catch (error) {
                console.error("Error adding expense:", error);
                alert('Failed to add expense. Please try again.');
            }
        });
    }

    // Set default date for expense form
    const expenseDateInput = document.getElementById('expense-date');
    if (expenseDateInput) {
        expenseDateInput.valueAsDate = new Date();
    }
}
// ==========================================
// 7. USER STATUS & ANNOUNCEMENT SYSTEM
// ==========================================

// ১. ইউজার স্ট্যাটাস চেক (Inactive হলে লগআউট করে দেওয়া)
async function checkUserStatus(uid) {
    try {
        const shopSnap = await getDoc(doc(db, 'shops', activeShopId));
        if (shopSnap.exists() && shopSnap.data().status === 'inactive') {
            alert("Your account is inactive. Please contact admin.");
            auth.signOut();
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error("Error checking user status:", error);
    }
}

// ২. রিয়েল-টাইম এনাউন্সমেন্ট লিসেনার
function listenForAnnouncements() {
    onSnapshot(doc(db, 'settings', 'announcement'), (doc) => {
        if (doc.exists() && doc.data().active) {
            const msg = doc.data().message;
            showAnnouncementBanner(msg);
        } else {
            removeAnnouncementBanner();
        }
    });
}

function showAnnouncementBanner(msg) {
    // যদি ইউজার এই সেশনে অলরেডি এই মেসেজটি ক্লোজ করে থাকে, তবে আর দেখাবে না
    if (sessionStorage.getItem('closed-announcement') === msg) return;

    let banner = document.getElementById('global-announcement-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'global-announcement-banner';
        banner.style = "background:#ff9f1c; color:white; padding:12px; text-align:center; font-weight:bold; position:sticky; top:0; z-index:1000; display:flex; justify-content:center; align-items:center; gap:20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);";
        document.body.prepend(banner);
    }
    
    banner.innerHTML = `
        <span style="flex-grow: 1;">📢 ${msg}</span>
        <button id="close-announcement" style="background:rgba(0,0,0,0.2); border:none; color:white; cursor:pointer; padding:5px 10px; border-radius:4px; font-weight:bold;">✕ Close</button>
    `;

    document.getElementById('close-announcement').onclick = () => {
        banner.remove();
        // সেশন স্টোরেজে সেভ করে রাখা যাতে বারবার বিরক্ত না করে
        sessionStorage.setItem('closed-announcement', msg);
    };
}

function removeAnnouncementBanner() {
    const banner = document.getElementById('global-announcement-banner');
    if (banner) banner.remove();
}

// ৩. Support Button Functionality
const supportBtn = document.getElementById('btn-open-support');
if (supportBtn) {
    supportBtn.addEventListener('click', async () => {
        const msg = prompt("💬 Write your message/feedback for the Admin:");
        if (msg && msg.trim() !== "") {
            try {
                const shopSnap = await getDoc(doc(db, 'shops', activeShopId));
                const shopName = shopSnap.exists() ? shopSnap.data().shopName : "Unknown Shop";
                
                await addDoc(collection(db, 'support_tickets'), {
                    userId: currentUserId,
                    shopName: shopName,
                    email: auth.currentUser.email,
                    message: msg,
                    createdAt: serverTimestamp()
                });
                alert("✅ Message sent to Admin! Thank you for your feedback.");
            } catch (e) {
                console.error('Error sending feedback:', e);
                alert("❌ Failed to send message. Please try again.");
            }
        }
    });
}