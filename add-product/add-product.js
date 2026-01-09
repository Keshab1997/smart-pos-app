import {
    db,
    auth,
    collection,
    doc,
    getDoc,
    Timestamp,
    runTransaction
} from '../js/firebase-config.js';

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ImgBB API Configuration
const IMGBB_API_KEY = '13567a95e9fe3a212a8d8d10da9f3267'; 

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
            <td><input type="file" class="product-image" accept="image/*" style="font-size: 12px; width: 180px;"></td>
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

    async function uploadImageToImgBB(file) {
        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                return data.data.url;
            } else {
                console.error("ImgBB Upload Failed:", data);
                return null;
            }
        } catch (error) {
            console.error("ImgBB Network Error:", error);
            return null;
        }
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

    // বারকোড ইনপুট দিলে অটো-ফিল করার লজিক
    productsTbody.addEventListener('change', async (e) => {
        if (e.target.classList.contains('product-barcode')) {
            const barcode = e.target.value.trim();
            const row = e.target.closest('tr');
            
            if (barcode && currentUserId) {
                try {
                    // ডাটাবেস থেকে প্রোডাক্ট চেক করা
                    const productRef = doc(db, 'shops', currentUserId, 'inventory', barcode);
                    const productSnap = await getDoc(productRef);

                    if (productSnap.exists()) {
                        const data = productSnap.data();
                        
                        // পুরনো তথ্য দিয়ে ফিল্ডগুলো অটো-ফিল করা
                        row.querySelector('.product-name').value = data.name || '';
                        row.querySelector('.product-category').value = data.category || '';
                        row.querySelector('.product-cp').value = data.costPrice || 0;
                        row.querySelector('.product-sp').value = data.sellingPrice || 0;
                        
                        // ইউজারকে বোঝানোর জন্য রো-এর রঙ পরিবর্তন (হালকা সবুজ)
                        row.style.backgroundColor = '#e8f5e9'; 
                        showStatus(`Product "${data.name}" found! New stock will be added to existing.`, 'success');
                        
                        // নাম এবং ক্যাটাগরি লক করে দেওয়া যাতে ভুল না হয়
                        row.querySelector('.product-name').readOnly = true;
                        row.querySelector('.product-category').readOnly = true;
                    } else {
                        // যদি নতুন বারকোড হয়, তবে লক খুলে দেওয়া এবং রঙ রিসেট করা
                        row.style.backgroundColor = '';
                        row.querySelector('.product-name').readOnly = false;
                        row.querySelector('.product-category').readOnly = false;
                    }
                } catch (error) {
                    console.error("Error fetching product:", error);
                }
            }
        }
    });

    addRowBtn.addEventListener('click', addProductRow);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUserId) {
            showStatus('Authentication error. Please log in again.', 'error');
            return;
        }

        const saveButton = form.querySelector('button[type="submit"]');
        saveButton.disabled = true;
        saveButton.textContent = 'Uploading Images & Saving...';
        
        const rows = productsTbody.querySelectorAll('tr');
        if (rows.length === 0) {
            showStatus('Please add at least one product.', 'error');
            saveButton.disabled = false; saveButton.textContent = 'Save All Products';
            return;
        }
        
        const productsToProcess = [];
        let allRowsValid = true;

        for (const row of rows) {
            if (!allRowsValid) break;

            const name = row.querySelector('.product-name').value.trim();
            if (name) {
                const category = row.querySelector('.product-category').value.trim();
                const cp = parseFloat(row.querySelector('.product-cp').value);
                const sp = parseFloat(row.querySelector('.product-sp').value);
                const barcode = row.querySelector('.product-barcode').value.trim();
                const stock = parseInt(row.querySelector('.product-stock').value, 10);
                const imageInput = row.querySelector('.product-image');
                
                if (!category || isNaN(cp) || isNaN(sp) || isNaN(stock) || cp < 0 || sp < 0 || stock < 0) {
                    allRowsValid = false;
                } else {
                    let imageUrl = null;
                    if (imageInput.files && imageInput.files[0]) {
                        try {
                            saveButton.textContent = `Uploading image for ${name}...`;
                            imageUrl = await uploadImageToImgBB(imageInput.files[0]);
                        } catch (err) {
                            console.error("Failed to upload image for " + name);
                        }
                    }

                    productsToProcess.push({ 
                        name, 
                        category, 
                        costPrice: cp, 
                        sellingPrice: sp, 
                        stock, 
                        barcode,
                        imageUrl: imageUrl
                    });
                }
            }
        }

        if (!allRowsValid || productsToProcess.length === 0) {
            showStatus('Error: Please fill all fields correctly.', 'error');
            saveButton.disabled = false; saveButton.textContent = 'Save All Products';
            return;
        }
        
        saveButton.textContent = 'Saving to Database...';

        try {
            // --- নতুন লজিক: প্রোডাক্টগুলোকে বারকোড অনুযায়ী গ্রুপ করা ---
            const groupedProducts = [];
            const barcodeMap = new Map();

            productsToProcess.forEach(p => {
                if (p.barcode) {
                    if (barcodeMap.has(p.barcode)) {
                        // যদি একই বারকোড আগে পাওয়া যায়, তবে স্টক যোগ করো
                        barcodeMap.get(p.barcode).stock += p.stock;
                    } else {
                        const newObj = { ...p };
                        barcodeMap.set(p.barcode, newObj);
                        groupedProducts.push(newObj);
                    }
                } else {
                    // বারকোড না থাকলে প্রতিটি রো-কে আলাদা প্রোডাক্ট হিসেবে ধরো
                    groupedProducts.push({ ...p });
                }
            });

            const productsForBarcodeDisplay = [];
            const metadataRef = doc(db, 'shops', currentUserId, '_metadata', 'counters');

            await runTransaction(db, async (transaction) => {
                const metadataDoc = await transaction.get(metadataRef);
                let lastProductId = metadataDoc.exists() ? metadataDoc.data().lastProductId || 1000 : 1000;

                const processQueue = [];

                // এখন productsToProcess এর বদলে groupedProducts ব্যবহার হবে
                for (const product of groupedProducts) {
                    let finalBarcode;
                    if (product.barcode) {
                        finalBarcode = product.barcode;
                    } else {
                        lastProductId++;
                        finalBarcode = String(lastProductId);
                    }

                    const productRef = doc(db, 'shops', currentUserId, 'inventory', finalBarcode);
                    const productSnapshot = await transaction.get(productRef);

                    processQueue.push({
                        productData: product,
                        ref: productRef,
                        snapshot: productSnapshot,
                        finalBarcode: finalBarcode
                    });
                }

                for (const item of processQueue) {
                    const { productData, ref, snapshot, finalBarcode } = item;

                    if (snapshot.exists()) {
                        const dbData = snapshot.data();

                        if (dbData.name.trim().toLowerCase() !== productData.name.trim().toLowerCase()) {
                            throw new Error(`MISMATCH: Barcode '${finalBarcode}' is for '${dbData.name}', NOT '${productData.name}'.`);
                        }
                        
                        const newStockTotal = parseInt(dbData.stock || 0) + productData.stock;
                        
                        const updateData = {
                            stock: newStockTotal,
                            lastUpdated: Timestamp.now()
                        };
                        if (productData.imageUrl) {
                            updateData.imageUrl = productData.imageUrl;
                        }

                        transaction.update(ref, updateData);

                    } else {
                        const dataToSave = {
                            name: productData.name,
                            category: productData.category,
                            costPrice: productData.costPrice,
                            sellingPrice: productData.sellingPrice,
                            stock: productData.stock,
                            barcode: finalBarcode,
                            imageUrl: productData.imageUrl || null,
                            createdAt: Timestamp.now()
                        };
                        transaction.set(ref, dataToSave);
                    }

                    // এক্সপেন্স সেভ করার সময়ও গ্রুপ করা স্টক অনুযায়ী অ্যামাউন্ট ক্যালকুলেট হবে
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