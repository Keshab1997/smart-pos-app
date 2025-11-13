// js/add-product.js

// Firebase SDK থেকে প্রয়োজনীয় মডিউল ইম্পোর্ট করা হচ্ছে
import { db } from '../js/firebase-config.js';
import { collection, writeBatch, doc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- HTML এলিমেন্টগুলোর রেফারেন্স নেওয়া হচ্ছে ---
const addRowBtn = document.getElementById('add-row-btn');
const productsTbody = document.getElementById('products-tbody');
const form = document.getElementById('add-products-form');
const statusMessage = document.getElementById('status-message');
const barcodePrintArea = document.getElementById('barcode-print-area');
const barcodesContainer = document.getElementById('barcodes-container');

// =================================================================
// --- ফাংশনসমূহ ---
// =================================================================

function addProductRow() {
    const row = document.createElement('tr');
    row.innerHTML = `
        <td><input type="text" class="product-name" placeholder="যেমন, লাক্স সাবান" required></td>
        <td><input type="text" class="product-category" placeholder="যেমন, কসমেটিকস" required></td>
        <td><input type="number" step="0.01" class="product-cp" placeholder="0.00" required></td>
        <td><input type="number" step="0.01" class="product-sp" placeholder="0.00" required></td>
        <td><input type="number" class="product-stock" placeholder="0" required></td>
        <td><button type="button" class="btn btn-danger remove-row-btn">X</button></td>
    `;
    productsTbody.appendChild(row);
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = 'status';
    }, 5000);
}

function displayBarcodes(productsWithId) {
    barcodePrintArea.classList.remove('hidden');
    barcodesContainer.innerHTML = '';

    productsWithId.forEach(product => {
        const wrapper = document.createElement('div');
        wrapper.className = 'barcode-wrapper';
        wrapper.innerHTML = `
            <div class="product-info">${product.name}</div>
            <svg class="barcode-svg"></svg>
            <div class="product-price">Price: ${product.sp.toFixed(2)}</div>
        `;

        const svgElement = wrapper.querySelector('.barcode-svg');
        JsBarcode(svgElement, product.id, {
            format: "CODE128", displayValue: true, fontSize: 14, width: 1.5, height: 50, margin: 10
        });

        barcodesContainer.appendChild(wrapper);
    });
}


// =================================================================
// --- ইভেন্ট লিসেনার (Event Listeners) ---
// =================================================================

addRowBtn.addEventListener('click', addProductRow);

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rows = productsTbody.querySelectorAll('tr');

    if (rows.length === 0) {
        showStatus('সেভ করার জন্য অন্তত একটি প্রোডাক্ট যোগ করুন।', 'error');
        return;
    }

    let allRowsValid = true;
    const productsToProcess = [];

    rows.forEach(row => {
        if (!allRowsValid) return;

        const name = row.querySelector('.product-name').value.trim();
        const category = row.querySelector('.product-category').value.trim();
        const cp = parseFloat(row.querySelector('.product-cp').value);
        const sp = parseFloat(row.querySelector('.product-sp').value);
        const stock = parseInt(row.querySelector('.product-stock').value, 10);

        if (!name || !category || isNaN(cp) || isNaN(sp) || isNaN(stock) || cp < 0 || sp < 0 || stock < 0) {
            allRowsValid = false;
            return;
        }
        
        const productData = { name, category, cp, sp, stock };
        productsToProcess.push(productData);
    });

    if (!allRowsValid) {
        showStatus('ত্রুটি: সব ফিল্ড সঠিকভাবে পূরণ করুন। মূল্য এবং স্টক অবশ্যই বৈধ ও অ-ঋণাত্মক সংখ্যা হতে হবে।', 'error');
        return;
    }

    try {
        const batch = writeBatch(db);
        const productsForBarcodeDisplay = [];

        productsToProcess.forEach(product => {
            const newProductRef = doc(collection(db, "products"));

            const cleanDataForFirestore = {
                name: product.name,
                category: product.category,
                cp: product.cp,
                sp: product.sp,
                stock: product.stock
            };
            
            // ==========================================================================
            // === চূড়ান্ত ডিবাগিং ধাপ: অবজেক্টটিকে টেক্সট হিসেবে প্রিন্ট করে দেখা ===
            // ==========================================================================
            console.log("SNAPSHOT OF DATA TO BE SENT:", JSON.stringify(cleanDataForFirestore, null, 2));


            batch.set(newProductRef, cleanDataForFirestore);
            
            productsForBarcodeDisplay.push({ id: newProductRef.id, ...cleanDataForFirestore });
        });

        await batch.commit();
        
        showStatus(`${productsForBarcodeDisplay.length} টি প্রোডাক্ট সফলভাবে যোগ করা হয়েছে!`, 'success');
        
        displayBarcodes(productsForBarcodeDisplay);
        
        productsTbody.innerHTML = '';
        addProductRow();

    } catch (error) {
        console.error("Error adding documents: ", error);
        showStatus(`ডেটাবেসে সেভ করতে সমস্যা হয়েছে: ${error.message}`, 'error');
    }
});

// ডাইনামিকভাবে তৈরি করা "Remove" বাটনের ক্লিক হ্যান্ডেল করা
productsTbody.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-row-btn')) {
        e.target.closest('tr').remove();
    }
});

// =================================================================
// --- প্রাথমিক অ্যাকশন ---
// =================================================================
addProductRow();