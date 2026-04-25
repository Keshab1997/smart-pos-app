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

// --- Smart Barcode Generator ---
function generateSmartBarcode(product, lastId) {
    const catPrefix = (product.category || 'GEN').substring(0, 3).toUpperCase();
    const colorValue = product.extraField2 || 'MIX';
    const colorPrefix = colorValue.substring(0, 3).toUpperCase();
    const sequence = String(lastId).padStart(4, '0');
    return `${catPrefix}-${colorPrefix}-${sequence}`;
}

// --- Dominant Color Detector (Canvas-based) ---
const COLOR_NAMES = [
    { name: 'Red',     r: 220, g: 50,  b: 50  },
    { name: 'Orange',  r: 230, g: 120, b: 30  },
    { name: 'Yellow',  r: 230, g: 210, b: 30  },
    { name: 'Green',   r: 50,  g: 160, b: 60  },
    { name: 'Blue',    r: 50,  g: 80,  b: 200 },
    { name: 'Sky',     r: 80,  g: 170, b: 230 },
    { name: 'Purple',  r: 130, g: 50,  b: 180 },
    { name: 'Pink',    r: 220, g: 100, b: 150 },
    { name: 'Maroon',  r: 130, g: 20,  b: 40  },
    { name: 'Brown',   r: 130, g: 70,  b: 30  },
    { name: 'Beige',   r: 220, g: 200, b: 160 },
    { name: 'Cream',   r: 240, g: 230, b: 200 },
    { name: 'White',   r: 240, g: 240, b: 240 },
    { name: 'Black',   r: 30,  g: 30,  b: 30  },
    { name: 'Grey',    r: 150, g: 150, b: 150 },
    { name: 'Navy',    r: 20,  g: 30,  b: 100 },
    { name: 'Golden',  r: 210, g: 170, b: 30  },
];

