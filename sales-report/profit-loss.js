// sales-report/profit-loss.js (v9.0 - Added Daily Subtotals & Grand Total)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import {
    collection, getDocs, query, where, Timestamp, orderBy, doc, getDoc
} from 'firebase/firestore';

// ==========================================================
// --- DOM Elements ---
// ==========================================================
const dispRevenue = document.getElementById('disp-revenue');
const dispTotalIncome = document.getElementById('disp-total-income');
const expenseListContainer = document.getElementById('expense-list-container');
const dispTotalExpense = document.getElementById('disp-total-expense');
const displayShopNameEl = document.getElementById('display-shop-name');

const pnlResultBox = document.getElementById('pnl-result-box');
const pnlLabel = document.getElementById('pnl-label');
const pnlAmount = document.getElementById('pnl-amount');
const pnlPercentage = document.getElementById('pnl-percentage');
const stockAssetAmount = document.getElementById('stock-asset-amount');

const detailedExpenseBody = document.getElementById('detailed-expense-body');

const displayPeriodRange = document.getElementById('display-period-range');
const pnlChartCtx = document.getElementById('pnlChart').getContext('2d');
let pnlChartInstance;

const btnToday = document.getElementById('btn-today');
const btnThisWeek = document.getElementById('btn-this-week');
const btnThisMonth = document.getElementById('btn-this-month');
const btnThisYear = document.getElementById('btn-this-year');
const generateReportBtn = document.getElementById('generate-report-btn');
const printReportBtn = document.getElementById('print-report-btn');
const startDateInput = document.getElementById('start-date');
const endDateInput = document.getElementById('end-date');

// Category Toggle Elements
const categoryToggleSection = document.getElementById('category-toggle-section');
const categoryCheckboxes = document.getElementById('category-checkboxes');

const COGS_LABEL = "Cost of Goods Sold (Product Cost)"; // COGS এর জন্য নির্দিষ্ট নাম
let allExpenseData = []; // সব এক্সপেন্স স্টোর করার জন্য
let excludedCategories = new Set(); // কোন ক্যাটাগরি বাদ যাবে তার লিস্ট
let currentReportData = null; // Current report data for recalculation

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
    updateShopName();
    btnThisWeek.click();
}

/**
 * Firestore থেকে দোকানের নাম নিয়ে এসে UI-তে দেখায়
 */
async function updateShopName() {
    if (!currentUserId) return;
    try {
        const shopDocRef = doc(db, 'shops', currentUserId);
        const shopSnap = await getDoc(shopDocRef);

        if (shopSnap.exists()) {
            const shopData = shopSnap.data();
            if (displayShopNameEl) {
                displayShopNameEl.textContent = shopData.shopName || "My Smart Shop";
            }
        } else {
            if (displayShopNameEl) displayShopNameEl.textContent = "Smart POS Store";
        }
    } catch (error) {
        console.error("Error fetching shop name:", error);
        if (displayShopNameEl) displayShopNameEl.textContent = "Smart POS Store";
    }
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
        const cogsDetails = []; 
        const detailedExpenses = [];

        // 1. Process Sales (Revenue & COGS)
        salesSnap.forEach(doc => {
            const sale = doc.data();
            if (sale.status === 'canceled') return;
            totalRevenue += sale.total || 0;
            
            if (Array.isArray(sale.items)) {
                sale.items.forEach(item => {
                    const costPrice = item.purchasePrice || item.costPrice || 0;
                    const qty = item.quantity || 0;
                    const lineCost = costPrice * qty;
                    if (lineCost > 0) {
                        totalCogs += lineCost;
                        cogsDetails.push({
                            date: sale.createdAt ? sale.createdAt.toDate() : new Date(),
                            category: COGS_LABEL, // এখানে লেবেল ব্যবহার করুন
                            desc: `${item.name || item.productName} (Qty: ${qty})`,
                            amount: lineCost,
                            type: 'cogs'
                        });
                    }
                });
            }
        });

        // 2. Process Expenses
        let totalOtherExpenses = 0;
        const expenseCategoryMap = {};
        allExpenseData = []; // রিসেট করুন
        const categoriesFound = new Set();
        
        // যদি COGS থাকে তবে ক্যাটাগরি লিস্টে যোগ করুন
        if (totalCogs > 0) categoriesFound.add(COGS_LABEL);
        
        expensesSnap.forEach(doc => {
            const exp = doc.data();
            const catRaw = exp.category || '';
            const catNormalized = catRaw.toLowerCase().replace(/_/g, ' ').trim();

            // Filter out Inventory Purchase
            if (catNormalized !== 'inventory purchase') {
                allExpenseData.push({ ...exp, id: doc.id }); // সব ডাটা সেভ করে রাখা হচ্ছে
                categoriesFound.add(catRaw || 'Other');
            }
        });

        // Store current report data for recalculation
        currentReportData = {
            totalRevenue,
            totalCogs,
            cogsDetails,
            stockValue
        };

        // ক্যাটাগরি ফিল্টার UI তৈরি করা
        renderCategoryFilters(Array.from(categoriesFound));
        
        // ক্যালকুলেশন ফাংশন কল করা
        calculateAndDisplay();

    } catch (error) {
        console.error(error);
    } finally {
        document.body.style.cursor = 'default';
    }
}

