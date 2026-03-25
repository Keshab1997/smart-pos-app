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

// --- Mode Configuration ---
const modeConfigs = {
    general: {
        head1: "Rack/Shelf", head2: "Remark",
        p1: "Rack No.", p2: "Any note",
        aiExample: "Product Name | CP | Qty | Category | MRP | Rack | Remark"
    },
    clothing: {
        head1: "Size", head2: "Color",
        p1: "e.g. XL, 32, M", p2: "e.g. Red, Blue",
        aiExample: "Brand | Name | Size | Net CP | Qty | Category | MRP | Color"
    },
    jewelry: {
        head1: "Weight (gm)", head2: "Purity",
        p1: "e.g. 5.50, 10.2", p2: "e.g. 22K, 18K",
        aiExample: "Brand | Name | Weight | Net CP | Qty | Category | MRP | Purity"
    },
    grocery: {
        head1: "Brand Name", head2: "Weight/Unit",
        p1: "e.g. SOUL, MAGGI, LUX", p2: "e.g. 65gms, 1kg, 500ml",
        head3: "HSN Code", head4: "Expiry Date",
        p3: "e.g. 21039090", p4: "e.g. 12/2025",
        extraColumns: true,
        aiExample: "Brand | Name | Weight | Net CP | Qty | Category | MRP | HSN | Expiry"
    }
};

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

    // --- Mode Switching Logic ---
    window.currentActiveMode = 'general';
    
    const modeButtons = document.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const selectedMode = this.getAttribute('data-mode');
            applyModeToTable(selectedMode);
            
            // Active button styling
            modeButtons.forEach(b => {
                b.style.background = 'white';
                b.style.color = '#333';
            });
            this.style.background = this.style.borderColor;
            this.style.color = 'white';
        });
    });

    function applyModeToTable(mode) {
        const config = modeConfigs[mode];
        
        // Update table headers
        document.querySelector('.dynamic-head-1').innerText = config.head1;
        document.querySelector('.dynamic-head-2').innerText = config.head2;
        
        // Show/hide extra columns for grocery mode
        const head3 = document.querySelector('.dynamic-head-3');
        const head4 = document.querySelector('.dynamic-head-4');
        
        if (config.extraColumns) {
            head3.style.display = '';
            head4.style.display = '';
            head3.innerText = config.head3;
            head4.innerText = config.head4;
        } else {
            head3.style.display = 'none';
            head4.style.display = 'none';
        }

        // Update existing rows
        const rows = document.querySelectorAll('#products-tbody tr');
        rows.forEach(row => {
            const input1 = row.querySelector('.dynamic-input-1');
            const input2 = row.querySelector('.dynamic-input-2');
            const input3 = row.querySelector('.dynamic-input-3');
            const input4 = row.querySelector('.dynamic-input-4');
            
            if (input1) input1.placeholder = config.p1;
            if (input2) input2.placeholder = config.p2;
            
            if (config.extraColumns) {
                if (input3) {
                    input3.style.display = '';
                    input3.placeholder = config.p3;
                }
                if (input4) {
                    input4.style.display = '';
                    input4.placeholder = config.p4;
                }
            } else {
                if (input3) input3.style.display = 'none';
                if (input4) input4.style.display = 'none';
            }
        });

        // Update AI Prompt based on mode
        updateAIPrompt(mode);

        window.currentActiveMode = mode;
        showStatus(`✅ Table mode changed to ${mode.toUpperCase()}`, 'success');
    }

    // --- AI Prompt Update Function ---
    function updateAIPrompt(mode) {
        const aiPromptText = document.getElementById('ai-prompt-text');
        if (!aiPromptText) return;

        const prompts = {
            general: "Please analyze this vendor bill image and extract the Product Name, Cost Price (CP), Quantity (Qty), MRP/Selling Price (if available), Category, Rack/Shelf location, and any Remark. Format the output as: Product Name | CP | Qty | MRP | Category | Rack | Remark. If any field is not available, write 0 or leave blank. Example: Lux Soap | 25 | 50 | 30 | COSMETICS | A-12 | Fragrant",
            
            clothing: "Please analyze this clothing/garment bill image and extract the Brand, Product Name, Size, Base Rate, GST%, Quantity, MRP, and Color. Calculate Net CP = Base Rate + (Base Rate * GST% / 100). Format the output as: Brand | Name | Size | Net CP | Qty | Category | MRP | Color. If any field is not available, write 0 or leave blank. Example: ZARA | Cotton Shirt | XL | 520.50 | 10 | CLOTHING | 650 | Blue",
            
            jewelry: "Please analyze this jewelry bill image and extract the Brand, Product Name, Weight (grams), Base Rate, Making Charges%, Quantity, MRP, and Purity. Calculate Net CP = Base Rate + (Base Rate * Making% / 100). Format the output as: Brand | Name | Weight | Net CP | Qty | Category | MRP | Purity. If any field is not available, write 0 or leave blank. Example: TANISHQ | Gold Ring | 5.5 | 15750.00 | 2 | JEWELRY | 18000 | 22K",
            
            grocery: "Analyze this grocery/FMCG bill. For each item, extract: Brand, Product Name, Weight/Unit, Base Rate, GST%, Quantity, MRP, HSN Code, and Expiry Date. Calculate Net CP = Base Rate + (Base Rate * GST% / 100). Format the output as: Brand | Name | Weight | Net CP | Qty | Category | MRP | HSN | Expiry. Do not include headers or currency symbols. Example: SOUL | BUTTER CHKN MASALA | 65gms | 35.43 | 30 | GROCERY | 50 | 21039090 | 12/2025"
        };

        aiPromptText.textContent = prompts[mode] || prompts.general;
    }

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

        // Category auto uppercase
        if (categoryInput) {
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
            const extra1 = row.querySelector('.dynamic-input-1')?.value || '';
            const extra2 = row.querySelector('.dynamic-input-2')?.value || '';
            const extra3 = row.querySelector('.dynamic-input-3')?.value || '';
            const extra4 = row.querySelector('.dynamic-input-4')?.value || '';
            const cp = row.querySelector('.product-cp').value;
            const sp = row.querySelector('.product-sp').value;
            const barcode = row.querySelector('.product-barcode').value;
            const stock = row.querySelector('.product-stock').value;

            if (name || cp || stock) {
                data.push({ name, category, extra1, extra2, extra3, extra4, cp, sp, barcode, stock });
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
                        lastRow.querySelector('.dynamic-input-1').value = item.extra1 || '';
                        lastRow.querySelector('.dynamic-input-2').value = item.extra2 || '';
                        if (lastRow.querySelector('.dynamic-input-3')) {
                            lastRow.querySelector('.dynamic-input-3').value = item.extra3 || '';
                        }
                        if (lastRow.querySelector('.dynamic-input-4')) {
                            lastRow.querySelector('.dynamic-input-4').value = item.extra4 || '';
                        }
                        lastRow.querySelector('.product-cp').value = item.cp || '';
                        lastRow.querySelector('.product-sp').value = item.sp || '';
                        lastRow.querySelector('.product-barcode').value = item.barcode || '';
                        lastRow.querySelector('.product-stock').value = item.stock || '';
                    });
                    
                    showStatus('✅ আগের সেভ করা ডেটা ফিরিয়ে আনা হয়েছে।', 'success');
                    calculateTotalCP(); // লোড করার পর টোটাল আপডেট
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
        const mode = window.currentActiveMode || 'general';
        const config = modeConfigs[mode];
        
        const extraCols = config.extraColumns ? `
            <td data-label="${config.head3}" style="display:${config.extraColumns ? '' : 'none'}"><input type="text" class="dynamic-input-3" placeholder="${config.p3}"></td>
            <td data-label="${config.head4}" style="display:${config.extraColumns ? '' : 'none'}"><input type="text" class="dynamic-input-4" placeholder="${config.p4}"></td>
        ` : `
            <td data-label="Extra 3" style="display:none"><input type="text" class="dynamic-input-3" style="display:none"></td>
            <td data-label="Extra 4" style="display:none"><input type="text" class="dynamic-input-4" style="display:none"></td>
        `;
        
        row.innerHTML = `
            <td data-label="Product Name"><input type="text" class="product-name" placeholder="e.g., Lux Soap" required></td>
            <td data-label="Category"><input type="text" class="product-category" placeholder="e.g., Cosmetics" list="category-list" required></td>
            <td data-label="${config.head1}"><input type="text" class="dynamic-input-1" placeholder="${config.p1}"></td>
            <td data-label="${config.head2}"><input type="text" class="dynamic-input-2" placeholder="${config.p2}"></td>
            ${extraCols}
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

    addRowBtn.addEventListener('click', () => {
        addProductRow();
        calculateTotalCP(); // নতুন রো যোগ হলে টোটাল আপডেট
    });

    // --- Auto-save on input change ---
    productsTbody.addEventListener('input', saveTableToLocal);

    // --- Real-time Total CP Calculator ---
    function calculateTotalCP() {
        const rows = productsTbody.querySelectorAll('tr');
        let totalCP = 0;

        rows.forEach(row => {
            const cpInput = row.querySelector('.product-cp');
            const qtyInput = row.querySelector('.product-stock');
            
            if (cpInput && qtyInput) {
                const cp = parseFloat(cpInput.value) || 0;
                const qty = parseInt(qtyInput.value) || 0;
                totalCP += (cp * qty);
            }
        });

        // টোটাল দেখানো
        const calculatedTotalElement = document.getElementById('calculated-total-cp');
        if (calculatedTotalElement) {
            calculatedTotalElement.textContent = `₹${totalCP.toFixed(2)}`;
        }

        // বিলের সাথে তুলনা
        checkBillMatch(totalCP);
        
        return totalCP;
    }

    function checkBillMatch(calculatedTotal) {
        const originalBillInput = document.getElementById('original-bill-total');
        const differenceElement = document.getElementById('bill-difference');
        const statusElement = document.getElementById('bill-match-status');
        
        if (!originalBillInput || !differenceElement || !statusElement) return;

        const originalTotal = parseFloat(originalBillInput.value) || 0;
        
        if (originalTotal > 0) {
            const difference = calculatedTotal - originalTotal;
            differenceElement.textContent = `₹${Math.abs(difference).toFixed(2)}`;
            
            if (Math.abs(difference) < 0.01) {
                // মিলে গেছে!
                differenceElement.style.color = '#27ae60';
                statusElement.style.display = 'block';
                statusElement.style.background = '#d4edda';
                statusElement.style.color = '#155724';
                statusElement.textContent = '✅ Perfect Match! Bill verified successfully.';
            } else if (difference > 0) {
                // বেশি হয়ে গেছে
                differenceElement.style.color = '#e74c3c';
                statusElement.style.display = 'block';
                statusElement.style.background = '#f8d7da';
                statusElement.style.color = '#721c24';
                statusElement.textContent = `⚠️ Calculated total is ₹${difference.toFixed(2)} MORE than bill. Please check entries.`;
            } else {
                // কম হয়ে গেছে
                differenceElement.style.color = '#f39c12';
                statusElement.style.display = 'block';
                statusElement.style.background = '#fff3cd';
                statusElement.style.color = '#856404';
                statusElement.textContent = `⚠️ Calculated total is ₹${Math.abs(difference).toFixed(2)} LESS than bill. Please check entries.`;
            }
        } else {
            differenceElement.textContent = '₹0.00';
            differenceElement.style.color = '#666';
            statusElement.style.display = 'none';
        }
    }

    // টেবিলে কোনো পরিবর্তন হলে টোটাল আপডেট
    productsTbody.addEventListener('input', () => {
        calculateTotalCP();
        saveTableToLocal();
    });

    // রো ডিলিট হলেও টোটাল আপডেট
    const observer = new MutationObserver(() => {
        calculateTotalCP();
    });
    observer.observe(productsTbody, { childList: true, subtree: true });

    // Original Bill Total ইনপুট চেঞ্জ হলেও চেক করা
    const originalBillInput = document.getElementById('original-bill-total');
    if (originalBillInput) {
        originalBillInput.addEventListener('input', () => {
            const currentTotal = calculateTotalCP();
            checkBillMatch(currentTotal);
        });
    }

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
                calculateTotalCP(); // ক্লিয়ার করলে টোটাল রিসেট
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

    // Update AI Paste Modal Example Text
    function updateAIPasteExample() {
        const mode = window.currentActiveMode || 'general';
        const config = modeConfigs[mode];
        const exampleElement = document.querySelector('#ai-paste-modal .modal-body p:nth-child(3)');
        
        if (exampleElement && config.aiExample) {
            // Mode-specific format instructions
            const formatExamples = {
                general: `<strong>Format:</strong> Product Name | CP | Qty | Category | MRP | Rack | Remark<br>
                         <strong>Example:</strong> Lux Soap | 25 | 50 | COSMETICS | 30 | A-12 | Fragrant`,
                
                clothing: `<strong>Format:</strong> Brand | Name | Size | Net CP | Qty | Category | MRP | Color<br>
                          <strong>Example:</strong> ZARA | Cotton Shirt | XL | 520.50 | 10 | CLOTHING | 650 | Blue`,
                
                jewelry: `<strong>Format:</strong> Brand | Name | Weight (gm) | Net CP | Qty | Category | MRP | Purity<br>
                         <strong>Example:</strong> TANISHQ | Gold Ring | 5.5 | 15750.00 | 2 | JEWELRY | 18000 | 22K`,
                
                grocery: `<strong>Format:</strong> Brand | Name | Weight/Unit | Net CP | Qty | Category | MRP | HSN | Expiry<br>
                         <strong>Example:</strong> SOUL | BUTTER CHKN MASALA | 65gms | 35.43 | 30 | GROCERY | 50 | 21039090 | 12/2025`
            };
            
            exampleElement.innerHTML = formatExamples[mode] || formatExamples.general;
        }
    }

    // ১. মডাল ওপেন করা
    if (btnOpenPasteAI) {
        btnOpenPasteAI.addEventListener('click', () => {
            aiRawInput.value = ''; // আগের ডেটা ক্লিয়ার করা
            aiStatus.innerText = '';
            updateAIPasteExample(); // Update example based on current mode
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
                const line = lines[i].trim();
                if (!line) continue; // Skip empty lines
                
                // Support multiple separators: | (pipe), , (comma), or Tab
                let parts;
                if (line.includes('|')) {
                    parts = line.split('|').map(p => p.trim());
                } else if (line.includes('\t')) {
                    parts = line.split('\t').map(p => p.trim());
                } else if (line.includes(',')) {
                    parts = line.split(',').map(p => p.trim());
                } else {
                    continue; // Skip lines without valid separator
                }
                
                const currentMode = window.currentActiveMode || 'general';
                
                if (parts.length >= 3) {
                    let name, cp, qty, mrp, category, extra1, extra2, extra3, extra4;
                    
                    // Mode-based parsing
                    if (currentMode === 'grocery' || currentMode === 'clothing' || currentMode === 'jewelry') {
                        // New format: Brand | Name | Weight/Size | Net CP | Qty | Category | MRP | Extra3 | Extra4
                        const brand = parts[0] || '';
                        const productName = parts[1] || '';
                        const weightOrSize = parts[2] || '';
                        
                        // Grocery Mode: Brand এবং Weight আলাদা কলামে + HSN + Expiry
                        if (currentMode === 'grocery') {
                            name = productName.trim().toUpperCase(); // শুধু Product Name
                            extra1 = brand.trim().toUpperCase();     // Brand Name column
                            extra2 = weightOrSize.trim();            // Weight/Unit column
                            extra3 = parts.length >= 8 ? parts[7] : ''; // HSN Code
                            extra4 = parts.length >= 9 ? parts[8] : ''; // Expiry Date
                        } else if (currentMode === 'clothing') {
                            // Clothing: পুরো নাম একসাথে, Size এবং Color আলাদা
                            name = `${brand} ${productName}`.trim().toUpperCase();
                            extra1 = weightOrSize.trim();            // Size column
                            extra2 = parts.length >= 8 ? parts[7] : ''; // Color column
                            extra3 = '';
                            extra4 = '';
                        } else if (currentMode === 'jewelry') {
                            // Jewelry: পুরো নাম একসাথে, Weight এবং Purity আলাদা
                            name = `${brand} ${productName}`.trim().toUpperCase();
                            extra1 = weightOrSize.trim();            // Weight column
                            extra2 = parts.length >= 8 ? parts[7] : ''; // Purity column
                            extra3 = '';
                            extra4 = '';
                        }
                        
                        cp = parseFloat(parts[3]) || 0;
                        qty = parseInt(parts[4]) || 0;
                        category = parts[5] || (currentMode === 'grocery' ? 'GROCERY' : currentMode === 'clothing' ? 'CLOTHING' : 'JEWELRY');
                        mrp = parts.length >= 7 ? parseFloat(parts[6]) : 0;
                    } else {
                        // General format: Name | CP | Qty | MRP | Category | Extra1 | Extra2
                        name = parts[0];
                        cp = parseFloat(parts[1]);
                        qty = parseInt(parts[2]);
                        mrp = parts.length >= 4 ? parseFloat(parts[3]) : 0;
                        category = parts.length >= 5 ? parts[4] : (parts.length >= 4 && isNaN(parseFloat(parts[3])) ? parts[3] : '');
                        extra1 = parts.length >= 6 ? parts[5] : '';
                        extra2 = parts.length >= 7 ? parts[6] : '';
                        extra3 = '';
                        extra4 = '';
                    }

                    if (name && !isNaN(cp) && !isNaN(qty)) {
                        try {
                            // ১. প্রথমে টেবিলে একই product আছে কি না চেক করা
                            const existingRows = document.querySelectorAll('#products-tbody tr');
                            let duplicateRow = null;
                            
                            // Grocery mode-এ full name তৈরি করা comparison-এর জন্য
                            let fullNameToCheck = name;
                            if (currentMode === 'grocery' && extra1 && extra2) {
                                fullNameToCheck = `${extra1} ${name} ${extra2}`.trim().toUpperCase();
                            }
                            
                            // টেবিলে একই নাম, CP, এবং extra fields আছে কি না চেক
                            existingRows.forEach(row => {
                                const rowName = row.querySelector('.product-name').value.trim().toUpperCase();
                                const rowExtra1 = row.querySelector('.dynamic-input-1')?.value.trim().toUpperCase() || '';
                                const rowExtra2 = row.querySelector('.dynamic-input-2')?.value.trim() || '';
                                const rowCP = parseFloat(row.querySelector('.product-cp').value) || 0;
                                
                                let rowFullName = rowName;
                                if (currentMode === 'grocery' && rowExtra1 && rowExtra2) {
                                    rowFullName = `${rowExtra1} ${rowName} ${rowExtra2}`.trim().toUpperCase();
                                }
                                
                                // যদি নাম এবং CP মিলে যায়, তাহলে duplicate
                                if (rowFullName === fullNameToCheck && Math.abs(rowCP - cp) < 0.01) {
                                    duplicateRow = row;
                                }
                            });
                            
                            // যদি টেবিলে duplicate পাওয়া যায়, শুধু quantity যোগ করো
                            if (duplicateRow) {
                                const currentQty = parseInt(duplicateRow.querySelector('.product-stock').value) || 0;
                                const newQty = currentQty + qty;
                                duplicateRow.querySelector('.product-stock').value = newQty;
                                
                                // রো হাইলাইট করা
                                duplicateRow.style.backgroundColor = "#fff3cd";
                                setTimeout(() => {
                                    duplicateRow.style.backgroundColor = "";
                                }, 2000);
                                
                                updatedCount++;
                                continue; // পরবর্তী item-এ যাও
                            }
                            
                            // ২. টেবিলে না থাকলে, নতুন রো তৈরি করা
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

                            // ৩. ডাটাবেসে এই product আছে কি না চেক করা (Full name দিয়ে)
                            const inventoryRef = collection(db, 'shops', activeShopId, 'inventory');
                            const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
                            
                            // Full name তৈরি করা (Grocery mode-এর জন্য)
                            let fullNameForDB = name;
                            if (currentMode === 'grocery' && extra1 && extra2) {
                                fullNameForDB = `${extra1} ${name} ${extra2}`.trim().toUpperCase();
                            }
                            
                            // সব products load করে match খুঁজা
                            const allProductsSnap = await getDocs(inventoryRef);
                            let existingProduct = null;
                            
                            allProductsSnap.forEach(doc => {
                                const data = doc.data();
                                const dbName = data.name.trim().toUpperCase();
                                const dbCP = parseFloat(data.costPrice);
                                
                                // Name এবং CP match করলে
                                if (dbName === fullNameForDB.toUpperCase() && Math.abs(dbCP - cp) < 0.01) {
                                    existingProduct = {
                                        id: doc.id,
                                        data: data
                                    };
                                }
                            });

                            if (existingProduct) {
                                // প্রোডাক্টটি আগে থেকেই আছে!
                                const barcode = existingProduct.id;
                                const existingData = existingProduct.data;

                                targetRow.querySelector('.product-name').value = name;
                                targetRow.querySelector('.product-name').readOnly = true;
                                targetRow.querySelector('.product-category').value = existingData.category || category.toUpperCase();
                                targetRow.querySelector('.product-category').readOnly = true;
                                
                                // Dynamic fields populate (existing product)
                                if (targetRow.querySelector('.dynamic-input-1')) {
                                    targetRow.querySelector('.dynamic-input-1').value = extra1;
                                }
                                if (targetRow.querySelector('.dynamic-input-2')) {
                                    targetRow.querySelector('.dynamic-input-2').value = extra2;
                                }
                                if (targetRow.querySelector('.dynamic-input-3')) {
                                    targetRow.querySelector('.dynamic-input-3').value = extra3;
                                }
                                if (targetRow.querySelector('.dynamic-input-4')) {
                                    targetRow.querySelector('.dynamic-input-4').value = extra4;
                                }
                                
                                targetRow.querySelector('.product-cp').value = cp.toFixed(2);
                                targetRow.querySelector('.product-sp').value = existingData.sellingPrice || cp;
                                targetRow.querySelector('.product-barcode').value = barcode; // ✅ Barcode set করা
                                targetRow.querySelector('.product-stock').value = qty;
                                
                                // রো-এর কালার হালকা সবুজ করে দেওয়া
                                targetRow.style.backgroundColor = "#e8f5e9";
                                updatedCount++;
                            } else {
                                // নতুন প্রোডাক্ট
                                targetRow.querySelector('.product-name').value = name;
                                targetRow.querySelector('.product-category').value = category.toUpperCase();
                                
                                // Dynamic fields populate (new product)
                                if (targetRow.querySelector('.dynamic-input-1')) {
                                    targetRow.querySelector('.dynamic-input-1').value = extra1;
                                }
                                if (targetRow.querySelector('.dynamic-input-2')) {
                                    targetRow.querySelector('.dynamic-input-2').value = extra2;
                                }
                                if (targetRow.querySelector('.dynamic-input-3')) {
                                    targetRow.querySelector('.dynamic-input-3').value = extra3;
                                }
                                if (targetRow.querySelector('.dynamic-input-4')) {
                                    targetRow.querySelector('.dynamic-input-4').value = extra4;
                                }
                                
                                targetRow.querySelector('.product-cp').value = cp.toFixed(2);
                                
                                // MRP থাকলে সেটা বসানো, না হলে মার্জিন ক্যালকুলেট
                                if (mrp && mrp > 0) {
                                    targetRow.querySelector('.product-sp').value = mrp;
                                } else {
                                    const margin = parseFloat(document.getElementById('default-margin').value) || 0;
                                    const calculatedSP = cp + (cp * margin / 100);
                                    targetRow.querySelector('.product-sp').value = Math.round(calculatedSP);
                                }
                                
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
                            lastRow.querySelector('.product-category').value = category.toUpperCase();
                            
                            // Dynamic fields populate (error fallback)
                            if (lastRow.querySelector('.dynamic-input-1')) {
                                lastRow.querySelector('.dynamic-input-1').value = extra1;
                            }
                            if (lastRow.querySelector('.dynamic-input-2')) {
                                lastRow.querySelector('.dynamic-input-2').value = extra2;
                            }
                            if (lastRow.querySelector('.dynamic-input-3')) {
                                lastRow.querySelector('.dynamic-input-3').value = extra3;
                            }
                            if (lastRow.querySelector('.dynamic-input-4')) {
                                lastRow.querySelector('.dynamic-input-4').value = extra4;
                            }
                            
                            lastRow.querySelector('.product-cp').value = cp.toFixed(2);
                            
                            // MRP থাকলে সেটা বসানো, না হলে মার্জিন ক্যালকুলেট
                            if (mrp && mrp > 0) {
                                lastRow.querySelector('.product-sp').value = mrp;
                            } else {
                                const margin = parseFloat(document.getElementById('default-margin').value) || 0;
                                const calculatedSP = cp + (cp * margin / 100);
                                lastRow.querySelector('.product-sp').value = Math.round(calculatedSP);
                            }
                            
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
                saveTableToLocal();
                calculateTotalCP();
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
                const extra1 = row.querySelector('.dynamic-input-1')?.value.trim() || '';
                const extra2 = row.querySelector('.dynamic-input-2')?.value.trim() || '';
                const extra3 = row.querySelector('.dynamic-input-3')?.value.trim() || '';
                const extra4 = row.querySelector('.dynamic-input-4')?.value.trim() || '';
                const cp = parseFloat(row.querySelector('.product-cp').value);
                const sp = parseFloat(row.querySelector('.product-sp').value);
                const barcode = row.querySelector('.product-barcode').value.trim();
                const stock = parseInt(row.querySelector('.product-stock').value, 10);
                const imageInput = row.querySelector('.product-image');
                
                // Grocery mode-এ full name তৈরি: Brand + Name + Weight
                const currentMode = window.currentActiveMode || 'general';
                let finalName = name;
                if (currentMode === 'grocery' && extra1 && extra2) {
                    finalName = `${extra1} ${name} ${extra2}`.trim();
                }
                
                if (!category || isNaN(cp) || isNaN(sp) || isNaN(stock) || cp < 0 || sp < 0 || stock < 0) {
                    allRowsValid = false;
                } else {
                    let imageUrl = null;
                    if (imageInput.files && imageInput.files[0]) {
                        try {
                            saveButton.textContent = `Uploading image for ${finalName}...`;
                            imageUrl = await uploadImageToImgBB(imageInput.files[0]);
                        } catch (err) {
                            console.error("Failed to upload image for " + finalName);
                        }
                    }

                    productsToProcess.push({ 
                        name: finalName, 
                        category,
                        extraField1: extra1,
                        extraField2: extra2,
                        extraField3: extra3,
                        extraField4: extra4,
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
            // --- Barcode-based duplicate check (Priority 1) ---
            const inventoryRef = collection(db, 'shops', activeShopId, 'inventory');
            const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
            const allProductsSnapshot = await getDocs(inventoryRef);
            
            // Create maps for both barcode and name+cp
            const existingByBarcode = new Map(); // barcode -> {data, stock}
            const existingByNameCP = new Map();   // name+cp -> {barcode, stock}
            
            allProductsSnapshot.forEach(doc => {
                const data = doc.data();
                const barcode = doc.id;
                
                // Map by barcode
                existingByBarcode.set(barcode, {
                    data: data,
                    stock: data.stock || 0
                });
                
                // Map by name+cp
                const key = `${data.name.trim().toUpperCase()}_${data.costPrice.toFixed(2)}`;
                existingByNameCP.set(key, {
                    barcode: barcode,
                    stock: data.stock || 0,
                    data: data
                });
            });
            
            // Group products with smart duplicate detection
            const groupedProducts = [];
            const processedBarcodes = new Set();
            const processedKeys = new Set();

            productsToProcess.forEach(p => {
                const key = `${p.name.trim().toUpperCase()}_${p.costPrice.toFixed(2)}`;
                let matched = false;
                
                // Priority 1: Check by barcode (if product has barcode)
                if (p.barcode && existingByBarcode.has(p.barcode)) {
                    if (!processedBarcodes.has(p.barcode)) {
                        const existing = existingByBarcode.get(p.barcode);
                        groupedProducts.push({
                            ...p,
                            barcode: p.barcode,
                            stock: p.stock,
                            isUpdate: true,
                            existingStock: existing.stock
                        });
                        processedBarcodes.add(p.barcode);
                        processedKeys.add(key);
                    } else {
                        // Same barcode already processed, add to stock
                        const existingInGroup = groupedProducts.find(gp => gp.barcode === p.barcode);
                        if (existingInGroup) {
                            existingInGroup.stock += p.stock;
                        }
                    }
                    matched = true;
                }
                
                // Priority 2: Check by name+CP (if no barcode match)
                if (!matched && existingByNameCP.has(key)) {
                    const existing = existingByNameCP.get(key);
                    if (!processedKeys.has(key)) {
                        groupedProducts.push({
                            ...p,
                            barcode: existing.barcode, // Use existing barcode
                            stock: p.stock,
                            isUpdate: true,
                            existingStock: existing.stock
                        });
                        processedKeys.add(key);
                        processedBarcodes.add(existing.barcode);
                    } else {
                        // Already processed, add to stock
                        const existingInGroup = groupedProducts.find(gp => 
                            gp.name.trim().toUpperCase() === p.name.trim().toUpperCase() && 
                            Math.abs(gp.costPrice - p.costPrice) < 0.01
                        );
                        if (existingInGroup) {
                            existingInGroup.stock += p.stock;
                        }
                    }
                    matched = true;
                }
                
                // Priority 3: New product
                if (!matched) {
                    // Check if already in current batch
                    const existingInGroup = groupedProducts.find(gp => 
                        gp.name.trim().toUpperCase() === p.name.trim().toUpperCase() && 
                        Math.abs(gp.costPrice - p.costPrice) < 0.01 &&
                        !gp.isUpdate
                    );
                    
                    if (existingInGroup) {
                        existingInGroup.stock += p.stock;
                    } else {
                        groupedProducts.push({ ...p, isUpdate: false });
                    }
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
                    
                    if (product.isUpdate) {
                        // Existing product - use existing barcode
                        finalBarcode = product.barcode;
                    } else if (product.barcode) {
                        // New product with manual barcode
                        finalBarcode = product.barcode;
                    } else {
                        // New product - generate barcode
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
                        // Product already exists - update stock
                        const dbData = snapshot.data();
                        const newStockTotal = parseInt(dbData.stock || 0) + productData.stock;
                        
                        const updateData = {
                            stock: newStockTotal,
                            costPrice: productData.costPrice,
                            sellingPrice: productData.sellingPrice,
                            extraField1: productData.extraField1 || dbData.extraField1 || '',
                            extraField2: productData.extraField2 || dbData.extraField2 || '',
                            extraField3: productData.extraField3 || dbData.extraField3 || '',
                            extraField4: productData.extraField4 || dbData.extraField4 || '',
                            lastUpdated: Timestamp.now()
                        };
                        if (productData.imageUrl) {
                            updateData.imageUrl = productData.imageUrl;
                        }

                        transaction.update(ref, updateData);

                    } else {
                        // New product
                        const dataToSave = {
                            name: productData.name,
                            category: productData.category,
                            extraField1: productData.extraField1 || '',
                            extraField2: productData.extraField2 || '',
                            extraField3: productData.extraField3 || '',
                            extraField4: productData.extraField4 || '',
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
                calculateTotalCP(); // রো ডিলিট হলে টোটাল আপডেট
                saveTableToLocal(); // লোকাল স্টোরেজ আপডেট
            } else {
                alert("অন্তত একটি রো থাকতে হবে।");
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