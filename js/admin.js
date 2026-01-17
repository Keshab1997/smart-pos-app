// js/admin.js
import { db, auth, collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, addDoc, query, orderBy, serverTimestamp, onSnapshot } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const ADMIN_EMAIL = "keshabsarkar2018@gmail.com";
let selectedShopId = null;
let selectedShopData = null;
let selectedStaffEmail = null;

onAuthStateChanged(auth, (user) => {
    // শুধুমাত্র admin.html পেজেই এই লজিক কাজ করবে
    const adminInfo = document.getElementById('admin-info');
    
    if (user && user.email === ADMIN_EMAIL) {
        if (adminInfo) {
            adminInfo.textContent = `Logged in as: ${user.email}`;
            loadAllUsers();
            setupEventListeners();
        }
    } else {
        // যদি কেউ সরাসরি admin.html এ ঢোকার চেষ্টা করে কিন্তু সে অ্যাডমিন না হয়
        if (window.location.pathname.includes('admin.html')) {
            alert("Access Denied! Admin privileges required.");
            window.location.href = 'dashboard.html';
        }
    }
});

function setupEventListeners() {
    document.getElementById('btn-authorize-user').addEventListener('click', authorizeNewUser);
    document.getElementById('btn-toggle-status').addEventListener('click', toggleStatus);
    document.getElementById('btn-single-backup').addEventListener('click', () => backupSingleUser(selectedShopId, selectedShopData.shopName));
    document.getElementById('btn-single-restore').addEventListener('click', () => document.getElementById('file-restore-json').click());
    document.getElementById('btn-single-reset').addEventListener('click', resetData);
    document.getElementById('btn-reset-pin').addEventListener('click', resetMasterPin);
    document.getElementById('btn-admin-update-role').addEventListener('click', updateRoleFromAdmin);
    document.getElementById('btn-post-announcement').addEventListener('click', postAnnouncement);
    document.getElementById('btn-edit-announcement').addEventListener('click', editAnnouncement);
    document.getElementById('btn-delete-announcement').addEventListener('click', deleteAnnouncement);
    document.getElementById('file-restore-json').addEventListener('change', handleRestore);
    
    loadCurrentAnnouncement();
    loadFeedbacks();
}

function loadAllUsers() {
    const listContainer = document.getElementById('user-list');
    const shopsRef = collection(db, 'shops');
    
    // Real-time listener using onSnapshot
    onSnapshot(shopsRef, (snapshot) => {
        listContainer.innerHTML = '';
        
        if (snapshot.empty) {
            listContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">No shops registered yet.</p>';
            return;
        }

        snapshot.forEach(docSnap => {
            const d = docSnap.data();
            const status = d.status || 'active';
            const statusIcon = status === 'active' ? '🟢' : '🔴';
            
            const div = document.createElement('div');
            div.className = 'user-item';
            // Maintain selection highlight if this shop is currently selected
            if (selectedShopId === docSnap.id) div.classList.add('active-selection');

            div.innerHTML = `
                <strong>${d.shopName || 'Unnamed Shop'} ${statusIcon}</strong><br>
                <small>${d.contactEmail || 'No Email'}</small><br>
                <small style="color: ${status === 'active' ? '#28a745' : '#dc3545'};">Status: ${status}</small>
            `;
            
            div.onclick = () => selectUser(docSnap.id, d, div);
            listContainer.appendChild(div);
        });
    }, (error) => {
        console.error("Error loading shops:", error);
        listContainer.innerHTML = '<p style="color:red;">Error loading shops. Check console.</p>';
    });
}

function selectUser(shopId, data, element) {
    selectedShopId = shopId;
    selectedShopData = data;
    selectedStaffEmail = null;

    // UI Update
    document.querySelectorAll('.user-item').forEach(el => el.classList.remove('active-selection'));
    element.classList.add('active-selection');
    
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('user-details').classList.remove('hidden');
    
    document.getElementById('selected-shop-name').textContent = data.shopName;
    document.getElementById('selected-shop-email').textContent = data.contactEmail || data.email;
    
    const statusBtn = document.getElementById('btn-toggle-status');
    const currentStatus = data.status || 'active';
    statusBtn.textContent = `Status: ${currentStatus.toUpperCase()} (Click to Toggle)`;
    statusBtn.style.background = currentStatus === 'active' ? '#28a745' : '#dc3545';
    statusBtn.style.color = 'white';
    
    loadShopStaff(shopId);
}

