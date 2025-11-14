// shop-details/shop-details.js

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

// DOM Elements
const form = document.getElementById('shop-details-form');
const shopNameInput = document.getElementById('shop-name');
const shopAddressInput = document.getElementById('shop-address');
const shopPhoneInput = document.getElementById('shop-phone');
const shopGstinInput = document.getElementById('shop-gstin');
const shopEmailInput = document.getElementById('shop-email');
const saveBtn = document.getElementById('save-btn');
const statusMessage = document.getElementById('status-message');
const logoutBtn = document.getElementById('logout-btn');

let currentUserId = null;

// --- Authentication Check ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        loadShopDetails(currentUserId);
    } else {
        window.location.href = '../index.html';
    }
});

// --- Functions ---

// Firestore থেকে দোকানের তথ্য লোড করা
async function loadShopDetails(userId) {
    try {
        // রুলস অনুযায়ী সঠিক পাথ: users/{userId}
        const userDocRef = doc(db, 'users', userId);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            const userData = docSnap.data();
            // ফর্মের ফিল্ডগুলোতে ডেটা বসানো
            shopNameInput.value = userData.shopName || '';
            shopAddressInput.value = userData.shopAddress || '';
            shopPhoneInput.value = userData.shopPhone || '';
            shopGstinInput.value = userData.shopGstin || '';
            shopEmailInput.value = userData.email || auth.currentUser.email;
        } else {
            console.log("No user document found! This might be a new user.");
            // নতুন ব্যবহারকারী হলে শুধু ইমেল দেখানো
            shopEmailInput.value = auth.currentUser.email;
        }
    } catch (error) {
        console.error("Error loading shop details: ", error);
        showStatus('Failed to load details. Please try again.', 'error');
    }
}

// স্ট্যাটাস মেসেজ দেখানোর জন্য ফাংশন
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = type; // 'success' or 'error'
    setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = '';
    }, 4000);
}

// --- Event Listeners ---

// ফর্ম সাবমিট হলে ডেটা সেভ করা
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUserId) {
        showStatus('Authentication error. Please log in again.', 'error');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    // ফর্ম থেকে ডেটা সংগ্রহ করা
    const shopDetails = {
        shopName: shopNameInput.value.trim(),
        shopAddress: shopAddressInput.value.trim(),
        shopPhone: shopPhoneInput.value.trim(),
        shopGstin: shopGstinInput.value.trim(),
        // email আপডেট করা হচ্ছে না
    };

    try {
        const userDocRef = doc(db, 'users', currentUserId);
        
        // setDoc({ merge: true }) ব্যবহার করা হচ্ছে, যাতে ডকুমেন্ট না থাকলে তৈরি হয়
        // এবং থাকলে শুধুমাত্র এই ফিল্ডগুলো আপডেট হয়, অন্য ফিল্ড (যেমন createdAt) মুছে না যায়।
        await setDoc(userDocRef, shopDetails, { merge: true });
        
        showStatus('Shop details saved successfully!', 'success');
    } catch (error) {
        console.error("Error saving shop details: ", error);
        showStatus(`Failed to save details: ${error.message}`, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
    }
});

// লগআউট বাটন
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout error: ", error);
    }
});