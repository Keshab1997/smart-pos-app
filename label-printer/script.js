import { auth, db } from '../js/firebase-config.js';
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

// --- Global State ---
let currentUserID = null, allProducts = [], selectedProducts = [], currentLabelItems = [], selectedItem = null;
const DPI = 203; // Printer DPI. 203 for most thermal printers, 300 for high-res
const dotsPerMm = DPI / 25.4;
const previewScale = 4; // Display scale: 1mm = 4px for better accuracy

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

// --- Templates Definition (এখানে নতুন ডিজাইন যোগ করা হয়েছে) ---
const templates = {
    // --- আপনার আগের ডিজাইন ---
    'custom': {
        name: 'Custom Size...', width: 50, height: 25, columns: 1, columnGap: 2,
        items: [
            { placeholder: 'name', type: 'text', x: 2, y: 3, options: { font: 'TSS24.BF2', size: 1 } },
            { placeholder: 'price', type: 'text', x: 2, y: 10, options: { font: 'TSS24.BF2', size: 1, prefix: 'Price: ' } },
            { placeholder: 'barcode', type: 'barcode', x: 2, y: 15, options: { type: '128', height: 8, human_readable: 0, width: 46 } }
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
    },
    '101x25_2_col': {
        name: '4" x 1" - 2 Columns', width: 101.6, height: 25.4, columns: 2, columnGap: 4,
        items: [
            { placeholder: 'name', type: 'text', x: 2, y: 3, options: { font: '2', size: 1 } },
            { placeholder: 'barcode', type: 'barcode', x: 2, y: 10, options: { type: '128', height: 8, human_readable: 1, width: 45 } },
            { placeholder: 'price', type: 'text', x: 30, y: 3, options: { font: '2', size: 1, prefix: 'Rs. ' } },
        ]
    },

    // --- নতুন যোগ করা ডিজাইন (New Designs Added Here) ---
    
    // 1. ছোট সাইজের সাধারণ ডিজাইন
    '30x20_1_col_simple': {
        name: '30x20mm - 1 Col Simple', width: 30, height: 20, columns: 1, columnGap: 2,
        items: [
            { placeholder: 'name', type: 'text', x: 2, y: 2, options: { font: '1', size: 1 } },
            { placeholder: 'barcode', type: 'barcode', x: 2, y: 8, options: { type: '128', height: 8, human_readable: 0, width: 26 } },
            { placeholder: 'price', type: 'text', x: 15, y: 16, options: { font: '1', size: 2, prefix: 'Tk ' } }
        ]
    },
    
    // 2. ৩ কলামের জুয়েলারি ট্যাগ
    '75x25_3_col_jewellery': {
        name: '75x25mm - 3 Columns Jewellery', width: 75, height: 25, columns: 3, columnGap: 2.5,
        items: [
            { placeholder: 'name', type: 'text', x: 1, y: 3, options: { font: '1', size: 1 } },
            { placeholder: 'price', type: 'text', x: 1, y: 14, options: { font: '2', size: 1, prefix: 'Tk-' } },
            { placeholder: 'barcode', type: 'barcode', x: 1, y: 8, options: { type: '128', height: 5, human_readable: 0, width: 21 } }
        ]
    },

    // 3. একটি স্ট্যান্ডার্ড রিটেইল ট্যাগ
    '58x40_1_col_retail': {
        name: '58x40mm - Standard Retail', width: 58, height: 40, columns: 1, columnGap: 2,
        items: [
            { placeholder: 'shopName', type: 'text', x: 15, y: 3, options: { font: 'TSS24.BF2', size: 1, text: 'Your Shop Name' } }, // Static Text Example
            { placeholder: 'name', type: 'text', x: 3, y: 10, options: { font: '2', size: 1 } },
            { placeholder: 'barcode', type: 'barcode', x: 3, y: 16, options: { type: '128', height: 12, human_readable: 1, width: 52 } },
            { placeholder: 'price', type: 'text', x: 3, y: 33, options: { font: 'TSS24.BF2', size: 2, prefix: 'Price: ' } }
        ]
    },

    // 4. পাশে বারকোড সহ ডিজাইন
    '70x30_1_col_side_barcode': {
        name: '70x30mm - Side Barcode', width: 70, height: 30, columns: 1, columnGap: 2,
        items: [
            { placeholder: 'name', type: 'text', x: 3, y: 5, options: { font: '2', size: 2 } },
            { placeholder: 'price', type: 'text', x: 3, y: 18, options: { font: 'TSS24.BF2', size: 1, prefix: 'BDT: ' } },
            { placeholder: 'barcode', type: 'barcode', x: 38, y: 5, options: { type: '128', height: 20, human_readable: 0, width: 30 } }
        ]
    },

    // 5. ২ কলামের বিস্তারিত ট্যাগ
    '80x50_2_col_detailed': {
        name: '80x50mm - 2 Col Detailed', width: 80, height: 50, columns: 2, columnGap: 4,
        items: [
            { placeholder: 'name', type: 'text', x: 1, y: 5, options: { font: '1', size: 1 } },
            { placeholder: 'barcode', type: 'barcode', x: 1, y: 12, options: { type: '128', height: 10, human_readable: 1, width: 36 } },
            { placeholder: 'price', type: 'text', x: 1, y: 28, options: { font: '2', size: 1, prefix: 'Price: ' } },
            { placeholder: 'customField1', type: 'text', x: 1, y: 40, options: { font: '1', size: 1, prefix: 'Code: ' } } // Custom field example
        ]
    },
    
    // 6. বড় সাইজের লেবেল
    '100x50_large_format': {
        name: '100x50mm - Large Format', width: 100, height: 50, columns: 1, columnGap: 3,
        items: [
            { placeholder: 'shopName', type: 'text', x: 25, y: 5, options: { font: 'TSS24.BF2', size: 2, text: 'My Awesome Store' } },
            { placeholder: 'name', type: 'text', x: 5, y: 20, options: { font: '2', size: 2, prefix: 'Item: ' } },
            { placeholder: 'barcode', type: 'barcode', x: 5, y: 30, options: { type: '128', height: 15, human_readable: 1, width: 90 } },
            { placeholder: 'price', type: 'text', x: 60, y: 20, options: { font: 'TSS24.BF2', size: 2, prefix: 'Tk. ' } }
        ]
    },
    
    // 7. শুধুমাত্র বারকোড এবং দাম
    '40x20_price_barcode': {
        name: '40x20mm - Barcode & Price', width: 40, height: 20, columns: 1, columnGap: 2,
        items: [
            { placeholder: 'barcode', type: 'barcode', x: 2, y: 2, options: { type: '128', height: 10, human_readable: 1, width: 36 } },
            { placeholder: 'price', type: 'text', x: 2, y: 15, options: { font: '2', size: 1, prefix: 'Price: ' } }
        ]
    },
    // এই কোড দুটি আপনার templates অবজেক্টের শেষে যোগ করুন

'4x1_inch_2_col_simple': {
    name: '4" x 1" - 2 Col Simple (নাম ও বারকোড)',
    width: 101.6, height: 25.4, columns: 2, columnGap: 3,
    items: [
        { placeholder: 'name', type: 'text', x: 2, y: 3, options: { font: '2', size: 1 } },
        { placeholder: 'barcode', type: 'barcode', x: 2, y: 10, options: { type: '128', height: 12, human_readable: 1, width: 45 } },
        { placeholder: 'price', type: 'text', x: 25, y: 3, options: { font: 'TSS24.BF2', size: 1, prefix: 'Tk. ' } }
    ]
},

'4x1_inch_2_col_detailed': {
    name: '4" x 1" - 2 Col Detailed (দোকানের নাম সহ)',
    width: 101.6, height: 25.4, columns: 2, columnGap: 3,
    items: [
        { placeholder: 'shopName', type: 'text', x: 8, y: 2, options: { font: '1', size: 1, text: 'Your Shop Name' } },
        { placeholder: 'name', type: 'text', x: 2, y: 8, options: { font: '2', size: 1 } },
        { placeholder: 'price', type: 'text', x: 32, y: 8, options: { font: '2', size: 2, prefix: 'PRICE ' } },
        { placeholder: 'barcode', type: 'barcode', x: 2, y: 15, options: { type: '128', height: 8, human_readable: 0, width: 46 } }
    ]
}
    
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, user => {
        if (user) {
            currentUserID = user.uid;
            loadPrinterSettings();
            populateTemplates();
            fetchProducts();
        } else {
            window.location.href = '../index.html';
        }
    });

    searchInput.addEventListener('input', renderProductList);
    templateSelectEl.addEventListener('change', handleTemplateChange);
    [customWidthInput, customHeightInput, customColumnsInput, customColumnGapInput].forEach(el => el.addEventListener('input', () => { currentLabelItems = []; updatePreview(); }));
    [propXInput, propYInput, propFontSizeInput, propWidthInput, propHeightInput].forEach(el => el.addEventListener('change', e => updateSelectedItemProperty(e.target.id.replace('prop-', ''), e.target.value)));
    printBtn.addEventListener('click', handlePrint);
    saveSettingsBtn.addEventListener('click', savePrinterSettings);
    document.addEventListener('keydown', handleKeyboardShortcuts);
});

