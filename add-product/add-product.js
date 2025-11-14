// /add-product/add-product.js (আপনার নতুন firebase-config.js অনুযায়ী আপডেট করা)

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// এখন সব কিছু আপনার কাস্টম firebase-config.js ফাইল থেকে ইম্পোর্ট করা হচ্ছে
// =================================================================
import {
    db,
    auth,
    collection,
    doc,
    writeBatch,
    Timestamp
} from '../js/firebase-config.js';

// Auth ফাংশনগুলো এখনও সরাসরি SDK থেকে ইম্পোর্ট করতে হবে, কারণ আপনি এগুলো এক্সপোর্ট করেননি।
// অথবা এগুলোও firebase-config.js থেকে এক্সপোর্ট করতে পারেন। আপাতত এভাবেই রাখছি।
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


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
            wrapper.className = 'barcode-wrapper';
            // ... (বাকি কোড অপরিবর্তিত)
            wrapper.dataset.barcode = product.id;
            wrapper.dataset.name = product.name;
            wrapper.dataset.price = product.sp;
            wrapper.innerHTML = `
                <div class="product-info">${product.name}</div>
                <svg class="barcode-svg"></svg>
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
        
        // --- ডেটা প্রসেসিং (অপরিবর্তিত) ---
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

        try {
            // এখন writeBatch, doc, collection ফাংশনগুলো আপনার firebase-config.js থেকে আসছে
            const batch = writeBatch(db);
            const productsForBarcodeDisplay = [];
            let totalInventoryCost = 0;
            let productNamesForExpense = [];
            
            const inventoryCol = collection(db, 'shops', currentUserId, 'inventory');
            const expensesCol = collection(db, 'shops', currentUserId, 'expenses');

            productsToProcess.forEach(product => {
                const newProductRef = doc(inventoryCol);
                const dataToSave = { ...product, barcode: newProductRef.id, createdAt: Timestamp.now() };
                batch.set(newProductRef, dataToSave);
                
                productsForBarcodeDisplay.push({ id: newProductRef.id, name: product.name, sp: product.sellingPrice });
                totalInventoryCost += product.costPrice * product.stock;
                productNamesForExpense.push(`${product.name} (x${product.stock})`);
            });

            if (totalInventoryCost > 0) {
                const expenseRef = doc(expensesCol);
                const expenseData = {
                    description: `Inventory purchase: ${productNamesForExpense.join(', ')}`,
                    amount: totalInventoryCost,
                    category: 'inventory_purchase',
                    date: Timestamp.now(),
                };
                batch.set(expenseRef, expenseData);
            }

            await batch.commit();
            showStatus(`${productsForBarcodeDisplay.length} products & inventory cost saved!`, 'success');
            displayBarcodes(productsForBarcodeDisplay);
            productsTbody.innerHTML = '';
            addProductRow();
            
        } catch (error) {
            console.error("Error adding documents: ", error);
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

    // --- লগআউট লজিক ---
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                // signOut ফাংশনটি 'firebase/auth' থেকে ইম্পোর্ট করতে হবে
                await signOut(auth);
            } catch (error) {
                console.error("Logout Error:", error);
            }
        });
    }
});