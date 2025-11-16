import { auth, db } from '../js/firebase-config.js';
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

// --- Global State ---
let currentUserID = null;
let allProducts = [];
let selectedProducts = [];
let currentLabelItems = [];
let selectedItem = null;
const previewScale = 5; // Display scale: 1mm = 5px

// --- DOM Elements ---
const productListEl = document.getElementById('product-list');
const searchInput = document.getElementById('search-product');
const selectedCountEl = document.getElementById('selected-count');
const templateSelectEl = document.getElementById('template-select');
const previewAreaEl = document.querySelector('.preview-area');
const printBtn = document.getElementById('print-btn');
const quantityInput = document.getElementById('print-quantity');
const vidInput = document.getElementById('printer-vid');
const pidInput = document.getElementById('printer-pid');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const templateDescriptionEl = document.getElementById('template-description');
const customSizeSettingsEl = document.getElementById('custom-size-settings');
const customWidthInput = document.getElementById('custom-width');
const customHeightInput = document.getElementById('custom-height');
const customColumnsInput = document.getElementById('custom-columns');
const customColumnGapInput = document.getElementById('custom-columngap');
const propertiesPanelEl = document.getElementById('properties-panel');
const propItemNameEl = document.getElementById('prop-item-name');
const propXInput = document.getElementById('prop-x');
const propYInput = document.getElementById('prop-y');
const textPropertiesEl = document.getElementById('text-properties');
const barcodePropertiesEl = document.getElementById('barcode-properties');
const propFontSizeInput = document.getElementById('prop-fontsize');
const propWidthInput = document.getElementById('prop-width');
const propHeightInput = document.getElementById('prop-height');

// --- Templates Definition ---
const templates = {
    'custom': {
        name: 'Custom Size...', width: 50, height: 25, columns: 1, columnGap: 2,
        items: [
            { placeholder: 'name', type: 'text', x: 2, y: 3, options: { fontSize: 8 } },
            { placeholder: 'price', type: 'text', x: 2, y: 10, options: { fontSize: 10, prefix: 'Price: ' } },
            { placeholder: 'barcode', type: 'barcode', x: 2, y: 15, options: { width: 46, height: 8, showValue: false } }
        ]
    },
    '101x25_double': {
        name: '4" x 1" - Two Stickers (2x1)', width: 101.6, height: 25.4, columns: 2, columnGap: 4,
        items: [
            { placeholder: 'name', type: 'text', x: 2, y: 3, options: { fontSize: 8 } },
            { placeholder: 'barcode', type: 'barcode', x: 2, y: 10, options: { width: 45, height: 8, showValue: true } },
            { placeholder: 'price', type: 'text', x: 30, y: 3, options: { fontSize: 9, prefix: 'Rs. ' } },
        ]
    },
    '50x25_single': {
        name: '50mm x 25mm - Single Item', width: 50, height: 25, columns: 1, columnGap: 0,
        items: [
            { placeholder: 'name', type: 'text', x: 2, y: 3, options: { fontSize: 8 } },
            { placeholder: 'barcode', type: 'barcode', x: 2, y: 10, options: { width: 46, height: 10, showValue: true } }
        ]
    }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserID = user.uid;
            loadPrinterSettings();
            populateTemplates();
            fetchProducts();
        } else { window.location.href = '../index.html'; }
    });

    // Event Listeners
    searchInput.addEventListener('input', renderProductList);
    templateSelectEl.addEventListener('change', handleTemplateChange);
    [customWidthInput, customHeightInput, customColumnsInput, customColumnGapInput].forEach(el => el.addEventListener('input', updatePreview));
    [propXInput, propYInput, propFontSizeInput, propWidthInput, propHeightInput].forEach(el => el.addEventListener('change', (e) => updateSelectedItemProperty(e.target.id.replace('prop-', ''), e.target.value)));
    printBtn.addEventListener('click', handlePrint);
    saveSettingsBtn.addEventListener('click', savePrinterSettings);
});