// --- Actions ---
async function authorizeNewUser() {
    const email = document.getElementById('new-user-email').value.trim().toLowerCase();
    const shopName = document.getElementById('new-shop-name').value.trim();

    if (!email || !shopName) {
        alert("Please enter both email and shop name.");
        return;
    }

    try {
        const authRef = doc(db, 'authorized_users', email.replace(/\./g, '_'));
        await setDoc(authRef, {
            email: email,
            shopName: shopName,
            authorizedBy: auth.currentUser.email,
            createdAt: serverTimestamp()
        });

        alert(`✅ Success! ${email} can now access the app.`);
        document.getElementById('new-user-email').value = '';
        document.getElementById('new-shop-name').value = '';
    } catch (e) {
        alert("Error: " + e.message);
    }
}

async function toggleStatus() {
    if (!selectedShopId) return;
    const currentStatus = selectedShopData.status || 'active';
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    
    const confirmMsg = newStatus === 'inactive' 
        ? `⚠️ WARNING: Are you sure you want to DEACTIVATE "${selectedShopData.shopName}"? \n\nThe user will be kicked out and won't be able to login!` 
        : `Do you want to ACTIVATE "${selectedShopData.shopName}" again?`;

    if (confirm(confirmMsg)) {
        try {
            await updateDoc(doc(db, 'shops', selectedShopId), { status: newStatus });
            selectedShopData.status = newStatus;
            alert(`Success: Shop is now ${newStatus}.`);
        } catch (e) {
            alert("Error updating status: " + e.message);
        }
    }
}

async function resetData() {
    if (!selectedShopId) return;
    const confirm1 = confirm(`🛑 CRITICAL WARNING: You are about to delete ALL Sales and Expense records for "${selectedShopData.shopName}". \n\nThis action CANNOT be undone. Do you want to proceed?`);
    
    if (confirm1) {
        const confirm2 = confirm(`Are you REALLY sure? Last chance to cancel!`);
        if (confirm2) {
            try {
                const collections = ['sales', 'expenses'];
                for (const col of collections) {
                    const snap = await getDocs(collection(db, 'shops', selectedShopId, col));
                    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'shops', selectedShopId, col, d.id))));
                }
                alert("✅ All sales and expenses have been permanently deleted.");
            } catch (e) {
                alert("Reset failed: " + e.message);
            }
        }
    }
}

async function resetMasterPin() {
    if (!selectedShopId) return alert('⚠️ Please select a shop first!');
    
    const newPin = prompt(`Enter new Master PIN for "${selectedShopData.shopName}" (Minimum 4 digits):`);
    
    if (newPin && newPin.length >= 4) {
        try {
            const pinRef = doc(db, 'shops', selectedShopId, 'settings', 'security');
            await setDoc(pinRef, { master_pin: newPin }, { merge: true });
            alert("✅ Master PIN reset successfully!");
        } catch (e) {
            alert("❌ Error resetting PIN: " + e.message);
        }
    } else if (newPin !== null) {
        alert("❌ Invalid PIN! Must be at least 4 digits.");
    }
}

function editAnnouncement() {
    const currentMsg = document.getElementById('display-current-msg').textContent;
    const textarea = document.getElementById('announcement-text');
    textarea.value = currentMsg;
    textarea.focus();
    textarea.scrollIntoView({ behavior: 'smooth' });
}

