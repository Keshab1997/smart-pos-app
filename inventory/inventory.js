// inventory/inventory.js (সম্পূর্ণ এবং চূড়ান্ত ভার্সন)

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, deleteDoc, updateDoc, orderBy, query } from 'firebase/firestore';

// --- DOM Elements ---
const inventoryBody = document.getElementById('inventory-tbody');
const searchInput = document.getElementById('search-inventory');
const categoryFilter = document.getElementById('category-filter');
const paginationContainer = document.getElementById('pagination-container');
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const closeModalBtn = document.querySelector('.close-button');
const logoutBtn = document.getElementById('logout-btn');
const statusMessageContainer = document.getElementById('status-message-container');

// --- Global State ---
let allProducts = [];
let filteredProducts = [];
let uniqueCategories = new Set();
const ROWS_PER_PAGE = 10;
let currentPage = 1;
const LOW_STOCK_THRESHOLD = 10;
let currentUserId = null;
let unsubscribe;

// =================================================================
// --- Authentication & Initialization ---
// =================================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        loadInventory();
    } else {
        window.location.href = '../index.html';
    }
});

// =================================================================
// --- Core Functions (Data loading & Rendering) ---
// =================================================================
function loadInventory() {
    if (!currentUserId) return;
    if (unsubscribe) unsubscribe();

    const productsCollectionRef = collection(db, 'shops', currentUserId, 'inventory');
    const productsQuery = query(productsCollectionRef, orderBy("name"));

    unsubscribe = onSnapshot(productsQuery, (querySnapshot) => {
        allProducts = [];
        uniqueCategories.clear();
        querySnapshot.forEach((doc) => {
            const product = { id: doc.id, ...doc.data() };
            allProducts.push(product);
            if (product.category) uniqueCategories.add(product.category);
        });
        populateCategoryFilter();
        applyFiltersAndRender();
    }, (error) => {
        console.error("Error fetching inventory: ", error);
        inventoryBody.innerHTML = '<tr><td colspan="7" class="error-cell">Failed to load data.</td></tr>';
    });
}

function applyFiltersAndRender() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedCategory = categoryFilter.value;
    filteredProducts = allProducts.filter(p => {
        const name = p.name || '';
        const barcode = p.barcode || '';
        const category = p.category || '';
        const matchesSearch = searchTerm === '' || name.toLowerCase().includes(searchTerm) || barcode.toLowerCase().includes(searchTerm);
        const matchesCategory = selectedCategory === '' || category === selectedCategory;
        return matchesSearch && matchesCategory;
    });
    setupPagination();
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    const paginatedProducts = filteredProducts.slice(startIndex, startIndex + ROWS_PER_PAGE);
    renderTable(paginatedProducts);
}

function renderTable(products) {
    inventoryBody.innerHTML = '';
    if (products.length === 0) {
        inventoryBody.innerHTML = '<tr><td colspan="7" class="loading-cell">No products found.</td></tr>';
        return;
    }
    products.forEach(product => {
        const row = document.createElement('tr');
        if (product.stock <= LOW_STOCK_THRESHOLD) row.classList.add('low-stock');
        row.innerHTML = `
            <td>${product.name || 'N/A'}</td>
            <td>${product.category || 'N/A'}</td>
            <td>${(product.costPrice || 0).toFixed(2)}</td>
            <td>${(product.sellingPrice || 0).toFixed(2)}</td>
            <td>${product.stock || 0}</td>
            <td>${product.barcode || 'N/A'}</td>
            <td class="action-buttons">
                <button class="btn-edit action-btn" data-id="${product.id}">Edit</button>
                <button class="btn-delete action-btn" data-id="${product.id}">Delete</button>
                <button class="btn-print action-btn" data-barcode="${product.barcode}" data-name="${product.name}" data-price="${product.sellingPrice || 0}">Print</button>
            </td>
        `;
        inventoryBody.appendChild(row);
    });
}

function populateCategoryFilter() {
    const selectedValue = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    Array.from(uniqueCategories).sort().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        if (category === selectedValue) option.selected = true;
        categoryFilter.appendChild(option);
    });
}

function setupPagination() {
    paginationContainer.innerHTML = '';
    const pageCount = Math.ceil(filteredProducts.length / ROWS_PER_PAGE);
    if (pageCount > 1) {
        for (let i = 1; i <= pageCount; i++) {
            const btn = document.createElement('button');
            btn.innerText = i;
            btn.className = 'pagination-btn';
            if (i === currentPage) btn.classList.add('active');
            btn.addEventListener('click', () => {
                currentPage = i;
                applyFiltersAndRender();
            });
            paginationContainer.appendChild(btn);
        }
    }
}

