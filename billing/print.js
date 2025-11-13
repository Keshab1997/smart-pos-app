// print.js (Firebase v10)

// Firebase মডিউল ইম্পোর্ট করুন
import { db, doc, getDoc } from '../js/firebase-config.js';

// ফাংশন: বিলের তথ্য লোড এবং প্রিন্ট করার জন্য
async function loadAndPrintBill() {
    // ১. URL থেকে saleId বের করা
    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('saleId');

    if (!saleId) {
        document.body.innerHTML = '<h1>Error: Sale ID not found in URL.</h1>';
        console.error("Sale ID is missing from the URL.");
        return;
    }

    try {
        // ২. দোকানের তথ্য লোড করা (shop-details.html)
        const shopDetailsContainer = document.getElementById('shop-details-container');
        try {
            const response = await fetch('../shop-details.html');
            if (response.ok) {
                shopDetailsContainer.innerHTML = await response.text();
            } else {
                shopDetailsContainer.innerHTML = '<p>Shop details could not be loaded.</p>';
            }
        } catch (err) {
            console.error('Error fetching shop details:', err);
            shopDetailsContainer.innerHTML = '<p>Error loading shop details.</p>';
        }

        // ৩. Firebase থেকে বিলের তথ্য আনা
        const saleDocRef = doc(db, 'sales', saleId);
        const saleDocSnap = await getDoc(saleDocRef);

        if (saleDocSnap.exists()) {
            const saleData = saleDocSnap.data();

            // ৪. HTML এলিমেন্টে তথ্য বসানো
            document.getElementById('bill-no').textContent = saleId.substring(0, 8).toUpperCase();
            document.getElementById('bill-date').textContent = saleData.createdAt.toDate().toLocaleString();

            const itemsTbody = document.getElementById('receipt-items');
            itemsTbody.innerHTML = ''; // টেবিল খালি করা
            saleData.items.forEach(item => {
                const row = itemsTbody.insertRow();
                row.innerHTML = `
                    <td>${item.name}</td>
                    <td>${item.quantity}</td>
                    <td>${item.price.toFixed(2)}</td>
                    <td>${(item.quantity * item.price).toFixed(2)}</td>
                `;
            });

            document.getElementById('receipt-subtotal').textContent = `₹${saleData.subtotal.toFixed(2)}`;
            
            const gstLine = document.getElementById('gst-line');
            if (saleData.gstApplied && saleData.tax > 0) {
                gstLine.style.display = 'block';
                document.getElementById('receipt-tax').textContent = `₹${saleData.tax.toFixed(2)}`;
            } else {
                gstLine.style.display = 'none';
            }
            
            document.getElementById('receipt-total').textContent = `₹${saleData.total.toFixed(2)}`;
            document.getElementById('payment-method').textContent = saleData.paymentMethod;

            // ৫. সব তথ্য রেন্ডার হওয়ার পর প্রিন্ট ডায়ালগ ওপেন করা
            // setTimeout ব্যবহার করা হয় যাতে DOM আপডেট হওয়ার জন্য যথেষ্ট সময় পায়
            setTimeout(() => {
                window.print();
            }, 500); // ০.৫ সেকেন্ড অপেক্ষা

        } else {
            document.body.innerHTML = `<h1>Error: Bill with ID (${saleId}) not found.</h1>`;
            console.error(`Document with ID ${saleId} does not exist.`);
        }
    } catch (error) {
        console.error("Error fetching and printing bill details: ", error);
        document.body.innerHTML = '<h1>Failed to load bill details. See console for more information.</h1>';
    }
}

// পেজ লোড হয়ে গেলে ফাংশনটি কল করা
window.addEventListener('DOMContentLoaded', loadAndPrintBill);