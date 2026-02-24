import { auth, db } from '../js/firebase-config.js';
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, orderBy, addDoc, deleteDoc, doc } from "firebase/firestore";

// --- Global State ---
let currentUserID = null, allProducts = [];
let printQueue = []; // সিলেক্ট করা প্রোডাক্টের লিস্ট এবং কোয়ান্টিটি এখানে থাকবে
let currentPreviewProduct = null; // বর্তমানে এডিটরে যে প্রোডাক্ট দেখানো হচ্ছে

let currentLabelItems = [], selectedItem = null;
const DPI = 203; 
const dotsPerMm = DPI / 25.4;
const previewScale = 4; 

// --- DOM Elements ---
const productListEl = document.getElementById('product-list'), searchInput = document.getElementById('search-product');
const queueListEl = document.getElementById('print-queue-list'), queueCountEl = document.getElementById('queue-count');
const totalLabelsCountEl = document.getElementById('total-labels-count'), previewProductNameEl = document.getElementById('preview-product-name');
const clearQueueBtn = document.getElementById('clear-queue-btn');

const templateSelectEl = document.getElementById('template-select'), previewAreaEl = document.querySelector('.preview-area');
const printBtn = document.getElementById('print-btn'), vidInput = document.getElementById('printer-vid');
const pidInput = document.getElementById('printer-pid'), saveSettingsBtn = document.getElementById('save-settings-btn');
const templateDescriptionEl = document.getElementById('template-description'), customSizeSettingsEl = document.getElementById('custom-size-settings');
const customWidthInput = document.getElementById('custom-width'), customHeightInput = document.getElementById('custom-height');
const customColumnsInput = document.getElementById('custom-columns'), customColumnGapInput = document.getElementById('custom-columngap');
const propertiesPanelEl = document.getElementById('properties-panel'), propItemNameEl = document.getElementById('prop-item-name');
const propXInput = document.getElementById('prop-x'), propYInput = document.getElementById('prop-y');
const textPropertiesEl = document.getElementById('text-properties'), barcodePropertiesEl = document.getElementById('barcode-properties');
const propFontSizeInput = document.getElementById('prop-fontsize'), propWidthInput = document.getElementById('prop-width');
const propHeightInput = document.getElementById('prop-height');
const propBoldInput = document.getElementById('prop-bold');

// --- Templates ---
let templates = {
    'custom': {
        name: 'Custom Size...', width: 50, height: 25, columns: 1, columnGap: 2,
        items: [
            { placeholder: 'name', type: 'text', x: 2, y: 3, options: { font: 'TSS24.BF2', size: 1 } },
            { placeholder: 'price', type: 'text', x: 2, y: 10, options: { font: 'TSS24.BF2', size: 1, prefix: 'Price: ' } },
            { placeholder: 'barcode', type: 'barcode', x: 2, y: 15, options: { type: '128', height: 8, human_readable: 0, width: 46 } }
        ]
    },
    '100x15_jewelry_horizontal': {
        name: 'Jewelry Tag (100x15mm)', width: 100, height: 15, columns: 1, columnGap: 0,
        items: [
            { placeholder: 'name', type: 'text', x: 5, y: 3, options: { font: '2', size: 1, rotation: 0 } },
            { placeholder: 'price', type: 'text', x: 5, y: 8, options: { font: '2', size: 1, prefix: 'Tk. ', rotation: 0 } },
            { placeholder: 'barcode', type: 'barcode', x: 60, y: 2, options: { type: '128', height: 8, human_readable: 0, width: 1, rotation: 0 } }
        ]
    },
    '50x25_2_col': {
        name: '50x25mm (2 Columns)', width: 50, height: 25, columns: 2, columnGap: 3,
        items: [
            { placeholder: 'name', type: 'text', x: 1, y: 3, options: { font: '1', size: 1 } },
            { placeholder: 'price', type: 'text', x: 1, y: 12, options: { font: '1', size: 2, prefix: 'Rs.' } }
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

    // Event Listeners
    searchInput.addEventListener('input', renderProductList);
    templateSelectEl.addEventListener('change', handleTemplateChange);
    
    // Custom settings update preview
    [customWidthInput, customHeightInput, customColumnsInput, customColumnGapInput].forEach(el => el.addEventListener('input', () => { 
        if(templateSelectEl.value === 'custom') updatePreview(); 
    }));

    // Properties update
    [propXInput, propYInput, propFontSizeInput, propWidthInput, propHeightInput].forEach(el => el.addEventListener('input', e => updateSelectedItemProperty(e.target.id.replace('prop-', ''), e.target.value)));
    propBoldInput.addEventListener('change', e => updateSelectedItemProperty('bold', e.target.checked));

    printBtn.addEventListener('click', handlePrintQueue);
    saveSettingsBtn.addEventListener('click', savePrinterSettings);
    clearQueueBtn.addEventListener('click', () => { printQueue = []; renderPrintQueue(); });

    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Check URL params for direct print
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.has('id')) {
        const p = { id: urlParams.get('id'), name: urlParams.get('name'), barcode: urlParams.get('id'), sellingPrice: urlParams.get('price') };
        addToQueue(p);
    }
});

