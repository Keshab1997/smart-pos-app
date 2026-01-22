// cancelled-bills/script.js

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    collection, getDocs, query, where, orderBy 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const tbody = document.getElementById('cancelled-list-body');
const dateFromInput = document.getElementById('date-from');
const dateToInput = document.getElementById('date-to');
const btnFilter = document.getElementById('btn-filter');
const btnReset = document.getElementById('btn-reset');

let activeShopId = null;
let allCancelledBills = [];

// 1. Auth Check
onAuthStateChanged(auth, (user) => {
    if (user) {
        activeShopId = localStorage.getItem('activeShopId');
        if (!activeShopId) {
            window.location.href = '../index.html';
            return;
        }
        loadCancelledBills();
    } else {
        window.location.href = '../index.html';
    }
});

// 2. Load Data
async function loadCancelledBills() {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Loading data...</td></tr>';
    
    try {
        const salesRef = collection(db, 'shops', activeShopId, 'sales');
        
        // আমরা সেই সব বিল খুঁজছি যেগুলোর status == 'cancelled'
        // নোট: আপনার সিস্টেমে বিল ক্যানসেল করার সময় status আপডেট করতে হবে।
        const q = query(salesRef, where("status", "==", "cancelled"), orderBy("createdAt", "desc"));
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #666;">No cancelled bills found.</td></tr>';
            allCancelledBills = [];
            return;
        }

        allCancelledBills = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            jsDate: doc.data().createdAt ? doc.data().createdAt.toDate() : new Date()
        }));

        renderTable(allCancelledBills);

    } catch (error) {
        console.error("Error loading cancelled bills:", error);
        // Indexing error হতে পারে যদি 'status' এবং 'createdAt' একসাথে কুয়েরি করা হয়
        if(error.message.includes("index")) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Error: Missing Index. Check Console for link.</td></tr>`;
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red;">Failed to load data.</td></tr>`;
        }
    }
}

// 3. Render Table
function renderTable(data) {
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No records found for this period.</td></tr>';
        return;
    }

    data.forEach(bill => {
        const tr = document.createElement('tr');
        
        const dateStr = bill.jsDate.toLocaleDateString('en-IN');
        const timeStr = bill.jsDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        
        // ক্যানসেল করার কারণ (যদি ডাটাবেসে থাকে)
        const reason = bill.cancellationReason || "No reason provided";
        const cancelledBy = bill.cancelledBy || "Admin"; // কে ক্যানসেল করেছে

        tr.innerHTML = `
            <td>
                <div style="font-weight:bold;">${dateStr}</div>
                <div style="font-size:12px; color:#666;">${timeStr}</div>
            </td>
            <td>${bill.billNo || bill.id.slice(0,6)}</td>
            <td>
                <div>${bill.customerDetails?.name || 'Walk-in'}</div>
                <div style="font-size:11px;">${bill.customerDetails?.phone || ''}</div>
            </td>
            <td class="amount-text">₹${(bill.total || 0).toFixed(2)}</td>
            <td><span class="reason-text">${reason}</span></td>
            <td>${cancelledBy}</td>
            <td>
                <button class="btn-view" onclick="viewBill('${bill.id}')">👁️ View</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 4. Filter Logic
btnFilter.addEventListener('click', () => {
    const from = dateFromInput.value ? new Date(dateFromInput.value) : null;
    const to = dateToInput.value ? new Date(dateToInput.value) : null;

    if (from) from.setHours(0,0,0,0);
    if (to) to.setHours(23,59,59,999);

    const filtered = allCancelledBills.filter(bill => {
        if (from && bill.jsDate < from) return false;
        if (to && bill.jsDate > to) return false;
        return true;
    });

    renderTable(filtered);
});

btnReset.addEventListener('click', () => {
    dateFromInput.value = '';
    dateToInput.value = '';
    renderTable(allCancelledBills);
});

// 5. View Bill Function
window.viewBill = (id) => {
    // বিল প্রিন্ট পেজে নিয়ে যাবে, যাতে ডিটেইলস দেখা যায়
    window.open(`../billing/print.html?saleId=${id}`, '_blank');
};