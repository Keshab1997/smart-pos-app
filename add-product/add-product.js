import { db } from '../js/firebase-config.js';
import { collection, writeBatch, doc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const addRowBtn = document.getElementById('add-row-btn');
const productsTbody = document.getElementById('products-tbody');
const form = document.getElementById('add-products-form');
const statusMessage = document.getElementById('status-message');
const barcodePrintArea = document.getElementById('barcode-print-area');
const barcodesContainer = document.getElementById('barcodes-container');

// --- Functions ---

/**
 * Adds a new empty row to the products table for data entry.
 */
function addProductRow() {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text" class="product-name" placeholder="e.g., Lux Soap" required></td>
        <td><input type="text" class="product-category" placeholder="e.g., Cosmetics" required></td>
        <td><input type="number" step="0.01" class="product-cp" placeholder="0.00" required></td>
        <td><input type="number" step="0.01" class="product-sp" placeholder="0.00" required></td>
        <td><input type="number" class="product-stock" placeholder="0" required></td>
        <td><button type="button" class="btn btn-danger remove-row-btn">X</button></td>
    `;
    productsTbody.appendChild(row);
}

/**
 * Displays a status message to the user.
 * @param {string} message - The message to display.
 * @param {'success' | 'error'} type - The type of message.
 */
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = type;
    // Message disappears after 5 seconds
    setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = '';
    }, 5000);
}

/**
 * Generates and displays barcodes for the newly added products.
 * @param {Array<Object>} products - An array of product objects that were added.
 */
function displayBarcodes(products) {
    barcodePrintArea.classList.remove('hidden');
    barcodesContainer.innerHTML = ''; // Clear previous barcodes

    products.forEach(product => {
        const wrapper = document.createElement('div');
        wrapper.className = 'barcode-wrapper';
        wrapper.innerHTML = `
            <div class="product-info">${product.name}</div>
            <svg class="barcode-svg"></svg>
            <div class="product-price">Price: ${product.sp.toFixed(2)}</div>
        `;

        const svgElement = wrapper.querySelector('.barcode-svg');
        JsBarcode(svgElement, product.barcode, {
            format: "CODE128",
            displayValue: true,
            fontSize: 14,
            width: 1.5,
            height: 50,
            margin: 10
        });

        // Add print functionality to each barcode wrapper
        wrapper.addEventListener('click', () => {
            printBarcode(wrapper);
        });

        barcodesContainer.appendChild(wrapper);
    });
}

/**
 * Prints a single barcode element.
 * @param {HTMLElement} elementToPrint - The wrapper element of the barcode to be printed.
 */
function printBarcode(elementToPrint) {
    // Clone the element to avoid modifying the original element on the page
    const printableElement = elementToPrint.cloneNode(true);
    printableElement.classList.add('printable-barcode');
    
    // Append to body, print, then remove
    document.body.appendChild(printableElement);
    window.print();
    document.body.removeChild(printableElement);
}


// --- Event Listeners ---

// Add a new row when the "Add More Rows" button is clicked
addRowBtn.addEventListener('click', addProductRow);

// Handle form submission to save all products to Firestore
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rows = productsTbody.querySelectorAll('tr');

    if (rows.length === 0) {
        showStatus('Please add at least one product to save.', 'error');
        return;
    }

    const batch = writeBatch(db);
    const productsToAdd = [];
    let isValid = true;

    rows.forEach((row, index) => {
        const name = row.querySelector('.product-name').value.trim();
        const category = row.querySelector('.product-category').value.trim();
        const cp = parseFloat(row.querySelector('.product-cp').value);
        const sp = parseFloat(row.querySelector('.product-sp').value);
        const stock = parseInt(row.querySelector('.product-stock').value, 10);
        
        // Simple validation
        if (!name || !category || isNaN(cp) || isNaN(sp) || isNaN(stock)) {
            isValid = false;
        }

        // Auto-generate a unique barcode using timestamp and a random suffix
        const barcode = Date.now().toString() + index.toString();

        productsToAdd.push({ name, category, cp, sp, stock, barcode });
    });

    if (!isValid) {
        showStatus('Please fill all fields correctly for all products.', 'error');
        return;
    }

    try {
        // Prepare batch write
        productsToAdd.forEach(product => {
            const newProductRef = doc(collection(db, "products")); // Create a reference with a new auto-generated ID
            batch.set(newProductRef, product);
        });

        // Commit the batch
        await batch.commit();
        
        showStatus(`${productsToAdd.length} product(s) added successfully!`, 'success');
        
        // Display barcodes for printing
        displayBarcodes(productsToAdd);
        
        // Clear the table and add a new empty row for the next entry
        productsTbody.innerHTML = '';
        addProductRow();

    } catch (error) {
        console.error("Error adding documents: ", error);
        showStatus('Error adding products. Please try again.', 'error');
    }
});

// Use event delegation to handle clicks on dynamically added "remove" buttons
productsTbody.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-row-btn')) {
        // Find the closest parent 'tr' and remove it
        e.target.closest('tr').remove();
    }
});


// --- Initial Action ---

// Add one initial row when the script loads so the user can start entering data right away.
// Since the script is a module and deferred, the DOM will be ready when this runs.
addProductRow();