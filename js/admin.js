// js/admin.js
import { db, auth, collection, doc, getDocs, setDoc } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const ADMIN_EMAIL = "keshabsarkar2018@gmail.com";

// ১. অথেনটিকেশন চেক এবং বাটন শো করা
onAuthStateChanged(auth, (user) => {
    if (user && user.email === ADMIN_EMAIL) {
        initAdminPanel();
    }
});

function initAdminPanel() {
    // Navbar এর বাটনটি খুঁজে বের করা এবং শো করা
    const adminBtn = document.getElementById('nav-item-admin');
    if (adminBtn) {
        adminBtn.style.display = 'block'; // বাটন দৃশ্যমান করা
        
        // বাটনে ক্লিক করলে মডাল ওপেন হবে
        adminBtn.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            document.getElementById('admin-modal').style.display = 'flex';
        });
    }

    // মডাল ক্লোজ বাটন
    const closeBtn = document.getElementById('close-admin-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('admin-modal').style.display = 'none';
        });
    }

    // ব্যাকআপ এবং রিস্টোর ইভেন্ট লিসেনার
    const btnBackup = document.getElementById('btn-backup-now');
    const fileInput = document.getElementById('file-restore-json');
    const btnUsers = document.getElementById('btn-load-users');

    if (btnBackup) btnBackup.addEventListener('click', performFullBackup);
    if (fileInput) fileInput.addEventListener('change', handleRestoreFile);
    if (btnUsers) btnUsers.addEventListener('click', loadAllUsers);
}

// --- ২. ব্যাকআপ ফাংশন ---
async function performFullBackup() {
    const progressEl = document.getElementById('backup-progress');
    progressEl.textContent = "⏳ Starting backup...";

    try {
        const fullData = { backupDate: new Date().toISOString(), shops: {} };
        const shopsSnapshot = await getDocs(collection(db, 'shops'));
        const totalShops = shopsSnapshot.size;
        let processedCount = 0;

        progressEl.textContent = `⏳ Found ${totalShops} users...`;

        for (const shopDoc of shopsSnapshot.docs) {
            const shopId = shopDoc.id;
            processedCount++;
            progressEl.textContent = `⏳ Processing ${processedCount}/${totalShops}...`;

            fullData.shops[shopId] = {
                info: shopDoc.data(),
                sales: [], expenses: [], inventory: []
            };

            const [salesSnap, expSnap, invSnap] = await Promise.all([
                getDocs(collection(db, 'shops', shopId, 'sales')),
                getDocs(collection(db, 'shops', shopId, 'expenses')),
                getDocs(collection(db, 'shops', shopId, 'inventory'))
            ]);

            salesSnap.forEach(doc => fullData.shops[shopId].sales.push({ id: doc.id, ...doc.data() }));
            expSnap.forEach(doc => fullData.shops[shopId].expenses.push({ id: doc.id, ...doc.data() }));
            invSnap.forEach(doc => fullData.shops[shopId].inventory.push({ id: doc.id, ...doc.data() }));
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullData));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", `SmartPOS_Backup_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(dlAnchorElem);
        dlAnchorElem.click();
        dlAnchorElem.remove();

        progressEl.innerHTML = `<span style="color:green;">✅ Done!</span>`;
    } catch (error) {
        console.error(error);
        progressEl.innerHTML = `<span style="color:red;">❌ Error: ${error.message}</span>`;
    }
}

// --- ৩. রিস্টোর ফাংশন ---
async function handleRestoreFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm("⚠️ WARNING: This will OVERWRITE ALL DATA! Continue?")) return;

    const reader = new FileReader();
    const progressEl = document.getElementById('backup-progress');
    progressEl.textContent = "⏳ Restoring...";

    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            for (const shopId in data.shops) {
                const shop = data.shops[shopId];
                await setDoc(doc(db, 'shops', shopId), shop.info);
                
                for (const s of shop.sales) await setDoc(doc(db, 'shops', shopId, 'sales', s.id), s);
                for (const ex of shop.expenses) await setDoc(doc(db, 'shops', shopId, 'expenses', ex.id), ex);
                for (const i of shop.inventory) await setDoc(doc(db, 'shops', shopId, 'inventory', i.id), i);
            }
            alert("Restore Successful!");
            window.location.reload();
        } catch (err) {
            alert("Restore Failed: " + err.message);
        }
    };
    reader.readAsText(file);
}

// --- ৪. ইউজার লিস্ট ---
async function loadAllUsers() {
    const container = document.getElementById('user-list-container');
    container.innerHTML = 'Loading...';
    try {
        const snap = await getDocs(collection(db, 'shops'));
        let html = '<table style="width:100%; font-size:11px;">';
        snap.forEach(doc => {
            const d = doc.data();
            html += `<tr><td style="border-bottom:1px solid #eee;"><b>${d.shopName}</b><br>${d.contactEmail || d.email}</td></tr>`;
        });
        html += '</table>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = 'Error.';
    }
}