// --- Logic ---

async function fetchProducts() {
    if (!currentUserID) return;
    try {
        const q = query(collection(db, 'shops', currentUserID, 'inventory'), orderBy('name'));
        const querySnapshot = await getDocs(q);
        allProducts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderProductList();
    } catch (error) {
        console.error("Error fetching products:", error);
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
        li.style.cssText = "padding:8px; border-bottom:1px solid #eee; cursor:pointer; font-size:12px; display:flex; justify-content:space-between;";
        li.innerHTML = `<span>${product.name}</span> <span style="color:#888;">${product.barcode || ''}</span>`;
        
        // Click to add to queue
        li.addEventListener('click', () => addToQueue(product));
        
        productListEl.appendChild(li);
    });
}

function addToQueue(product) {
    // Check if already exists
    const existing = printQueue.find(p => p.id === product.id);
    if(existing) {
        existing.printQty += 1;
    } else {
        // Clone object and add printQty property
        const p = { ...product, printQty: 1 };
        printQueue.push(p);
        // If it's the first item, set as active preview
        if(printQueue.length === 1) setActivePreview(p);
    }
    renderPrintQueue();
}

function setActivePreview(product) {
    currentPreviewProduct = product;
    previewProductNameEl.textContent = product.name;
    updatePreview(); // Redraw canvas with this product's data
    renderPrintQueue(); // Update UI to highlight active row
}

function renderPrintQueue() {
    queueListEl.innerHTML = '';
    let total = 0;

    printQueue.forEach((item, index) => {
        total += item.printQty;
        const div = document.createElement('li');
        div.className = `queue-item ${currentPreviewProduct && currentPreviewProduct.id === item.id ? 'active-preview' : ''}`;
        
        div.innerHTML = `
            <div class="q-name" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.name}</div>
            <div class="q-qty"><input type="number" min="1" value="${item.printQty}" class="qty-input"></div>
            <div class="q-act"><button class="btn-remove-queue">×</button></div>
        `;

        // Event: Click row to preview
        div.querySelector('.q-name').addEventListener('click', () => setActivePreview(item));

        // Event: Change Quantity
        div.querySelector('.qty-input').addEventListener('change', (e) => {
            const val = parseInt(e.target.value);
            item.printQty = val > 0 ? val : 1;
            renderPrintQueue(); // Re-calc total
        });

        // Event: Remove
        div.querySelector('.btn-remove-queue').addEventListener('click', (e) => {
            e.stopPropagation();
            printQueue.splice(index, 1);
            if(currentPreviewProduct && currentPreviewProduct.id === item.id) {
                currentPreviewProduct = printQueue.length > 0 ? printQueue[0] : null;
                updatePreview();
            }
            renderPrintQueue();
        });

        queueListEl.appendChild(div);
    });

    queueCountEl.textContent = printQueue.length;
    totalLabelsCountEl.textContent = total;
}

