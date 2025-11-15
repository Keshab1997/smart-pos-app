// /add-product/add-product.js

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import {
    db,
    auth,
    collection,
    doc,
    writeBatch, // এটি এখন আর ব্যবহৃত হচ্ছে না, ট্রানজ্যাকশন ব্যবহার করা হয়েছে
    Timestamp,
    runTransaction // <<<<<<<<<<< নতুন: ট্রানজ্যাকশনের জন্য এটি ইম্পোর্ট করা হয়েছে
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
            // =========================================================
            // <<<<<<<<<<< পরিবর্তন শুরু: বারকোড wrapper এর ক্লাস পরিবর্তন করা হয়েছে প্রিন্টের সুবিধার জন্য
            // =========================================================
            wrapper.className = 'barcode-item';
            // =========================================================
            // >>>>>>>>>>> পরিবর্তন শেষ
            // =========================================================
            
            wrapper.innerHTML = `
                <p class="product-name-print">${product.name}</p>
                <svg class="barcode-svg"></svg>
                <p class="product-price-print">Price: ₹${product.sp.toFixed(2)}</p>
            `;
            const svgElement = wrapper.querySelector('.barcode-svg');

            // product.id এখন আমাদের তৈরি করা ছোট সংখ্যা (e.g., "1001")
            JsBarcode(svgElement, product.id, {
                format: "CODE128",
                displayValue: true, // বারকোডের নিচে সংখ্যা দেখাবে
                fontSize: 14,
                width: 1.5, // বারকোডের লাইনের ঘনত্ব
                height: 40, // বারকোডের উচ্চতা
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
                const stock = parseInt(row.querySelector('.product-stock').value, 10);
                if (!category || isNaN(cp) || isNaN(sp) || isNaN(stock) || cp < 0 || sp < 0 || stock < 0) {
                    allRowsValid = false;
                } else {
                    productsToProcess.push({ name, category, costPrice: cp, sellingPrice: sp, stock });
                }
            }
        });

        if (!allRowsValid || productsToProcess.length === 0) {
            showStatus('Error: Please fill all fields correctly for at least one product.', 'error');
            saveButton.disabled = false; saveButton.textContent = 'Save All Products';
            return;
        }
        
        // =========================================================================
        // <<<<<<<<<<< পরিবর্তন শুরু: নতুন সাংখ্যিক বারকোড আইডি জেনারেশন লজিক
        // =========================================================================
        try {
            const productsForBarcodeDisplay = [];
            let totalInventoryCost = 0;
            let productNamesForExpense = [];
            
            // একটি মেটাডেটা ডকুমেন্ট রেফারেন্স, যেখানে আমরা সর্বশেষ আইডি নম্বর রাখব
            const metadataRef = doc(db, 'shops', currentUserId, '_metadata', 'counters');

            // ট্রানজ্যাকশন ব্যবহার করে ডেটা পড়া এবং লেখা হবে
            await runTransaction(db, async (transaction) => {
                const metadataDoc = await transaction.get(metadataRef);
                
                // যদি কাউন্টার না থাকে তবে 1000 থেকে শুরু হবে (অর্থাৎ প্রথম আইডি হবে 1001)
                let lastProductId = metadataDoc.exists() ? metadataDoc.data().lastProductId || 1000 : 1000;

                for (const product of productsToProcess) {
                    lastProductId++; // আইডি ১ করে বাড়ানো হলো
                    const newNumericId = String(lastProductId); // সংখ্যাকে স্ট্রিং-এ পরিণত করা হলো

                    // নতুন প্রোডাক্টের রেফারেন্স তৈরি করা হলো সাংখ্যিক আইডি দিয়ে
                    const newProductRef = doc(db, 'shops', currentUserId, 'inventory', newNumericId);

                    const dataToSave = {
                        ...product,
                        barcode: newNumericId, // বারকোড হিসেবে নতুন সাংখ্যিক আইডি সেভ করা হলো
                        createdAt: Timestamp.now()
                    };

                    // ট্রানজ্যাকশনের মাধ্যমে প্রোডাক্ট সেভ করা
                    transaction.set(newProductRef, dataToSave);
                    
                    // বারকোড প্রদর্শনের জন্য ডেটা প্রস্তুত করা
                    productsForBarcodeDisplay.push({ id: newNumericId, name: product.name, sp: product.sellingPrice });
                    
                    // খরচের হিসাব
                    totalInventoryCost += product.costPrice * product.stock;
                    productNamesForExpense.push(`${product.name} (x${product.stock})`);
                }

                // খরচের হিসাব যোগ করা (যদি থাকে)
                if (totalInventoryCost > 0) {
                    const expensesCol = collection(db, 'shops', currentUserId, 'expenses');
                    const expenseRef = doc(expensesCol); // খরচের জন্য অটো-আইডি ঠিক আছে
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
        // =========================================================================
        // >>>>>>>>>>> পরিবর্তন শেষ
        // =========================================================================
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