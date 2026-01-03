import { db, collection, addDoc, serverTimestamp } from "../js/firebase-config.js";

const tableBody = document.getElementById('tableBody');
const grandTotalEl = document.getElementById('grandTotal');
const addRowBtn = document.getElementById('addRowBtn');
const saveBtn = document.getElementById('saveBtn');
const billDateInput = document.getElementById('billDate');
const billNameInput = document.getElementById('billName');

// পেজ লোড হলে
window.addEventListener('DOMContentLoaded', () => {
    billDateInput.valueAsDate = new Date();
    for(let i=0; i<5; i++) createRow(); // ৫টি খালি রো
});

// নতুন রো তৈরি (Qty সহ)
function createRow() {
    const row = document.createElement('tr');
    const rowCount = tableBody.rows.length + 1;

    row.innerHTML = `
        <td class="row-number">${rowCount}</td>
        <td><input type="text" class="item-name" placeholder="Item Name"></td>
        <td><input type="text" class="item-qty" placeholder="e.g. 5 kg"></td> <!-- Qty Field -->
        <td><input type="number" class="item-price" placeholder="0" min="0"></td>
        <td><button class="delete-btn">X</button></td>
    `;

    // ডিলেট ইভেন্ট
    row.querySelector('.delete-btn').addEventListener('click', () => {
        row.remove();
        updateRowNumbers();
        calculateTotal();
    });

    // প্রাইস পাল্টালে টোটাল আপডেট হবে
    row.querySelector('.item-price').addEventListener('input', calculateTotal);

    tableBody.appendChild(row);
}

function updateRowNumbers() {
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach((row, index) => {
        row.querySelector('.row-number').innerText = index + 1;
    });
}

function calculateTotal() {
    let total = 0;
    document.querySelectorAll('.item-price').forEach(input => {
        const val = parseFloat(input.value);
        if (!isNaN(val)) total += val;
    });
    grandTotalEl.innerText = total.toFixed(2);
}

addRowBtn.addEventListener('click', createRow);

// সেভ বাটন (আপডেট করা হয়েছে)
saveBtn.addEventListener('click', async () => {
    const date = billDateInput.value;
    const billName = billNameInput.value.trim();
    const totalAmount = parseFloat(grandTotalEl.innerText);
    
    if (!date) { alert("Please select a date!"); return; }

    let items = [];
    const rows = tableBody.querySelectorAll('tr');

    rows.forEach(row => {
        const name = row.querySelector('.item-name').value.trim();
        const qty = row.querySelector('.item-qty').value.trim();
        const price = row.querySelector('.item-price').value;

        if (name || (price && parseFloat(price) > 0)) {
            items.push({
                itemName: name,
                itemQty: qty, // Qty সেভ হচ্ছে
                itemPrice: parseFloat(price) || 0
            });
        }
    });

    if (items.length === 0) { alert("Add at least one item!"); return; }

    saveBtn.innerText = "Saving...";
    saveBtn.disabled = true;

    try {
        await addDoc(collection(db, "purchase_notes_isolated"), {
            date: date,
            billName: billName || "Unnamed Bill",
            items: items,
            totalAmount: totalAmount,
            createdAt: serverTimestamp()
        });

        alert("✅ Saved Successfully!");
        window.location.reload();
    } catch (error) {
        console.error("Error:", error);
        alert("Error saving data!");
        saveBtn.innerText = "💾 SAVE RECORD";
        saveBtn.disabled = false;
    }
});