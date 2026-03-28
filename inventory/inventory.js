import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { 
    collection, onSnapshot, doc, deleteDoc, updateDoc, 
    orderBy, query, where, getDocs, getDoc, addDoc, serverTimestamp, limit, startAfter 
} from 'firebase/firestore';

// Inventory Audit Log Function
async function saveInventoryLog(productId, productName, actionType, oldStock, newStock) {
    try {
        const logRef = collection(db, 'shops', activeShopId, 'inventory_logs');
        await addDoc(logRef, {
            productId: productId,
            productName: productName,
            action: actionType, // 'UPDATE' or 'DELETE'
            oldStock: oldStock,
            newStock: newStock,
            change: newStock - oldStock,
            userEmail: auth.currentUser.email,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Log saving failed:", e);
    }
}

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
const stockLimitFilter = document.getElementById('stock-limit-filter');
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
const ROWS_PER_PAGE = 50; // Increased for better UX
const FIRESTORE_PAGE_SIZE = 100; // Load products in batches
let lastVisible = null;
let isLoadingMore = false;
let hasMoreProducts = true;
let hasEventListenersSetup = false;

// Authentication
onAuthStateChanged(auth, (user) => {
    if (user) {
        activeShopId = localStorage.getItem('activeShopId');
        if (activeShopId) {
            // রোল-বেসড ভিউ কন্ট্রোল
            const userRole = localStorage.getItem('userRole');
            const statsSection = document.querySelector('.stats-section');
            
            if (userRole !== 'owner' && statsSection) {
                statsSection.style.display = 'none';
            }
            
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

async function loadInventory() {
    if (!activeShopId) return;
    
    showLoadingState();
    
    try {
        const productsRef = collection(db, 'shops', activeShopId, 'inventory');
        const q = query(productsRef, orderBy("name"), limit(FIRESTORE_PAGE_SIZE));
        
        const snapshot = await getDocs(q);
        
        allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        lastVisible = snapshot.docs[snapshot.docs.length - 1];
        hasMoreProducts = snapshot.docs.length === FIRESTORE_PAGE_SIZE;
        
        updateCategoryStats();
        applyFiltersAndRender(false);
        
        // Setup real-time listener for updates only
        setupRealtimeListener();
        
    } catch (error) {
        console.error('Error loading inventory:', error);
        showStatus('Failed to load inventory', 'error');
    }
}

function setupRealtimeListener() {
    if (unsubscribe) unsubscribe();
    
    const productsRef = collection(db, 'shops', activeShopId, 'inventory');
    const q = query(productsRef, orderBy("name"));
    
    unsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const product = { id: change.doc.id, ...change.doc.data() };
            
            if (change.type === 'added') {
                const exists = allProducts.find(p => p.id === product.id);
                if (!exists) allProducts.push(product);
            }
            if (change.type === 'modified') {
                const index = allProducts.findIndex(p => p.id === product.id);
                if (index !== -1) allProducts[index] = product;
            }
            if (change.type === 'removed') {
                allProducts = allProducts.filter(p => p.id !== product.id);
            }
        });
        
        updateCategoryStats();
        applyFiltersAndRender(false);
    });
}

async function loadMoreProducts() {
    if (!hasMoreProducts || isLoadingMore || !lastVisible) return;
    
    isLoadingMore = true;
    showLoadingMoreState();
    
    try {
        const productsRef = collection(db, 'shops', activeShopId, 'inventory');
        const q = query(
            productsRef, 
            orderBy("name"), 
            startAfter(lastVisible),
            limit(FIRESTORE_PAGE_SIZE)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            hasMoreProducts = false;
            return;
        }
        
        const newProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allProducts = [...allProducts, ...newProducts];
        lastVisible = snapshot.docs[snapshot.docs.length - 1];
        hasMoreProducts = snapshot.docs.length === FIRESTORE_PAGE_SIZE;
        
        updateCategoryStats();
        applyFiltersAndRender(false);
        
    } catch (error) {
        console.error('Error loading more products:', error);
        showStatus('Failed to load more products', 'error');
    } finally {
        isLoadingMore = false;
        hideLoadingMoreState();
    }
}

function updateCategoryStats() {
    const currentCategory = categoryFilter.value;
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
}

function showLoadingState() {
    inventoryBody.innerHTML = '<tr><td colspan="9" class="loading-cell">⏳ Loading inventory...</td></tr>';
}

function showLoadingMoreState() {
    const loadMoreRow = document.createElement('tr');
    loadMoreRow.id = 'loading-more-row';
    loadMoreRow.innerHTML = '<td colspan="9" class="loading-cell">⏳ Loading more products...</td>';
    inventoryBody.appendChild(loadMoreRow);
}

function hideLoadingMoreState() {
    const loadMoreRow = document.getElementById('loading-more-row');
    if (loadMoreRow) loadMoreRow.remove();
}

function applyFiltersAndRender(resetPage = true) {
    if (resetPage) currentPage = 1;
    const term = searchInput.value.toLowerCase().trim();
    const category = categoryFilter.value;
    const stockLimit = parseInt(stockLimitFilter.value);

    filteredProducts = allProducts.filter(p => {
        const matchesSearch = !term || (p.name || '').toLowerCase().includes(term) || (p.barcode || '').toLowerCase().includes(term);
        const matchesCategory = !category || p.category === category;
        
        // Stock filter logic: if input is empty show all, if number is entered show products with stock <= that number
        const currentStock = parseInt(p.stock) || 0;
        const matchesStock = isNaN(stockLimit) || currentStock <= stockLimit;

        return matchesSearch && matchesCategory && matchesStock;
    });
    
    // বারকোড অনুযায়ী সিরিয়াল সর্ট
    filteredProducts.sort((a, b) => {
        const barcodeA = String(a.barcode || "0");
        const barcodeB = String(b.barcode || "0");
        return barcodeA.localeCompare(barcodeB, undefined, { numeric: true });
    });
    
    renderTable();
    setupPagination();
}

function renderTable() {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const paginated = filteredProducts.slice(start, start + ROWS_PER_PAGE);
    
    inventoryBody.innerHTML = paginated.length === 0 
        ? '<tr><td colspan="9" class="loading-cell">No products found.</td></tr>'
        : paginated.map(p => {
            const stock = parseInt(p.stock) || 0;
            const cp = parseFloat(p.costPrice) || 0;
            const sp = parseFloat(p.sellingPrice) || 0;
            
            // Profit calculation
            const profit = sp - cp;
            const margin = cp > 0 ? ((profit / cp) * 100).toFixed(1) : 0;

            // Stock color logic
            let stockClass = "stock-healthy";
            if (stock === 0) stockClass = "stock-critical";
            else if (stock <= 5) stockClass = "stock-low";

            const imgHtml = p.imageUrl 
                ? `<img src="${p.imageUrl}" class="product-thumb" data-name="${p.name}" data-src="${p.imageUrl}" alt="img">` 
                : `<span style="font-size:12px; color:#999; display:inline-block; width:40px; text-align:center;">No Img</span>`;

            return `
            <tr class="${stockClass}">
                <td><input type="checkbox" class="product-checkbox" data-id="${p.id}"></td>
                <td style="text-align: center;">${imgHtml}</td>
                <td>${p.name || 'N/A'}</td>
                <td>${p.category || 'N/A'}</td>
                <td style="color: #666; font-style: italic; font-size: 0.85rem;">${p.remark || '-'}</td>
                <td>${cp.toFixed(2)}</td>
                <td>
                    ${sp.toFixed(2)}
                    <br><small style="color: #28a745; font-weight: bold;">Margin: ${margin}%</small>
                </td>
                <td class="stock-cell"><strong>${stock}</strong></td>
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
        '<option value="">📂 All Categories</option>',
        ...categories.map(cat => {
            const stats = categoryStats[cat];
            const isSelected = cat === selectedValue ? 'selected' : '';
            const label = `${cat} (${stats.types})`; 
            return `<option value="${cat}" ${isSelected}>${label}</option>`;
        })
    ];
    
    categoryFilter.innerHTML = options.join('');
    
    // Update delete category button visibility immediately after updating filter
    const deleteCategoryBtn = document.getElementById('delete-category-btn');
    if (deleteCategoryBtn) {
        if (selectedValue && selectedValue !== '') {
            deleteCategoryBtn.style.display = 'inline-block';
            deleteCategoryBtn.setAttribute('data-category', selectedValue);
        } else {
            deleteCategoryBtn.style.display = 'none';
        }
    }
}

function setupPagination() {
    const pageCount = Math.ceil(filteredProducts.length / ROWS_PER_PAGE);
    
    if (pageCount <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    const maxButtons = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(pageCount, startPage + maxButtons - 1);
    
    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }
    
    let buttons = [];
    
    if (currentPage > 1) {
        buttons.push(`<button class="pagination-btn" data-page="${currentPage - 1}">← Prev</button>`);
    }
    
    if (startPage > 1) {
        buttons.push(`<button class="pagination-btn" data-page="1">1</button>`);
        if (startPage > 2) buttons.push(`<span class="pagination-dots">...</span>`);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        buttons.push(`<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`);
    }
    
    if (endPage < pageCount) {
        if (endPage < pageCount - 1) buttons.push(`<span class="pagination-dots">...</span>`);
        buttons.push(`<button class="pagination-btn" data-page="${pageCount}">${pageCount}</button>`);
    }
    
    if (currentPage < pageCount) {
        buttons.push(`<button class="pagination-btn" data-page="${currentPage + 1}">Next →</button>`);
    }
    
    // Load more button if more products available from Firestore
    if (hasMoreProducts && filteredProducts.length === allProducts.length) {
        buttons.push(`<button class="pagination-btn btn-load-more" id="load-more-btn">📦 Load More Products</button>`);
    }
    
    paginationContainer.innerHTML = buttons.join('');
    
    // Add load more event listener
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreProducts);
    }
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

    // Fullscreen toggle
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
                fullscreenBtn.textContent = '✕ Exit Fullscreen';
                fullscreenBtn.classList.add('active');
            } else {
                document.exitFullscreen();
                fullscreenBtn.textContent = '⛶ Fullscreen';
                fullscreenBtn.classList.remove('active');
            }
        });
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                fullscreenBtn.textContent = '⛶ Fullscreen';
                fullscreenBtn.classList.remove('active');
            }
        });
    }

    searchInput.addEventListener('input', () => applyFiltersAndRender(true));
    categoryFilter.addEventListener('change', () => {
        // Show/hide delete category button
        const deleteCategoryBtn = document.getElementById('delete-category-btn');
        if (deleteCategoryBtn) {
            const selectedCategory = categoryFilter.value;
            if (selectedCategory && selectedCategory !== '') {
                deleteCategoryBtn.style.display = 'inline-block';
                deleteCategoryBtn.setAttribute('data-category', selectedCategory);
            } else {
                deleteCategoryBtn.style.display = 'none';
            }
        }
        applyFiltersAndRender(true);
    });
    stockLimitFilter.addEventListener('input', () => applyFiltersAndRender(true));
    
    // Delete Category Button
    const deleteCategoryBtn = document.getElementById('delete-category-btn');
    if (deleteCategoryBtn) {
        deleteCategoryBtn.addEventListener('click', async () => {
            const category = deleteCategoryBtn.getAttribute('data-category');
            if (!category) return;
            
            const productsInCategory = allProducts.filter(p => p.category === category);
            const confirmMsg = `⚠️ Delete entire "${category}" category?\n\nThis will delete ${productsInCategory.length} products permanently.\n\nThis action cannot be undone!`;
            
            if (!confirm(confirmMsg)) return;
            
            try {
                deleteCategoryBtn.disabled = true;
                deleteCategoryBtn.textContent = 'Deleting...';
                
                await deleteCategoryWithProducts(category);
                
                showStatus(`✅ Category "${category}" and ${productsInCategory.length} products deleted successfully!`, 'success');
                categoryFilter.value = '';
                applyFiltersAndRender(true);
            } catch (error) {
                console.error('Delete category error:', error);
                showStatus('❌ Failed to delete category: ' + error.message, 'error');
            } finally {
                deleteCategoryBtn.disabled = false;
                deleteCategoryBtn.textContent = '🗑️ Delete Category';
            }
        });
    }
    
    paginationContainer.addEventListener('click', (e) => {
        if(e.target.matches('.pagination-btn') && e.target.dataset.page) {
            currentPage = parseInt(e.target.dataset.page, 10);
            applyFiltersAndRender(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // এডিট মডালে ইমেজ প্রিভিউ হ্যান্ডলার
    const editImageInput = document.getElementById('edit-image');
    const editImagePreview = document.getElementById('edit-image-preview');

    if (editImageInput) {
        editImageInput.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    editImagePreview.src = e.target.result;
                    editImagePreview.style.display = 'block';
                }
                reader.readAsDataURL(file);
            }
        });
    }

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
    
    // View Logs button event listener
    const viewLogsBtn = document.getElementById('view-logs-btn');
    if (viewLogsBtn) {
        viewLogsBtn.addEventListener('click', async () => {
            const logModal = document.getElementById('log-modal');
            const logTbody = document.getElementById('log-tbody');
            logModal.style.display = 'flex';
            logTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading logs...</td></tr>';

            try {
                const q = query(collection(db, 'shops', activeShopId, 'inventory_logs'), orderBy('timestamp', 'desc'), limit(50));
                const snap = await getDocs(q);
                
                if (snap.empty) {
                    logTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#999;">No audit logs found.</td></tr>';
                    return;
                }
                
                logTbody.innerHTML = snap.docs.map(doc => {
                    const d = doc.data();
                    const date = d.timestamp ? d.timestamp.toDate().toLocaleString() : 'N/A';
                    return `
                        <tr>
                            <td><small>${date}</small></td>
                            <td>${d.productName}</td>
                            <td><span class="badge ${d.action === 'DELETE' ? 'btn-delete' : 'btn-edit'}" style="padding:2px 5px; font-size:10px;">${d.action}</span></td>
                            <td>${d.oldStock}</td>
                            <td>${d.newStock}</td>
                            <td><small>${d.userEmail.split('@')[0]}</small></td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error('Error loading logs:', e);
                logTbody.innerHTML = '<tr><td colspan="6" style="color:red;">Error loading logs.</td></tr>';
            }
        });
    }
}

