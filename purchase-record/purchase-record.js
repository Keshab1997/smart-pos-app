import { db, auth, collection, addDoc, serverTimestamp } from "../js/firebase-config.js";

const tableBody = document.getElementById('tableBody');
const grandTotalEl = document.getElementById('grandTotal');
const addRowBtn = document.getElementById('addRowBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const saveBtn = document.getElementById('saveBtn');
const billDateInput = document.getElementById('billDate');
const billNameInput = document.getElementById('billName');

// ================= AI Assist elements =================
const selectBillImageBtn = document.getElementById('selectBillImageBtn');
const openAiStudioBtn = document.getElementById('openAiStudioBtn');
const applyAiOutputBtn = document.getElementById('applyAiOutputBtn');
const billImageInput = document.getElementById('billImageInput');
const billImagePreview = document.getElementById('billImagePreview');
const aiPromptBox = document.getElementById('aiPromptBox');
const copyAiPromptBtn = document.getElementById('copyAiPromptBtn');
const aiOutputJson = document.getElementById('aiOutputJson');
const aiAssistStatus = document.getElementById('aiAssistStatus');

const AI_STUDIO_URL = 'https://aistudio.google.com/prompts/new_chat';
const PURCHASE_DRAFT_KEY = 'purchase_record_draft_v1';
let draftSaveTimer = null;

// ================= ImageBB (store bill image URL with record) =================
// NOTE: Project already uses ImgBB in other modules (inventory/staff/add-product).
const IMGBB_API_KEY = '13567a95e9fe3a212a8d8d10da9f3267';

async function compressImageToJpegBlob(file, { maxWidth = 1400, quality = 0.78 } = {}) {
    // If it's already small-ish, upload as-is to keep it fast.
    if (!file || file.size < 550 * 1024) return file;

    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read image.'));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onerror = () => reject(new Error('Invalid image.'));
        image.onload = () => resolve(image);
        image.src = dataUrl;
    });

    const scale = Math.min(1, maxWidth / (img.width || maxWidth));
    const w = Math.max(1, Math.round((img.width || maxWidth) * scale));
    const h = Math.max(1, Math.round((img.height || maxWidth) * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });

    // If blob creation failed, fall back to original file.
    return blob || file;
}

async function uploadBillImageToImgBB(file) {
    const blobOrFile = await compressImageToJpegBlob(file);
    const formData = new FormData();
    formData.append('image', blobOrFile);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData
    });

    const data = await response.json();
    return data?.success ? (data?.data?.url || null) : null;
}

// পেজ লোড হলে
window.addEventListener('DOMContentLoaded', () => {
    restoreDraftOrInit();
});

// নতুন রো তৈরি (Qty সহ)
function createRow() {
    const row = document.createElement('tr');
    const rowCount = tableBody.rows.length + 1;

    row.innerHTML = `
        <td class="row-number">${rowCount}</td>
        <td><input type="text" class="item-name" placeholder="Item Name"></td>
        <td>
            <div class="qty-unit-wrap">
                <input type="number" class="item-qty-value" placeholder="Qty" min="0" step="any">
                <input type="text" class="item-unit" placeholder="Unit" list="unitOptions">
            </div>
        </td>
        <td><input type="number" class="item-unit-price" placeholder="0" min="0" step="any"></td>
        <td class="line-total-cell"><span class="item-line-total">0.00</span></td>
        <td class="action-cell"><button class="delete-btn" type="button">X</button></td>
    `;

    // ডিলেট ইভেন্ট
    row.querySelector('.delete-btn').addEventListener('click', () => {
        row.remove();
        updateRowNumbers();
        calculateTotal();
        scheduleDraftSave();
    });

    // Qty/Unit Price পাল্টালে টোটাল আপডেট হবে
    row.querySelector('.item-qty-value').addEventListener('input', calculateTotal);
    row.querySelector('.item-unit-price').addEventListener('input', calculateTotal);
    row.querySelector('.item-name').addEventListener('input', scheduleDraftSave);
    row.querySelector('.item-unit').addEventListener('input', scheduleDraftSave);
    row.querySelector('.item-qty-value').addEventListener('input', scheduleDraftSave);
    row.querySelector('.item-unit-price').addEventListener('input', scheduleDraftSave);

    tableBody.appendChild(row);
}

// রো নম্বর আপডেট করা
function updateRowNumbers() {
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach((row, index) => {
        row.querySelector('.row-number').innerText = index + 1;
    });
}

