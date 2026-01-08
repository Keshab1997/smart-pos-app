// expense.js (v2.0 - Daily Sheet System)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { 
    collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, Timestamp 
} from 'firebase/firestore';

// ==========================================
// --- DOM Elements ---
// ==========================================
const addExpenseForm = document.getElementById('add-expense-form');
const entryDate = document.getElementById('entry-date');
const entryCategory = document.getElementById('entry-category');
const entryDesc = document.getElementById('entry-desc');
const entryAmount = document.getElementById('entry-amount');
const btnAddCategory = document.getElementById('btn-add-category');
const btnAddDesc = document.getElementById('btn-add-desc');

const filterDateFrom = document.getElementById('filter-date-from');
const filterDateTo = document.getElementById('filter-date-to');
const btnApplyFilter = document.getElementById('btn-apply-filter');
const btnResetFilter = document.getElementById('btn-reset-filter');
const btnPrintSheet = document.getElementById('btn-print-sheet');

const expenseSheetBody = document.getElementById('expense-sheet-body');
const displayTotalExpense = document.getElementById('display-total-expense');
const sheetPeriodLabel = document.getElementById('sheet-period-label');

const logoutBtn = document.getElementById('logout-btn');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mainNavLinks = document.querySelector('header nav ul');

let currentUserId = null;
let allExpenses = [];

// ==========================================
// --- Auth & Initial Load ---
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        setDefaultDate();
        loadExpenses(); 
    } else {
        window.location.href = '../index.html';
    }
});

function setDefaultDate() {
    // Set form date to today by default
    const today = new Date().toISOString().split('T')[0];
    entryDate.value = today;
}

// ==========================================
// --- 1. Add New Expense Logic ---
// ==========================================
addExpenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserId) return;

    const dateVal = new Date(entryDate.value);
    const categoryVal = entryCategory.value;
    const descVal = entryDesc.value;
    const amountVal = parseFloat(entryAmount.value);

    // Validation
    if (!categoryVal || !descVal || isNaN(amountVal)) {
        alert("Please fill all fields correctly.");
        return;
    }

    try {
        const btn = addExpenseForm.querySelector('button[type="submit"]');
        btn.textContent = "Saving...";
        btn.disabled = true;

        await addDoc(collection(db, 'shops', currentUserId, 'expenses'), {
            date: Timestamp.fromDate(dateVal),
            category: categoryVal,
            description: descVal,
            amount: amountVal,
            createdAt: Timestamp.now()
        });

        // Reset form but keep date
        entryCategory.value = "";
        entryDesc.value = "";
        entryAmount.value = "";
        
        btn.textContent = "Save Expense";
        btn.disabled = false;

        // Reload table
        loadExpenses();

    } catch (error) {
        console.error("Error adding expense:", error);
        alert("Error adding expense.");
    }
});

// --- Dynamic Category (+ Icon) ---
btnAddCategory.addEventListener('click', () => {
    const newCat = prompt("Enter new Category Name:");
    if (newCat && newCat.trim() !== "") {
        const option = document.createElement("option");
        option.value = newCat.trim();
        option.text = newCat.trim();
        option.selected = true;
        entryCategory.add(option);
    }
});

// --- Dynamic Description (+ Icon) ---
btnAddDesc.addEventListener('click', () => {
    const commonPurposes = [
        "Buying Stock (Mal Kena)",
        "Daily Tiffin",
        "Shop Cleaning",
        "Electricity Bill",
        "Van/Rickshaw Fare"
    ];
    let msg = "Choose a common purpose (enter number):\n";
    commonPurposes.forEach((p, i) => msg += `${i+1}. ${p}\n`);
    
    const choice = prompt(msg);
    const index = parseInt(choice) - 1;
    
    if (!isNaN(index) && commonPurposes[index]) {
        entryDesc.value = commonPurposes[index];
    }
});

