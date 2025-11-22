import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    
    // URL থেকে বুকিং আইডি নেওয়া
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('id');

    if (!bookingId) {
        document.body.innerHTML = '<h3>Error: No Booking ID found!</h3>';
        return;
    }

    try {
        const userId = user.uid;
        
        // ১. দোকানের তথ্য আনা
        const shopDoc = await getDoc(doc(db, 'shops', userId));
        if (shopDoc.exists()) {
            const s = shopDoc.data();
            const header = document.getElementById('shop-details-container');
            header.innerHTML = `
                <h1 class="shop-name">${s.shopName || 'Shop Name'}</h1>
                <p class="shop-address">${s.shopAddress || ''}</p>
                <p class="shop-contact">${s.shopPhone || ''}</p>
            `;
        }

        // ২. বুকিং তথ্য আনা
        const bookingDoc = await getDoc(doc(db, 'shops', userId, 'bookings', bookingId));
        
        if (bookingDoc.exists()) {
            const data = bookingDoc.data();

            // স্লিপ ফিল-আপ করা
            document.getElementById('booking-no').textContent = bookingId.substring(0, 6).toUpperCase();
            document.getElementById('booking-date').textContent = data.createdAt ? data.createdAt.toDate().toLocaleDateString('en-IN') : new Date().toLocaleDateString();
            
            document.getElementById('c-name').textContent = data.customerName;
            document.getElementById('c-phone').textContent = data.phone;
            document.getElementById('item-desc').textContent = data.description;

            document.getElementById('est-total').textContent = `₹${(data.estimatedTotal || 0).toFixed(2)}`;
            document.getElementById('adv-paid').textContent = `₹${(data.advancePaid || 0).toFixed(2)}`;
            
            const due = (data.estimatedTotal || 0) - (data.advancePaid || 0);
            document.getElementById('balance-due').textContent = `₹${due.toFixed(2)}`;

            // তারিখ ফরম্যাট করা
            const dDate = new Date(data.deliveryDate);
            document.getElementById('del-date').textContent = dDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

            // অটোমেটিক প্রিন্ট কমান্ড
            setTimeout(() => {
                window.print();
            }, 800);
        } else {
            document.body.innerHTML = '<h3>Error: Booking not found!</h3>';
        }

    } catch (error) {
        console.error("Error:", error);
        alert("Error loading booking slip.");
    }
});