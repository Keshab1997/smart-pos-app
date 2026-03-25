import {
    db,
    auth,
    collection,
    doc,
    getDoc,
    Timestamp,
    runTransaction
} from '../js/firebase-config.js';

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ImgBB API Configuration
const IMGBB_API_KEY = '13567a95e9fe3a212a8d8d10da9f3267'; 

let html5QrCode;
let currentBarcodeTarget = null;

const playScanSound = () => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
        console.error("Sound play failed:", e);
    }
}; 

document.addEventListener('DOMContentLoaded', () => {
    const addRowBtn = document.getElementById('add-row-btn');
    const productsTbody = document.getElementById('products-tbody');
    const form = document.getElementById('add-products-form');
    const statusMessage = document.getElementById('status-message');
    const barcodePrintArea = document.getElementById('barcode-print-area');
    const barcodesContainer = document.getElementById('barcodes-container');
    const logoutBtn = document.getElementById('logout-btn');

    let activeShopId = null;

    // --- Dynamic Category Loading from Database ---
    async function updateCategoryDatalist() {
        if (!activeShopId) return;
        
        try {
            const inventoryRef = collection(db, 'shops', activeShopId, 'inventory');
            const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
            const querySnapshot = await getDocs(inventoryRef);
            const categories = new Set(["CLOTHING", "JEWELRY"]); // ডিফল্ট ক্যাটাগরি

            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.category) {
                    categories.add(data.category.toUpperCase());
                }
            });

            const datalist = document.getElementById('category-list');
            if (datalist) {
                datalist.innerHTML = '';
                categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat;
                    datalist.appendChild(option);
                });
            }
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    }

    // --- Smart Typing Setup for Each Row ---
    function setupSmartTyping(row) {
        const cpInput = row.querySelector('.product-cp');
        const spInput = row.querySelector('.product-sp');
        const categoryInput = row.querySelector('.product-category');
        const remarkInput = row.querySelector('.product-remark');
        const nameInput = row.querySelector('.product-name');
        const barcodeInput = row.querySelector('.product-barcode');
        const marginInput = document.getElementById('default-margin');

        // --- Product Name Auto-Complete from Database ---
        let searchTimeout;
        if (nameInput && activeShopId) {
            nameInput.addEventListener('input', async function() {
                const searchText = this.value.trim().toLowerCase();
                
                // ২ অক্ষরের কম হলে সার্চ করবে না
                if (searchText.length < 2) return;

                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(async () => {
                    try {
                        const inventoryRef = collection(db, 'shops', activeShopId, 'inventory');
                        const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
                        const querySnapshot = await getDocs(inventoryRef);
                        
                        let foundProduct = null;
                        querySnapshot.forEach((doc) => {
                            const data = doc.data();
                            if (data.name && data.name.toLowerCase().includes(searchText)) {
                                foundProduct = { id: doc.id, ...data };
                                return; // প্রথম ম্যাচ পেলেই থামবে
                            }
                        });

                        if (foundProduct) {
                            // শুধু Name এবং Category অটো-ফিল করা
                            nameInput.value = foundProduct.name;
                            if (categoryInput) categoryInput.value = foundProduct.category || '';
                            
                            // রো হাইলাইট করা
                            row.style.backgroundColor = '#e3f2fd';
                            setTimeout(() => {
                                row.style.backgroundColor = '';
                            }, 2000);
                            
                            showStatus(`✅ "${foundProduct.name}" পাওয়া গেছে! Category অটো-ফিল করা হয়েছে।`, 'success');
                        }
                    } catch (error) {
                        console.error('Product search error:', error);
                    }
                }, 500); // ৫০০ms পর সার্চ করবে (টাইপিং শেষ হওয়ার জন্য অপেক্ষা)
            });
        }

        // CP লিখলে অটোমেটিক SP ক্যালকুলেট হওয়া (শুধুমাত্র যদি SP খালি থাকে বা ইউজার ম্যানুয়াল চেঞ্জ না করে)
        if (cpInput && spInput && marginInput) {
            let spManuallyEdited = false; // ট্র্যাক করবে ইউজার SP ম্যানুয়ালি এডিট করেছে কি না

            // SP ম্যানুয়ালি এডিট করলে ফ্ল্যাগ সেট করা
            spInput.addEventListener('input', function() {
                if (this.value) {
                    spManuallyEdited = true;
                } else {
                    spManuallyEdited = false; // SP খালি করলে আবার অটো ক্যালকুলেশন চালু
                }
            });

            // CP চেঞ্জ হলে SP অটো ক্যালকুলেট (শুধু যদি ম্যানুয়ালি এডিট না করা হয়)
            cpInput.addEventListener('input', function() {
                const cp = parseFloat(this.value) || 0;
                const marginPercent = parseFloat(marginInput.value) || 0;
                
                // শুধুমাত্র তখনই অটো ক্যালকুলেট করবে যখন SP ম্যানুয়ালি এডিট করা হয়নি
                if (cp > 0 && marginPercent >= 0 && !spManuallyEdited) {
                    const calculatedSP = cp + (cp * marginPercent / 100);
                    spInput.value = Math.round(calculatedSP);
                }
            });

            // Margin চেঞ্জ হলেও SP আপডেট (শুধু যদি ম্যানুয়ালি এডিট না করা হয়)
            marginInput.addEventListener('input', function() {
                const cp = parseFloat(cpInput.value) || 0;
                const marginPercent = parseFloat(this.value) || 0;
                
                if (cp > 0 && marginPercent >= 0 && !spManuallyEdited) {
                    const calculatedSP = cp + (cp * marginPercent / 100);
                    spInput.value = Math.round(calculatedSP);
                }
            });
        }

        // ক্যাটাগরি অনুযায়ী স্মার্ট প্লেসহোল্ডার
        if (categoryInput && remarkInput) {
            categoryInput.addEventListener('blur', function() {
                const cat = this.value.toUpperCase();
                
                if (cat === "JEWELRY") {
                    remarkInput.placeholder = "e.g. 22K, 5.5gm";
                } else if (cat === "CLOTHING") {
                    remarkInput.placeholder = "e.g. XL, Cotton";
                } else {
                    remarkInput.placeholder = "Rack No.";
                }
            });

            // ক্যাটাগরি অটো আপারকেস
            categoryInput.addEventListener('blur', function() {
                this.value = this.value.toUpperCase();
            });
        }
    }

    // --- localStorage Auto-Save Functions ---
    function saveTableToLocal() {
        const rows = document.querySelectorAll('#products-tbody tr');
        const data = [];
        
        rows.forEach(row => {
            const name = row.querySelector('.product-name').value;
            const category = row.querySelector('.product-category').value;
            const remark = row.querySelector('.product-remark').value;
            const cp = row.querySelector('.product-cp').value;
            const sp = row.querySelector('.product-sp').value;
            const barcode = row.querySelector('.product-barcode').value;
            const stock = row.querySelector('.product-stock').value;

            // যদি অন্তত নাম বা কস্ট প্রাইস থাকে তবেই সেভ করবে
            if (name || cp || stock) {
                data.push({ name, category, remark, cp, sp, barcode, stock });
            }
        });
        
        if (data.length > 0) {
            localStorage.setItem('temp_product_list', JSON.stringify(data));
        }
    }

    function loadTableFromLocal() {
        const savedData = localStorage.getItem('temp_product_list');
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                if (data.length > 0) {
                    const tbody = document.getElementById('products-tbody');
                    tbody.innerHTML = ''; // ডিফল্ট খালি রো মুছে ফেলা
                    
                    data.forEach(item => {
                        addProductRow();
                        const rows = tbody.querySelectorAll('tr');
                        const lastRow = rows[rows.length - 1];
                        
                        lastRow.querySelector('.product-name').value = item.name || '';
                        lastRow.querySelector('.product-category').value = item.category || '';
                        lastRow.querySelector('.product-remark').value = item.remark || '';
                        lastRow.querySelector('.product-cp').value = item.cp || '';
                        lastRow.querySelector('.product-sp').value = item.sp || '';
                        lastRow.querySelector('.product-barcode').value = item.barcode || '';
                        lastRow.querySelector('.product-stock').value = item.stock || '';
                    });
                    
                    showStatus('✅ আগের সেভ করা ডেটা ফিরিয়ে আনা হয়েছে।', 'success');
                }
            } catch (error) {
                console.error('Error loading saved data:', error);
                localStorage.removeItem('temp_product_list');
            }
        }
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            activeShopId = localStorage.getItem('activeShopId'); if (!activeShopId) { window.location.href = '../index.html'; return; }
            
            // ডাটাবেস থেকে ক্যাটাগরি লোড করা
            updateCategoryDatalist();
            
            // লোকাল স্টোরেজ থেকে ডেটা লোড করা
            loadTableFromLocal();
            
            // যদি কোনো সেভ ডেটা না থাকে তবে একটি খালি রো যোগ করা
            if (productsTbody.children.length === 0) {
                addProductRow();
            }
            setupRemoteScannerListener();
        } else {
            window.location.href = '../index.html';
        }
    });

    function addProductRow() {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td data-label="Product Name"><input type="text" class="product-name" placeholder="e.g., Lux Soap" required></td>
            <td data-label="Category"><input type="text" class="product-category" placeholder="e.g., Cosmetics" list="category-list" required></td>
            <td data-label="Rack/Shelf"><input type="text" class="product-remark" placeholder="Rack No."></td>
            <td data-label="Cost Price"><input type="number" step="0.01" class="product-cp" placeholder="0.00" required></td>
            <td data-label="Selling Price"><input type="number" step="0.01" class="product-sp" placeholder="0.00" required></td>
            <td data-label="Barcode">
                <div class="barcode-wrapper">
                    <input type="text" class="product-barcode" placeholder="Scan or type">
                    <button type="button" class="btn-scan-row" style="background: none; border: none; cursor: pointer; font-size: 18px; padding: 2px 5px;" title="Scan with Camera">📷</button>
                </div>
            </td>
            <td data-label="Initial Stock"><input type="number" class="product-stock" placeholder="0" required></td>
            <td data-label="Image"><input type="file" class="product-image" accept="image/*" style="font-size: 12px; width: 100%;"></td>
            <td data-label="Action">
                <button type="button" class="remove-row-btn" title="Remove Row">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                      <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                    </svg>
                </button>
            </td>
        `;
        productsTbody.appendChild(row);
        setupSmartTyping(row);
    }

    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status ${type}`;
        const time = type === 'error' ? 8000 : 5000;
        setTimeout(() => {
            statusMessage.textContent = '';
            statusMessage.className = 'status';
        }, time);
    }

    async function uploadImageToImgBB(file) {
        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                return data.data.url;
            } else {
                console.error("ImgBB Upload Failed:", data);
                return null;
            }
        } catch (error) {
            console.error("ImgBB Network Error:", error);
            return null;
        }
    }

    function displayBarcodes(products) {
        barcodePrintArea.classList.remove('hidden');
        barcodesContainer.innerHTML = '';
        products.forEach(product => {
            const wrapper = document.createElement('div');
            wrapper.className = 'barcode-item';
            wrapper.innerHTML = `
                <p class="product-name-print">${product.name}</p>
                <svg class="barcode-svg"></svg>
                <p class="product-price-print">Price: ₹${product.sp.toFixed(2)}</p>
            `;
            const svgElement = wrapper.querySelector('.barcode-svg');
            try {
                JsBarcode(svgElement, product.barcode, {
                    format: "CODE128",
                    displayValue: true,
                    fontSize: 14,
                    width: 1.5,
                    height: 40,
                    margin: 5
                });
            } catch (e) {
                console.error("Barcode generation failed", e);
            }
            barcodesContainer.appendChild(wrapper);
        });
    }

    // বারকোড ইনপুট দিলে অটো-ফিল করার লজিক
    productsTbody.addEventListener('change', async (e) => {
        if (e.target.classList.contains('product-barcode')) {
            const barcode = e.target.value.trim();
            const row = e.target.closest('tr');
            
            if (barcode && activeShopId) {
                try {
                    // ডাটাবেস থেকে প্রোডাক্ট চেক করা
                    const productRef = doc(db, 'shops', activeShopId, 'inventory', barcode);
                    const productSnap = await getDoc(productRef);

                    if (productSnap.exists()) {
                        const data = productSnap.data();
                        
                        // পুরনো তথ্য দিয়ে ফিল্ডগুলো অটো-ফিল করা
                        row.querySelector('.product-name').value = data.name || '';
                        row.querySelector('.product-category').value = data.category || '';
                        row.querySelector('.product-cp').value = data.costPrice || 0;
                        row.querySelector('.product-sp').value = data.sellingPrice || 0;
                        
                        // ইউজারকে বোঝানোর জন্য রো-এর রঙ পরিবর্তন (হালকা সবুজ)
                        row.style.backgroundColor = '#e8f5e9'; 
                        showStatus(`Product "${data.name}" found! New stock will be added to existing.`, 'success');
                        
                        // নাম এবং ক্যাটাগরি লক করে দেওয়া যাতে ভুল না হয়
                        row.querySelector('.product-name').readOnly = true;
                        row.querySelector('.product-category').readOnly = true;
                    } else {
                        // যদি নতুন বারকোড হয়, তবে লক খুলে দেওয়া এবং রঙ রিসেট করা
                        row.style.backgroundColor = '';
                        row.querySelector('.product-name').readOnly = false;
                        row.querySelector('.product-category').readOnly = false;
                    }
                } catch (error) {
                    console.error("Error fetching product:", error);
                }
            }
        }
    });

    addRowBtn.addEventListener('click', addProductRow);

    // --- Auto-save on input change ---
    productsTbody.addEventListener('input', saveTableToLocal);

    // --- Recalculate All SP Button ---
    const btnRecalculateSP = document.getElementById('btn-recalculate-sp');
    if (btnRecalculateSP) {
        btnRecalculateSP.addEventListener('click', () => {
            const marginInput = document.getElementById('default-margin');
            const marginPercent = parseFloat(marginInput.value) || 0;
            const rows = productsTbody.querySelectorAll('tr');
            let updatedCount = 0;

            rows.forEach(row => {
                const cpInput = row.querySelector('.product-cp');
                const spInput = row.querySelector('.product-sp');
                
                if (cpInput && spInput) {
                    const cp = parseFloat(cpInput.value) || 0;
                    
                    if (cp > 0) {
                        const calculatedSP = cp + (cp * marginPercent / 100);
                        spInput.value = Math.round(calculatedSP);
                        
                        // ভিসুয়াল ফিডব্যাক
                        spInput.style.backgroundColor = '#d4edda';
                        setTimeout(() => {
                            spInput.style.backgroundColor = '';
                        }, 1000);
                        
                        updatedCount++;
                    }
                }
            });

            if (updatedCount > 0) {
                showStatus(`✅ ${updatedCount}টি প্রোডাক্টের SP পুনরায় ক্যালকুলেট করা হয়েছে (${marginPercent}% margin)।`, 'success');
                saveTableToLocal(); // লোকাল স্টোরেজে সেভ
            } else {
                showStatus('⚠️ কোনো CP পাওয়া যায়নি। প্রথমে CP লিখুন।', 'error');
            }
        });
    }

    // --- Clear All Button ---
    const btnClearAll = document.getElementById('btn-clear-all');
    if (btnClearAll) {
        btnClearAll.addEventListener('click', () => {
            if (confirm("⚠️ আপনি কি নিশ্চিত যে সব রো মুছে ফেলতে চান? এটি লোকাল সেভ ডেটাও ডিলিট করে দেবে।")) {
                localStorage.removeItem('temp_product_list');
                productsTbody.innerHTML = '';
                addProductRow();
                showStatus('✅ All rows cleared!', 'success');
            }
        });
    }

    // --- AI Prompt Copy Logic ---
    const btnCopyPrompt = document.getElementById('btn-copy-prompt');
    if (btnCopyPrompt) {
        btnCopyPrompt.addEventListener('click', function() {
            const promptText = document.getElementById('ai-prompt-text').innerText;
            const btn = this;
            
            navigator.clipboard.writeText(promptText).then(() => {
                const originalText = btn.innerText;
                btn.innerText = "Copied! ✅";
                btn.style.background = "#27ae60";
                
                setTimeout(() => {
                    btn.innerText = originalText;
                    btn.style.background = "#2ecc71";
                }, 2000);
            }).catch(() => {
                alert("❌ Failed to copy. Please copy manually.");
            });
        });
    }

    // --- Custom AI Modal Elements ---
    const aiPasteModal = document.getElementById('ai-paste-modal');
    const btnOpenPasteAI = document.getElementById('btn-paste-ai');
    const btnCloseAIModal = document.getElementById('close-ai-modal');
    const btnCancelAI = document.getElementById('btn-cancel-ai');
    const btnProcessAI = document.getElementById('btn-process-ai');
    const aiRawInput = document.getElementById('ai-raw-input');
    const aiStatus = document.getElementById('ai-process-status');

    // ১. মডাল ওপেন করা
    if (btnOpenPasteAI) {
        btnOpenPasteAI.addEventListener('click', () => {
            aiRawInput.value = ''; // আগের ডেটা ক্লিয়ার করা
            aiStatus.innerText = '';
            aiPasteModal.classList.remove('hidden');
            setTimeout(() => aiRawInput.focus(), 100);
        });
    }

    // ২. মডাল ক্লোজ করা
    const closeAIModal = () => aiPasteModal.classList.add('hidden');
    if (btnCloseAIModal) btnCloseAIModal.addEventListener('click', closeAIModal);
    if (btnCancelAI) btnCancelAI.addEventListener('click', closeAIModal);

    // Modal overlay click to close
    if (aiPasteModal) {
        aiPasteModal.addEventListener('click', (e) => {
            if (e.target.id === 'ai-paste-modal') {
                closeAIModal();
            }
        });
    }

    // ৩. ডেটা প্রসেস করা
    if (btnProcessAI) {
        btnProcessAI.addEventListener('click', async () => {
            const rawData = aiRawInput.value.trim();
            if (!rawData) {
                aiStatus.style.color = "red";
                aiStatus.innerText = "⚠️ Please paste some data first!";
                return;
            }

            if (!activeShopId) {
                aiStatus.style.color = "red";
                aiStatus.innerText = "❌ দয়া করে পুনরায় লগইন করুন।";
                return;
            }

            aiStatus.style.color = "#4361ee";
            aiStatus.innerText = "⏳ Processing data, please wait...";
            btnProcessAI.disabled = true;
            btnProcessAI.style.opacity = "0.6";

            const lines = rawData.split('\n');
            let addedCount = 0;
            let updatedCount = 0;

            for (let i = 0; i < lines.length; i++) {
                const parts = lines[i].split('|').map(p => p.trim());
                
                if (parts.length >= 3) {
                    const name = parts[0];
                    const cp = parseFloat(parts[1]);
                    const qty = parseInt(parts[2]);
                    const category = parts.length >= 4 ? parts[3] : '';

                    if (name && !isNaN(cp) && !isNaN(qty)) {
                        try {
                            // ১. চেক করা টেবিলে বর্তমানে কোনো খালি রো আছে কি না
                            const existingRows = document.querySelectorAll('#products-tbody tr');
                            let targetRow;

                            // যদি প্রথম আইটেম হয় এবং প্রথম রো-টি খালি থাকে, তবে সেটি ব্যবহার করো
                            if (i === 0 && existingRows.length === 1 && !existingRows[0].querySelector('.product-name').value.trim()) {
                                targetRow = existingRows[0];
                            } else {
                                // অন্যথায় নতুন রো তৈরি করো
                                addProductRow();
                                const updatedRows = document.querySelectorAll('#products-tbody tr');
                                targetRow = updatedRows[updatedRows.length - 1];
                            }

                            // ২. ডাটাবেসে এই নামে প্রোডাক্ট আছে কি না চেক করা
                            const inventoryRef = collection(db, 'shops', activeShopId, 'inventory');
                            const { query: firestoreQuery, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
                            
                            const q = firestoreQuery(inventoryRef, where("name", "==", name));
                            const querySnapshot = await getDocs(q);

                            if (!querySnapshot.empty) {
                                // প্রোডাক্টটি আগে থেকেই আছে!
                                const existingDoc = querySnapshot.docs[0];
                                const existingData = existingDoc.data();
                                const barcode = existingDoc.id;

                                targetRow.querySelector('.product-name').value = name;
                                targetRow.querySelector('.product-name').readOnly = true;
                                targetRow.querySelector('.product-category').value = existingData.category || category;
                                targetRow.querySelector('.product-category').readOnly = true;
                                targetRow.querySelector('.product-cp').value = cp;
                                targetRow.querySelector('.product-sp').value = existingData.sellingPrice || cp;
                                targetRow.querySelector('.product-barcode').value = barcode;
                                targetRow.querySelector('.product-stock').value = qty;
                                
                                // রো-এর কালার হালকা সবুজ করে দেওয়া
                                targetRow.style.backgroundColor = "#e8f5e9";
                                updatedCount++;
                            } else {
                                // নতুন প্রোডাক্ট
                                targetRow.querySelector('.product-name').value = name;
                                targetRow.querySelector('.product-category').value = category;
                                targetRow.querySelector('.product-cp').value = cp;
                                targetRow.querySelector('.product-sp').value = cp;
                                targetRow.querySelector('.product-stock').value = qty;
                                addedCount++;
                            }
                        } catch (error) {
                            console.error("প্রোডাক্ট চেক করতে সমস্যা:", error);
                            // এরর হলেও নতুন রো যোগ করা
                            addProductRow();
                            const rows = document.querySelectorAll('#products-tbody tr');
                            const lastRow = rows[rows.length - 1];

                            lastRow.querySelector('.product-name').value = name;
                            lastRow.querySelector('.product-category').value = category;
                            lastRow.querySelector('.product-cp').value = cp;
                            lastRow.querySelector('.product-sp').value = cp;
                            lastRow.querySelector('.product-stock').value = qty;
                            addedCount++;
                        }
                    }
                }
            }

            btnProcessAI.disabled = false;
            btnProcessAI.style.opacity = "1";

            if (addedCount > 0 || updatedCount > 0) {
                showStatus(`✅ ফলাফল: ${addedCount}টি নতুন এবং ${updatedCount}টি বিদ্যমান প্রোডাক্ট পাওয়া গেছে।`, 'success');
                saveTableToLocal(); // AI ডেটা যোগ হলে সেভ করা
                closeAIModal();
            } else {
                aiStatus.style.color = "red";
                aiStatus.innerText = "❌ সঠিক ফরম্যাটে ডেটা পাওয়া যায়নি।";
            }
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!activeShopId) {
            showStatus('Authentication error. Please log in again.', 'error');
            return;
        }

        const saveButton = form.querySelector('button[type="submit"]');
        saveButton.disabled = true;
        saveButton.textContent = 'Uploading Images & Saving...';
        
        const rows = productsTbody.querySelectorAll('tr');
        if (rows.length === 0) {
            showStatus('Please add at least one product.', 'error');
            saveButton.disabled = false; saveButton.textContent = 'Save All Products';
            return;
        }
        
        const productsToProcess = [];
        let allRowsValid = true;

        for (const row of rows) {
            if (!allRowsValid) break;

            const name = row.querySelector('.product-name').value.trim();
            if (name) {
                const category = row.querySelector('.product-category').value.trim();
                const remark = row.querySelector('.product-remark').value.trim();
                const cp = parseFloat(row.querySelector('.product-cp').value);
                const sp = parseFloat(row.querySelector('.product-sp').value);
                const barcode = row.querySelector('.product-barcode').value.trim();
                const stock = parseInt(row.querySelector('.product-stock').value, 10);
                const imageInput = row.querySelector('.product-image');
                
                if (!category || isNaN(cp) || isNaN(sp) || isNaN(stock) || cp < 0 || sp < 0 || stock < 0) {
                    allRowsValid = false;
                } else {
                    let imageUrl = null;
                    if (imageInput.files && imageInput.files[0]) {
                        try {
                            saveButton.textContent = `Uploading image for ${name}...`;
                            imageUrl = await uploadImageToImgBB(imageInput.files[0]);
                        } catch (err) {
                            console.error("Failed to upload image for " + name);
                        }
                    }

                    productsToProcess.push({ 
                        name, 
                        category,
                        remark,
                        costPrice: cp, 
                        sellingPrice: sp, 
                        stock, 
                        barcode,
                        imageUrl: imageUrl
                    });
                }
            }
        }

        if (!allRowsValid || productsToProcess.length === 0) {
            showStatus('Error: Please fill all fields correctly.', 'error');
            saveButton.disabled = false; saveButton.textContent = 'Save All Products';
            return;
        }
        
        saveButton.textContent = 'Saving to Database...';

        try {
            // --- নতুন লজিক: প্রোডাক্টগুলোকে বারকোড অনুযায়ী গ্রুপ করা ---
            const groupedProducts = [];
            const barcodeMap = new Map();

            productsToProcess.forEach(p => {
                if (p.barcode) {
                    if (barcodeMap.has(p.barcode)) {
                        // যদি একই বারকোড আগে পাওয়া যায়, তবে স্টক যোগ করো
                        barcodeMap.get(p.barcode).stock += p.stock;
                    } else {
                        const newObj = { ...p };
                        barcodeMap.set(p.barcode, newObj);
                        groupedProducts.push(newObj);
                    }
                } else {
                    // বারকোড না থাকলে প্রতিটি রো-কে আলাদা প্রোডাক্ট হিসেবে ধরো
                    groupedProducts.push({ ...p });
                }
            });

            const productsForBarcodeDisplay = [];
            const metadataRef = doc(db, 'shops', activeShopId, '_metadata', 'counters');

            await runTransaction(db, async (transaction) => {
                const metadataDoc = await transaction.get(metadataRef);
                let lastProductId = metadataDoc.exists() ? metadataDoc.data().lastProductId || 1000 : 1000;

                const processQueue = [];

                // এখন productsToProcess এর বদলে groupedProducts ব্যবহার হবে
                for (const product of groupedProducts) {
                    let finalBarcode;
                    if (product.barcode) {
                        finalBarcode = product.barcode;
                    } else {
                        lastProductId++;
                        finalBarcode = String(lastProductId);
                    }

                    const productRef = doc(db, 'shops', activeShopId, 'inventory', finalBarcode);
                    const productSnapshot = await transaction.get(productRef);

                    processQueue.push({
                        productData: product,
                        ref: productRef,
                        snapshot: productSnapshot,
                        finalBarcode: finalBarcode
                    });
                }

                for (const item of processQueue) {
                    const { productData, ref, snapshot, finalBarcode } = item;

                    if (snapshot.exists()) {
                        const dbData = snapshot.data();

                        if (dbData.name.trim().toLowerCase() !== productData.name.trim().toLowerCase()) {
                            throw new Error(`MISMATCH: Barcode '${finalBarcode}' is for '${dbData.name}', NOT '${productData.name}'.`);
                        }
                        
                        const newStockTotal = parseInt(dbData.stock || 0) + productData.stock;
                        
                        const updateData = {
                            stock: newStockTotal,
                            lastUpdated: Timestamp.now()
                        };
                        if (productData.imageUrl) {
                            updateData.imageUrl = productData.imageUrl;
                        }

                        transaction.update(ref, updateData);

                    } else {
                        const dataToSave = {
                            name: productData.name,
                            category: productData.category,
                            remark: productData.remark || '',
                            costPrice: productData.costPrice,
                            sellingPrice: productData.sellingPrice,
                            stock: productData.stock,
                            barcode: finalBarcode,
                            imageUrl: productData.imageUrl || null,
                            createdAt: Timestamp.now()
                        };
                        transaction.set(ref, dataToSave);
                    }

                    // এক্সপেন্স সেভ করার সময়ও গ্রুপ করা স্টক অনুযায়ী অ্যামাউন্ট ক্যালকুলেট হবে
                    if (productData.costPrice > 0 && productData.stock > 0) {
                        const totalCost = productData.costPrice * productData.stock;
                        const expenseRef = doc(collection(db, 'shops', activeShopId, 'expenses'));
                        
                        const expenseData = {
                            description: `Purchase: ${productData.name}`,
                            amount: totalCost,
                            category: 'inventory_purchase',
                            quantity: productData.stock,
                            unitPrice: productData.costPrice,
                            date: Timestamp.now(),
                            relatedProductId: finalBarcode
                        };
                        transaction.set(expenseRef, expenseData);
                    }

                    productsForBarcodeDisplay.push({ barcode: finalBarcode, name: productData.name, sp: productData.sellingPrice });
                }

                transaction.set(metadataRef, { lastProductId: lastProductId }, { merge: true });
            });

            showStatus(`${productsForBarcodeDisplay.length} products saved successfully!`, 'success');
            displayBarcodes(productsForBarcodeDisplay);
            productsTbody.innerHTML = '';
            addProductRow();
            
            // সফলভাবে সেভ হলে লোকাল স্টোরেজ ক্লিয়ার করে দেওয়া
            localStorage.removeItem('temp_product_list');

        } catch (error) {
            console.error("Transaction failed: ", error);
            let msg = error.message;
            if (msg.includes('MISMATCH')) {
                msg = msg.replace('Error: ', '');
            } else {
                msg = "Failed to save data. " + msg;
            }
            showStatus(msg, 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Save All Products';
        }
    });

    productsTbody.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.remove-row-btn');
        if (removeBtn) {
            const rows = productsTbody.querySelectorAll('tr');
            if (rows.length > 1) {
                removeBtn.closest('tr').remove();
            } else {
                alert("At least one row must remain.");
            }
            return;
        }

        const scanBtn = e.target.closest('.btn-scan-row');
        if (scanBtn) {
            currentBarcodeTarget = scanBtn.closest('td').querySelector('.product-barcode');
            openScanner();
        }
    });

    function openScanner() {
        const scannerModal = document.getElementById('scanner-modal');
        scannerModal.classList.remove('hidden');
        
        if (html5QrCode) {
            html5QrCode.clear();
        }

        html5QrCode = new Html5Qrcode("reader");
        
        const config = { 
            fps: 25,
            qrbox: function(viewfinderWidth, viewfinderHeight) {
                return { width: viewfinderWidth * 0.8, height: 150 };
            },
            aspectRatio: 1.0,
            formatsToSupport: [ 
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.QR_CODE
            ]
        };

        html5QrCode.start(
            { facingMode: "environment" },
            config, 
            (decodedText) => {
                playScanSound();
                if (navigator.vibrate) navigator.vibrate(100);
                
                if (currentBarcodeTarget) {
                    currentBarcodeTarget.value = decodedText;
                    currentBarcodeTarget.dispatchEvent(new Event('change', { bubbles: true }));
                }
                stopScanner();
            },
            (errorMessage) => {
                // Ignore scanning errors for fast performance
            }
        ).catch(err => {
            console.error("Camera Error:", err);
            alert('ক্যামেরা চালু করা যাচ্ছে না। পারমিশন চেক করুন।');
            stopScanner();
        });
    }

    function stopScanner() {
        if (html5QrCode) {
            html5QrCode.stop().then(() => {
                document.getElementById('scanner-modal').classList.add('hidden');
            }).catch(err => console.log(err));
        } else {
            document.getElementById('scanner-modal').classList.add('hidden');
        }
    }

    document.getElementById('close-scanner-btn').addEventListener('click', stopScanner);

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await signOut(auth);
        });
    }

    // Modal overlay click to close
    document.getElementById('scanner-modal').addEventListener('click', (e) => {
        if (e.target.id === 'scanner-modal') {
            stopScanner();
        }
    });

    async function setupRemoteScannerListener() {
        if (!activeShopId) return;

        console.log("Remote scanner listener active for Add Product...");
        
        const { onSnapshot, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        
        onSnapshot(doc(db, 'shops', activeShopId, 'remote_scan', 'current'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const barcode = data.barcode;
                
                if (barcode) {
                    console.log("Remote Scan Received:", barcode);
                    
                    const lastRow = productsTbody.querySelector('tr:last-child');
                    if (lastRow) {
                        const barcodeInput = lastRow.querySelector('.product-barcode');
                        if (barcodeInput && !barcodeInput.value) {
                            barcodeInput.value = barcode;
                            barcodeInput.dispatchEvent(new Event('change', { bubbles: true }));
                            playScanSound();
                        }
                    }
                    
                    updateDoc(doc(db, 'shops', activeShopId, 'remote_scan', 'current'), {
                        barcode: null
                    });
                }
            }
        });
    }
});