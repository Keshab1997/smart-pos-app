import { auth, db } from '../js/firebase-config.js';
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, orderBy, addDoc, deleteDoc, doc } from "firebase/firestore";

// --- Global State ---
let currentUserID = null, allProducts = [], selectedProducts = [], currentLabelItems = [], selectedItem = null;
const DPI = 203; // Printer DPI
const dotsPerMm = DPI / 25.4;
const previewScale = 4; 

// --- DOM Elements ---
const productListEl = document.getElementById('product-list'), searchInput = document.getElementById('search-product');
const selectedCountEl = document.getElementById('selected-count'), templateSelectEl = document.getElementById('template-select');
const previewAreaEl = document.querySelector('.preview-area'), printBtn = document.getElementById('print-btn');
const quantityInput = document.getElementById('print-quantity'), vidInput = document.getElementById('printer-vid');
const pidInput = document.getElementById('printer-pid'), saveSettingsBtn = document.getElementById('save-settings-btn');
const templateDescriptionEl = document.getElementById('template-description'), customSizeSettingsEl = document.getElementById('custom-size-settings');
const customWidthInput = document.getElementById('custom-width'), customHeightInput = document.getElementById('custom-height');
const customColumnsInput = document.getElementById('custom-columns'), customColumnGapInput = document.getElementById('custom-columngap');
const propertiesPanelEl = document.getElementById('properties-panel'), propItemNameEl = document.getElementById('prop-item-name');
const propXInput = document.getElementById('prop-x'), propYInput = document.getElementById('prop-y');
const textPropertiesEl = document.getElementById('text-properties'), barcodePropertiesEl = document.getElementById('barcode-properties');
const propFontSizeInput = document.getElementById('prop-fontsize'), propWidthInput = document.getElementById('prop-width');
const propHeightInput = document.getElementById('prop-height');

// --- Dynamic Buttons ---
const saveTemplateBtn = document.createElement('button');
saveTemplateBtn.textContent = "Save to Cloud";
saveTemplateBtn.className = "btn-secondary"; 
saveTemplateBtn.style.marginTop = "10px";
saveTemplateBtn.style.backgroundColor = "#4CAF50"; 
saveTemplateBtn.style.color = "white";
saveTemplateBtn.style.border = "none";
saveTemplateBtn.style.padding = "5px 10px";
saveTemplateBtn.style.cursor = "pointer";
customSizeSettingsEl.appendChild(saveTemplateBtn);

const deleteTemplateBtn = document.createElement('button');
deleteTemplateBtn.textContent = "Delete Template";
deleteTemplateBtn.style.marginLeft = "10px";
deleteTemplateBtn.style.backgroundColor = "#f44336";
deleteTemplateBtn.style.color = "white";
deleteTemplateBtn.style.border = "none";
deleteTemplateBtn.style.padding = "5px 10px";
deleteTemplateBtn.style.cursor = "pointer";
deleteTemplateBtn.classList.add('hidden'); 
templateSelectEl.parentNode.insertBefore(deleteTemplateBtn, templateSelectEl.nextSibling);


