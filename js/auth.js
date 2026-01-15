// js/auth.js

// Firebase Auth থেকে প্রয়োজনীয় ফাংশন ইম্পোর্ট করা
import { 
    GoogleAuthProvider, 
    signInWithPopup,
    signInWithEmailAndPassword,
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firestore থেকে প্রয়োজনীয় ফাংশন ইম্পোর্ট করা (ইউজারের ডেটা সেভ করার জন্য)
import { 
    doc, 
    setDoc, 
    getDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// আমাদের কনফিগারেশন ফাইল থেকে auth এবং db অবজেক্ট ইম্পোর্ট করা
import { auth, db } from './firebase-config.js';

// DOM এলিমেন্টগুলো সিলেক্ট করা
const googleLoginBtn = document.getElementById('google-login-btn');
const staffLoginForm = document.getElementById('staff-login-form');
const loginStatus = document.getElementById('login-status');

// ১. পেজ লোড হওয়ার সাথে সাথেই ইউজারের অবস্থা চেক করা
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // যদি ইউজার অলরেডি লগইন করা থাকে, তাকে ড্যাশবোর্ডে পাঠিয়ে দিন
        console.log('User is already logged in, redirecting to dashboard...');
        loginStatus.textContent = 'Redirecting to dashboard...';
        
        // স্টাফ কিনা চেক করা
        await checkIfStaffAndSetup(user);
        
        window.location.href = 'dashboard.html';
    } else {
        // ইউজার লগইন করা নেই, তাই বাটনটি সক্রিয় থাকবে
        googleLoginBtn.disabled = false;
        console.log('No user is logged in. Please sign in.');
    }
});

// ২. লগইন বাটনে ক্লিক ইভেন্ট যোগ করা
if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        googleLoginBtn.disabled = true; // ডাবল ক্লিক এড়ানোর জন্য বাটন নিষ্ক্রিয় করা
        loginStatus.textContent = 'Authenticating with Google...';

        const provider = new GoogleAuthProvider(); 

        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            
            console.log('Successfully authenticated!', user);
            loginStatus.textContent = 'Authentication successful! Setting up your account...';

            // স্টাফ কিনা চেক করা এবং সেটআপ করা
            const isStaff = await checkIfStaffAndSetup(user);
            
            // যদি স্টাফ না হয়, তাহলে নতুন ইউজার হিসেবে প্রোফাইল তৈরি করা
            if (!isStaff) {
                await createUserProfile(user);
            }

            // সফলভাবে লগইন এবং প্রোফাইল সেটআপ হলে dashboard.html পেজে রিডাইরেক্ট করুন
            window.location.href = 'dashboard.html';

        } catch (error) {
            console.error('Google login error:', error.code, error.message);
            loginStatus.textContent = `Login failed: ${error.message}`;
            googleLoginBtn.disabled = false; // লগইন ব্যর্থ হলে বাটন আবার সক্রিয় করা
        }
    });
}

// ৩. স্টাফ লগইন ফর্ম হ্যান্ডলার
if (staffLoginForm) {
    staffLoginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.toLowerCase().trim();
        const password = document.getElementById('login-password').value;

        loginStatus.textContent = 'Logging in...';

        try {
            const result = await signInWithEmailAndPassword(auth, email, password);
            console.log('Staff login successful!', result.user);
            loginStatus.textContent = 'Login successful! Redirecting...';
            
            // স্টাফ প্রোফাইল এবং রোল সেট করা
            await checkIfStaffAndSetup(result.user);
            
            window.location.href = 'dashboard.html';
        } catch (error) {
            console.error('Staff login error:', error);
            loginStatus.textContent = 'Invalid Email or Password!';
        }
    });
}

