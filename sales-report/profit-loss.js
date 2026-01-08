// sales-report/profit-loss.js (v7.0 - Detailed Breakdown View)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import {
    collection, getDocs, query, where, Timestamp, orderBy
} from 'firebase/firestore';

// ==========================================================
// --- DOM Elements ---
// ==========================================================
// Ledger Elements
const dispRevenue = document.getElementById('disp-revenue');
const dispTotalIncome = document.getElementById('disp-total-income');
const expenseListContainer = document.getElementById('expense-list-container');
const dispTotalExpense = document.getElementById('disp-total-expense');

// Summary Boxes
const pnlResultBox = document.getElementById('pnl-result-box');
const pnlLabel = document.getElementById('pnl-label');
const pnlAmount = document.getElementById('pnl-amount');
const stockAssetAmount = document.getElementById('stock-asset-amount');

// Detailed Table
const detailedExpenseBody = document.getElementById('detailed-expense-body');

const displayPeriodRange = document.getElementById('display-period-range');
const pnlChartCtx = document.getElementById('pnlChart').getContext('2d');
let pnlChartInstance;

// Filters & Controls
const btnToday = document.getElementById('btn-today');
const btnThisWeek = document.getElementById('btn-this-week');
const btnThisMonth = document.getElementById('btn-this-month');
const btnThisYear = document.getElementById('btn-this-year');
const generateReportBtn = document.getElementById('generate-report-btn');
const printReportBtn = document.getElementById('print-report-btn');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');

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

        // Process Sales (Revenue & COGS)
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

        // Process Expenses (Categorize & List)
        let totalOtherExpenses = 0;
        const expenseCategoryMap = {};
        const detailedExpenses = [];
        
        expensesSnap.forEach(doc => {
            const exp = doc.data();
            // Filter out 'Inventory Purchase' to avoid double counting with COGS
            if (exp.category?.toLowerCase() !== 'inventory purchase') {
                const amount = exp.amount || 0;
                totalOtherExpenses += amount;
                
                // For Category Summary
                const catName = exp.category || 'Other';
                expenseCategoryMap[catName] = (expenseCategoryMap[catName] || 0) + amount;

                // For Detailed List
                detailedExpenses.push({
                    date: exp.date.toDate(),
                    category: exp.category,
                    desc: exp.description,
                    amount: amount
                });
            }
        });

        const totalExpenses = totalCogs + totalOtherExpenses;
        const netProfit = totalRevenue - totalExpenses;

        // Update All Views
        updateLedgerView(totalRevenue, totalCogs, expenseCategoryMap, totalExpenses, netProfit, stockValue);
        updateDetailedExpenseTable(detailedExpenses);
        updateChart(totalRevenue, totalExpenses, netProfit);

    } catch (error) {
        console.error(error);
    } finally {
        document.body.style.cursor = 'default';
    }
}

// ==========================================================
// --- View 1: Split Column Ledger (Category Breakdown) ---
// ==========================================================
function updateLedgerView(revenue, cogs, expenseMap, totalExpenses, netProfit, stockValue) {
    const fmt = n => `₹${n.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;

    // 1. Income Column
    dispRevenue.textContent = fmt(revenue);
    dispTotalIncome.textContent = fmt(revenue);

    // 2. Expense Column
    expenseListContainer.innerHTML = `
        <div class="ledger-item">
            <span>Cost of Goods Sold (Product Cost)</span>
            <span class="amount">${fmt(cogs)}</span>
        </div>
    `;

    // Sort categories by amount desc
    const sortedCategories = Object.entries(expenseMap).sort((a, b) => b[1] - a[1]);

    for (const [name, amount] of sortedCategories) {
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

    // 4. Asset Box
    stockAssetAmount.textContent = fmt(stockValue);
}

// ==========================================================
// --- View 2: Detailed Expense Table (Bottom Sheet) ---
// ==========================================================
function updateDetailedExpenseTable(expenses) {
    detailedExpenseBody.innerHTML = '';

    if (expenses.length === 0) {
        detailedExpenseBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:#777;">No expenses found in this period.</td></tr>';
        return;
    }

    // Sort by date desc
    expenses.sort((a, b) => b.date - a.date);

    // Group by Date for better readability
    const grouped = expenses.reduce((acc, exp) => {
        const dateStr = exp.date.toLocaleDateString('en-IN', { 
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' 
        });
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(exp);
        return acc;
    }, {});

    // Render grouped expenses
    for (const [dateStr, dayExpenses] of Object.entries(grouped)) {
        // Date Header Row
        const headerRow = document.createElement('tr');
        headerRow.classList.add('group-date-row');
        headerRow.innerHTML = `<td colspan="4">${dateStr}</td>`;
        detailedExpenseBody.appendChild(headerRow);

        // Expense Rows for that day
        dayExpenses.forEach(exp => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${exp.date.toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'})}</td>
                <td>${exp.category || 'Other'}</td>
                <td>${exp.desc || 'N/A'}</td>
                <td class="text-right">₹${exp.amount.toFixed(2)}</td>
            `;
            detailedExpenseBody.appendChild(tr);
        });
    }
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
}