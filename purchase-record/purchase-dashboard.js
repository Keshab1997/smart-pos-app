import { db, collection, query, where, orderBy, getDocs, deleteDoc, doc } from "../js/firebase-config.js";

const recordsList = document.getElementById('recordsList');
const filterDateInput = document.getElementById('filterDate');
const filterBtn = document.getElementById('filterBtn');
const showAllBtn = document.getElementById('showAllBtn');

// পেজ লোড হলে সব ডাটা দেখাবে
window.addEventListener('DOMContentLoaded', () => {
    loadRecords();
});

// ফিল্টার বাটন ক্লিক
filterBtn.addEventListener('click', () => {
    const date = filterDateInput.value;
    if(date) {
        loadRecords(date);
    } else {
        alert("Please select a date first!");
    }
});

// Show All বাটন
showAllBtn.addEventListener('click', () => {
    filterDateInput.value = '';
    loadRecords();
});

// ডাটা লোড ফাংশন
async function loadRecords(dateFilter = null) {
    // লোডিং এনিমেশন
    recordsList.innerHTML = `
        <div class="loading-state">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Loading records...</p>
        </div>`;
    
    try {
        const recordsRef = collection(db, "purchase_notes_isolated");
        let q;

        if (dateFilter) {
            q = query(recordsRef, where("date", "==", dateFilter));
        } else {
            q = query(recordsRef, orderBy("date", "desc"));
        }

        const querySnapshot = await getDocs(q);

        recordsList.innerHTML = ''; // আগের লিস্ট ক্লিয়ার

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
            createRecordCard(data, doc.id);
        });

    } catch (error) {
        console.error("Error getting documents: ", error);
        recordsList.innerHTML = '<p style="text-align: center; color: red;">Error loading data. Check console.</p>';
    }
}

// কার্ড তৈরি করার ফাংশন (ডিজাইন ফিক্স করা হয়েছে)
function createRecordCard(data, id) {
    const card = document.createElement('div');
    card.className = 'record-card';
    card.id = `record-${id}`; // ডিলিট করার পর রিমুভ করতে আইডি দরকার

    // আইটেমগুলোর টেবিল রো বানানো
    let itemsHtml = '';
    if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item, index) => {
            itemsHtml += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${item.itemName}</td>
                    <td>${item.itemQty || '-'}</td>
                    <td>₹ ${item.itemPrice}</td>
                </tr>
            `;
        });
    }

    // HTML স্ট্রাকচার - CSS এর সাথে মিল রেখে
    card.innerHTML = `
        <div class="record-header" onclick="toggleDetails('${id}')">
            <div class="record-info">
                <h3>${data.billName || 'Unknown Shop'}</h3>
                <span class="record-date"><i class="far fa-calendar-alt"></i> ${data.date}</span>
            </div>
            <div class="record-right">
                <span class="record-total">₹ ${data.totalAmount}</span>
                <span class="click-hint">Click to view items</span>
            </div>
        </div>

        <!-- ডিটেইলস কন্টেইনার (লুকানো) -->
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
            
            <!-- ডিলিট বাটন -->
            <button onclick="deleteRecord('${id}')" class="btn-delete-record">
                <i class="fas fa-trash-alt"></i> Delete Record
            </button>
        </div>
    `;

    recordsList.appendChild(card);
}

// গ্লোবাল ফাংশন: ডিটেইলস হাইড/শো করার জন্য
window.toggleDetails = function(id) {
    const container = document.getElementById(`details-${id}`);
    if (container.style.display === "block") {
        container.style.display = "none";
    } else {
        container.style.display = "block";
    }
}

// গ্লোবাল ফাংশন: রেকর্ড ডিলিট করার জন্য
window.deleteRecord = async function(id) {
    // কনফার্মেশন মেসেজ
    if (!confirm("Are you sure you want to delete this purchase record? This cannot be undone.")) {
        return;
    }

    try {
        // ফায়ারবেস থেকে ডিলিট
        await deleteDoc(doc(db, "purchase_notes_isolated", id));
        
        // UI থেকে কার্ড রিমুভ (পেজ রিলোড ছাড়া)
        const cardElement = document.getElementById(`record-${id}`);
        if (cardElement) {
            cardElement.style.transition = "all 0.5s ease";
            cardElement.style.opacity = "0";
            cardElement.style.transform = "translateX(100px)";
            
            setTimeout(() => {
                cardElement.remove();
            }, 500);
        }
        
        alert("Record deleted successfully!");

    } catch (error) {
        console.error("Error removing document: ", error);
        alert("Error deleting record: " + error.message);
    }
}