// টোটাল ক্যালকুলেশন
function calculateTotal() {
    let grandTotal = 0;
    const rows = tableBody.querySelectorAll('tr');

    rows.forEach(row => {
        const qtyVal = parseFloat(row.querySelector('.item-qty-value')?.value || '0');
        const unitPrice = parseFloat(row.querySelector('.item-unit-price')?.value || '0');

        const qty = Number.isFinite(qtyVal) ? qtyVal : 0;
        const price = Number.isFinite(unitPrice) ? unitPrice : 0;

        const lineTotal = qty * price;
        const lineTotalEl = row.querySelector('.item-line-total');
        if (lineTotalEl) lineTotalEl.innerText = (Number.isFinite(lineTotal) ? lineTotal : 0).toFixed(2);

        grandTotal += Number.isFinite(lineTotal) ? lineTotal : 0;
    });

    grandTotalEl.innerText = grandTotal.toFixed(2);
}

// বাটনে ক্লিক করলে নতুন রো আসবে
addRowBtn.addEventListener('click', () => {
    createRow();
    scheduleDraftSave();
});

function getDraftData() {
    const rows = Array.from(tableBody.querySelectorAll('tr'));
    return {
        billDate: billDateInput.value || '',
        billName: billNameInput.value || '',
        items: rows.map((row) => ({
            itemName: row.querySelector('.item-name')?.value || '',
            itemQtyValue: row.querySelector('.item-qty-value')?.value || '',
            itemUnit: row.querySelector('.item-unit')?.value || '',
            itemUnitPrice: row.querySelector('.item-unit-price')?.value || ''
        }))
    };
}

function saveDraftNow() {
    try {
        localStorage.setItem(PURCHASE_DRAFT_KEY, JSON.stringify(getDraftData()));
    } catch (e) {
        console.error('Draft save failed', e);
    }
}

function scheduleDraftSave() {
    if (draftSaveTimer) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(saveDraftNow, 200);
}

function setRowData(row, item) {
    if (!row || !item) return;
    const itemNameEl = row.querySelector('.item-name');
    const qtyEl = row.querySelector('.item-qty-value');
    const unitEl = row.querySelector('.item-unit');
    const unitPriceEl = row.querySelector('.item-unit-price');

    itemNameEl.value = item.itemName ?? '';
    qtyEl.value = item.itemQtyValue ?? '';
    unitEl.value = item.itemUnit ?? '';
    unitPriceEl.value = item.itemUnitPrice ?? '';
}

function restoreDraftOrInit() {
    try {
        const raw = localStorage.getItem(PURCHASE_DRAFT_KEY);
        if (!raw) {
            billDateInput.valueAsDate = new Date();
            for (let i = 0; i < 5; i++) createRow();
            calculateTotal();
            return;
        }

        const draft = JSON.parse(raw);
        tableBody.innerHTML = '';
        billDateInput.value = draft?.billDate || '';
        billNameInput.value = draft?.billName || '';

        const items = Array.isArray(draft?.items) ? draft.items : [];
        if (items.length === 0) {
            for (let i = 0; i < 5; i++) createRow();
        } else {
            items.forEach((item) => {
                createRow();
                const row = tableBody.lastElementChild;
                setRowData(row, item);
            });
        }
        calculateTotal();
        showToast('Draft restored.');
    } catch (e) {
        console.error('Draft restore failed', e);
        billDateInput.valueAsDate = new Date();
        for (let i = 0; i < 5; i++) createRow();
        calculateTotal();
    }
}

function clearAllEntries() {
    tableBody.innerHTML = '';
    billNameInput.value = '';
    billDateInput.valueAsDate = new Date();
    for (let i = 0; i < 5; i++) createRow();
    calculateTotal();
    localStorage.removeItem(PURCHASE_DRAFT_KEY);
    if (aiOutputJson) aiOutputJson.value = '';
    if (billImageInput) billImageInput.value = '';
    if (billImagePreview) {
        billImagePreview.src = '';
        billImagePreview.style.display = 'none';
    }
    setAiStatus('All entries cleared.');
}

if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
        const ok = confirm('সব এন্ট্রি ক্লিয়ার করতে চান?');
        if (!ok) return;
        clearAllEntries();
    });
}

billDateInput.addEventListener('input', scheduleDraftSave);
billNameInput.addEventListener('input', scheduleDraftSave);

