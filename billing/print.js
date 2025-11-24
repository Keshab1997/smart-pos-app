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
        const urlParams = new URLSearchParams(window.location.search);
        const saleId = urlParams.get('saleId');

        if (!saleId) {
            document.body.innerHTML = '<h1>Error: Bill ID not found in the URL.</h1>';
            return;
        }

        try {
            const [saleDocSnap, shopDocSnap] = await Promise.all([
                getDoc(doc(db, 'shops', userId, 'sales', saleId)),
                getDoc(doc(db, 'shops', userId))
            ]);

            // === WhatsApp ভেরিয়েবল ===
            let waCustomerPhone = '';
            let waShopName = 'Shop';
            let waBillNo = saleId.substring(0, 8).toUpperCase();
            
            // বিস্তারিত হিসাবের জন্য ভেরিয়েবল
            let waSubtotal = '0.00';
            let waDiscount = '0.00';
            let waTax = '0.00';
            let waGrandTotal = '0.00';
            let waItemListText = ''; // আইটেম লিস্টের জন্য
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
                if(shopHeaderContainer) shopHeaderContainer.innerHTML = shopHtml;
            }

            if (!saleDocSnap.exists()) {
                document.body.innerHTML = `<h1>Error: Bill not found.</h1>`;
                return;
            }
            
            const saleData = saleDocSnap.data();
            
            // ডাটা স্টোর করা হচ্ছে WhatsApp এর জন্য
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

            // === আইটেম লিস্ট প্রসেসিং ===
            const itemsTbody = document.getElementById('receipt-items');
            itemsTbody.innerHTML = '';
            
            saleData.items.forEach((item, index) => {
                const itemTotal = (item.quantity * (item.price || 0));
                
                // ১. HTML টেবিলের জন্য
                const row = itemsTbody.insertRow();
                row.innerHTML = `
                    <td>${item.name}</td>
                    <td class="center">${item.quantity}</td>
                    <td class="right">${(item.price || 0).toFixed(2)}</td>
                    <td class="right">${itemTotal.toFixed(2)}</td>
                `;

                // ২. WhatsApp টেক্সট এর জন্য (বিস্তারিত ফরম্যাট)
                // ফরম্যাট: 1. Product Name
                //           2 x 50.00 = 100.00
                waItemListText += `${index + 1}. ${item.name}\n   ${item.quantity} x ${item.price} = ₹${itemTotal.toFixed(2)}\n`;
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
            // === DETAILED WHATSAPP BILL LOGIC ===
            // ============================================================

            window.onafterprint = function() {
                if (waCustomerPhone) {
                    let sendWA = confirm("Print complete. Do you want to send the detailed bill on WhatsApp?");
                    
                    if (sendWA) {
                        // --- মেসেজ তৈরি শুরু ---
                        let message = `*INVOICE*\n`;
                        message += `*${waShopName}*\n`;
                        message += `Date: ${waDate}\n`;
                        message += `Bill No: ${waBillNo}\n`;
                        message += `--------------------------------\n`;
                        
                        // আইটেম লিস্ট যোগ করা
                        message += `*ITEMS:*\n`;
                        message += waItemListText;
                        message += `--------------------------------\n`;
                        
                        // বিস্তারিত হিসাব যোগ করা
                        message += `Subtotal: ₹${waSubtotal}\n`;
                        
                        if (parseFloat(waDiscount) > 0) {
                            message += `Discount: - ₹${waDiscount}\n`;
                        }
                        
                        if (parseFloat(waTax) > 0) {
                            message += `Tax (GST): ₹${waTax}\n`;
                        }

                        message += `--------------------------------\n`;
                        message += `*GRAND TOTAL: ₹${waGrandTotal}*\n`;
                        message += `--------------------------------\n`;
                        message += `Thank you! Visit Again.`;

                        // --- ফোন নাম্বার প্রসেসিং ---
                        let cleanPhone = waCustomerPhone.replace(/[^0-9]/g, ''); 
                        if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

                        // --- লিঙ্ক তৈরি এবং রিডাইরেক্ট ---
                        let url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
                        window.location.href = url; 
                        
                    } else {
                        window.close();
                    }
                } else {
                    window.close();
                }
            };

            // প্রিন্ট ডায়ালগ ওপেন
            setTimeout(() => window.print(), 500);

        } catch (error) {
            console.error("Error fetching bill details: ", error);
            document.body.innerHTML = `<h1>Failed to load bill details.</h1>`;
        }
    });
}

window.addEventListener('DOMContentLoaded', loadAndPrintBill);