// --- Preview & Editor Logic (Connected to currentPreviewProduct) ---

function handleTemplateChange() {
    const val = templateSelectEl.value;
    const isCustomMode = val === 'custom';
    const t = templates[val];
    
    customSizeSettingsEl.classList.toggle('hidden', !isCustomMode);
    templateDescriptionEl.classList.toggle('hidden', isCustomMode);

    if (!isCustomMode) {
        templateDescriptionEl.textContent = `Size: ${t.width}mm x ${t.height}mm.`;
        currentLabelItems = JSON.parse(JSON.stringify(t.items)); 
    } else {
        if(currentLabelItems.length === 0) currentLabelItems = JSON.parse(JSON.stringify(t.items));
    }
    updatePreview();
}

function updatePreview() {
    // If no product selected, create a dummy
    const displayProduct = currentPreviewProduct || { name: 'Example Product', sellingPrice: '120.00', barcode: '12345678' };

    previewAreaEl.innerHTML = '';
    selectedItem = null;
    propertiesPanelEl.classList.add('hidden');

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
    
    // Create items using displayProduct data
    const firstColumnItems = currentLabelItems.map((item, index) => createDraggableItem(item, displayProduct, index));
    
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
        if(item.options.bold) div.style.fontWeight = 'bold';
    } 
    else if (item.type === 'barcode' && product.barcode) {
        div.classList.add('barcode');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        div.appendChild(svg);
        try {
            JsBarcode(svg, product.barcode, {
                format: "CODE128", displayValue: false,
                width: 2, height: 40, margin: 0
            });
            Object.assign(div.style, {
                width: `${(item.options.width || 30) * previewScale}px`,
                height: `${(item.options.height || 10) * previewScale}px`
            });
        } catch (e) { div.innerHTML = '<span>Invalid</span>'; }
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
    propItemNameEl.textContent = itemData.placeholder.toUpperCase();
    propXInput.value = itemData.x.toFixed(1);
    propYInput.value = itemData.y.toFixed(1);
    const isText = itemData.type === 'text';
    textPropertiesEl.classList.toggle('hidden', !isText);
    barcodePropertiesEl.classList.toggle('hidden', isText);
    if (isText) { 
        propFontSizeInput.value = itemData.options.size; 
        propBoldInput.checked = itemData.options.bold || false;
    } 
    else { propWidthInput.value = itemData.options.width; propHeightInput.value = itemData.options.height; }
}

function updateSelectedItemProperty(prop, value) {
    if (!selectedItem) return;
    const index = selectedItem.index;
    const itemData = currentLabelItems[index];
    const val = (prop === 'bold') ? value : parseFloat(value);
    
    const propMap = {
        'x': (d, v) => d.x = v,
        'y': (d, v) => d.y = v,
        'fontsize': (d, v) => d.options.size = v,
        'bold': (d, v) => d.options.bold = v,
        'width': (d, v) => d.options.width = v,
        'height': (d, v) => d.options.height = v,
    };
    if (propMap[prop]) { propMap[prop](itemData, val); }
    
    // Refresh preview with currently active product
    updatePreview();
    setTimeout(() => { selectItem(index); }, 50);
}

// --- Printing Logic (The Engine) ---

