import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

// DOM Elements
const totalExpenseEl = document.getElementById('total-expense');
const topCategoryEl = document.getElementById('top-category');
const expenseCountEl = document.getElementById('expense-count');

const categoryPieChartCtx = document.getElementById('categoryPieChart').getContext('2d');
const monthlyExpenseChartCtx = document.getElementById('monthlyExpenseChart').getContext('2d');
const expenseTableBody = document.getElementById('expense-table-body');

const filterForm = document.getElementById('filter-form');
const dateFromInput = document.getElementById('date-from');
const dateToInput = document.getElementById('date-to');
const categoryFilterSelect = document.getElementById('filter-category');
const resetFiltersBtn = document.getElementById('reset-filters-btn');

const logoutBtn = document.getElementById('logout-btn');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mainNavLinks = document.getElementById('main-nav-links');

// Global state
let currentUserId = null;
let allExpenses = [];
let categoryPieChartInstance;
let monthlyExpenseChartInstance;

// --- Authentication ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        loadAllExpenses();
    } else {
        window.location.href = '../index.html';
    }
});

// --- Main Data Loading Function ---
async function loadAllExpenses() {
    if (!currentUserId) return;
    expenseTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Loading...</td></tr>`;

    try {
        const expensesRef = collection(db, 'shops', currentUserId, 'expenses');
        const q = query(expensesRef, orderBy('date', 'desc'));
        const querySnapshot = await getDocs(q);

        allExpenses = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // Ensure date is a JS Date object
                date: data.date.toDate()
            };
        });

        populateCategoryFilter();
        renderData(allExpenses);

    } catch (error) {
        console.error("Error loading expenses:", error);
        expenseTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Error loading data.</td></tr>`;
    }
}

// --- Filtering and Rendering ---
function applyFiltersAndRender() {
    const fromDate = dateFromInput.value ? new Date(dateFromInput.value) : null;
    const toDate = dateToInput.value ? new Date(dateToInput.value) : null;
    const category = categoryFilterSelect.value;

    if (fromDate) fromDate.setHours(0, 0, 0, 0);
    if (toDate) toDate.setHours(23, 59, 59, 999);

    const filteredExpenses = allExpenses.filter(expense => {
        const expenseDate = expense.date;
        const isDateMatch = (!fromDate || expenseDate >= fromDate) && (!toDate || expenseDate <= toDate);
        const isCategoryMatch = (category === 'all' || expense.category === category);
        return isDateMatch && isCategoryMatch;
    });

    renderData(filteredExpenses);
}

function renderData(data) {
    renderSummaryCards(data);
    renderCategoryPieChart(data);
    renderMonthlyBarChart(data);
    renderExpenseTable(data);
}

// --- UI Update Functions ---

function renderSummaryCards(data) {
    const total = data.reduce((sum, exp) => sum + exp.amount, 0);
    totalExpenseEl.textContent = `₹${total.toFixed(2)}`;
    
    expenseCountEl.textContent = data.length;

    if (data.length > 0) {
        const categorySpending = data.reduce((acc, exp) => {
            acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
            return acc;
        }, {});

        const topCategory = Object.entries(categorySpending).sort(([,a], [,b]) => b - a)[0];
        topCategoryEl.textContent = `${topCategory[0]} (₹${topCategory[1].toFixed(2)})`;
    } else {
        topCategoryEl.textContent = 'N/A';
    }
}

function renderCategoryPieChart(data) {
    const categoryData = data.reduce((acc, exp) => {
        acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
        return acc;
    }, {});

    const labels = Object.keys(categoryData);
    const values = Object.values(categoryData);

    if (categoryPieChartInstance) {
        categoryPieChartInstance.destroy();
    }
    categoryPieChartInstance = new Chart(categoryPieChartCtx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: ['#007bff', '#dc3545', '#ffc107', '#28a745', '#17a2b8', '#6c757d', '#fd7e14'],
                borderColor: '#fff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' }
            }
        }
    });
}

function renderMonthlyBarChart(data) {
    const monthlyData = data.reduce((acc, exp) => {
        const month = exp.date.toLocaleString('default', { month: 'short', year: 'numeric' });
        acc[month] = (acc[month] || 0) + exp.amount;
        return acc;
    }, {});
    
    // Sort months chronologically
    const sortedMonths = Object.keys(monthlyData).sort((a, b) => new Date(a) - new Date(b));

    const labels = sortedMonths;
    const values = sortedMonths.map(month => monthlyData[month]);

    if (monthlyExpenseChartInstance) {
        monthlyExpenseChartInstance.destroy();
    }
    monthlyExpenseChartInstance = new Chart(monthlyExpenseChartCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Expense',
                data: values,
                backgroundColor: 'rgba(0, 123, 255, 0.7)',
                borderColor: 'rgba(0, 123, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

function renderExpenseTable(data) {
    if (data.length === 0) {
        expenseTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No expenses found for the selected filters.</td></tr>`;
        return;
    }

    expenseTableBody.innerHTML = data.map(exp => `
        <tr>
            <td>${exp.date.toLocaleDateString('en-GB')}</td>
            <td>${exp.description}</td>
            <td>${exp.category}</td>
            <td>₹${exp.amount.toFixed(2)}</td>
        </tr>
    `).join('');
}

// --- Helper Functions ---
function populateCategoryFilter() {
    const categories = [...new Set(allExpenses.map(exp => exp.category))];
    categoryFilterSelect.innerHTML = '<option value="all">All Categories</option>'; // Reset
    categories.sort().forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categoryFilterSelect.appendChild(option);
    });
}


// --- Event Listeners ---
filterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    applyFiltersAndRender();
});

resetFiltersBtn.addEventListener('click', () => {
    filterForm.reset();
    renderData(allExpenses);
});

logoutBtn.addEventListener('click', () => signOut(auth));
mobileMenuBtn.addEventListener('click', () => mainNavLinks.classList.toggle('mobile-nav-active'));