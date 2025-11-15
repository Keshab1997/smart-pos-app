// js/dashboard.js (সম্পূর্ণ আপডেট করা)

// ==========================================
// --- Firebase থেকে প্রয়োজনীয় মডিউল ইম্পোর্ট ---
// ==========================================
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, getDocs, query, where, orderBy, addDoc, serverTimestamp, Timestamp
} from 'firebase/firestore';

// ==========================================
// --- DOM এলিমেন্টের রেফারেন্স ---
// ==========================================

// KPI কার্ডস
const todaySalesEl = document.getElementById('today-sales');
const todayProfitEl = document.getElementById('today-profit');
const todayCanceledEl = document.getElementById('today-canceled'); // নতুন যোগ করা হয়েছে
const todayExpensesEl = document.getElementById('today-expenses');
const lowStockCountEl = document.getElementById('low-stock-count');

// চার্ট ক্যানভাস
const salesProfitChartCtx = document.getElementById('salesProfitChart').getContext('2d');
const categoryPieChartCtx = document.getElementById('categoryPieChart').getContext('2d');

// তালিকা
const topProductsListEl = document.getElementById('topProductsList');
const lowStockListEl = document.getElementById('lowStockList');
const recentExpensesListEl = document.getElementById('recentExpensesList');

// খরচ যোগ করার মডাল
const addExpenseBtn = document.getElementById('add-expense-btn');
const expenseModal = document.getElementById('expense-modal');
const closeExpenseModalBtn = document.getElementById('close-expense-modal-btn');
const expenseForm = document.getElementById('expense-form');
const expenseDateInput = document.getElementById('expense-date');

// ন্যাভিগেশন
const logoutBtn = document.getElementById('logout-btn');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mainNavLinks = document.getElementById('main-nav-links');

// গ্লোবাল ভেরিয়েবল
let currentUserId = null;
let salesProfitChartInstance;
let categoryPieChartInstance;

// ==========================================
// --- Authentication ---
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        initializeDashboard();
    } else {
        window.location.href = 'index.html'; // লগইন পেজে রিডাইরেক্ট
    }
});

// ==========================================
// --- প্রাথমিক ফাংশন ---
// ==========================================
function initializeDashboard() {
    setupEventListeners();
    loadDashboardData();
}

/**
 * ড্যাশবোর্ডের জন্য সমস্ত ডেটা লোড এবং প্রসেস করে
 */
async function loadDashboardData() {
    if (!currentUserId) return;

    try {
        const salesRef = collection(db, 'shops', currentUserId, 'sales');
        const inventoryRef = collection(db, 'shops', currentUserId, 'inventory');
        const expensesRef = collection(db, 'shops', currentUserId, 'expenses');

        const [salesSnap, inventorySnap, expensesSnap] = await Promise.all([
            getDocs(query(salesRef, orderBy('createdAt', 'desc'))),
            getDocs(inventoryRef),
            getDocs(query(expensesRef, orderBy('date', 'desc')))
        ]);

        const allSalesData = salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const inventoryData = inventorySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const expensesData = expensesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // ===== START: ক্যানসেল হওয়া বিল আলাদা করা =====
        const validSales = allSalesData.filter(sale => sale.status !== 'canceled');
        const canceledSales = allSalesData.filter(sale => sale.status === 'canceled');
        // ===== END: পরিবর্তন =====

        // UI আপডেট করা
        updateKpiCards(validSales, canceledSales, inventoryData, expensesData);
        updateSalesProfitChart(validSales, inventoryData);
        updateCategoryPieChart(validSales);
        updateTopSellingProducts(validSales);
        updateLowStockAlerts(inventoryData);
        updateRecentExpenses(expensesData);

    } catch (error) {
        console.error("Error loading dashboard data:", error);
    }
}

// ==========================================
// --- UI আপডেট করার ফাংশন ---
// ==========================================

// === ফাংশনের প্যারামিটার আপডেট করা হয়েছে ===
function updateKpiCards(validSales, canceledSales, inventory, expenses) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let todaySales = 0;
    let todayGrossProfit = 0;
    let todayCanceledSales = 0; // নতুন ভেরিয়েবল

    // ইনভেন্টরি ডেটাকে একটি ম্যাপে রাখা для দ্রুত খোঁজার জন্য
    const inventoryMap = new Map(inventory.map(p => [p.id, p]));

    // শুধুমাত্র বৈধ সেলস থেকে হিসাব করা হচ্ছে
    validSales.forEach(sale => {
        if (!sale.createdAt || !sale.createdAt.toDate) return;
        const saleDate = sale.createdAt.toDate();
        if (saleDate >= startOfToday) {
            todaySales += sale.total;
            sale.items.forEach(item => {
                const product = inventoryMap.get(item.id);
                const costPrice = product ? product.costPrice || 0 : 0;
                const sellingPrice = item.price || 0;
                todayGrossProfit += (sellingPrice - costPrice) * item.quantity;
            });
        }
    });

    // ক্যানসেল হওয়া সেলস থেকে হিসাব করা হচ্ছে
    canceledSales.forEach(sale => {
        if (!sale.createdAt || !sale.createdAt.toDate) return;
        const saleDate = sale.createdAt.toDate();
        if (saleDate >= startOfToday) {
            todayCanceledSales += sale.total;
        }
    });

    const todayExpenses = expenses
        .filter(e => e.date && e.date.toDate && e.date.toDate() >= startOfToday)
        .reduce((sum, e) => sum + e.amount, 0);

    todaySalesEl.textContent = `₹${todaySales.toFixed(2)}`;
    todayProfitEl.textContent = `₹${todayGrossProfit.toFixed(2)}`;
    todayCanceledEl.textContent = `₹${todayCanceledSales.toFixed(2)}`; // নতুন কার্ড আপডেট
    todayExpensesEl.textContent = `₹${todayExpenses.toFixed(2)}`;
    
    const lowStockThreshold = 10;
    const lowStockCount = inventory.filter(p => p.stock <= lowStockThreshold).length;
    lowStockCountEl.textContent = lowStockCount;
}

