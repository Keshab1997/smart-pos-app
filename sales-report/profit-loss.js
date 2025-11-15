// sales-report/profit-loss.js (চূড়ান্ত এবং সম্পূর্ণ আপডেট করা)

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
const totalCanceledSalesEl = document.getElementById('total-canceled-sales'); // নতুন যোগ করা হয়েছে
const grossProfitEl = document.getElementById('gross-profit');
const closingStockValueEl = document.getElementById('closing-stock-value');
const totalOtherExpensesEl = document.getElementById('total-other-expenses');
const netProfitLossEl = document.getElementById('net-profit-loss');
const netProfitLossCard = document.getElementById('net-profit-loss-card');

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

// তারিখের পিরিয়ড হিসাব করার ফাংশন
function getPeriodDates(period) {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date(now);

    switch (period) {
        case 'today':
            startDate = new Date(now);
            break;
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

async function calculateClosingStockValue() {
    if (!currentUserId) return 0;
    const inventoryCollectionRef = collection(db, 'shops', currentUserId, 'inventory');
    let totalStockValue = 0;
    try {
        const inventorySnap = await getDocs(inventoryCollectionRef);
        inventorySnap.forEach(doc => {
            const product = doc.data();
            const stock = product.stock || 0;
            // inventory.js অনুযায়ী costPrice ব্যবহার করা হয়েছে
            const costPrice = product.costPrice || product.purchasePrice || 0;
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
        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        const salesQuery = query(collection(db, 'shops', currentUserId, 'sales'), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp));
        const expensesQuery = query(collection(db, 'shops', currentUserId, 'expenses'), where('date', '>=', startTimestamp), where('date', '<=', endTimestamp));
        
        // Promise.all ব্যবহার করে ডেটা দ্রুত আনা হচ্ছে
        const [salesSnap, expensesSnap, closingStockValue] = await Promise.all([
            getDocs(salesQuery),
            getDocs(expensesQuery),
            calculateClosingStockValue()
        ]);
        
        let totalRevenue = 0;
        let totalCogs = 0;
        let totalCanceledSales = 0; // === নতুন ভেরিয়েবল ===

        salesSnap.forEach(doc => {
            const sale = doc.data();

            // ===== START: ক্যানসেল হওয়া বিলের জন্য নতুন লজিক =====
            if (sale.status === 'canceled') {
                totalCanceledSales += sale.total || 0;
                return; // এই বিলের হিসাব Revenue বা COGS-এ যোগ হবে না
            }
            // ===== END: নতুন লজিক =====

            totalRevenue += sale.total || 0;

            if (Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    // আইটেমের মধ্যে purchasePrice বা costPrice আছে কিনা চেক করা হচ্ছে
                    const costPrice = item.purchasePrice || item.costPrice || 0;
                    totalCogs += costPrice * (item.quantity || 0);
                });
            }
        });

        let totalOtherExpenses = 0;
        const otherExpenses = [];
        
        expensesSnap.forEach(doc => {
            const expense = doc.data();
            // ইনভেন্টরি কেনার খরচ বাদ দিয়ে অন্যান্য খরচ হিসাব করা হচ্ছে
            if (expense.category !== 'inventory_purchase') {
                totalOtherExpenses += expense.amount || 0;
                otherExpenses.push(expense);
            }
        });

        const grossProfit = totalRevenue - totalCogs;
        const netProfit = grossProfit - totalOtherExpenses;

        // UI আপডেটে totalCanceledSales পাস করা হচ্ছে
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

// === updateKpiCards ফাংশন আপডেট করা হয়েছে ===
function updateKpiCards(revenue, cogs, canceledSales, gross, stockValue, expenses, net) {
    const format = (num) => `₹${num.toFixed(2)}`;
    totalRevenueEl.textContent = format(revenue);
    totalCogsEl.textContent = format(cogs);
    totalCanceledSalesEl.textContent = format(canceledSales); // নতুন কার্ডের মান সেট করা
    grossProfitEl.textContent = format(gross);
    closingStockValueEl.textContent = format(stockValue);
    totalOtherExpensesEl.textContent = format(expenses);
    netProfitLossEl.textContent = format(net);

    netProfitLossCard.classList.remove('profit', 'loss', 'net-profit', 'net-loss');
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
            <td>₹${(exp.amount || 0).toFixed(2)}</td>
        </tr>`;
        otherExpensesList.innerHTML += row;
    });
}

function updateChart(revenue, cogs, expenses, netProfit) {
    if (pnlChartInstance) pnlChartInstance.destroy();

    pnlChartInstance = new Chart(pnlChartCtx, {
        type: 'bar',
        data: {
            labels: ['Revenue', 'COGS', 'Expenses', 'Net Profit'],
            datasets: [{
                label: 'Amount (₹)',
                data: [revenue, cogs, expenses, netProfit],
                backgroundColor: [
                    '#4CAF50',
                    '#FFC107',
                    '#F44336',
                    netProfit >= 0 ? '#2196F3' : '#D32F2F'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function resetUI() {
    const loadingText = '₹0.00';
    totalRevenueEl.textContent = loadingText;
    totalCogsEl.textContent = loadingText;
    totalCanceledSalesEl.textContent = loadingText; // রিসেট করা
    grossProfitEl.textContent = loadingText;
    closingStockValueEl.textContent = loadingText;
    totalOtherExpensesEl.textContent = loadingText;
    netProfitLossEl.textContent = loadingText;
    
    netProfitLossCard.classList.remove('profit', 'loss');
    otherExpensesList.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
    if (pnlChartInstance) pnlChartInstance.destroy();
}

// ইভেন্ট লিসেনার সেটআপ
function setupEventListeners() {
    const timePeriodButtons = [btnToday, btnThisWeek, btnThisMonth, btnThisYear];
    timePeriodButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            timePeriodButtons.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const periodKey = e.target.id.replace('btn-', '');
            const { startDate, endDate } = getPeriodDates(periodKey);
            
            startDateInput.valueAsDate = startDate;
            endDateInput.valueAsDate = new Date(); // সবসময় আজকের তারিখ পর্যন্ত
            
            generatePnlReport(startDate, new Date());
        });
    });

    generateReportBtn.addEventListener('click', () => {
        if (startDateInput.value && endDateInput.value) {
            const startDate = startDateInput.valueAsDate;
            const endDate = endDateInput.valueAsDate;
            endDate.setHours(23, 59, 59, 999);
            timePeriodButtons.forEach(b => b.classList.remove('active'));
            generatePnlReport(startDate, endDate);
        } else {
            alert("Please select both start and end dates.");
        }
    });

    logoutBtn.addEventListener('click', () => signOut(auth));
    mobileMenuBtn.addEventListener('click', () => mainNavLinks.classList.toggle('mobile-nav-active'));
}