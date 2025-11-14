// sales-report/profit-loss.js (সঠিক হিসাবের জন্য আপডেট করা)

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
const grossProfitEl = document.getElementById('gross-profit');
const totalOtherExpensesEl = document.getElementById('total-other-expenses');
const netProfitLossEl = document.getElementById('net-profit-loss');
const netProfitLossCard = document.querySelector('.kpi-card.net-profit');

const inventoryPurchasesList = document.getElementById('inventory-purchases-list');
const otherExpensesList = document.getElementById('other-expenses-list');

const pnlChartCtx = document.getElementById('pnlChart').getContext('2d');
let pnlChartInstance;

const btnThisWeek = document.getElementById('btn-this-week');
const btnThisMonth = document.getElementById('btn-this-month');
const btnThisYear = document.getElementById('btn-this-year');
const generateReportBtn = document.getElementById('generate-report-btn');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');

const logoutBtn = document.getElementById('logout-btn');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mainNavLinks = document.getElementById('main-nav-links');

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
        window.location.href = '../index.html';
    }
});

// ==========================================================
// --- প্রাথমিক ফাংশন ---
// ==========================================================
function initializePnlPage() {
    setupEventListeners();
    // ডিফল্টভাবে "This Month" রিপোর্ট দেখানো
    btnThisMonth.click();
}

// তারিখের পিরিয়ড হিসাব করার ফাংশন
function getPeriodDates(period) {
    const now = new Date();
    let startDate, endDate = new Date(now);

    switch (period) {
        case 'week':
            const firstDayOfWeek = now.getDate() - now.getDay();
            startDate = new Date(now.setDate(firstDayOfWeek));
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
    }
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    
    return { startDate, endDate };
}

// মূল রিপোর্ট জেনারেট করার ফাংশন
async function generatePnlReport(startDate, endDate) {
    if (!currentUserId) return;

    resetUI();
    
    try {
        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        const salesQuery = query(collection(db, 'shops', currentUserId, 'sales'), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp));
        const inventoryQuery = collection(db, 'shops', currentUserId, 'inventory');
        const expensesQuery = query(collection(db, 'shops', currentUserId, 'expenses'), where('date', '>=', startTimestamp), where('date', '<=', endTimestamp));

        const [salesSnap, inventorySnap, expensesSnap] = await Promise.all([
            getDocs(salesQuery),
            getDocs(inventoryQuery),
            getDocs(expensesQuery)
        ]);

        const inventoryData = {};
        inventorySnap.forEach(doc => inventoryData[doc.id] = doc.data());

        let totalRevenue = 0;
        let totalCogs = 0;

        salesSnap.forEach(doc => {
            const sale = doc.data();
            totalRevenue += sale.total;
            sale.items.forEach(item => {
                const product = inventoryData[item.id];
                if (product && product.costPrice) {
                    totalCogs += product.costPrice * item.quantity;
                }
            });
        });

        // ==========================================================================
        // *** মূল সমাধান এখানে ***
        // এখানে খরচের ক্যাটেগরি চেক করা হচ্ছে। ইনভেন্টরি কেনার খরচ বাদ দেওয়া হচ্ছে।
        // ==========================================================================
        let totalOtherExpenses = 0;
        const otherExpenses = [];
        
        expensesSnap.forEach(doc => {
            const expense = doc.data();
            // যদি খরচের ক্যাটেগরি 'inventory_purchase' না হয়, তবেই এটিকে সাধারণ খরচ হিসেবে ধরা হবে
            if (expense.category !== 'inventory_purchase') {
                totalOtherExpenses += expense.amount;
                otherExpenses.push(expense);
            }
        });
        // ==========================================================================

        const grossProfit = totalRevenue - totalCogs;
        const netProfit = grossProfit - totalOtherExpenses;

        // UI আপডেট
        updateKpiCards(totalRevenue, totalCogs, grossProfit, totalOtherExpenses, netProfit);
        updateExpenseTables([], otherExpenses);
        updateChart(totalRevenue, totalCogs, totalOtherExpenses, netProfit);

    } catch (error) {
        console.error("Error generating P&L report:", error);
    }
}

