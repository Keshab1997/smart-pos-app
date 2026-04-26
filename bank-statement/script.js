// bank-statement/script.js
import { db, auth, collection, addDoc, serverTimestamp }
    from '../js/firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

let allTransactions = [], filtered = [], barChart = null, pieChart = null;

const fileInput      = document.getElementById('xlsx-file');
const uploadArea     = document.getElementById('upload-area');
const uploadStatus   = document.getElementById('upload-status');
const filtersSection = document.getElementById('filters-section');
const summarySection = document.getElementById('summary-section');
const chartsSection  = document.getElementById('charts-section');
const tableSection   = document.getElementById('table-section');
const actionBar      = document.getElementById('action-bar');
const aiStatus       = document.getElementById('ai-status');
const aiStatusText   = document.getElementById('ai-status-text');
const tbody          = document.getElementById('txn-tbody');
const txnCount       = document.getElementById('txn-count');
const saveBtn        = document.getElementById('btn-save-firebase');
const saveStatus     = document.getElementById('save-status');

// ─── Upload ───────────────────────────────────────────────────────────────────
uploadArea.addEventListener('click', () => fileInput.click());
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.background = '#eef0ff'; });
uploadArea.addEventListener('dragleave', () => { uploadArea.style.background = ''; });
uploadArea.addEventListener('drop', e => { e.preventDefault(); uploadArea.style.background = ''; if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) { processFile(fileInput.files[0]); fileInput.value = ''; } });

function processFile(file) {
    showStatus(`📂 "${file.name}" পড়া হচ্ছে...`);
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
            parseAxisBankRows(rows);
        } catch (err) { showStatus('❌ File পড়তে সমস্যা: ' + err.message, true); }
    };
    reader.readAsArrayBuffer(file);
}

// ─── Parse ────────────────────────────────────────────────────────────────────
function parseAxisBankRows(rows) {
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i].map(c => String(c).toLowerCase().trim());
        if (row.some(c => c.includes('transaction date') || c.includes('txn date') || c.includes('tran date'))) { headerIdx = i; break; }
    }
    if (headerIdx === -1) { showStatus('❌ Axis Bank header row পাওয়া যায়নি।', true); return; }

    const headers = rows[headerIdx].map(c => String(c).toLowerCase().trim());
    const drcrIdx   = headers.findIndex(h => h === 'debit/credit' || h === 'dr/cr');
    const amtIdx    = headers.findIndex(h => h.includes('amount'));
    const isSingle  = drcrIdx !== -1 && amtIdx !== -1;
    const dateIdx   = headers.findIndex(h => h.includes('transaction date') || h.includes('txn date') || h.includes('tran date'));
    const descIdx   = headers.findIndex(h => h.includes('particular') || h.includes('description') || h.includes('narration'));
    const chequeIdx = headers.findIndex(h => h.includes('cheque'));
    const balIdx    = headers.findIndex(h => h.includes('balance'));
    const debitIdx  = headers.findIndex(h => h === 'debit');
    const creditIdx = headers.findIndex(h => h === 'credit');

    const txns = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
        const row = rows[i];
        const dateStr = formatDate(row[dateIdx]);
        if (!dateStr) continue;
        let debit = 0, credit = 0;
        if (isSingle) {
            const amt = parseAmt(row[amtIdx]), flag = String(row[drcrIdx] || '').trim().toUpperCase();
            if (flag === 'DR') debit = amt; else if (flag === 'CR') credit = amt; else continue;
        } else {
            debit = parseAmt(row[debitIdx]); credit = parseAmt(row[creditIdx]);
            if (!debit && !credit) continue;
        }
        txns.push({ date: dateStr, desc: String(row[descIdx] || '').trim(), ref: String(row[chequeIdx] || '').trim(), debit, credit, balance: parseAmt(row[balIdx]), category: 'Other' });
    }
    if (!txns.length) { showStatus('❌ কোনো transaction পাওয়া যায়নি।', true); return; }
    allTransactions = txns;
    showStatus(`✅ ${txns.length}টি transaction পাওয়া গেছে। AI category detect করছে...`);
    showSections();
    detectCategories(txns);
}

function parseAmt(v) { return parseFloat(String(v || '').replace(/,/g, '')) || 0; }
function formatDate(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return raw.toISOString().split('T')[0];
    const s = String(raw).trim();
    const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
    const d = new Date(s); return isNaN(d) ? null : d.toISOString().split('T')[0];
}

// ─── AI ───────────────────────────────────────────────────────────────────────
const CATEGORIES = ['Food','Shopping','EMI','Salary','Transfer','Utility','Medical','Entertainment','Other'];