// নতুন ফাংশন: ক্যাটাগরি ফিল্টার UI তৈরি
function renderCategoryFilters(categories) {
    if (categories.length === 0) {
        categoryToggleSection.style.display = 'none';
        return;
    }
    categoryToggleSection.style.display = 'block';
    categoryCheckboxes.innerHTML = '';

    categories.forEach(cat => {
        const isChecked = !excludedCategories.has(cat);
        const div = document.createElement('div');
        div.innerHTML = `
            <label>
                <input type="checkbox" class="cat-toggle" value="${cat}" ${isChecked ? 'checked' : ''}> ${cat}
            </label>
        `;
        categoryCheckboxes.appendChild(div);
    });

    // ইভেন্ট লিসেনার যোগ করা
    document.querySelectorAll('.cat-toggle').forEach(cb => {
        cb.addEventListener('change', (e) => {
            if (e.target.checked) {
                excludedCategories.delete(e.target.value);
            } else {
                excludedCategories.add(e.target.value);
            }
            
            // পুনরায় ক্যালকুলেট করা
            calculateAndDisplay();
        });
    });
}

// ক্যালকুলেশন লজিক আপডেট
function calculateAndDisplay() {
    if (!currentReportData) return;
    
    let filteredOtherExpenses = 0;
    const expenseCategoryMap = {};
    const finalDetailedExpenses = [];

    // ১. সাধারণ এক্সপেন্স ফিল্টার করা
    allExpenseData.forEach(exp => {
        if (!excludedCategories.has(exp.category)) {
            const amount = exp.amount || 0;
            filteredOtherExpenses += amount;
            const catName = exp.category || 'Other';
            expenseCategoryMap[catName] = (expenseCategoryMap[catName] || 0) + amount;
            
            finalDetailedExpenses.push({
                date: exp.date.toDate(),
                category: exp.category,
                desc: exp.description,
                amount: amount,
                type: 'expense'
            });
        }
    });

    // ২. COGS ফিল্টার করা
    let activeCogs = 0;
    if (!excludedCategories.has(COGS_LABEL)) {
        activeCogs = currentReportData.totalCogs;
        // COGS details যোগ করা
        finalDetailedExpenses.push(...currentReportData.cogsDetails);
    }

    const totalExpenses = activeCogs + filteredOtherExpenses;
    const netProfit = currentReportData.totalRevenue - totalExpenses;

    updateLedgerView(currentReportData.totalRevenue, activeCogs, expenseCategoryMap, totalExpenses, netProfit, currentReportData.stockValue);
    
    updateDetailedExpenseTable(finalDetailedExpenses);
    
    updateChart(currentReportData.totalRevenue, totalExpenses, netProfit);
}