async function loadFeedbacks() {
    const feedbackList = document.getElementById('feedback-list');
    try {
        const snap = await getDocs(query(collection(db, 'support_tickets'), orderBy('createdAt', 'desc')));
        feedbackList.innerHTML = '';
        
        if (snap.empty) {
            feedbackList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No feedbacks found.</p>';
            return;
        }
        
        snap.forEach(docSnap => {
            const d = docSnap.data();
            const date = d.createdAt ? d.createdAt.toDate().toLocaleString() : 'N/A';
            const div = document.createElement('div');
            div.className = 'user-item';
            div.style.cursor = 'default';
            div.style.marginBottom = '10px';
            div.innerHTML = `
                <strong>👤 ${d.shopName}</strong> <small style="color: #999;">(${date})</small><br>
                <p style="margin: 8px 0; color: #444; background: #f9f9f9; padding: 8px; border-radius: 4px;">${d.message}</p>
                <small style="color: #666;">📧 ${d.email}</small>
            `;
            feedbackList.appendChild(div);
        });
    } catch (e) { 
        console.error('Error loading feedbacks:', e);
        feedbackList.innerHTML = '<p style="color: red;">Error loading feedbacks.</p>';
    }
}

async function loadCurrentAnnouncement() {
    try {
        const snap = await getDoc(doc(db, 'settings', 'announcement'));
        const box = document.getElementById('current-announcement-box');
        const msgDisplay = document.getElementById('display-current-msg');

        if (snap.exists() && snap.data().active) {
            box.classList.remove('hidden');
            msgDisplay.textContent = snap.data().message;
        } else {
            box.classList.add('hidden');
        }
    } catch (e) { 
        console.error('Error loading announcement:', e); 
    }
}

async function deleteAnnouncement() {
    if (confirm("আপনি কি নিশ্চিত বর্তমান অ্যানাউন্সমেন্ট ডিলিট করতে চান?")) {
        try {
            await updateDoc(doc(db, 'settings', 'announcement'), {
                active: false,
                message: "",
                updatedAt: new Date().toISOString()
            });
            alert("✅ Announcement deleted successfully!");
            loadCurrentAnnouncement();
        } catch (e) { 
            alert("❌ Error: " + e.message); 
        }
    }
}

async function postAnnouncement() {
    const msg = document.getElementById('announcement-text').value;
    const action = msg.trim() === "" ? "REMOVE the current announcement" : "PUBLISH this announcement to ALL users";

    if (confirm(`Do you want to ${action}?`)) {
        try {
            await setDoc(doc(db, 'settings', 'announcement'), {
                message: msg,
                active: msg.trim() !== "",
                updatedAt: new Date().toISOString()
            });
            alert("✅ Announcement updated successfully!");
            document.getElementById('announcement-text').value = '';
            loadCurrentAnnouncement();
        } catch (e) {
            alert("Failed to post announcement: " + e.message);
        }
    }
}