// --- Templates Definition ---
let templates = {
    'custom': {
        name: 'Create Custom Size...', width: 50, height: 25, columns: 1, columnGap: 2,
        items: [
            { placeholder: 'name', type: 'text', x: 2, y: 3, options: { font: 'TSS24.BF2', size: 1 } },
            { placeholder: 'price', type: 'text', x: 2, y: 10, options: { font: 'TSS24.BF2', size: 1, prefix: 'Price: ' } },
            { placeholder: 'barcode', type: 'barcode', x: 2, y: 15, options: { type: '128', height: 8, human_readable: 0, width: 46 } }
        ]
    },
    
    // --- NEW: True-Ally 100mm x 15mm (Horizontal/No Rotation) ---
    '100x15_jewelry_horizontal': {
        name: 'True-Ally 100mm x 15mm (Jewelry Horizontal)', 
        width: 100,  // এখানে Width 100 ধরা হয়েছে যাতে সোজা প্রিন্ট হয়
        height: 15,  // Height 15mm
        columns: 1, 
        columnGap: 0,
        items: [
            // --- বাম পাশ (Left Wing): নাম এবং দাম ---
            // Rotation 0 (সোজা থাকবে)
            { 
                placeholder: 'name', 
                type: 'text', 
                x: 5,   // বাম থেকে ৫ মিমি সরে
                y: 3,   // উপর থেকে ৩ মিমি নিচে
                options: { font: '2', size: 1, rotation: 0 } 
            },
            { 
                placeholder: 'price', 
                type: 'text', 
                x: 5, 
                y: 8,   // নামের নিচে
                options: { font: '2', size: 1, prefix: 'Tk. ', rotation: 0 } 
            },

            // --- ডান পাশ (Right Wing): বারকোড ---
            // মাঝখানের লেজ (Tail) বাদ দিয়ে ডান পাশে বারকোড বসবে।
            // 100mm এর মধ্যে আনুমানিক 55mm বা 60mm এর পর।
            { 
                placeholder: 'barcode', 
                type: 'barcode', 
                x: 60,  // ডান দিকে সরে যাবে
                y: 2,   // উপর থেকে ২ মিমি নিচে
                options: { 
                    type: '128', 
                    height: 8,  // বারকোডের উচ্চতা
                    human_readable: 0, // সংখ্যা দেখাবে না (জায়গা বাঁচানোর জন্য)
                    width: 1,   // চিকন বারকোড
                    rotation: 0 // সোজা থাকবে (No 90 degree)
                } 
            }
        ]
    },
        // --- এই অংশটুকু আপনার templates অবজেক্টের ভেতরে পেস্ট করুন ---
    
        '100x15_jewelry_image_spec': {
            name: 'Jewelry Tag 100x15mm (Tail 30mm + Body 70mm)', 
            width: 100,  // মোট দৈর্ঘ্য ১০০ মিমি
            height: 15,  // উচ্চতা ১৫ মিমি
            columns: 1, 
            columnGap: 0,
            items: [
                // --- অংশ ১: নাম এবং দাম (মাঝখানের অংশ - 35mm) ---
                // টেইল ৩০ মিমি, তাই আমরা লেখা শুরু করব ৩২ মিমি থেকে।
                { 
                    placeholder: 'name', 
                    type: 'text', 
                    x: 32,   // 30mm (Tail) + 2mm Margin
                    y: 2,    
                    options: { font: '2', size: 1, rotation: 0 } 
                },
                { 
                    placeholder: 'price', 
                    type: 'text', 
                    x: 32, 
                    y: 7,    // নামের নিচে
                    options: { font: '2', size: 1, prefix: 'Rs. ', rotation: 0 } 
                },
    
                // --- অংশ ২: বারকোড (ডান পাশের অংশ - 35mm) ---
                // ৩০ মিমি (টেইল) + ৩৫ মিমি (অংশ ১) = ৬৫ মিমি। 
                // তাই বারকোড শুরু হবে ৬৫ মিমির পরে (ধরি ৬৭ মিমি)।
                { 
                    placeholder: 'barcode', 
                    type: 'barcode', 
                    x: 67,  // 65mm + 2mm Margin
                    y: 2,   
                    options: { 
                        type: '128', 
                        height: 7,  // বারকোড খুব বেশি বড় করা যাবে না
                        human_readable: 0, // জায়গা কম তাই বারকোডের নিচে সংখ্যা অফ রাখা ভালো
                        width: 1,   // জুয়েলারি ট্যাগের জন্য চিকন বার (Narrow bar 1) জরুরি
                        rotation: 0 
                    } 
                }
            ]
        },

    // --- আগের টেমপ্লেট ---
    '101x25_2_col_special': {
        name: '101x25mm - 2 Col (Sada Kalo Layout)', width: 101.6, height: 25.4, columns: 2, columnGap: 2,
        items: [
            { placeholder: 'name', type: 'text', x: 20.75, y: 1.4, options: { font: '2', size: 1.8 } },
            { placeholder: 'price', type: 'text', x: 15.6, y: 5.75, options: { font: '2', size: 1, prefix: 'Rs. ' } },
            { placeholder: 'barcode', type: 'barcode', x: 18.4, y: 10.4, options: { type: '128', height: 8, human_readable: 1, width: 45 } }
        ]
    },
    '50x25_2_col': {
        name: '50x25mm - 2 Columns (Jewellery)', width: 50, height: 25, columns: 2, columnGap: 3,
        items: [
            { placeholder: 'name', type: 'text', x: 1, y: 3, options: { font: '1', size: 1 } },
            { placeholder: 'price', type: 'text', x: 1, y: 12, options: { font: '1', size: 2, prefix: 'Rs.' } }
        ]
    },
    '40x30_1_col_detailed': {
        name: '40x30mm - 1 Column Detailed', width: 40, height: 30, columns: 1, columnGap: 0,
        items: [
            { placeholder: 'name', type: 'text', x: 2, y: 3, options: { font: '2', size: 1 } },
            { placeholder: 'barcode', type: 'barcode', x: 2, y: 10, options: { type: '128', height: 12, human_readable: 1, width: 36 } },
            { placeholder: 'price', type: 'text', x: 2, y: 25, options: { font: '2', size: 1, prefix: 'Price: ' } }
        ]
    }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, user => {
        if (user) {
            currentUserID = user.uid;
            loadPrinterSettings();
            loadUserTemplates(); 
            fetchProducts();
        } else {
            window.location.href = '../index.html';
        }
    });

    searchInput.addEventListener('input', renderProductList);
    templateSelectEl.addEventListener('change', handleTemplateChange);
    
    [customWidthInput, customHeightInput, customColumnsInput, customColumnGapInput].forEach(el => el.addEventListener('input', () => { 
        if(templateSelectEl.value === 'custom') updatePreview(); 
    }));

    [propXInput, propYInput, propFontSizeInput, propWidthInput, propHeightInput].forEach(el => el.addEventListener('change', e => updateSelectedItemProperty(e.target.id.replace('prop-', ''), e.target.value)));
    
    printBtn.addEventListener('click', handlePrint);
    saveSettingsBtn.addEventListener('click', savePrinterSettings);
    saveTemplateBtn.addEventListener('click', saveCustomTemplateToFirebase);
    deleteTemplateBtn.addEventListener('click', deleteCustomTemplateFromFirebase);
    document.addEventListener('keydown', handleKeyboardShortcuts);
});

