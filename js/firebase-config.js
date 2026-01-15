// js/firebase-config.js (আপডেট করা সংস্করণ)

// Firebase SDK থেকে প্রয়োজনীয় মডিউল ইম্পোর্ট করা হচ্ছে
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

// Firestore থেকে আপনার প্রোজেক্টের জন্য প্রয়োজনীয় সব ফাংশন ইম্পোর্ট করা হচ্ছে
import { 
    getFirestore, 
    collection, 
    doc, 
    writeBatch,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    startAt,
    endAt,
    limit,
    serverTimestamp,
    increment,
    onSnapshot,
    deleteDoc,
    updateDoc,
    addDoc,
    setDoc,
    Timestamp,
    runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// আপনার ওয়েব অ্যাপের Firebase কনফিগারেশন
const firebaseConfig = {
  // ⚠️ নিরাপত্তা সতর্কতা: আপনার Firebase API কী পাবলিকলি দেখা যাচ্ছে।
  // প্রোডাকশনে যাওয়ার আগে Firebase কনসোল থেকে একটি নতুন কী জেনারেট করে এটি পরিবর্তন করুন 
  // এবং পুরনো কী-টি ডিলিট করে দিন।
  apiKey: "AIzaSyB1fmVLCxyq8kQRULji0j7T-8c5De3X_Gk", 
  authDomain: "smart-pos-app-64ad6.firebaseapp.com",
  projectId: "smart-pos-app-64ad6",
  storageBucket: "smart-pos-app-64ad6.appspot.com",
  messagingSenderId: "808538508236",
  appId: "1:808538508236:web:c8820699c7e880a6362b69",
  measurementId: "G-K18V45KTN3"
};

// Firebase অ্যাপটি ইনিশিয়ালাইজ করা হচ্ছে
const app = initializeApp(firebaseConfig);

// আমাদের প্রয়োজনীয় Firebase সার্ভিসগুলো ইনিশিয়ালাইজ করা হচ্ছে
const db = getFirestore(app);
const auth = getAuth(app);

// অন্য জাভাস্ক্রিপ্ট ফাইল থেকে ব্যবহারের জন্য সার্ভিস এবং ফাংশনগুলো এক্সপোর্ট করা হচ্ছে
export { 
    app,
    firebaseConfig,
    db, 
    auth, 
    collection, 
    doc, 
    writeBatch,
    getDocs,
    getDoc,
    query,
    where,
    orderBy,
    startAt,
    endAt,
    limit,
    serverTimestamp,
    increment,
    onSnapshot,
    deleteDoc,
    updateDoc,
    addDoc,
    setDoc,
    Timestamp,
    runTransaction
};