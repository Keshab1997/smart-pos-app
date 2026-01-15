// expense.js (v3.0 - Add, Edit & Delete)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { 
    collection, addDoc, getDocs, query, orderBy, deleteDoc, updateDoc, doc, Timestamp, setDoc, getDoc 
} from 'firebase/firestore';

// ==========================================
// --- DOM Elements ---
// ==========================================
const btnAddCategory = document.getElementById('btn-add-category');
const filterDateFrom = document.getElementById('filter-date-from');
const filterDateTo = document.getElementById('filter-date-to');
const filterCategory = document.getElementById('filter-category');
const filterPurpose = document.getElementById('filter-purpose');
const btnApplyFilter = document.getElementById('btn-apply-filter');
const btnResetFilter = document.getElementById('btn-reset-filter');
const btnPrintSheet = document.getElementById('btn-print-sheet');

const expenseSheetBody = document.getElementById('expense-sheet-body');
const displayTotalExpense = document.getElementById('display-total-expense');
const sheetPeriodLabel = document.getElementById('sheet-period-label');
const bulkTbody = document.getElementById('bulk-tbody');
const btnAddBulkRow = document.getElementById('btn-add-bulk-row');
const btnSaveBulk = document.getElementById('btn-save-bulk');

let activeShopId = null;
let allExpenses = [];
let expenseCategories = ["Shop Rent", "Electricity Bill", "Staff Salary", "Tea/Snacks", "Transport", "Inventory Purchase", "Other"];
let purposeMap = {}; // Purpose -> Category mapping

// ==========================================
// --- Auth & Initial Load ---
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        activeShopId = localStorage.getItem('activeShopId'); if (!activeShopId) { window.location.href = '../index.html'; return; }
        loadInitialData();
        loadExpenses(); 
    } else {
        window.location.href = '../index.html';
    }
});

// ক্যাটাগরি এবং পূর্বের পারপাস লোড করা (অটো-সাজেশনের জন্য)
async function loadInitialData() {
    if (!activeShopId) return;
    
    try {
        // ক্যাটাগরি লোড
        const catRef = doc(db, 'shops', activeShopId, 'settings', 'expense_categories');
        const catSnap = await getDoc(catRef);
        expenseCategories = catSnap.exists() ? catSnap.data().list : expenseCategories;
        
        if (!catSnap.exists()) {
            await setDoc(catRef, { list: expenseCategories });
        }
        
        // ফিল্টার ড্রপডাউন আপডেট (Inventory Purchase বাদ দিয়ে)
        if (filterCategory) {
            const filteredCategories = expenseCategories.filter(cat => 
                cat.toLowerCase() !== 'inventory purchase' && 
                cat.toLowerCase() !== 'inventory_purchase'
            );
            filterCategory.innerHTML = '<option value="">All Categories</option>' + 
                filteredCategories.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        // সব এক্সপেন্স থেকে ইউনিক পারপাস এবং ক্যাটাগরি ম্যাপ তৈরি
        const expSnap = await getDocs(collection(db, 'shops', activeShopId, 'expenses'));
        const datalist = document.getElementById('purpose-suggestions');
        if (datalist) {
            datalist.innerHTML = '';
            const uniquePurposes = new Set();

            expSnap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.description && data.category) {
                    purposeMap[data.description.toLowerCase()] = data.category;
                    uniquePurposes.add(data.description);
                }
            });

            uniquePurposes.forEach(p => {
                datalist.innerHTML += `<option value="${p}">`;
            });
        }
        
        // প্রথম 5টি রো যোগ করা
        if (bulkTbody && bulkTbody.children.length === 0) {
            for(let i=0; i<5; i++) addBulkRow();
        }
    } catch (e) {
        console.error("Error loading initial data:", e);
    }
}

