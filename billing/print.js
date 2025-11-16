// print.js (সম্পূর্ণ এবং চূড়ান্ত কোড - দোকানের বিস্তারিত তথ্যসহ)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

async function loadAndPrintBill() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            document.body.innerHTML = '<h1>Authentication Error: Please log in to view the bill.</h1>';
            return;
        }

        const userId = user.uid;
        
        // URL থেকে saleId নেওয়া হচ্ছে
        const urlParams = new URLSearchParams(window.location.search);
        const saleId = urlParams.get('saleId');

        if (!saleId) {
            document.body.innerHTML = '<h1>Error: Bill ID not found in the URL.</h1>';
            return;
        }

        try {
            // দোকানের তথ্য এবং বিলের তথ্য একসাথে আনা হচ্ছে
            const [saleDocSnap, shopDocSnap] = await Promise.all([
                getDoc(doc(db, 'shops', userId, 'sales', saleId)),
                getDoc(doc(db, 'shops', userId)) // দোকানের তথ্য মূল ডকুমেন্ট থেকে আনা হচ্ছে
            ]);

            // =======================================================
            // ===== START: দোকানের বিস্তারিত তথ্য দেখানোর কোড =====
            // =======================================================
            const shopHeaderContainer = document.getElementById('shop-details-container'); // HTML-এ এই আইডি ব্যবহার করুন
            
            // print.html এ ডিফল্ট কন্টেন্ট মুছে ফেলা হচ্ছে
            if (shopHeaderContainer) {
                 shopHeaderContainer.innerHTML = '';
            }

            if (shopDocSnap.exists()) {
                const shopData = shopDocSnap.data();
                const shopHtml = `
                    <h1 class="shop-name">${shopData.shopName || 'Your Shop Name'}</h1>
                    <p class="shop-address">${shopData.shopAddress || 'Shop Address Not Set'}</p>
                    <p class="shop-contact">
                        ${shopData.shopPhone ? `Phone: ${shopData.shopPhone}` : ''}
                        ${shopData.email ? ` | Email: ${shopData.email}` : ''}
                    </p>
                    ${shopData.shopGstin ? `<p class="shop-gstin">GSTIN: ${shopData.shopGstin}</p>` : ''}
                `;
                if(shopHeaderContainer) {
                    shopHeaderContainer.innerHTML = shopHtml;
                }
            } else {
                 if(shopHeaderContainer) {
                    shopHeaderContainer.innerHTML = '<p>Shop details not found.</p>';
                 }
            }
            // =======================================================
            // ===== END: দোকানের বিস্তারিত তথ্য দেখানোর কোড =====
            // =======================================================

            if (!saleDocSnap.exists()) {
                document.body.innerHTML = `<h1>Error: Bill with ID (${saleId}) not found.</h1>`;
                return;
            }
            
            const saleData = saleDocSnap.data();

            // বিলের সাধারণ তথ্য
            document.getElementById('bill-no').textContent = saleId.substring(0, 8).toUpperCase();
            document.getElementById('bill-date').textContent = saleData.createdAt.toDate().toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            // কাস্টমারের তথ্য
            const customerContainer = document.getElementById('customer-details-container');
            const { name, phone, address } = saleData.customerDetails || {};
            if (name && name.toLowerCase() !== 'walk-in customer') {
                customerContainer.style.display = 'block';
                document.getElementById('customer-name').textContent = name;
                if (phone) {
                    document.getElementById('customer-phone-p').style.display = 'block';
                    document.getElementById('customer-phone').textContent = phone;
                }
                if (address) {
                    document.getElementById('customer-address-p').style.display = 'block';
                    document.getElementById('customer-address').textContent = address;
                }
            }

            // আইটেমের তালিকা
            const itemsTbody = document.getElementById('receipt-items');
            itemsTbody.innerHTML = '';
            saleData.items.forEach(item => {
                const row = itemsTbody.insertRow();
                row.innerHTML = `
                    <td>${item.name}</td>
                    <td class="center">${item.quantity}</td>
                    <td class="right">${(item.price || 0).toFixed(2)}</td>
                    <td class="right">${(item.quantity * (item.price || 0)).toFixed(2)}</td>
                `;
            });

            // মোট হিসাব
            document.getElementById('receipt-subtotal').textContent = `₹${(saleData.subtotal || 0).toFixed(2)}`;
            
            if (saleData.discount > 0) {
                document.getElementById('discount-line').style.display = 'flex';
                document.getElementById('receipt-discount').textContent = `- ₹${(saleData.discount || 0).toFixed(2)}`;
            }

            if (saleData.tax > 0) {
                document.getElementById('gst-line').style.display = 'flex';
                document.getElementById('gst-rate').textContent = saleData.gstRate || 5;
                document.getElementById('receipt-tax').textContent = `₹${(saleData.tax || 0).toFixed(2)}`;
            }

            document.getElementById('receipt-total').textContent = `₹${(saleData.total || 0).toFixed(2)}`;

            // পেমেন্টের বিস্তারিত তথ্য
            const paymentMethodText = saleData.paymentMethod.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
            document.getElementById('payment-method').textContent = paymentMethodText;

            const paymentBreakdown = saleData.paymentBreakdown;
            if (paymentBreakdown) {
                // ===========================================
// === নতুন এবং সংশোধিত কোড (Hide Cash Info) ===
// ===========================================
if (saleData.paymentMethod === 'cash') {
    // নিচের লাইনগুলো কমেন্ট আউট করে দেওয়া হয়েছে যাতে এই অংশটি আর না দেখায়
    // document.getElementById('cash-payment-info').style.display = 'block';
    // document.getElementById('cash-received').textContent = `₹${(paymentBreakdown.cashReceived || 0).toFixed(2)}`;
    // document.getElementById('change-returned').textContent = `₹${(paymentBreakdown.changeReturned || 0).toFixed(2)}`;
} else if (saleData.paymentMethod === 'part-payment') {
                    document.getElementById('part-payment-info').style.display = 'block';
                    document.getElementById('cash-paid').textContent = `₹${(paymentBreakdown.cash || 0).toFixed(2)}`;
                    document.getElementById('card-paid').textContent = `₹${(paymentBreakdown.card_or_online || 0).toFixed(2)}`;
                }
            }

            // সবকিছু লোড হওয়ার পর প্রিন্ট ডায়ালগ ওপেন করা
            setTimeout(() => window.print(), 500);

        } catch (error) {
            console.error("Error fetching bill details: ", error);
            document.body.innerHTML = `<h1>Failed to load bill details. Please check the console. Error: ${error.message}</h1>`;
        }
    });
}

window.addEventListener('DOMContentLoaded', loadAndPrintBill);