// 1. Generate Command for ONE product
function generateTSPL(product, qty) {
    let template = JSON.parse(JSON.stringify(templates[templateSelectEl.value]));
    if (templateSelectEl.value === 'custom') {
        Object.assign(template, {
            width: parseFloat(customWidthInput.value), height: parseFloat(customHeightInput.value),
            columns: parseInt(customColumnsInput.value), columnGap: parseFloat(customColumnGapInput.value)
        });
    }

    const stickerWidthDots = template.columns > 1 ? ((template.width - (template.columnGap * (template.columns - 1))) / template.columns) * dotsPerMm : template.width * dotsPerMm;
    const columnGapDots = (template.columnGap || 0) * dotsPerMm;
    
    let tspl = `SIZE ${template.width} mm, ${template.height} mm\nGAP 2 mm, 0 mm\nCLS\n`;
    
    // Note: We use `currentLabelItems` because that contains the current edits
    const itemsToPrint = currentLabelItems;

    for (let i = 0; i < template.columns; i++) {
        const offsetX = i * (stickerWidthDots + columnGapDots);
        itemsToPrint.forEach(item => {
            const x_dot = Math.round(offsetX + item.x * dotsPerMm);
            const y_dot = Math.round(item.y * dotsPerMm);
            const rotation = item.options.rotation || 0;
            
            let value = '';
            if (item.options.text) { value = item.options.text; } 
            else {
                let productValue = product[item.placeholder] || '';
                if (item.placeholder === 'price' && product.sellingPrice) {
                   productValue = parseFloat(product.sellingPrice).toFixed(2);
                }
                value = (item.options.prefix || '') + productValue;
            }
            value = value ? value.toString().replace(/"/g, '""') : '';

            if (item.type === 'text') {
                const font = item.options.bold ? '2' : item.options.font || '2';
                tspl += `TEXT ${x_dot},${y_dot},"${font}",${rotation},${item.options.size},${item.options.size},"${value}"\n`;
            } 
            else if (item.type === 'barcode' && product.barcode) {
                const h = Math.round(item.options.height * dotsPerMm);
                const narrow = templateSelectEl.value.includes('jewelry') ? 1 : 2;
                const wide = templateSelectEl.value.includes('jewelry') ? 2 : 4;
                tspl += `BARCODE ${x_dot},${y_dot},"${item.options.type}",${h},${item.options.human_readable},${rotation},${narrow},${wide},"${product.barcode}"\n`;
            }
        });
    }
    tspl += `PRINT ${qty}\n`; // Use individual quantity
    return tspl;
}

// 2. Main Print Handler (Loop through Queue)
async function handlePrintQueue() {
    if (printQueue.length === 0) {
        alert('Queue is empty. Select products first.');
        return;
    }

    // Combine all commands into one big stream
    let fullJob = "";
    printQueue.forEach(item => {
        fullJob += generateTSPL(item, item.printQty);
    });

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
        await device.transferOut(endpoint.endpointNumber, new TextEncoder().encode(fullJob));
        await device.close();
        showStatus('Print job sent!', 'success');
    } catch (error) {
        console.error("WebUSB Error:", error);
        alert(`Printing failed: ${error.message}. Check VID/PID.`);
    }
}

// --- Utils ---
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
        populateTemplates();
    }
}

function populateTemplates() {
    templateSelectEl.innerHTML = '';
    Object.keys(templates).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = templates[key].name;
        templateSelectEl.appendChild(option);
    });
    // Default select jewelry or first
    if(templates['100x15_jewelry_horizontal']) templateSelectEl.value = '100x15_jewelry_horizontal';
    handleTemplateChange();
}

function savePrinterSettings() {
    localStorage.setItem('printerVID', vidInput.value);
    localStorage.setItem('printerPID', pidInput.value);
    showStatus('Settings saved.', 'success');
}

function loadPrinterSettings() {
    vidInput.value = localStorage.getItem('printerVID') || '';
    pidInput.value = localStorage.getItem('printerPID') || '';
}

function handleKeyboardShortcuts(e) {
    if (!selectedItem || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const index = selectedItem.index;
    const itemData = currentLabelItems[index];
    const step = e.shiftKey ? 1.0 : 0.2; 
    if(e.key === 'ArrowUp') itemData.y -= step;
    if(e.key === 'ArrowDown') itemData.y += step;
    if(e.key === 'ArrowLeft') itemData.x -= step;
    if(e.key === 'ArrowRight') itemData.x += step;
    updatePreview();
    setTimeout(() => selectItem(index), 50);
}

function showStatus(message, type = 'success') {
    const container = document.getElementById('status-message-container');
    const div = document.createElement('div');
    div.className = `status-message ${type}`;
    div.textContent = message;
    container.appendChild(div);
    setTimeout(() => div.remove(), 3000);
}