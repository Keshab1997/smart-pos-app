// sales-report/profit-loss.js (চূড়ান্ত এবং সম্পূর্ণ আপডেট করা v2.0)

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, getDocs, query, where, Timestamp
} from 'firebase/firestore';

// ==========================================================
// --- DOM এলিমেন্টস ---
// ==========================================================
const totalRevenueEl = document.getElementById('total-revenue');
const totalCogsEl = document.getElementById('total-cogs');
const totalCanceledSalesEl = document.getElementById('total-canceled-sales');
const grossProfitEl = document.getElementById('gross-profit');
const closingStockValueEl = document.getElementById('closing-stock-value');
const totalOtherExpensesEl = document.getElementById('total-other-expenses');
const netProfitLossEl = document.getElementById('net-profit-loss');
const netProfitLossCard = document.getElementById('net-profit-loss-card'); // আইডি কার্ডের জন্য

const otherExpensesList = document.getElementById('other-expenses-list');

const pnlChartCtx = document.getElementById('pnlChart').getContext('2d');
let pnlChartInstance;

const btnToday = document.getElementById('btn-today');
const btnThisWeek = document.getElementById('btn-this-week');
const btnThisMonth = document.getElementById('btn-this-month');
const btnThisYear = document.getElementById('btn-this-year');
const generateReportBtn = document.getElementById('generate-report-btn');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');

const logoutBtn = document.getElementById('logout-btn');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mainNavLinks = document.querySelector('header nav .nav-links'); // সঠিক সিলেক্টর ব্যবহার করা হয়েছে

// ==========================================================
// --- গ্লোবাল ভেরিয়েবল ---
// ==========================================================
let currentUserId = null;

// ==========================================================
// --- Authentication ---
// ==========================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        initializePnlPage();
    } else {
        window.location.href = '../index.html'; // বা আপনার লগইন পেজের পাথ
    }
});

// ==========================================================
// --- প্রাথমিক ফাংশন ---
// ==========================================================
function initializePnlPage() {
    setupEventListeners();
    // ডিফল্টভাবে "This Week" রিপোর্ট দেখানো
    btnThisWeek.click();
}

function getPeriodDates(period) {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date(now);

    // দিনের শুরু ও শেষ সেট করা
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    switch (period) {
        case 'today':
            // startDate ইতোমধ্যেই আজকের দিনের শুরুতে সেট আছে
            break;
        case 'week':
            // সপ্তাহ সোমবার থেকে শুরু করতে চাইলে: const day = now.getDay() || 7; startDate.setDate(now.getDate() - day + 1);
            const firstDayOfWeek = now.getDate() - now.getDay(); // সপ্তাহ রবিবার থেকে শুরু
            startDate = new Date(now.setDate(firstDayOfWeek));
            startDate.setHours(0, 0, 0, 0);
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
    }
    
    return { startDate, endDate };
}

async function calculateClosingStockValue() {
    if (!currentUserId) return 0;
    const inventoryCollectionRef = collection(db, 'shops', currentUserId, 'inventory');
    let totalStockValue = 0;
    try {
        const inventorySnap = await getDocs(inventoryCollectionRef);
        inventorySnap.forEach(doc => {
            const product = doc.data();
            const stock = product.stock || 0;
            // purchasePrice বা costPrice যেকোনো একটি ব্যবহার করা যেতে পারে
            const costPrice = product.purchasePrice || product.costPrice || 0;
            if (stock > 0 && typeof costPrice === 'number') {
                totalStockValue += stock * costPrice;
            }
        });
    } catch (error) {
        console.error("Error calculating closing stock value:", error);
    }
    return totalStockValue;
}

// মূল রিপোর্ট জেনারেট করার ফাংশন
async function generatePnlReport(startDate, endDate) {
    if (!currentUserId) return;

    resetUI();
    document.body.style.cursor = 'wait';
    
    try {
        // endDate-কে দিনের শেষ পর্যন্ত সেট করা হচ্ছে
        endDate.setHours(23, 59, 59, 999);

        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        const salesQuery = query(collection(db, 'shops', currentUserId, 'sales'), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp));
        const expensesQuery = query(collection(db, 'shops', currentUserId, 'expenses'), where('date', '>=', startTimestamp), where('date', '<=', endTimestamp));
        
        const [salesSnap, expensesSnap, closingStockValue] = await Promise.all([
            getDocs(salesQuery),
            getDocs(expensesQuery),
            calculateClosingStockValue()
        ]);
        
        let totalRevenue = 0;
        let totalCogs = 0;
        let totalCanceledSales = 0;

        salesSnap.forEach(doc => {
            const sale = doc.data();

            if (sale.status === 'canceled') {
                totalCanceledSales += sale.total || 0;
                return; // ক্যানসেল হওয়া বিলের হিসাব Revenue বা COGS-এ যোগ হবে না
            }

            totalRevenue += sale.total || 0;

            if (Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    const costPrice = item.purchasePrice || item.costPrice || 0;
                    const quantity = item.quantity || 0;
                    totalCogs += costPrice * quantity;
                });
            }
        });

        let totalOtherExpenses = 0;
        const otherExpenses = [];
        
        expensesSnap.forEach(doc => {
            const expense = doc.data();
            if (expense.category?.toLowerCase() !== 'inventory_purchase') {
                totalOtherExpenses += expense.amount || 0;
                otherExpenses.push(expense);
            }
        });

        const grossProfit = totalRevenue - totalCogs;
        const netProfit = grossProfit - totalOtherExpenses;

        updateKpiCards(totalRevenue, totalCogs, totalCanceledSales, grossProfit, closingStockValue, totalOtherExpenses, netProfit);
        updateExpenseTable(otherExpenses);
        updateChart(totalRevenue, totalCogs, totalOtherExpenses, netProfit);

    } catch (error) {
        console.error("Error generating P&L report:", error);
        alert("Could not generate the report. Please check the console for details.");
    } finally {
        document.body.style.cursor = 'default';
    }
}

