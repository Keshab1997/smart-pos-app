// expense.js (v3.0 - Add, Edit & Delete)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { 
    collection, addDoc, getDocs, query, orderBy, deleteDoc, updateDoc, doc, Timestamp 
} from 'firebase/firestore';

// ==========================================
// --- DOM Elements ---
// ==========================================
const addExpenseForm = document.getElementById('add-expense-form');
const formTitle = document.getElementById('form-title');
const editExpenseId = document.getElementById('edit-expense-id');

const entryDate = document.getElementById('entry-date');
const entryCategory = document.getElementById('entry-category');
const entryDesc = document.getElementById('entry-desc');
const entryAmount = document.getElementById('entry-amount');

const btnAddCategory = document.getElementById('btn-add-category');
const btnAddDesc = document.getElementById('btn-add-desc');
const btnSaveExpense = document.getElementById('btn-save-expense');
const btnCancelEdit = document.getElementById('btn-cancel-edit');

const filterDateFrom = document.getElementById('filter-date-from');
const filterDateTo = document.getElementById('filter-date-to');
const btnApplyFilter = document.getElementById('btn-apply-filter');
const btnResetFilter = document.getElementById('btn-reset-filter');
const btnPrintSheet = document.getElementById('btn-print-sheet');

const expenseSheetBody = document.getElementById('expense-sheet-body');
const displayTotalExpense = document.getElementById('display-total-expense');
const sheetPeriodLabel = document.getElementById('sheet-period-label');

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
    const today = new Date().toISOString().split('T')[0];
    if(entryDate) entryDate.value = today;
}

// ==========================================
// --- 1. Add / Update Expense Logic ---
// ==========================================
if(addExpenseForm) {
    addExpenseForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUserId) return;

        const dateVal = new Date(entryDate.value);
        const categoryVal = entryCategory.value;
        const descVal = entryDesc.value;
        const amountVal = parseFloat(entryAmount.value);
        const editId = editExpenseId.value;

        if (!categoryVal || !descVal || isNaN(amountVal)) {
            alert("Please fill all fields correctly.");
            return;
        }

        try {
            btnSaveExpense.textContent = editId ? "Updating..." : "Saving...";
            btnSaveExpense.disabled = true;

            const expenseData = {
                date: Timestamp.fromDate(dateVal),
                category: categoryVal,
                description: descVal,
                amount: amountVal,
                updatedAt: Timestamp.now()
            };

            if (editId) {
                const expenseRef = doc(db, 'shops', currentUserId, 'expenses', editId);
                await updateDoc(expenseRef, expenseData);
                alert("Expense updated successfully!");
            } else {
                expenseData.createdAt = Timestamp.now();
                await addDoc(collection(db, 'shops', currentUserId, 'expenses'), expenseData);
            }

            resetForm();
            loadExpenses();

        } catch (error) {
            console.error("Error saving expense:", error);
            alert("Error saving expense: " + error.message);
        } finally {
            btnSaveExpense.disabled = false;
        }
    });
}

function resetForm() {
    entryCategory.value = "";
    entryDesc.value = "";
    entryAmount.value = "";
    editExpenseId.value = "";
    
    formTitle.textContent = "Add New Expense";
    btnSaveExpense.textContent = "Save Expense";
    btnCancelEdit.style.display = "none";
    
    setDefaultDate();
}

if(btnCancelEdit) {
    btnCancelEdit.addEventListener('click', resetForm);
}

// --- Dynamic Category (+ Icon) ---
if(btnAddCategory) {
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
}

// --- Dynamic Description (+ Icon) ---
if(btnAddDesc) {
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
}

// ==========================================
// --- 2. Load & Display Logic ---
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
            jsDate: doc.data().date.toDate()
        }));

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

    const grouped = data.reduce((acc, exp) => {
        const dateStr = exp.jsDate.toLocaleDateString('en-IN', { 
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' 
        });
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(exp);
        return acc;
    }, {});

    let grandTotal = 0;

    for (const [dateStr, expenses] of Object.entries(grouped)) {
        const headerRow = document.createElement('tr');
        headerRow.classList.add('date-header-row');
        headerRow.innerHTML = `<td colspan="5">${dateStr}</td>`;
        expenseSheetBody.appendChild(headerRow);

        let dayTotal = 0;

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
                    <button class="btn-edit" data-id="${exp.id}">Edit</button>
                    <button class="btn-delete" data-id="${exp.id}">Delete</button>
                </td>
            `;
            
            tr.querySelector('.btn-edit').addEventListener('click', function() {
                prepareEdit(this.getAttribute('data-id'));
            });

            tr.querySelector('.btn-delete').addEventListener('click', function() {
                deleteExpense(this.getAttribute('data-id'));
            });
            
            expenseSheetBody.appendChild(tr);
        });

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
// --- 3. Edit Helper Function ---
// ==========================================
function prepareEdit(id) {
    const expense = allExpenses.find(e => e.id === id);
    if (!expense) return;

    entryDate.value = expense.jsDate.toISOString().split('T')[0];
    entryCategory.value = expense.category;
    entryDesc.value = expense.description;
    entryAmount.value = expense.amount;
    editExpenseId.value = id;

    formTitle.textContent = "Edit Expense";
    btnSaveExpense.textContent = "Update Expense";
    btnCancelEdit.style.display = "inline-block";

    document.querySelector('.add-expense-section').scrollIntoView({ behavior: 'smooth' });
}

// ==========================================
// --- 4. Delete Helper Function ---
// ==========================================
async function deleteExpense(id) {
    if (confirm("Are you sure you want to delete this entry?")) {
        try {
            await deleteDoc(doc(db, 'shops', currentUserId, 'expenses', id));
            
            if(editExpenseId.value === id) {
                resetForm();
            }

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
// --- 5. Filter & Print Logic ---
// ==========================================
if(btnApplyFilter) {
    btnApplyFilter.addEventListener('click', () => {
        if (filterDateFrom.value && filterDateTo.value) {
            loadExpenses(filterDateFrom.value, filterDateTo.value);
        } else {
            alert("Please select both From and To dates.");
        }
    });
}

if(btnResetFilter) {
    btnResetFilter.addEventListener('click', () => {
        filterDateFrom.value = "";
        filterDateTo.value = "";
        loadExpenses();
    });
}

if(btnPrintSheet) {
    btnPrintSheet.addEventListener('click', () => {
        window.print();
    });
}