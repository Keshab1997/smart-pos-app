// js/add-product.js

// Firebase v10 SDK থেকে প্রয়োজনীয় মডিউল ইম্পোর্ট করা হচ্ছে
import { db, collection, writeBatch, doc } from '../js/firebase-config.js';

// --- HTML এলিমেন্টগুলোর রেফারেন্স ---
const addRowBtn = document.getElementById('add-row-btn');
const productsTbody = document.getElementById('products-tbody');
const form = document.getElementById('add-products-form');
const statusMessage = document.getElementById('status-message');
const barcodePrintArea = document.getElementById('barcode-print-area');
const barcodesContainer = document.getElementById('barcodes-container');

// =================================================================
// --- ফাংশনসমূহ ---
// =================================================================

/**
 * টেবিলে প্রোডাক্ট যোগ করার জন্য একটি নতুন খালি সারি তৈরি করে।
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
 * ব্যবহারকারীকে একটি স্ট্যাটাস মেসেজ দেখায় (সফল বা ত্রুটি)।
 */
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = 'status';
    }, 5000);
}

/**
 * সফলভাবে যোগ করা প্রোডাক্টগুলোর বারকোড প্রদর্শন করে।
 */
function displayBarcodes(products) {
    barcodePrintArea.classList.remove('hidden');
    barcodesContainer.innerHTML = '';

    products.forEach(product => {
        const wrapper = document.createElement('div');
        wrapper.className = 'barcode-wrapper';
        // --- পরিবর্তন: প্রিন্টিং-এর জন্য ডেটা অ্যাট্রিবিউট যোগ করা হয়েছে ---
        wrapper.dataset.barcode = product.id;
        wrapper.dataset.name = product.name;
        wrapper.dataset.price = product.sp;
        
        wrapper.innerHTML = `
            <div class="product-info">${product.name}</div>
            <svg class="barcode-svg"></svg>
            <!-- পরিবর্তন: কারেন্সি সিম্বল ₹ যোগ করা হয়েছে -->
            <div class="product-price">Price: ₹${product.sp.toFixed(2)}</div>
        `;

        const svgElement = wrapper.querySelector('.barcode-svg');
        JsBarcode(svgElement, product.id, {
            format: "CODE128", displayValue: true, fontSize: 14,
            width: 1.5, height: 50, margin: 10
        });
        barcodesContainer.appendChild(wrapper);
    });
}

// =================================================================
// --- ইভেন্ট লিসেনার ---
// =================================================================

addRowBtn.addEventListener('click', addProductRow);

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveButton = form.querySelector('button[type="submit"]');

    // --- পরিবর্তন: বাটন ডিজেবল করা এবং টেক্সট পরিবর্তন ---
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    const rows = productsTbody.querySelectorAll('tr');
    if (rows.length === 0) {
        showStatus('Please add at least one product to save.', 'error');
        saveButton.disabled = false;
        saveButton.textContent = 'Save All Products';
        return;
    }

    const productsToProcess = [];
    let allRowsValid = true;
    rows.forEach(row => {
        if (!allRowsValid) return;
        const name = row.querySelector('.product-name').value.trim();
        const category = row.querySelector('.product-category').value.trim();
        const cp = parseFloat(row.querySelector('.product-cp').value);
        const sp = parseFloat(row.querySelector('.product-sp').value);
        const stock = parseInt(row.querySelector('.product-stock').value, 10);
        if (!name || !category || isNaN(cp) || isNaN(sp) || isNaN(stock) || cp < 0 || sp < 0 || stock < 0) {
            allRowsValid = false;
        }
        productsToProcess.push({ name, category, cp, sp, stock });
    });

    if (!allRowsValid) {
        showStatus('Error: Please fill all fields correctly. Prices and stock must be valid non-negative numbers.', 'error');
        saveButton.disabled = false;
        saveButton.textContent = 'Save All Products';
        return;
    }

    try {
        const batch = writeBatch(db);
        const productsForBarcodeDisplay = [];
        productsToProcess.forEach(product => {
            const newProductRef = doc(collection(db, "products"));
            // ডকুমেন্ট আইডি'কেই বারকোড হিসেবে সেভ করা হচ্ছে
            const dataToSave = { ...product, barcode: newProductRef.id };
            batch.set(newProductRef, dataToSave);
            productsForBarcodeDisplay.push({ id: newProductRef.id, name: product.name, sp: product.sp });
        });

        await batch.commit();
        
        showStatus(`${productsForBarcodeDisplay.length} products saved successfully!`, 'success');
        displayBarcodes(productsForBarcodeDisplay);
        productsTbody.innerHTML = '';
        addProductRow();
    } catch (error) {
        console.error("Error adding documents: ", error);
        showStatus(`Failed to save to database: ${error.message}`, 'error');
    } finally {
        // --- পরিবর্তন: কাজ শেষে বাটন আবার এনাবল করা ---
        saveButton.disabled = false;
        saveButton.textContent = 'Save All Products';
    }
});

productsTbody.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-row-btn')) {
        e.target.closest('tr').remove();
    }
});

// =================================================================
// --- প্রাথমিক অ্যাকশন ---
// =================================================================
// পেজ লোড হওয়ার সাথে সাথে একটি খালি সারি যোগ করা
addProductRow();