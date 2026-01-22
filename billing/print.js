// print.js - Secure Customer View (v7.2)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

let readyShortLink = null;

async function loadAndPrintBill() {
    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('saleId');
    const urlUid = urlParams.get('uid'); // কাস্টমার লিঙ্কে এই UID থাকে

    if (!saleId) {
        document.body.innerHTML = '<h1>Error: Bill ID not found.</h1>';
        return;
    }

    // --- ১. সিকিউরিটি চেক: কাস্টমার ভিউ হলে মেনু হাইড করো ---
    if (urlUid) {
        document.body.classList.add('is-customer-view');
        const navPlaceholder = document.getElementById('navbar-placeholder');
        if (navPlaceholder) navPlaceholder.remove(); // মেনু পুরোপুরি ডিলিট করে দাও
    }

    // শর্ট লিঙ্ক জেনারেশন (ব্যাকগ্রাউন্ডে)
    const startLinkGeneration = async (longUrl) => {
        try {
            const isGdUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`;
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(isGdUrl)}`;
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const text = await response.text();
                if(text.startsWith('http')) {
                    readyShortLink = text.trim();
                    return;
                }
            }
        } catch (err) { console.error("Shortener failed"); }
        readyShortLink = longUrl;
    };

    const fetchAndRenderBill = async (userId, isPublicView) => {
        try {
            const [saleDocSnap, shopDocSnap] = await Promise.all([
                getDoc(doc(db, 'shops', userId, 'sales', saleId)),
                getDoc(doc(db, 'shops', userId))
            ]);

            if (!saleDocSnap.exists()) {
                document.body.innerHTML = `<h1>Error: Bill not found or expired.</h1>`;
                return;
            }

            if (!isPublicView) {
                const currentUrl = window.location.origin + window.location.pathname;
                const longUrl = `${currentUrl}?saleId=${saleId}&uid=${userId}`;
                startLinkGeneration(longUrl);
            }

            const saleData = saleDocSnap.data();
            let waCustomerPhone = saleData.customerDetails?.phone || '';
            let waShopName = 'Shop';
            let waBillNo = saleData.billNo || saleId.substring(0, 8).toUpperCase();
            let waGrandTotal = (saleData.total || 0).toFixed(2);

            // শপ ডিটেইলস
            if (shopDocSnap.exists()) {
                const shopData = shopDocSnap.data();
                waShopName = shopData.shopName;
                document.getElementById('shop-details-container').innerHTML = `
                    <h1 class="shop-name">${shopData.shopName}</h1>
                    <p class="shop-address">${shopData.shopAddress || ''}</p>
                    <p class="shop-contact">Phone: ${shopData.shopPhone || ''} | Email: ${shopData.email || ''}</p>
                `;
            }

            // বিল তথ্য
            document.getElementById('bill-no').textContent = waBillNo;
            document.getElementById('bill-date').textContent = saleData.createdAt?.toDate().toLocaleString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            // কাস্টমার তথ্য
            if (saleData.customerDetails?.name && saleData.customerDetails.name.toLowerCase() !== 'walk-in customer') {
                document.getElementById('customer-details-container').style.display = 'block';
                document.getElementById('customer-name').textContent = saleData.customerDetails.name;
                if (waCustomerPhone) {
                    document.getElementById('customer-phone-p').style.display = 'block';
                    document.getElementById('customer-phone').textContent = waCustomerPhone;
                }
            }

            // আইটেম লিস্ট
            const itemsTbody = document.getElementById('receipt-items');
            saleData.items.forEach(item => {
                // ম্যাজিক লাইন: যেখানেই '+' পাবে, তার পরে একটা স্পেস যোগ করবে
                // ফলে 'Punjabi+Dhuti' হয়ে যাবে 'Punjabi+ Dhuti' (যা সুন্দরভাবে র্যাপ হবে)
                let formattedName = item.name.replace(/\+/g, '+ ');
                
                const row = itemsTbody.insertRow();
                row.innerHTML = `
                    <td>${formattedName}</td>
                    <td class="center">${item.quantity}</td>
                    <td class="right">${item.price.toFixed(2)}</td>
                    <td class="right">${(item.quantity * item.price).toFixed(2)}</td>
                `;
            });

            document.getElementById('receipt-subtotal').textContent = `₹${saleData.subtotal.toFixed(2)}`;
            
            // জিএসটি ডাটা রেন্ডার
            if (saleData.gstData && saleData.gstData.rate > 0) {
                document.getElementById('gst-details-area').style.display = 'block';
                const halfRate = (saleData.gstData.rate / 2).toFixed(1);
                document.getElementById('cgst-rate-print').textContent = halfRate;
                document.getElementById('sgst-rate-print').textContent = halfRate;
                document.getElementById('receipt-cgst').textContent = `₹${saleData.gstData.cgst.toFixed(2)}`;
                document.getElementById('receipt-sgst').textContent = `₹${saleData.gstData.sgst.toFixed(2)}`;
            } else {
                document.getElementById('gst-details-area').style.display = 'none';
            }

            // ডিসকাউন্ট
            if (saleData.discount > 0) {
                document.getElementById('discount-line').style.display = 'flex';
                document.getElementById('receipt-discount').textContent = `- ₹${saleData.discount.toFixed(2)}`;
            }

            document.getElementById('receipt-total').textContent = `₹${(saleData.finalPaidAmount || saleData.total).toFixed(2)}`;
            document.getElementById('payment-method').textContent = saleData.paymentMethod.toUpperCase();

            // মালিকের জন্য প্রিন্ট এবং শেয়ারিং অপশন
            if (!isPublicView) {
                window.onafterprint = function() { 
                    if (waCustomerPhone) {
                        if (confirm("Print Done. Send Bill to Customer via WhatsApp?")) {
                            const currentUrl = window.location.origin + window.location.pathname;
                            const longUrl = `${currentUrl}?saleId=${saleId}&uid=${userId}`;
                            const finalLink = readyShortLink || longUrl;

                            let message = `*INVOICE: ${waShopName}*\n`;
                            message += `Bill No: ${waBillNo}\n`;
                            message += `Total: ₹${waGrandTotal}\n\n`;
                            message += `Click to view your bill:\n${finalLink}\n\n`;
                            message += `Thank you for shopping with us!`;

                            let cleanPhone = waCustomerPhone.replace(/[^0-9]/g, ''); 
                            if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

                            window.location.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
                        } else { window.close(); }
                    } else { window.close(); }
                };
                setTimeout(() => window.print(), 1200);
            }

        } catch (error) {
            console.error(error);
            document.body.innerHTML = '<h1>Error loading bill.</h1>';
        }
    };

    if (urlUid) {
        fetchAndRenderBill(urlUid, true); 
    } else {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // স্টাফ বা মালিক যেই হোক, আমরা activeShopId ব্যবহার করব
                const activeShopId = localStorage.getItem('activeShopId');
                
                if (activeShopId) {
                    fetchAndRenderBill(activeShopId, false);
                } else {
                    // যদি কোনো কারণে activeShopId না থাকে, তবে ইউজারের নিজের আইডি ট্রাই করবে
                    fetchAndRenderBill(user.uid, false);
                }
            } else {
                document.body.innerHTML = '<h1>Please login to view this page.</h1>';
            }
        });
    }
}

window.addEventListener('DOMContentLoaded', loadAndPrintBill);