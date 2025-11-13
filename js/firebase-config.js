// js/firebase-config.js

// Firebase SDK থেকে প্রয়োজনীয় মডিউল ইম্পোর্ট করা হচ্ছে
// আমরা Firestore (ডেটাবেজ) এবং Auth (লগইন) ব্যবহার করব, তাই সেগুলো ইম্পোর্ট করছি।
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"; // সর্বশেষ স্থিতিশীল সংস্করণ ব্যবহার করা ভালো
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// আপনার ওয়েব অ্যাপের Firebase কনফিগারেশন (আপনার দেওয়া কোড থেকে নেওয়া)
const firebaseConfig = {
  apiKey: "AIzaSyB1fmVLCxyq8kQRULji0j7T-8c5De3X_Gk",
  authDomain: "smart-pos-app-64ad6.firebaseapp.com",
  projectId: "smart-pos-app-64ad6",
  storageBucket: "smart-pos-app-64ad6.appspot.com", // আপনার দেওয়া storageBucket-এ .firebasestorage ছিল, যা সাধারণত .appspot.com হয়। দুটোই কাজ করতে পারে, তবে এটি বেশি প্রচলিত।
  messagingSenderId: "808538508236",
  appId: "1:808538508236:web:c8820699c7e880a6362b69",
  measurementId: "G-K18V45KTN3"
};

// Firebase অ্যাপটি ইনিশিয়ালাইজ করা হচ্ছে
const app = initializeApp(firebaseConfig);

// আমাদের প্রয়োজনীয় Firebase সার্ভিসগুলো ইনিশিয়ালাইজ করা হচ্ছে
const db = getFirestore(app); // Firestore ডেটাবেস ব্যবহারের জন্য
const auth = getAuth(app);    // Authentication (লগইন/সাইনআপ) ব্যবহারের জন্য

// অন্য জাভাস্ক্রিপ্ট ফাইল থেকে ব্যবহারের জন্য সার্ভিসগুলো এক্সপোর্ট করা হচ্ছে
export { db, auth };