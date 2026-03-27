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
const btnApplyFilter = document.getElementById('btn-apply-filter');
const btnResetFilter = document.getElementById('btn-reset-filter');
const btnPrintSheet = document.getElementById('btn-print-sheet');
const expenseSheetBody = document.getElementById('expense-sheet-body');
const displayTotalExpense = document.getElementById('display-total-expense');
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

        // ডিফল্ট তারিখ সেট (কলকাতা টাইমজোন অনুযায়ী)
        const nowIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).split(',')[0];
        const now = new Date(nowIST);
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        
        filterDateFrom.value = `${year}-${month}-01`;
        filterDateTo.value = `${year}-${month}-${day}`;

        loadInitialData();
        loadExpenses();
        setupAutoFilter();
    } else {
        window.location.href = '../index.html';
    }
});

// অটো-ফিল্টার সেটআপ
function setupAutoFilter() {
    [filterDateFrom, filterDateTo, filterCategory].forEach(el => {
        el.addEventListener('change', () => loadExpenses());
    });
}

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

// ডাটা ফেচিং (Month-based query)
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
        
        // ক্যাটাগরি ফিল্টার
        const fCat = filterCategory.value;
        const fPurpose = filterPurpose.value.toLowerCase();
        
        if (fCat) {
            data = data.filter(exp => exp.category === fCat);
        }
        if (fPurpose) {
            data = data.filter(exp => exp.description.toLowerCase().includes(fPurpose));
        }

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
            
            tr.innerHTML = `
                <td>${exp.date.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                <td>${exp.category}</td>
                <td>${exp.description}</td>
                <td><span class="badge-${(exp.method || 'cash').toLowerCase()}">${exp.method || 'Cash'}</span></td>
                <td>${exp.source || 'N/A'}</td>
                <td class="text-right">₹${amount.toFixed(2)}</td>
                <td class="no-print" style="text-align:center;">
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
}

// বাল্ক রো যোগ
function addBulkRow() {
    const tr = document.createElement('tr');
    // কলকাতা টাইমজোন অনুযায়ী আজকের তারিখ
    const today = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).split(',')[0];
    
    tr.innerHTML = `
        <td><input type="date" class="bulk-date" value="${today}"></td>
        <td><input type="text" class="bulk-desc" list="purpose-suggestions" placeholder="Purpose..."></td>
        <td>
            <select class="bulk-category">
                ${expenseCategories.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
        </td>
        <td>
            <select class="bulk-method">
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
                <option value="Card">Card</option>
            </select>
        </td>
        <td>
            <select class="bulk-source">
                <option value="Box">Box</option>
                <option value="Owner">Owner</option>
                <option value="Bank">Bank</option>
            </select>
        </td>
        <td><input type="number" class="bulk-amount" placeholder="0.00" step="0.01" min="0.01"></td>
        <td><button type="button" class="btn-delete" onclick="this.closest('tr').remove()">×</button></td>
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
        // কলকাতা টাইমজোন অনুযায়ী রিসেট
        const nowIST = new Date().toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).split(',')[0];
        const now = new Date(nowIST);
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        
        filterDateFrom.value = `${year}-${month}-01`;
        filterDateTo.value = `${year}-${month}-${day}`;
        filterCategory.value = '';
        filterPurpose.value = '';
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
    if (!rawData) return alert("Please paste data first!");

    const lines = rawData.split('\n');
    bulkTbody.innerHTML = ''; // টেবিল ক্লিয়ার করা

    let count = 0;
    
    // হেডার চেনার জন্য কিছু কী-ওয়ার্ড
    const headerKeywords = ["date", "category", "paid by", "payee", "purpose", "amount", "status"];

    lines.forEach(line => {
        if (!line.trim()) return; // খালি লাইন বাদ

        // ট্যাব বা পাইপ দিয়ে কলাম আলাদা করা
        const cols = line.split(/\t|\|/).map(c => c.trim());

        // --- Smart Header Detection ---
        // যদি প্রথম বা দ্বিতীয় কলামে হেডার কী-ওয়ার্ড থাকে, তবে এই লাইনটি স্কিপ করবে
        const firstColLower = cols[0].toLowerCase();
        const secondColLower = cols[1] ? cols[1].toLowerCase() : "";
        
        const isHeader = headerKeywords.some(key => firstColLower.includes(key) || secondColLower.includes(key));
        
        if (isHeader) {
            console.log("Header detected and skipped:", line);
            return; // এই লাইনটি প্রসেস না করে পরের লাইনে চলে যাবে
        }

        // তোমার ছবির কলাম সিকোয়েন্স: [0]Date, [1]Category, [2]Paid By, [3]Payee, [4]Purpose, [5]Amount
        if (cols.length >= 5) {
            count++;
            const rawDate = cols[0];
            const category = cols[1];
            const paidBy = cols[2] ? cols[2].toLowerCase() : "";
            const payee = cols[3] || "";
            const purposeText = cols[4] || "";
            const amount = cols[5] ? cols[5].replace(/[^0-9.]/g, '') : "0";

            // Purpose এবং Payee মিলিয়ে ডেসক্রিপশন
            const finalPurpose = `${purposeText} - ${payee}`.replace(/^ - | - $/g, '');

            // স্মার্ট মেথড ডিটেকশন
            let method = "cash";
            if (paidBy.includes("bank") || paidBy.includes("axis") || paidBy.includes("online") || paidBy.includes("upi")) {
                method = "online";
            }

            // স্মার্ট সোর্স ডিটেকশন
            let source = "box";
            if (paidBy.includes("bank") || paidBy.includes("axis")) {
                source = "bank";
            } else if (paidBy.includes("anup") || paidBy.includes("dada") || paidBy.includes("owner")) {
                source = "owner";
            }

            // টেবিলে রো ইনজেক্ট করা
            addBulkRowWithData(rawDate, category, finalPurpose, method, source, amount);
        }
    });

    if (count > 0) {
        alert(`✅ Successfully imported ${count} records! Header was skipped automatically.`);
        aiModal.classList.add('hidden');
        document.getElementById('ai-raw-input').value = '';
    } else {
        alert("❌ No valid data rows found! Please copy from Excel correctly.");
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
        <td><input type="date" class="bulk-date" value="${date}"></td>
        <td><input type="text" class="bulk-desc" value="${desc}" placeholder="Purpose..."></td>
        <td>
            <select class="bulk-category">
                <option value="${cat}" selected>${cat}</option>
                ${catOptions}
            </select>
        </td>
        <td>
            <select class="bulk-method">
                <option value="Cash" ${method === 'cash' ? 'selected' : ''}>Cash</option>
                <option value="Online" ${method === 'online' ? 'selected' : ''}>Online</option>
                <option value="Card" ${method === 'card' ? 'selected' : ''}>Card</option>
            </select>
        </td>
        <td>
            <select class="bulk-source">
                <option value="Box" ${source === 'box' ? 'selected' : ''}>Box</option>
                <option value="Bank" ${source === 'bank' ? 'selected' : ''}>Bank</option>
                <option value="Owner" ${source === 'owner' ? 'selected' : ''}>Owner</option>
            </select>
        </td>
        <td><input type="number" class="bulk-amount" value="${amount}" step="0.01" min="0.01"></td>
        <td><button type="button" class="btn-delete" onclick="this.closest('tr').remove()">×</button></td>
    `;
    
    bulkTbody.appendChild(tr);
}
