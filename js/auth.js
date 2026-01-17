// js/auth.js

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ADMIN_EMAIL = "keshabsarkar2018@gmail.com";

// ১. মেইন গেটকিপার লজিক
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const isAllowed = await verifyAndSetupUser(user);
        
        if (!isAllowed) {
            alert("⛔ ACCESS DENIED!\nআপনার ইমেইলটি অনুমোদিত নয়। এডমিনের অনুমতি প্রয়োজন।");
            await signOut(auth);
            localStorage.clear();
            window.location.href = 'index.html';
        } else {
            if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
                window.location.href = 'dashboard.html';
            }
        }
    }
});

async function verifyAndSetupUser(user) {
    const email = user.email.toLowerCase();
    const emailId = email.replace(/\./g, '_');

    // ক) এডমিন চেক
    if (email === ADMIN_EMAIL) {
        localStorage.setItem('userRole', 'owner');
        localStorage.setItem('activeShopId', user.uid);
        localStorage.setItem('isStaff', 'false');
        return true;
    }

    try {
        // খ) ডাটাবেস থেকে ৩টি চেক একসাথে করা
        const [shopSnap, staffSnap, authSnap] = await Promise.all([
            getDoc(doc(db, 'shops', user.uid)),
            getDoc(doc(db, 'staff_mapping', emailId)),
            getDoc(doc(db, 'authorized_users', emailId))
        ]);

        // ১. যদি অলরেডি শপ ওনার হয়
        if (shopSnap.exists()) {
            localStorage.setItem('userRole', 'owner');
            localStorage.setItem('activeShopId', user.uid);
            localStorage.setItem('isStaff', 'false');
            return true;
        }

        // ২. যদি রেজিস্টার্ড স্টাফ হয়
        if (staffSnap.exists()) {
            const staffData = staffSnap.data();
            localStorage.setItem('userRole', staffData.role);
            localStorage.setItem('activeShopId', staffData.shopId);
            localStorage.setItem('isStaff', 'true');
            return true;
        }

        // ৩. যদি নতুন অনুমোদিত ওনার হয় (এডমিন প্যানেল থেকে অ্যাড করা হয়েছে)
        if (authSnap.exists()) {
            const authData = authSnap.data();
            // নতুন শপ তৈরি
            await setDoc(doc(db, 'shops', user.uid), {
                shopName: authData.shopName || "My Shop",
                ownerName: user.displayName,
                contactEmail: email,
                status: 'active',
                createdAt: serverTimestamp()
            });
            // অথোরাইজড লিস্ট থেকে মুছে ফেলা
            await deleteDoc(doc(db, 'authorized_users', emailId));
            
            localStorage.setItem('userRole', 'owner');
            localStorage.setItem('activeShopId', user.uid);
            localStorage.setItem('isStaff', 'false');
            return true;
        }

        // কোনো ক্যাটাগরিতেই না পড়লে ফলস রিটার্ন করবে
        return false;

    } catch (e) {
        console.error("Verification Error:", e);
        return false;
    }
}

// ২. গুগল লগইন বাটন হ্যান্ডলার
const googleLoginBtn = document.getElementById('google-login-btn');
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            alert("Login Failed: " + error.message);
        }
    });
}

// ৩. স্টাফ লগইন ফর্ম হ্যান্ডলার
const staffLoginForm = document.getElementById('staff-login-form');
if (staffLoginForm) {
    staffLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.toLowerCase().trim();
        const password = document.getElementById('login-password').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            alert('Invalid Email or Password!');
        }
    });
}
