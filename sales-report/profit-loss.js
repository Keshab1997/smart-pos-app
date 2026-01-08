// sales-report/profit-loss.js (v6.0 - Split Column Layout)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, getDocs, query, where, Timestamp
} from 'firebase/firestore';

// ==========================================================
// --- DOM Elements ---
// ==========================================================
// Ledger Elements
const dispRevenue = document.getElementById('disp-revenue');
const dispTotalIncome = document.getElementById('disp-total-income');
const dispCogs = document.getElementById('disp-cogs');
const expenseListContainer = document.getElementById('expense-list-container');
const dispTotalExpense = document.getElementById('disp-total-expense');

// Summary Boxes
const pnlResultBox = document.getElementById('pnl-result-box');
const pnlLabel = document.getElementById('pnl-label');
const pnlAmount = document.getElementById('pnl-amount');
const stockAssetAmount = document.getElementById('stock-asset-amount');

const displayPeriodRange = document.getElementById('display-period-range');
const pnlChartCtx = document.getElementById('pnlChart').getContext('2d');
let pnlChartInstance;

// Filters
const btnToday = document.getElementById('btn-today');
const btnThisWeek = document.getElementById('btn-this-week');
const btnThisMonth = document.getElementById('btn-this-month');
const btnThisYear = document.getElementById('btn-this-year');
const generateReportBtn = document.getElementById('generate-report-btn');
const printReportBtn = document.getElementById('print-report-btn');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');

const logoutBtn = document.getElementById('logout-btn');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mainNavLinks = document.querySelector('header nav .nav-links');

let currentUserId = null;

// ==========================================================
// --- Auth & Init ---
// ==========================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        initializePnlPage();
    } else {
        window.location.href = '../index.html';
    }
});

function initializePnlPage() {
    setupEventListeners();
    btnThisWeek.click();
}

function getPeriodDates(period) {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    switch (period) {
        case 'today': break;
        case 'week':
            const firstDayOfWeek = now.getDate() - now.getDay();
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

// ==========================================================
// --- Helper: Stock Value ---
// ==========================================================
async function calculateClosingStockValue() {
    if (!currentUserId) return 0;
    const inventoryRef = collection(db, 'shops', currentUserId, 'inventory');
    let totalVal = 0;
    try {
        const snap = await getDocs(inventoryRef);
        snap.forEach(doc => {
            const data = doc.data();
            const stock = parseFloat(data.stock) || 0;
            const price = parseFloat(data.purchasePrice) || parseFloat(data.costPrice) || 0;
            if (stock > 0) totalVal += (stock * price);
        });
    } catch (e) { console.error(e); }
    return totalVal;
}

// ==========================================================
// --- Main Generation Logic ---
// ==========================================================
async function generatePnlReport(startDate, endDate) {
    if (!currentUserId) return;
    
    document.body.style.cursor = 'wait';
    displayPeriodRange.textContent = `${startDate.toLocaleDateString('en-IN')} to ${endDate.toLocaleDateString('en-IN')}`;
    
    try {
        endDate.setHours(23, 59, 59, 999);
        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        const salesQuery = query(collection(db, 'shops', currentUserId, 'sales'), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp));
        const expensesQuery = query(collection(db, 'shops', currentUserId, 'expenses'), where('date', '>=', startTimestamp), where('date', '<=', endTimestamp));
        
        const [salesSnap, expensesSnap, stockValue] = await Promise.all([
            getDocs(salesQuery),
            getDocs(expensesQuery),
            calculateClosingStockValue()
        ]);

        let totalRevenue = 0;
        let totalCogs = 0;

        // Process Sales
        salesSnap.forEach(doc => {
            const sale = doc.data();
            if (sale.status === 'canceled') return;
            
            totalRevenue += sale.total || 0;
            if (Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    const cost = item.purchasePrice || item.costPrice || 0;
                    totalCogs += cost * (item.quantity || 0);
                });
            }
        });

        // Process Expenses
        let totalOtherExpenses = 0;
        const expenseMap = {};
        
        expensesSnap.forEach(doc => {
            const exp = doc.data();
            if (exp.category?.toLowerCase() !== 'inventory_purchase') {
                const amount = exp.amount || 0;
                totalOtherExpenses += amount;
                
                const name = exp.description || exp.category || 'Other';
                expenseMap[name] = (expenseMap[name] || 0) + amount;
            }
        });

        const totalExpenses = totalCogs + totalOtherExpenses;
        const netProfit = totalRevenue - totalExpenses;

        // Render UI
        updateLedgerView(totalRevenue, totalCogs, expenseMap, totalExpenses, netProfit, stockValue);
        updateChart(totalRevenue, totalExpenses, netProfit);

    } catch (error) {
        console.error(error);
    } finally {
        document.body.style.cursor = 'default';
    }
}

