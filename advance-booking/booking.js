import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

let currentUserId = null;
let allBookings = []; // সব বুকিং ডেটা এখানে জমা থাকবে

// --- অথেন্টিকেশন চেক ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        loadBookings(); // ডেটা লোড শুরু
        setupSearchListener(); // সার্চ অপশন চালু
    } else {
        window.location.href = '../index.html';
    }
});

// --- বুকিং সেভ করা এবং প্রিন্ট করা ---
document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserId) return;

    const saveBtn = document.querySelector('.save-btn');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const data = {
        customerName: document.getElementById('b-name').value.trim(),
        phone: document.getElementById('b-phone').value.trim(),
        description: document.getElementById('b-desc').value,
        estimatedTotal: parseFloat(document.getElementById('b-total').value) || 0,
        advancePaid: parseFloat(document.getElementById('b-advance').value) || 0,
        deliveryDate: document.getElementById('b-date').value,
        status: 'Pending',
        createdAt: serverTimestamp()
    };

    try {
        const docRef = await addDoc(collection(db, 'shops', currentUserId, 'bookings'), data);
        e.target.reset();
        window.open(`booking-print.html?id=${docRef.id}`, '_blank');
    } catch (error) {
        console.error("Error:", error);
        alert("Failed to save booking.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
});

// --- বুকিং ডেটা ফায়ারবেস থেকে আনা ---
function loadBookings() {
    const q = query(collection(db, 'shops', currentUserId, 'bookings'), orderBy('createdAt', 'desc'));
    
    onSnapshot(q, (snapshot) => {
        allBookings = []; // লিস্ট ক্লিয়ার করা
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.status !== 'Billed') { // যেগুলো বিল হয়ে গেছে সেগুলো বাদ
                allBookings.push({ id: docSnap.id, ...data });
            }
        });
        // প্রথমবার সব ডেটা রেন্ডার করা
        renderTable(allBookings);
    });
}

// --- সার্চ সেটআপ (আপনার চাওয়া অনুযায়ী) ---
function setupSearchListener() {
    const searchInput = document.getElementById('search-booking');
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (!searchTerm) {
            // সার্চবক্স খালি থাকলে সব নরমাল ভাবে দেখাবে
            renderTable(allBookings);
            return;
        }

        // ফিল্টারিং এবং সর্টিং লজিক
        const matches = [];
        const others = [];

        allBookings.forEach(booking => {
            const name = booking.customerName.toLowerCase();
            const phone = booking.phone.toLowerCase();

            // নাম বা ফোনে মিললে matches-এ যাবে, না হলে others-এ
            if (name.includes(searchTerm) || phone.includes(searchTerm)) {
                matches.push({ ...booking, isMatch: true }); // স্পেশাল ফ্ল্যাগ দেওয়া হলো
            } else {
                others.push({ ...booking, isMatch: false });
            }
        });

        // যারা ম্যাচ করেছে তারা সবার উপরে থাকবে
        const sortedList = [...matches, ...others];
        renderTable(sortedList);
    });
}

// --- টেবিলে ডেটা দেখানো (Rendering) ---
function renderTable(bookingList) {
    const tbody = document.getElementById('booking-table-body');
    tbody.innerHTML = '';
    
    if (bookingList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No active bookings found.</td></tr>';
        return;
    }

    bookingList.forEach(book => {
        const row = document.createElement('tr');
        
        // যদি সার্চে ম্যাচ করে, তাহলে ব্যাকগ্রাউন্ড হলুদ হবে
        if (book.isMatch) {
            row.style.backgroundColor = '#fff3cd'; // হালকা হলুদ হাইলাইট
            row.style.borderLeft = '5px solid #ffc107';
        }

        const statusClass = book.status === 'Ready' ? 'status-ready' : 'status-pending';
        
        // বাটন লজিক
        let actionButtons = `<button class="action-btn btn-print" onclick="printSlip('${book.id}')" style="background:#6c757d; color:white;">Print</button> `;
        
        if (book.status === 'Pending') {
            actionButtons += `<button class="action-btn btn-ready" onclick="updateStatus('${book.id}', 'Ready')">Mark Ready</button>`;
        } else if (book.status === 'Ready') {
            actionButtons += `<button class="action-btn btn-bill" onclick="finalizeToBill('${book.id}')">Final Bill</button>`;
        }

        row.innerHTML = `
            <td>${book.deliveryDate}</td>
            <td><strong>${book.customerName}</strong><br><small>${book.phone}</small></td>
            <td>${book.description}</td>
            <td>₹${book.advancePaid}</td>
            <td><span class="status-badge ${statusClass}" style="padding:5px 10px; border-radius:15px; font-size:0.8rem; font-weight:bold;">${book.status}</span></td>
            <td>${actionButtons}</td>
        `;
        tbody.appendChild(row);
    });
}

// --- গ্লোবাল ফাংশনস (HTML থেকে কল করার জন্য) ---
window.printSlip = (id) => {
    window.open(`booking-print.html?id=${id}`, '_blank');
};

window.updateStatus = async (id, status) => {
    if(confirm("Is the product ready for delivery?")) {
        try {
            await updateDoc(doc(db, 'shops', currentUserId, 'bookings', id), { status: status });
        } catch (error) {
            console.error("Error:", error);
        }
    }
};

window.finalizeToBill = async (id) => {
    sessionStorage.setItem('pending_booking_id', id);
    window.location.href = '../billing/billing.html';
};