// UI আপডেট ফাংশন
function updateKpiCards(revenue, cogs, canceledSales, gross, stockValue, expenses, net) {
    const format = (num) => `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    totalRevenueEl.textContent = format(revenue);
    totalCogsEl.textContent = format(cogs);
    totalCanceledSalesEl.textContent = format(canceledSales);
    grossProfitEl.textContent = format(gross);
    closingStockValueEl.textContent = format(stockValue);
    totalOtherExpensesEl.textContent = format(expenses);
    netProfitLossEl.textContent = format(net);

    netProfitLossCard.classList.remove('profit', 'loss');
    if (net >= 0) {
        netProfitLossCard.classList.add('profit');
    } else {
        netProfitLossCard.classList.add('loss');
    }
}

function updateExpenseTable(others) {
    otherExpensesList.innerHTML = '';
    if (others.length === 0) {
        otherExpensesList.innerHTML = '<tr><td colspan="3">No other expenses found in this period.</td></tr>';
        return;
    }
    others.sort((a, b) => b.date.toMillis() - a.date.toMillis()).forEach(exp => {
        const row = `<tr>
            <td>${exp.date.toDate().toLocaleDateString('en-IN')}</td>
            <td>${exp.description || 'N/A'}</td>
            <td>₹${(exp.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`;
        otherExpensesList.innerHTML += row;
    });
}

function updateChart(revenue, cogs, expenses, netProfit) {
    if (pnlChartInstance) pnlChartInstance.destroy();

    pnlChartInstance = new Chart(pnlChartCtx, {
        type: 'bar',
        data: {
            labels: ['Total Revenue', 'Cost of Goods', 'Other Expenses', 'Net Profit'],
            datasets: [{
                label: 'Amount (₹)',
                data: [revenue, cogs, expenses, netProfit],
                backgroundColor: [
                    '#4CAF50', // Revenue
                    '#FFC107', // COGS
                    '#F44336', // Expenses
                    netProfit >= 0 ? '#2196F3' : '#D32F2F' // Net Profit (blue or dark red)
                ],
                borderColor: 'rgba(255, 255, 255, 0.3)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { callback: (value) => `₹${value.toLocaleString('en-IN')}` } } }
        }
    });
}

function resetUI() {
    const loadingText = '₹0.00';
    [totalRevenueEl, totalCogsEl, totalCanceledSalesEl, grossProfitEl, closingStockValueEl, totalOtherExpensesEl, netProfitLossEl].forEach(el => el.textContent = loadingText);
    
    netProfitLossCard.classList.remove('profit', 'loss');
    otherExpensesList.innerHTML = '<tr><td colspan="3">Generating report...</td></tr>';
    if (pnlChartInstance) pnlChartInstance.destroy();
}

// ইভেন্ট লিসেনার সেটআপ
function setupEventListeners() {
    const timePeriodButtons = {
        'btn-today': 'today',
        'btn-this-week': 'week',
        'btn-this-month': 'month',
        'btn-this-year': 'year'
    };

    Object.keys(timePeriodButtons).forEach(btnId => {
        const button = document.getElementById(btnId);
        button.addEventListener('click', (e) => {
            document.querySelectorAll('.time-filter-btn.active').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const periodKey = timePeriodButtons[btnId];
            const { startDate, endDate } = getPeriodDates(periodKey);
            
            startDateInput.valueAsDate = startDate;
            endDateInput.valueAsDate = endDate;
            
            generatePnlReport(startDate, endDate);
        });
    });

    generateReportBtn.addEventListener('click', () => {
        if (startDateInput.value && endDateInput.value) {
            const startDate = startDateInput.valueAsDate;
            const endDate = endDateInput.valueAsDate;

            // যদি কাস্টম ডেট রেঞ্জ সিলেক্ট করা হয়, তাহলে অন্য বাটন থেকে 'active' ক্লাস সরিয়ে দেওয়া
            document.querySelectorAll('.time-filter-btn.active').forEach(b => b.classList.remove('active'));

            generatePnlReport(startDate, endDate);
        } else {
            alert("Please select both start and end dates.");
        }
    });

    logoutBtn.addEventListener('click', () => signOut(auth).catch(err => console.error("Logout error", err)));
    mobileMenuBtn.addEventListener('click', () => mainNavLinks.classList.toggle('mobile-nav-active'));
}