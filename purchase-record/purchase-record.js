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
        <!-- Qty ফিল্ড (ডাটাবেসে সেভ হবে) -->
        <td><input type="text" class="item-qty" placeholder="e.g. 5 kg"></td> 
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

// রো নম্বর আপডেট করা
function updateRowNumbers() {
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach((row, index) => {
        row.querySelector('.row-number').innerText = index + 1;
    });
}

// টোটাল ক্যালকুলেশন
function calculateTotal() {
    let total = 0;
    document.querySelectorAll('.item-price').forEach(input => {
        const val = parseFloat(input.value);
        if (!isNaN(val)) total += val;
    });
    grandTotalEl.innerText = total.toFixed(2);
}

// বাটনে ক্লিক করলে নতুন রো আসবে
addRowBtn.addEventListener('click', createRow);

// সেভ বাটন (Firebase এ ডাটা পাঠানো)
saveBtn.addEventListener('click', async () => {
    const date = billDateInput.value;
    const billName = billNameInput.value.trim();
    const totalAmount = parseFloat(grandTotalEl.innerText);
    
    if (!date) { alert("Please select a date!"); return; }

    let items = [];
    const rows = tableBody.querySelectorAll('tr');

    // টেবিলের প্রতিটি রো থেকে ডাটা নেওয়া হচ্ছে
    rows.forEach(row => {
        const name = row.querySelector('.item-name').value.trim();
        const qty = row.querySelector('.item-qty').value.trim(); // Qty নেওয়া হচ্ছে
        const price = row.querySelector('.item-price').value;

        // যদি নাম অথবা দাম কিছু একটা থাকে, তাহলেই লিস্টে যোগ হবে
        if (name || (price && parseFloat(price) > 0)) {
            items.push({
                itemName: name || "Unknown Item",
                itemQty: qty || "-",  // Qty এখানে অবজেক্টে ঢোকানো হচ্ছে (খালি থাকলে '-' যাবে)
                itemPrice: parseFloat(price) || 0
            });
        }
    });

    if (items.length === 0) { alert("Add at least one item!"); return; }

    // বাটন ডিজেবল করা (ডাবল ক্লিক রোধ করতে)
    saveBtn.innerText = "Saving...";
    saveBtn.disabled = true;

    try {
        // ফায়ারবেস কালেকশনে ডকুমেন্ট তৈরি
        await addDoc(collection(db, "purchase_notes_isolated"), {
            date: date,
            billName: billName || "Unnamed Bill",
            items: items, // পুরো আইটেম লিস্ট (Qty সহ) সেভ হচ্ছে
            totalAmount: totalAmount,
            createdAt: serverTimestamp()
        });

        alert("✅ Saved Successfully!");
        window.location.reload(); // পেজ রিলোড
    } catch (error) {
        console.error("Error:", error);
        alert("Error saving data: " + error.message);
        saveBtn.innerText = "💾 SAVE RECORD";
        saveBtn.disabled = false;
    }
});