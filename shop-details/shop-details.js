// shop-details/shop-details.js

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ==========================================================
// --- DOM এলিমেন্টের রেফারেন্স ---
// ==========================================================
const form = document.getElementById('shop-details-form');
const shopNameInput = document.getElementById('shop-name');
const shopAddressInput = document.getElementById('shop-address');
const shopPhoneInput = document.getElementById('shop-phone');
const shopGstinInput = document.getElementById('shop-gstin');
const shopEmailInput = document.getElementById('shop-email');
// নতুন Receipt Footer এলিমেন্ট যোগ করা হয়েছে
const receiptFooterInput = document.getElementById('receipt-footer'); 
const saveBtn = document.getElementById('save-btn');
const statusMessage = document.getElementById('status-message');

// ==========================================================
// --- গ্লোবাল ভেরিয়েবল ---
// ==========================================================
let activeShopId = null;

// ==========================================================
// --- Authentication ---
// ==========================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        activeShopId = localStorage.getItem('activeShopId'); if (!activeShopId) { window.location.href = '../index.html'; return; }
        // ব্যবহারকারীর ইমেলটি লোড হওয়া মাত্রই ফর্মে দেখানো হচ্ছে
        shopEmailInput.value = user.email;
        loadShopDetails();
    } else {
        window.location.href = '../index.html';
    }
});

// ==========================================================
// --- মূল ফাংশন ---
// ==========================================================

/**
 * Firestore থেকে দোকানের তথ্য লোড করে এবং ফর্মে দেখায়
 */
async function loadShopDetails() {
    if (!activeShopId) return;
    
    try {
        const shopDetailsRef = doc(db, 'shops', activeShopId);
        const docSnap = await getDoc(shopDetailsRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            shopNameInput.value = data.shopName || '';
            shopAddressInput.value = data.shopAddress || '';
            shopPhoneInput.value = data.shopPhone || '';
            shopGstinInput.value = data.shopGstin || '';
            receiptFooterInput.value = data.receiptFooter || '';
            // ইমেল Firestore থেকে লোড করা হচ্ছে, যদি না থাকে তবে auth থেকে নেওয়া হবে
            shopEmailInput.value = data.email || auth.currentUser.email;
        } else {
            console.log("No shop details document found. User might be setting up for the first time.");
        }
    } catch (error) {
        console.error("Error loading shop details: ", error);
        showStatus('Failed to load details. Please try again.', 'error');
    }
}

/**
 * ফর্ম সাবমিট হলে দোকানের তথ্য Firestore-এ সেভ করে
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    if (!activeShopId) {
        showStatus('Authentication error. Please log in again.', 'error');
        return;
    }

    saveBtn.disabled = true;
    showStatus('Saving...', 'loading');

    // ফর্ম থেকে ডেটা সংগ্রহ করা
    const shopDetails = {
        shopName: shopNameInput.value.trim(),
        shopAddress: shopAddressInput.value.trim(),
        shopPhone: shopPhoneInput.value.trim(),
        shopGstin: shopGstinInput.value.trim(),
        receiptFooter: receiptFooterInput.value.trim(),
        // আপনার অনুরোধ অনুযায়ী, disabled ইমেলটিও সেভ করা হচ্ছে
        email: shopEmailInput.value 
    };

    try {
        // ডেটা 'shops' কালেকশনের ভিতরে সেভ করা হচ্ছে, যা অন্যান্য ডেটার সাথে সামঞ্জস্যপূর্ণ
        const shopDetailsRef = doc(db, 'shops', activeShopId);
        // setDoc({ merge: true }) ব্যবহার করা হচ্ছে যাতে ডকুমেন্ট না থাকলে তৈরি হয়
        await setDoc(shopDetailsRef, shopDetails, { merge: true });
        
        showStatus('Shop details saved successfully!', 'success');
    } catch (error) {
        console.error("Error saving shop details: ", error);
        showStatus(`Failed to save details: ${error.message}`, 'error');
    } finally {
        saveBtn.disabled = false;
        // স্ট্যাটাস মেসেজ কিছুক্ষণ পর নিজে থেকেই মুছে যাবে
    }
}

/**
 * ব্যবহারকারীকে স্ট্যাটাস মেসেজ দেখানোর জন্য একটি হেল্পার ফাংশন
 */
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = type; // 'success', 'error', বা 'loading'

    // শুধু success বা error মেসেজ কিছু সময় পর মোছা হবে
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            statusMessage.textContent = '';
            statusMessage.className = '';
        }, 4000);
    }
}

// ==========================================================
// --- ইভেন্ট লিসেনার সেটআপ ---
// ==========================================================
form.addEventListener('submit', handleFormSubmit);