function escapeHtml(text) {
    return String(text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function buildAiPrompt() {
    // AI থেকে শুধুই JSON চাওয়া হবে—যাতে আমাদের পার্স করা সহজ হয়।
    return `
You will be given an image of a purchase bill/receipt.
Extract the following and return ONLY valid JSON (no extra text, no markdown):

{
  "billName": "supplier/shop name as seen (string)",
  "date": "bill date in YYYY-MM-DD if visible, otherwise null",
  "items": [
    {
      "itemName": "name/title as seen",
      "itemQty": number (quantity as number, if not found then 1),
      "itemUnit": "unit string as seen (e.g. pcs/kg/box). If not found then 'pcs'",
      "unitPrice": number (price per unit as seen. If only line total is visible, put line total as unitPrice and set itemQty=1)
    }
  ]
}

Rules:
- Use itemQty and itemUnit for each line item.
- If there is only total amount and no qty/unit/price details, create one item with itemQty=1 and itemUnit='pcs' and put total as unitPrice.
`.trim();
}

async function copyTextToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

async function ensurePromptAndCopy() {
    const prompt = buildAiPrompt();
    if (aiPromptBox && !aiPromptBox.value) aiPromptBox.value = prompt;

    const ok = await copyTextToClipboard(aiPromptBox?.value || prompt);
    if (!ok && aiPromptBox) {
        aiPromptBox.focus();
        aiPromptBox.select();
    }
    setAiStatus(ok ? "Prompt copied." : "Prompt ready. Copy it manually (selected).");
    return ok;
}

function showToast(message) {
    const el = document.createElement('div');
    el.textContent = message;
    el.style.position = 'fixed';
    el.style.right = '18px';
    el.style.bottom = '18px';
    el.style.zIndex = '9999';
    el.style.padding = '10px 12px';
    el.style.background = 'rgba(44,62,80,0.95)';
    el.style.color = 'white';
    el.style.borderRadius = '10px';
    el.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    el.style.fontSize = '13px';
    el.style.maxWidth = '360px';
    el.style.whiteSpace = 'pre-wrap';
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 250ms ease';
        setTimeout(() => el.remove(), 260);
    }, 2200);
}

function setAiStatus(message, isError = false) {
    if (!aiAssistStatus) return;
    aiAssistStatus.innerHTML = `<span style="color:${isError ? '#dc3545' : '#2c3e50'};">${escapeHtml(message)}</span>`;
}

function clearTableRows() {
    tableBody.innerHTML = '';
}

function applyAiResult(result) {
    const items = Array.isArray(result?.items) ? result.items : [];
    if (items.length === 0) throw new Error("No items found in AI JSON.");

    // bill meta
    if (typeof result.billName === 'string') {
        billNameInput.value = result.billName;
    }
    if (typeof result.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(result.date)) {
        billDateInput.value = result.date;
    }

    clearTableRows();
    // create rows exactly for items
    items.forEach((_, index) => {
        createRow();
    });

    const rows = tableBody.querySelectorAll('tr');
    items.forEach((item, index) => {
        const row = rows[index];
        if (!row) return;

        const itemNameEl = row.querySelector('.item-name');
        const qtyEl = row.querySelector('.item-qty-value');
        const unitEl = row.querySelector('.item-unit');
        const unitPriceEl = row.querySelector('.item-unit-price');

        itemNameEl.value = item?.itemName ?? '';
        qtyEl.value = Number.isFinite(Number(item?.itemQty)) ? Number(item.itemQty) : 1;
        unitEl.value = item?.itemUnit ?? 'pcs';
        unitPriceEl.value = Number.isFinite(Number(item?.unitPrice)) ? Number(item.unitPrice) : 0;
    });

    // recalc totals after programmatic updates
    calculateTotal();
    saveDraftNow();
}

function extractJsonFromText(text) {
    const raw = String(text ?? '').trim();
    if (!raw) return null;

    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        return raw.slice(start, end + 1);
    }
    return null;
}

// --- AI Studio open + copy prompt ---
if (openAiStudioBtn) {
    openAiStudioBtn.addEventListener('click', async () => {
        const prompt = buildAiPrompt();
        if (aiPromptBox) aiPromptBox.value = prompt;

        // open AI Studio (user will upload/select the image there)
        window.open(AI_STUDIO_URL, '_blank', 'noopener,noreferrer');

        const ok = await copyTextToClipboard(prompt);
        if (!ok && aiPromptBox) {
            aiPromptBox.focus();
            aiPromptBox.select();
        }
        setAiStatus(ok ? "AI prompt copied. Paste it in AI Studio input." : "Prompt ready. Copy it manually (selected).");
    });
}

// --- One-click copy prompt ---
if (copyAiPromptBtn) {
    copyAiPromptBtn.addEventListener('click', async () => {
        await ensurePromptAndCopy();
    });
}

// --- Select bill image (preview only; AI Studio upload is manual) ---
if (selectBillImageBtn && billImageInput && billImagePreview) {
    selectBillImageBtn.addEventListener('click', () => billImageInput.click());

    billImageInput.addEventListener('change', async () => {
        const file = billImageInput.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        billImagePreview.src = url;
        billImagePreview.style.display = 'block';

        // Prompt should appear immediately after selecting an image.
        const prompt = buildAiPrompt();
        if (aiPromptBox) aiPromptBox.value = prompt;

        // Best-effort copy (may be blocked by browser permissions).
        const copied = await copyTextToClipboard(prompt);
        setAiStatus(
            copied
                ? "Bill image selected. Prompt copied—paste it in AI Studio and upload the same image there."
                : "Bill image selected. Prompt is ready—copy it and paste in AI Studio, then upload the same image there."
        );
    });
}

