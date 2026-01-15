import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { 
    collection, onSnapshot, doc, deleteDoc, updateDoc, 
    orderBy, query, where, getDocs, getDoc 
} from 'firebase/firestore';

// ImgBB API Configuration
const IMGBB_API_KEY = '13567a95e9fe3a212a8d8d10da9f3267';

// ইমেজ আপলোড ফাংশন
async function uploadImageToImgBB(file) {
    const formData = new FormData();
    formData.append('image', file);
    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        return data.success ? data.data.url : null;
    } catch (error) {
        console.error("ImgBB Error:", error);
        return null;
    }
}

// DOM Elements
const inventoryBody = document.getElementById('inventory-tbody');
const searchInput = document.getElementById('search-inventory');
const categoryFilter = document.getElementById('category-filter');
const paginationContainer = document.getElementById('pagination-container');
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const statusMessageContainer = document.getElementById('status-message-container');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const printSelectedBtn = document.getElementById('print-selected-btn');
const printCategoryBtn = document.getElementById('print-category-btn');

// Image Modal Elements
let imageModal = null;

// Global State
let allProducts = [], filteredProducts = [];
let currentPage = 1, activeShopId = null, unsubscribe;
const ROWS_PER_PAGE = 10, LOW_STOCK_THRESHOLD = 10;
let hasEventListenersSetup = false;

// Authentication
onAuthStateChanged(auth, (user) => {
    if (user) {
        activeShopId = localStorage.getItem('activeShopId');
        if (activeShopId) {
            createImageModal();
            loadInventory();
            if (!hasEventListenersSetup) setupEventListeners();
        } else {
            window.location.href = '../index.html';
        }
    } else {
        window.location.href = '../index.html';
    }
});

// Create Image Modal
function createImageModal() {
    if (document.getElementById('product-image-modal')) return;

    const modalHtml = `
        <div id="product-image-modal" class="modal" style="display:none; align-items:center; justify-content:center;">
            <div class="modal-content" style="text-align:center; max-width: 500px; position:relative;">
                <span class="close-button" id="close-image-modal" style="position:absolute; right:15px; top:10px; font-size:24px; cursor:pointer;">&times;</span>
                <h3 id="img-modal-title" style="margin-top:0;">Product Image</h3>
                <div style="min-height: 200px; display: flex; align-items: center; justify-content: center;">
                    <img id="img-modal-preview" src="" alt="Product" style="max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    imageModal = document.getElementById('product-image-modal');
    document.getElementById('close-image-modal').addEventListener('click', () => {
        imageModal.style.display = 'none';
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === imageModal) imageModal.style.display = 'none';
    });
}

function loadInventory() {
    if (!activeShopId) return;
    if (unsubscribe) unsubscribe();
    
    const productsRef = collection(db, 'shops', activeShopId, 'inventory');
    const q = query(productsRef, orderBy("name"));
    
    unsubscribe = onSnapshot(q, (snapshot) => {
        const currentCategory = categoryFilter.value;
        
        allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const categoryStats = {};
        
        allProducts.forEach(product => {
            const cat = product.category;
            const stock = parseInt(product.stock) || 0;

            if (cat) {
                if (!categoryStats[cat]) {
                    categoryStats[cat] = { types: 0, totalStock: 0 };
                }
                categoryStats[cat].types += 1;
                categoryStats[cat].totalStock += stock;
            }
        });

        updateCategoryFilter(categoryStats, currentCategory);
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
        ? '<tr><td colspan="9" class="loading-cell">No products found.</td></tr>'
        : paginated.map(p => {
            const imgHtml = p.imageUrl 
                ? `<img src="${p.imageUrl}" class="product-thumb" data-name="${p.name}" data-src="${p.imageUrl}" alt="img" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px; cursor: pointer; border: 1px solid #ddd; transition: transform 0.2s;">` 
                : `<span style="font-size:12px; color:#999; display:inline-block; width:40px; text-align:center;">No Img</span>`;

            return `
            <tr class="${p.stock <= LOW_STOCK_THRESHOLD ? 'low-stock' : ''}">
                <td><input type="checkbox" class="product-checkbox" data-id="${p.id}"></td>
                <td style="text-align: center;">${imgHtml}</td>
                <td>${p.name || 'N/A'}</td>
                <td>${p.category || 'N/A'}</td>
                <td>${(p.costPrice || 0).toFixed(2)}</td>
                <td>${(p.sellingPrice || 0).toFixed(2)}</td>
                <td>${p.stock || 0}</td>
                <td>${p.barcode || 'N/A'}</td>
                <td class="action-buttons">
                    <button class="btn btn-sm btn-edit" data-id="${p.id}" title="Edit">Edit</button>
                    <button class="btn btn-sm btn-delete" data-id="${p.id}" title="Delete">Delete</button>
                    <button class="btn btn-sm btn-print" onclick="openPrintPage('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.sellingPrice}')" title="Print Barcode">Print</button>
                </td>
            </tr>`;
        }).join('');
}

