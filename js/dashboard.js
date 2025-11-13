// js/dashboard.js

// Firebase থেকে প্রয়োজনীয় মডিউল ইম্পোর্ট করা
import { db, collection, getDocs, query, where, orderBy, addDoc, serverTimestamp, Timestamp } from './firebase-config.js';

// ==========================================
// --- DOM এলিমেন্টের রেফারেন্স ---
// ==========================================

// KPI কার্ডস
const todaySalesEl = document.getElementById('today-sales');
const todayProfitEl = document.getElementById('today-profit');
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

// গ্লোবাল ভেরিয়েবল চার্ট ইনস্ট্যান্স রাখার জন্য
let salesProfitChartInstance;
let categoryPieChartInstance;


// ==========================================
// --- মূল ডেটা লোডিং এবং প্রসেসিং ফাংশন ---
// ==========================================

/**
 * ড্যাশবোর্ডের জন্য সমস্ত ডেটা লোড এবং প্রসেস করে
 */
async function loadDashboardData() {
    try {
        // সমান্তরালভাবে সব ডেটা লোড করা
        const [sales, products, expenses] = await Promise.all([
            getDocs(query(collection(db, 'sales'), orderBy('createdAt', 'desc'))),
            getDocs(collection(db, 'products')),
            getDocs(query(collection(db, 'expenses'), orderBy('date', 'desc')))
        ]);

        const salesData = sales.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const productsData = products.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const expensesData = expenses.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // ডেটা দিয়ে UI আপডেট করা
        updateKpiCards(salesData, productsData, expensesData);
        updateSalesProfitChart(salesData, productsData);
        updateCategoryPieChart(salesData, productsData);
        updateTopSellingProducts(salesData);
        updateLowStockAlerts(productsData);
        updateRecentExpenses(expensesData);

    } catch (error) {
        console.error("Error loading dashboard data:", error);
        // এখানে একটি সুন্দর এরর মেসেজ দেখানো যেতে পারে
    }
}


// ==========================================
// --- UI আপডেট করার ফাংশন ---
// ==========================================

/**
 * KPI কার্ডগুলো আপডেট করে
 */
function updateKpiCards(sales, products, expenses) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let todaySales = 0;
    let todayProfit = 0;
    let todayExpenses = 0;

    // আজকের বিক্রি এবং লাভ গণনা
    sales.forEach(sale => {
        const saleDate = sale.createdAt.toDate();
        if (saleDate >= startOfToday) {
            todaySales += sale.total;
            // প্রতিটি বিক্রির লাভ গণনা
            sale.items.forEach(item => {
                const product = products.find(p => p.id === item.id);
                if (product && product.cp) {
                    const cost = product.cp * item.quantity;
                    const revenue = item.price * item.quantity;
                    todayProfit += (revenue - cost);
                } else {
                    todayProfit += (item.price * item.quantity); // যদি কস্ট প্রাইস না থাকে
                }
            });
        }
    });

    // আজকের খরচ গণনা
    expenses.forEach(expense => {
        // Firebase থেকে আসা Timestamp অবজেক্টকে JS Date-এ রূপান্তর
        const expenseDate = expense.date.toDate ? expense.date.toDate() : new Date(expense.date);
        if (expenseDate >= startOfToday) {
            todayExpenses += expense.amount;
        }
    });
    
    // আজকের লাভ থেকে আজকের খরচ বাদ দেওয়া
    todayProfit -= todayExpenses;

    todaySalesEl.textContent = `₹${todaySales.toFixed(2)}`;
    todayProfitEl.textContent = `₹${todayProfit.toFixed(2)}`;
    todayExpensesEl.textContent = `₹${todayExpenses.toFixed(2)}`;

    // লো স্টক গণনা
    const lowStockThreshold = 5; // উদাহরণ: ৫ বা তার কম হলে লো স্টক
    const lowStockCount = products.filter(p => p.stock <= lowStockThreshold).length;
    lowStockCountEl.textContent = lowStockCount;
}

/**
 * সেলস এবং প্রফিট ট্রেন্ড চার্ট তৈরি করে
 */
