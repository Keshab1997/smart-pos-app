// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, deleteDoc, updateDoc, orderBy, query } from 'firebase/firestore';
// এখন আমরা printer.js থেকে নতুন ফাংশনগুলো ইম্পোর্ট করব
import { showTemplateModal } from './printer.js'; 

// =================================================================
// --- DOM Elements ---
// =================================================================
const inventoryBody = document.getElementById('inventory-tbody');
const searchInput = document.getElementById('search-inventory');
const categoryFilter = document.getElementById('category-filter');
const paginationContainer = document.getElementById('pagination-container');
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const closeModalBtn = editModal.querySelector('.close-button'); // এডিট Modal-এর ক্লোজ বাটন
const logoutBtn = document.getElementById('logout-btn');
const statusMessageContainer = document.getElementById('status-message-container');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const printSelectedBtn = document.getElementById('print-selected-btn');
const printAllFilteredBtn = document.getElementById('print-all-filtered-btn');

// =================================================================
// --- Global State ---
// =================================================================
let allProducts = [];
let filteredProducts = [];
let uniqueCategories = new Set(); // এটি এখন আর সরাসরি ব্যবহৃত হচ্ছে না, কিন্তু রাখা যেতে পারে
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
        setupEventListeners();
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
        const currentSelectedCategory = categoryFilter.value; // ফিল্টার করার আগে বর্তমান ক্যাটেগরি সেভ করুন
        
        allProducts = [];
        const newCategories = new Set();
        querySnapshot.forEach((doc) => {
            const product = { id: doc.id, ...doc.data() };
            allProducts.push(product);
            if (product.category) newCategories.add(product.category);
        });
        
        updateCategoryFilter(newCategories, currentSelectedCategory);
        applyFiltersAndRender(); 
    });
}

