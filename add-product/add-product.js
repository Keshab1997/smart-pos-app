// /add-product/add-product.js

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import {
    db,
    auth,
    collection,
    doc,
    Timestamp,
    runTransaction
} from '../js/firebase-config.js';

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";


document.addEventListener('DOMContentLoaded', () => {

    // --- HTML এলিমেন্টগুলোর রেফারেন্স ---
    const addRowBtn = document.getElementById('add-row-btn');
    const productsTbody = document.getElementById('products-tbody');
    const form = document.getElementById('add-products-form');
    const statusMessage = document.getElementById('status-message');
    const barcodePrintArea = document.getElementById('barcode-print-area');
    const barcodesContainer = document.getElementById('barcodes-container');
    const logoutBtn = document.getElementById('logout-btn');

    let currentUserId = null;

    // --- Authentication এবং Route Guarding ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUserId = user.uid;
            if (productsTbody.children.length === 0) {
                addProductRow();
            }
        } else {
            window.location.href = '../index.html';
        }
    });

    // --- ফাংশনসমূহ ---
    function addProductRow() {
        const row = document.createElement('tr');
        // =======================================================================
        // <<<<<<<<<<< পরিবর্তন ১: বারকোড ইনপুটের জন্য নতুন <td> যোগ করা হয়েছে
        // =======================================================================
        row.innerHTML = `
            <td><input type="text" class="product-name" placeholder="e.g., Lux Soap" required></td>
            <td><input type="text" class="product-category" placeholder="e.g., Cosmetics" required></td>
            <td><input type="number" step="0.01" class="product-cp" placeholder="0.00" required></td>
            <td><input type="number" step="0.01" class="product-sp" placeholder="0.00" required></td>
            <td><input type="text" class="product-barcode" placeholder="Scan or type barcode"></td>
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

    function displayBarcodes(products) {
        barcodePrintArea.classList.remove('hidden');
        barcodesContainer.innerHTML = '';
        products.forEach(product => {
            const wrapper = document.createElement('div');
            wrapper.className = 'barcode-item';
            
            wrapper.innerHTML = `
                <p class="product-name-print">${product.name}</p>
                <svg class="barcode-svg"></svg>
                <p class="product-price-print">Price: ₹${product.sp.toFixed(2)}</p>
            `;
            const svgElement = wrapper.querySelector('.barcode-svg');

            // =======================================================================
            // <<<<<<<<<<< পরিবর্তন ২: product.id এর পরিবর্তে product.barcode ব্যবহার করা হয়েছে
            // =======================================================================
            JsBarcode(svgElement, product.barcode, {
                format: "CODE128",
                displayValue: true,
                fontSize: 14,
                width: 1.5,
                height: 40,
                margin: 5
            });
            barcodesContainer.appendChild(wrapper);
        });
    }

    // --- ইভেন্ট লিসেনার ---
    addRowBtn.addEventListener('click', addProductRow);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUserId) {
            showStatus('Authentication error. Please log in again.', 'error');
            return;
        }

        const saveButton = form.querySelector('button[type="submit"]');
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';
        
        const rows = productsTbody.querySelectorAll('tr');
        if (rows.length === 0) {
            showStatus('Please add at least one product.', 'error');
            saveButton.disabled = false; saveButton.textContent = 'Save All Products';
            return;
        }
        
        const productsToProcess = [];
        let allRowsValid = true;
        rows.forEach(row => {
            if (!allRowsValid) return;
            const name = row.querySelector('.product-name').value.trim();
            if (name) {
                const category = row.querySelector('.product-category').value.trim();
                const cp = parseFloat(row.querySelector('.product-cp').value);
                const sp = parseFloat(row.querySelector('.product-sp').value);
                // =======================================================================
                // <<<<<<<<<<< পরিবর্তন ৩: বারকোড ফিল্ড থেকে ভ্যালু পড়া হচ্ছে
                // =======================================================================
                const barcode = row.querySelector('.product-barcode').value.trim();
                const stock = parseInt(row.querySelector('.product-stock').value, 10);
                
                if (!category || isNaN(cp) || isNaN(sp) || isNaN(stock) || cp < 0 || sp < 0 || stock < 0) {
                    allRowsValid = false;
                } else {
                    // productsToProcess অ্যারেতে বারকোড সহ পুশ করা হচ্ছে
                    productsToProcess.push({ name, category, costPrice: cp, sellingPrice: sp, stock, barcode });
                }
            }
        });

        if (!allRowsValid || productsToProcess.length === 0) {
            showStatus('Error: Please fill all fields correctly for at least one product.', 'error');
            saveButton.disabled = false; saveButton.textContent = 'Save All Products';
            return;
        }
        
        // =========================================================================
        // <<<<<<<<<<< পরিবর্তন ৪: মূল ট্রানজ্যাকশন লজিক আপডেট করা হয়েছে
        // =========================================================================
        try {
            const productsForBarcodeDisplay = [];
            let totalInventoryCost = 0;
            let productNamesForExpense = [];
            
            const metadataRef = doc(db, 'shops', currentUserId, '_metadata', 'counters');

            await runTransaction(db, async (transaction) => {
                const metadataDoc = await transaction.get(metadataRef);
                let lastProductId = metadataDoc.exists() ? metadataDoc.data().lastProductId || 1000 : 1000;

                for (const product of productsToProcess) {
                    let finalBarcode;

                    // যদি ব্যবহারকারী বারকোড দিয়ে থাকে, তবে সেটি ব্যবহার করা হবে
                    if (product.barcode) {
                        finalBarcode = product.barcode;
                    } else {
                        // অন্যথায়, নতুন আইডি অটো-জেনারেট করা হবে
                        lastProductId++;
                        finalBarcode = String(lastProductId);
                    }

                    // প্রোডাক্টের ডকুমেন্ট আইডি হিসেবে finalBarcode ব্যবহার করা হবে
                    const newProductRef = doc(db, 'shops', currentUserId, 'inventory', finalBarcode);

                    const dataToSave = {
                        name: product.name,
                        category: product.category,
                        costPrice: product.costPrice,
                        sellingPrice: product.sellingPrice,
                        stock: product.stock,
                        barcode: finalBarcode, // বারকোড ফিল্ডেও finalBarcode সেভ হবে
                        createdAt: Timestamp.now()
                    };

                    transaction.set(newProductRef, dataToSave);
                    
                    // বারকোড প্রদর্শনের জন্য finalBarcode সহ ডেটা প্রস্তুত করা
                    productsForBarcodeDisplay.push({ barcode: finalBarcode, name: product.name, sp: product.sellingPrice });
                    
                    totalInventoryCost += product.costPrice * product.stock;
                    productNamesForExpense.push(`${product.name} (x${product.stock})`);
                }

                // খরচের হিসাব যোগ করা
                if (totalInventoryCost > 0) {
                    const expenseRef = doc(collection(db, 'shops', currentUserId, 'expenses'));
                    const expenseData = {
                        description: `Inventory purchase: ${productNamesForExpense.join(', ')}`,
                        amount: totalInventoryCost,
                        category: 'inventory_purchase',
                        date: Timestamp.now(),
                    };
                    transaction.set(expenseRef, expenseData);
                }

                // সর্বশেষ আইডি নম্বরটি মেটাডেটা ডকুমেন্টে আপডেট করা
                transaction.set(metadataRef, { lastProductId: lastProductId }, { merge: true });
            });

            showStatus(`${productsForBarcodeDisplay.length} products & inventory cost saved!`, 'success');
            displayBarcodes(productsForBarcodeDisplay);
            productsTbody.innerHTML = '';
            addProductRow();

        } catch (error) {
            console.error("Error in transaction: ", error);
            showStatus(`Failed to save data: ${error.message}`, 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = 'Save All Products';
        }
    });

    productsTbody.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-row-btn')) {
            e.target.closest('tr').remove();
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await signOut(auth);
            } catch (error) {
                console.error("Logout Error:", error);
            }
        });
    }
});