// --- Data Fetching ---
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

// --- UI Rendering ---
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
    Object.keys(templates).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = templates[key].name;
        templateSelectEl.appendChild(option);
    });
    handleTemplateChange();
}

function handleTemplateChange() {
    const isCustom = templateSelectEl.value === 'custom';
    customSizeSettingsEl.classList.toggle('hidden', !isCustom);
    templateDescriptionEl.classList.toggle('hidden', isCustom);
    if (!isCustom) {
        const t = templates[templateSelectEl.value];
        templateDescriptionEl.textContent = `Size: ${t.width}mm x ${t.height}mm. ${t.columns > 1 ? t.columns + ' stickers.' : ''}`;
    }
    currentLabelItems = []; // Reset items on template change
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
    // Handle dynamic and static text
    let value = '';
    if (item.options.text) { // For static text like 'shopName'
        value = item.options.text;
    } else {
        let productValue = product[item.placeholder] || (item.placeholder === 'price' ? (product.sellingPrice || 0).toFixed(2) : '');
        value = (item.options.prefix || '') + productValue;
    }
    
    if (item.type === 'text') {
        div.textContent = value;
        const fontSize = (item.options.font && item.options.font.includes('TSS') ? 24 : 8) * (item.options.size || 1);
        div.style.fontSize = `${fontSize * previewScale / dotsPerMm}px`;
    } 
    else if (item.type === 'barcode' && product.barcode) {
        div.classList.add('barcode');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        div.appendChild(svg);
        try {
            JsBarcode(svg, product.barcode, {
                format: "CODE128",
                displayValue: item.options.human_readable === 1,
                width: 2, // This is relative, actual width is controlled by div style
                height: 40, // This is relative, actual height is controlled by div style
                margin: 0,
                font: "Arial",
                fontSize: 12
            });
            Object.assign(div.style, {
                width: `${(item.options.width || 30) * previewScale}px`,
                height: `${(item.options.height || 10) * previewScale}px`
            });
        } catch (e) {
            div.innerHTML = '<span>Invalid Barcode</span>';
        }
    }
}


