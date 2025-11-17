import { auth, db } from '../js/firebase-config.js';
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

// --- Global State ---
let currentUserID = null, allProducts = [], selectedProducts = [], currentLabelItems = [], selectedItem = null;
let baseTemplates = {}; // To store original templates
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
const customTemplateNameInput = document.getElementById('custom-template-name'), saveCustomTemplateBtn = document.getElementById('save-custom-template-btn');
const propertiesPanelEl = document.getElementById('properties-panel'), propItemNameEl = document.getElementById('prop-item-name');
const propXInput = document.getElementById('prop-x'), propYInput = document.getElementById('prop-y');
const textPropertiesEl = document.getElementById('text-properties'), barcodePropertiesEl = document.getElementById('barcode-properties');
const propFontSizeInput = document.getElementById('prop-fontsize'), propWidthInput = document.getElementById('prop-width');
const propHeightInput = document.getElementById('prop-height');


// --- Templates Definition ---
const templates = {
    'custom': {
        name: 'Custom Size...', width: 50, height: 25, columns: 1, columnGap: 2,
        items: [
            { placeholder: 'name', type: 'text', x: 2, y: 3, options: { font: 'TSS24.BF2', size: 1 } },
            { placeholder: 'price', type: 'text', x: 2, y: 10, options: { font: 'TSS24.BF2', size: 1, prefix: 'Price: ' } },
            { placeholder: 'barcode', type: 'barcode', x: 2, y: 15, options: { type: '128', height: 8, human_readable: 0, width: 46 } }
        ]
    },
    '50x25_2_col': {
        name: '50x25mm - 2 Col (Jewellery)', width: 50, height: 25, columns: 2, columnGap: 3,
        items: [
            { placeholder: 'name', type: 'text', x: 2, y: 3, options: { font: '1', size: 1 } },
            { placeholder: 'price', type: 'text', x: 2, y: 12, options: { font: '1', size: 2, prefix: 'Rs.' } }
        ]
    },
    '40x30_1_col_detailed': {
        name: '40x30mm - 1 Col Detailed', width: 40, height: 30, columns: 1, columnGap: 0,
        items: [
            { placeholder: 'name', type: 'text', x: 2, y: 3, options: { font: '2', size: 1 } },
            { placeholder: 'barcode', type: 'barcode', x: 2, y: 10, options: { type: '128', height: 12, human_readable: 1, width: 36 } },
            { placeholder: 'price', type: 'text', x: 2, y: 25, options: { font: '2', size: 1, prefix: 'Price: ' } }
        ]
    },
    '101x50_2_col_standard': { // Approx 4x2 inch
        name: '4" x 2" - 2 Col Standard', width: 101.6, height: 50.8, columns: 2, columnGap: 4,
        items: [
            { placeholder: 'name', type: 'text', x: 3, y: 5, options: { font: 'TSS24.BF2', size: 1 } },
            { placeholder: 'barcode', type: 'barcode', x: 3, y: 15, options: { type: '128', height: 20, human_readable: 1, width: 45 } },
            { placeholder: 'price', type: 'text', x: 3, y: 42, options: { font: 'TSS24.BF2', size: 2, prefix: 'Price: Rs. ' } }
        ]
    },
    '101x50_2_col_vertical': { // Approx 4x2 inch - Variation
        name: '4" x 2" - 2 Col Vertical', width: 101.6, height: 50.8, columns: 2, columnGap: 4,
        items: [
            { placeholder: 'name', type: 'text', x: 3, y: 3, options: { font: '2', size: 2 } },
            { placeholder: 'price', type: 'text', x: 30, y: 3, options: { font: '2', size: 2, prefix: 'Rs. ' } },
            { placeholder: 'barcode', type: 'barcode', x: 3, y: 15, options: { type: '128', height: 15, human_readable: 1, width: 45 } }
        ]
    }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    Object.assign(baseTemplates, JSON.parse(JSON.stringify(templates))); // Store a clean copy of original templates
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
    saveCustomTemplateBtn.addEventListener('click', saveCustomTemplate);
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
    templateSelectEl.innerHTML = ''; // Clear existing options
    loadCustomTemplates(); // Load user-saved templates first
    
    const optgroup = document.createElement('optgroup');
    optgroup.label = "Default Templates";
    templateSelectEl.appendChild(optgroup);

    Object.keys(baseTemplates).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = baseTemplates[key].name;
        optgroup.appendChild(option);
    });
    handleTemplateChange();
}

