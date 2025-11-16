import { auth, db } from '../js/firebase-config.js';
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

// --- Global State ---
let currentUserID = null;
let allProducts = [];
let selectedProducts = [];

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


// --- Templates Definition ---
const templates = {
    '50x25_single': {
        name: '50mm x 25mm - Single Item',
        width: 50, // mm
        height: 25, // mm
        // Items: [ { type, placeholder, x, y, options } ]
        items: [
            { type: 'text', placeholder: 'name', x: 2, y: 3, options: { fontSize: 8, maxChars: 30 } },
            { type: 'text', placeholder: 'price', x: 2, y: 10, options: { fontSize: 10, prefix: 'Price: ' } },
            { type: 'barcode', placeholder: 'barcode', x: 2, y: 15, options: { width: 46, height: 8, showValue: false } }
        ]
    },
    '40x30_single': {
        name: '40mm x 30mm - Single Item',
        width: 40,
        height: 30,
        items: [
            { type: 'text', placeholder: 'name', x: 2, y: 3, options: { fontSize: 9, maxChars: 25 } },
            { type: 'barcode', placeholder: 'barcode', x: 2, y: 10, options: { width: 36, height: 12, showValue: true } },
            { type: 'text', placeholder: 'price', x: 2, y: 25, options: { fontSize: 10, prefix: 'Rs. ' } }
        ]
    },
    '50x25_double': {
        name: '50mm x 25mm - Two Stickers (2x1)',
        width: 50,
        height: 25,
        columns: 2,
        columnGap: 4, // gap between stickers on the same row, in mm
        items: [ // This defines layout for ONE sticker
            { type: 'text', placeholder: 'name', x: 1, y: 2, options: { fontSize: 6, maxChars: 15 } },
            { type: 'barcode', placeholder: 'barcode', x: 1, y: 8, options: { width: 20, height: 6, showValue: false } },
            { type: 'text', placeholder: 'price', x: 1, y: 15, options: { fontSize: 7, prefix: 'Rs.' } }
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
        } else {
            window.location.href = '../index.html'; // Redirect if not logged in
        }
    });

    searchInput.addEventListener('input', renderProductList);
    templateSelectEl.addEventListener('change', updatePreview);
    printBtn.addEventListener('click', handlePrint);
    saveSettingsBtn.addEventListener('click', savePrinterSettings);
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
        p.name.toLowerCase().includes(filter) || (p.barcode && p.barcode.includes(filter))
    );

    productListEl.innerHTML = '';
    filteredProducts.forEach(product => {
        const li = document.createElement('li');
        li.dataset.id = product.id;
        li.innerHTML = `
            <input type="checkbox" ${selectedProducts.some(p => p.id === product.id) ? 'checked' : ''}>
            <span class="product-name">${product.name}</span>
            <span class="product-barcode">${product.barcode || ''}</span>
        `;
        li.addEventListener('click', (e) => {
            toggleProductSelection(product, e.currentTarget);
        });
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
    for (const key in templates) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = templates[key].name;
        templateSelectEl.appendChild(option);
    }
    updatePreview();
}

function updatePreview() {
    if (selectedProducts.length === 0) {
        previewAreaEl.innerHTML = '<p>Select a product to see a preview.</p>';
        return;
    }
    const templateKey = templateSelectEl.value;
    const template = templates[templateKey];
    const product = selectedProducts[0]; // Preview with the first selected product
    
    // Scale for display (e.g., 5px per mm)
    const scale = 5;
    const previewLabel = document.createElement('div');
    previewLabel.className = 'preview-label';
    previewLabel.style.width = `${template.width * scale}px`;
    previewLabel.style.height = `${template.height * scale}px`;

    // Handle multi-column templates
    const columns = template.columns || 1;
    const stickerWidth = columns > 1 ? ((template.width - (template.columnGap * (columns - 1))) / columns) : template.width;

    for (let i = 0; i < columns; i++) {
        const offsetX = i * (stickerWidth + (template.columnGap || 0));
        template.items.forEach(item => {
            const el = createPreviewItem(item, product, scale, stickerWidth);
            el.style.left = `${(offsetX + item.x) * scale}px`;
            el.style.top = `${item.y * scale}px`;
            previewLabel.appendChild(el);
        });
    }
    
    previewAreaEl.innerHTML = '';
    previewAreaEl.appendChild(previewLabel);
}

