import { db } from '../js/firebase-config.js';
import { collection, query, where, getDocs, doc, writeBatch, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const barcodeInput = document.getElementById('barcode-input');
const billBody = document.getElementById('bill-body');
const subtotalEl = document.getElementById('subtotal');
const taxEl = document.getElementById('tax');
const grandTotalEl = document.getElementById('grand-total');
const finalizeBtn = document.getElementById('finalize-sale-btn');
const clearBtn = document.getElementById('clear-bill-btn');
const quickProductList = document.getElementById('quick-product-list');
const productSearch = document.getElementById('product-search');

let currentBill = [];
let allProducts = [];
const TAX_RATE = 0.05;

// Fetch all products for quick add list
async function loadAllProducts() {
    const querySnapshot = await getDocs(collection(db, "products"));
    allProducts = [];
    quickProductList.innerHTML = '';
    querySnapshot.forEach((doc) => {
        const product = { id: doc.id, ...doc.data() };
        allProducts.push(product);
        const li = document.createElement('li');
        li.textContent = `${product.name} - ${product.price.toFixed(2)}`;
        li.dataset.barcode = product.barcode;
        quickProductList.appendChild(li);
    });
}

// Add item to bill
function addItemToBill(product) {
    if (product.stock <= 0) {
        alert('Product is out of stock!');
        return;
    }

    const existingItem = currentBill.find(item => item.id === product.id);

    if (existingItem) {
        if (existingItem.quantity < product.stock) {
            existingItem.quantity++;
        } else {
            alert('Cannot add more than available stock.');
        }
    } else {
        currentBill.push({ ...product, quantity: 1 });
    }

    renderBill();
}

// Render the bill table and totals
function renderBill() {
    billBody.innerHTML = '';
    let subtotal = 0;

    currentBill.forEach(item => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.name}</td>
            <td>${item.price.toFixed(2)}</td>
            <td>${item.quantity}</td>
            <td>${itemTotal.toFixed(2)}</td>
            <td><button class="btn btn-danger action-btn" data-id="${item.id}">X</button></td>
        `;
        billBody.appendChild(row);
    });

    const tax = subtotal * TAX_RATE;
    const grandTotal = subtotal + tax;

    subtotalEl.textContent = subtotal.toFixed(2);
    taxEl.textContent = tax.toFixed(2);
    grandTotalEl.textContent = grandTotal.toFixed(2);
}

// Handle barcode scan
barcodeInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const barcode = barcodeInput.value.trim();
        if (!barcode) return;

        const q = query(collection(db, "products"), where("barcode", "==", barcode));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            alert('Product not found!');
        } else {
            const doc = querySnapshot.docs[0];
            const product = { id: doc.id, ...doc.data() };
            addItemToBill(product);
        }
        barcodeInput.value = '';
    }
});

// Quick add from list
quickProductList.addEventListener('click', (e) => {
    if (e.target.tagName === 'LI') {
        const barcode = e.target.dataset.barcode;
        const product = allProducts.find(p => p.barcode === barcode);
        if (product) {
            addItemToBill(product);
        }
    }
});

// Search in quick add list
productSearch.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const items = quickProductList.getElementsByTagName('li');
    Array.from(items).forEach(item => {
        if (item.textContent.toLowerCase().includes(searchTerm)) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
});

// Remove item from bill
billBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-danger')) {
        const productId = e.target.dataset.id;
        currentBill = currentBill.filter(item => item.id !== productId);
        renderBill();
    }
});

// Clear the entire bill
clearBtn.addEventListener('click', () => {
    currentBill = [];
    renderBill();
});

// Finalize the sale
finalizeBtn.addEventListener('click', async () => {
    if (currentBill.length === 0) {
        alert('Bill is empty!');
        return;
    }

    const batch = writeBatch(db);

    // Update stock
    currentBill.forEach(item => {
        const productRef = doc(db, "products", item.id);
        const newStock = item.stock - item.quantity;
        batch.update(productRef, { stock: newStock });
    });
    
    // Create sale record
    const subtotal = parseFloat(subtotalEl.textContent);
    const tax = parseFloat(taxEl.textContent);
    const grandTotal = parseFloat(grandTotalEl.textContent);

    const saleRecord = {
        items: currentBill.map(item => ({ name: item.name, price: item.price, quantity: item.quantity })),
        subtotal,
        tax,
        grandTotal,
        saleDate: serverTimestamp()
    };
    
    const salesCollectionRef = collection(db, "sales");
    batch.set(doc(salesCollectionRef), saleRecord);
    
    try {
        await batch.commit();
        alert('Sale finalized successfully!');
        currentBill = [];
        renderBill();
        loadAllProducts(); // Reload products to get updated stock
    } catch (error) {
        console.error("Error finalizing sale: ", error);
        alert('Failed to finalize sale. Please check inventory and try again.');
    }
});

// Initial load
loadAllProducts();