// --- Apply AI JSON to table ---
if (applyAiOutputBtn) {
    applyAiOutputBtn.addEventListener('click', () => {
        try {
            if (!aiOutputJson) throw new Error("AI output box not found.");
            const raw = aiOutputJson.value.trim();
            if (!raw) throw new Error("Paste AI JSON first.");
            const jsonText = extractJsonFromText(raw);
            if (!jsonText) throw new Error("Could not find JSON object. Paste only JSON.");
            const parsed = JSON.parse(jsonText);
            applyAiResult(parsed);
            setAiStatus("Auto-fill done from AI JSON.");
        } catch (e) {
            console.error(e);
            setAiStatus(e?.message || "Failed to apply AI JSON.", true);
        }
    });
}

// সেভ বাটন (Firebase এ ডাটা পাঠানো)
saveBtn.addEventListener('click', async () => {
    const activeShopId = localStorage.getItem('activeShopId');
    const user = auth?.currentUser;

    if (!user) {
        alert("Please login to save records.");
        window.location.href = '../index.html';
        return;
    }

    if (!activeShopId) {
        alert("Active shop not found. Please login again.");
        window.location.href = '../index.html';
        return;
    }

    const date = billDateInput.value;
    const billName = billNameInput.value.trim();
    const totalAmount = parseFloat(grandTotalEl.innerText);
    
    if (!date) { alert("Please select a date!"); return; }

    let items = [];
    const rows = tableBody.querySelectorAll('tr');

    // টেবিলের প্রতিটি রো থেকে ডাটা নেওয়া হচ্ছে
    rows.forEach(row => {
        const name = row.querySelector('.item-name').value.trim();
        const qtyValueRaw = row.querySelector('.item-qty-value')?.value ?? '';
        const unit = (row.querySelector('.item-unit')?.value ?? '').trim();
        const unitPriceRaw = row.querySelector('.item-unit-price')?.value ?? '';

        const qtyValue = parseFloat(qtyValueRaw);
        const unitPrice = parseFloat(unitPriceRaw);

        const qty = Number.isFinite(qtyValue) ? qtyValue : 0;
        const price = Number.isFinite(unitPrice) ? unitPrice : 0;
        const lineTotal = qty * price;

        const hasAnyData = Boolean(name) || qty > 0 || price > 0 || Boolean(unit);

        if (hasAnyData) {
            items.push({
                itemName: name || "Unknown Item",
                // backward-compatible display string
                itemQty: `${qty || 0}${unit ? ` ${unit}` : ''}`.trim() || "-",
                // keep dashboard compatible: itemPrice = line total
                itemPrice: Number.isFinite(lineTotal) ? lineTotal : 0,
                // also store structured fields for future usage
                itemQtyValue: qty,
                itemUnit: unit || null,
                itemUnitPrice: price,
                itemLineTotal: Number.isFinite(lineTotal) ? lineTotal : 0
            });
        }
    });

    if (items.length === 0) { alert("Add at least one item!"); return; }

    // বাটন ডিজেবল করা (ডাবল ক্লিক রোধ করতে)
    saveBtn.innerText = "Saving...";
    saveBtn.disabled = true;

    try {
        // Upload bill image (optional) and store URL with record.
        let billImageUrl = null;
        const billFile = billImageInput?.files?.[0] || null;
        if (billFile) {
            setAiStatus('Uploading bill image...');
            try {
                billImageUrl = await uploadBillImageToImgBB(billFile);
                if (!billImageUrl) {
                    setAiStatus('Bill image upload failed. Saving record without image...', true);
                } else {
                    setAiStatus('Bill image uploaded. Saving record...');
                }
            } catch (e) {
                console.error('Bill image upload failed', e);
                setAiStatus('Bill image upload error. Saving record without image...', true);
            }
        }

        // ফায়ারবেস কালেকশনে ডকুমেন্ট তৈরি
        await addDoc(collection(db, "shops", activeShopId, "purchase_notes_isolated"), {
            date: date,
            billName: billName || "Unnamed Bill",
            items: items, // পুরো আইটেম লিস্ট (Qty সহ) সেভ হচ্ছে
            totalAmount: totalAmount,
            billImageUrl: billImageUrl || null,
            shopId: activeShopId,
            createdByUid: user.uid,
            createdByEmail: user.email || null,
            createdAt: serverTimestamp()
        });

        localStorage.removeItem(PURCHASE_DRAFT_KEY);
        alert("✅ Saved Successfully!");
        window.location.reload(); // পেজ রিলোড
    } catch (error) {
        console.error("Error:", error);
        alert("Error saving data: " + error.message);
        saveBtn.innerText = "SAVE RECORD";
        saveBtn.disabled = false;
    }
});