function openPrintPage(id, name, price) {
    const url = `../label-printer/index.html?id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}&price=${encodeURIComponent(price)}`;
    window.open(url, '_blank', 'width=1000,height=700');
}
window.openPrintPage = openPrintPage;

function openEditModal(product) {
    editForm.reset();
    Object.entries({
        'edit-product-id': product.id, 
        'edit-name': product.name, 
        'edit-category': product.category,
        'edit-remark': product.remark,
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
    const newRemark = document.getElementById('edit-remark').value.trim();
    const newCP = parseFloat(document.getElementById('edit-cp').value);
    const newSP = parseFloat(document.getElementById('edit-sp').value);
    const newStock = parseInt(document.getElementById('edit-stock').value, 10);

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        // Get old data for audit log
        const productRef = doc(db, 'shops', activeShopId, 'inventory', id);
        const oldDoc = await getDoc(productRef);
        const oldData = oldDoc.data();

        const data = {
            name: newName,
            category: newCategory,
            remark: newRemark,
            costPrice: newCP,
            sellingPrice: newSP,
            stock: newStock,
            lastUpdated: new Date()
        };

        // Upload image if selected
        if (imageInput.files && imageInput.files[0]) {
            saveBtn.textContent = 'Uploading Image...';
            const uploadedUrl = await uploadImageToImgBB(imageInput.files[0]);
            if (uploadedUrl) {
                data.imageUrl = uploadedUrl;
            }
        }

        await updateDoc(productRef, data);

        // Save audit log if stock changed
        if (oldData.stock !== newStock) {
            await saveInventoryLog(id, newName, 'UPDATE', oldData.stock, newStock);
        }

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
        // Get product data for audit log before deletion
        const productRef = doc(db, 'shops', activeShopId, 'inventory', id);
        const productDoc = await getDoc(productRef);
        const productData = productDoc.data();

        // Save audit log
        await saveInventoryLog(id, productData.name, 'DELETE', productData.stock, 0);

        // Delete related expenses
        const expensesRef = collection(db, 'shops', activeShopId, 'expenses');
        const q = query(expensesRef, where("relatedProductId", "==", id));
        const querySnapshot = await getDocs(q);

        const deleteExpensePromises = [];
        querySnapshot.forEach((docSnap) => {
            deleteExpensePromises.push(deleteDoc(doc(db, 'shops', activeShopId, 'expenses', docSnap.id)));
        });

        if (deleteExpensePromises.length > 0) {
            await Promise.all(deleteExpensePromises);
            console.log(`${deleteExpensePromises.length} related expense records deleted.`);
        }

        // Delete the product
        await deleteDoc(productRef);
        
        showStatus('Product and related purchase records deleted successfully.');
    } catch (error) { 
        console.error("Delete Error:", error);
        showStatus('Failed to delete product or related records.', 'error'); 
    }
}

// Delete entire category with all products
async function deleteCategoryWithProducts(category) {
    const isAuthorized = await verifyAdminPIN();
    if (!isAuthorized) throw new Error('Unauthorized');

    const productsToDelete = allProducts.filter(p => p.category === category);
    
    if (productsToDelete.length === 0) {
        throw new Error('No products found in this category');
    }

    const deletePromises = [];
    
    for (const product of productsToDelete) {
        // Save audit log
        const logPromise = saveInventoryLog(
            product.id, 
            product.name, 
            'DELETE_CATEGORY', 
            product.stock, 
            0
        );
        deletePromises.push(logPromise);
        
        // Delete related expenses
        const expensesRef = collection(db, 'shops', activeShopId, 'expenses');
        const q = query(expensesRef, where("relatedProductId", "==", product.id));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((docSnap) => {
            deletePromises.push(deleteDoc(doc(db, 'shops', activeShopId, 'expenses', docSnap.id)));
        });
        
        // Delete the product
        const productRef = doc(db, 'shops', activeShopId, 'inventory', product.id);
        deletePromises.push(deleteDoc(productRef));
    }
    
    await Promise.all(deletePromises);
}


// ============================================================
// STOCK TAKING MODULE
// ============================================================
(function initStocktake() {
    const modal       = document.getElementById('stocktake-modal');
    const tbody       = document.getElementById('stocktake-tbody');
    const catFilter   = document.getElementById('stocktake-category-filter');
    const searchInput = document.getElementById('stocktake-search');
    const summary     = document.getElementById('stocktake-summary');

    let stocktakeProducts = [];

    // Open modal
    document.getElementById('stocktake-btn').addEventListener('click', () => {
        openStocktake();
    });

    // Close modal
    document.getElementById('close-stocktake').addEventListener('click', () => {
        modal.style.display = 'none';
    });
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

    // Fullscreen toggle for stocktake modal
    const fsBtn = document.getElementById('stocktake-fullscreen-btn');
    fsBtn.addEventListener('click', () => {
        const modalContent = modal.querySelector('.modal-content');
        if (!document.fullscreenElement) {
            modalContent.requestFullscreen();
            fsBtn.textContent = '✕ Exit Fullscreen';
        } else {
            document.exitFullscreen();
            fsBtn.textContent = '⛶ Fullscreen';
        }
    });
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) fsBtn.textContent = '⛶ Fullscreen';
    });

    function openStocktake() {
        stocktakeProducts = [...allProducts].sort((a, b) => {
            const catA = (a.category || '').localeCompare(b.category || '');
            if (catA !== 0) return catA;
            return (a.name || '').localeCompare(b.name || '');
        });

        // Populate category filter
        const cats = [...new Set(stocktakeProducts.map(p => p.category).filter(Boolean))].sort();
        catFilter.innerHTML = '<option value="">All Categories</option>' +
            cats.map(c => `<option value="${c}">${c}</option>`).join('');

        renderStocktakeTable();
        modal.style.display = 'flex';
    }

    function renderStocktakeTable(filterCat = '', filterSearch = '') {
        const filtered = stocktakeProducts.filter(p => {
            const matchCat    = !filterCat    || p.category === filterCat;
            const matchSearch = !filterSearch || (p.name || '').toLowerCase().includes(filterSearch.toLowerCase()) || (p.barcode || '').includes(filterSearch);
            return matchCat && matchSearch;
        });

        let serial = 1;
        let lastCat = '';
        tbody.innerHTML = filtered.map(p => {
            let catRow = '';
            if (p.category !== lastCat) {
                lastCat = p.category;
                catRow = `<tr style="background:#e8f4fd;"><td colspan="7" style="font-weight:700; font-size:13px; padding:8px 12px; color:#1e3c72;">📂 ${p.category || 'Uncategorized'}</td></tr>`;
            }
            const sysStock = parseInt(p.stock) || 0;
            return `${catRow}
            <tr data-id="${p.id}" class="stocktake-row">
                <td style="text-align:center; color:#999; font-size:12px;">${serial++}</td>
                <td style="font-weight:500;">${p.name || ''}</td>
                <td style="font-size:12px; color:#666;">${p.category || ''}</td>
                <td style="font-size:12px; color:#888;">${p.barcode || '-'}</td>
                <td style="text-align:center; font-weight:700;">${sysStock}</td>
                <td style="text-align:center; background:#fffde7;">
                    <input type="number" class="actual-input" min="0" placeholder="—"
                        style="width:70px; padding:5px; border:2px solid #fdd835; border-radius:6px; text-align:center; font-weight:700; font-size:14px;"
                        data-system="${sysStock}" data-id="${p.id}" data-name="${p.name}">
                </td>
                <td class="diff-cell" style="text-align:center; font-weight:700; color:#999;">—</td>
            </tr>`;
        }).join('');

        updateSummary();
        setupActualInputs();
    }

    function setupActualInputs() {
        tbody.querySelectorAll('.actual-input').forEach(input => {
            input.addEventListener('input', function() {
                const actual  = parseInt(this.value);
                const system  = parseInt(this.dataset.system);
                const diffCell = this.closest('tr').querySelector('.diff-cell');

                if (isNaN(actual) || this.value === '') {
                    diffCell.textContent = '—';
                    diffCell.style.color = '#999';
                } else {
                    const diff = actual - system;
                    diffCell.textContent = diff > 0 ? `+${diff}` : diff;
                    diffCell.style.color = diff === 0 ? '#16a34a' : diff > 0 ? '#2563eb' : '#dc2626';
                    this.closest('tr').style.background = diff === 0 ? '#f0fdf4' : diff > 0 ? '#eff6ff' : '#fff5f5';
                }
                updateSummary();
            });
        });
    }

    function updateSummary() {
        const inputs   = tbody.querySelectorAll('.actual-input');
        let filled = 0, mismatch = 0;
        inputs.forEach(inp => {
            if (inp.value !== '') {
                filled++;
                if (parseInt(inp.value) !== parseInt(inp.dataset.system)) mismatch++;
            }
        });
        summary.innerHTML = `<strong>${filled}</strong> counted &nbsp;|&nbsp; <span style="color:#dc2626;"><strong>${mismatch}</strong> mismatch</span> &nbsp;|&nbsp; ${inputs.length} total`;
    }

    // Filter events
    catFilter.addEventListener('change',   () => renderStocktakeTable(catFilter.value, searchInput.value));
    searchInput.addEventListener('input',  () => renderStocktakeTable(catFilter.value, searchInput.value));

    // Scan to highlight
    document.getElementById('stocktake-scan-btn').addEventListener('click', () => {
        const barcode = prompt('Scan or type barcode:');
        if (!barcode) return;
        const row = tbody.querySelector(`tr[data-id]`);
        const allRows = tbody.querySelectorAll('tr[data-id]');
        let found = null;
        allRows.forEach(r => {
            const inp = r.querySelector('.actual-input');
            if (inp && inp.dataset.id) {
                const p = stocktakeProducts.find(x => x.id === inp.dataset.id);
                if (p && (p.barcode === barcode || p.id === barcode)) found = r;
            }
        });
        if (found) {
            found.scrollIntoView({ behavior: 'smooth', block: 'center' });
            found.style.outline = '3px solid #f59e0b';
            found.querySelector('.actual-input').focus();
            setTimeout(() => found.style.outline = '', 3000);
        } else {
            alert('Product not found: ' + barcode);
        }
    });

    // Print Sheet
    document.getElementById('stocktake-print-btn').addEventListener('click', () => {
        document.getElementById('stocktake-print-date').textContent = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });

        const printTbody = document.getElementById('stocktake-print-tbody');
        let serial = 1, lastCat = '';

        printTbody.innerHTML = stocktakeProducts.map(p => {
            let catRow = '';
            if (p.category !== lastCat) {
                lastCat = p.category;
                catRow = `<tr style="background:#e8f4fd;"><td colspan="7" style="font-weight:700; padding:6px 8px;">📂 ${p.category || 'Uncategorized'}</td></tr>`;
            }
            const inp = tbody.querySelector(`.actual-input[data-id="${p.id}"]`);
            const actual = inp && inp.value !== '' ? inp.value : '';
            const diff   = actual !== '' ? parseInt(actual) - (parseInt(p.stock) || 0) : '';
            const diffStr = diff !== '' ? (diff > 0 ? `+${diff}` : diff) : '';
            return `${catRow}<tr>
                <td style="border:1px solid #ccc; padding:6px; text-align:center;">${serial++}</td>
                <td style="border:1px solid #ccc; padding:6px;">${p.name || ''}</td>
                <td style="border:1px solid #ccc; padding:6px;">${p.category || ''}</td>
                <td style="border:1px solid #ccc; padding:6px;">${p.barcode || ''}</td>
                <td style="border:1px solid #ccc; padding:6px; text-align:center;">${p.stock || 0}</td>
                <td style="border:1px solid #ccc; padding:6px; text-align:center; background:#fffde7;">${actual}</td>
                <td style="border:1px solid #ccc; padding:6px; text-align:center; color:${diff < 0 ? 'red' : diff > 0 ? 'blue' : 'green'};">${diffStr}</td>
            </tr>`;
        }).join('');

        const printArea = document.getElementById('stocktake-print-area');
        printArea.style.display = 'block';
        window.print();
        printArea.style.display = 'none';
    });

    // Update Stock
    document.getElementById('stocktake-submit-btn').addEventListener('click', async () => {
        const inputs = tbody.querySelectorAll('.actual-input');
        const toUpdate = [];
        inputs.forEach(inp => {
            if (inp.value !== '') {
                const actual = parseInt(inp.value);
                const system = parseInt(inp.dataset.system);
                if (actual !== system) {
                    toUpdate.push({ id: inp.dataset.id, name: inp.dataset.name, oldStock: system, newStock: actual });
                }
            }
        });

        if (toUpdate.length === 0) { alert('কোনো পরিবর্তন নেই।'); return; }

        if (!confirm(`${toUpdate.length}টি product এর stock update করবেন?`)) return;

        document.getElementById('stocktake-submit-btn').textContent = 'Updating...';
        document.getElementById('stocktake-submit-btn').disabled = true;

        try {
            for (const item of toUpdate) {
                const productRef = doc(db, 'shops', activeShopId, 'inventory', item.id);
                await updateDoc(productRef, { stock: item.newStock, lastUpdated: new Date() });
                await saveInventoryLog(item.id, item.name, 'STOCKTAKE', item.oldStock, item.newStock);
            }
            modal.style.display = 'none';
            showStatus(`✅ ${toUpdate.length}টি product এর stock update হয়েছে!`, 'success');
        } catch (e) {
            console.error(e);
            showStatus('❌ Update failed: ' + e.message, 'error');
        } finally {
            document.getElementById('stocktake-submit-btn').textContent = '✅ Update Stock';
            document.getElementById('stocktake-submit-btn').disabled = false;
        }
    });
})();