async function backupSingleUser(shopId, shopName) {
    if (!shopId) return;
    try {
        const shopDocRef = doc(db, 'shops', shopId);
        const shopSnap = await getDoc(shopDocRef);
        const shopData = shopSnap.exists() ? shopSnap.data() : {};
        
        const [salesSnap, expSnap, invSnap] = await Promise.all([
            getDocs(collection(db, 'shops', shopId, 'sales')),
            getDocs(collection(db, 'shops', shopId, 'expenses')),
            getDocs(collection(db, 'shops', shopId, 'inventory'))
        ]);

        const userData = {
            backupDate: new Date().toISOString(),
            shopId: shopId,
            shopName: shopName,
            info: shopData,
            sales: salesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
            expenses: expSnap.docs.map(d => ({ id: d.id, ...d.data() })),
            inventory: invSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        };

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userData));
        const dlAnchor = document.createElement('a');
        dlAnchor.setAttribute("href", dataStr);
        dlAnchor.setAttribute("download", `${shopName}_Backup_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(dlAnchor);
        dlAnchor.click();
        dlAnchor.remove();
        alert(`Backup completed for ${shopName}!`);
    } catch (e) {
        alert("Backup failed: " + e.message);
    }
}

async function handleRestore(event) {
    const file = event.target.files[0];
    if (!file || !selectedShopId) return;
    
    if (confirm(`⚠️ FINAL WARNING: Restoring from file will OVERWRITE all current data for "${selectedShopData.shopName}". \n\nDo you have a backup? Click OK to start restore.`)) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = JSON.parse(e.target.result);
                
                // Restore shop info
                if (data.info) {
                    await setDoc(doc(db, 'shops', selectedShopId), data.info);
                }
                
                // Restore collections
                const collections = ['sales', 'expenses', 'inventory'];
                for (const colName of collections) {
                    if (data[colName]) {
                        for (const item of data[colName]) {
                            const { id, ...itemData } = item;
                            await setDoc(doc(db, 'shops', selectedShopId, colName, id), itemData);
                        }
                    }
                }
                
                alert("Restore completed successfully!");
                loadAllUsers();
            } catch (err) {
                alert("Restore failed: " + err.message);
            }
        };
        reader.readAsText(file);
    }
    event.target.value = '';
}

async function loadShopStaff(shopId) {
    const staffListDiv = document.getElementById('admin-staff-list');
    staffListDiv.innerHTML = 'Loading staff...';
    
    try {
        const staffSnap = await getDocs(collection(db, 'shops', shopId, 'staffs'));
        staffListDiv.innerHTML = '';
        
        if (staffSnap.empty) {
            staffListDiv.innerHTML = '<p style="padding:10px; color:#666;">No staff found for this shop.</p>';
            return;
        }

        staffSnap.forEach(docSnap => {
            const staff = docSnap.data();
            const div = document.createElement('div');
            div.style = "padding: 10px; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center;";
            
            div.innerHTML = `
                <div onclick="selectStaffForUpdate('${staff.email}', '${staff.role}', this)" style="cursor: pointer; flex: 1;">
                    <strong>${staff.name}</strong> <small>(${staff.role})</small><br>
                    <small>${staff.email}</small>
                </div>
                <button class="btn-red" onclick="removeStaffFromAdmin('${shopId}', '${staff.email}')"
                    style="width: auto; padding: 5px 10px; font-size: 11px; margin-top: 0;">
                    Remove
                </button>
            `;
            staffListDiv.appendChild(div);
        });
    } catch (e) {
        staffListDiv.innerHTML = 'Error loading staff.';
    }
}

window.selectStaffForUpdate = (email, role, element) => {
    selectedStaffEmail = email;
    document.getElementById('admin-role-select').value = role;
    const staffListDiv = document.getElementById('admin-staff-list');
    Array.from(staffListDiv.children).forEach(c => c.style.background = 'none');
    element.parentElement.style.background = '#e3f2fd';
};

async function removeStaffFromAdmin(shopId, email) {
    if (confirm(`⚠️ Are you sure you want to REMOVE staff "${email}" from this shop? \n\nThey will lose all access immediately.`)) {
        try {
            await deleteDoc(doc(db, 'shops', shopId, 'staffs', email));
            const mappingId = email.replace(/\./g, '_');
            await deleteDoc(doc(db, 'staff_mapping', mappingId));
            alert("✅ Staff removed successfully!");
            loadShopStaff(shopId);
        } catch (e) {
            alert("Error removing staff: " + e.message);
        }
    }
}

window.removeStaffFromAdmin = removeStaffFromAdmin;

async function updateRoleFromAdmin() {
    if (!selectedShopId || !selectedStaffEmail) {
        alert("Please select a shop and then a staff member first.");
        return;
    }

    const newRole = document.getElementById('admin-role-select').value;
    
    if (confirm(`Change role of ${selectedStaffEmail} to ${newRole.toUpperCase()}?`)) {
        try {
            await updateDoc(doc(db, 'shops', selectedShopId, 'staffs', selectedStaffEmail), {
                role: newRole
            });

            const mappingId = selectedStaffEmail.replace(/\./g, '_');
            await updateDoc(doc(db, 'staff_mapping', mappingId), {
                role: newRole
            });

            alert("✅ Role updated successfully!");
            loadShopStaff(selectedShopId);
        } catch (e) {
            alert("Error updating role: " + e.message);
        }
    }
}