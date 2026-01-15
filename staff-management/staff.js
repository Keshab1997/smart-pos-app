import { db, auth, doc, setDoc, collection, deleteDoc, onSnapshot, getDoc } from '../js/firebase-config.js';
import { onAuthStateChanged } from "firebase/auth";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase Config Import করা
const firebaseConfig = {
  apiKey: "AIzaSyB1fmVLCxyq8kQRULji0j7T-8c5De3X_Gk", 
  authDomain: "smart-pos-app-64ad6.firebaseapp.com",
  projectId: "smart-pos-app-64ad6",
  storageBucket: "smart-pos-app-64ad6.appspot.com",
  messagingSenderId: "808538508236",
  appId: "1:808538508236:web:c8820699c7e880a6362b69",
  measurementId: "G-K18V45KTN3"
};

const IMGBB_API_KEY = '13567a95e9fe3a212a8d8d10da9f3267';

// সেকেন্ডারি অ্যাপ তৈরি (মালিক লগআউট হবে না)
const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

// ছবি কম্প্রেস করার ফাংশন
async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 300;
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.6);
            };
        };
    });
}

// ImgBB-তে আপলোড করার ফাংশন
async function uploadToImgBB(blob) {
    const formData = new FormData();
    formData.append('image', blob);
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData
    });
    const data = await response.json();
    return data.success ? data.data.url : null;
}

// প্রিভিউ লজিক
document.getElementById('staff-photo').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ex) => {
            document.getElementById('photo-preview').src = ex.target.result;
            document.getElementById('photo-preview-container').style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }
});

let currentOwnerId = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentOwnerId = user.uid;
        loadStaffList();
    } else {
        window.location.href = '../index.html';
    }
});

// স্টাফ অ্যাড করা (ইমেইল/পাসওয়ার্ড দিয়ে)
document.getElementById('add-staff-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading & Saving...";
    
    const name = document.getElementById('staff-name').value.trim();
    const email = document.getElementById('staff-email').value.trim().toLowerCase();
    const password = document.getElementById('staff-password').value;
    const role = document.getElementById('staff-role').value;
    const photoFile = document.getElementById('staff-photo').files[0];

    if (!currentOwnerId) return;

    try {
        let photoUrl = "https://cdn-icons-png.flaticon.com/512/149/149071.png";

        if (photoFile) {
            const compressedBlob = await compressImage(photoFile);
            photoUrl = await uploadToImgBB(compressedBlob);
        }

        // ১. Firebase Authentication-এ স্টাফ তৈরি করা (মালিক লগআউট হবে না)
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const staffUid = userCredential.user.uid;

        // ২. মালিকের দোকানের সাব-কালেকশনে সেভ করা
        const staffRef = doc(db, 'shops', currentOwnerId, 'staffs', email);
        await setDoc(staffRef, {
            uid: staffUid,
            name,
            email,
            role,
            photoUrl,
            addedAt: new Date().toISOString()
        });

        // ৩. গ্লোবাল স্টাফ ম্যাপিংয়ে সেভ করা
        const mappingId = email.replace(/\./g, '_'); 
        await setDoc(doc(db, 'staff_mapping', mappingId), {
            shopId: currentOwnerId,
            role: role,
            uid: staffUid,
            photoUrl: photoUrl
        });

        alert("Staff registered with photo!");
        location.reload();
    } catch (error) {
        console.error("Error adding staff:", error);
        alert("Error: " + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = "Add Staff";
    }
});

// স্টাফ লিস্ট লোড করা
function loadStaffList() {
    const staffTableBody = document.getElementById('staff-table-body');
    const staffRef = collection(db, 'shops', currentOwnerId, 'staffs');

    onSnapshot(staffRef, (snapshot) => {
        staffTableBody.innerHTML = '';
        if (snapshot.empty) {
            staffTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">No staff added yet.</td></tr>';
            return;
        }

        snapshot.forEach(docSnap => {
            const staff = docSnap.data();
            const photo = staff.photoUrl || "https://cdn-icons-png.flaticon.com/512/149/149071.png";
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img src="${photo}" class="staff-img-circle" alt="${staff.name}">
                        <span style="font-weight: 600; color: #333;">${staff.name}</span>
                    </div>
                </td>
                <td style="color: #666; font-size: 13px;">${staff.email}</td>
                <td><span class="role-badge role-${staff.role}">${staff.role}</span></td>
                <td style="text-align: center;">
                    <button class="btn-remove" onclick="removeStaff('${staff.email}')">Remove</button>
                </td>
            `;
            staffTableBody.appendChild(tr);
        });
    });
}

// স্টাফ রিমুভ করা
window.removeStaff = async (email) => {
    if (confirm(`Are you sure you want to remove ${email}?`)) {
        try {
            // ১. দোকান থেকে ডিলিট
            await deleteDoc(doc(db, 'shops', currentOwnerId, 'staffs', email));
            
            // ২. ম্যাপিং থেকে ডিলিট
            const mappingId = email.replace(/\./g, '_');
            await deleteDoc(doc(db, 'staff_mapping', mappingId));
            
            alert("Staff removed.");
        } catch (error) {
            alert("Error removing staff.");
        }
    }
};