// --- Functions (No Change Here) ---
async function loadUserTemplates() {
    if (!currentUserID) return;
    try {
        const q = query(collection(db, 'shops', currentUserID, 'templates'));
        const querySnapshot = await getDocs(q);
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            templates[doc.id] = { ...data, isCustom: true, firebaseID: doc.id };
        });
        populateTemplates();
    } catch (error) {
        console.error("Error loading templates:", error);
        populateTemplates();
    }
}

async function saveCustomTemplateToFirebase() {
    if (templateSelectEl.value !== 'custom') {
        alert("Please switch to 'Create Custom Size' to save a new template.");
        return;
    }
    const name = prompt("Enter a name for your new template:");
    if (!name) return;
    const newTemplate = {
        name: name,
        width: parseFloat(customWidthInput.value) || 50,
        height: parseFloat(customHeightInput.value) || 25,
        columns: parseInt(customColumnsInput.value) || 1,
        columnGap: parseFloat(customColumnGapInput.value) || 2,
        items: JSON.parse(JSON.stringify(currentLabelItems)),
        createdAt: new Date()
    };
    try {
        const docRef = await addDoc(collection(db, 'shops', currentUserID, 'templates'), newTemplate);
        templates[docRef.id] = { ...newTemplate, isCustom: true, firebaseID: docRef.id };
        populateTemplates();
        templateSelectEl.value = docRef.id;
        handleTemplateChange();
        showStatus("Template saved to cloud!", "success");
    } catch (error) {
        console.error("Error saving template:", error);
    }
}

async function deleteCustomTemplateFromFirebase() {
    const id = templateSelectEl.value;
    const template = templates[id];
    if (!template || !template.isCustom) {
        alert("You can only delete custom saved templates.");
        return;
    }
    if (confirm(`Are you sure you want to delete '${template.name}'?`)) {
        try {
            await deleteDoc(doc(db, 'shops', currentUserID, 'templates', id));
            delete templates[id];
            populateTemplates();
            templateSelectEl.value = 'custom';
            handleTemplateChange();
            showStatus("Template deleted.", "success");
        } catch (error) {
            console.error("Error deleting template:", error);
        }
    }
}

async function fetchProducts() {
    if (!currentUserID) return;
    try {
        const q = query(collection(db, 'shops', currentUserID, 'inventory'), orderBy('name'));
        const querySnapshot = await getDocs(q);
        allProducts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProductList();
    } catch (error) {
        console.error("Error fetching products:", error);
        productListEl.innerHTML = '<p>Failed to load products.</p>';
    }
}

