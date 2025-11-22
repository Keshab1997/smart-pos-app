import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, query, where, orderBy, onSnapshot, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

let currentUserId = null;

// --- অথেন্টিকেশন চেক ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        loadBookings();
    } else {
        window.location.href = '../index.html';
    }
});

// --- বুকিং সেভ করা এবং প্রিন্ট করা ---
document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserId) return;

    // বাটন ডিজেবল করা (যাতে ডবল ক্লিক না হয়)
    const saveBtn = document.querySelector('.save-btn');
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const data = {
        customerName: document.getElementById('b-name').value,
        phone: document.getElementById('b-phone').value,
        description: document.getElementById('b-desc').value,
        estimatedTotal: parseFloat(document.getElementById('b-total').value) || 0,
        advancePaid: parseFloat(document.getElementById('b-advance').value) || 0,
        deliveryDate: document.getElementById('b-date').value,
        status: 'Pending', // Status flow: Pending -> Ready -> Billed
        createdAt: serverTimestamp()
    };

    try {
        // ১. ডেটাবেসে সেভ করা
        const docRef = await addDoc(collection(db, 'shops', currentUserId, 'bookings'), data);
        
        // ২. ফর্ম খালি করা
        e.target.reset();

        // ৩. প্রিন্ট স্লিপ ওপেন করা (নতুন উইন্ডোতে)
        window.open(`booking-print.html?id=${docRef.id}`, '_blank');

    } catch (error) {
        console.error("Error:", error);
        alert("Failed to save booking. Please check console.");
    } finally {
        // বাটন আবার সচল করা
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
    }
});

// --- বুকিং লিস্ট লোড করা ---
function loadBookings() {
    const q = query(collection(db, 'shops', currentUserId, 'bookings'), orderBy('createdAt', 'desc'));
    
    onSnapshot(q, (snapshot) => {
        const tbody = document.getElementById('booking-table-body');
        tbody.innerHTML = '';
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No active bookings found.</td></tr>';
            return;
        }

        snapshot.forEach(docSnap => {
            const book = docSnap.data();
            // যদি "Billed" হয়ে যায় (অর্থাৎ ডেলিভারি শেষ), তাহলে আর লিস্টে দেখানোর দরকার নেই
            if (book.status === 'Billed') return; 

            const row = document.createElement('tr');
            
            // স্ট্যাটাস অনুযায়ী ক্লাসের রং ঠিক করা
            const statusClass = book.status === 'Ready' ? 'status-ready' : 'status-pending';
            
            // অ্যাকশন বাটন লজিক
            let actionButtons = '';
            
            // ১. প্রিন্ট বাটন (সব সময় থাকবে)
            actionButtons += `<button class="action-btn btn-print" onclick="printSlip('${docSnap.id}')" style="background:#6c757d; color:white;">Print</button> `;

            // ২. স্ট্যাটাস বাটন (Pending হলে Ready অপশন, Ready হলে Bill অপশন)
            if (book.status === 'Pending') {
                actionButtons += `<button class="action-btn btn-ready" onclick="updateStatus('${docSnap.id}', 'Ready')">Mark Ready</button>`;
            } else if (book.status === 'Ready') {
                actionButtons += `<button class="action-btn btn-bill" onclick="finalizeToBill('${docSnap.id}')">Final Bill</button>`;
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
    });
}

// --- প্রিন্ট ফাংশন (লিস্টের বাটন থেকে কল করার জন্য) ---
window.printSlip = (id) => {
    window.open(`booking-print.html?id=${id}`, '_blank');
};

// --- স্ট্যাটাস আপডেট (Pending -> Ready) ---
window.updateStatus = async (id, status) => {
    if(confirm("Is the product ready for delivery?")) {
        try {
            await updateDoc(doc(db, 'shops', currentUserId, 'bookings', id), { status: status });
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Failed to update status.");
        }
    }
};

// --- বিলিং পেজে ডেটা পাঠানো (Booking -> Billing) ---
window.finalizeToBill = async (id) => {
    // আমরা এই আইডিটা sessionStorage এ রেখে billing পেজে পাঠাবো
    sessionStorage.setItem('pending_booking_id', id);
    window.location.href = '../billing/billing.html';
};