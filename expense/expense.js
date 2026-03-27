// expense.js (v4.0 - Optimized & Monthly Fetching)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { 
    collection, addDoc, getDocs, query, orderBy, deleteDoc, updateDoc, doc, Timestamp, setDoc, getDoc, where 
} from 'firebase/firestore';

// DOM Elements
const filterDateFrom = document.getElementById('filter-date-from');
const filterDateTo = document.getElementById('filter-date-to');
const filterCategory = document.getElementById('filter-category');
const filterPurpose = document.getElementById('filter-purpose');
const filterMethod = document.getElementById('filter-method');
const filterSource = document.getElementById('filter-source');
const filterMinAmount = document.getElementById('filter-min-amount');
const filterMaxAmount = document.getElementById('filter-max-amount');
const btnApplyFilter = document.getElementById('btn-apply-filter');
const btnResetFilter = document.getElementById('btn-reset-filter');
const btnPrintSheet = document.getElementById('btn-print-sheet');
const expenseSheetBody = document.getElementById('expense-sheet-body');
const displayTotalExpense = document.getElementById('display-total-expense');
const displayExpenseCount = document.getElementById('display-expense-count');
const sheetPeriodLabel = document.getElementById('sheet-period-label');
const bulkTbody = document.getElementById('bulk-tbody');
const btnAddBulkRow = document.getElementById('btn-add-bulk-row');
const btnSaveBulk = document.getElementById('btn-save-bulk');
const btnAddCategory = document.getElementById('btn-add-category');

let activeShopId = null;
let expenseCategories = ["Shop Rent", "Electricity Bill", "Staff Salary", "Tea/Snacks", "Transport", "Inventory Purchase", "Other"];
let purposeMap = {};

// ==========================================
// --- Auth & Initial Load ---
// ==========================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        activeShopId = localStorage.getItem('activeShopId');
        if (!activeShopId) { window.location.href = '../index.html'; return; }

        // Helper function to format date as YYYY-MM-DD in local timezone
        const formatDateLocal = (date) => {
            const offset = date.getTimezoneOffset();
            const localDate = new Date(date.getTime() - (offset * 60 * 1000));
            return localDate.toISOString().split('T')[0];
        };

        // ডিফল্ট তারিখ সেট (লোকাল টাইমজোন অনুযায়ী)
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        filterDateFrom.value = formatDateLocal(firstDayOfMonth);
        filterDateTo.value = formatDateLocal(now);

        loadInitialData();
        loadExpenses();
        setupAutoFilter();
    } else {
        window.location.href = '../index.html';
    }
});

// অটো-ফিল্টার সেটআপ
function setupAutoFilter() {
    [filterDateFrom, filterDateTo, filterCategory, filterMethod, filterSource].forEach(el => {
        el.addEventListener('change', () => loadExpenses());
    });
    
    // Real-time search with debounce
    let searchTimeout;
    filterPurpose.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => loadExpenses(), 500);
    });
    
    // Amount range filters
    [filterMinAmount, filterMaxAmount].forEach(el => {
        el.addEventListener('change', () => loadExpenses());
    });
}