function createPreviewItem(item, product, scale, itemMaxWidth) {
    const div = document.createElement('div');
    div.className = 'preview-item';
    
    let value = '';
    if (item.placeholder === 'name') value = product.name;
    else if (item.placeholder === 'price') value = (item.options.prefix || '') + product.sellingPrice.toFixed(2);
    else if (item.placeholder === 'barcode') value = product.barcode;

    if (item.type === 'text') {
        if (item.options.maxChars && value.length > item.options.maxChars) {
            value = value.substring(0, item.options.maxChars) + '...';
        }
        div.textContent = value;
        div.style.fontSize = `${item.options.fontSize * (scale / 4)}px`; // Adjust font size based on scale
    } else if (item.type === 'barcode' && value) {
        div.classList.add('barcode');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        div.appendChild(svg);
        try {
            JsBarcode(svg, value, {
                format: "CODE128",
                displayValue: item.options.showValue || false,
                width: 1.5,
                height: 40,
                margin: 0,
                fontSize: 14
            });
            div.style.width = `${item.options.width * scale}px`;
            div.style.height = `${item.options.height * scale}px`;
        } catch (e) {
            div.innerHTML = '<span>Invalid Barcode</span>';
        }
    }
    return div;
}

// --- Printing Logic ---
function generateTSPL(product, template) {
    const dotsPerMm = 8;
    const stickerWidthDots = template.columns > 1 
        ? ((template.width - (template.columnGap * (template.columns - 1))) / template.columns) * dotsPerMm 
        : template.width * dotsPerMm;

    let tspl = `SIZE ${template.width} mm, ${template.height} mm\n`;
    tspl += `GAP 2 mm, 0 mm\nCLS\n`;
    
    for (let i = 0; i < template.columns; i++) {
        const offsetX = i * (stickerWidthDots + ((template.columnGap || 0) * dotsPerMm));
        template.items.forEach(item => {
            const x_dot = Math.round(offsetX + item.x * dotsPerMm);
            const y_dot = Math.round(item.y * dotsPerMm);

            let value = '';
            if (item.placeholder === 'name') value = product.name;
            else if (item.placeholder === 'price') value = (item.options.prefix || '') + product.sellingPrice.toFixed(2);
            else if (item.placeholder === 'barcode') value = product.barcode;
            
            value = value.replace(/"/g, '""');

            if (item.type === 'text') {
                const size = Math.round(item.options.fontSize / 10);
                tspl += `TEXT ${x_dot},${y_dot},"1",0,${size},${size},"${value}"\n`;
            } else if (item.type === 'barcode' && value) {
                const barcodeHeight = Math.round(item.options.height * dotsPerMm);
                const humanReadable = item.options.showValue ? 1 : 0;
                tspl += `BARCODE ${x_dot},${y_dot},"128",${barcodeHeight},${humanReadable},0,2,4,"${value}"\n`;
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
    const templateKey = templateSelectEl.value;
    const template = templates[templateKey];
    
    let fullTSPLCommand = '';
    selectedProducts.forEach(product => {
        fullTSPLCommand += generateTSPL(product, template);
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

// --- Printer Settings Persistence ---
function savePrinterSettings() {
    localStorage.setItem('printerVID', vidInput.value);
    localStorage.setItem('printerPID', pidInput.value);
    showStatus('Printer settings saved.', 'success');
}

function loadPrinterSettings() {
    vidInput.value = localStorage.getItem('printerVID') || '1F94';
    pidInput.value = localStorage.getItem('printerPID') || '2001';
}

// --- Utility ---
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