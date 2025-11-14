// inventory/inventory.js (ক্যাটেগরি ফিল্টার সমাধান সহ চূড়ান্ত ভার্সন)

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, deleteDoc, updateDoc, orderBy, query } from 'firebase/firestore';
import { printSingleBarcode, printMultipleBarcodes } from './printer.js'; 

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
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const printSelectedBtn = document.getElementById('print-selected-btn');
const printAllFilteredBtn = document.getElementById('print-all-filtered-btn');

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
        allProducts = [];
        const newCategories = new Set();
        querySnapshot.forEach((doc) => {
            const product = { id: doc.id, ...doc.data() };
            allProducts.push(product);
            if (product.category) newCategories.add(product.category);
        });
        
        // ক্যাটেগরি লিস্ট আপডেট করা
        updateCategoryFilter(newCategories);
        // সবশেষে ফিল্টার ও রেন্ডার করা
        applyFiltersAndRender(); 
    });
}

function applyFiltersAndRender(resetPage = false) {
    // যদি ফিল্টার পরিবর্তন হয়, তাহলে প্রথম পেজে চলে যাবে
    if (resetPage) {
        currentPage = 1;
    }

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
                <button class="btn-print action-btn" data-barcode="${product.barcode}" data-name="${product.name}" data-price="${product.sellingPrice || 0}">Print Label</button>
            </td>
        `;
        inventoryBody.appendChild(row);
    });
}

// এই ফাংশনটির নাম এবং লজিক উন্নত করা হয়েছে
function updateCategoryFilter(newCategories) {
    const currentOptions = new Set(Array.from(categoryFilter.options).map(opt => opt.value));
    
    newCategories.forEach(category => {
        if (category && !currentOptions.has(category)) {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        }
    });
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
            applyFiltersAndRender(false); // পেজিনেশন ক্লিকের জন্য পেজ রিসেট হবে না
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

        if (target.matches('.btn-edit')) {
            const productId = target.dataset.id;
            const product = allProducts.find(p => p.id === productId);
            if (product) { /* ... edit modal logic ... */ }
        } else if (target.matches('.btn-delete')) {
            const productId = target.dataset.id;
            if (confirm('Are you sure?')) { /* ... delete logic ... */ }
        } else if (target.matches('.btn-print')) {
            const { barcode, name, price } = target.dataset;
            if (barcode && barcode !== 'N/A') {
                printSingleBarcode(barcode, name, parseFloat(price).toFixed(2));
            } else {
                alert('Barcode not available.');
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
        printMultipleBarcodes(productsToPrint);
    });

    printAllFilteredBtn.addEventListener('click', () => {
        if (filteredProducts.length === 0) {
            alert('No products to print.');
            return;
        }
        printMultipleBarcodes(filteredProducts);
    });

    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = e.target.checked);
    });

    editForm.addEventListener('submit', async (e) => { /* ... edit form submission logic ... */ });

    closeModalBtn.addEventListener('click', () => editModal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === editModal) editModal.style.display = 'none';
    });
    logoutBtn.addEventListener('click', async () => await signOut(auth));

    setupEventListeners.executed = true;
}