// ==========================================
// --- 2. Load & Display Logic (Daily Sheet) ---
// ==========================================
async function loadExpenses(fromDate = null, toDate = null) {
    if (!currentUserId) return;
    expenseSheetBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Loading records...</td></tr>`;

    try {
        const expensesRef = collection(db, 'shops', currentUserId, 'expenses');
        let q = query(expensesRef, orderBy('date', 'desc'));

        const snapshot = await getDocs(q);
        
        allExpenses = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            jsDate: doc.data().date.toDate() // Helper for sorting/filtering
        }));

        // Client-side filtering if dates provided
        if (fromDate && toDate) {
            const fDate = new Date(fromDate); fDate.setHours(0,0,0,0);
            const tDate = new Date(toDate); tDate.setHours(23,59,59,999);
            
            allExpenses = allExpenses.filter(exp => 
                exp.jsDate >= fDate && exp.jsDate <= tDate
            );
            sheetPeriodLabel.textContent = `${fDate.toLocaleDateString()} to ${tDate.toLocaleDateString()}`;
        } else {
            sheetPeriodLabel.textContent = "All Records (Recent)";
        }

        renderExpenseSheet(allExpenses);

    } catch (error) {
        console.error("Load error:", error);
        expenseSheetBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Error loading data. Check console.</td></tr>`;
    }
}

function renderExpenseSheet(data) {
    expenseSheetBody.innerHTML = "";
    
    if (data.length === 0) {
        expenseSheetBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No expenses found.</td></tr>`;
        displayTotalExpense.textContent = "₹0.00";
        return;
    }

    // Group by Date
    const grouped = data.reduce((acc, exp) => {
        const dateStr = exp.jsDate.toLocaleDateString('en-IN', { 
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' 
        });
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(exp);
        return acc;
    }, {});

    let grandTotal = 0;

    // Iterate through grouped dates
    for (const [dateStr, expenses] of Object.entries(grouped)) {
        // 1. Date Header Row
        const headerRow = document.createElement('tr');
        headerRow.classList.add('date-header-row');
        headerRow.innerHTML = `<td colspan="5">${dateStr}</td>`;
        expenseSheetBody.appendChild(headerRow);

        let dayTotal = 0;

        // 2. Expense Rows for that day
        expenses.forEach(exp => {
            dayTotal += exp.amount;
            grandTotal += exp.amount;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${exp.jsDate.toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'})}</td>
                <td>${exp.category}</td>
                <td>${exp.description}</td>
                <td class="text-right">₹${exp.amount.toFixed(2)}</td>
                <td class="no-print" style="text-align:center;">
                    <button class="btn-delete">Delete</button>
                </td>
            `;
            
            // Add event listener for delete
            tr.querySelector('.btn-delete').addEventListener('click', () => deleteExpense(exp.id));
            
            expenseSheetBody.appendChild(tr);
        });

        // 3. Day Subtotal
        const subRow = document.createElement('tr');
        subRow.style.backgroundColor = '#fff';
        subRow.style.fontWeight = 'bold';
        subRow.innerHTML = `
            <td colspan="3" style="text-align:right; border-top:none;">Total for ${dateStr.split(',')[0]}:</td>
            <td class="text-right" style="border-top:1px solid #999;">₹${dayTotal.toFixed(2)}</td>
            <td class="no-print"></td>
        `;
        expenseSheetBody.appendChild(subRow);
    }

    displayTotalExpense.textContent = `₹${grandTotal.toFixed(2)}`;
}

// ==========================================
// --- 3. Filter & Print Logic ---
// ==========================================
btnApplyFilter.addEventListener('click', () => {
    if (filterDateFrom.value && filterDateTo.value) {
        loadExpenses(filterDateFrom.value, filterDateTo.value);
    } else {
        alert("Please select both From and To dates.");
    }
});

btnResetFilter.addEventListener('click', () => {
    filterDateFrom.value = "";
    filterDateTo.value = "";
    loadExpenses();
});

btnPrintSheet.addEventListener('click', () => {
    window.print();
});

// ==========================================
// --- 4. Delete Helper ---
// ==========================================
async function deleteExpense(id) {
    if (confirm("Are you sure you want to delete this entry?")) {
        try {
            await deleteDoc(doc(db, 'shops', currentUserId, 'expenses', id));
            // Reload keeping current filters if any
            if(filterDateFrom.value && filterDateTo.value) {
                loadExpenses(filterDateFrom.value, filterDateTo.value);
            } else {
                loadExpenses();
            }
        } catch (error) {
            console.error("Delete failed", error);
            alert("Could not delete.");
        }
    }
}

// ==========================================
// --- Navbar Logic ---
// ==========================================
logoutBtn.addEventListener('click', () => signOut(auth));
if(mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => mainNavLinks.classList.toggle('mobile-nav-active'));
}