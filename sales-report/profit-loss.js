// profit-loss.js

import { db, collection, getDocs, query, where, orderBy, Timestamp } from '../js/firebase-config.js';

// DOM এলিমেন্টস
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

// তারিখ হিসাব করার ফাংশন
function getPeriodDates(period) {
    const now = new Date();
    let startDate, endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    switch (period) {
        case 'week':
            startDate = new Date(now.setDate(now.getDate() - now.getDay()));
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'year':
            startDate = new Date(now.getFullYear(), 0, 1);
            break;
    }
    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
}

// মূল রিপোর্ট জেনারেট করার ফাংশন
async function generatePnlReport(startDate, endDate) {
    try {
        const [salesSnap, productsSnap, expensesSnap] = await Promise.all([
            getDocs(query(collection(db, 'sales'), where('createdAt', '>=', startDate), where('createdAt', '<=', endDate))),
            getDocs(collection(db, 'products')),
            getDocs(query(collection(db, 'expenses'), where('date', '>=', startDate), where('date', '<=', endDate)))
        ]);

        const productsData = {};
        productsSnap.forEach(doc => productsData[doc.id] = doc.data());

        let totalRevenue = 0;
        let totalCogs = 0;

        salesSnap.forEach(doc => {
            const sale = doc.data();
            totalRevenue += sale.total;
            sale.items.forEach(item => {
                const product = productsData[item.id];
                if (product && product.cp) {
                    totalCogs += product.cp * item.quantity;
                }
            });
        });

        let totalInventoryExpenses = 0;
        let totalOtherExpenses = 0;
        const inventoryPurchases = [];
        const otherExpenses = [];

        expensesSnap.forEach(doc => {
            const expense = doc.data();
            if (expense.category === 'inventory_purchase') {
                totalInventoryExpenses += expense.amount;
                inventoryPurchases.push(expense);
            } else {
                totalOtherExpenses += expense.amount;
                otherExpenses.push(expense);
            }
        });

        const grossProfit = totalRevenue - totalCogs;
        const totalExpenses = totalInventoryExpenses + totalOtherExpenses;
        const netProfit = grossProfit - totalExpenses;

        // UI আপডেট
        totalRevenueEl.textContent = `₹${totalRevenue.toFixed(2)}`;
        totalCogsEl.textContent = `₹${totalCogs.toFixed(2)}`;
        grossProfitEl.textContent = `₹${grossProfit.toFixed(2)}`;
        totalOtherExpensesEl.textContent = `₹${totalExpenses.toFixed(2)}`;
        netProfitLossEl.textContent = `₹${netProfit.toFixed(2)}`;

        netProfitLossCard.classList.toggle('profit', netProfit >= 0);
        netProfitLossCard.classList.toggle('loss', netProfit < 0);
        
        // তালিকা আপডেট
        updateExpenseTables(inventoryPurchases, otherExpenses);
        
        // চার্ট আপডেট
        updateChart(totalRevenue, totalCogs, totalExpenses, netProfit);

    } catch (error) {
        console.error("Error generating P&L report:", error);
    }
}

function updateExpenseTables(inventory, others) {
    inventoryPurchasesList.innerHTML = '';
    others.forEach(exp => {
        const row = `<tr>
            <td>${exp.date.toDate().toLocaleDateString()}</td>
            <td>${exp.description}</td>
            <td>₹${exp.amount.toFixed(2)}</td>
        </tr>`;
        if (exp.category === 'inventory_purchase') {
            inventoryPurchasesList.innerHTML += row;
        }
    });

    otherExpensesList.innerHTML = '';
    others.forEach(exp => {
        const row = `<tr>
            <td>${exp.date.toDate().toLocaleDateString()}</td>
            <td>${exp.description}</td>
            <td>₹${exp.amount.toFixed(2)}</td>
        </tr>`;
        otherExpensesList.innerHTML += row;
    });

    if (inventoryPurchasesList.innerHTML === '') inventoryPurchasesList.innerHTML = `<tr><td colspan="3">No inventory purchases in this period.</td></tr>`;
    if (otherExpensesList.innerHTML === '') otherExpensesList.innerHTML = `<tr><td colspan="3">No other expenses in this period.</td></tr>`;
}


function updateChart(revenue, cogs, expenses, netProfit) {
    if (pnlChartInstance) pnlChartInstance.destroy();

    pnlChartInstance = new Chart(pnlChartCtx, {
        type: 'bar',
        data: {
            labels: ['Summary'],
            datasets: [
                { label: 'Revenue', data: [revenue], backgroundColor: '#17a2b8' },
                { label: 'COGS', data: [cogs], backgroundColor: '#ffc107' },
                { label: 'Expenses', data: [expenses], backgroundColor: '#dc3545' },
                { label: 'Net Profit', data: [netProfit], backgroundColor: '#28a745' }
            ]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// ইভেন্ট লিসনার
function setupEventListeners() {
    const buttons = [btnThisWeek, btnThisMonth, btnThisYear];
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            buttons.forEach(b => b.classList.remove('active'));
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
        if (startDate && endDate) {
            endDate.setHours(23, 59, 59, 999);
            generatePnlReport(startDate, endDate);
        }
    });
}

// পেজ লোড হলে ডিফল্টভাবে "This Month" রিপোর্ট দেখানো
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    btnThisMonth.click();
});