async function detectCategories(txns) {
    aiStatus.classList.remove('hidden');
    const BATCH = 20;
    for (let i = 0; i < txns.length; i += BATCH) {
        const batch = txns.slice(i, i + BATCH);
        const prompt = `Categorize each bank transaction. Categories: ${CATEGORIES.join(', ')}. Reply ONLY with a JSON array.\n${batch.map((t,j)=>`${j+1}. "${t.desc}" (${t.debit>0?'DR ₹'+t.debit:'CR ₹'+t.credit})`).join('\n')}`;
        try {
            const resp = await puter.ai.chat(prompt, { model: 'claude-sonnet-4-5' });
            const text = typeof resp === 'string' ? resp : (resp?.message?.content?.[0]?.text || '');
            const match = text.match(/\[[\s\S]*?\]/);
            if (match) JSON.parse(match[0]).forEach((cat, j) => { if (CATEGORIES.includes(cat)) txns[i+j].category = cat; });
        } catch(e) { console.warn('AI error', e); }
        aiStatusText.textContent = `AI: ${Math.min(i+BATCH, txns.length)}/${txns.length}...`;
    }
    aiStatus.classList.add('hidden');
    filtered = [...allTransactions];
    localStorage.setItem('bs_data', JSON.stringify(allTransactions));
    populatePayeeList();
    renderAll();
    actionBar.classList.remove('hidden');
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderAll() { renderSummary(); renderTable(); renderCharts(); renderPayee(); }

function populatePayeeList() {
    const names = [...new Set(allTransactions.map(t => extractPayee(t.desc)))].sort();
    const dd = document.getElementById('ms-dropdown');
    dd.innerHTML = names.map(n =>
        `<label class="ms-item"><input type="checkbox" value="${escHtml(n)}"> ${escHtml(n)}</label>`
    ).join('');
    updateTriggerLabel();
}

function updateTriggerLabel() {
    const checked = getSelectedPayees();
    document.getElementById('ms-trigger').textContent =
        checked.length === 0 ? 'All Payees ▾' : `${checked.length} selected ▾`;
}

function getSelectedPayees() {
    return [...document.querySelectorAll('#ms-dropdown input:checked')].map(c => c.value);
}

// Multi-select toggle
document.getElementById('ms-trigger').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('ms-dropdown').classList.toggle('hidden');
});
document.addEventListener('click', () => document.getElementById('ms-dropdown').classList.add('hidden'));
document.getElementById('ms-dropdown').addEventListener('click', e => {
    e.stopPropagation();
    updateTriggerLabel();
});

function renderSummary() {
    document.getElementById('total-debit').textContent  = '₹' + fmt(filtered.reduce((s,t)=>s+t.debit,0));
    document.getElementById('total-credit').textContent = '₹' + fmt(filtered.reduce((s,t)=>s+t.credit,0));
    document.getElementById('total-txn').textContent    = filtered.length;
}

function renderTable() {
    txnCount.textContent = filtered.length;
    tbody.innerHTML = filtered.map(t => `<tr>
        <td>${t.date}</td><td>${escHtml(t.desc)}</td><td>${escHtml(t.ref)}</td>
        <td>${t.debit>0?`<span class="debit-amt">₹${fmt(t.debit)}</span>`:''}</td>
        <td>${t.credit>0?`<span class="credit-amt">₹${fmt(t.credit)}</span>`:''}</td>
        <td>₹${fmt(t.balance)}</td>
        <td><span class="category-badge cat-${t.category}">${t.category}</span></td>
    </tr>`).join('');
}

function renderCharts() {
    const mDebit = {};
    filtered.forEach(t => { if (t.debit>0) { const m=t.date.slice(0,7); mDebit[m]=(mDebit[m]||0)+t.debit; } });
    const months = Object.keys(mDebit).sort();
    if (barChart) barChart.destroy();
    barChart = new Chart(document.getElementById('bar-chart'), {
        type:'bar', data:{ labels:months, datasets:[{ label:'Debit (₹)', data:months.map(m=>mDebit[m]), backgroundColor:'#ef233c99', borderColor:'#ef233c', borderWidth:1 }] },
        options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{ticks:{callback:v=>'₹'+fmt(v)}}} }
    });
    const catD = {}; filtered.forEach(t=>{ if(t.debit>0) catD[t.category]=(catD[t.category]||0)+t.debit; });
    const catL = Object.keys(catD);
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(document.getElementById('pie-chart'), {
        type:'pie', data:{ labels:catL, datasets:[{ data:catL.map(c=>catD[c]), backgroundColor:['#ef233c','#4361ee','#ff9f1c','#2dc653','#8338ec','#06d6a0','#fb5607','#3a86ff','#aaa'].slice(0,catL.length) }] },
        options:{ responsive:true, plugins:{legend:{position:'bottom'}} }
    });
}

