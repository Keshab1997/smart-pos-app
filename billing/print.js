import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

async function loadAndPrintBill() {
    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('saleId');
    const urlUid = urlParams.get('uid'); // কাস্টমার লিংকের জন্য UID চেক

    if (!saleId) {
        document.body.innerHTML = '<h1>Error: Bill ID not found in the URL.</h1>';
        return;
    }

    // ফাংশন: বিল ডাটা নিয়ে আসা এবং দেখানো
    const fetchAndRenderBill = async (userId, isPublicView) => {
        try {
            const [saleDocSnap, shopDocSnap] = await Promise.all([
                getDoc(doc(db, 'shops', userId, 'sales', saleId)),
                getDoc(doc(db, 'shops', userId))
            ]);

            if (!saleDocSnap.exists()) {
                document.body.innerHTML = `<h1>Error: Bill not found or Link Expired.</h1>`;
                return;
            }

            // === WhatsApp ভেরিয়েবল ===
            let waCustomerPhone = '';
            let waShopName = 'Shop';
            let waBillNo = saleId.substring(0, 8).toUpperCase();
            let waSubtotal = '0.00';
            let waDiscount = '0.00';
            let waTax = '0.00';
            let waGrandTotal = '0.00';
            let waDate = '';

            // === দোকানের তথ্য ===
            const shopHeaderContainer = document.getElementById('shop-details-container');
            if (shopHeaderContainer) shopHeaderContainer.innerHTML = '';

            if (shopDocSnap.exists()) {
                const shopData = shopDocSnap.data();
                waShopName = shopData.shopName || 'Shop';

                const shopHtml = `
                    <h1 class="shop-name">${shopData.shopName || 'Your Shop Name'}</h1>
                    <p class="shop-address">${shopData.shopAddress || 'Shop Address Not Set'}</p>
                    <p class="shop-contact">
                        ${shopData.shopPhone ? `Phone: ${shopData.shopPhone}` : ''}
                        ${shopData.email ? ` | Email: ${shopData.email}` : ''}
                    </p>
                    ${shopData.shopGstin ? `<p class="shop-gstin">GSTIN: ${shopData.shopGstin}</p>` : ''}
                `;
                if (shopHeaderContainer) shopHeaderContainer.innerHTML = shopHtml;
            }

            const saleData = saleDocSnap.data();

            waSubtotal = (saleData.subtotal || 0).toFixed(2);
            waDiscount = (saleData.discount || 0).toFixed(2);
            waTax = (saleData.tax || 0).toFixed(2);
            waGrandTotal = (saleData.total || 0).toFixed(2);
            waDate = saleData.createdAt.toDate().toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            // === বিলের তথ্য HTML এ বসানো ===
            document.getElementById('bill-no').textContent = waBillNo;
            document.getElementById('bill-date').textContent = waDate;

            // === কাস্টমার তথ্য ===
            const customerContainer = document.getElementById('customer-details-container');
            const { name, phone, address } = saleData.customerDetails || {};

            if (name && name.toLowerCase() !== 'walk-in customer') {
                customerContainer.style.display = 'block';
                document.getElementById('customer-name').textContent = name;
                if (phone) {
                    waCustomerPhone = phone;
                    document.getElementById('customer-phone-p').style.display = 'block';
                    document.getElementById('customer-phone').textContent = phone;
                }
                if (address) {
                    document.getElementById('customer-address-p').style.display = 'block';
                    document.getElementById('customer-address').textContent = address;
                }
            }

            // === আইটেম লিস্ট ===
            const itemsTbody = document.getElementById('receipt-items');
            itemsTbody.innerHTML = '';

            saleData.items.forEach((item) => {
                const itemTotal = (item.quantity * (item.price || 0));
                const row = itemsTbody.insertRow();
                row.innerHTML = `
                    <td>${item.name}</td>
                    <td class="center">${item.quantity}</td>
                    <td class="right">${(item.price || 0).toFixed(2)}</td>
                    <td class="right">${itemTotal.toFixed(2)}</td>
                `;
            });

            // === টোটাল এবং অন্যান্য হিসাব ===
            document.getElementById('receipt-subtotal').textContent = `₹${waSubtotal}`;
            if (saleData.discount > 0) {
                document.getElementById('discount-line').style.display = 'flex';
                document.getElementById('receipt-discount').textContent = `- ₹${waDiscount}`;
            }
            if (saleData.tax > 0) {
                document.getElementById('gst-line').style.display = 'flex';
                document.getElementById('gst-rate').textContent = saleData.gstRate || 5;
                document.getElementById('receipt-tax').textContent = `₹${waTax}`;
            }
            document.getElementById('receipt-total').textContent = `₹${waGrandTotal}`;

            // === পেমেন্ট মেথড ===
            const paymentMethodText = saleData.paymentMethod.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
            document.getElementById('payment-method').textContent = paymentMethodText;

            const paymentBreakdown = saleData.paymentBreakdown;
            if (paymentBreakdown && saleData.paymentMethod === 'part-payment') {
                document.getElementById('part-payment-info').style.display = 'block';
                document.getElementById('cash-paid').textContent = `₹${(paymentBreakdown.cash || 0).toFixed(2)}`;
                document.getElementById('card-paid').textContent = `₹${(paymentBreakdown.card_or_online || 0).toFixed(2)}`;
            }

                        // ============================================================
            // === শুধুমাত্র মালিক প্রিন্ট বা শেয়ার করতে পারবে ===
            // ============================================================
            
            if (!isPublicView) {
                window.onafterprint = async function() { // এখানে async যোগ করা হয়েছে
                    if (waCustomerPhone) {
                        let sendWA = confirm("Print complete. Do you want to send the BILL LINK on WhatsApp?");
                        
                        if (sendWA) {
                            // ১. অরিজিনাল বড় লিংক তৈরি
                            const currentUrl = window.location.href.split('?')[0];
                            const longUrl = `${currentUrl}?saleId=${saleId}&uid=${userId}`;

                            // ২. লিংক ছোট করার ফাংশন (TinyURL)
                            let shortLink = longUrl; // ডিফল্ট হিসেবে বড় লিংকই থাকবে যদি API ফেইল করে
                            
                            try {
                                // লোডিং মেসেজ (অপশনাল, কনসোলে দেখার জন্য)
                                document.title = "Generating Short Link...";
                                
                                const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
                                if (response.ok) {
                                    shortLink = await response.text(); // ছোট লিংক পাওয়া গেল
                                }
                            } catch (err) {
                                console.error("Error shortening URL:", err);
                                // এরর হলে অরিজিনাল বড় লিংকটাই যাবে
                            }
                            
                            document.title = "Bill Receipt"; // টাইটেল আগের অবস্থায়

                            // ৩. মেসেজ তৈরি
                            let message = `*INVOICE from ${waShopName}*\n`;
                            message += `Bill No: ${waBillNo}\n`;
                            message += `Amount: ₹${waGrandTotal}\n\n`;
                            message += `View Bill: ${shortLink}\n\n`; // এখানে ছোট লিংক বসবে
                            message += `Thank you!`;

                            // ৪. ফোন নাম্বার প্রসেসিং
                            let cleanPhone = waCustomerPhone.replace(/[^0-9]/g, ''); 
                            if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

                            // ৫. WhatsApp এ পাঠানো
                            let url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
                            window.location.href = url; 
                            
                        } else {
                            window.close();
                        }
                    } else {
                        window.close();
                    }
                };

                // অটোমেটিক প্রিন্ট
                setTimeout(() => window.print(), 800);
            }

        } catch (error) {
            console.error("Error fetching bill details: ", error);
            document.body.innerHTML = `<h1>Failed to load bill details.</h1>`;
        }
    };

    // === মেইন লজিক: পাবলিক ভিউ না মালিক ভিউ ===
    
    // ১. যদি URL এ 'uid' থাকে, তার মানে এটি কাস্টমার লিংক (লগইন চেক দরকার নেই)
    if (urlUid) {
        fetchAndRenderBill(urlUid, true); // true = isPublicView
    } 
    // ২. যদি 'uid' না থাকে, তার মানে মালিক ড্যাশবোর্ড থেকে খুলেছে (লগইন চেক দরকার)
    else {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                fetchAndRenderBill(user.uid, false); // false = isOwnerView
            } else {
                document.body.innerHTML = '<h1>Authentication Error: Please log in to view the bill.</h1>';
            }
        });
    }
}

window.addEventListener('DOMContentLoaded', loadAndPrintBill);