function renderProductList() {
    const filter = searchInput.value.toLowerCase();
    const filteredProducts = allProducts.filter(p => 
        p.name.toLowerCase().includes(filter) || (p.barcode && p.barcode.toLowerCase().includes(filter))
    );
    productListEl.innerHTML = '';
    filteredProducts.forEach(product => {
        const li = document.createElement('li');
        li.dataset.id = product.id;
        li.innerHTML = `<input type="checkbox" ${selectedProducts.some(p => p.id === product.id) ? 'checked' : ''}> <span class="product-name">${product.name}</span> <span class="product-barcode">${product.barcode || 'N/A'}</span>`;
        li.addEventListener('click', () => toggleProductSelection(product, li));
        if (selectedProducts.some(p => p.id === product.id)) { li.classList.add('selected'); }
        productListEl.appendChild(li);
    });
}

function toggleProductSelection(product, liElement) {
    const index = selectedProducts.findIndex(p => p.id === product.id);
    const checkbox = liElement.querySelector('input[type="checkbox"]');
    if (index > -1) {
        selectedProducts.splice(index, 1);
        liElement.classList.remove('selected');
        checkbox.checked = false;
    } else {
        selectedProducts.push(product);
        liElement.classList.add('selected');
        checkbox.checked = true;
    }
    selectedCountEl.textContent = selectedProducts.length;
    updatePreview();
}

function populateTemplates() {
    templateSelectEl.innerHTML = '';
    Object.keys(templates).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = templates[key].name;
        templateSelectEl.appendChild(option);
    });
}

function handleTemplateChange() {
    const val = templateSelectEl.value;
    const isCustomMode = val === 'custom';
    const t = templates[val];
    
    customSizeSettingsEl.classList.toggle('hidden', !isCustomMode);
    templateDescriptionEl.classList.toggle('hidden', isCustomMode);

    if (t && t.isCustom) { deleteTemplateBtn.classList.remove('hidden'); } 
    else { deleteTemplateBtn.classList.add('hidden'); }

    if (!isCustomMode) {
        templateDescriptionEl.textContent = `Size: ${t.width}mm x ${t.height}mm. ${t.columns > 1 ? t.columns + ' stickers.' : ''}`;
        currentLabelItems = JSON.parse(JSON.stringify(t.items)); 
    } else {
        if(currentLabelItems.length === 0) currentLabelItems = JSON.parse(JSON.stringify(t.items));
    }
    updatePreview();
}

function updatePreview() {
    if (selectedProducts.length === 0) {
        previewAreaEl.innerHTML = '<p>Select a product to see a preview.</p>';
        return;
    }
    
    const templateKey = templateSelectEl.value;
    let template = JSON.parse(JSON.stringify(templates[templateKey]));
    
    if (templateKey === 'custom') {
        Object.assign(template, {
            width: parseFloat(customWidthInput.value) || 50,
            height: parseFloat(customHeightInput.value) || 25,
            columns: parseInt(customColumnsInput.value) || 1,
            columnGap: parseFloat(customColumnGapInput.value) || 2
        });
    }

    previewAreaEl.innerHTML = '';
    selectedItem = null;
    propertiesPanelEl.classList.add('hidden');

    const previewLabel = document.createElement('div');
    previewLabel.className = 'preview-label';
    Object.assign(previewLabel.style, {
        width: `${template.width * previewScale}px`,
        height: `${template.height * previewScale}px`
    });
    
    if (currentLabelItems.length === 0) {
        currentLabelItems = JSON.parse(JSON.stringify(template.items));
    }

    const columns = template.columns || 1;
    const stickerWidth = columns > 1 ? ((template.width - (template.columnGap * (columns - 1))) / columns) : template.width;
    const firstColumnItems = currentLabelItems.map((item, index) => createDraggableItem(item, selectedProducts[0], index));
    
    for (let i = 0; i < columns; i++) {
        const offsetX = i * (stickerWidth + (template.columnGap || 0));
        firstColumnItems.forEach((baseElement, index) => {
            const itemData = currentLabelItems[index];
            const el = i === 0 ? baseElement : baseElement.cloneNode(true);
            Object.assign(el.style, {
                left: `${(offsetX + itemData.x) * previewScale}px`,
                top: `${itemData.y * previewScale}px`
            });
            previewLabel.appendChild(el);
        });
    }
    previewAreaEl.appendChild(previewLabel);
}

