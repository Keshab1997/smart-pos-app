// js/auth.js

// Firebase Auth থেকে প্রয়োজনীয় ফাংশন ইম্পোর্ট করা
import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firestore থেকে প্রয়োজনীয় ফাংশন ইম্পোর্ট করা (ইউজারের ডেটা সেভ করার জন্য)
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
const loginStatus = document.getElementById('login-status');

// ১. পেজ লোড হওয়ার সাথে সাথেই ইউজারের অবস্থা চেক করা
onAuthStateChanged(auth, (user) => {
    if (user) {
        // যদি ইউজার অলরেডি লগইন করা থাকে, তাকে ড্যাশবোর্ডে পাঠিয়ে দিন
        console.log('User is already logged in, redirecting to dashboard...');
        loginStatus.textContent = 'Redirecting to dashboard...';
        window.location.href = 'dashboard.html';
    } else {
        // ইউজার লগইন করা নেই, তাই বাটনটি সক্রিয় থাকবে
        googleLoginBtn.disabled = false;
        console.log('No user is logged in. Please sign in.');
    }
});

// ২. লগইন বাটনে ক্লিক ইভেন্ট যোগ করা
googleLoginBtn.addEventListener('click', async () => {
    googleLoginBtn.disabled = true; // ডাবল ক্লিক এড়ানোর জন্য বাটন নিষ্ক্রিয় করা
    loginStatus.textContent = 'Authenticating with Google...';

    const provider = new GoogleAuthProvider(); 

    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        console.log('Successfully authenticated!', user);
        loginStatus.textContent = 'Authentication successful! Setting up your account...';

        // নতুন ইউজার হলে তার জন্য Firestore-এ একটি ডকুমেন্ট তৈরি করা
        await createUserProfile(user);

        // সফলভাবে লগইন এবং প্রোফাইল সেটআপ হলে dashboard.html পেজে রিডাইরেক্ট করুন
        window.location.href = 'dashboard.html';

    } catch (error) {
        console.error('Google login error:', error.code, error.message);
        loginStatus.textContent = `Login failed: ${error.message}`;
        googleLoginBtn.disabled = false; // লগইন ব্যর্থ হলে বাটন আবার সক্রিয় করা
    }
});

// ৩. Firestore-এ ইউজারের প্রোফাইল তৈরি বা চেক করার ফাংশন
async function createUserProfile(user) {
    // ইউজারের uid দিয়ে একটি ডকুমেন্ট রেফারেন্স তৈরি করা
    const userDocRef = doc(db, 'users', user.uid);
    const shopDocRef = doc(db, 'shops', user.uid);

    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
        // যদি ইউজারের ডকুমেন্ট আগে থেকে না থাকে, তাহলে নতুন ডকুমেন্ট তৈরি করুন
        console.log('Creating new user profile in Firestore...');
        try {
            // 'users' কালেকশনে বেসিক তথ্য সেভ করা
            await setDoc(userDocRef, {
                uid: user.uid,
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp()
            });

            // 'shops' কালেকশনে ডিফল্ট শপের তথ্য সেভ করা
            await setDoc(shopDocRef, {
                shopName: `${user.displayName}'s Shop`,
                ownerName: user.displayName,
                contactEmail: user.email,
                address: 'Not set',
                createdAt: serverTimestamp()
            });

            console.log('User profile and shop created successfully.');

        } catch (e) {
            console.error("Error creating user profile: ", e);
        }
    } else {
        // যদি ইউজার আগে থেকেই থাকে, তাহলে শুধু lastLogin টাইম আপডেট করুন
        console.log('User already exists. Updating last login time.');
        await setDoc(userDocRef, { lastLogin: serverTimestamp() }, { merge: true });
    }
}