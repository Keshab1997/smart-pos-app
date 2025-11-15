// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, deleteDoc, updateDoc, orderBy, query } from 'firebase/firestore';
// *** পরিবর্তন ১: printer.js থেকে নতুন 'printLargeLabels' ফাংশনটি ইম্পোর্ট করা হলো ***
import { showTemplateModal, printLargeLabels } from './printer.js'; 

// =================================================================
// --- DOM Elements ---
// =================================================================
const inventoryBody = document.getElementById('inventory-tbody');
const searchInput = document.getElementById('search-inventory');
const categoryFilter = document.getElementById('category-filter');
const paginationContainer = document.getElementById('pagination-container');
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const closeModalBtn = editModal.querySelector('.close-button');
const logoutBtn = document.getElementById('logout-btn');
const statusMessageContainer = document.getElementById('status-message-container');
const selectAllCheckbox = document.getElementById('select-all-checkbox');

// *** পরিবর্তন ২: HTML এ পরিবর্তন করা নতুন বাটন আইডিগুলো এখানে যুক্ত করা হলো ***
const printLargeLabelBtn = document.getElementById('print-large-label-btn'); // নতুন বাটন
const printSelectedTemplateBtn = document.getElementById('print-selected-template-btn'); // পুরনো বাটনের নতুন আইডি
const printAllFilteredTemplateBtn = document.getElementById('print-all-filtered-template-btn'); // পুরনো বাটনের নতুন আইডি

// =================================================================
// --- Global State ---
// =================================================================
let allProducts = [];
let filteredProducts = [];
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
        const currentSelectedCategory = categoryFilter.value;
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
                <button class="btn-print action-btn" data-id="${product.id}">Print</button>
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
        if (!productId) return;
        
        const product = allProducts.find(p => p.id === productId);

        if (target.matches('.btn-edit')) {
            if (product) openEditModal(product);
        } else if (target.matches('.btn-delete')) {
            if (confirm(`Are you sure you want to delete "${product.name}"?`)) {
                deleteProduct(productId);
            }
        } else if (target.matches('.btn-print')) { // একটিমাত্র প্রোডাক্ট প্রিন্ট করার জন্য
            if (product) {
                printLargeLabels([product]); // সরাসরি বড় লেবেল প্রিন্ট
            }
        }
    });

    // *** পরিবর্তন ৩: নতুন 'Print Large Label' বাটনের জন্য ইভেন্ট লিসনার ***
    printLargeLabelBtn.addEventListener('click', () => {
        // টেবিল থেকে সিলেক্ট করা প্রোডাক্টগুলো সংগ্রহ করা
        const selectedProducts = getSelectedProducts();
        
        if (selectedProducts.length === 0) {
            alert('Please select products to print.');
            return;
        }
        
        // সরাসরি বড় লেবেল প্রিন্ট করার ফাংশন কল করা
        printLargeLabels(selectedProducts);
    });

    // পুরনো টেমপ্লেট-ভিত্তিক প্রিন্ট বাটনগুলোর জন্য ইভেন্ট লিসনার
    printSelectedTemplateBtn.addEventListener('click', () => {
        const selectedProducts = getSelectedProducts();
        if (selectedProducts.length === 0) {
            alert('Please select products to print.');
            return;
        }
        showTemplateModal(selectedProducts);
    });

    printAllFilteredTemplateBtn.addEventListener('click', () => {
        if (filteredProducts.length === 0) {
            alert('No products to print in the current filter.');
            return;
        }
        showTemplateModal(filteredProducts);
    });

    selectAllCheckbox.addEventListener('change', (e) => {
        document.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = e.target.checked);
    });

    editForm.addEventListener('submit', handleEditFormSubmit);
    closeModalBtn.addEventListener('click', () => editModal.style.display = 'none');
    window.addEventListener('click', (e) => {
        if (e.target === editModal) editModal.style.display = 'none';
    });
    logoutBtn.addEventListener('click', async () => await signOut(auth));

    setupEventListeners.executed = true;
}

// =================================================================
// --- Helper Functions for Actions ---
// =================================================================

// *** পরিবর্তন ৪: সিলেক্ট করা প্রোডাক্ট খুঁজে বের করার জন্য একটি Helper Function ***
function getSelectedProducts() {
    const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.id);
    return allProducts.filter(p => selectedIds.includes(p.id));
}

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