function createDraggableItem(item, product, index) {
    const div = document.createElement('div');
    div.className = 'draggable-item';
    div.dataset.index = index;
    updateItemContent(div, item, product);
    
    interact(div).draggable({
        listeners: {
            move(event) {
                const i = parseInt(event.target.dataset.index);
                const itemData = currentLabelItems[i];
                itemData.x += event.dx / previewScale;
                itemData.y += event.dy / previewScale;
                
                document.querySelectorAll(`.draggable-item[data-index='${i}']`).forEach(el => {
                    el.style.left = `${parseFloat(el.style.left || 0) + event.dx}px`;
                    el.style.top = `${parseFloat(el.style.top || 0) + event.dy}px`;
                });
                
                if (selectedItem && selectedItem.index === i) {
                    updatePropertiesPanel(itemData);
                }
            }
        },
        modifiers: [interact.modifiers.restrictRect({ restriction: 'parent' })]
    }).on('tap', e => selectItem(parseInt(e.currentTarget.dataset.index)));
    
    return div;
}

function updateItemContent(div, item, product) {
    div.innerHTML = '';
    let value = '';
    if (item.options.text) { value = item.options.text; } 
    else {
        let productValue = product[item.placeholder] || '';
        if (item.placeholder === 'price' && product.sellingPrice) {
            productValue = parseFloat(product.sellingPrice).toFixed(2);
        }
        value = (item.options.prefix || '') + productValue;
    }
    
    if (item.type === 'text') {
        div.textContent = value;
        const scaleFactor = item.options.size || 1;
        const fontSize = (item.options.font && item.options.font.includes('TSS') ? 24 : 12) * scaleFactor;
        div.style.fontSize = `${fontSize * previewScale / dotsPerMm}px`;
        if(item.options.font === '2') div.style.fontWeight = 'bold';
    } 
    else if (item.type === 'barcode' && product.barcode) {
        div.classList.add('barcode');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        div.appendChild(svg);
        try {
            JsBarcode(svg, product.barcode, {
                format: "CODE128",
                displayValue: item.options.human_readable === 1,
                width: 2, 
                height: 40, 
                margin: 0,
                font: "Arial",
                fontSize: 12
            });
            Object.assign(div.style, {
                width: `${(item.options.width || 30) * previewScale}px`,
                height: `${(item.options.height || 10) * previewScale}px`
            });
        } catch (e) { div.innerHTML = '<span>Invalid Barcode</span>'; }
    }
}