// ─── Payee Summary ────────────────────────────────────────────────────────────
let activePayeeTab = 'sent';

function extractPayee(desc) {
    const d = desc.toUpperCase();
    if (d.startsWith('ATM')) return 'ATM Withdrawal';
    if (d.startsWith('EDC')) return 'EDC Collection';
    if (d.startsWith('CLG')) return 'Cheque Clearance';
    const parts = desc.split('/');
    if (parts.length >= 4) { const c = parts[3].trim(); if (c && !/^\d+$/.test(c) && c.length > 2) return c; }
    if (d.startsWith('POS') && parts.length >= 2) return parts[1].trim();
    if ((d.startsWith('MOB') || d.startsWith('INB')) && parts.length >= 3) return parts[2].trim();
    return parts[0].trim() || desc.slice(0, 30);
}

function renderPayee() {
    const sentMap = {}, recvMap = {};
    filtered.forEach(t => { const n = extractPayee(t.desc); if (t.debit>0) sentMap[n]=(sentMap[n]||0)+t.debit; if (t.credit>0) recvMap[n]=(recvMap[n]||0)+t.credit; });
    const map = activePayeeTab === 'sent' ? sentMap : recvMap;
    const sorted = Object.entries(map).sort((a,b)=>b[1]-a[1]);
    const total = sorted.reduce((s,[,v])=>s+v, 0);
    document.getElementById('payee-list').innerHTML = sorted.length === 0
        ? '<p style="padding:16px;color:#888">কোনো data নেই।</p>'
        : sorted.map(([name,amt]) => {
            const pct = total > 0 ? (amt/total*100).toFixed(1) : 0;
            return `<div class="payee-row">
                <div class="payee-name">${escHtml(name)}</div>
                <div class="payee-bar-wrap"><div class="payee-bar" style="width:${pct}%"></div></div>
                <div class="payee-amt ${activePayeeTab==='sent'?'debit-amt':'credit-amt'}">₹${fmt(amt)}</div>
                <div class="payee-pct">${pct}%</div>
            </div>`;
        }).join('');
}

document.querySelectorAll('.ptab').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active'); activePayeeTab = btn.dataset.tab; renderPayee();
}));