function updateLedgerView(revenue, cogs, expenseMap, totalExpenses, netProfit, stockValue) {
    const fmt = n => `₹${n.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    dispRevenue.textContent = fmt(revenue);
    dispTotalIncome.textContent = fmt(revenue);

    expenseListContainer.innerHTML = `
        <div class="ledger-item" style="border-bottom: 2px solid #eee;">
            <span style="font-weight:600; color:#d62828;">Cost of Goods Sold (Product Cost)</span>
            <span class="amount" style="color:#d62828;">${fmt(cogs)}</span>
        </div>
    `;

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
    pnlAmount.textContent = fmt(Math.abs(netProfit));

    // --- Profit Percentage Calculation ---
    const profitPercent = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    if (pnlPercentage) {
        pnlPercentage.textContent = `Profit Margin: ${profitPercent.toFixed(2)}%`;
    }
    
    if (netProfit >= 0) {
        pnlLabel.textContent = "NET PROFIT";
        pnlResultBox.className = "summary-box result-box profit";
        if(pnlPercentage) pnlPercentage.style.display = 'block';
    } else {
        pnlLabel.textContent = "NET LOSS";
        pnlResultBox.className = "summary-box result-box loss";
    }
    stockAssetAmount.textContent = fmt(stockValue);
}

// ==========================================================
// --- View 2: Detailed Expense Table (With Subtotals) ---
// ==========================================================
function updateDetailedExpenseTable(items) {
    detailedExpenseBody.innerHTML = '';
    let grandTotal = 0;

    if (items.length === 0) {
        detailedExpenseBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:15px; color:#777;">No expenses found.</td></tr>';
        return;
    }

    // Sort by date desc
    items.sort((a, b) => b.date - a.date);

    // Group by Date
    const grouped = items.reduce((acc, item) => {
        const dateStr = item.date.toLocaleDateString('en-IN', { 
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' 
        });
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(item);
        return acc;
    }, {});

    // Render grouped items
    for (const [dateStr, dayItems] of Object.entries(grouped)) {
        let dailyTotal = 0;

        // 1. Date Header Row
        const headerRow = document.createElement('tr');
        headerRow.classList.add('group-date-row');
        headerRow.innerHTML = `<td colspan="4" style="background:#f1f3f5; font-weight:bold;">${dateStr}</td>`;
        detailedExpenseBody.appendChild(headerRow);

        // 2. Item Rows
        dayItems.forEach(item => {
            dailyTotal += item.amount;
            grandTotal += item.amount;

            const tr = document.createElement('tr');
            const isCogs = item.type === 'cogs';
            if (isCogs) tr.style.backgroundColor = '#fffafa';

            tr.innerHTML = `
                <td style="color:#666; font-size:0.85rem;">${item.date.toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'})}</td>
                <td style="${isCogs ? 'color:#d62828; font-weight:500;' : ''}">${item.category}</td>
                <td style="font-size:0.85rem;">${item.desc || '-'}</td>
                <td class="text-right">₹${item.amount.toFixed(2)}</td>
            `;
            detailedExpenseBody.appendChild(tr);
        });

        // 3. Daily Subtotal Row
        const subtotalRow = document.createElement('tr');
        subtotalRow.style.backgroundColor = '#fdfdfe';
        subtotalRow.style.fontWeight = 'bold';
        subtotalRow.innerHTML = `
            <td colspan="3" class="text-right" style="color:#555;">Daily Total (${dateStr}):</td>
            <td class="text-right" style="border-top: 1px solid #ccc; color:#000;">₹${dailyTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
        `;
        detailedExpenseBody.appendChild(subtotalRow);
    }

    // 4. Grand Total Row (Footer)
    const grandTotalRow = document.createElement('tr');
    grandTotalRow.style.backgroundColor = '#343a40';
    grandTotalRow.style.color = '#fff';
    grandTotalRow.style.fontWeight = 'bold';
    grandTotalRow.style.fontSize = '1rem';
    grandTotalRow.innerHTML = `
        <td colspan="3" class="text-right">GRAND TOTAL (All Expenses + COGS):</td>
        <td class="text-right">₹${grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
    `;
    detailedExpenseBody.appendChild(grandTotalRow);
}

function updateChart(revenue, expenses, netProfit) {
    if (pnlChartInstance) pnlChartInstance.destroy();
    const profitData = netProfit > 0 ? netProfit : 0;
    pnlChartInstance = new Chart(pnlChartCtx, {
        type: 'doughnut',
        data: {
            labels: ['Total Expenses', 'Net Profit'],
            datasets: [{
                data: [expenses, profitData],
                backgroundColor: ['#e63946', '#2a9d8f'],
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

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