// === শুধুমাত্র `validSales` ব্যবহার করার জন্য আপডেট করা হয়েছে ===
function updateSalesProfitChart(validSales, inventory) {
    const last7DaysData = {};
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7DaysData[d.toISOString().split('T')[0]] = { sales: 0, profit: 0 };
    }

    const inventoryMap = new Map(inventory.map(p => [p.id, p]));

    validSales.forEach(sale => {
        if (!sale.createdAt || !sale.createdAt.toDate) return;
        const dateString = sale.createdAt.toDate().toISOString().split('T')[0];
        if (last7DaysData[dateString] !== undefined) {
            last7DaysData[dateString].sales += sale.total;
            let saleProfit = 0;
            sale.items.forEach(item => {
                const product = inventoryMap.get(item.id);
                const costPrice = product ? product.costPrice || 0 : 0;
                saleProfit += (item.price - costPrice) * item.quantity;
            });
            last7DaysData[dateString].profit += saleProfit;
        }
    });

    const labels = Object.keys(last7DaysData).map(date => new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
    const salesData = Object.values(last7DaysData).map(d => d.sales);
    const profitData = Object.values(last7DaysData).map(d => d.profit);

    if (salesProfitChartInstance) salesProfitChartInstance.destroy();

    salesProfitChartInstance = new Chart(salesProfitChartCtx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Sales', data: salesData, borderColor: '#007bff', tension: 0.3 },
                { label: 'Profit', data: profitData, borderColor: '#28a745', tension: 0.3 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// === শুধুমাত্র `validSales` ব্যবহার করার জন্য আপডেট করা হয়েছে ===
function updateCategoryPieChart(validSales) {
    const categorySales = {};
    validSales.forEach(sale => {
        sale.items.forEach(item => {
            const category = item.category || 'Uncategorized';
            categorySales[category] = (categorySales[category] || 0) + (item.price * item.quantity);
        });
    });

    if (categoryPieChartInstance) categoryPieChartInstance.destroy();

    categoryPieChartInstance = new Chart(categoryPieChartCtx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categorySales),
            datasets: [{
                data: Object.values(categorySales),
                backgroundColor: ['#007bff', '#28a745', '#ffc107', '#dc3545', '#17a2b8', '#6c757d'],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// === শুধুমাত্র `validSales` ব্যবহার করার জন্য আপডেট করা হয়েছে ===
function updateTopSellingProducts(validSales) {
    const productSales = {};
    validSales.forEach(sale => {
        sale.items.forEach(item => {
            productSales[item.name] = (productSales[item.name] || 0) + item.quantity;
        });
    });

    const sortedProducts = Object.entries(productSales).sort(([, a], [, b]) => b - a);
    
    topProductsListEl.innerHTML = sortedProducts.length === 0
        ? '<li>No sales data available.</li>'
        : sortedProducts.map(([name, quantity]) => `<li><span>${name}</span> <strong>${quantity} sold</strong></li>`).join('');
}

function updateLowStockAlerts(inventory) {
    const lowStockThreshold = 10;
    const lowStockProducts = inventory.filter(p => p.stock <= lowStockThreshold).sort((a, b) => a.stock - b.stock);

    lowStockListEl.innerHTML = lowStockProducts.length === 0
        ? '<li>All products have sufficient stock.</li>'
        : lowStockProducts.map(p => `<li><span>${p.name}</span> <strong class="text-danger">${p.stock} left</strong></li>`).join('');
}

function updateRecentExpenses(expenses) {
    recentExpensesListEl.innerHTML = expenses.length === 0
        ? '<li>No recent expenses recorded.</li>'
        : expenses.slice(0, 5).map(exp => { // সাম্প্রতিক ৫টি খরচ দেখানো
            const dateStr = exp.date.toDate().toLocaleDateString('en-GB');
            return `<li><span>${exp.description} (${dateStr})</span> <strong>₹${exp.amount.toFixed(2)}</strong></li>`;
        }).join('');
}


// ==========================================
// --- ইভেন্ট লিসেনার সেটআপ ---
// ==========================================
function setupEventListeners() {
    expenseDateInput.valueAsDate = new Date();

    addExpenseBtn.addEventListener('click', () => expenseModal.classList.remove('hidden'));
    closeExpenseModalBtn.addEventListener('click', () => expenseModal.classList.add('hidden'));
    expenseModal.addEventListener('click', (e) => {
        if (e.target === expenseModal) expenseModal.classList.add('hidden');
    });

    expenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const description = document.getElementById('expense-description').value;
        const amount = parseFloat(document.getElementById('expense-amount').value);
        const category = document.getElementById('expense-category').value;
        const date = new Date(expenseDateInput.value);

        if (!description || !amount || !date || !currentUserId) {
            alert('Please fill all fields.');
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
            expenseDateInput.valueAsDate = new Date();
            expenseModal.classList.add('hidden');
            loadDashboardData(); // ডেটা রিফ্রেশ করা
            alert('Expense added successfully!');

        } catch (error) {
            console.error("Error adding expense:", error);
            alert('Failed to add expense.');
        }
    });

    logoutBtn.addEventListener('click', async () => await signOut(auth));
    mobileMenuBtn.addEventListener('click', () => mainNavLinks.classList.toggle('mobile-nav-active'));
}