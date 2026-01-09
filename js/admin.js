// js/admin.js
import { db, auth, collection, doc, getDocs, getDoc, setDoc, updateDoc, deleteDoc } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const ADMIN_EMAIL = "keshabsarkar2018@gmail.com";
let selectedShopId = null;
let selectedShopData = null;

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
    document.getElementById('btn-toggle-status').addEventListener('click', toggleStatus);
    document.getElementById('btn-single-backup').addEventListener('click', () => backupSingleUser(selectedShopId, selectedShopData.shopName));
    document.getElementById('btn-single-restore').addEventListener('click', () => document.getElementById('file-restore-json').click());
    document.getElementById('btn-single-reset').addEventListener('click', resetData);
    document.getElementById('btn-post-announcement').addEventListener('click', postAnnouncement);
    document.getElementById('file-restore-json').addEventListener('change', handleRestore);
}

async function loadAllUsers() {
    const listContainer = document.getElementById('user-list');
    try {
        const snap = await getDocs(collection(db, 'shops'));
        listContainer.innerHTML = '';
        snap.forEach(docSnap => {
            const d = docSnap.data();
            const status = d.status || 'active';
            const statusIcon = status === 'active' ? '🟢' : '🔴';
            
            const div = document.createElement('div');
            div.className = 'user-item';
            div.innerHTML = `
                <strong>${d.shopName} ${statusIcon}</strong><br>
                <small>${d.contactEmail || d.email}</small><br>
                <small style="color: ${status === 'active' ? '#28a745' : '#dc3545'};">Status: ${status}</small>
            `;
            div.onclick = () => selectUser(docSnap.id, d, div);
            listContainer.appendChild(div);
        });
    } catch (e) { 
        listContainer.innerHTML = 'Error loading users.'; 
    }
}

function selectUser(shopId, data, element) {
    selectedShopId = shopId;
    selectedShopData = data;

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
}

// --- Actions ---
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
            selectUser(selectedShopId, selectedShopData, document.querySelector('.active-selection'));
            loadAllUsers(); // Refresh list to show new status
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