function handleTemplateChange() {
    const templateKey = templateSelectEl.value;
    const isCustom = templateKey === 'custom';
    customSizeSettingsEl.classList.toggle('hidden', !isCustom);
    templateDescriptionEl.classList.toggle('hidden', isCustom);
    
    const t = templates[templateKey];
    if (!isCustom) {
        templateDescriptionEl.textContent = `Size: ${t.width}mm x ${t.height}mm. ${t.columns > 1 ? t.columns + ' stickers.' : ''}`;
    } else {
        customWidthInput.value = t.width;
        customHeightInput.value = t.height;
        customColumnsInput.value = t.columns;
        customColumnGapInput.value = t.columnGap;
    }
    currentLabelItems = []; // Reset items on template change
    updatePreview();
}

function updatePreview() {
    if (selectedProducts.length === 0) {
        previewAreaEl.innerHTML = '<p>Select a product to see a preview.</p>';
        propertiesPanelEl.classList.add('hidden');
        selectedItem = null;
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
    if (!selectedItem) { // Don't hide properties panel if an item is already selected
        propertiesPanelEl.classList.add('hidden');
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
    
    for (let i = 0; i < columns; i++) {
        const offsetX = i * (stickerWidth + (template.columnGap || 0));
        currentLabelItems.forEach((item, index) => {
            const el = createDraggableItem(item, selectedProducts[0], index, i, offsetX);
            previewLabel.appendChild(el);
        });
    }
    previewAreaEl.appendChild(previewLabel);
    
    // Re-select item if it exists
    if(selectedItem) {
        selectItem(selectedItem.index, true);
    }
}

function createDraggableItem(item, product, index, columnIndex, offsetX) {
    const div = document.createElement('div');
    div.className = 'draggable-item';
    div.dataset.index = index;
    updateItemContent(div, item, product);

    Object.assign(div.style, {
        left: `${(offsetX + item.x) * previewScale}px`,
        top: `${item.y * previewScale}px`
    });
    
    if(columnIndex === 0) { // Only make the first column draggable
        interact(div).draggable({
            listeners: {
                move(event) {
                    const i = parseInt(event.target.dataset.index);
                    const itemData = currentLabelItems[i];
                    itemData.x += event.dx / previewScale;
                    itemData.y += event.dy / previewScale;
                    
                    document.querySelectorAll(`.draggable-item[data-index='${i}']`).forEach((el, colIdx) => {
                        const template = getCurrentTemplate();
                        const stickerWidth = template.columns > 1 ? ((template.width - (template.columnGap * (template.columns - 1))) / template.columns) : template.width;
                        const currentOffsetX = colIdx * (stickerWidth + (template.columnGap || 0));
                        el.style.left = `${(currentOffsetX + itemData.x) * previewScale}px`;
                        el.style.top = `${itemData.y * previewScale}px`;
                    });
                    
                    if (selectedItem && selectedItem.index === i) {
                        updatePropertiesPanel(itemData);
                    }
                }
            },
            modifiers: [interact.modifiers.restrictRect({ restriction: 'parent' })]
        }).on('tap', e => selectItem(parseInt(e.currentTarget.dataset.index)));
    }
    
    return div;
}

function updateItemContent(div, item, product) {
    div.innerHTML = '';
    div.style.width = 'auto'; // Reset width
    div.style.height = 'auto'; // Reset height

    let value = (item.options.prefix || '') + (product[item.placeholder] || (item.placeholder === 'price' ? (product.sellingPrice || 0).toFixed(2) : ''));
    
    if (item.type === 'text') {
        div.textContent = value;
        const fontSize = (item.options.font && item.options.font.includes('TSS') ? 24 : 8) * item.options.size;
        div.style.fontSize = `${fontSize * previewScale / dotsPerMm}px`;
    } 
    else if (item.type === 'barcode' && product.barcode) {
        div.classList.add('barcode');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        div.appendChild(svg);
        try {
            const barcodeWidth = item.options.width ? (item.options.width * previewScale) : 'auto';
            const barcodeHeight = item.options.height ? (item.options.height * previewScale) : 'auto';

            JsBarcode(svg, product.barcode, {
                format: "CODE128",
                displayValue: item.options.human_readable === 1,
                width: 2, // Bar width, not total width
                height: 40, // SVG internal height, not final scaled height
                margin: 0,
                font: "Arial",
                fontSize: 12
            });

            Object.assign(div.style, {
                width: `${barcodeWidth}px`,
                height: `${barcodeHeight}px`,
                overflow: 'hidden'
            });
            Object.assign(svg.style, { width: '100%', height: '100%' });

        } catch (e) {
            div.innerHTML = '<span>Invalid Barcode</span>';
        }
    }
}

function selectItem(index, keepSelection = false) {
    if(!keepSelection) {
        document.querySelectorAll('.draggable-item.selected').forEach(el => el.classList.remove('selected'));
    }
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
        propWidthInput.value = itemData.options.width || 40;
        propHeightInput.value = itemData.options.height || 10;
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
        'width': (d, v) => d.options.width = v,
        'height': (d, v) => d.options.height = v,
    };
    if (propMap[prop]) {
        propMap[prop](itemData, val);
    }
    
    updatePreview();
}

function handleKeyboardShortcuts(e) {
    if (!selectedItem) return;
    
    const allowedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Delete', 'Backspace'];
    if (!allowedKeys.includes(e.key)) return;
    
    e.preventDefault();
    const index = selectedItem.index;
    
    if(e.key === 'Delete' || e.key === 'Backspace') {
        currentLabelItems.splice(index, 1);
        selectedItem = null;
        updatePreview();
        showStatus('Item deleted from template.', 'success');
        return;
    }

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
}

// --- Printing Logic ---

function getCurrentTemplate() {
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
    return template;
}

function generateTSPL(product) {
    let template = getCurrentTemplate();

    const stickerWidthDots = template.columns > 1 ? ((template.width - (template.columnGap * (template.columns - 1))) / template.columns) * dotsPerMm : template.width * dotsPerMm;
    const columnGapDots = (template.columnGap || 0) * dotsPerMm;
    
    let tspl = `SIZE ${template.width} mm, ${template.height} mm\nGAP 2 mm, 0 mm\nCLS\n`;
    
    for (let i = 0; i < template.columns; i++) {
        const offsetX = i * (stickerWidthDots + columnGapDots);
        currentLabelItems.forEach(item => {
            const x_dot = Math.round(offsetX + item.x * dotsPerMm);
            const y_dot = Math.round(item.y * dotsPerMm);
            let value = (item.options.prefix || '') + (product[item.placeholder] || (item.placeholder === 'price' ? (product.sellingPrice || 0).toFixed(2) : ''));
            value = value ? value.toString().replace(/"/g, '""') : '';

            if (item.type === 'text') {
                tspl += `TEXT ${x_dot},${y_dot},"${item.options.font}",0,${item.options.size},${item.options.size},"${value}"\n`;
            } 
            else if (item.type === 'barcode' && product.barcode) {
                const barcodeHeightDots = Math.round(item.options.height * dotsPerMm);
                const barcodeWidthDots = Math.round(item.options.width * dotsPerMm);
                // For TSPL, we don't set barcode width directly, but its module width. We can approximate.
                // Or better, let the printer auto-size it if width is not a direct command param.
                tspl += `BARCODE ${x_dot},${y_dot},"${item.options.type}",${barcodeHeightDots},${item.options.human_readable},0,2,4,"${product.barcode}"\n`;
            }
        });
    }
    tspl += `PRINT ${quantityInput.value || 1}\n`;
    return tspl;
}

async function handlePrint() {
    if (selectedProducts.length === 0) {
        showStatus('Please select products to print.', 'error');
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

function saveCustomTemplate() {
    const name = customTemplateNameInput.value.trim();
    if (!name) {
        showStatus('Please enter a name for the custom template.', 'error');
        return;
    }

    const customTemplates = JSON.parse(localStorage.getItem('customLabelTemplates') || '{}');
    const templateKey = `custom_${name.replace(/\s+/g, '_').toLowerCase()}`;
    
    customTemplates[templateKey] = {
        name: name,
        width: parseFloat(customWidthInput.value),
        height: parseFloat(customHeightInput.value),
        columns: parseInt(customColumnsInput.value),
        columnGap: parseFloat(customColumnGapInput.value),
        items: currentLabelItems
    };

    localStorage.setItem('customLabelTemplates', JSON.stringify(customTemplates));
    showStatus(`Template "${name}" saved successfully!`, 'success');
    populateTemplates(); // Refresh the dropdown
    templateSelectEl.value = templateKey; // Select the newly saved template
}

function loadCustomTemplates() {
    const customTemplates = JSON.parse(localStorage.getItem('customLabelTemplates') || '{}');
    if (Object.keys(customTemplates).length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = "My Templates";
        templateSelectEl.appendChild(optgroup);

        for (const key in customTemplates) {
            templates[key] = customTemplates[key]; // Add to the main templates object
            const option = document.createElement('option');
            option.value = key;
            option.textContent = customTemplates[key].name;
            optgroup.appendChild(option);
        }
    }
}

function showStatus(message, type = 'success') {
    const container = document.getElementById('status-message-container');
    const div = document.createElement('div');
    // Using global.css classes if they exist, otherwise fallback
    div.className = `status-message ${type}`; 
    div.textContent = message;
    container.appendChild(div);
    setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 500);
    }, 4000);
}