// ৪. Firestore-এ ইউজারের প্রোফাইল তৈরি বা চেক করার ফাংশন
async function createUserProfile(user) {
    const emailId = user.email.toLowerCase().replace(/\./g, '_');
    const staffMappingRef = doc(db, 'staff_mapping', emailId);
    const shopDocRef = doc(db, 'shops', user.uid);
    const authorizedRef = doc(db, 'authorized_users', emailId);

    try {
        const staffSnap = await getDoc(staffMappingRef);
        const shopSnap = await getDoc(shopDocRef);
        const authSnap = await getDoc(authorizedRef);

        // === এক্সেস গার্ড (Access Guard) ===
        if (!staffSnap.exists() && !shopSnap.exists() && !authSnap.exists()) {
            const ADMIN_EMAIL = "keshabsarkar2018@gmail.com";
            if (user.email !== ADMIN_EMAIL) {
                alert("⛔ Access Denied! Your email is not authorized. Contact Admin.");
                await auth.signOut();
                localStorage.clear();
                window.location.href = 'index.html';
                return;
            }
        }

        // === নতুন অথোরাইজড ইউজারের জন্য শপ তৈরি ===
        if (authSnap.exists() && !shopSnap.exists()) {
            const authData = authSnap.data();
            await setDoc(shopDocRef, {
                shopName: authData.shopName,
                ownerName: user.displayName || 'Owner',
                contactEmail: user.email,
                address: 'Not set',
                status: 'active',
                createdAt: serverTimestamp()
            });
            // অথোরাইজড লিস্ট থেকে মুছে ফেলা
            await deleteDoc(authorizedRef);
        }

        // === অনুমোদিত ইউজারদের জন্য রোল সেট করা ===
        if (staffSnap.exists()) {
            const staffData = staffSnap.data();
            localStorage.setItem('activeShopId', staffData.shopId);
            localStorage.setItem('userRole', staffData.role);
            localStorage.setItem('isStaff', 'true');
            console.log("Staff Access Granted.");
        } else {
            localStorage.setItem('activeShopId', user.uid);
            localStorage.setItem('userRole', 'owner');
            localStorage.setItem('isStaff', 'false');
            
            if (!shopSnap.exists() && !authSnap.exists()) {
                await setDoc(shopDocRef, {
                    shopName: `${user.displayName || 'My'}'s Shop`,
                    ownerName: user.displayName || 'Owner',
                    contactEmail: user.email,
                    address: 'Not set',
                    createdAt: serverTimestamp()
                });
            }
        }

        // ইউজার লগইন টাইম আপডেট
        const userDocRef = doc(db, 'users', user.uid);
        await setDoc(userDocRef, {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
            lastLogin: serverTimestamp()
        }, { merge: true });

    } catch (e) {
        console.error("Auth Error:", e);
        alert("Authentication failed. Please try again.");
    }
}

// ৫. স্টাফ কিনা চেক করার ফাংশন
async function checkIfStaffAndSetup(user) {
    try {
        const ADMIN_EMAIL = "keshabsarkar2018@gmail.com";
        
        // অ্যাডমিন হলে সরাসরি owner রোল দেওয়া
        if (user.email === ADMIN_EMAIL) {
            localStorage.setItem('userRole', 'owner');
            localStorage.setItem('activeShopId', user.uid);
            localStorage.setItem('isStaff', 'false');
            return false;
        }
        
        // ইমেইল থেকে ডট সরিয়ে mapping ID তৈরি করা
        const mappingId = user.email.replace(/\./g, '_');
        const staffMappingRef = doc(db, 'staff_mapping', mappingId);
        const staffMappingDoc = await getDoc(staffMappingRef);

        if (staffMappingDoc.exists()) {
            // এই ইউজার একজন স্টাফ
            const staffData = staffMappingDoc.data();
            console.log('User is a staff member:', staffData);

            // localStorage-এ স্টাফ তথ্য সেভ করা (মালিকের দোকানের আইডি)
            localStorage.setItem('userRole', staffData.role);
            localStorage.setItem('activeShopId', staffData.shopId); // মালিকের আইডি
            localStorage.setItem('isStaff', 'true');

            return true; // স্টাফ
        } else {
            // এই ইউজার মালিক (Owner)
            console.log('User is an owner');
            localStorage.setItem('userRole', 'owner');
            localStorage.setItem('activeShopId', user.uid); // নিজের আইডি
            localStorage.setItem('isStaff', 'false');

            return false; // মালিক
        }
    } catch (error) {
        console.error('Error checking staff status:', error);
        // ডিফল্ট হিসেবে মালিক ধরে নেওয়া
        localStorage.setItem('userRole', 'owner');
        localStorage.setItem('activeShopId', user.uid);
        localStorage.setItem('isStaff', 'false');
        return false;
    }
}
