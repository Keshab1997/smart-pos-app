// inventory.js (সম্পূর্ণ সংশোধিত এবং label-editor ছাড়া)

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, doc, deleteDoc, updateDoc, orderBy, query } from 'firebase/firestore';
// *** পরিবর্তন: label-editor.js ইম্পোর্ট লাইনটি সরিয়ে দেওয়া হয়েছে ***

// =================================================================
// --- DOM Elements ---
// =================================================================
const inventoryBody = document.getElementById('inventory-tbody');
const searchInput = document.getElementById('search-inventory');
const categoryFilter = document.getElementById('category-filter');
const paginationContainer = document.getElementById('pagination-container');
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const logoutBtn = document.getElementById('logout-btn');
const statusMessageContainer = document.getElementById('status-message-container');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const printSelectedBtn = document.getElementById('print-selected-btn');
const printCategoryBtn = document.getElementById('print-category-btn');

// =================================================================
// --- Global State ---
// =================================================================
let allProducts = [], filteredProducts = [];
let currentPage = 1, currentUserId = null, unsubscribe;
const ROWS_PER_PAGE = 10, LOW_STOCK_THRESHOLD = 10;
let hasEventListenersSetup = false;

// =================================================================
// --- Authentication & Initialization ---
// =================================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        loadInventory();
        if (!hasEventListenersSetup) setupEventListeners();
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
    const productsRef = collection(db, 'shops', currentUserId, 'inventory');
    const q = query(productsRef, orderBy("name"));
    unsubscribe = onSnapshot(q, (snapshot) => {
        const currentCategory = categoryFilter.value;
        allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const categories = new Set(allProducts.map(p => p.category).filter(Boolean));
        updateCategoryFilter(categories, currentCategory);
        applyFiltersAndRender(false);
    });
}

function applyFiltersAndRender(resetPage = true) {
    if (resetPage) currentPage = 1;
    const term = searchInput.value.toLowerCase().trim();
    const category = categoryFilter.value;
    filteredProducts = allProducts.filter(p => 
        (!term || (p.name || '').toLowerCase().includes(term) || (p.barcode || '').toLowerCase().includes(term)) &&
        (!category || p.category === category)
    );
    renderTable();
    setupPagination();
}

function renderTable() {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const paginated = filteredProducts.slice(start, start + ROWS_PER_PAGE);
    inventoryBody.innerHTML = paginated.length === 0 
        ? '<tr><td colspan="8" class="loading-cell">No products found.</td></tr>'
        : paginated.map(p => `
            <tr class="${p.stock <= LOW_STOCK_THRESHOLD ? 'low-stock' : ''}">
                <td><input type="checkbox" class="product-checkbox" data-id="${p.id}"></td>
                <td>${p.name || 'N/A'}</td><td>${p.category || 'N/A'}</td>
                <td>${(p.costPrice || 0).toFixed(2)}</td><td>${(p.sellingPrice || 0).toFixed(2)}</td>
                <td>${p.stock || 0}</td><td>${p.barcode || 'N/A'}</td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-edit" data-id="${p.id}" title="Edit">Edit</button>
                    <button class="btn btn-sm btn-delete" data-id="${p.id}" title="Delete">Delete</button>
                    
                    <!-- *** পরিবর্তন: 'Print' বাটন এখন openPrintPage ফাংশনকে কল করবে *** -->
                    <button class="btn btn-sm btn-print" onclick="openPrintPage('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.sellingPrice}')" title="Print Barcode">Print</button>
                </td>
            </tr>`).join('');
}

function updateCategoryFilter(categories, selectedValue) {
    const options = ['<option value="">All Categories</option>', ...[...categories].map(cat => `<option value="${cat}" ${cat === selectedValue ? 'selected' : ''}>${cat}</option>`)];
    categoryFilter.innerHTML = options.join('');
}

function setupPagination() {
    const pageCount = Math.ceil(filteredProducts.length / ROWS_PER_PAGE);
    paginationContainer.innerHTML = Array.from({ length: pageCount }, (_, i) => `<button class="pagination-btn ${i + 1 === currentPage ? 'active' : ''}" data-page="${i + 1}">${i + 1}</button>`).join('');
}

