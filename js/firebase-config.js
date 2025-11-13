// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  // ======================================================
  // YOUR FIREBASE CONFIG OBJECT HERE
  // Example:
  // apiKey: "AIza....",
  // authDomain: "your-project.firebaseapp.com",
  // projectId: "your-project-id",
  // storageBucket: "your-project.appspot.com",
  // messagingSenderId: "...",
  // appId: "1:..."
  // ======================================================
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export firestore instance to be used in other files
export const db = getFirestore(app);