function selectItem(index) {
    document.querySelectorAll('.draggable-item.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll(`.draggable-item[data-index='${index}']`).forEach(el => el.classList.add('selected'));
    selectedItem = { index: index };
    updatePropertiesPanel(currentLabelItems[index]);
    propertiesPanelEl.classList.remove('hidden');
}

function updatePropertiesPanel(itemData) {
    propItemNameEl.textContent = itemData.placeholder.charAt(0).toUpperCase() + itemData.placeholder.slice(1);
    propXInput.value = itemData.x.toFixed(1);
    propYInput.value = itemData.y.toFixed(1);
    const isText = itemData.type === 'text';
    textPropertiesEl.classList.toggle('hidden', !isText);
    barcodePropertiesEl.classList.toggle('hidden', isText);
    if (isText) { propFontSizeInput.value = itemData.options.size; } 
    else { propWidthInput.value = itemData.options.width; propHeightInput.value = itemData.options.height; }
}

function updateSelectedItemProperty(prop, value) {
    if (!selectedItem) return;
    const index = selectedItem.index;
    const itemData = currentLabelItems[index];
    const val = parseFloat(value);
    const propMap = {
        'x': (d, v) => d.x = v,
        'y': (d, v) => d.y = v,
        'fontsize': (d, v) => d.options.size = v,
        'width': (d, v) => { d.options.width = v; },
        'height': (d, v) => { d.options.height = v; },
    };
    if (propMap[prop]) { propMap[prop](itemData, val); }
    updatePreview();
    setTimeout(() => { selectItem(index); document.querySelectorAll(`.draggable-item[data-index='${index}']`).forEach(el => el.classList.add('selected')); }, 50);
}

function handleKeyboardShortcuts(e) {
    if (!selectedItem || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const index = selectedItem.index;
    const itemData = currentLabelItems[index];
    const step = e.shiftKey ? 1.0 : 0.2; 
    const keyAction = {
        'ArrowUp': () => itemData.y -= step,
        'ArrowDown': () => itemData.y += step,
        'ArrowLeft': () => itemData.x -= step,
        'ArrowRight': () => itemData.x += step,
    };
    keyAction[e.key]();
    updatePreview();
    setTimeout(() => { selectItem(index); document.querySelectorAll(`.draggable-item[data-index='${index}']`).forEach(el => el.classList.add('selected')); }, 50);
}

// --- Printing Logic (Horizontal, No Rotation) ---
function generateTSPL(product) {
    let template = JSON.parse(JSON.stringify(templates[templateSelectEl.value]));
    
    if (templateSelectEl.value === 'custom') {
        Object.assign(template, {
            width: parseFloat(customWidthInput.value) || 50,
            height: parseFloat(customHeightInput.value) || 25,
            columns: parseInt(customColumnsInput.value) || 1,
            columnGap: parseFloat(customColumnGapInput.value) || 2
        });
    }

    const stickerWidthDots = template.columns > 1 ? ((template.width - (template.columnGap * (template.columns - 1))) / template.columns) * dotsPerMm : template.width * dotsPerMm;
    const columnGapDots = (template.columnGap || 0) * dotsPerMm;
    
    let tspl = `SIZE ${template.width} mm, ${template.height} mm\nGAP 2 mm, 0 mm\nCLS\n`;
    
    const itemsToPrint = (templateSelectEl.value === 'custom' || templates[templateSelectEl.value].isCustom) ? currentLabelItems : template.items;

    for (let i = 0; i < template.columns; i++) {
        const offsetX = i * (stickerWidthDots + columnGapDots);
        itemsToPrint.forEach(item => {
            const x_dot = Math.round(offsetX + item.x * dotsPerMm);
            const y_dot = Math.round(item.y * dotsPerMm);
            
            // Rotation is usually 0 now
            const rotation = item.options.rotation || 0;
            
            let value = '';
            if (item.options.text) {
                value = item.options.text;
            } else {
                let productValue = product[item.placeholder] || '';
                if (item.placeholder === 'price' && product.sellingPrice) {
                   productValue = parseFloat(product.sellingPrice).toFixed(2);
                }
                value = (item.options.prefix || '') + productValue;
            }
            value = value ? value.toString().replace(/"/g, '""') : '';

            if (item.type === 'text') {
                tspl += `TEXT ${x_dot},${y_dot},"${item.options.font}",${rotation},${item.options.size},${item.options.size},"${value}"\n`;
            } 
            else if (item.type === 'barcode' && product.barcode) {
                const barcodeHeightDots = Math.round(item.options.height * dotsPerMm);
                
                // Jewelry Tag: Narrow bar
                let narrow = 2;
                let wide = 4;

                if (templateSelectEl.value.includes('jewelry')) {
                    narrow = 1;
                    wide = 2; 
                }
                
                tspl += `BARCODE ${x_dot},${y_dot},"${item.options.type}",${barcodeHeightDots},${item.options.human_readable},${rotation},${narrow},${wide},"${product.barcode}"\n`;
            }
        });
    }
    tspl += `PRINT ${quantityInput.value || 1}\n`;
    return tspl;
}

async function handlePrint() {
    if (selectedProducts.length === 0) {
        alert('Please select products to print.');
        return;
    }
    let fullTSPLCommand = selectedProducts.map(p => generateTSPL(p)).join('');
    console.log("Generated TSPL:\n", fullTSPLCommand);
    try {
        const device = await navigator.usb.requestDevice({
            filters: [{
                vendorId: parseInt(vidInput.value, 16),
                productId: parseInt(pidInput.value, 16)
            }]
        });
        await device.open();
        await device.selectConfiguration(1);
        await device.claimInterface(0);
        const endpoint = device.configuration.interfaces[0].alternate.endpoints.find(e => e.direction === 'out');
        await device.transferOut(endpoint.endpointNumber, new TextEncoder().encode(fullTSPLCommand));
        await device.close();
        showStatus('Labels sent to printer successfully!', 'success');
    } catch (error) {
        console.error("WebUSB Error:", error);
        showStatus(`Printing failed: ${error.message}`, 'error');
    }
}

function savePrinterSettings() {
    localStorage.setItem('printerVID', vidInput.value);
    localStorage.setItem('printerPID', pidInput.value);
    showStatus('Printer settings saved.', 'success');
}

function loadPrinterSettings() {
    vidInput.value = localStorage.getItem('printerVID') || '';
    pidInput.value = localStorage.getItem('printerPID') || '';
}

function showStatus(message, type = 'success') {
    const container = document.getElementById('status-message-container');
    if(!container) {
        if(type === 'error') alert(message);
        return;
    }
    const div = document.createElement('div');
    div.className = `status-message ${type}`;
    div.textContent = message;
    container.appendChild(div);
    setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 500);
    }, 3000);
}