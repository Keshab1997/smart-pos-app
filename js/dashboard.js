import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    orderBy, 
    limit, 
    Timestamp,
    addDoc,
    serverTimestamp
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
const lowStockList = document.getElementById('lowStockList');

// Charts
let salesProfitChartInstance = null;
let categoryPieChartInstance = null;

// User State
let currentUserId = null;

// ==========================================
// 1. Authentication Check & Init
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        initializeDashboard(user);
    } else {
        window.location.href = 'index.html';
    }
});

// ==========================================
// 2. Initialize Dashboard
// ==========================================
async function initializeDashboard(user) {
    // UI Updates
    updateWelcomeSection(user);
    startClock();
    
    // Data Loading
    await loadDashboardData();
    
    // Event Listeners (শুধুমাত্র ড্যাশবোর্ডের ভিতরের এলিমেন্টগুলোর জন্য)
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

function updateWelcomeSection(user) {
    const hour = new Date().getHours();
    let greeting = "Hello";
    if (hour < 12) greeting = "Good Morning";
    else if (hour < 18) greeting = "Good Afternoon";
    else greeting = "Good Evening";

    if(greetingMsgEl) greetingMsgEl.textContent = `${greeting}!`;
    if(displayUserEmailEl) displayUserEmailEl.textContent = user.email;
    
    // Shop Name (Optional: Fetch from Firestore 'shops' collection if needed)
    if(displayShopNameEl) displayShopNameEl.textContent = "My Smart Shop"; 
}

// ==========================================
// 4. Main Data Loading Logic
// ==========================================
async function loadDashboardData() {
    if (!currentUserId) return;

    try {
        // ডেট রেঞ্জ ঠিক করা (আজকের জন্য)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayStart = Timestamp.fromDate(today);
        const todayEnd = Timestamp.fromDate(tomorrow);

        // --- A. Fetch Sales Data ---
        const salesRef = collection(db, 'shops', currentUserId, 'sales');
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
        const expenseRef = collection(db, 'shops', currentUserId, 'expenses');
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
        const inventoryRef = collection(db, 'shops', currentUserId, 'inventory');
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

    // Low Stock
    if (lowStockList) {
        lowStockList.innerHTML = '';
        if (lowStockItems.length === 0) {
            lowStockList.innerHTML = '<li style="color: green;">All stocks are sufficient.</li>';
        } else {
            lowStockItems.slice(0, 5).forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${item.name}</span>
                    <span class="stock-warning">Qty: ${item.stock}</span>
                `;
                lowStockList.appendChild(li);
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

            if (!description || !amount || !currentUserId) {
                alert('Please fill all required fields.');
                return;
            }

            try {
                await addDoc(collection(db, 'shops', currentUserId, 'expenses'), {
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