function updateCategoryFilter(categoryStats, selectedValue) {
    const categories = Object.keys(categoryStats).sort();

    const options = [
        '<option value="">All Categories</option>',
        ...categories.map(cat => {
            const stats = categoryStats[cat];
            const isSelected = cat === selectedValue ? 'selected' : '';
            const label = `${cat} (Prod: ${stats.types} | Qty: ${stats.totalStock})`;
            return `<option value="${cat}" ${isSelected}>${label}</option>`;
        })
    ];
    
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
        if (e.target.classList.contains('product-thumb')) {
            const src = e.target.dataset.src;
            const name = e.target.dataset.name;
            document.getElementById('img-modal-preview').src = src;
            document.getElementById('img-modal-title').innerText = name;
            imageModal.style.display = 'flex';
            return;
        }

        const target = e.target.closest('button');
        if (!target) return;
        if (target.matches('.btn-print')) return;

        const product = allProducts.find(p => p.id === target.dataset.id);
        if (!product) return;

        if (target.matches('.btn-edit')) openEditModal(product);
        else if (target.matches('.btn-delete')) { 
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
}

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
    
    // পুরনো ছবি থাকলে প্রিভিউ দেখানো
    const preview = document.getElementById('edit-image-preview');
    if (product.imageUrl) {
        preview.src = product.imageUrl;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
    
    editModal.style.display = 'flex';
}

async function verifyAdminPIN() {
    const userPin = prompt("🔒 SECURITY: Enter Master PIN to continue:");
    if (!userPin) return false;

    try {
        const settingsRef = doc(db, 'shops', activeShopId, 'settings', 'security');
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

async function handleEditFormSubmit(e) {
    e.preventDefault();
    
    const isAuthorized = await verifyAdminPIN();
    if (!isAuthorized) return; 

    const saveBtn = document.getElementById('edit-save-btn');
    const id = document.getElementById('edit-product-id').value;
    const imageInput = document.getElementById('edit-image');
    const newName = document.getElementById('edit-name').value.trim();
    const newCategory = document.getElementById('edit-category').value.trim();
    const newCP = parseFloat(document.getElementById('edit-cp').value);
    const newSP = parseFloat(document.getElementById('edit-sp').value);
    const newStock = parseInt(document.getElementById('edit-stock').value, 10);

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const data = {
        name: newName,
        category: newCategory,
        costPrice: newCP,
        sellingPrice: newSP,
        stock: newStock,
        lastUpdated: new Date()
    };

    try {
        // যদি নতুন ছবি সিলেক্ট করা হয়
        if (imageInput.files && imageInput.files[0]) {
            saveBtn.textContent = 'Uploading Image...';
            const uploadedUrl = await uploadImageToImgBB(imageInput.files[0]);
            if (uploadedUrl) {
                data.imageUrl = uploadedUrl;
            }
        }

        await updateDoc(doc(db, 'shops', activeShopId, 'inventory', id), data);

        const expensesRef = collection(db, 'shops', activeShopId, 'expenses');
        const q = query(expensesRef, where("relatedProductId", "==", id));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            querySnapshot.forEach(async (docSnap) => {
                const expenseRef = doc(db, 'shops', activeShopId, 'expenses', docSnap.id);
                const newTotalAmount = newCP * newStock;
                await updateDoc(expenseRef, {
                    amount: newTotalAmount,
                    description: `Inventory purchase: ${newName}`,
                    quantity: newStock
                });
            });
        }

        showStatus('Product updated successfully!');
        editModal.style.display = 'none';

    } catch (error) {
        console.error("Update Error:", error);
        showStatus('Failed to update product.', 'error'); 
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
    }
}

async function deleteProduct(id) {
    const isAuthorized = await verifyAdminPIN();
    if (!isAuthorized) return;

    try {
        // ১. প্রথমে এই প্রোডাক্টের সাথে সম্পর্কিত সব খরচ (Expenses) খুঁজে বের করা
        const expensesRef = collection(db, 'shops', activeShopId, 'expenses');
        const q = query(expensesRef, where("relatedProductId", "==", id));
        const querySnapshot = await getDocs(q);

        // ২. খরচগুলো ডিলিট করার জন্য প্রমিস লিস্ট তৈরি করা
        const deleteExpensePromises = [];
        querySnapshot.forEach((docSnap) => {
            deleteExpensePromises.push(deleteDoc(doc(db, 'shops', activeShopId, 'expenses', docSnap.id)));
        });

        // ৩. সব খরচ ডিলিট করা
        if (deleteExpensePromises.length > 0) {
            await Promise.all(deleteExpensePromises);
            console.log(`${deleteExpensePromises.length} related expense records deleted.`);
        }

        // ৪. সবশেষে ইনভেন্টরি থেকে প্রোডাক্টটি ডিলিট করা
        await deleteDoc(doc(db, 'shops', activeShopId, 'inventory', id));
        
        showStatus('Product and related purchase records deleted successfully.');
    } catch (error) { 
        console.error("Delete Error:", error);
        showStatus('Failed to delete product or related records.', 'error'); 
    }
}