function showStatus(message, type = 'success') {
    const statusDiv = document.createElement('div');
    statusDiv.className = `status ${type}`;
    statusDiv.textContent = message;
    statusMessageContainer.appendChild(statusDiv);
    setTimeout(() => statusDiv.remove(), 4000);
}

// =================================================================
// --- নতুন পরিবর্তন: প্রিন্ট ফাংশন যোগ করা হলো ---
// =================================================================
/**
 * একটিমাত্র বারকোড প্রিন্ট করার জন্য নতুন উইন্ডো খোলে।
 */
function printSingleBarcode(barcode, name, price) {
    const printWindow = window.open('', '_blank', 'width=400,height=300');
    if (!printWindow) {
        alert("Popup blocked! Please allow popups for this site to print barcodes.");
        return;
    }
    printWindow.document.write(`
        <html>
            <head>
                <title>Print Barcode</title>
                <style>
                    @media print { body { margin: 0; } @page { size: 3in 2in; margin: 5px; } }
                    body { font-family: sans-serif; text-align: center; }
                    .barcode-wrapper { display: inline-block; padding: 10px; break-inside: avoid; }
                    .product-info { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
                    .product-price { font-size: 13px; margin-top: 5px; }
                </style>
            </head>
            <body>
                <div class="barcode-wrapper">
                    <div class="product-info">${name}</div>
                    <svg id="barcode-svg"></svg>
                    <div class="product-price">Price: ₹${price}</div>
                </div>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
                <script>
                    try {
                        JsBarcode("#barcode-svg", "${barcode}", {
                            format: "CODE128", displayValue: true, fontSize: 14,
                            width: 1.5, height: 40, margin: 10
                        });
                        window.onafterprint = function() { window.close(); };
                        window.print();
                    } catch (e) {
                        console.error("JsBarcode error:", e);
                        document.body.innerHTML = "Error generating barcode: " + e.message;
                    }
                <\/script>
            </body>
        </html>
    `);
    printWindow.document.close();
}


// =================================================================
// --- Event Listeners ---
// =================================================================
searchInput.addEventListener('input', () => {
    currentPage = 1;
    applyFiltersAndRender();
});
categoryFilter.addEventListener('change', () => {
    currentPage = 1;
    applyFiltersAndRender();
});

inventoryBody.addEventListener('click', async (e) => {
    const target = e.target;
    if (!currentUserId) return;

    if (target.classList.contains('btn-delete')) {
        const productId = target.dataset.id;
        if (confirm('Are you sure you want to delete this product?')) {
            try {
                const productDocRef = doc(db, 'shops', currentUserId, 'inventory', productId);
                await deleteDoc(productDocRef);
                showStatus('Product deleted successfully!', 'success');
            } catch (error) {
                console.error("Error deleting product: ", error);
                showStatus('Failed to delete product.', 'error');
            }
        }
    }

    if (target.classList.contains('btn-edit')) {
        const productId = target.dataset.id;
        const product = allProducts.find(p => p.id === productId);
        if (product) {
            editForm['edit-product-id'].value = product.id;
            editForm['edit-name'].value = product.name || '';
            editForm['edit-category'].value = product.category || '';
            editForm['edit-cp'].value = product.costPrice || 0;
            editForm['edit-sp'].value = product.sellingPrice || 0;
            editForm['edit-stock'].value = product.stock || 0;
            editForm['edit-barcode'].value = product.barcode || '';
            editModal.style.display = 'block';
        }
    }
    
    // --- প্রিন্ট বাটনের জন্য ইভেন্ট লিসেনার ---
    if (target.classList.contains('btn-print')) {
        const barcodeValue = target.dataset.barcode;
        const productName = target.dataset.name;
        const productPrice = parseFloat(target.dataset.price).toFixed(2);

        if (barcodeValue && barcodeValue !== 'N/A') {
            printSingleBarcode(barcodeValue, productName, productPrice);
        } else {
            alert('Barcode is not available for this product.');
        }
    }
});

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const productId = editForm['edit-product-id'].value;
    const updatedData = {
        name: editForm['edit-name'].value,
        category: editForm['edit-category'].value,
        costPrice: parseFloat(editForm['edit-cp'].value),
        sellingPrice: parseFloat(editForm['edit-sp'].value),
        stock: parseInt(editForm['edit-stock'].value),
    };
    const saveButton = editForm.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    try {
        const productDocRef = doc(db, 'shops', currentUserId, 'inventory', productId);
        await updateDoc(productDocRef, updatedData);
        editModal.style.display = 'none';
        showStatus('Product updated successfully!', 'success');
    } catch (error) {
        console.error("Error updating product: ", error);
        showStatus('Failed to update product.', 'error');
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Changes';
    }
});

closeModalBtn.addEventListener('click', () => editModal.style.display = 'none');
window.addEventListener('click', (e) => {
    if (e.target === editModal) editModal.style.display = 'none';
});

logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Logout error:', error);
    }
});