function showStatus(message, type = 'success') {
    const div = document.createElement('div');
    div.className = `status-message ${type}`;
    div.textContent = message;
    statusMessageContainer.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

// =================================================================
// --- Event Listeners ---
// =================================================================
function setupEventListeners() {
    hasEventListenersSetup = true;

    searchInput.addEventListener('input', () => applyFiltersAndRender(true));
    categoryFilter.addEventListener('change', () => applyFiltersAndRender(true));
    
    paginationContainer.addEventListener('click', (e) => {
        if(e.target.matches('.pagination-btn')) {
            currentPage = parseInt(e.target.dataset.page, 10);
            applyFiltersAndRender(false);
        }
    });

    inventoryBody.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        
        // Print বাটন এর জন্য আলাদা ফাংশন (openPrintPage) ব্যবহার হচ্ছে, তাই এখানে আর হ্যান্ডেল করার প্রয়োজন নেই।
        if (target.matches('.btn-print')) return;

        const product = allProducts.find(p => p.id === target.dataset.id);
        if (!product) return;

        if (target.matches('.btn-edit')) openEditModal(product);
        else if (target.matches('.btn-delete')) { if (confirm(`Delete "${product.name}"?`)) deleteProduct(product.id); } 
    });
    
    // *** পরিবর্তন: এই বাটনগুলো এখন আর লেবেল এডিটর খুলবে না। এদেরকে ডিজেবল করে দেওয়া যেতে পারে বা নতুন কার্যকারিতা দেওয়া যেতে পারে। আপাতত অ্যালার্ট দেখানো হচ্ছে। ***
    printSelectedBtn.addEventListener('click', () => {
        alert('This feature (Print Selected) is currently disabled. Please print barcodes one by one.');
    });

    printCategoryBtn.addEventListener('click', () => {
        alert('This feature (Print by Category) is currently disabled. Please print barcodes one by one.');
    });

    selectAllCheckbox.addEventListener('change', (e) => inventoryBody.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = e.target.checked));

    // Edit Modal Logic
    editModal.querySelector('.close-button').addEventListener('click', () => editModal.style.display = 'none');
    window.addEventListener('click', (e) => { if (e.target === editModal) editModal.style.display = 'none'; });
    editForm.addEventListener('submit', handleEditFormSubmit);

    logoutBtn.addEventListener('click', () => signOut(auth));
}

// =================================================================
// --- Helper Functions ---
// =================================================================

// *** নতুন ফাংশন যোগ করা হলো ***
// এই ফাংশনটি নতুন টেমপ্লেট-ভিত্তিক প্রিন্ট পেজ খুলবে
function openPrintPage(id, name, price) {
    // URL এ ডেটা encode করে পাঠানো হচ্ছে যাতে স্পেশাল ক্যারেক্টার (যেমন ', ", &) সমস্যা না করে
    const url = `../print-barcode.html?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}&price=${encodeURIComponent(price)}`;
    
    // নতুন উইন্ডোতে প্রিন্ট পেজ ওপেন করা
    window.open(url, '_blank', 'width=800,height=600');
}
// openPrintPage ফাংশনটিকে গ্লোবাল স্কোপে যুক্ত করা হচ্ছে যাতে HTML থেকে সরাসরি কল করা যায়
window.openPrintPage = openPrintPage;

function getSelectedProducts() {
    const ids = Array.from(inventoryBody.querySelectorAll('.product-checkbox:checked')).map(cb => cb.dataset.id);
    return allProducts.filter(p => ids.includes(p.id));
}

function openEditModal(product) {
    editForm.reset();
    Object.entries({
        'edit-product-id': product.id, 'edit-name': product.name, 'edit-category': product.category,
        'edit-cp': product.costPrice, 'edit-sp': product.sellingPrice, 'edit-stock': product.stock,
        'edit-barcode': product.barcode
    }).forEach(([id, value]) => { document.getElementById(id).value = value || ''; });
    editModal.style.display = 'flex';
}

async function handleEditFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-product-id').value;
    const data = {
        name: document.getElementById('edit-name').value.trim(),
        category: document.getElementById('edit-category').value.trim(),
        costPrice: parseFloat(document.getElementById('edit-cp').value),
        sellingPrice: parseFloat(document.getElementById('edit-sp').value),
        stock: parseInt(document.getElementById('edit-stock').value, 10),
    };
    try {
        await updateDoc(doc(db, 'shops', currentUserId, 'inventory', id), data);
        showStatus('Product updated successfully!');
        editModal.style.display = 'none';
    } catch (error) { showStatus('Failed to update product.', 'error'); }
}

async function deleteProduct(id) {
    try {
        await deleteDoc(doc(db, 'shops', currentUserId, 'inventory', id));
        showStatus('Product deleted successfully.');
    } catch (error) { showStatus('Failed to delete product.', 'error'); }
}