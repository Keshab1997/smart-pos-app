import { db, auth, collection, query, where, orderBy, getDocs, deleteDoc, doc } from "../js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const recordsList = document.getElementById('recordsList');
const filterDateInput = document.getElementById('filterDate');
const filterBtn = document.getElementById('filterBtn');
const showAllBtn = document.getElementById('showAllBtn');
const printBtn = document.getElementById('printBtn');

// বর্তমানে প্রদর্শিত ডাটা স্টোর করার জন্য ভেরিয়েবল
let currentData = [];

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function toNumber(value, fallback = 0) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
}

function formatMoney(value) {
    return toNumber(value, 0).toFixed(2);
}

// পেজ লোড হলে সব ডাটা দেখাবে
window.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            // rules সাধারণত auth ছাড়া allow করে না; তাই login-এ পাঠিয়ে দিচ্ছি
            window.location.href = '../index.html';
            return;
        }
        loadRecords();
    });
});

// ফিল্টার বাটন ক্লিক
if(filterBtn) {
    filterBtn.addEventListener('click', () => {
        const date = filterDateInput.value;
        if(date) {
            loadRecords(date);
        } else {
            alert("Please select a date first!");
        }
    });
}

// Show All বাটন
if(showAllBtn) {
    showAllBtn.addEventListener('click', () => {
        filterDateInput.value = '';
        loadRecords();
    });
}

// প্রিন্ট বাটন ইভেন্ট
if (printBtn) {
    printBtn.addEventListener('click', () => {
        if (currentData.length === 0) {
            alert("No data available to print!");
            return;
        }
        printReport();
    });
}

// ডাটা লোড ফাংশন
async function loadRecords(dateFilter = null) {
    recordsList.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading records...</p>
        </div>`;
    
    try {
        const activeShopId = localStorage.getItem('activeShopId');
        const user = auth?.currentUser;
        if (!user) {
            recordsList.innerHTML = '<p style="text-align: center; color: red;">Please login first.</p>';
            return;
        }
        if (!activeShopId) {
            recordsList.innerHTML = '<p style="text-align: center; color: red;">Active shop not found. Please login again.</p>';
            return;
        }

        const recordsRef = collection(db, "shops", activeShopId, "purchase_notes_isolated");
        let q;

        if (dateFilter) {
            // Use shopId to satisfy security rules (app stores shop-scoped data).
            q = query(
                recordsRef,
                where("date", "==", dateFilter),
                orderBy("date", "desc")
            );
        } else {
            q = query(recordsRef, orderBy("date", "desc"));
        }

        const querySnapshot = await getDocs(q);

        recordsList.innerHTML = '';
        currentData = [];

        if (querySnapshot.empty) {
            recordsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #7f8c8d;">
                    <i class="far fa-folder-open" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>No records found!</p>
                </div>`;
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            currentData.push({
                id: doc.id,
                ...data
            });
            createRecordCard(data, doc.id);
        });

    } catch (error) {
        console.error("Error getting documents: ", error);
        if (error?.code === 'permission-denied') {
            const activeShopId = localStorage.getItem('activeShopId');
            const user = auth?.currentUser;
            recordsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #c0392b;">
                    <p><strong>Access denied.</strong> Firestore rules blocked reading purchase records.</p>
                    <p style="font-size:12px; opacity:0.9; margin-top:10px;">
                        Debug: shopId=${escapeHtml(activeShopId)} • uid=${escapeHtml(user?.uid)} • email=${escapeHtml(user?.email)}
                    </p>
                    <p style="font-size:12px; opacity:0.9; margin-top:10px;">
                        If you recently changed rules, try saving a NEW record first.
                    </p>
                </div>`;
            return;
        }
        recordsList.innerHTML = '<p style="text-align: center; color: red;">Error loading data. Check console.</p>';
    }
}

// কার্ড তৈরি করার ফাংশন
function createRecordCard(data, id) {
    const card = document.createElement('div');
    card.className = 'record-card';
    card.id = `record-${id}`;

    let itemsHtml = '';
    if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item, index) => {
            itemsHtml += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(item.itemName)}</td>
                    <td>${escapeHtml(item.itemQty || '-')}</td>
                    <td>₹ ${formatMoney(item.itemPrice)}</td>
                </tr>
            `;
        });
    }

    card.innerHTML = `
        <div class="record-header" onclick="toggleDetails('${id}')">
            <div class="record-info">
                <h3>${escapeHtml(data.billName || 'Unknown Shop')}</h3>
                <span class="record-date"><i class="far fa-calendar-alt"></i> ${escapeHtml(data.date)}</span>
            </div>
            <div class="record-right">
                <span class="record-total">₹ ${formatMoney(data.totalAmount)}</span>
                ${data.billImageUrl ? `<a class="bill-image-link" href="${escapeHtml(data.billImageUrl)}" target="_blank" rel="noopener noreferrer" title="View bill image" onclick="event.stopPropagation()"><i class="fas fa-receipt"></i> View Bill</a>` : ``}
                <span class="click-hint">Click to view items</span>
            </div>
        </div>

        <div class="items-container" id="details-${id}">
            <table class="mini-table">
                <thead>
                    <tr>
                        <th>No.</th>
                        <th>Item Name</th>
                        <th>Qty</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            
            <button onclick="deleteRecord('${id}')" class="btn-delete-record">
                <i class="fas fa-trash-alt"></i> Delete Record
            </button>
        </div>
    `;

    recordsList.appendChild(card);
}