// নতুন ক্যাটাগরি যোগ করা
if(btnAddCategory) {
    btnAddCategory.addEventListener('click', async () => {
        const newCat = prompt("নতুন ক্যাটাগরির নাম লিখুন:");
        if (newCat && newCat.trim() !== "") {
            const trimmedCat = newCat.trim();
            if (!expenseCategories.includes(trimmedCat)) {
                expenseCategories.push(trimmedCat);
                try {
                    const catRef = doc(db, 'shops', activeShopId, 'settings', 'expense_categories');
                    await setDoc(catRef, { list: expenseCategories });
                    
                    // ফিল্টার ড্রপডাউন আপডেট (Inventory Purchase বাদ দিয়ে)
                    if (filterCategory) {
                        const filteredCategories = expenseCategories.filter(cat => 
                            cat.toLowerCase() !== 'inventory purchase' && 
                            cat.toLowerCase() !== 'inventory_purchase'
                        );
                        filterCategory.innerHTML = '<option value="">All Categories</option>' + 
                            filteredCategories.map(c => `<option value="${c}">${c}</option>`).join('');
                    }
                    
                    // বাল্ক টেবিল রিফ্রেশ
                    bulkTbody.innerHTML = '';
                    for(let i=0; i<5; i++) addBulkRow();
                    
                    alert("✅ ক্যাটাগরি সফলভাবে যোগ করা হয়েছে!");
                } catch (e) {
                    alert("❌ ক্যাটাগরি সেভ করতে সমস্যা হয়েছে!");
                }
            } else {
                alert("⚠️ এই ক্যাটাগরি ইতিমধ্যে আছে!");
            }
        }
    });
}



