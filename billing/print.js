// print.js - Super Fast Link Generation (Background Process)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// গ্লোবাল ভেরিয়েবল যাতে লিংক আগে থেকেই রেডি থাকে
let readyShortLink = null;

async function loadAndPrintBill() {
    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('saleId');
    const urlUid = urlParams.get('uid'); 

    if (!saleId) {
        document.body.innerHTML = '<h1>Error: Bill ID not found in the URL.</h1>';
        return;
    }

    // --- লিংক জেনারেটর ফাংশন (আলাদা করা হয়েছে) ---
    const startLinkGeneration = async (longUrl) => {
        try {
            console.log("Starting background link generation...");
            // is.gd (Via AllOrigins Proxy)
            const isGdUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`;
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(isGdUrl)}`;
            
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const text = await response.text();
                if(text.startsWith('http')) {
                    readyShortLink = text.trim();
                    console.log("Short link ready:", readyShortLink);
                    return;
                }
            }
        } catch (err) {
            console.error("Primary shortener failed, trying backup...");
        }

        // যদি প্রথমটা ফেইল করে, তাহলে অরিজিনাল লিংকটাই রেখে দেবে
        readyShortLink = longUrl;
    };


    const fetchAndRenderBill = async (userId, isPublicView) => {
        try {
            // ১. ডাটা নিয়ে আসা
            const [saleDocSnap, shopDocSnap] = await Promise.all([
                getDoc(doc(db, 'shops', userId, 'sales', saleId)),
                getDoc(doc(db, 'shops', userId))
            ]);

            if (!saleDocSnap.exists()) {
                document.body.innerHTML = `<h1>Error: Bill not found or Link Expired.</h1>`;
                return;
            }

            // ২. ডাটা পাওয়ার সাথে সাথেই লিংক তৈরি শুরু করে দেব (প্রিন্টের জন্য অপেক্ষা করব না)
            if (!isPublicView) {
                const currentUrl = window.location.href.split('?')[0];
                const longUrl = `${currentUrl}?saleId=${saleId}&uid=${userId}`;
                // ব্যাকগ্রাউন্ডে লিংক জেনারেট শুরু:
                startLinkGeneration(longUrl);
            }

            const saleData = saleDocSnap.data();

            // === WhatsApp ভেরিয়েবল ===
            let waCustomerPhone = '';
            let waShopName = 'Shop';
            let waBillNo = saleData.billNo ? saleData.billNo : saleId.substring(0, 8).toUpperCase();

            let waSubtotal = (saleData.subtotal || 0).toFixed(2);
            let waDiscount = (saleData.discount || 0).toFixed(2);
            let waTax = (saleData.tax || 0).toFixed(2);
            let waGrandTotal = (saleData.total || 0).toFixed(2);
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

            if (saleData.createdAt) {
                waDate = saleData.createdAt.toDate ? saleData.createdAt.toDate().toLocaleString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : new Date(saleData.createdAt).toLocaleString();
            }

            // HTML আপডেট
            document.getElementById('bill-no').textContent = waBillNo;
            document.getElementById('bill-date').textContent = waDate;

            // কাস্টমার তথ্য
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

            // আইটেম লিস্ট
            const itemsTbody = document.getElementById('receipt-items');
            itemsTbody.innerHTML = '';
            if(saleData.items && Array.isArray(saleData.items)) {
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
            }

            // টোটাল
            document.getElementById('receipt-subtotal').textContent = `₹${waSubtotal}`;
            
            if (saleData.discount > 0) {
                document.getElementById('discount-line').style.display = 'flex';
                document.getElementById('receipt-discount').textContent = `- ₹${waDiscount}`;
            } else {
                document.getElementById('discount-line').style.display = 'none';
            }

            if (saleData.tax > 0) {
                document.getElementById('gst-line').style.display = 'flex';
                document.getElementById('gst-rate').textContent = saleData.gstRate || 5;
                document.getElementById('receipt-tax').textContent = `₹${waTax}`;
            } else {
                document.getElementById('gst-line').style.display = 'none';
            }

            const advanceRow = document.getElementById('advance-row');
            if (saleData.advanceAdjusted > 0) {
                if(advanceRow) {
                    advanceRow.style.display = 'flex';
                    const advanceAmountEl = document.getElementById('advance-amount');
                    if(advanceAmountEl) advanceAmountEl.textContent = `- ₹${(saleData.advanceAdjusted).toFixed(2)}`;
                }
            } else {
                if(advanceRow) advanceRow.style.display = 'none';
            }

            document.getElementById('receipt-total').textContent = `₹${(saleData.finalPaidAmount || saleData.total).toFixed(2)}`;

            const paymentMethodText = saleData.paymentMethod ? saleData.paymentMethod.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Cash';
            document.getElementById('payment-method').textContent = paymentMethodText;

            const paymentBreakdown = saleData.paymentBreakdown;
            if (paymentBreakdown && saleData.paymentMethod === 'part-payment') {
                document.getElementById('part-payment-info').style.display = 'block';
                document.getElementById('cash-paid').textContent = `₹${(paymentBreakdown.cash || 0).toFixed(2)}`;
                document.getElementById('card-paid').textContent = `₹${(paymentBreakdown.card_or_online || 0).toFixed(2)}`;
            }

            // ============================================================
            // === ফাস্ট শেয়ারিং লজিক ===
            // ============================================================
            
            if (!isPublicView) {
                window.onafterprint = async function() { 
                    if (waCustomerPhone) {
                        // ১. কনফার্মেশন চাইলাম
                        let sendWA = confirm("Print complete. Send Bill on WhatsApp?");
                        
                        if (sendWA) {
                            // ২. লিংক রেডি আছে কিনা চেক করি
                            // যদি কোনো কারণে লিংক জেনারেট হতে দেরি হয়, আমরা অরিজিনাল লিংক ব্যবহার করব
                            // কিন্তু পেজ লোড হওয়ার ১-১.৫ সেকেন্ডের মধ্যে ছোট লিংক হয়ে যাওয়ার কথা
                            const currentUrl = window.location.href.split('?')[0];
                            const longUrl = `${currentUrl}?saleId=${saleId}&uid=${userId}`;
                            
                            // যদি readyShortLink তৈরি হয়ে থাকে, সেটা ব্যবহার করব। নাহলে লং লিংক।
                            const finalLink = readyShortLink ? readyShortLink : longUrl;

                            let message = `*INVOICE from ${waShopName}*\n`;
                            message += `Bill No: ${waBillNo}\n`;
                            message += `Amount: ₹${waGrandTotal}\n\n`;
                            message += `View Bill: ${finalLink}\n\n`; 
                            message += `Thank you!`;

                            let cleanPhone = waCustomerPhone.replace(/[^0-9]/g, ''); 
                            if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

                            let url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
                            window.location.href = url; 
                            
                        } else {
                            window.close();
                        }
                    } else {
                        window.close();
                    }
                };

                // প্রিন্ট একটু দেরিতে দিচ্ছি (1.2 সেকেন্ড) যাতে লিংকটা তৈরি হওয়ার সময় পায়
                // কাস্টমার এটা টের পাবে না কারণ পেজ লোড হতেও একটু সময় লাগে।
                setTimeout(() => window.print(), 1200);
            }

        } catch (error) {
            console.error("Error fetching bill details: ", error);
            document.body.innerHTML = `<h1>Failed to load bill details.</h1>`;
        }
    };

    if (urlUid) {
        fetchAndRenderBill(urlUid, true); 
    } 
    else {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                fetchAndRenderBill(user.uid, false); 
            } else {
                document.body.innerHTML = '<h1>Authentication Error: Please log in to view the bill.</h1>';
            }
        });
    }
}

window.addEventListener('DOMContentLoaded', loadAndPrintBill);