function updateKpiCards(revenue, cogs, gross, expenses, net) {
    totalRevenueEl.textContent = `₹${revenue.toFixed(2)}`;
    totalCogsEl.textContent = `₹${cogs.toFixed(2)}`;
    grossProfitEl.textContent = `₹${gross.toFixed(2)}`;
    totalOtherExpensesEl.textContent = `₹${expenses.toFixed(2)}`; // এখন এখানে শুধু অন্যান্য খরচ থাকবে
    netProfitLossEl.textContent = `₹${net.toFixed(2)}`;

    netProfitLossCard.classList.remove('profit', 'loss');
    if (net >= 0) {
        netProfitLossCard.classList.add('profit');
    } else {
        netProfitLossCard.classList.add('loss');
    }
}

function updateExpenseTables(inventory, others) {
    inventoryPurchasesList.innerHTML = '<tr><td colspan="3">Inventory purchase cost is included in COGS.</td></tr>';
    
    otherExpensesList.innerHTML = '';
    if (others.length === 0) {
        otherExpensesList.innerHTML = '<tr><td colspan="3">No other expenses found in this period.</td></tr>';
        return;
    }
    others.forEach(exp => {
        const row = `<tr>
            <td>${exp.date.toDate().toLocaleDateString('en-IN')}</td>
            <td>${exp.description || 'N/A'}</td>
            <td>₹${exp.amount.toFixed(2)}</td>
        </tr>`;
        otherExpensesList.innerHTML += row;
    });
}

function updateChart(revenue, cogs, expenses, netProfit) {
    if (pnlChartInstance) pnlChartInstance.destroy();

    pnlChartInstance = new Chart(pnlChartCtx, {
        type: 'bar',
        data: {
            labels: ['Analysis'],
            datasets: [
                { label: 'Revenue', data: [revenue], backgroundColor: 'rgba(54, 162, 235, 0.7)' },
                { label: 'COGS', data: [cogs], backgroundColor: 'rgba(255, 206, 86, 0.7)' },
                { label: 'Other Expenses', data: [expenses], backgroundColor: 'rgba(255, 99, 132, 0.7)' },
                { label: 'Net Profit', data: [netProfit], backgroundColor: 'rgba(75, 192, 192, 0.7)' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

function resetUI() {
    totalRevenueEl.textContent = 'Loading...';
    totalCogsEl.textContent = 'Loading...';
    grossProfitEl.textContent = 'Loading...';
    totalOtherExpensesEl.textContent = 'Loading...';
    netProfitLossEl.textContent = 'Loading...';
    netProfitLossCard.classList.remove('profit', 'loss');
    inventoryPurchasesList.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
    otherExpensesList.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
    if (pnlChartInstance) pnlChartInstance.destroy();
}

// ইভেন্ট লিসেনার সেটআপ
function setupEventListeners() {
    const timePeriodButtons = [btnThisWeek, btnThisMonth, btnThisYear];
    timePeriodButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            timePeriodButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const period = e.target.id.split('-')[2];
            const { startDate, endDate } = getPeriodDates(period);
            
            startDateInput.value = startDate.toISOString().split('T')[0];
            endDateInput.value = endDate.toISOString().split('T')[0];
            
            generatePnlReport(startDate, endDate);
        });
    });

    generateReportBtn.addEventListener('click', () => {
        const startDate = new Date(startDateInput.value);
        const endDate = new Date(endDateInput.value);
        if (startDateInput.value && endDateInput.value) {
            timePeriodButtons.forEach(b => b.classList.remove('active'));
            generatePnlReport(startDate, endDate);
        }
    });

    logoutBtn.addEventListener('click', async () => await signOut(auth));
    mobileMenuBtn.addEventListener('click', () => mainNavLinks.classList.toggle('mobile-nav-active'));
}