function detectDominantColor(dataUrl, inputEl) {
    const img = new Image();
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 50; // sample at 50x50 for speed
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 128) continue; // skip transparent
            rSum += data[i]; gSum += data[i+1]; bSum += data[i+2];
            count++;
        }
        if (!count) return;
        const r = rSum / count, g = gSum / count, b = bSum / count;

        // Find nearest color name
        let best = COLOR_NAMES[0], bestDist = Infinity;
        COLOR_NAMES.forEach(c => {
            const d = (c.r-r)**2 + (c.g-g)**2 + (c.b-b)**2;
            if (d < bestDist) { bestDist = d; best = c; }
        });

        inputEl.value = best.name;
        inputEl.style.backgroundColor = '#e0f2fe';
        setTimeout(() => inputEl.style.backgroundColor = '', 1500);
    };
    img.src = dataUrl;
}

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
            localStorage.setItem('selectedBusinessMode', selectedMode);
            
            // Active button styling
            modeButtons.forEach(b => {
                b.style.background = 'white';
                b.style.color = '#333';
            });
            this.style.background = this.style.borderColor;
            this.style.color = 'white';
        });
    });

    // Restore saved mode on page load
    const savedMode = localStorage.getItem('selectedBusinessMode') || 'general';
    applyModeToTable(savedMode);
    const savedModeBtn = document.querySelector(`.mode-btn[data-mode="${savedMode}"]`);
    if (savedModeBtn) {
        savedModeBtn.style.background = savedModeBtn.style.borderColor;
        savedModeBtn.style.color = 'white';
    }

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
            
            if (input1) {
                input1.placeholder = config.p1;
                input1.closest('td').setAttribute('data-label', config.head1);
            }
            if (input2) {
                input2.placeholder = config.p2;
                input2.closest('td').setAttribute('data-label', config.head2);
            }
            
            if (config.extraColumns) {
                if (input3) {
                    input3.style.display = '';
                    input3.placeholder = config.p3;
                    input3.closest('td').style.display = '';
                    input3.closest('td').setAttribute('data-label', config.head3);
                }
                if (input4) {
                    input4.style.display = '';
                    input4.placeholder = config.p4;
                    input4.closest('td').style.display = '';
                    input4.closest('td').setAttribute('data-label', config.head4);
                }
            } else {
                if (input3) input3.closest('td').style.display = 'none';
                if (input4) input4.closest('td').style.display = 'none';
            }
        });

        // Update AI Prompt based on mode
        updateAIPrompt(mode);

        // SKU generator panel - clothing mode e show, otherwise hide
        const skuPanel = document.getElementById('sku-generator-panel');
        if (skuPanel) skuPanel.style.display = mode === 'clothing' ? 'block' : 'none';

        window.currentActiveMode = mode;
        showStatus(`✅ Table mode changed to ${mode.toUpperCase()}`, 'success');
    }

    // --- AI Prompt Update Function ---
    function updateAIPrompt(mode) {
        const aiPromptText = document.getElementById('ai-prompt-text');
        if (!aiPromptText) return;

        const prompts = {
            general: "Analyze this vendor/distributor bill. Extract per product: Product Name, Base Rate (before discount), GST%, Discount%, Qty, MRP, Category, Rack, Remark. Do NOT calculate Net CP. Format: Product Name | Base Rate | GST% | Disc% | Qty | MRP | Category | Rack | Remark. Missing fields = 0. No headers/currency. Example: Lux Soap | 22.50 | 18 | 5 | 50 | 30 | COSMETICS | A-12 | Fragrant",
            clothing: "Analyze this clothing/garment bill. Extract per item: Brand, Product Name, Size, Base Rate, GST%, Discount%, Qty, MRP, Color. Do NOT calculate Net CP. Format: Brand | Product Name | Size | Base Rate | GST% | Disc% | Qty | MRP | Color. Missing = 0. No headers/currency. Example: ZARA | Cotton Shirt | XL | 450 | 12 | 5 | 10 | 650 | Blue",
            jewelry: "Analyze this jewelry bill. Extract per item: Brand, Product Name, Weight(gm), Base Rate, Making Charges%, Discount%, Qty, MRP, Purity. Do NOT calculate Net CP. Format: Brand | Product Name | Weight | Base Rate | Making% | Disc% | Qty | MRP | Purity. Missing = 0. No headers/currency. Example: TANISHQ | Gold Ring | 5.5 | 5800 | 12 | 0 | 2 | 18000 | 22K",
            grocery: "Analyze this grocery/FMCG bill. Extract per item: Brand, Product Name, Weight/Unit, Base Rate, GST%, Discount%, Qty, MRP, HSN Code, Expiry Date, and Sub-Category. For Sub-Category, choose the most appropriate from: PERSONAL CARE, STAPLES, EDIBLE OIL, SNACKS, DAIRY, BEVERAGES, HOUSEHOLD, SPICES & CONDIMENTS, BAKERY, FROZEN, PHARMACY. Do NOT calculate Net CP. Format: Brand | Product Name | Weight | Base Rate | GST% | Disc% | Qty | MRP | HSN | Expiry | Sub-Category. Missing = 0. No headers/currency. Example: SOUL | BUTTER CHKN MASALA | 65gms | 28 | 18 | 10 | 30 | 50 | 21039090 | 12/2025 | SPICES & CONDIMENTS"
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
            const categories = new Set(["CLOTHING", "JEWELRY", "PERSONAL CARE", "STAPLES", "EDIBLE OIL", "SNACKS", "DAIRY", "BEVERAGES", "HOUSEHOLD", "SPICES & CONDIMENTS", "BAKERY", "FROZEN", "PHARMACY", "STATIONERY", "ELECTRONICS"]);

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
        const baseRateInput = row.querySelector('.product-base-rate');
        const gstInput = row.querySelector('.product-gst');
        const discInput = row.querySelector('.product-disc');
        const categoryInput = row.querySelector('.product-category');
        const nameInput = row.querySelector('.product-name');
        const marginInput = document.getElementById('default-margin');

        // --- Net CP Auto-Calculate: Base Rate + GST% - Disc% ---
        function recalcNetCP() {
            const base = parseFloat(baseRateInput.value) || 0;
            const gst = parseFloat(gstInput.value) || 0;
            const disc = parseFloat(discInput.value) || 0;
            if (base > 0) {
                const afterDisc = base - (base * disc / 100);
                const netCP = afterDisc + (afterDisc * gst / 100);
                cpInput.value = netCP.toFixed(2);
                // SP ও update করা যদি manually edit না হয়
                const marginPercent = parseFloat(marginInput.value) || 0;
                if (!spManuallyEdited && marginPercent >= 0) {
                    spInput.value = Math.round(netCP + (netCP * marginPercent / 100));
                }
                calculateTotalCP();
            }
        }

        if (baseRateInput) baseRateInput.addEventListener('input', recalcNetCP);
        if (gstInput) gstInput.addEventListener('input', recalcNetCP);
        if (discInput) discInput.addEventListener('input', recalcNetCP);

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
                            if (data.name && data.name.toLowerCase().startsWith(searchText)) {
                                foundProduct = { id: doc.id, ...data };
                            }
                        });

                        // Only autofill if exact match found (typed text = full product name)
                        if (foundProduct && foundProduct.name.toLowerCase() === searchText) {
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

        // CP / SP auto-calculate
        if (cpInput && spInput && marginInput) {
            spInput.addEventListener('input', function() {
                spManuallyEdited = !!this.value;
            });

            cpInput.addEventListener('input', function() {
                const cp = parseFloat(this.value) || 0;
                const marginPercent = parseFloat(marginInput.value) || 0;
                if (cp > 0 && !spManuallyEdited) {
                    spInput.value = Math.round(cp + (cp * marginPercent / 100));
                }
            });

            marginInput.addEventListener('input', function() {
                const cp = parseFloat(cpInput.value) || 0;
                const marginPercent = parseFloat(this.value) || 0;
                if (cp > 0 && !spManuallyEdited) {
                    spInput.value = Math.round(cp + (cp * marginPercent / 100));
                }
            });
        }

        // Name field auto title-case format on blur
        if (nameInput) {
            nameInput.addEventListener('blur', function() {
                if (!this.readOnly && this.value.trim()) {
                    this.value = this.value.trim().toLowerCase()
                        .replace(/\b\w/g, c => c.toUpperCase());
                }
            });
            // Right-click → show browser spell suggestions (force context menu)
            nameInput.addEventListener('contextmenu', function(e) {
                // Let browser handle it natively
                e.stopPropagation();
            });
        }

        // Category auto uppercase
        if (categoryInput) {
            categoryInput.addEventListener('blur', function() {
                this.value = this.value.toUpperCase();
            });
        }

        // Dynamic inputs (Size, Color, Brand, Weight etc.) → Title Case
        row.querySelectorAll('.dynamic-input-1, .dynamic-input-2, .dynamic-input-3, .dynamic-input-4').forEach(inp => {
            inp.addEventListener('blur', function() {
                if (this.value.trim()) {
                    this.value = this.value.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
                }
            });
        });

        // Number fields → 2 decimal on blur
        [baseRateInput, gstInput, discInput, cpInput, spInput].forEach(inp => {
            if (!inp) return;
            inp.addEventListener('blur', function() {
                if (this.value !== '') this.value = parseFloat(this.value || 0).toFixed(2);
            });
        });

        // Stock → integer only
        const stockInput = row.querySelector('.product-stock');
        if (stockInput) {
            stockInput.addEventListener('blur', function() {
                if (this.value !== '') this.value = parseInt(this.value) || 0;
            });
        }

        // Barcode → trim whitespace + real-time duplicate check + autofill on blur
        const barcodeInput = row.querySelector('.product-barcode');
        if (barcodeInput) {
            barcodeInput.addEventListener('blur', function() {
                this.value = this.value.trim();
                barcodeAutoFill(this.value, row);
            });

            // Duplicate check message element
            let dupMsg = row.querySelector('.barcode-dup-msg');
            if (!dupMsg) {
                dupMsg = document.createElement('div');
                dupMsg.className = 'barcode-dup-msg';
                dupMsg.style.cssText = 'display:none; margin-top:4px; padding:6px 10px; background:#fff5f5; border:1px solid #fecaca; border-radius:6px; font-size:12px; color:#dc2626; font-weight:600;';
                barcodeInput.parentElement.appendChild(dupMsg);
            }

            let barcodeDebounceTimer;
            barcodeInput.addEventListener('input', function() {
                const val = this.value.trim();
                dupMsg.style.display = 'none';
                clearTimeout(barcodeDebounceTimer);
                if (!val || !activeShopId) return;

                // Check other rows instantly (no DB call)
                const otherRows = Array.from(productsTbody.querySelectorAll('tr')).filter(r => r !== row);
                const inTableDup = otherRows.find(r => r.querySelector('.product-barcode')?.value.trim() === val);
                if (inTableDup) {
                    dupMsg.textContent = `⚠️ Ei table-e arekti row-e ei barcode ache`;
                    dupMsg.style.display = 'block';
                    return;
                }

                // Firestore check with 500ms debounce
                barcodeDebounceTimer = setTimeout(async () => {
                    try {
                        const productSnap = await getDoc(doc(db, 'shops', activeShopId, 'inventory', val));
                        if (productSnap.exists()) {
                            dupMsg.textContent = `❌ Duplicate! "${productSnap.data().name}" te already ei barcode ache`;
                            dupMsg.style.display = 'block';
                        }
                    } catch (e) { /* ignore */ }
                }, 500);
            });
        }

        // Enter key → next input focus
        const allInputs = Array.from(row.querySelectorAll('input:not([type="file"]):not([type="checkbox"])'));
        allInputs.forEach((input, idx) => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const next = allInputs[idx + 1];
                    if (next) {
                        next.focus();
                    } else {
                        // Last field e Enter → new row add kore focus
                        const addBtn = document.getElementById('add-row-btn');
                        if (addBtn) addBtn.click();
                        setTimeout(() => {
                            const newRow = productsTbody.querySelector('tr:last-child');
                            if (newRow) newRow.querySelector('input')?.focus();
                        }, 50);
                    }
                }
                // Escape → field clear
                if (e.key === 'Escape') {
                    input.value = '';
                    input.focus();
                }
                // Up/Down arrow → +1/-1 for number fields
                if (input.type === 'number') {
                    if (e.key === 'ArrowUp') { e.preventDefault(); input.value = (parseFloat(input.value) || 0) + 1; input.dispatchEvent(new Event('input')); }
                    if (e.key === 'ArrowDown') { e.preventDefault(); input.value = Math.max(0, (parseFloat(input.value) || 0) - 1); input.dispatchEvent(new Event('input')); }
                }
            });
        });

        // Image tabs setup
        const imgWrap    = row.querySelector('.img-input-wrap');
        const tabBtns    = row.querySelectorAll('.img-tab-btn');
        const tabContents = row.querySelectorAll('.img-tab-content');
        const preview    = row.querySelector('.product-image-preview');

        function showPreview(src) {
            if (src) { preview.src = src; preview.style.display = 'block'; }
            else { preview.style.display = 'none'; }
        }

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                tabContents.forEach(c => c.style.display = c.dataset.tab === tab ? 'block' : 'none');
            });
        });

        // File preview
        const fileInput = row.querySelector('.product-image');
        if (fileInput) {
            fileInput.addEventListener('change', function() {
                if (this.files[0]) {
                    const reader = new FileReader();
                    reader.onload = e => {
                        showPreview(e.target.result);
                        // Clothing mode-এ color auto-detect
                        const colorInput = row.querySelector('.dynamic-input-2');
                        if (colorInput && !colorInput.value && window.currentActiveMode === 'clothing') {
                            detectDominantColor(e.target.result, colorInput);
                        }
                    };
                    reader.readAsDataURL(this.files[0]);
                }
            });
        }

        // URL preview
        const urlInput = row.querySelector('.product-image-url');
        if (urlInput) {
            urlInput.addEventListener('input', function() {
                showPreview(this.value.trim());
            });
        }

        // Paste zone
        const pasteZone  = row.querySelector('.row-paste-zone');
        const pasteInput = row.querySelector('.row-paste-input');
        const pasteHint  = row.querySelector('.row-paste-hint');
        const pasteStatus = row.querySelector('.row-paste-status');

        if (pasteZone && pasteInput) {
            pasteZone.addEventListener('click', () => pasteInput.focus());

            pasteInput.addEventListener('paste', async e => {
                e.preventDefault();
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        const file = item.getAsFile();
                        // instant preview
                        const reader = new FileReader();
                        reader.onload = ev => {
                            showPreview(ev.target.result);
                            // Clothing mode-এ color auto-detect (paste zone)
                            const colorInput = row.querySelector('.dynamic-input-2');
                            if (colorInput && !colorInput.value && window.currentActiveMode === 'clothing') {
                                detectDominantColor(ev.target.result, colorInput);
                            }
                        };
                        reader.readAsDataURL(file);

                        if (pasteHint) pasteHint.style.display  = 'none';
                        pasteStatus.style.display = 'inline';
                        pasteStatus.textContent   = '\u23f3 Uploading...';

                        const url = await uploadImageToImgBB(file);
                        pasteInput.innerHTML = '';

                        if (url) {
                            showPreview(url);
                            // URL tab e switch
                            tabBtns.forEach(b => b.classList.remove('active'));
                            row.querySelector('.img-tab-btn[data-tab="url"]').classList.add('active');
                            tabContents.forEach(c => c.style.display = c.dataset.tab === 'url' ? 'block' : 'none');
                            urlInput.value = url;
                            pasteStatus.textContent = '\u2705 Done!';
                        } else {
                            pasteStatus.textContent = '\u274c Failed';
                        }
                        break;
                    }
                }
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
            const baseRate = row.querySelector('.product-base-rate')?.value || '';
            const gst = row.querySelector('.product-gst')?.value || '';
            const disc = row.querySelector('.product-disc')?.value || '';
            const cp = row.querySelector('.product-cp').value;
            const sp = row.querySelector('.product-sp').value;
            const barcode = row.querySelector('.product-barcode').value;
            const stock = row.querySelector('.product-stock').value;

            if (name || cp || stock) {
                data.push({ name, category, extra1, extra2, extra3, extra4, baseRate, gst, disc, cp, sp, barcode, stock });
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
                        if (lastRow.querySelector('.product-base-rate')) lastRow.querySelector('.product-base-rate').value = item.baseRate || '';
                        if (lastRow.querySelector('.product-gst')) lastRow.querySelector('.product-gst').value = item.gst || '';
                        if (lastRow.querySelector('.product-disc')) lastRow.querySelector('.product-disc').value = item.disc || '';
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

            // Clone data from Inventory (if redirected via Clone button)
            const clonedData = localStorage.getItem('cloned_product');
            if (clonedData) {
                try {
                    const data = JSON.parse(clonedData);
                    localStorage.removeItem('cloned_product');
                    if (productsTbody.children.length === 0) addProductRow();
                    const row = productsTbody.querySelector('tr:last-child');
                    row.querySelector('.product-name').value = data.name || '';
                    row.querySelector('.product-category').value = data.category || '';
                    row.querySelector('.product-cp').value = data.costPrice || '';
                    row.querySelector('.product-sp').value = data.sellingPrice || '';
                    if (row.querySelector('.dynamic-input-1')) row.querySelector('.dynamic-input-1').value = data.extraField1 || '';
                    if (row.querySelector('.dynamic-input-2')) row.querySelector('.dynamic-input-2').value = data.extraField2 || '';
                    if (row.querySelector('.product-base-rate')) row.querySelector('.product-base-rate').value = '';
                    row.style.backgroundColor = '#e0f2fe';
                    setTimeout(() => row.style.backgroundColor = '', 1500);
                    showStatus(`👯 Clone: "${data.name}" এর ডেটা কপি হয়েছে!`, 'success');
                    calculateTotalCP();
                } catch (e) {
                    localStorage.removeItem('cloned_product');
                }
            }
            
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
            <td data-label="Product Name"><input type="text" class="product-name" placeholder="e.g., Lux Soap" spellcheck="true" lang="en" autocorrect="on" autocapitalize="words" required></td>
            <td data-label="Category"><input type="text" class="product-category" placeholder="e.g., Cosmetics" list="category-list" required></td>
            <td data-label="${config.head1}"><input type="text" class="dynamic-input-1" placeholder="${config.p1}"></td>
            <td data-label="${config.head2}"><input type="text" class="dynamic-input-2" placeholder="${config.p2}"></td>
            ${extraCols}
            <td data-label="Base Rate"><input type="number" step="0.01" class="product-base-rate" placeholder="0.00"></td>
            <td data-label="GST%"><input type="number" step="0.01" class="product-gst" placeholder="0" min="0" max="100"></td>
            <td data-label="Disc%"><input type="number" step="0.01" class="product-disc" placeholder="0" min="0" max="100"></td>
            <td data-label="Cost Price"><input type="number" step="0.01" class="product-cp" placeholder="0.00" required></td>
            <td data-label="Selling Price"><input type="number" step="0.01" class="product-sp" placeholder="0.00" required></td>
            <td data-label="Initial Stock"><input type="number" class="product-stock" placeholder="0" required></td>
            <td data-label="Image">
                <div class="img-input-wrap">
                    <div class="img-tabs">
                        <button type="button" class="img-tab-btn active" data-tab="file">📂</button>
                        <button type="button" class="img-tab-btn" data-tab="url">🔗</button>
                        <button type="button" class="img-tab-btn" data-tab="paste">📋</button>
                    </div>
                    <div class="img-tab-content" data-tab="file">
                        <input type="file" class="product-image" accept="image/*">
                    </div>
                    <div class="img-tab-content" data-tab="url" style="display:none;">
                        <input type="url" class="product-image-url" placeholder="Image URL">
                    </div>
                    <div class="img-tab-content" data-tab="paste" style="display:none;">
                        <div class="row-paste-zone">
                            <div contenteditable="true" class="row-paste-input"></div>
                            <span class="row-paste-status" style="display:none;"></span>
                        </div>
                    </div>
                    <img class="product-image-preview" src="" style="display:none; width:40px; height:40px; object-fit:cover; border-radius:4px; margin-top:4px; border:1px solid #ddd;">
                </div>
            </td>
            <td data-label="Barcode">
                <div class="barcode-wrapper">
                    <input type="text" class="product-barcode" placeholder="Scan or type">
                    <button type="button" class="btn-scan-row" style="background: none; border: none; cursor: pointer; font-size: 18px; padding: 2px 5px;" title="Scan with Camera">📷</button>
                </div>
            </td>
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
        if (window.toast && typeof window.toast[type] === 'function') {
            window.toast[type](message);
        } else {
            statusMessage.textContent = message;
            statusMessage.className = `status ${type}`;
            const time = type === 'error' ? 8000 : 5000;
            setTimeout(() => {
                statusMessage.textContent = '';
                statusMessage.className = 'status';
            }, time);
        }
    }

    async function uploadImageToImgBB(file) {
        // Compress image before upload (max 800px, 0.8 quality)
        const compressed = await new Promise(resolve => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const MAX = 800;
                let w = img.width, h = img.height;
                if (w > MAX || h > MAX) {
                    if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                    else { w = Math.round(w * MAX / h); h = MAX; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', 0.8);
            };
            img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
            img.src = url;
        });

        const formData = new FormData();
        formData.append('image', compressed);

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

    // Barcode autofill function (reusable)
    async function barcodeAutoFill(barcode, row) {
        if (!barcode || !activeShopId) return;
        try {
            // First try direct doc lookup (barcode = docId)
            let data = null;
            const directSnap = await getDoc(doc(db, 'shops', activeShopId, 'inventory', barcode));
            if (directSnap.exists()) {
                data = directSnap.data();
            } else {
                // Fallback: query by barcode field (clothing mode uses barcode_COLOR as docId)
                const { getDocs, query: fsQuery, where } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
                const q = fsQuery(collection(db, 'shops', activeShopId, 'inventory'), where('barcode', '==', barcode));
                const snap = await getDocs(q);
                if (!snap.empty) data = snap.docs[0].data();
            }

            if (data) {
                row.querySelector('.product-name').value = data.name || '';
                row.querySelector('.product-category').value = data.category || '';
                row.querySelector('.product-cp').value = data.costPrice || 0;
                row.querySelector('.product-sp').value = data.sellingPrice || 0;
                if (row.querySelector('.dynamic-input-1')) row.querySelector('.dynamic-input-1').value = data.extraField1 || '';
                if (row.querySelector('.dynamic-input-2')) row.querySelector('.dynamic-input-2').value = data.extraField2 || '';
                row.style.backgroundColor = '#e8f5e9';
                showStatus(`Product "${data.name}" found! You can change color/size if needed.`, 'success');
                row.querySelector('.product-name').readOnly = true;
                row.querySelector('.product-category').readOnly = true;
            } else {
                row.style.backgroundColor = '';
                row.querySelector('.product-name').readOnly = false;
                row.querySelector('.product-category').readOnly = false;
            }
        } catch (error) {
            console.error("Error fetching product:", error);
        }
    }

    // Barcode change event (focus lost or scanner)
    productsTbody.addEventListener('change', async (e) => {
        if (e.target.classList.contains('product-barcode')) {
            await barcodeAutoFill(e.target.value.trim(), e.target.closest('tr'));
        }
    });

    addRowBtn.addEventListener('click', () => {
        addProductRow();
        calculateTotalCP();
    });

    // --- SKU Variation Generator ---
    const btnGenerateSKU = document.getElementById('btn-generate-sku');
    let skuSizeIndex = 0; // track kora hobe kon size er turn

    if (btnGenerateSKU) {
        btnGenerateSKU.addEventListener('click', () => {
            const sizesRaw = document.getElementById('sku-sizes').value.trim();
            const colorsRaw = document.getElementById('sku-colors').value.trim();
            const qtyEach = parseInt(document.getElementById('sku-qty').value) || 1;

            if (!colorsRaw) { alert('Color er list dite hobe!'); return; }

            const sizes = sizesRaw ? sizesRaw.split(',').map(s => s.trim()).filter(Boolean) : [''];
            const colors = colorsRaw.split(',').map(c => c.trim()).filter(Boolean);

            // First row theke product info nao
            const firstRow = productsTbody.querySelector('tr');
            if (!firstRow || !firstRow.querySelector('.product-name').value.trim()) {
                alert('Prothome first row e product name, CP, SP fill koro!');
                return;
            }

            const baseInfo = {
                name: firstRow.querySelector('.product-name').value.trim(),
                category: firstRow.querySelector('.product-category').value.trim(),
                cp: firstRow.querySelector('.product-cp').value,
                sp: firstRow.querySelector('.product-sp').value,
                baseRate: firstRow.querySelector('.product-base-rate')?.value || '',
                gst: firstRow.querySelector('.product-gst')?.value || '',
                disc: firstRow.querySelector('.product-disc')?.value || '',
            };

            if (!baseInfo.cp) { alert('First row e CP fill koro!'); return; }

            // Reset index if sizes changed or all done
            if (skuSizeIndex >= sizes.length) skuSizeIndex = 0;

            const currentSize = sizes[skuSizeIndex];

            // Add colors for this size
            colors.forEach(color => {
                addProductRow();
                const newRow = productsTbody.querySelector('tr:last-child');
                newRow.querySelector('.product-name').value = baseInfo.name;
                newRow.querySelector('.product-category').value = baseInfo.category;
                if (newRow.querySelector('.product-base-rate')) newRow.querySelector('.product-base-rate').value = baseInfo.baseRate;
                if (newRow.querySelector('.product-gst')) newRow.querySelector('.product-gst').value = baseInfo.gst;
                if (newRow.querySelector('.product-disc')) newRow.querySelector('.product-disc').value = baseInfo.disc;
                newRow.querySelector('.product-cp').value = baseInfo.cp;
                newRow.querySelector('.product-sp').value = baseInfo.sp;
                newRow.querySelector('.product-stock').value = qtyEach;
                newRow.querySelector('.dynamic-input-1').value = currentSize;
                newRow.querySelector('.dynamic-input-2').value = color;
                newRow.querySelector('.product-barcode').value = '';
                newRow.style.backgroundColor = '#fce4ec';
                setTimeout(() => newRow.style.backgroundColor = '', 1500);
            });

            skuSizeIndex++;

            // Button label update
            const nextSize = sizes[skuSizeIndex] || sizes[0];
            btnGenerateSKU.textContent = skuSizeIndex < sizes.length
                ? `⚡ Add "${nextSize}" (${colors.length} colors)`
                : `⚡ Add "${sizes[0]}" again`;

            calculateTotalCP();
            saveTableToLocal();
            showStatus(`✅ "${currentSize}" size er ${colors.length}ti color row add hoyeche!`, 'success');
        });

        // Size/color input change hole button reset koro
        ['sku-sizes', 'sku-colors'].forEach(id => {
            document.getElementById(id)?.addEventListener('input', () => {
                skuSizeIndex = 0;
                const sizesRaw = document.getElementById('sku-sizes').value.trim();
                const sizes = sizesRaw ? sizesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
                btnGenerateSKU.textContent = sizes.length > 0 ? `⚡ Add "${sizes[0]}" colors` : '⚡ Generate Rows';
            });
        });
    }

    // --- Bulk Row Generator ---
    const btnGenerateBulk = document.getElementById('btn-generate-bulk');
    if (btnGenerateBulk) {
        btnGenerateBulk.addEventListener('click', () => {
            const qty = parseInt(document.getElementById('bulk-qty').value) || 0;
            if (qty <= 0) { alert('সঠিক সংখ্যা লিখুন!'); return; }

            const firstRow = productsTbody.querySelector('tr');
            if (!firstRow || !firstRow.querySelector('.product-name').value.trim()) {
                alert('প্রথমে প্রথম রো-তে প্রোডাক্টের নাম এবং দাম লিখুন!');
                return;
            }

            const baseInfo = {
                name: firstRow.querySelector('.product-name').value.trim(),
                category: firstRow.querySelector('.product-category').value.trim(),
                cp: firstRow.querySelector('.product-cp').value,
                sp: firstRow.querySelector('.product-sp').value,
                baseRate: firstRow.querySelector('.product-base-rate')?.value || '',
                gst: firstRow.querySelector('.product-gst')?.value || '',
                disc: firstRow.querySelector('.product-disc')?.value || '',
            };

            for (let i = 0; i < qty; i++) {
                addProductRow();
                const newRow = productsTbody.querySelector('tr:last-child');
                newRow.querySelector('.product-name').value = baseInfo.name;
                newRow.querySelector('.product-category').value = baseInfo.category;
                if (newRow.querySelector('.product-base-rate')) newRow.querySelector('.product-base-rate').value = baseInfo.baseRate;
                if (newRow.querySelector('.product-gst')) newRow.querySelector('.product-gst').value = baseInfo.gst;
                if (newRow.querySelector('.product-disc')) newRow.querySelector('.product-disc').value = baseInfo.disc;
                newRow.querySelector('.product-cp').value = baseInfo.cp;
                newRow.querySelector('.product-sp').value = baseInfo.sp;
                newRow.style.backgroundColor = '#e0f2fe';
                setTimeout(() => newRow.style.backgroundColor = '', 1000);
            }
            showStatus(`✅ ${qty}টি রো তৈরি হয়েছে! এবার ছবি আপলোড করুন।`, 'success');
            calculateTotalCP();
            saveTableToLocal();
        });
    }

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
                general: `<strong>Format:</strong> Product Name | Base Rate | GST% | Disc% | Qty | MRP | Category | Rack | Remark<br>
                         <strong>Example:</strong> Lux Soap | 22.50 | 18 | 5 | 50 | 30 | COSMETICS | A-12 | Fragrant`,

                clothing: `<strong>Format:</strong> Brand | Product Name | Size | Base Rate | GST% | Disc% | Qty | MRP | Color<br>
                          <strong>Example:</strong> ZARA | Cotton Shirt | XL | 450 | 12 | 5 | 10 | 650 | Blue`,

                jewelry: `<strong>Format:</strong> Brand | Product Name | Weight(gm) | Base Rate | Making% | Disc% | Qty | MRP | Purity<br>
                         <strong>Example:</strong> TANISHQ | Gold Ring | 5.5 | 5800 | 12 | 0 | 2 | 18000 | 22K`,

                grocery: `<strong>Format:</strong> Brand | Product Name | Weight/Unit | Base Rate | GST% | Disc% | Qty | MRP | HSN | Expiry | Sub-Category<br>
                         <strong>Example:</strong> SOUL | BUTTER CHKN MASALA | 65gms | 28 | 18 | 10 | 30 | 50 | 21039090 | 12/2025 | SPICES & CONDIMENTS`
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
                    let name, baseRate, gst, disc, cp, qty, mrp, category, extra1, extra2, extra3, extra4;

                    if (currentMode === 'grocery') {
                        // Format: Brand | Name | Weight | Base Rate | GST% | Disc% | Qty | MRP | HSN | Expiry
                        extra1 = parts[0] || '';           // Brand
                        name   = parts[1] || '';           // Product Name
                        extra2 = parts[2] || '';           // Weight/Unit
                        baseRate = parseFloat(parts[3]) || 0;
                        gst    = parseFloat(parts[4]) || 0;
                        disc   = parseFloat(parts[5]) || 0;
                        qty    = parseInt(parts[6]) || 0;
                        mrp    = parseFloat(parts[7]) || 0;
                        extra3 = parts[8] || '';           // HSN Code
                        extra4 = parts[9] || '';           // Expiry Date
                        category = (parts[10] || 'GROCERY').trim().toUpperCase();
                    } else if (currentMode === 'clothing') {
                        // Format: Brand | Name | Size | Base Rate | GST% | Disc% | Qty | MRP | Color
                        const brand = parts[0] || '';
                        name   = `${brand} ${parts[1] || ''}`.trim().toUpperCase();
                        extra1 = parts[2] || '';           // Size
                        baseRate = parseFloat(parts[3]) || 0;
                        gst    = parseFloat(parts[4]) || 0;
                        disc   = parseFloat(parts[5]) || 0;
                        qty    = parseInt(parts[6]) || 0;
                        mrp    = parseFloat(parts[7]) || 0;
                        extra2 = parts[8] || '';           // Color
                        extra3 = ''; extra4 = '';
                        category = 'CLOTHING';
                    } else if (currentMode === 'jewelry') {
                        // Format: Brand | Name | Weight | Base Rate | Making% | Disc% | Qty | MRP | Purity
                        const brand = parts[0] || '';
                        name   = `${brand} ${parts[1] || ''}`.trim().toUpperCase();
                        extra1 = parts[2] || '';           // Weight
                        baseRate = parseFloat(parts[3]) || 0;
                        gst    = parseFloat(parts[4]) || 0;
                        disc   = parseFloat(parts[5]) || 0;
                        qty    = parseInt(parts[6]) || 0;
                        mrp    = parseFloat(parts[7]) || 0;
                        extra2 = parts[8] || '';           // Purity
                        extra3 = ''; extra4 = '';
                        category = 'JEWELRY';
                    } else {
                        // General: Name | Base Rate | GST% | Disc% | Qty | MRP | Category | Rack | Remark
                        name     = parts[0] || '';
                        baseRate = parseFloat(parts[1]) || 0;
                        gst      = parseFloat(parts[2]) || 0;
                        disc     = parseFloat(parts[3]) || 0;
                        qty      = parseInt(parts[4]) || 0;
                        mrp      = parseFloat(parts[5]) || 0;
                        category = parts[6] || '';
                        extra1   = parts[7] || '';         // Rack
                        extra2   = parts[8] || '';         // Remark
                        extra3 = ''; extra4 = '';
                    }

                    // Net CP calculate: (Base Rate - Disc%) + GST%
                    if (baseRate > 0) {
                        const afterDisc = baseRate - (baseRate * disc / 100);
                        cp = afterDisc + (afterDisc * gst / 100);
                    } else {
                        cp = 0;
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
                            
                            // টেবিলে একই নাম, CP, এবং extra fields (including color) আছে কি না চেক
                            existingRows.forEach(row => {
                                const rowName = row.querySelector('.product-name').value.trim().toUpperCase();
                                const rowExtra1 = row.querySelector('.dynamic-input-1')?.value.trim().toUpperCase() || '';
                                const rowExtra2 = row.querySelector('.dynamic-input-2')?.value.trim().toUpperCase() || '';
                                const rowCP = parseFloat(row.querySelector('.product-cp').value) || 0;
                                
                                let rowFullName = rowName;
                                if (currentMode === 'grocery' && rowExtra1 && rowExtra2) {
                                    rowFullName = `${rowExtra1} ${rowName} ${rowExtra2}`.trim().toUpperCase();
                                }
                                
                                // যদি নাম, CP এবং Color (extraField2) মিলে যায়, তাহলে duplicate
                                const nameMatch = rowFullName === fullNameToCheck;
                                const cpMatch = Math.abs(rowCP - cp) < 0.01;
                                const colorMatch = (currentMode === 'clothing') ? 
                                    (rowExtra2 === (extra2 || '').trim().toUpperCase()) : true;
                                
                                if (nameMatch && cpMatch && colorMatch) {
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
                            
                            // সব products load করে match খুঁজা (including color for clothing)
                            const allProductsSnap = await getDocs(inventoryRef);
                            let existingProduct = null;
                            
                            allProductsSnap.forEach(doc => {
                                const data = doc.data();
                                const dbName = data.name.trim().toUpperCase();
                                const dbCP = parseFloat(data.costPrice);
                                const dbColor = (data.extraField2 || '').trim().toUpperCase();
                                const currentColor = (extra2 || '').trim().toUpperCase();
                                
                                // Name এবং CP match করলে
                                const nameMatch = dbName === fullNameForDB.toUpperCase();
                                const cpMatch = Math.abs(dbCP - cp) < 0.01;
                                const colorMatch = (currentMode === 'clothing') ? (dbColor === currentColor) : true;
                                
                                if (nameMatch && cpMatch && colorMatch) {
                                    existingProduct = {
                                        id: doc.id,
                                        data: data
                                    };
                                }
                            });

                            if (existingProduct) {
                                // প্রোডাক্টটি আগে থেকেই আছে!
                                const barcode = existingProduct.data.barcode; // Actual barcode
                                const docId = existingProduct.id; // Document ID (may include color suffix)
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
                                
                                if (targetRow.querySelector('.product-base-rate')) targetRow.querySelector('.product-base-rate').value = baseRate || '';
                                if (targetRow.querySelector('.product-gst')) targetRow.querySelector('.product-gst').value = gst || '';
                                if (targetRow.querySelector('.product-disc')) targetRow.querySelector('.product-disc').value = disc || '';
                                targetRow.querySelector('.product-cp').value = cp.toFixed(2);
                                targetRow.querySelector('.product-sp').value = existingData.sellingPrice || cp;
                                targetRow.querySelector('.product-barcode').value = barcode; // Use actual barcode, not docId
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
                                
                                if (targetRow.querySelector('.product-base-rate')) targetRow.querySelector('.product-base-rate').value = baseRate || '';
                                if (targetRow.querySelector('.product-gst')) targetRow.querySelector('.product-gst').value = gst || '';
                                if (targetRow.querySelector('.product-disc')) targetRow.querySelector('.product-disc').value = disc || '';
                                targetRow.querySelector('.product-cp').value = cp.toFixed(2);
                                if (mrp && mrp > 0) {
                                    targetRow.querySelector('.product-sp').value = mrp;
                                } else {
                                    const margin = parseFloat(document.getElementById('default-margin').value) || 0;
                                    targetRow.querySelector('.product-sp').value = Math.round(cp + (cp * margin / 100));
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
                            
                            if (lastRow.querySelector('.dynamic-input-1')) lastRow.querySelector('.dynamic-input-1').value = extra1;
                            if (lastRow.querySelector('.dynamic-input-2')) lastRow.querySelector('.dynamic-input-2').value = extra2;
                            if (lastRow.querySelector('.dynamic-input-3')) lastRow.querySelector('.dynamic-input-3').value = extra3;
                            if (lastRow.querySelector('.dynamic-input-4')) lastRow.querySelector('.dynamic-input-4').value = extra4;
                            if (lastRow.querySelector('.product-base-rate')) lastRow.querySelector('.product-base-rate').value = baseRate || '';
                            if (lastRow.querySelector('.product-gst')) lastRow.querySelector('.product-gst').value = gst || '';
                            if (lastRow.querySelector('.product-disc')) lastRow.querySelector('.product-disc').value = disc || '';
                            lastRow.querySelector('.product-cp').value = cp.toFixed(2);
                            if (mrp && mrp > 0) {
                                lastRow.querySelector('.product-sp').value = mrp;
                            } else {
                                const margin = parseFloat(document.getElementById('default-margin').value) || 0;
                                lastRow.querySelector('.product-sp').value = Math.round(cp + (cp * margin / 100));
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

        const saveButton = form.querySelector('button[type="submit"]') || document.querySelector('button[type="submit"][form="add-products-form"]');
        saveButton.disabled = true;
        saveButton.textContent = 'Uploading Images & Saving...';
        
        const rows = productsTbody.querySelectorAll('tr');
        if (rows.length === 0) {
            showStatus('Please add at least one product.', 'error');
            saveButton.disabled = false; saveButton.textContent = 'Save All Products';
            return;
        }
        
        const productsToProcess = [];
        const invalidRows = [];

        for (const row of rows) {
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
                
                const currentMode = window.currentActiveMode || 'general';
                let finalName = name;
                if (currentMode === 'grocery' && extra1 && extra2) {
                    finalName = `${extra1} ${name} ${extra2}`.trim();
                }
                
                if (!category || isNaN(cp) || isNaN(sp) || isNaN(stock) || cp < 0 || sp < 0 || stock < 0) {
                    invalidRows.push(finalName);
                    continue; // skip this row, process others
                }

                let imageUrl = null;
                if (imageInput.files && imageInput.files[0]) {
                    try {
                        saveButton.textContent = `Uploading image for ${finalName}...`;
                        imageUrl = await uploadImageToImgBB(imageInput.files[0]);
                    } catch (err) {
                        console.error("Failed to upload image for " + finalName);
                    }
                } else {
                    const urlInput = row.querySelector('.product-image-url');
                    if (urlInput && urlInput.value.trim()) {
                        imageUrl = urlInput.value.trim();
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

        if (invalidRows.length > 0) {
            showStatus(`⚠️ ${invalidRows.length}ti row skip hoyeche (incomplete): ${invalidRows.slice(0,3).join(', ')}`, 'warning');
        }
        
        saveButton.textContent = 'Saving to Database...';

        try {
            // --- Barcode-based duplicate check (Priority 1) ---
            const inventoryRef = collection(db, 'shops', activeShopId, 'inventory');
            const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
            const allProductsSnapshot = await getDocs(inventoryRef);
            
            // Create maps for both barcode and name+cp+color
            const existingByBarcode = new Map(); // barcode -> {data, stock}
            const existingByNameCP = new Map();   // name+cp+color -> {barcode, stock}
            
            allProductsSnapshot.forEach(doc => {
                const data = doc.data();
                const docId = doc.id; // This is barcode or barcode_COLOR
                const barcode = data.barcode; // Actual barcode field
                
                // Map by document ID (which includes color suffix)
                existingByBarcode.set(docId, {
                    data: data,
                    stock: data.stock || 0
                });
                
                // Also map by barcode alone for lookup
                if (barcode && barcode !== docId) {
                    existingByBarcode.set(barcode, {
                        data: data,
                        stock: data.stock || 0
                    });
                }
                
                // Map by name+cp+color (extraField2 is color in clothing mode)
                const colorKey = data.extraField2 ? `_${data.extraField2.trim().toUpperCase()}` : '';
                const key = `${data.name.trim().toUpperCase()}_${data.costPrice.toFixed(2)}${colorKey}`;
                existingByNameCP.set(key, {
                    barcode: barcode,
                    docId: docId,
                    stock: data.stock || 0,
                    data: data
                });
            });
            
            // Group products with smart duplicate detection
            const groupedProducts = [];
            const processedBarcodes = new Set();
            const processedKeys = new Set();

            productsToProcess.forEach(p => {
                // Include color in key for clothing items
                const colorKey = p.extraField2 ? `_${p.extraField2.trim().toUpperCase()}` : '';
                const key = `${p.name.trim().toUpperCase()}_${p.costPrice.toFixed(2)}${colorKey}`;
                let matched = false;
                
                // Priority 1: Check by barcode + color combination (for clothing)
                if (p.barcode && existingByBarcode.has(p.barcode)) {
                    const existing = existingByBarcode.get(p.barcode);
                    const existingColor = (existing.data.extraField2 || '').trim().toUpperCase();
                    const currentColor = (p.extraField2 || '').trim().toUpperCase();
                    
                    // Check if barcode + color combination matches
                    const barcodeColorKey = `${p.barcode}_${currentColor}`;
                    
                    if (!processedBarcodes.has(barcodeColorKey) && existingColor === currentColor) {
                        groupedProducts.push({
                            ...p,
                            barcode: p.barcode,
                            stock: p.stock,
                            isUpdate: true,
                            existingStock: existing.stock
                        });
                        processedBarcodes.add(barcodeColorKey);
                        processedKeys.add(key);
                        matched = true;
                    } else if (processedBarcodes.has(barcodeColorKey)) {
                        // Same barcode + color already processed, add to stock
                        const existingInGroup = groupedProducts.find(gp => 
                            gp.barcode === p.barcode && 
                            (gp.extraField2 || '').trim().toUpperCase() === currentColor
                        );
                        if (existingInGroup) {
                            existingInGroup.stock += p.stock;
                        }
                        matched = true;
                    }
                }
                
                // Priority 2: Check by name+CP+color (if no barcode match or different color)
                if (!matched && existingByNameCP.has(key)) {
                    const existing = existingByNameCP.get(key);
                    if (!processedKeys.has(key)) {
                        groupedProducts.push({
                            ...p,
                            barcode: p.barcode || existing.barcode, // Use provided or existing barcode
                            docId: existing.docId, // Use existing document ID
                            stock: p.stock,
                            isUpdate: true,
                            existingStock: existing.stock
                        });
                        processedKeys.add(key);
                        const barcodeColorKey = `${p.barcode || existing.barcode}_${(p.extraField2 || '').trim().toUpperCase()}`;
                        processedBarcodes.add(barcodeColorKey);
                    } else {
                        // Already processed, add to stock
                        const existingInGroup = groupedProducts.find(gp => 
                            gp.name.trim().toUpperCase() === p.name.trim().toUpperCase() && 
                            Math.abs(gp.costPrice - p.costPrice) < 0.01 &&
                            (gp.extraField2 || '').trim().toUpperCase() === (p.extraField2 || '').trim().toUpperCase()
                        );
                        if (existingInGroup) {
                            existingInGroup.stock += p.stock;
                        }
                    }
                    matched = true;
                }
                
                // Priority 3: New product
                if (!matched) {
                    // Check if already in current batch (including color match)
                    const existingInGroup = groupedProducts.find(gp => 
                        gp.name.trim().toUpperCase() === p.name.trim().toUpperCase() && 
                        Math.abs(gp.costPrice - p.costPrice) < 0.01 &&
                        (gp.extraField2 || '').trim().toUpperCase() === (p.extraField2 || '').trim().toUpperCase() &&
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
                    let docId;
                    
                    if (product.isUpdate && product.docId) {
                        // Existing product - use existing document ID
                        docId = product.docId;
                        finalBarcode = product.barcode;
                    } else if (product.barcode) {
                        // New product with manual barcode
                        finalBarcode = product.barcode;
                        // Create unique document ID: barcode + color suffix for clothing
                        if (product.extraField2) {
                            const colorSuffix = product.extraField2.trim().toUpperCase().replace(/\s+/g, '_');
                            docId = `${finalBarcode}_${colorSuffix}`;
                        } else {
                            docId = finalBarcode;
                        }
                    } else {
                        // New product - generate smart barcode
                        lastProductId++;
                        finalBarcode = generateSmartBarcode(product, lastProductId);
                        // Create unique document ID
                        if (product.extraField2) {
                            const colorSuffix = product.extraField2.trim().toUpperCase().replace(/\s+/g, '_');
                            docId = `${finalBarcode}_${colorSuffix}`;
                        } else {
                            docId = finalBarcode;
                        }
                    }

                    const productRef = doc(db, 'shops', activeShopId, 'inventory', docId);
                    const productSnapshot = await transaction.get(productRef);

                    processQueue.push({
                        productData: product,
                        ref: productRef,
                        snapshot: productSnapshot,
                        finalBarcode: finalBarcode,
                        docId: docId
                    });
                }

                for (const item of processQueue) {
                    const { productData, ref, snapshot, finalBarcode, docId } = item;

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

                    // নতুন purchase এর জন্যই শুধু expense entry তৈরি হবে
                    // existing product এ stock add হলে নতুন purchase record তৈরি হবে (history)
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
                            relatedProductId: docId,
                            isRestock: productData.isUpdate || false
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
        const modal = document.getElementById('scanner-modal');
        if (html5QrCode) {
            html5QrCode.stop()
                .catch(() => {})
                .finally(() => {
                    modal.classList.add('hidden');
                    html5QrCode = null;
                });
        } else {
            modal.classList.add('hidden');
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