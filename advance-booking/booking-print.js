// advance-booking/booking-print.js

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

// গ্লোবাল ভেরিয়েবল (লিংক স্টোর করার জন্য)
let readyShortLink = null;

async function loadAndPrintBooking() {
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('id');
    const urlUid = urlParams.get('uid'); 

    if (!bookingId) {
        document.body.innerHTML = '<h3>Error: No Booking ID found!</h3>';
        return;
    }

    // --- লিংক জেনারেটর ---
    const startLinkGeneration = async (longUrl) => {
        try {
            console.log("Starting background link generation...");
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
        } catch (err) {
            console.error("Shortener failed, using long URL.");
        }
        readyShortLink = longUrl;
    };

    const fetchAndRenderBooking = async (userId, isPublicView) => {
        try {
            if (!isPublicView) {
                const currentUrl = window.location.href.split('?')[0];
                const longUrl = `${currentUrl}?id=${bookingId}&uid=${userId}`;
                startLinkGeneration(longUrl);
            }

            const [shopDoc, bookingDoc] = await Promise.all([
                getDoc(doc(db, 'shops', userId)),
                getDoc(doc(db, 'shops', userId, 'bookings', bookingId))
            ]);

            // Shop Info
            if (shopDoc.exists()) {
                const s = shopDoc.data();
                const header = document.getElementById('shop-details-container');
                if (header) {
                    header.innerHTML = `
                        <h1 class="shop-name">${s.shopName || 'Shop Name'}</h1>
                        <p class="shop-address">${s.shopAddress || ''}</p>
                        <p class="shop-contact">${s.shopPhone || ''}</p>
                    `;
                }
            }

            // Booking Info
            if (bookingDoc.exists()) {
                const data = bookingDoc.data();

                // --- এখানে Numeric Booking ID লজিক বসানো হয়েছে ---
                let waBookingNo = '';
                
                if (data.bookingNo) {
                    // যদি ডাটাবেসে ম্যানুয়াল নম্বর থাকে
                    waBookingNo = data.bookingNo.toString();
                } else if (data.createdAt) {
                    // টাইমস্ট্যাম্পের শেষ ৬টি ডিজিট ব্যবহার করে নম্বর তৈরি
                    // উদাহরণ: 892345
                    waBookingNo = data.createdAt.seconds.toString().slice(-6);
                } else {
                    // ফলব্যাক: রেন্ডম ৬ সংখ্যার নম্বর
                    waBookingNo = Math.floor(100000 + Math.random() * 900000).toString();
                }
                // ----------------------------------------------

                const waCustomerName = data.customerName || 'Customer';
                const waPhone = data.phone || '';
                const waItem = data.description || 'Item';
                const waAdvance = (data.advancePaid || 0).toFixed(2);
                const waDue = ((data.estimatedTotal || 0) - (data.advancePaid || 0)).toFixed(2);
                const waDelDate = new Date(data.deliveryDate).toLocaleDateString('en-IN');
                const waShopName = shopDoc.exists() ? (shopDoc.data().shopName || 'Shop') : 'Shop';

                // HTML আপডেট
                document.getElementById('booking-no').textContent = waBookingNo;
                document.getElementById('booking-date').textContent = data.createdAt ? data.createdAt.toDate().toLocaleDateString('en-IN') : new Date().toLocaleDateString();
                
                document.getElementById('c-name').textContent = waCustomerName;
                document.getElementById('c-phone').textContent = waPhone;
                document.getElementById('item-desc').textContent = waItem;

                document.getElementById('est-total').textContent = `₹${(data.estimatedTotal || 0).toFixed(2)}`;
                document.getElementById('adv-paid').textContent = `₹${waAdvance}`;
                document.getElementById('balance-due').textContent = `₹${waDue}`;

                const dDate = new Date(data.deliveryDate);
                document.getElementById('del-date').textContent = dDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

                // WhatsApp Share & Print
                if (!isPublicView) {
                    window.onafterprint = async function() {
                        if (waPhone) {
                            let sendWA = confirm("Print complete. Send Booking Slip on WhatsApp?");
                            
                            if (sendWA) {
                                const currentUrl = window.location.href.split('?')[0];
                                const longUrl = `${currentUrl}?id=${bookingId}&uid=${userId}`;
                                const finalLink = readyShortLink ? readyShortLink : longUrl;

                                let message = `*BOOKING CONFIRMED - ${waShopName}*\n`;
                                message += `Booking No: ${waBookingNo}\n`; // এখানে নম্বর যাবে
                                message += `Item: ${waItem}\n`;
                                message += `Delivery: ${waDelDate}\n`;
                                message += `Advance: ₹${waAdvance}\n`;
                                message += `Balance Due: ₹${waDue}\n\n`;
                                message += `View Slip: ${finalLink}\n\n`;
                                message += `Thank you!`;

                                let cleanPhone = waPhone.replace(/[^0-9]/g, '');
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

                    setTimeout(() => {
                        window.print();
                    }, 1200);
                }

            } else {
                document.body.innerHTML = '<h3>Error: Booking not found!</h3>';
            }

        } catch (error) {
            console.error("Error:", error);
            document.body.innerHTML = '<h3>Error loading booking details.</h3>';
        }
    };

    if (urlUid) {
        fetchAndRenderBooking(urlUid, true);
    } else {
        onAuthStateChanged(auth, (user) => {
            if (user) {
                fetchAndRenderBooking(user.uid, false);
            } else {
                document.body.innerHTML = '<h3>Login Required.</h3>';
            }
        });
    }
}

window.addEventListener('DOMContentLoaded', loadAndPrintBooking);