// ==========================================
// --- 2. Load & Display Logic ---
// ==========================================
async function loadExpenses() {
    if (!activeShopId) return;
    expenseSheetBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Loading records...</td></tr>`;

    try {
        const expensesRef = collection(db, 'shops', activeShopId, 'expenses');
        let q = query(expensesRef, orderBy('date', 'desc'));

        const snapshot = await getDocs(q);
        
        allExpenses = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            jsDate: doc.data().date.toDate()
        }));

        // ফিল্টার প্রয়োগ
        const fCat = filterCategory ? filterCategory.value : '';
        const fPurpose = filterPurpose ? filterPurpose.value.toLowerCase() : '';
        const fFrom = filterDateFrom ? filterDateFrom.value : '';
        const fTo = filterDateTo ? filterDateTo.value : '';

        let filtered = allExpenses.filter(exp => {
            const matchCat = !fCat || exp.category === fCat;
            const matchPurpose = !fPurpose || exp.description.toLowerCase().includes(fPurpose);
            
            let matchDate = true;
            if (fFrom && fTo) {
                const fDate = new Date(fFrom); fDate.setHours(0,0,0,0);
                const tDate = new Date(fTo); tDate.setHours(23,59,59,999);
                matchDate = exp.jsDate >= fDate && exp.jsDate <= tDate;
            }
            
            return matchCat && matchPurpose && matchDate;
        });

        if (fFrom && fTo) {
            const fDate = new Date(fFrom);
            const tDate = new Date(fTo);
            sheetPeriodLabel.textContent = `${fDate.toLocaleDateString()} to ${tDate.toLocaleDateString()}`;
        } else {
            sheetPeriodLabel.textContent = "All Records (Recent)";
        }

        renderExpenseSheet(filtered);

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

            const timeStr = exp.jsDate.toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
            });

            const tr = document.createElement('tr');
            const isInventory = exp.category === 'inventory_purchase' || exp.category.toLowerCase().includes('inventory');
            
            if (isInventory) {
                tr.classList.add('row-inventory');
            } else {
                tr.classList.add('row-general-expense');
            }

            tr.innerHTML = `
                <td class="${!isInventory ? 'editable-cell' : ''}" data-field="date" title="${!isInventory ? 'Double click to edit Date & Time' : ''}">${timeStr}</td>
                <td class="${!isInventory ? 'editable-cell' : ''}" data-field="category" title="${!isInventory ? 'Double click to edit' : ''}">${exp.category}</td>
                <td class="${!isInventory ? 'editable-cell' : ''}" data-field="description" title="${!isInventory ? 'Double click to edit' : ''}">
                    ${exp.description}
                    ${isInventory && exp.quantity ? `<div style="font-size: 0.75rem; color: #666; margin-top: 2px;">
                        (Qty: ${exp.quantity || 0} * CP: ${(exp.unitPrice || (exp.amount / (exp.quantity || 1))).toFixed(2)})
                    </div>` : ''}
                </td>
                <td class="text-right ${!isInventory ? 'editable-cell' : ''}" data-field="amount" title="${!isInventory ? 'Double click to edit' : ''}">₹${exp.amount.toFixed(2)}</td>
                <td class="no-print" style="text-align:center;">
                    ${!isInventory ? `<button class="btn-delete" data-id="${exp.id}">Delete</button>` : '<span style="font-size:0.7rem; color:#bbb;">Locked</span>'}
                </td>
            `;
            
            if (!isInventory) {
                tr.querySelectorAll('.editable-cell').forEach(cell => {
                    cell.addEventListener('dblclick', () => {
                        const field = cell.getAttribute('data-field');
                        let value = cell.innerText.trim();
                        if (field === 'amount') value = exp.amount;
                        startInlineEdit(cell, exp.id, field, value, exp.jsDate);
                    });
                });

                const deleteBtn = tr.querySelector('.btn-delete');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => deleteExpense(exp.id));
                }
            }
            
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

    const grandTotalRow = document.createElement('tr');
    grandTotalRow.style.backgroundColor = '#f1f3f5';
    grandTotalRow.style.color = '#000';
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

function startInlineEdit(td, id, field, originalValue, originalDate) {
    if (td.querySelector('input') || td.querySelector('select')) return;

    let input;
    if (field === 'date') {
        input = document.createElement('input');
        input.type = 'datetime-local';
        const tzOffset = (new Date()).getTimezoneOffset() * 60000;
        const localISOTime = (new Date(originalDate - tzOffset)).toISOString().slice(0, 16);
        input.value = localISOTime;
    } else if (field === 'category') {
        input = document.createElement('select');
        // ফিল্টার করা ক্যাটাগরি (Inventory Purchase বাদ)
        const filteredCategories = expenseCategories.filter(cat => 
            cat.toLowerCase() !== 'inventory purchase' && 
            cat.toLowerCase() !== 'inventory_purchase'
        );
        filteredCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.text = cat;
            if (cat === originalValue) opt.selected = true;
            input.appendChild(opt);
        });
    } else {
        input = document.createElement('input');
        if (field === 'amount') {
            input.type = 'number';
            input.value = originalValue;
        } else {
            input.type = 'text';
            input.value = originalValue;
        }
    }

    input.className = 'inline-edit-input';
    td.innerHTML = '';
    td.appendChild(input);
    input.focus();

    const saveInline = async () => {
        let updateData = {};

        if (field === 'date') {
            updateData.date = Timestamp.fromDate(new Date(input.value));
        } else if (field === 'amount') {
            updateData.amount = parseFloat(input.value);
        } else {
            updateData[field] = input.value;
        }

        try {
            const docRef = doc(db, 'shops', activeShopId, 'expenses', id);
            await updateDoc(docRef, { ...updateData, updatedAt: Timestamp.now() });
            loadExpenses();
        } catch (e) {
            console.error(e);
            alert("আপডেট করতে সমস্যা হয়েছে!");
            loadExpenses();
        }
    };

    input.addEventListener('blur', saveInline);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveInline();
        if (e.key === 'Escape') loadExpenses();
    });
}


async function deleteExpense(id) {
    if (confirm("আপনি কি নিশ্চিত এই এন্ট্রিটি ডিলিট করতে চান?")) {
        try {
            await deleteDoc(doc(db, 'shops', activeShopId, 'expenses', id));
            loadExpenses();
        } catch (error) {
            console.error("Delete failed", error);
            alert("ডিলিট করতে সমস্যা হয়েছে।");
        }
    }
}

// ==========================================
// --- 5. Filter & Print Logic ---
// ==========================================
if(btnApplyFilter) {
    btnApplyFilter.addEventListener('click', () => loadExpenses());
}

if(btnResetFilter) {
    btnResetFilter.addEventListener('click', () => {
        if (filterDateFrom) filterDateFrom.value = "";
        if (filterDateTo) filterDateTo.value = "";
        if (filterCategory) filterCategory.value = "";
        if (filterPurpose) filterPurpose.value = "";
        loadExpenses();
    });
}

if(btnPrintSheet) {
    btnPrintSheet.addEventListener('click', () => {
        window.print();
    });
}

// বাল্ক রো তৈরি (স্মার্ট ফিচারসহ)
function addBulkRow() {
    const tr = document.createElement('tr');
    const today = new Date().toISOString().split('T')[0];
    
    // ফিল্টার করা ক্যাটাগরি (Inventory Purchase বাদ)
    const filteredCategories = expenseCategories.filter(cat => 
        cat.toLowerCase() !== 'inventory purchase' && 
        cat.toLowerCase() !== 'inventory_purchase'
    );
    
    const catOptions = filteredCategories.map(cat => `<option value="${cat}">${cat}</option>`).join('');
    
    tr.innerHTML = `
        <td><input type="date" class="bulk-date" value="${today}"></td>
        <td><input type="text" class="bulk-desc" list="purpose-suggestions" placeholder="Type purpose..."></td>
        <td>
            <select class="bulk-category">
                <option value="" disabled selected>Select</option>
                ${catOptions}
            </select>
        </td>
        <td><input type="number" class="bulk-amount" placeholder="0.00" step="0.01"></td>
        <td><button class="btn-delete remove-bulk-row">X</button></td>
    `;

    // অটো-ক্যাটেগরি লজিক
    const descInput = tr.querySelector('.bulk-desc');
    const catSelect = tr.querySelector('.bulk-category');

    descInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (purposeMap[val]) {
            catSelect.value = purposeMap[val];
            tr.style.backgroundColor = '#f0fff4';
            setTimeout(() => tr.style.backgroundColor = '', 1000);
        }
    });

    bulkTbody.appendChild(tr);
}

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
            const dateVal = row.querySelector('.bulk-date').value;
            const category = row.querySelector('.bulk-category').value;
            const desc = row.querySelector('.bulk-desc').value.trim();
            const amount = parseFloat(row.querySelector('.bulk-amount').value);

            if(desc && !isNaN(amount)) {
                // নিরাপত্তা চেক: Inventory Purchase ম্যানুয়ালি যোগ করা যাবে না
                if (category.toLowerCase().includes('inventory')) {
                    alert("⚠️ Inventory Purchase এখানে যোগ করা যাবে না। 'Add Product' পেজ ব্যবহার করুন।");
                    return;
                }
                
                // তারিখটিকে লোকাল টাইমজোন অনুযায়ী প্রসেস করা
                const [year, month, day] = dateVal.split('-').map(Number);
                const finalDate = new Date(year, month - 1, day);
                
                // বর্তমান সময় যোগ করা যাতে 05:30 না দেখায়
                const now = new Date();
                finalDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds());

                batchData.push({
                    date: Timestamp.fromDate(finalDate),
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
            const colRef = collection(db, 'shops', activeShopId, 'expenses');
            
            for(const data of batchData) {
                await addDoc(colRef, data);
            }
            
            alert("✅ সব এক্সপেন্স সেভ করা হয়েছে!");
            bulkTbody.innerHTML = "";
            for(let i=0; i<5; i++) addBulkRow();
            loadExpenses();
            loadInitialData();
        } catch (e) { console.error(e); }
        finally { btnSaveBulk.disabled = false; btnSaveBulk.textContent = "Save All Bulk Entries"; }
    });
}