// /add-product/add-product.js

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

    const addRowBtn = document.getElementById('add-row-btn');
    const productsTbody = document.getElementById('products-tbody');
    const form = document.getElementById('add-products-form');
    const statusMessage = document.getElementById('status-message');
    const barcodePrintArea = document.getElementById('barcode-print-area');
    const barcodesContainer = document.getElementById('barcodes-container');
    const logoutBtn = document.getElementById('logout-btn');

    let currentUserId = null;

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

    function addProductRow() {
        const row = document.createElement('tr');
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
        const time = type === 'error' ? 8000 : 5000;
        setTimeout(() => {
            statusMessage.textContent = '';
            statusMessage.className = 'status';
        }, time);
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
            try {
                JsBarcode(svgElement, product.barcode, {
                    format: "CODE128",
                    displayValue: true,
                    fontSize: 14,
                    width: 1.5,
                    height: 40,
                    margin: 5
                });
            } catch (e) {
                console.error("Barcode generation failed", e);
            }
            barcodesContainer.appendChild(wrapper);
        });
    }

    addRowBtn.addEventListener('click', addProductRow);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUserId) {
            showStatus('Authentication error. Please log in again.', 'error');
            return;
        }

        const saveButton = form.querySelector('button[type="submit"]');
        saveButton.disabled = true;
        saveButton.textContent = 'Checking & Saving...';
        
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
                const barcode = row.querySelector('.product-barcode').value.trim();
                const stock = parseInt(row.querySelector('.product-stock').value, 10);
                
                if (!category || isNaN(cp) || isNaN(sp) || isNaN(stock) || cp < 0 || sp < 0 || stock < 0) {
                    allRowsValid = false;
                } else {
                    productsToProcess.push({ name, category, costPrice: cp, sellingPrice: sp, stock, barcode });
                }
            }
        });

        if (!allRowsValid || productsToProcess.length === 0) {
            showStatus('Error: Please fill all fields correctly.', 'error');
            saveButton.disabled = false; saveButton.textContent = 'Save All Products';
            return;
        }
        
        try {
            const productsForBarcodeDisplay = [];
            const metadataRef = doc(db, 'shops', currentUserId, '_metadata', 'counters');

            await runTransaction(db, async (transaction) => {
                // ধাপ ১: রিড অপারেশন (Reads)
                // ------------------------------------------------
                const metadataDoc = await transaction.get(metadataRef);
                let lastProductId = metadataDoc.exists() ? metadataDoc.data().lastProductId || 1000 : 1000;

                // টেম্পোরারি অ্যারে ডেটা প্রসেসিংয়ের জন্য
                const processQueue = [];

                for (const product of productsToProcess) {
                    let finalBarcode;
                    if (product.barcode) {
                        finalBarcode = product.barcode;
                    } else {
                        lastProductId++;
                        finalBarcode = String(lastProductId);
                    }

                    const productRef = doc(db, 'shops', currentUserId, 'inventory', finalBarcode);
                    // আমরা এখানে শুধুমাত্র রিড করছি, রাইট করছি না
                    const productSnapshot = await transaction.get(productRef);

                    processQueue.push({
                        productData: product,
                        ref: productRef,
                        snapshot: productSnapshot,
                        finalBarcode: finalBarcode
                    });
                }

                // ধাপ ২: রাইট অপারেশন (Writes)
                // ------------------------------------------------
                // সব রিড শেষ, এখন আমরা নিরাপদে রাইট করতে পারি
                for (const item of processQueue) {
                    const { productData, ref, snapshot, finalBarcode } = item;

                    if (snapshot.exists()) {
                        // === STRICT VALIDATION ===
                        const dbData = snapshot.data();

                        if (dbData.name.trim().toLowerCase() !== productData.name.trim().toLowerCase()) {
                            throw new Error(`MISMATCH: Barcode '${finalBarcode}' is for '${dbData.name}', NOT '${productData.name}'.`);
                        }
                        if (dbData.category.trim().toLowerCase() !== productData.category.trim().toLowerCase()) {
                            throw new Error(`CATEGORY MISMATCH: Barcode '${finalBarcode}' belongs to category '${dbData.category}'.`);
                        }
                        if (Number(dbData.costPrice) !== Number(productData.costPrice)) {
                            throw new Error(`CP MISMATCH: '${productData.name}' (Barcode ${finalBarcode}) has CP: ${dbData.costPrice}. Entered: ${productData.costPrice}.`);
                        }
                        if (Number(dbData.sellingPrice) !== Number(productData.sellingPrice)) {
                            throw new Error(`SP MISMATCH: '${productData.name}' (Barcode ${finalBarcode}) has SP: ${dbData.sellingPrice}. Entered: ${productData.sellingPrice}.`);
                        }
                        
                        // স্টক আপডেট
                        const newStockTotal = parseInt(dbData.stock || 0) + productData.stock;
                        transaction.update(ref, {
                            stock: newStockTotal,
                            lastUpdated: Timestamp.now()
                        });

                    } else {
                        // নতুন প্রোডাক্ট তৈরি
                        const dataToSave = {
                            name: productData.name,
                            category: productData.category,
                            costPrice: productData.costPrice,
                            sellingPrice: productData.sellingPrice,
                            stock: productData.stock,
                            barcode: finalBarcode,
                            createdAt: Timestamp.now()
                        };
                        transaction.set(ref, dataToSave);
                    }

                    // Expense তৈরি (প্রত্যেকটি আলাদা রেফারেন্স হবে)
                    if (productData.costPrice > 0 && productData.stock > 0) {
                        const totalCost = productData.costPrice * productData.stock;
                        const expenseRef = doc(collection(db, 'shops', currentUserId, 'expenses'));
                        
                        const expenseData = {
                            description: `Purchase: ${productData.name} (Qty: ${productData.stock})`,
                            amount: totalCost,
                            category: 'inventory_purchase',
                            date: Timestamp.now(),
                            relatedProductId: finalBarcode
                        };
                        transaction.set(expenseRef, expenseData);
                    }

                    productsForBarcodeDisplay.push({ barcode: finalBarcode, name: productData.name, sp: productData.sellingPrice });
                }

                // শেষে কাউন্টার আপডেট
                transaction.set(metadataRef, { lastProductId: lastProductId }, { merge: true });
            });

            showStatus(`${productsForBarcodeDisplay.length} products saved successfully!`, 'success');
            displayBarcodes(productsForBarcodeDisplay);
            productsTbody.innerHTML = '';
            addProductRow();

        } catch (error) {
            console.error("Transaction failed: ", error);
            let msg = error.message;
            if (msg.includes('MISMATCH')) {
                msg = msg.replace('Error: ', '');
            } else {
                msg = "Failed to save data. " + msg;
            }
            showStatus(msg, 'error');
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
            await signOut(auth);
        });
    }
});