// ─── Saved Statements (Firebase) ─────────────────────────────────────────────
async function loadSavedStatements() {
    const shopId = localStorage.getItem('activeShopId');
    const savedSection = document.getElementById('saved-section');
    const savedList    = document.getElementById('saved-list');
    if (!shopId) return;
    savedSection.style.display = 'block';
    savedList.innerHTML = '<p style="padding:16px;color:#888">লোড হচ্ছে...</p>';
    try {
        const { getDocs, collection: col, orderBy, query, deleteDoc, doc, getDoc }
            = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        const snap = await getDocs(query(col(db, 'shops', shopId, 'bank_statements'), orderBy('uploadedAt', 'desc')));
        if (snap.empty) { savedList.innerHTML = '<p style="padding:16px;color:#888">কোনো saved statement নেই।</p>'; return; }

        savedList.innerHTML = snap.docs.map(d => {
            const data = d.data();
            const date = data.uploadedAt?.toDate?.()?.toLocaleDateString('en-IN') || '';
            return `<div class="saved-row">
                <div>
                    <strong>${escHtml(data.label || 'Unnamed')}</strong>
                    <span style="font-size:0.75rem;color:#999;margin-left:8px">${date} · ${data.count} txn</span>
                </div>
                <div style="display:flex;gap:8px">
                    <button class="btn btn-primary" style="font-size:0.78rem;padding:5px 12px" onclick="window._loadStmt('${d.id}')">📂 Load</button>
                    <button class="btn btn-danger"  style="font-size:0.78rem;padding:5px 12px" onclick="window._delStmt('${d.id}')">🗑️</button>
                </div>
            </div>`;
        }).join('');

        window._loadStmt = async (id) => {
            const snap = await getDoc(doc(db, 'shops', shopId, 'bank_statements', id));
            const data = snap.data();
            allTransactions = data.transactions;
            filtered = [...allTransactions];
            localStorage.setItem('bs_data', JSON.stringify(allTransactions));
            showStatus(`✅ "${data.label}" loaded — ${allTransactions.length}টি transaction।`);
            showSections(); populatePayeeList(); renderAll(); actionBar.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        window._delStmt = async (id) => {
            if (!confirm('এই statement delete করবেন?')) return;
            await deleteDoc(doc(db, 'shops', shopId, 'bank_statements', id));
            loadSavedStatements();
        };
    } catch (err) {
        savedList.innerHTML = `<p style="padding:16px;color:#c00">Error: ${err.message}</p>`;
    }
}

document.getElementById('btn-refresh-saved').addEventListener('click', loadSavedStatements);
onAuthStateChanged(auth, user => { if (user) loadSavedStatements(); });

// ─── Firebase Save ────────────────────────────────────────────────────────────
saveBtn.addEventListener('click', async () => {
    const shopId = localStorage.getItem('activeShopId');
    if (!shopId) { saveStatus.textContent = '❌ Shop ID নেই। Login করুন।'; return; }
    const label = prompt('এই statement-এর নাম দিন (যেমন: December 2025):',
        new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' }));
    if (!label) return;
    saveBtn.disabled = true; saveStatus.textContent = '⏳ Saving...';
    try {
        const { getDocs, collection: col, query, where, updateDoc, doc }
            = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        // Check if same label already exists → update instead of create
        const existing = await getDocs(query(col(db, 'shops', shopId, 'bank_statements'), where('label', '==', label)));
        if (!existing.empty) {
            await updateDoc(doc(db, 'shops', shopId, 'bank_statements', existing.docs[0].id), {
                uploadedAt: serverTimestamp(), count: allTransactions.length, transactions: allTransactions,
            });
            saveStatus.textContent = `✅ "${label}" update হয়েছে!`;
        } else {
            await addDoc(collection(db, 'shops', shopId, 'bank_statements'), {
                label, uploadedAt: serverTimestamp(), count: allTransactions.length, transactions: allTransactions,
            });
            saveStatus.textContent = `✅ "${label}" save হয়েছে!`;
        }
        loadSavedStatements();
    } catch (err) { saveStatus.textContent = '❌ ' + err.message; }
    finally { saveBtn.disabled = false; }
});

// ─── Delete local data ────────────────────────────────────────────────────────
document.getElementById('btn-delete-data').addEventListener('click', () => {
    if (!confirm('সব data delete করবেন?')) return;
    localStorage.removeItem('bs_data');
    allTransactions = []; filtered = [];
    [filtersSection, summarySection, chartsSection, tableSection, actionBar,
     document.getElementById('payee-section')].forEach(el => el.classList.add('hidden'));
    uploadStatus.classList.add('hidden');
    if (barChart) { barChart.destroy(); barChart = null; }
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    tbody.innerHTML = '';
});

// ─── Filters ──────────────────────────────────────────────────────────────────
document.getElementById('btn-apply-filter').addEventListener('click', () => {
    const from  = document.getElementById('filter-from').value;
    const to    = document.getElementById('filter-to').value;
    const cat   = document.getElementById('filter-category').value;
    const type  = document.getElementById('filter-type').value;
    const names = getSelectedPayees();
    filtered = allTransactions.filter(t => {
        if (from && t.date < from) return false;
        if (to   && t.date > to)   return false;
        if (cat  && t.category !== cat) return false;
        if (type === 'debit'  && !t.debit)  return false;
        if (type === 'credit' && !t.credit) return false;
        if (names.length && !names.includes(extractPayee(t.desc))) return false;
        return true;
    });
    renderAll();
});
document.getElementById('btn-reset-filter').addEventListener('click', () => {
    ['filter-from','filter-to','filter-category','filter-type'].forEach(id => document.getElementById(id).value = '');
    document.querySelectorAll('#ms-dropdown input').forEach(c => c.checked = false);
    updateTriggerLabel();
    filtered = [...allTransactions]; renderAll();
});

// ─── Restore from localStorage ────────────────────────────────────────────────
(function() {
    const saved = localStorage.getItem('bs_data');
    if (!saved) return;
    try {
        allTransactions = JSON.parse(saved); filtered = [...allTransactions];
        showStatus(`✅ ${allTransactions.length}টি transaction loaded (cached)।`);
        showSections(); populatePayeeList(); renderAll(); actionBar.classList.remove('hidden');
    } catch(e) { localStorage.removeItem('bs_data'); }
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showSections() {
    [filtersSection, summarySection, chartsSection,
     document.getElementById('payee-section'), tableSection].forEach(el => el.classList.remove('hidden'));
}
function showStatus(msg, isError = false) {
    uploadStatus.textContent = msg;
    uploadStatus.className = 'upload-status' + (isError ? ' error' : '');
    uploadStatus.classList.remove('hidden');
}
function fmt(n) { return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