function updateSalesProfitChart(sales, products) {
    const last7Days = {};
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateString = d.toISOString().split('T')[0]; // YYYY-MM-DD ফরম্যাট
        last7Days[dateString] = { sales: 0, profit: 0 };
    }

    sales.forEach(sale => {
        const saleDate = sale.createdAt.toDate();
        const dateString = saleDate.toISOString().split('T')[0];
        if (last7Days[dateString] !== undefined) {
            last7Days[dateString].sales += sale.total;
            
            let saleProfit = 0;
            sale.items.forEach(item => {
                const product = products.find(p => p.id === item.id);
                if (product && product.cp) {
                    saleProfit += (item.price - product.cp) * item.quantity;
                } else {
                    saleProfit += item.price * item.quantity;
                }
            });
            last7Days[dateString].profit += saleProfit;
        }
    });
    
    const labels = Object.keys(last7Days).map(date => new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
    const salesData = Object.values(last7Days).map(d => d.sales);
    const profitData = Object.values(last7Days).map(d => d.profit);

    if(salesProfitChartInstance) salesProfitChartInstance.destroy(); // পুরনো চার্ট ধ্বংস করা

    salesProfitChartInstance = new Chart(salesProfitChartCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Sales',
                    data: salesData,
                    borderColor: 'rgba(0, 123, 255, 1)',
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    tension: 0.3,
                    fill: true,
                },
                {
                    label: 'Profit',
                    data: profitData,
                    borderColor: 'rgba(40, 167, 69, 1)',
                    backgroundColor: 'rgba(40, 167, 69, 0.1)',
                    tension: 0.3,
                    fill: true,
                }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

/**
 * ক্যাটেগরি অনুযায়ী বিক্রির পাই চার্ট তৈরি করে
 */
function updateCategoryPieChart(sales, products) {
    const categorySales = {};
    sales.forEach(sale => {
        sale.items.forEach(item => {
            const product = products.find(p => p.id === item.id);
            if (product) {
                const category = product.category || 'Uncategorized';
                const revenue = item.price * item.quantity;
                categorySales[category] = (categorySales[category] || 0) + revenue;
            }
        });
    });

    const labels = Object.keys(categorySales);
    const data = Object.values(categorySales);
    
    if(categoryPieChartInstance) categoryPieChartInstance.destroy();

    categoryPieChartInstance = new Chart(categoryPieChartCtx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: ['#007bff', '#28a745', '#ffc107', '#dc3545', '#17a2b8', '#6c757d'],
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

/**
 * টপ সেলিং প্রোডাক্টের তালিকা আপডেট করে
 */
function updateTopSellingProducts(sales) {
    const productSales = {};
    sales.forEach(sale => {
        sale.items.forEach(item => {
            productSales[item.name] = (productSales[item.name] || 0) + item.quantity;
        });
    });

    const sortedProducts = Object.entries(productSales).sort(([, a], [, b]) => b - a).slice(0, 5);
    
    topProductsListEl.innerHTML = '';
    if (sortedProducts.length === 0) {
        topProductsListEl.innerHTML = '<li>No sales data available.</li>';
        return;
    }
    sortedProducts.forEach(([name, quantity]) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${name}</span> <strong>${quantity} sold</strong>`;
        topProductsListEl.appendChild(li);
    });
}

/**
 * লো স্টক আইটেমের তালিকা আপডেট করে
 */
function updateLowStockAlerts(products) {
    const lowStockThreshold = 5;
    const lowStockProducts = products.filter(p => p.stock <= lowStockThreshold).sort((a, b) => a.stock - b.stock);

    lowStockListEl.innerHTML = '';
    if (lowStockProducts.length === 0) {
        lowStockListEl.innerHTML = '<li>All products have sufficient stock.</li>';
        return;
    }
    lowStockProducts.forEach(product => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${product.name}</span> <strong style="color: red;">${product.stock} left</strong>`;
        lowStockListEl.appendChild(li);
    });
}

/**
 * সাম্প্রতিক খরচের তালিকা আপডেট করে
 */
function updateRecentExpenses(expenses) {
    const recentExpenses = expenses.slice(0, 5); // প্রথম ৫টি খরচ
    recentExpensesListEl.innerHTML = '';

    if(recentExpenses.length === 0) {
        recentExpensesListEl.innerHTML = '<li>No recent expenses recorded.</li>';
        return;
    }
    recentExpenses.forEach(expense => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${expense.description}</span> <strong>₹${expense.amount.toFixed(2)}</strong>`;
        recentExpensesListEl.appendChild(li);
    });
}


// ==========================================
// --- খরচ যোগ করার মডাল এবং ফর্ম হ্যান্ডলিং ---
// ==========================================

// ডিফল্ট তারিখ আজকের দিনে সেট করা
expenseDateInput.valueAsDate = new Date();

// মডাল খোলা ও বন্ধ করা
addExpenseBtn.addEventListener('click', () => expenseModal.classList.remove('hidden'));
closeExpenseModalBtn.addEventListener('click', () => expenseModal.classList.add('hidden'));
expenseModal.addEventListener('click', (e) => {
    if (e.target === expenseModal) expenseModal.classList.add('hidden');
});

// ফর্ম সাবমিট হলে খরচ সেভ করা
expenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const description = document.getElementById('expense-description').value;
    const amount = parseFloat(document.getElementById('expense-amount').value);
    const category = document.getElementById('expense-category').value;
    const date = new Date(expenseDateInput.value);

    if (!description || !amount || !date) {
        alert('Please fill all fields.');
        return;
    }

    try {
        await addDoc(collection(db, 'expenses'), {
            description,
            amount,
            category,
            date: Timestamp.fromDate(date), // তারিখকে Timestamp হিসাবে সেভ করা
            createdAt: serverTimestamp()
        });

        expenseForm.reset();
        expenseDateInput.valueAsDate = new Date(); // তারিখ রিসেট
        expenseModal.classList.add('hidden');
        
        // ডেটা রিলোড করে UI আপডেট করা
        loadDashboardData();
        alert('Expense added successfully!');

    } catch (error) {
        console.error("Error adding expense:", error);
        alert('Failed to add expense.');
    }
});


// ==========================================
// --- প্রাথমিক ফাংশন কল ---
// ==========================================
document.addEventListener('DOMContentLoaded', loadDashboardData);