// ==========================================================
// --- UI Update: Split Column View ---
// ==========================================================
function updateLedgerView(revenue, cogs, expenseMap, totalExpenses, netProfit, stockValue) {
    const fmt = n => `₹${n.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;

    // 1. Income Column
    dispRevenue.textContent = fmt(revenue);
    dispTotalIncome.textContent = fmt(revenue); // Assuming only sales for now

    // 2. Expense Column
    // Reset list, keeping only COGS at top
    expenseListContainer.innerHTML = `
        <div class="ledger-item">
            <span>Cost of Goods Sold (Purchase Price)</span>
            <span class="amount">${fmt(cogs)}</span>
        </div>
    `;

    // Add other expenses
    for (const [name, amount] of Object.entries(expenseMap)) {
        expenseListContainer.innerHTML += `
            <div class="ledger-item">
                <span>${name}</span>
                <span class="amount">${fmt(amount)}</span>
            </div>
        `;
    }

    dispTotalExpense.textContent = fmt(totalExpenses);

    // 3. Profit / Loss Box
    pnlAmount.textContent = fmt(Math.abs(netProfit));
    
    if (netProfit >= 0) {
        pnlLabel.textContent = "NET PROFIT";
        pnlResultBox.className = "summary-box result-box profit";
    } else {
        pnlLabel.textContent = "NET LOSS";
        pnlResultBox.className = "summary-box result-box loss";
    }

    // 4. Stock Asset Box
    stockAssetAmount.textContent = fmt(stockValue);
}

// ==========================================================
// --- Chart ---
// ==========================================================
function updateChart(revenue, expenses, netProfit) {
    if (pnlChartInstance) pnlChartInstance.destroy();
    pnlChartInstance = new Chart(pnlChartCtx, {
        type: 'doughnut',
        data: {
            labels: ['Expenses', 'Net Profit'],
            datasets: [{
                data: [expenses, netProfit > 0 ? netProfit : 0],
                backgroundColor: ['#e63946', '#2a9d8f'],
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
        }
    });
}

// ==========================================================
// --- Event Listeners ---
// ==========================================================
function setupEventListeners() {
    const timePeriodButtons = {
        'btn-today': 'today', 'btn-this-week': 'week',
        'btn-this-month': 'month', 'btn-this-year': 'year'
    };

    Object.keys(timePeriodButtons).forEach(btnId => {
        document.getElementById(btnId).addEventListener('click', (e) => {
            document.querySelectorAll('.time-period-buttons .btn.active').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            const { startDate, endDate } = getPeriodDates(timePeriodButtons[btnId]);
            startDateInput.valueAsDate = startDate;
            endDateInput.valueAsDate = endDate;
            generatePnlReport(startDate, endDate);
        });
    });

    generateReportBtn.addEventListener('click', () => {
        if (startDateInput.value && endDateInput.value) {
            document.querySelectorAll('.time-period-buttons .btn.active').forEach(b => b.classList.remove('active'));
            generatePnlReport(startDateInput.valueAsDate, endDateInput.valueAsDate);
        }
    });

    printReportBtn.addEventListener('click', () => window.print());
    logoutBtn.addEventListener('click', () => signOut(auth));
    if(mobileMenuBtn) mobileMenuBtn.addEventListener('click', () => mainNavLinks.classList.toggle('mobile-nav-active'));
}