// Quick Date Preset Function
window.setQuickDate = function(range) {
    const today = new Date();
    let fromDate, toDate = new Date();

    // Remove active class from all buttons
    document.querySelectorAll('.btn-preset').forEach(btn => btn.classList.remove('active'));
    if (event) event.target.classList.add('active');

    // Helper function to format date as YYYY-MM-DD in local timezone
    const formatDateLocal = (date) => {
        const offset = date.getTimezoneOffset();
        const localDate = new Date(date.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().split('T')[0];
    };

    switch (range) {
        case 'today':
            fromDate = new Date();
            break;
        case 'yesterday':
            fromDate = new Date();
            fromDate.setDate(today.getDate() - 1);
            toDate = new Date(fromDate);
            break;
        case 'thisMonth':
            // মাসের ১ তারিখ নিশ্চিত করা
            fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
            break;
        case 'lastMonth':
            fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            toDate = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
    }

    // ইনপুট ফিল্ডে সঠিক লোকাল তারিখ সেট করা
    filterDateFrom.value = formatDateLocal(fromDate);
    filterDateTo.value = formatDateLocal(toDate);
    
    loadExpenses(); // Auto load after preset
};

// ক্যাটাগরি এবং পূর্বের পারপাস লোড
async function loadInitialData() {
    if (!activeShopId) return;
    
    try {
        const catRef = doc(db, 'shops', activeShopId, 'settings', 'expense_categories');
        const catSnap = await getDoc(catRef);
        expenseCategories = catSnap.exists() ? catSnap.data().list : expenseCategories;
        
        if (!catSnap.exists()) {
            await setDoc(catRef, { list: expenseCategories });
        }
        
        // ফিল্টার ড্রপডাউন আপডেট (Inventory Purchase বাদ)
        if (filterCategory) {
            const filteredCategories = expenseCategories.filter(cat => 
                !cat.toLowerCase().includes('inventory')
            );
            filterCategory.innerHTML = '<option value="">All Categories</option>' + 
                filteredCategories.map(c => `<option value="${c}">${c}</option>`).join('');
        }

        // পারপাস সাজেশন লোড
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
        
        // প্রথম 5টি রো যোগ
        if (bulkTbody && bulkTbody.children.length === 0) {
            for(let i=0; i<5; i++) addBulkRow();
        }
    } catch (e) {
        console.error("Error loading initial data:", e);
    }
}

// নতুন ক্যাটাগরি যোগ
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
                    
                    if (filterCategory) {
                        const filteredCategories = expenseCategories.filter(cat => 
                            !cat.toLowerCase().includes('inventory')
                        );
                        filterCategory.innerHTML = '<option value="">All Categories</option>' + 
                            filteredCategories.map(c => `<option value="${c}">${c}</option>`).join('');
                    }
                    
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

// ডাটা ফেচিং (Month-based query with Advanced Filters)
async function loadExpenses() {
    if (!activeShopId) return;
    
    expenseSheetBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Loading...</td></tr>`;

    try {
        // কলকাতা টাইমজোন অনুযায়ী তারিখ সেট
        const start = new Date(filterDateFrom.value + 'T00:00:00+05:30');
        const end = new Date(filterDateTo.value + 'T23:59:59+05:30');

        // Firestore query with date range
        const q = query(
            collection(db, 'shops', activeShopId, 'expenses'),
            where('date', '>=', Timestamp.fromDate(start)),
            where('date', '<=', Timestamp.fromDate(end)),
            orderBy('date', 'desc')
        );

        const snapshot = await getDocs(q);
        let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Advanced Client-side Filtering
        const fCat = filterCategory.value;
        const fPurpose = filterPurpose.value.toLowerCase();
        const fMethod = filterMethod ? filterMethod.value.toLowerCase() : '';
        const fSource = filterSource ? filterSource.value.toLowerCase() : '';
        const fMin = filterMinAmount ? parseFloat(filterMinAmount.value) || 0 : 0;
        const fMax = filterMaxAmount ? parseFloat(filterMaxAmount.value) || Infinity : Infinity;
        
        data = data.filter(exp => {
            const matchCat = !fCat || exp.category === fCat;
            const matchPurpose = !fPurpose || exp.description.toLowerCase().includes(fPurpose);
            const matchMethod = !fMethod || (exp.method || 'cash').toLowerCase() === fMethod;
            const matchSource = !fSource || (exp.source || '').toLowerCase() === fSource;
            const amount = parseFloat(exp.amount) || 0;
            const matchAmount = amount >= fMin && amount <= fMax;
            
            return matchCat && matchPurpose && matchMethod && matchSource && matchAmount;
        });

        sheetPeriodLabel.textContent = `${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
        
        renderExpenseSheet(data);
    } catch (error) {
        console.error(error);
        expenseSheetBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">Error loading data.</td></tr>`;
    }
}

// টেবিল রেন্ডারিং
function renderExpenseSheet(data) {
    expenseSheetBody.innerHTML = "";
    let grandTotal = 0;

    if (data.length === 0) {
        expenseSheetBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No records found.</td></tr>`;
        displayTotalExpense.textContent = "₹0.00";
        if (displayExpenseCount) displayExpenseCount.textContent = "0";
        return;
    }

    // গ্রুপিং বাই ডেট
    const grouped = data.reduce((acc, exp) => {
        const dateStr = exp.date.toDate().toLocaleDateString('en-IN', { 
            weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' 
        });
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(exp);
        return acc;
    }, {});

    for (const [dateStr, expenses] of Object.entries(grouped)) {
        // গ্রুপ হেডার
        expenseSheetBody.innerHTML += `<tr class="date-header-row"><td colspan="7">${dateStr}</td></tr>`;

        expenses.forEach(exp => {
            const isInventory = exp.category?.toLowerCase().includes('inventory');
            const amount = parseFloat(exp.amount) || 0;
            grandTotal += amount;

            const tr = document.createElement('tr');
            tr.className = isInventory ? 'row-inventory' : 'row-general-expense';
            tr.dataset.expenseId = exp.id;
            
            tr.innerHTML = `
                <td data-label="Time">${exp.date.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                <td data-label="Category" class="${!isInventory ? 'editable-cell' : ''}" data-field="category">${exp.category}</td>
                <td data-label="Description" class="${!isInventory ? 'editable-cell' : ''}" data-field="description">${exp.description}</td>
                <td data-label="Method" class="${!isInventory ? 'editable-cell' : ''}" data-field="method"><span class="badge-${(exp.method || 'cash').toLowerCase()}">${exp.method || 'Cash'}</span></td>
                <td data-label="Source" class="${!isInventory ? 'editable-cell' : ''}" data-field="source">${exp.source || 'N/A'}</td>
                <td data-label="Amount" class="text-right ${!isInventory ? 'editable-cell' : ''}" data-field="amount">₹${amount.toFixed(2)}</td>
                <td data-label="Action" class="no-print" style="text-align:center;">
                    ${!isInventory ? `<button class="btn-delete" onclick="deleteExpense('${exp.id}')">Delete</button>` : '<small>Locked</small>'}
                </td>
            `;
            expenseSheetBody.appendChild(tr);
        });
    }

    // গ্র্যান্ড টোটাল
    expenseSheetBody.innerHTML += `
        <tr style="background:#f1f3f5; font-weight:bold;">
            <td colspan="5" style="text-align:right;">GRAND TOTAL:</td>
            <td class="text-right">₹${grandTotal.toFixed(2)}</td>
            <td class="no-print"></td>
        </tr>`;
    
    displayTotalExpense.textContent = `₹${grandTotal.toFixed(2)}`;
    if (displayExpenseCount) displayExpenseCount.textContent = data.length.toString();
    
    // Inline Edit Event Listeners যোগ করা
    setupInlineEdit();
}

// ==========================================
// --- INLINE EDIT FUNCTIONALITY ---
// ==========================================
function setupInlineEdit() {
    const editableCells = document.querySelectorAll('.editable-cell');
    
    editableCells.forEach(cell => {
        cell.addEventListener('click', function() {
            // যদি ইতিমধ্যে এডিট মোডে থাকে তাহলে রিটার্ন
            if (this.querySelector('input') || this.querySelector('select')) return;
            
            const field = this.dataset.field;
            const currentValue = this.textContent.trim().replace('₹', '').replace(/,/g, '');
            const expenseId = this.closest('tr').dataset.expenseId;
            
            // ব্যাকআপ রাখা
            const originalContent = this.innerHTML;
            
            // ফিল্ড অনুযায়ী ইনপুট তৈরি
            if (field === 'category') {
                const select = document.createElement('select');
                select.className = 'inline-edit-input';
                expenseCategories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat;
                    option.textContent = cat;
                    if (cat === currentValue) option.selected = true;
                    select.appendChild(option);
                });
                this.innerHTML = '';
                this.appendChild(select);
                select.focus();
                
                select.addEventListener('change', () => saveInlineEdit(expenseId, field, select.value, this, originalContent));
                select.addEventListener('blur', () => saveInlineEdit(expenseId, field, select.value, this, originalContent));
                
            } else if (field === 'method') {
                const select = document.createElement('select');
                select.className = 'inline-edit-input';
                ['Cash', 'Online', 'Card'].forEach(method => {
                    const option = document.createElement('option');
                    option.value = method;
                    option.textContent = method;
                    if (method.toLowerCase() === currentValue.toLowerCase()) option.selected = true;
                    select.appendChild(option);
                });
                this.innerHTML = '';
                this.appendChild(select);
                select.focus();
                
                select.addEventListener('change', () => saveInlineEdit(expenseId, field, select.value, this, originalContent));
                select.addEventListener('blur', () => saveInlineEdit(expenseId, field, select.value, this, originalContent));
                
            } else if (field === 'source') {
                const select = document.createElement('select');
                select.className = 'inline-edit-input';
                ['Box', 'Bank', 'Owner'].forEach(source => {
                    const option = document.createElement('option');
                    option.value = source;
                    option.textContent = source;
                    if (source.toLowerCase() === currentValue.toLowerCase() || source === currentValue) option.selected = true;
                    select.appendChild(option);
                });
                this.innerHTML = '';
                this.appendChild(select);
                select.focus();
                
                select.addEventListener('change', () => saveInlineEdit(expenseId, field, select.value, this, originalContent));
                select.addEventListener('blur', () => saveInlineEdit(expenseId, field, select.value, this, originalContent));
                
            } else if (field === 'amount') {
                const input = document.createElement('input');
                input.type = 'number';
                input.className = 'inline-edit-input';
                input.value = currentValue;
                input.step = '0.01';
                input.min = '0.01';
                this.innerHTML = '';
                this.appendChild(input);
                input.focus();
                input.select();
                
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        saveInlineEdit(expenseId, field, input.value, this, originalContent);
                    } else if (e.key === 'Escape') {
                        this.innerHTML = originalContent;
                    }
                });
                input.addEventListener('blur', () => saveInlineEdit(expenseId, field, input.value, this, originalContent));
                
            } else {
                // Text fields (description)
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'inline-edit-input';
                input.value = currentValue;
                this.innerHTML = '';
                this.appendChild(input);
                input.focus();
                input.select();
                
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        saveInlineEdit(expenseId, field, input.value, this, originalContent);
                    } else if (e.key === 'Escape') {
                        this.innerHTML = originalContent;
                    }
                });
                input.addEventListener('blur', () => saveInlineEdit(expenseId, field, input.value, this, originalContent));
            }
        });
    });
}

// Inline Edit সেভ করার ফাংশন
async function saveInlineEdit(expenseId, field, newValue, cell, originalContent) {
    // যদি ইনপুট না থাকে (ইতিমধ্যে সেভ হয়ে গেছে) তাহলে রিটার্ন
    if (!cell.querySelector('input') && !cell.querySelector('select')) return;
    
    const trimmedValue = newValue.trim();
    
    // ভ্যালিডেশন
    if (!trimmedValue || (field === 'amount' && parseFloat(trimmedValue) <= 0)) {
        alert('Invalid value!');
        cell.innerHTML = originalContent;
        return;
    }
    
    try {
        // Firestore আপডেট
        const expenseRef = doc(db, 'shops', activeShopId, 'expenses', expenseId);
        await updateDoc(expenseRef, {
            [field]: field === 'amount' ? parseFloat(trimmedValue) : trimmedValue
        });
        
        // UI আপডেট
        if (field === 'amount') {
            cell.innerHTML = `₹${parseFloat(trimmedValue).toFixed(2)}`;
        } else if (field === 'method') {
            cell.innerHTML = `<span class="badge-${trimmedValue.toLowerCase()}">${trimmedValue}</span>`;
        } else {
            cell.textContent = trimmedValue;
        }
        
        // সাকসেস ইফেক্ট
        cell.style.backgroundColor = '#d4edda';
        setTimeout(() => {
            cell.style.backgroundColor = '';
        }, 1000);
        
        // টোটাল রিক্যালকুলেট করা (শুধু amount চেঞ্জ হলে)
        if (field === 'amount') {
            loadExpenses();
        }
    } catch (error) {
        console.error('Error updating expense:', error);
        alert('Failed to update!');
        cell.innerHTML = originalContent;
    }
}

// বাল্ক রো যোগ
function addBulkRow() {
    const tr = document.createElement('tr');
    // কলকাতা টাইমজোন অনুযায়ী আজকের তারিখ
    const today = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).split(',')[0];
    
    tr.innerHTML = `
        <td data-label="Date"><input type="date" class="bulk-date" value="${today}"></td>
        <td data-label="Purpose"><input type="text" class="bulk-desc" list="purpose-suggestions" placeholder="Purpose..."></td>
        <td data-label="Category">
            <select class="bulk-category">
                ${expenseCategories.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
        </td>
        <td data-label="Method">
            <select class="bulk-method">
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
                <option value="Card">Card</option>
            </select>
        </td>
        <td data-label="Source">
            <select class="bulk-source">
                <option value="Box">Box</option>
                <option value="Owner">Owner</option>
                <option value="Bank">Bank</option>
            </select>
        </td>
        <td data-label="Amount"><input type="number" class="bulk-amount" placeholder="0.00" step="0.01" min="0.01"></td>
        <td data-label="Action"><button type="button" class="btn-delete" onclick="this.closest('tr').remove()">×</button></td>
    `;
    
    // অটো ক্যাটাগরি সিলেক্ট
    const descInput = tr.querySelector('.bulk-desc');
    const catSelect = tr.querySelector('.bulk-category');
    descInput.addEventListener('input', () => {
        const val = descInput.value.toLowerCase();
        if (purposeMap[val]) {
            catSelect.value = purposeMap[val];
        }
    });
    
    bulkTbody.appendChild(tr);
}

if(btnAddBulkRow) btnAddBulkRow.onclick = addBulkRow;

// সেভিং লজিক উইথ ভ্যালিডেশন
if(btnSaveBulk) {
    btnSaveBulk.onclick = async () => {
        const rows = bulkTbody.querySelectorAll('tr');
        const batch = [];
        
        for (const row of rows) {
            const amount = parseFloat(row.querySelector('.bulk-amount').value);
            const desc = row.querySelector('.bulk-desc').value.trim();
            const category = row.querySelector('.bulk-category').value;
            const method = row.querySelector('.bulk-method').value;
            const source = row.querySelector('.bulk-source').value;
            const dateVal = row.querySelector('.bulk-date').value;

            if (desc && category) {
                // ভ্যালিডেশন: অ্যামাউন্ট অবশ্যই ০ এর বেশি
                if (isNaN(amount) || amount <= 0) {
                    alert(`Error: Amount for "${desc}" must be greater than 0!`);
                    return;
                }

                // কলকাতা টাইমজোন অনুযায়ী তারিখ এবং সময়
                const timeStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false });
                const fullDateTime = new Date(dateVal + 'T' + timeStr + '+05:30');
                
                batch.push({
                    date: Timestamp.fromDate(fullDateTime),
                    description: desc,
                    category: category,
                    method: method,
                    source: source,
                    amount: amount,
                    createdAt: Timestamp.now()
                });
            }
        }

        if (batch.length === 0) return alert("Please fill at least one row!");

        try {
            btnSaveBulk.disabled = true;
            for (const item of batch) {
                await addDoc(collection(db, 'shops', activeShopId, 'expenses'), item);
            }
            alert("✅ Expenses Saved!");
            location.reload(); 
        } catch (e) {
            console.error(e);
            alert("Save failed!");
            btnSaveBulk.disabled = false;
        }
    };
}

// ডিলিট ফাংশন
window.deleteExpense = async (id) => {
    if(confirm("Are you sure?")) {
        await deleteDoc(doc(db, 'shops', activeShopId, 'expenses', id));
        loadExpenses();
    }
};

// ফিল্টার বাটন
if(btnApplyFilter) btnApplyFilter.onclick = loadExpenses;
if(btnResetFilter) {
    btnResetFilter.onclick = () => {
        // Helper function to format date as YYYY-MM-DD in local timezone
        const formatDateLocal = (date) => {
            const offset = date.getTimezoneOffset();
            const localDate = new Date(date.getTime() - (offset * 60 * 1000));
            return localDate.toISOString().split('T')[0];
        };

        // লোকাল টাইমজোন অনুযায়ী রিসেট
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        filterDateFrom.value = formatDateLocal(firstDayOfMonth);
        filterDateTo.value = formatDateLocal(now);
        filterCategory.value = '';
        filterPurpose.value = '';
        if (filterMethod) filterMethod.value = '';
        if (filterSource) filterSource.value = '';
        if (filterMinAmount) filterMinAmount.value = '';
        if (filterMaxAmount) filterMaxAmount.value = '';
        
        // Reset active button to "This Month"
        document.querySelectorAll('.btn-preset').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.btn-preset')[2].classList.add('active');
        
        loadExpenses();
    };
}
if(btnPrintSheet) btnPrintSheet.onclick = () => window.print();

// ==========================================================
// --- AI SMART SCANNER LOGIC (EXPENSE) ---
// ==========================================================

// ১. প্রম্পট কপি করা
document.getElementById('btn-copy-expense-prompt').addEventListener('click', () => {
    const promptText = document.getElementById('ai-expense-prompt').innerText;
    navigator.clipboard.writeText(promptText).then(() => {
        alert("Prompt Copied! Now open AI Studio, upload your image and paste the prompt.");
    });
});

// ২. মডাল ওপেন/ক্লোজ
const aiModal = document.getElementById('ai-paste-modal');
document.getElementById('btn-open-ai-modal').onclick = () => aiModal.classList.remove('hidden');
document.getElementById('close-ai-modal').onclick = () => aiModal.classList.add('hidden');

// ৩. ডাটা প্রসেস এবং টেবিল ফিলাপ (Smart Header Detection সহ)
document.getElementById('btn-process-ai').addEventListener('click', () => {
    const rawData = document.getElementById('ai-raw-input').value.trim();
    const statusDiv = document.getElementById('ai-process-status');
    
    if (!rawData) {
        statusDiv.innerHTML = '<span style="color: red;">⚠️ Please paste data first!</span>';
        return;
    }

    const lines = rawData.split('\n');
    bulkTbody.innerHTML = ''; // টেবিল ক্লিয়ার করা

    let successCount = 0;
    let skippedCount = 0;
    let errorLines = [];
    
    // হেডার চেনার জন্য কিছু কী-ওয়ার্ড
    const headerKeywords = ["date", "category", "paid by", "payee", "purpose", "amount", "status", "method", "source"];

    // স্মার্ট তারিখ পার্সিং ফাংশন
    function parseSmartDate(dateStr) {
        if (!dateStr) return getTodayDate();
        
        // ইতিমধ্যে YYYY-MM-DD ফরম্যাটে আছে কিনা চেক
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            return dateStr;
        }
        
        // DD/MM/YYYY বা DD-MM-YYYY ফরম্যাট
        const parts = dateStr.split(/[\/\-\.]/); // slash, dash, dot সাপোর্ট
        
        if (parts.length === 3) {
            let day, month, year;
            
            // যদি প্রথম অংশ 4 ডিজিটের হয় তাহলে YYYY-MM-DD
            if (parts[0].length === 4) {
                year = parts[0];
                month = parts[1].padStart(2, '0');
                day = parts[2].padStart(2, '0');
            } else {
                // DD-MM-YYYY বা DD/MM/YYYY
                day = parts[0].padStart(2, '0');
                month = parts[1].padStart(2, '0');
                year = parts[2];
                
                // 2-digit year কে 4-digit এ কনভার্ট
                if (year.length === 2) {
                    year = '20' + year;
                }
            }
            
            return `${year}-${month}-${day}`;
        }
        
        return getTodayDate(); // পার্স করতে না পারলে আজকের তারিখ
    }
    
    // আজকের তারিখ YYYY-MM-DD ফরম্যাটে
    function getTodayDate() {
        return new Date().toLocaleString('en-CA', { 
            timeZone: 'Asia/Kolkata', 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        }).split(',')[0];
    }
    
    // স্মার্ট ক্যাটাগরি ম্যাচিং
    function findBestCategory(inputCat) {
        if (!inputCat) return expenseCategories[0];
        
        const input = inputCat.toLowerCase().trim();
        
        // Exact match
        const exactMatch = expenseCategories.find(cat => cat.toLowerCase() === input);
        if (exactMatch) return exactMatch;
        
        // Partial match (শুরুতে মিললে)
        const partialMatch = expenseCategories.find(cat => 
            cat.toLowerCase().startsWith(input) || input.startsWith(cat.toLowerCase())
        );
        if (partialMatch) return partialMatch;
        
        // Contains match
        const containsMatch = expenseCategories.find(cat => 
            cat.toLowerCase().includes(input) || input.includes(cat.toLowerCase())
        );
        if (containsMatch) return containsMatch;
        
        // কোনো ম্যাচ না পেলে ইনপুট ক্যাটাগরিই রিটার্ন (নতুন ক্যাটাগরি হিসেবে)
        return inputCat;
    }

    lines.forEach((line, index) => {
        if (!line.trim()) return; // খালি লাইন বাদ

        // ট্যাব, পাইপ (|) অথবা কমা (,) দিয়ে কলাম আলাদা করা
        const cols = line.split(/\t|\||,/).map(c => c.trim());

        // --- Smart Header Detection ---
        const firstColLower = cols[0] ? cols[0].toLowerCase() : "";
        const secondColLower = cols[1] ? cols[1].toLowerCase() : "";
        
        const isHeader = headerKeywords.some(key => 
            firstColLower.includes(key) || secondColLower.includes(key)
        );
        
        if (isHeader) {
            console.log("Header detected and skipped:", line);
            skippedCount++;
            return;
        }

        // কমপক্ষে 3টি কলাম থাকতে হবে (Date, Category, Amount minimum)
        if (cols.length < 3) {
            console.log("Invalid row (too few columns):", line);
            errorLines.push(`Line ${index + 1}: Too few columns`);
            skippedCount++;
            return;
        }

        try {
            // ফ্লেক্সিবল কলাম ম্যাপিং
            let rawDate, category, purpose, method, source, amount;
            
            if (cols.length === 6) {
                // Full format: Date | Category | Purpose | Method | Source | Amount
                [rawDate, category, purpose, method, source, amount] = cols;
            } else if (cols.length === 5) {
                // Missing one field: Date | Category | Purpose | Method | Amount
                [rawDate, category, purpose, method, amount] = cols;
                source = "box"; // ডিফল্ট
            } else if (cols.length === 4) {
                // Date | Category | Purpose | Amount
                [rawDate, category, purpose, amount] = cols;
                method = "cash";
                source = "box";
            } else if (cols.length === 3) {
                // Minimum: Date | Category | Amount
                [rawDate, category, amount] = cols;
                purpose = category; // ক্যাটাগরিই পারপাস হিসেবে
                method = "cash";
                source = "box";
            } else {
                // 6+ columns: extra data ignore
                [rawDate, category, purpose, method, source, amount] = cols;
            }

            // ভ্যালিডেশন এবং ক্লিনিং
            const finalDate = parseSmartDate(rawDate);
            const finalCategory = findBestCategory(category);
            const finalPurpose = purpose || finalCategory;
            const finalMethod = method ? method.toLowerCase() : "cash";
            const finalSource = source ? source.toLowerCase() : "box";
            const finalAmount = amount ? amount.replace(/[^0-9.]/g, '') : "0";

            // অ্যামাউন্ট ভ্যালিডেশন
            if (parseFloat(finalAmount) <= 0) {
                console.log("Invalid amount:", line);
                errorLines.push(`Line ${index + 1}: Invalid amount`);
                skippedCount++;
                return;
            }

            // টেবিলে রো যোগ করা
            addBulkRowWithData(
                finalDate, 
                finalCategory, 
                finalPurpose, 
                finalMethod, 
                finalSource, 
                finalAmount
            );
            
            successCount++;
        } catch (error) {
            console.error("Error processing line:", line, error);
            errorLines.push(`Line ${index + 1}: Processing error`);
            skippedCount++;
        }
    });

    // স্ট্যাটাস মেসেজ দেখানো
    if (successCount > 0) {
        statusDiv.innerHTML = `<span style="color: green;">✅ Successfully imported ${successCount} records!</span>`;
        if (skippedCount > 0) {
            statusDiv.innerHTML += `<br><span style="color: orange;">⚠️ Skipped ${skippedCount} rows (headers/invalid data)</span>`;
        }
        
        // 3 সেকেন্ড পর মডাল বন্ধ
        setTimeout(() => {
            aiModal.classList.add('hidden');
            document.getElementById('ai-raw-input').value = '';
            statusDiv.innerHTML = '';
        }, 3000);
    } else {
        statusDiv.innerHTML = `<span style="color: red;">❌ No valid data found!</span>`;
        if (errorLines.length > 0) {
            statusDiv.innerHTML += `<br><small>${errorLines.slice(0, 3).join('<br>')}</small>`;
        }
    }
});

// ৪. ডাটাসহ রো যোগ করার স্পেশাল ফাংশন
function addBulkRowWithData(date, cat, desc, method, source, amount) {
    const tr = document.createElement('tr');
    
    // তোমার অ্যাপের ক্যাটাগরি লিস্ট থেকে অপশন তৈরি
    const catOptions = expenseCategories
        .filter(c => !c.toLowerCase().includes('inventory'))
        .map(c => `<option value="${c}" ${c.toLowerCase() === cat.toLowerCase() ? 'selected' : ''}>${c}</option>`)
        .join('');

    tr.innerHTML = `
        <td data-label="Date"><input type="date" class="bulk-date" value="${date}"></td>
        <td data-label="Purpose"><input type="text" class="bulk-desc" value="${desc}" placeholder="Purpose..."></td>
        <td data-label="Category">
            <select class="bulk-category">
                <option value="${cat}" selected>${cat}</option>
                ${catOptions}
            </select>
        </td>
        <td data-label="Method">
            <select class="bulk-method">
                <option value="Cash" ${method === 'cash' ? 'selected' : ''}>Cash</option>
                <option value="Online" ${method === 'online' ? 'selected' : ''}>Online</option>
                <option value="Card" ${method === 'card' ? 'selected' : ''}>Card</option>
            </select>
        </td>
        <td data-label="Source">
            <select class="bulk-source">
                <option value="Box" ${source === 'box' ? 'selected' : ''}>Box</option>
                <option value="Bank" ${source === 'bank' ? 'selected' : ''}>Bank</option>
                <option value="Owner" ${source === 'owner' ? 'selected' : ''}>Owner</option>
            </select>
        </td>
        <td data-label="Amount"><input type="number" class="bulk-amount" value="${amount}" step="0.01" min="0.01"></td>
        <td data-label="Action"><button type="button" class="btn-delete" onclick="this.closest('tr').remove()">×</button></td>
    `;
    
    bulkTbody.appendChild(tr);
}
