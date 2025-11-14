// print.js (সম্পূর্ণ এবং চূড়ান্ত কোড)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

async function loadAndPrintBill() {
    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('saleId');

    if (!saleId) {
        document.body.innerHTML = '<h1>Error: Sale ID not found in URL.</h1>';
        return;
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userId = user.uid;
            
            try {
                // ===== START: ডেটাবেস পাথ পরিবর্তন করা হয়েছে =====
                // এখন 'users' এর পরিবর্তে 'shops' কালেকশন থেকে দোকানের তথ্য আনা হচ্ছে
                const [saleDocSnap, shopDocSnap] = await Promise.all([
                    getDoc(doc(db, 'shops', userId, 'sales', saleId)),
                    getDoc(doc(db, 'shops', userId)) 
                ]);
                // ===== END: ডেটাবেস পাথ পরিবর্তন করা হয়েছে =====

                // দোকানের তথ্য রসিদে বসানো
                const shopDetailsContainer = document.getElementById('shop-details-container');
                const receiptFooterContainer = document.getElementById('receipt-footer-note'); // ফুটারের জন্য রেফারেন্স

                if (shopDocSnap.exists()) {
                    const shopData = shopDocSnap.data();
                    // ===== START: দোকানের তথ্য দেখানোর কোড আপডেট করা হয়েছে =====
                    shopDetailsContainer.innerHTML = `
                        <h2>${shopData.shopName || 'Your Shop Name'}</h2>
                        <p>${shopData.shopAddress || 'Your Shop Address'}</p>
                        <p>Phone: ${shopData.shopPhone || 'N/A'}</p>
                        <p>Email: ${shopData.email || 'N/A'}</p> 
                        ${shopData.shopGstin ? `<p>GSTIN: ${shopData.shopGstin}</p>` : ''}
                    `;
                    
                    // রসিদের ফুটার নোট দেখানো হচ্ছে
                    if (shopData.receiptFooter) {
                        receiptFooterContainer.textContent = shopData.receiptFooter;
                    }
                    // ===== END: দোকানের তথ্য দেখানোর কোড আপডেট করা হয়েছে =====

                } else {
                    shopDetailsContainer.innerHTML = '<p>Shop details not set.</p>';
                }

                if (saleDocSnap.exists()) {
                    const saleData = saleDocSnap.data();

                    // কাস্টমারের তথ্য বসানো
                    const customerSection = document.getElementById('customer-details-section');
                    if (saleData.customerDetails) {
                        const { name, phone, address } = saleData.customerDetails;
                        if (name && name.trim().toLowerCase() !== 'walk-in customer') {
                            customerSection.style.display = 'block';
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
                    }
                    
                    document.getElementById('bill-no').textContent = saleId.substring(0, 8).toUpperCase();
                    document.getElementById('bill-date').textContent = saleData.createdAt.toDate().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });

                    const itemsTbody = document.getElementById('receipt-items');
                    itemsTbody.innerHTML = '';
                    saleData.items.forEach(item => {
                        const row = itemsTbody.insertRow();
                        row.innerHTML = `
                            <td>${item.name}</td>
                            <td class="numeric">${item.quantity}</td>
                            <td class="numeric">${(item.price || 0).toFixed(2)}</td>
                            <td class="numeric">${(item.quantity * (item.price || 0)).toFixed(2)}</td>
                        `;
                    });

                    document.getElementById('receipt-subtotal').textContent = `₹${(saleData.subtotal || 0).toFixed(2)}`;
                    
                    // ===== START: ডিসকাউন্ট এবং GST লেবেল আপডেট করার কোড =====
                    const discountLine = document.getElementById('discount-line');
                    // পুরোনো (discount) এবং নতুন (discountAmount) উভয় ফিল্ড চেক করা হচ্ছে
                    const discountAmount = saleData.discountAmount || saleData.discount || 0;
                    
                    if (discountAmount > 0) {
                        const discountLabel = discountLine.querySelector('strong');
                        if (saleData.discountType === 'percent' && saleData.discountValue > 0) {
                            discountLabel.textContent = `Discount (${saleData.discountValue}%):`;
                        } else {
                            discountLabel.textContent = 'Discount:';
                        }
                        discountLine.style.display = 'flex';
                        document.getElementById('receipt-discount').textContent = `- ₹${discountAmount.toFixed(2)}`;
                    } else {
                        discountLine.style.display = 'none';
                    }

                    const gstLine = document.getElementById('gst-line');
                    if (saleData.gstApplied && saleData.tax > 0) {
                        const gstLabel = gstLine.querySelector('strong');
                        gstLabel.textContent = `GST (${saleData.gstRate || 5}%):`;
                        gstLine.style.display = 'flex';
                        document.getElementById('receipt-tax').textContent = `₹${(saleData.tax || 0).toFixed(2)}`;
                    } else {
                        gstLine.style.display = 'none';
                    }
                    // ===== END: ডিসকাউন্ট এবং GST লেবেল আপডেট করার কোড =====
                    
                    document.getElementById('receipt-total').textContent = `₹${(saleData.total || 0).toFixed(2)}`;
                    document.getElementById('payment-method').textContent = saleData.paymentMethod.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

                    setTimeout(() => window.print(), 500);

                } else {
                    document.body.innerHTML = `<h1>Error: Bill with ID (${saleId}) not found.</h1>`;
                }
            } catch (error) {
                console.error("Error fetching bill details: ", error);
                document.body.innerHTML = `<h1>Failed to load bill details. Error: ${error.message}</h1>`;
            }

        } else {
            document.body.innerHTML = '<h1>Authentication Error: Please log in.</h1>';
        }
    });
}

window.addEventListener('DOMContentLoaded', loadAndPrintBill);