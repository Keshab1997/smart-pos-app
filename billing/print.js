// print.js - Updated with Robust Shortener (AllOrigins Proxy + is.gd)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

async function loadAndPrintBill() {
    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('saleId');
    const urlUid = urlParams.get('uid'); 

    if (!saleId) {
        document.body.innerHTML = '<h1>Error: Bill ID not found in the URL.</h1>';
        return;
    }

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
            // === প্রিন্ট এবং Short Link (is.gd + AllOrigins Proxy) ===
            // ============================================================
            
            if (!isPublicView) {
                window.onafterprint = async function() { 
                    if (waCustomerPhone) {
                        let sendWA = confirm("Print complete. Send Bill on WhatsApp?");
                        
                        if (sendWA) {
                            const currentUrl = window.location.href.split('?')[0];
                            const longUrl = `${currentUrl}?saleId=${saleId}&uid=${userId}`;
                            
                            let shortLink = longUrl; // ডিফল্ট (যদি শর্টনার কাজ না করে)
                            
                            try {
                                document.title = "Creating Link..."; // ইউজারকে বোঝানো হচ্ছে কাজ চলছে
                                
                                // === NEW PROXY METHOD (AllOrigins) ===
                                // is.gd সরাসরি কাজ করে না, তাই আমরা AllOrigins দিয়ে রিকোয়েস্ট পাঠাচ্ছি
                                const isGdUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`;
                                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(isGdUrl)}`;
                                
                                const response = await fetch(proxyUrl);
                                
                                if (response.ok) {
                                    const text = await response.text();
                                    // চেক করা হচ্ছে লিংকটা ভ্যালিড কিনা
                                    if(text.startsWith('http')) {
                                        shortLink = text.trim(); // সফলভাবে শর্ট লিংক পাওয়া গেছে
                                    }
                                }
                            } catch (err) {
                                console.error("Shortener failed:", err);
                                // ফেইল করলে লং লিংক যাবে, কিছু করার নেই
                            }
                            
                            document.title = "Bill Receipt"; 

                            let message = `*INVOICE from ${waShopName}*\n`;
                            message += `Bill No: ${waBillNo}\n`;
                            message += `Amount: ₹${waGrandTotal}\n\n`;
                            message += `View Bill: ${shortLink}\n\n`; 
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

                setTimeout(() => window.print(), 800);
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