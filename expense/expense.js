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
const bulkTbody = document.getElementById('bulk-tbody');
const btnAddBulkRow = document.getElementById('btn-add-bulk-row');
const btnSaveBulk = document.getElementById('btn-save-bulk');

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
            
            // ইনভেন্টরি কি না চেক করা
            const isInventory = exp.category === 'inventory_purchase' || exp.category.toLowerCase().includes('inventory');
            
            if (isInventory) {
                tr.classList.add('row-inventory');       // ইনভেন্টরি হলে লাল
            } else {
                tr.classList.add('row-general-expense'); // অন্য সব খরচ সবুজ
            }

            tr.innerHTML = `
                <td>${exp.jsDate.toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit'})}</td>
                <td>${exp.category}</td>
                <td class="${!isInventory ? 'editable-cell' : ''}" title="${!isInventory ? 'Double click to edit' : ''}">
                    ${exp.description}
                    ${isInventory && exp.quantity ? `<div style="font-size: 0.75rem; color: #666; margin-top: 2px;">
                        (Qty: ${exp.quantity || 0} * CP: ${(exp.unitPrice || (exp.amount / (exp.quantity || 1))).toFixed(2)})
                    </div>` : ''}
                </td>
                <td class="text-right ${!isInventory ? 'editable-cell' : ''}" title="${!isInventory ? 'Double click to edit' : ''}">₹${exp.amount.toFixed(2)}</td>
                <td class="no-print" style="text-align:center;">
                    ${!isInventory ? `
                        <button class="btn-edit" data-id="${exp.id}">Edit</button>
                        <button class="btn-delete" data-id="${exp.id}">Delete</button>
                    ` : '<span style="font-size:0.7rem; color:#bbb;">Locked</span>'}
                </td>
            `;
            
            // --- ইনলাইন এডিট লজিক (Double Click) ---
            if (!isInventory) {
                const descCell = tr.cells[2];
                const amountCell = tr.cells[3];

                descCell.addEventListener('dblclick', () => startInlineEdit(descCell, exp.id, 'description', exp.description));
                amountCell.addEventListener('dblclick', () => startInlineEdit(amountCell, exp.id, 'amount', exp.amount));

                tr.querySelector('.btn-edit').addEventListener('click', () => prepareEdit(exp.id));
                tr.querySelector('.btn-delete').addEventListener('click', () => deleteExpense(exp.id));
            }
            
            expenseSheetBody.appendChild(tr);
        });

        // সাবটোটাল রো
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

    // লুপ শেষ হওয়ার পর গ্র্যান্ড টোটাল রো যোগ করা
    const grandTotalRow = document.createElement('tr');
    grandTotalRow.style.backgroundColor = '#f1f3f5'; // কালো থেকে হালকা গ্রে করা হলো
    grandTotalRow.style.color = '#000';             // টেক্সট কালো
    grandTotalRow.style.fontWeight = '600';
    grandTotalRow.style.fontSize = '0.95rem';

    grandTotalRow.innerHTML = `
        <td colspan="3" style="text-align:right; padding: 12px; border: 1px solid #ddd;">GRAND TOTAL:</td>
        <td class="text-right" style="padding: 12px; border: 1px solid #ddd;">₹${grandTotal.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
        <td class="no-print" style="border: 1px solid #ddd;"></td>
    `;
    
    expenseSheetBody.appendChild(grandTotalRow);

    displayTotalExpense.textContent = `₹${grandTotal.toFixed(2)}`;
}

/**
 * ইনলাইন এডিট শুরু করার ফাংশন
 */
function startInlineEdit(td, id, field, originalValue) {
    if (td.querySelector('input')) return; // অলরেডি এডিট চলছে

    const input = document.createElement('input');
    input.type = field === 'amount' ? 'number' : 'text';
    input.value = originalValue;
    input.className = 'inline-edit-input';
    
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();

    // সেভ করার ফাংশন
    const saveInline = async () => {
        const newValue = field === 'amount' ? parseFloat(input.value) : input.value;
        
        if (newValue !== originalValue && newValue !== "") {
            try {
                const docRef = doc(db, 'shops', currentUserId, 'expenses', id);
                await updateDoc(docRef, { [field]: newValue, updatedAt: Timestamp.now() });
                loadExpenses(); // টেবিল রিফ্রেশ
            } catch (e) {
                console.error(e);
                alert("Update failed!");
                loadExpenses();
            }
        } else {
            // কোনো পরিবর্তন না হলে আগের ভ্যালু ফিরিয়ে আনা
            td.innerText = field === 'amount' ? `₹${parseFloat(originalValue).toFixed(2)}` : originalValue;
        }
    };

    // ইভেন্ট লিসেনার (Enter চাপলে বা বাইরে ক্লিক করলে সেভ হবে)
    input.addEventListener('blur', saveInline);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveInline();
        if (e.key === 'Escape') loadExpenses();
    });
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

// --- Bulk Entry Functions ---
function addBulkRow() {
    const tr = document.createElement('tr');
    const today = new Date().toISOString().split('T')[0];
    tr.innerHTML = `
        <td><input type="date" class="bulk-date" value="${today}"></td>
        <td>
            <select class="bulk-category">
                <option value="Tea/Snacks">Tea/Snacks</option>
                <option value="Transport">Transport</option>
                <option value="Shop Rent">Shop Rent</option>
                <option value="Electricity Bill">Electricity Bill</option>
                <option value="Staff Salary">Staff Salary</option>
                <option value="Other">Other</option>
            </select>
        </td>
        <td><input type="text" class="bulk-desc" placeholder="Description"></td>
        <td><input type="number" class="bulk-amount" placeholder="0.00" step="0.01"></td>
        <td><button class="btn-delete remove-bulk-row">X</button></td>
    `;
    bulkTbody.appendChild(tr);
}

if(bulkTbody) { for(let i=0; i<3; i++) addBulkRow(); }

if(btnAddBulkRow) {
    btnAddBulkRow.addEventListener('click', addBulkRow);
}

if(bulkTbody) {
    bulkTbody.addEventListener('click', (e) => {
        if(e.target.classList.contains('remove-bulk-row')) e.target.closest('tr').remove();
    });
}

if(btnSaveBulk) {
    btnSaveBulk.addEventListener('click', async () => {
        const rows = bulkTbody.querySelectorAll('tr');
        const batchData = [];
        
        rows.forEach(row => {
            const date = row.querySelector('.bulk-date').value;
            const category = row.querySelector('.bulk-category').value;
            const desc = row.querySelector('.bulk-desc').value.trim();
            const amount = parseFloat(row.querySelector('.bulk-amount').value);

            if(desc && !isNaN(amount)) {
                batchData.push({
                    date: Timestamp.fromDate(new Date(date)),
                    category,
                    description: desc,
                    amount,
                    createdAt: Timestamp.now()
                });
            }
        });

        if(batchData.length === 0) return alert("Please fill at least one row correctly.");

        try {
            btnSaveBulk.disabled = true;
            btnSaveBulk.textContent = "Saving...";
            const colRef = collection(db, 'shops', currentUserId, 'expenses');
            
            for(const data of batchData) {
                await addDoc(colRef, data);
            }
            
            alert("All expenses saved!");
            bulkTbody.innerHTML = "";
            for(let i=0; i<3; i++) addBulkRow();
            loadExpenses();
        } catch (e) { console.error(e); }
        finally { btnSaveBulk.disabled = false; btnSaveBulk.textContent = "Save All Bulk Entries"; }
    });
}