function selectItem(index) {
    document.querySelectorAll('.draggable-item.selected').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll(`.draggable-item[data-index='${index}']`).forEach(el => el.classList.add('selected'));
    
    selectedItem = { index: index };
    const itemData = currentLabelItems[index];
    updatePropertiesPanel(itemData);
    propertiesPanelEl.classList.remove('hidden');
}

function updatePropertiesPanel(itemData) {
    propItemNameEl.textContent = itemData.placeholder.charAt(0).toUpperCase() + itemData.placeholder.slice(1);
    propXInput.value = itemData.x.toFixed(1);
    propYInput.value = itemData.y.toFixed(1);
    
    const isText = itemData.type === 'text';
    textPropertiesEl.classList.toggle('hidden', !isText);
    barcodePropertiesEl.classList.toggle('hidden', isText);

    if (isText) {
        propFontSizeInput.value = itemData.options.size;
    } else {
        propWidthInput.value = itemData.options.width;
        propHeightInput.value = itemData.options.height;
    }
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
    if (propMap[prop]) {
        propMap[prop](itemData, val);
    }
    
    updatePreview();
    setTimeout(() => {
        selectItem(index);
        document.querySelectorAll(`.draggable-item[data-index='${index}']`).forEach(el => el.classList.add('selected'));
    }, 50);
}


function handleKeyboardShortcuts(e) {
    if (!selectedItem || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const index = selectedItem.index;
    const itemData = currentLabelItems[index];
    const step = e.shiftKey ? 1.0 : 0.2; // mm
    
    const keyAction = {
        'ArrowUp': () => itemData.y -= step,
        'ArrowDown': () => itemData.y += step,
        'ArrowLeft': () => itemData.x -= step,
        'ArrowRight': () => itemData.x += step,
    };
    keyAction[e.key]();
    updatePreview();
    setTimeout(() => {
        selectItem(index);
        document.querySelectorAll(`.draggable-item[data-index='${index}']`).forEach(el => el.classList.add('selected'));
    }, 50);
}

// --- Printing Logic ---
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
    
    for (let i = 0; i < template.columns; i++) {
        const offsetX = i * (stickerWidthDots + columnGapDots);
        currentLabelItems.forEach(item => {
            const x_dot = Math.round(offsetX + item.x * dotsPerMm);
            const y_dot = Math.round(item.y * dotsPerMm);
            
            // Handle dynamic and static text for TSPL
            let value = '';
            if (item.options.text) {
                value = item.options.text;
            } else {
                let productValue = product[item.placeholder] || (item.placeholder === 'price' ? (product.sellingPrice || 0).toFixed(2) : '');
                 value = (item.options.prefix || '') + productValue;
            }
            value = value ? value.toString().replace(/"/g, '""') : '';

            if (item.type === 'text') {
                tspl += `TEXT ${x_dot},${y_dot},"${item.options.font}",0,${item.options.size},${item.options.size},"${value}"\n`;
            } 
            else if (item.type === 'barcode' && product.barcode) {
                const barcodeHeightDots = Math.round(item.options.height * dotsPerMm);
                const barcodeWidthDots = Math.round((item.options.width || 30) * dotsPerMm); // Fallback width
                // For TSPL, barcode width is controlled by module width (the last two numbers, e.g., 2,4)
                // We'll use a standard module width and let the height define the size primarily.
                tspl += `BARCODE ${x_dot},${y_dot},"${item.options.type}",${barcodeHeightDots},${item.options.human_readable},0,2,4,"${product.barcode}"\n`;
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

// --- Settings & Utility ---
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
    const div = document.createElement('div');
    div.className = `status-message ${type}`;
    div.textContent = message;
    container.appendChild(div);
    setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 500);
    }, 3000);
}