// =======================================================
//   FULL DETAILS PRINT FUNCTION
// =======================================================
function printReport() {
    const grandTotal = currentData.reduce((sum, record) => sum + toNumber(record.totalAmount || 0, 0), 0);
    const reportDate = filterDateInput.value ? `Date: ${filterDateInput.value}` : "All Records History";

    const printWindow = window.open('', '', 'height=600,width=800');

    let tableContent = '';

    currentData.forEach((record, index) => {
        tableContent += `
            <tr class="bill-header-row">
                <td>${index + 1}</td>
                <td colspan="3">
                    <strong>${escapeHtml(record.billName)}</strong> 
                    <span style="font-size: 12px; color: #555; margin-left: 10px;">(Date: ${escapeHtml(record.date)})</span>
                </td>
            </tr>
        `;

        if (record.items && record.items.length > 0) {
            record.items.forEach(item => {
                tableContent += `
                    <tr class="item-row">
                        <td></td>
                        <td style="padding-left: 25px;">• ${escapeHtml(item.itemName)}</td>
                        <td style="text-align: center;">${escapeHtml(item.itemQty || '-')}</td>
                        <td style="text-align: right;">${formatMoney(item.itemPrice)}</td>
                    </tr>
                `;
            });
        }

        tableContent += `
            <tr class="bill-total-row">
                <td colspan="3" style="text-align: right;">Bill Total:</td>
                <td style="text-align: right;">₹ ${formatMoney(record.totalAmount)}</td>
            </tr>
            <tr><td colspan="4" style="border: none; height: 10px;"></td></tr>
        `;
    });

    printWindow.document.write(`
        <html>
        <head>
            <title>Detailed Purchase Report</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #333; }
                h1 { text-align: center; margin-bottom: 5px; color: #2c3e50; }
                .subtitle { text-align: center; color: #7f8c8d; margin-bottom: 30px; font-size: 14px; }
                table { width: 100%; border-collapse: collapse; font-size: 13px; }
                th { background-color: #2c3e50; color: white; padding: 8px; text-align: left; }
                td { border: 1px solid #ddd; padding: 6px 8px; }
                .bill-header-row td { background-color: #f0f2f5; font-weight: bold; border-bottom: none; }
                .item-row td { border-top: none; border-bottom: 1px dotted #eee; color: #444; }
                .bill-total-row td { font-weight: bold; background-color: #fff; border-top: 1px solid #999; }
                .grand-total { background-color: #2ecc71 !important; color: white; font-size: 16px; font-weight: bold; }
                .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
            </style>
        </head>
        <body>
            <h1>Purchase Detail Report</h1>
            <p class="subtitle">Report Filter: ${reportDate}</p>

            <table>
                <thead>
                    <tr>
                        <th width="5%">SL</th>
                        <th width="55%">Description / Item Name</th>
                        <th width="20%" style="text-align: center;">Qty</th>
                        <th width="20%" style="text-align: right;">Price (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableContent}
                </tbody>
                <tfoot>
                    <tr class="grand-total">
                        <td colspan="3" style="text-align: right; color: white;">GRAND TOTAL COST:</td>
                        <td style="text-align: right; color: white;">₹ ${grandTotal.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>

            <div class="footer">
                Generated via Smart POS • Printed on: ${new Date().toLocaleString()}
            </div>
        </body>
        </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}

// গ্লোবাল ফাংশন (HTML onclick এর জন্য)
window.toggleDetails = function(id) {
    const container = document.getElementById(`details-${id}`);
    if (container.style.display === "block") {
        container.style.display = "none";
    } else {
        container.style.display = "block";
    }
}

window.deleteRecord = async function(id) {
    if (!confirm("Are you sure you want to delete this purchase record?")) {
        return;
    }

    try {
        const activeShopId = localStorage.getItem('activeShopId');
        await deleteDoc(doc(db, "shops", activeShopId, "purchase_notes_isolated", id));
        
        // অ্যারে থেকে রিমুভ করা
        currentData = currentData.filter(item => item.id !== id);

        const cardElement = document.getElementById(`record-${id}`);
        if (cardElement) {
            cardElement.style.transition = "all 0.5s ease";
            cardElement.style.opacity = "0";
            cardElement.style.transform = "translateX(100px)";
            
            setTimeout(() => {
                cardElement.remove();
            }, 500);
        }
        
    } catch (error) {
        console.error("Error removing document: ", error);
        alert("Error deleting record: " + error.message);
    }
}