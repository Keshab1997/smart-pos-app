import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
// Update: Added 'getDoc' to imports for security check
import { 
    collection, onSnapshot, doc, deleteDoc, updateDoc, 
    orderBy, query, where, getDocs, getDoc 
} from 'firebase/firestore';

// --- DOM Elements ---
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

// --- Global State ---
let allProducts = [], filteredProducts = [];
let currentPage = 1, currentUserId = null, unsubscribe;
const ROWS_PER_PAGE = 10, LOW_STOCK_THRESHOLD = 10;
let hasEventListenersSetup = false;

// --- Authentication ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        loadInventory();
        if (!hasEventListenersSetup) setupEventListeners();
    } else {
        window.location.href = '../index.html';
    }
});

// --- Core Functions ---
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

// --- Event Listeners ---
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
        if (target.matches('.btn-print')) return;

        const product = allProducts.find(p => p.id === target.dataset.id);
        if (!product) return;

        if (target.matches('.btn-edit')) openEditModal(product);
        else if (target.matches('.btn-delete')) { 
            // ইউজার কনফার্ম করার পর deleteProduct কল হবে, সেখানে পিন চাইবে
            if (confirm(`Delete "${product.name}"?`)) deleteProduct(product.id); 
        } 
    });
    
    printSelectedBtn.addEventListener('click', () => {
        alert('Please print barcodes one by one using the Print button.');
    });

    printCategoryBtn.addEventListener('click', () => {
        alert('Please print barcodes one by one using the Print button.');
    });

    selectAllCheckbox.addEventListener('change', (e) => inventoryBody.querySelectorAll('.product-checkbox').forEach(cb => cb.checked = e.target.checked));

    editModal.querySelector('.close-button').addEventListener('click', () => editModal.style.display = 'none');
    window.addEventListener('click', (e) => { if (e.target === editModal) editModal.style.display = 'none'; });
    
    editForm.addEventListener('submit', handleEditFormSubmit);

    logoutBtn.addEventListener('click', () => signOut(auth));
}

// --- Helper Functions ---
function openPrintPage(id, name, price) {
    const url = `../print-barcode.html?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}&price=${encodeURIComponent(price)}`;
    window.open(url, '_blank', 'width=800,height=600');
}
window.openPrintPage = openPrintPage;

function openEditModal(product) {
    editForm.reset();
    Object.entries({
        'edit-product-id': product.id, 
        'edit-name': product.name, 
        'edit-category': product.category,
        'edit-cp': product.costPrice, 
        'edit-sp': product.sellingPrice, 
        'edit-stock': product.stock,
        'edit-barcode': product.barcode
    }).forEach(([id, value]) => { document.getElementById(id).value = value || ''; });
    editModal.style.display = 'flex';
}

// --- PIN VERIFICATION HELPER ---
async function verifyAdminPIN() {
    const userPin = prompt("🔒 SECURITY: Enter Master PIN to continue:");
    if (!userPin) return false;

    try {
        const settingsRef = doc(db, 'shops', currentUserId, 'settings', 'security');
        const snap = await getDoc(settingsRef);
        
        if (snap.exists()) {
            if (snap.data().master_pin === userPin) return true;
        } else {
             alert("Security PIN not set in database. Please configure 'settings/security'.");
             return false;
        }
        alert("❌ Wrong PIN!");
        return false;
    } catch (e) {
        console.error(e);
        alert("Error checking PIN.");
        return false;
    }
}

// =======================================================================
// <<<<<<<<<<< SECURED EDIT SUBMIT FUNCTION >>>>>>>>>>>
// =======================================================================
async function handleEditFormSubmit(e) {
    e.preventDefault();
    
    // 1. সিকিউরিটি চেক (Security Check)
    const isAuthorized = await verifyAdminPIN();
    if (!isAuthorized) return; // পিন ভুল হলে বা না দিলে এখানে থামবে

    // 2. পিন ঠিক থাকলে বাকি কাজ হবে
    const id = document.getElementById('edit-product-id').value;
    const newName = document.getElementById('edit-name').value.trim();
    const newCategory = document.getElementById('edit-category').value.trim();
    const newCP = parseFloat(document.getElementById('edit-cp').value);
    const newSP = parseFloat(document.getElementById('edit-sp').value);
    const newStock = parseInt(document.getElementById('edit-stock').value, 10);

    const data = {
        name: newName,
        category: newCategory,
        costPrice: newCP,
        sellingPrice: newSP,
        stock: newStock,
    };

    try {
        await updateDoc(doc(db, 'shops', currentUserId, 'inventory', id), data);

        const expensesRef = collection(db, 'shops', currentUserId, 'expenses');
        const q = query(expensesRef, where("relatedProductId", "==", id));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            querySnapshot.forEach(async (docSnap) => {
                const expenseRef = doc(db, 'shops', currentUserId, 'expenses', docSnap.id);
                const newTotalAmount = newCP * newStock;
                await updateDoc(expenseRef, {
                    amount: newTotalAmount,
                    description: `Inventory purchase: ${newName}`
                });
            });
        }

        showStatus('Product updated successfully!');
        editModal.style.display = 'none';

    } catch (error) {
        console.error("Update Error:", error);
        showStatus('Failed to update product.', 'error'); 
    }
}

// =======================================================================
// <<<<<<<<<<< SECURED DELETE FUNCTION >>>>>>>>>>>
// =======================================================================
async function deleteProduct(id) {
    // 1. সিকিউরিটি চেক (Security Check)
    const isAuthorized = await verifyAdminPIN();
    if (!isAuthorized) return; // পিন ভুল হলে ডিলিট হবে না

    // 2. পিন ঠিক থাকলে ডিলিট হবে
    try {
        await deleteDoc(doc(db, 'shops', currentUserId, 'inventory', id));
        showStatus('Product deleted successfully.');
    } catch (error) { 
        console.error(error);
        showStatus('Failed to delete product.', 'error'); 
    }
}