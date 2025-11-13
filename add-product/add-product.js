// js/add-product.js

// Firebase SDK থেকে প্রয়োজনীয় মডিউল ইম্পোর্ট করা হচ্ছে
import { db, collection, writeBatch, doc } from '../js/firebase-config.js';

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

/**
 * টেবিলে প্রোডাক্ট যোগ করার জন্য একটি নতুন খালি সারি তৈরি করে।
 */
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

/**
 * ব্যবহারকারীকে একটি স্ট্যাটাস মেসেজ দেখায় (সফল বা ত্রুটি)।
 * @param {string} message - যে বার্তাটি দেখানো হবে।
 * @param {'success' | 'error'} type - বার্তার ধরণ।
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
 * সফলভাবে যোগ করা প্রোডাক্টগুলোর বারকোড প্রিন্ট করার জন্য প্রদর্শন করে।
 * @param {Array<Object>} products - প্রোডাক্টের তথ্যসহ একটি অ্যারে।
 */
function displayBarcodes(products) {
    barcodePrintArea.classList.remove('hidden');
    barcodesContainer.innerHTML = '';

    products.forEach(product => {
        const wrapper = document.createElement('div');
        wrapper.className = 'barcode-wrapper';
        wrapper.innerHTML = `
            <div class="product-info">${product.name}</div>
            <svg class="barcode-svg"></svg>
            <div class="product-price">Price: ${product.sp.toFixed(2)}</div>
        `;

        const svgElement = wrapper.querySelector('.barcode-svg');
        // বারকোড হিসেবে প্রোডাক্টের ইউনিক আইডি ব্যবহার করা হচ্ছে
        JsBarcode(svgElement, product.id, {
            format: "CODE128",
            displayValue: true,
            fontSize: 14,
            width: 1.5,
            height: 50,
            margin: 10
        });

        barcodesContainer.appendChild(wrapper);
    });
}

// =================================================================
// --- ইভেন্ট লিসেনার (Event Listeners) ---
// =================================================================

// "Add More Rows" বাটনের জন্য ইভেন্ট
addRowBtn.addEventListener('click', addProductRow);

// ফর্ম সাবমিট করার মূল লজিক
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
        
        productsToProcess.push({ name, category, cp, sp, stock });
    });

    if (!allRowsValid) {
        showStatus('ত্রুটি: সব ফিল্ড সঠিকভাবে পূরণ করুন। মূল্য এবং স্টক অবশ্যই বৈধ ও অ-ঋণাত্মক সংখ্যা হতে হবে।', 'error');
        return;
    }

    try {
        const batch = writeBatch(db);
        const productsForBarcodeDisplay = [];

        productsToProcess.forEach(product => {
            // Firestore-এ একটি নতুন ডকুমেন্টের জন্য রেফারেন্স তৈরি করা
            const newProductRef = doc(collection(db, "products"));

            // *** প্রধান পরিবর্তন এখানে ***
            // ডেটাবেসে পাঠানোর জন্য অবজেক্ট তৈরি, যেখানে বারকোড যোগ করা হয়েছে
            const dataToSave = {
                name: product.name,
                category: product.category,
                cp: product.cp,
                sp: product.sp,
                stock: product.stock,
                barcode: newProductRef.id // ডকুমেন্ট আইডি'কেই বারকোড হিসেবে সেভ করা হচ্ছে
            };
            
            // ব্যাচে এই ডেটা যোগ করা হচ্ছে
            batch.set(newProductRef, dataToSave);
            
            // বারকোড প্রদর্শনের জন্য প্রয়োজনীয় ডেটা অ্যারেতে যোগ করা হচ্ছে
            productsForBarcodeDisplay.push({ 
                id: newProductRef.id, 
                name: product.name, 
                sp: product.sp 
            });
        });

        // সব প্রোডাক্ট একসাথে ডেটাবেসে সেভ করা
        await batch.commit();
        
        showStatus(`${productsForBarcodeDisplay.length} টি প্রোডাক্ট সফলভাবে যোগ করা হয়েছে!`, 'success');
        
        // জেনারেট হওয়া বারকোডগুলো দেখানো
        displayBarcodes(productsForBarcodeDisplay);
        
        // ফর্ম রিসেট করা
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
// পেজ লোড হওয়ার সাথে সাথে একটি খালি সারি যোগ করা
addProductRow();