function applyFiltersAndRender(resetPage = false) {
    if (resetPage) currentPage = 1;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedCategory = categoryFilter.value;

    filteredProducts = allProducts.filter(p => {
        const name = p.name || '';
        const barcode = p.barcode || '';
        const category = p.category || '';
        const matchesSearch = !searchTerm || name.toLowerCase().includes(searchTerm) || barcode.toLowerCase().includes(searchTerm);
        const matchesCategory = !selectedCategory || category === selectedCategory;
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
        inventoryBody.innerHTML = '<tr><td colspan="8" class="loading-cell">No products found.</td></tr>';
        return;
    }
    products.forEach(product => {
        const row = document.createElement('tr');
        if (product.stock <= LOW_STOCK_THRESHOLD) row.classList.add('low-stock');
        row.innerHTML = `
            <td><input type="checkbox" class="product-checkbox" data-id="${product.id}"></td>
            <td>${product.name || 'N/A'}</td>
            <td>${product.category || 'N/A'}</td>
            <td>${(product.costPrice || 0).toFixed(2)}</td>
            <td>${(product.sellingPrice || 0).toFixed(2)}</td>
            <td>${product.stock || 0}</td>
            <td>${product.barcode || 'N/A'}</td>
            <td class="action-buttons">
                <button class="btn-edit action-btn" data-id="${product.id}">Edit</button>
                <button class="btn-delete action-btn" data-id="${product.id}">Delete</button>
                <button class="btn-print action-btn" data-id="${product.id}">Print Label</button>
            </td>
        `;
        inventoryBody.appendChild(row);
    });
}

function updateCategoryFilter(newCategories, currentSelectedCategory) {
    const options = ['<option value="">All Categories</option>'];
    newCategories.forEach(category => {
        const isSelected = category === currentSelectedCategory ? 'selected' : '';
        options.push(`<option value="${category}" ${isSelected}>${category}</option>`);
    });
    categoryFilter.innerHTML = options.join('');
}


function setupPagination() {
    paginationContainer.innerHTML = '';
    const pageCount = Math.ceil(filteredProducts.length / ROWS_PER_PAGE);
    if (pageCount <= 1) return;

    for (let i = 1; i <= pageCount; i++) {
        const btn = document.createElement('button');
        btn.innerText = i;
        btn.className = 'pagination-btn';
        if (i === currentPage) btn.classList.add('active');
        btn.addEventListener('click', () => {
            currentPage = i;
            applyFiltersAndRender(false);
        });
        paginationContainer.appendChild(btn);
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
// --- Event Listeners ---
// =================================================================
function setupEventListeners() {
    if (setupEventListeners.executed) return;

    searchInput.addEventListener('input', () => applyFiltersAndRender(true));
    categoryFilter.addEventListener('change', () => applyFiltersAndRender(true));

    inventoryBody.addEventListener('click', (e) => {
        const target = e.target;
        if (!target) return;

        const productId = target.dataset.id;
        const product = allProducts.find(p => p.id === productId);

        if (target.matches('.btn-edit')) {
            if (product) openEditModal(product); // এডিট modal খোলার জন্য ফাংশন
        } else if (target.matches('.btn-delete')) {
            if (confirm(`Are you sure you want to delete "${product.name}"?`)) {
                deleteProduct(productId); // ডিলিট করার জন্য ফাংশন
            }
        } else if (target.matches('.btn-print')) {
            if (product && product.barcode && product.barcode !== 'N/A') {
                showTemplateModal([product]); // এখন একটি প্রোডাক্টের জন্য প্রিন্ট Modal দেখানো হবে
            } else {
                alert('Barcode not available for this product.');
            }
        }
    });

    printSelectedBtn.addEventListener('click', () => {
        const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.id);
        if (selectedIds.length === 0) {
            alert('Please select products to print.');
            return;
        }
        const productsToPrint = allProducts.filter(p => selectedIds.includes(p.id));
        showTemplateModal(productsToPrint); // নির্বাচিত সব প্রোডাক্টের জন্য প্রিন্ট Modal
    });

    printAllFilteredBtn.addEventListener('click', () => {
        if (filteredProducts.length === 0) {
            alert('No products to print in the current filter.');
            return;
        }
        showTemplateModal(filteredProducts); // ফিল্টার করা সব প্রোডাক্টের জন্য প্রিন্ট Modal
    });

    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = e.target.checked);
    });

    editForm.addEventListener('submit', handleEditFormSubmit); // ফর্ম সাবমিট হ্যান্ডেল করার ফাংশন

    closeModalBtn.addEventListener('click', () => editModal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === editModal) editModal.style.display = 'none';
    });
    logoutBtn.addEventListener('click', async () => await signOut(auth));

    setupEventListeners.executed = true;
}


// =================================================================
// --- Helper Functions for Actions (Edit, Delete) ---
// =================================================================

function openEditModal(product) {
    document.getElementById('edit-product-id').value = product.id;
    document.getElementById('edit-name').value = product.name || '';
    document.getElementById('edit-category').value = product.category || '';
    document.getElementById('edit-cp').value = product.costPrice || 0;
    document.getElementById('edit-sp').value = product.sellingPrice || 0;
    document.getElementById('edit-stock').value = product.stock || 0;
    document.getElementById('edit-barcode').value = product.barcode || '';
    editModal.style.display = 'flex';
}

async function handleEditFormSubmit(e) {
    e.preventDefault();
    const productId = document.getElementById('edit-product-id').value;
    const updatedProduct = {
        name: document.getElementById('edit-name').value,
        category: document.getElementById('edit-category').value,
        costPrice: parseFloat(document.getElementById('edit-cp').value),
        sellingPrice: parseFloat(document.getElementById('edit-sp').value),
        stock: parseInt(document.getElementById('edit-stock').value),
    };
    
    try {
        const productRef = doc(db, 'shops', currentUserId, 'inventory', productId);
        await updateDoc(productRef, updatedProduct);
        showStatus('Product updated successfully!');
        editModal.style.display = 'none';
    } catch (error) {
        console.error("Error updating document: ", error);
        showStatus('Failed to update product.', 'error');
    }
}

async function deleteProduct(productId) {
    try {
        const productRef = doc(db, 'shops', currentUserId, 'inventory', productId);
        await deleteDoc(productRef);
        showStatus('Product deleted successfully.');
    } catch (error) {
        console.error("Error deleting document: ", error);
        showStatus('Failed to delete product.', 'error');
    }
}