// --- Data & UI Functions ---
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
        li.innerHTML = `
            <input type="checkbox" ${selectedProducts.some(p => p.id === product.id) ? 'checked' : ''}>
            <span class="product-name">${product.name}</span>
            <span class="product-barcode">${product.barcode || 'N/A'}</span>
        `;
        li.addEventListener('click', () => toggleProductSelection(product, li));
        if (selectedProducts.some(p => p.id === product.id)) {
            li.classList.add('selected');
        }
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
        template.width = parseFloat(customWidthInput.value) || 50;
        template.height = parseFloat(customHeightInput.value) || 25;
        template.columns = parseInt(customColumnsInput.value) || 1;
        template.columnGap = parseFloat(customColumnGapInput.value) || 2;
    }

    previewAreaEl.innerHTML = '';
    selectedItem = null;
    propertiesPanelEl.classList.add('hidden');

    const previewLabel = document.createElement('div');
    previewLabel.className = 'preview-label';
    previewLabel.style.width = `${template.width * previewScale}px`;
    previewLabel.style.height = `${template.height * previewScale}px`;
    
    // Use the stored item properties if they exist, otherwise use template defaults
    currentLabelItems = currentLabelItems.length > 0 ? currentLabelItems : JSON.parse(JSON.stringify(template.items));

    const columns = template.columns || 1;
    const stickerWidth = columns > 1 ? ((template.width - (template.columnGap * (columns - 1))) / columns) : template.width;

    // Create a base set of draggable items for the first column
    const firstColumnItems = [];
    currentLabelItems.forEach((item, index) => {
        const itemElement = createDraggableItem(item, selectedProducts[0], index);
        firstColumnItems.push(itemElement);
    });

    // Clone items for subsequent columns
    for (let i = 0; i < columns; i++) {
        const offsetX = i * (stickerWidth + (template.columnGap || 0));
        firstColumnItems.forEach((baseElement, index) => {
            const itemData = currentLabelItems[index];
            const el = i === 0 ? baseElement : baseElement.cloneNode(true);
            el.style.left = `${(offsetX + itemData.x) * previewScale}px`;
            el.style.top = `${itemData.y * previewScale}px`;
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
                const target = event.target;
                const index = parseInt(target.dataset.index);
                const itemData = currentLabelItems[index];
                
                itemData.x += event.dx / previewScale;
                itemData.y += event.dy / previewScale;
                
                document.querySelectorAll(`.draggable-item[data-index='${index}']`).forEach(el => {
                    const currentLeft = parseFloat(el.style.left) || 0;
                    const currentTop = parseFloat(el.style.top) || 0;
                    el.style.left = `${currentLeft + event.dx}px`;
                    el.style.top = `${currentTop + event.dy}px`;
                });
                
                if (selectedItem && selectedItem.index === index) {
                    updatePropertiesPanel(itemData);
                }
            }
        },
        modifiers: [interact.modifiers.restrictRect({ restriction: 'parent' })]
    }).on('tap', (event) => selectItem(parseInt(event.currentTarget.dataset.index)));
    
    return div;
}

function updateItemContent(div, item, product) {
    div.innerHTML = '';
    let value = (item.options.prefix || '') + (product[item.placeholder] || (item.placeholder === 'price' ? product.sellingPrice.toFixed(2) : ''));
    
    if (item.type === 'text') {
        div.textContent = value;
        div.style.fontSize = `${item.options.fontSize * (previewScale / 4)}px`;
    } else if (item.type === 'barcode' && product.barcode) {
        div.classList.add('barcode');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        div.appendChild(svg);
        try {
            JsBarcode(svg, product.barcode, { format: "CODE128", displayValue: item.options.showValue || false, width: 1.5, height: 40, margin: 0, fontSize: 14 });
            div.style.width = `${item.options.width * previewScale}px`;
            div.style.height = `${item.options.height * previewScale}px`;
        } catch (e) { div.innerHTML = '<span>Invalid</span>'; }
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
        propFontSizeInput.value = itemData.options.fontSize;
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
        'fontsize': (d, v) => d.options.fontSize = v,
        'width': (d, v) => d.options.width = v,
        'height': (d, v) => d.options.height = v,
    };
    if (propMap[prop]) {
        propMap[prop](itemData, val);
    }
    
    updatePreview();
    setTimeout(() => selectItem(index), 50); // Re-select the item after re-render
}

// --- Printing Logic ---
function generateTSPL(product) {
    let template = JSON.parse(JSON.stringify(templates[templateSelectEl.value]));
    if (templateSelectEl.value === 'custom') {
        template.width = parseFloat(customWidthInput.value) || 50;
        template.height = parseFloat(customHeightInput.value) || 25;
        template.columns = parseInt(customColumnsInput.value) || 1;
        template.columnGap = parseFloat(customColumnGapInput.value) || 2;
    }

    const dotsPerMm = 8;
    const stickerWidthDots = template.columns > 1 ? ((template.width - (template.columnGap * (template.columns - 1))) / template.columns) * dotsPerMm : template.width * dotsPerMm;
    const columnGapDots = (template.columnGap || 0) * dotsPerMm;

    let tspl = `SIZE ${template.width} mm, ${template.height} mm\nGAP 2 mm, 0 mm\nCLS\n`;
    
    for (let i = 0; i < template.columns; i++) {
        const offsetX = i * (stickerWidthDots + columnGapDots);
        currentLabelItems.forEach(item => { // Use modified item properties
            const x_dot = Math.round(offsetX + item.x * dotsPerMm);
            const y_dot = Math.round(item.y * dotsPerMm);
            let value = (item.options.prefix || '') + (product[item.placeholder] || (item.placeholder === 'price' ? product.sellingPrice.toFixed(2) : ''));
            value = value ? value.toString().replace(/"/g, '""') : '';

            if (item.type === 'text') {
                const size = Math.round(item.options.fontSize / 10) || 1;
                tspl += `TEXT ${x_dot},${y_dot},"1",0,${size},${size},"${value}"\n`;
            } else if (item.type === 'barcode' && product.barcode) {
                const barcodeHeight = Math.round(item.options.height * dotsPerMm);
                const humanReadable = item.options.showValue ? 1 : 0;
                tspl += `BARCODE ${x_dot},${y_dot},"128",${barcodeHeight},${humanReadable},0,2,4,"${product.barcode}"\n`;
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
    
    let fullTSPLCommand = '';
    selectedProducts.forEach(product => {
        fullTSPLCommand += generateTSPL(product);
    });

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

// --- Settings Persistence & Utility Functions ---
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