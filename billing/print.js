// print.js (সম্পূর্ণ এবং চূড়ান্ত কোড)

// Firebase মডিউল ইম্পোর্ট করুন
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// ফাংশন: বিল এবং দোকানের তথ্য লোড করে প্রিন্ট করার জন্য
async function loadAndPrintBill() {
    // ১. URL থেকে saleId বের করা
    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('saleId');

    if (!saleId) {
        document.body.innerHTML = '<h1>Error: Sale ID not found in URL.</h1>';
        return;
    }

    // ২. Authentication State এর জন্য অপেক্ষা করা
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userId = user.uid;
            
            try {
                // দুটি ডেটা (বিলের তথ্য এবং দোকানের তথ্য) একসাথে আনার জন্য Promise.all ব্যবহার করা হচ্ছে
                const [saleDocSnap, userDocSnap] = await Promise.all([
                    getDoc(doc(db, 'shops', userId, 'sales', saleId)),
                    getDoc(doc(db, 'users', userId)) // 'users' কালেকশন থেকে দোকানের তথ্য আনা হচ্ছে
                ]);

                // দোকানের তথ্য রসিদে বসানো
                const shopDetailsContainer = document.getElementById('shop-details-container');
                if (userDocSnap.exists()) {
                    const shopData = userDocSnap.data();
                    shopDetailsContainer.innerHTML = `
                        <h2>${shopData.shopName || 'Your Shop Name'}</h2>
                        <p>${shopData.shopAddress || 'Your Shop Address'}</p>
                        <p>Phone: ${shopData.shopPhone || 'N/A'}</p>
                        ${shopData.shopGstin ? `<p>GSTIN: ${shopData.shopGstin}</p>` : ''}
                    `;
                } else {
                    shopDetailsContainer.innerHTML = '<p>Shop details not set.</p>';
                }

                // বিলের তথ্য রসিদে বসানো
                if (saleDocSnap.exists()) {
                    const saleData = saleDocSnap.data();

                    // ===============================================
                    // START: কাস্টমারের তথ্য বসানোর কোড (নতুন যোগ করা হয়েছে)
                    // ===============================================
                    const customerSection = document.getElementById('customer-details-section');
                    if (saleData.customerDetails) {
                        const { name, phone, address } = saleData.customerDetails;
                        // শুধুমাত্র যদি নাম 'Walk-in Customer' না হয়, তবেই সেকশনটি দেখানো হবে
                        if (name && name.trim().toLowerCase() !== 'walk-in customer') {
                            customerSection.style.display = 'block'; // সেকশনটি দৃশ্যমান করা
                            document.getElementById('customer-name').textContent = name;
                            
                            const phoneP = document.getElementById('customer-phone-p');
                            if (phone) {
                                phoneP.style.display = 'block';
                                document.getElementById('customer-phone').textContent = phone;
                            }
                            
                            const addressP = document.getElementById('customer-address-p');
                            if (address) {
                                addressP.style.display = 'block';
                                document.getElementById('customer-address').textContent = address;
                            }
                        }
                    }
                    // ===============================================
                    // END: কাস্টমারের তথ্য বসানোর কোড
                    // ===============================================

                    document.getElementById('bill-no').textContent = saleId.substring(0, 8).toUpperCase();
                    document.getElementById('bill-date').textContent = saleData.createdAt.toDate().toLocaleString();

                    const itemsTbody = document.getElementById('receipt-items');
                    itemsTbody.innerHTML = '';
                    saleData.items.forEach(item => {
                        const row = itemsTbody.insertRow();
                        row.innerHTML = `
                            <td>${item.name}</td>
                            <td>${item.quantity}</td>
                            <td>${(item.price || 0).toFixed(2)}</td>
                            <td>${(item.quantity * (item.price || 0)).toFixed(2)}</td>
                        `;
                    });

                    document.getElementById('receipt-subtotal').textContent = `₹${(saleData.subtotal || 0).toFixed(2)}`;
                    
                    const gstLine = document.getElementById('gst-line');
                    if (saleData.gstApplied && saleData.tax > 0) {
                        gstLine.style.display = 'block';
                        document.getElementById('receipt-tax').textContent = `₹${(saleData.tax || 0).toFixed(2)}`;
                    } else {
                        gstLine.style.display = 'none';
                    }
                    
                    document.getElementById('receipt-total').textContent = `₹${(saleData.total || 0).toFixed(2)}`;
                    document.getElementById('payment-method').textContent = saleData.paymentMethod.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); // ফরম্যাটিং উন্নত করা হয়েছে

                    // সব তথ্য রেন্ডার হওয়ার পর প্রিন্ট ডায়ালগ ওপেন করা
                    setTimeout(() => {
                        window.print();
                        // প্রিন্টের পর ট্যাব বন্ধ করতে চাইলে নিচের লাইনটি আনকমেন্ট করুন
                        // window.onafterprint = () => window.close(); 
                    }, 500);

                } else {
                    document.body.innerHTML = `<h1>Error: Bill with ID (${saleId}) not found for your shop.</h1>`;
                }
            } catch (error) {
                console.error("Error fetching bill details: ", error);
                document.body.innerHTML = `<h1>Failed to load bill details. Error: ${error.message}</h1>`;
            }

        } else {
            // ব্যবহারকারী লগইন করা নেই
            document.body.innerHTML = '<h1>Authentication Error: Please log in to view this receipt.</h1>';
        }
    });
}

// পেজ লোড হয়ে গেলে ফাংশনটি কল করা
window.addEventListener('DOMContentLoaded', loadAndPrintBill);