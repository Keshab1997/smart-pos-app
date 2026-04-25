import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import { 
    collection, onSnapshot, doc, deleteDoc, updateDoc, setDoc,
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
const dateFromFilter = document.getElementById('date-from-filter');
const dateToFilter = document.getElementById('date-to-filter');
const clearDateFilterBtn = document.getElementById('clear-date-filter');
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
let hideStockOut = false;
let sortField = null, sortAsc = true;

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
        
        // If more products exist, load all for accurate stats
        if (hasMoreProducts) {
            loadAllForStats();
        }
        
        updateCategoryStats();
        applyFiltersAndRender(false);
        
        // Setup real-time listener for updates only
        setupRealtimeListener();
        
    } catch (error) {
        console.error('Error loading inventory:', error);
        showStatus('Failed to load inventory', 'error');
    }
}

async function loadAllForStats() {
    try {
        const productsRef = collection(db, 'shops', activeShopId, 'inventory');
        const snapshot = await getDocs(query(productsRef));
        allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        lastVisible = snapshot.docs[snapshot.docs.length - 1];
        hasMoreProducts = false;
        updateCategoryStats();
        applyFiltersAndRender(false);
    } catch (e) {
        console.error('loadAllForStats error:', e);
    }
}

function setupRealtimeListener() {
    if (unsubscribe) unsubscribe();
    
    const productsRef = collection(db, 'shops', activeShopId, 'inventory');
    const q = query(productsRef, orderBy("name"));
    
    let isFirstSnapshot = true;
    unsubscribe = onSnapshot(q, (snapshot) => {
        // Skip the initial snapshot — data already loaded via getDocs in loadInventory
        if (isFirstSnapshot) {
            isFirstSnapshot = false;
            return;
        }
        snapshot.docChanges().forEach((change) => {
            const product = { id: change.doc.id, ...change.doc.data() };
            
            if (change.type === 'added') {
                // Only add if not already in allProducts (new product added after initial load)
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
    let stockOutCount = 0;
    
    allProducts.forEach(product => {
        const cat = product.category;
        const stock = parseInt(product.stock) || 0;

        if (stock === 0) stockOutCount++;

        if (cat) {
            if (!categoryStats[cat]) {
                categoryStats[cat] = { types: 0, totalStock: 0 };
            }
            categoryStats[cat].types += 1;
            categoryStats[cat].totalStock += stock;
        }
    });

    updateCategoryFilter(categoryStats, currentCategory, stockOutCount);
    
    // Stats dashboard update করা (inventory-extras.js থেকে)
    if (window.calculateInventoryStats) {
        window.calculateInventoryStats();
    }
}

function showLoadingState() {
    inventoryBody.innerHTML = '<tr><td colspan="10" class="loading-cell">⏳ Loading inventory...</td></tr>';
}

function showLoadingMoreState() {
    const loadMoreRow = document.createElement('tr');
    loadMoreRow.id = 'loading-more-row';
    loadMoreRow.innerHTML = '<td colspan="10" class="loading-cell">⏳ Loading more products...</td>';
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
    const dateFrom = dateFromFilter?.value;
    const dateTo = dateToFilter?.value;

    filteredProducts = allProducts.filter(p => {
        const matchesSearch = !term || (p.name || '').toLowerCase().includes(term) || (p.barcode || '').toLowerCase().includes(term);
        const currentStock = parseInt(p.stock) || 0;
        const matchesCategory = category === '__STOCK_OUT__' ? currentStock === 0 : (!category || p.category === category);
        const matchesStock = isNaN(stockLimit) || currentStock <= stockLimit;
        
        // Date filter
        let matchesDate = true;
        if (dateFrom || dateTo) {
            let productDate = null;
            if (p.createdAt) {
                if (p.createdAt.seconds) {
                    // Firestore Timestamp
                    productDate = new Date(p.createdAt.seconds * 1000);
                } else if (p.createdAt instanceof Date) {
                    // Plain JS Date object
                    productDate = p.createdAt;
                } else if (typeof p.createdAt === 'string') {
                    productDate = new Date(p.createdAt);
                }
            }
            
            if (productDate && !isNaN(productDate.getTime())) {
                const productDateStr = productDate.toISOString().split('T')[0];
                
                if (dateFrom && dateTo) {
                    matchesDate = productDateStr >= dateFrom && productDateStr <= dateTo;
                } else if (dateFrom) {
                    matchesDate = productDateStr >= dateFrom;
                } else if (dateTo) {
                    matchesDate = productDateStr <= dateTo;
                }
            } else {
                // Products without valid createdAt will be excluded when date filter is active
                matchesDate = false;
            }
        }
        
        if (hideStockOut && currentStock === 0) return false;

        return matchesSearch && matchesCategory && matchesStock && matchesDate;
    });
    
    // Sort
    if (sortField) {
        filteredProducts.sort((a, b) => {
            let va = a[sortField], vb = b[sortField];
            if (sortField === 'name') {
                va = (va || '').toLowerCase(); vb = (vb || '').toLowerCase();
                return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
            }
            va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
            return sortAsc ? va - vb : vb - va;
        });
    } else {
        // default: category then name sort (natural sort for numbers)
        filteredProducts.sort((a, b) => {
            const catCmp = (a.category || '').localeCompare(b.category || '');
            if (catCmp !== 0) return catCmp;
            // Natural sort: Cotton Kurti #2 before #10
            return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
        });
    }
    
    renderTable();
    setupPagination();
    updateCategoryInfoBar();
    updateDateFilterStatus();
}

function updateCategoryInfoBar() {
    const bar = document.getElementById('category-info-bar');
    const category = categoryFilter.value;
    const label = document.getElementById('cat-btn-label');

    if (!category || category === '__STOCK_OUT__') {
        if (bar) bar.style.display = 'none';
        if (label && !category) label.textContent = 'All Categories';
        return;
    }

    const catProducts = allProducts.filter(p => p.category === category);
    const totalQty = catProducts.reduce((s, p) => s + (parseInt(p.stock) || 0), 0);
    const totalCP  = catProducts.reduce((s, p) => s + ((parseFloat(p.costPrice) || 0) * (parseInt(p.stock) || 0)), 0);
    const totalSP  = catProducts.reduce((s, p) => s + ((parseFloat(p.sellingPrice) || 0) * (parseInt(p.stock) || 0)), 0);

    if (label) label.textContent = `📁 ${category}`;

    if (bar) {
        bar.style.display = 'flex';
        bar.innerHTML = `
            <span>📁 <strong>${category}</strong></span>
            <span style="color:#6366f1;">|📦 Items: <strong>${catProducts.length}</strong></span>
            <span style="color:#0369a1;">| 🔢 Total Qty: <strong>${totalQty}</strong></span>
            <span style="color:#b45309;">| 💰 Total CP: <strong>₹${totalCP.toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong></span>
            <span style="color:#15803d;">| 💵 Total SP: <strong>₹${totalSP.toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong></span>
            <span style="color:#7c3aed;">| ✨ Profit: <strong>₹${(totalSP - totalCP).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}</strong></span>
        `;
    }
}

function updateDateFilterStatus() {
    const dateFrom = dateFromFilter?.value;
    const dateTo = dateToFilter?.value;
    
    if (!clearDateFilterBtn) return;
    
    if (!dateFrom && !dateTo) {
        clearDateFilterBtn.style.display = 'none';
        return;
    }
    
    clearDateFilterBtn.style.display = 'inline-block';
    
    // Update button appearance to show active state
    if (dateFrom || dateTo) {
        if (dateFromFilter) {
            dateFromFilter.style.borderColor = '#3b82f6';
            dateFromFilter.style.background = '#eff6ff';
        }
        if (dateToFilter) {
            dateToFilter.style.borderColor = '#3b82f6';
            dateToFilter.style.background = '#eff6ff';
        }
    }
}

function clearDateFilter() {
    if (dateFromFilter) {
        dateFromFilter.value = '';
        dateFromFilter.style.borderColor = '';
        dateFromFilter.style.background = '';
    }
    if (dateToFilter) {
        dateToFilter.value = '';
        dateToFilter.style.borderColor = '';
        dateToFilter.style.background = '';
    }
    applyFiltersAndRender(true);
}

function setQuickDateFilter(type) {
    const today = new Date();
    let fromDate, toDate;
    
    if (type === 'today') {
        fromDate = toDate = today.toISOString().split('T')[0];
    } else if (type === 'week') {
        // This week (Monday to Sunday)
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        const monday = new Date(today.setDate(diff));
        fromDate = monday.toISOString().split('T')[0];
        toDate = new Date().toISOString().split('T')[0];
    } else if (type === 'month') {
        // This month
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        fromDate = firstDay.toISOString().split('T')[0];
        toDate = new Date().toISOString().split('T')[0];
    }
    
    if (dateFromFilter) dateFromFilter.value = fromDate;
    if (dateToFilter) dateToFilter.value = toDate;
    applyFiltersAndRender(true);
}

function renderTable() {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const paginated = filteredProducts.slice(start, start + ROWS_PER_PAGE);
    
    if (paginated.length === 0) {
        inventoryBody.innerHTML = '<tr><td colspan="10" class="loading-cell">No products found.</td></tr>';
        return;
    }

    // Group by category - same category = same parent group
    const groups = {};
    paginated.forEach(p => {
        const key = (p.category || 'UNCATEGORIZED').trim().toUpperCase();
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
    });

    const rows = [];
    Object.entries(groups).forEach(([catKey, group]) => {
        const totalStock = group.reduce((s, p) => s + (parseInt(p.stock) || 0), 0);
        const galleryImages = group.filter(p => p.imageUrl).slice(0, 16);
        let imgHtml;
        if (galleryImages.length > 0) {
            imgHtml = `<div class="variant-gallery-grid">${galleryImages.map(p =>
                `<img src="${p.imageUrl}" class="product-thumb gallery-grid-item" data-name="${p.name}" data-src="${p.imageUrl}" alt="img">`
            ).join('')}${group.length > galleryImages.length ? `<div class="gallery-more-badge">+${group.length - galleryImages.length}</div>` : ''}</div>`;
        } else {
            imgHtml = `<span style="font-size:12px; color:#999;">No Img</span>`;
        }

        // Category parent row
        rows.push(`<tr style="background:#f0f4ff; border-left:4px solid #4361ee; cursor:pointer;" class="cat-parent-row" data-cat="${catKey}">
            <td><input type="checkbox"></td>
            <td style="text-align:center;">${imgHtml}</td>
            <td colspan="2"><strong>📁 ${catKey}</strong> <span style="font-size:11px; color:#4361ee; font-weight:600;">(${group.length} items)</span></td>
            <td style="text-align:center;"><span style="font-size:11px; color:#666;">—</span></td>
            <td>—</td><td>—</td>
            <td class="stock-cell"><strong style="color:#4361ee;">${totalStock}</strong></td>
            <td>—</td><td>—</td><td></td>
        </tr>`);

        // Child rows (each product)
        group.forEach(p => {
                const stock = parseInt(p.stock) || 0;
                const cp = parseFloat(p.costPrice) || 0;
                const sp = parseFloat(p.sellingPrice) || 0;
                const margin = cp > 0 ? ((sp - cp) / cp * 100).toFixed(1) : 0;
                let stockClass = stock === 0 ? 'stock-critical' : stock <= 5 ? 'stock-low' : 'stock-healthy';
                const imgHtml = p.imageUrl
                    ? `<img src="${p.imageUrl}" class="product-thumb" data-name="${p.name}" data-src="${p.imageUrl}" alt="img">`
                    : `<span style="font-size:12px; color:#999; display:inline-block; width:40px; text-align:center;">No Img</span>`;
                const size = p.extraField1 || '', color = p.extraField2 || '';
                const sizeColorHtml = size && color
                    ? `<span style="padding:3px 8px; background:#e0f2fe; border-radius:4px; font-size:12px; font-weight:600; color:#0369a1; margin-right:4px;">${size}</span><span style="padding:3px 8px; background:#fce7f3; border-radius:4px; font-size:12px; font-weight:600; color:#be185d;">${color}</span>`
                    : size ? `<span style="padding:3px 8px; background:#e0f2fe; border-radius:4px; font-size:12px; font-weight:600; color:#0369a1;">${size}</span>`
                    : color ? `<span style="padding:3px 8px; background:#fce7f3; border-radius:4px; font-size:12px; font-weight:600; color:#be185d;">${color}</span>`
                    : `<span style="color:#999; font-size:12px;">—</span>`;
                const dateStr = (() => {
                    let date = null;
                    if (p.createdAt) {
                        if (p.createdAt.seconds) date = new Date(p.createdAt.seconds * 1000);
                        else if (p.createdAt instanceof Date) date = p.createdAt;
                        else if (typeof p.createdAt === 'string') date = new Date(p.createdAt);
                    }
                    return date && !isNaN(date.getTime()) ? date.toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'}) : '—';
                })();

                rows.push(`<tr class="${stockClass}">
                    <td><input type="checkbox" class="product-checkbox" data-id="${p.id}"></td>
                    <td style="text-align:center;">${imgHtml}</td>
                    <td>${p.name || 'N/A'}</td>
                    <td>${p.category || 'N/A'}</td>
                    <td style="text-align:center;">${sizeColorHtml}</td>
                    <td>${cp.toFixed(2)}</td>
                    <td>${sp.toFixed(2)}<br><small style="color:#28a745; font-weight:bold;">Margin: ${margin}%</small></td>
                    <td class="stock-cell"><strong>${stock}</strong></td>
                    <td class="barcode-cell" data-id="${p.id}" data-barcode="${p.barcode || ''}" title="Click to edit barcode" style="cursor:pointer;">
                        <span class="barcode-display">${p.barcode || '<span style="color:#ccc;">—</span>'}</span>
                    </td>
                    <td style="font-size:11px; color:#666; white-space:nowrap;">${dateStr}</td>
                    <td class="action-buttons">
                        <button class="btn btn-sm btn-edit" data-id="${p.id}">Edit</button>
                        <button class="btn btn-sm btn-delete" data-id="${p.id}">Delete</button>
                        <button class="btn btn-sm btn-print" onclick="openPrintPage('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.sellingPrice}')">Print</button>
                        <button class="btn btn-sm btn-clone" data-id="${p.id}" style="background:#f3e8ff; color:#7e22ce; border:1px solid #d8b4fe;">👯 Clone</button>
                    </td>
                </tr>`);
            });
    });

    inventoryBody.innerHTML = rows.join('');
}

function updateCategoryFilter(categoryStats, selectedValue, stockOutCount = 0) {
    const menu = document.getElementById('cat-dropdown-menu');
    const label = document.getElementById('cat-btn-label');
    if (!menu || !label) return;

    const categories = Object.keys(categoryStats).sort();

    // Build menu items
    let html = `<div class="cat-option all-option${!selectedValue ? ' selected' : ''}" data-value="">
        <span>📂</span><span>All Categories</span>
        <span class="cat-option-badge">${allProducts.length}</span>
    </div>`;

    if (stockOutCount > 0) {
        html += `<div class="cat-option stock-out-option${selectedValue === '__STOCK_OUT__' ? ' selected' : ''}" data-value="__STOCK_OUT__">
            <span>🚫</span><span>Stock Out</span>
            <span class="cat-option-badge">${stockOutCount}</span>
        </div>`;
    }

    if (categories.length > 0) {
        html += `<div class="cat-divider"></div>`;
        html += categories.map(cat => {
            const stats = categoryStats[cat];
            const sel = cat === selectedValue ? ' selected' : '';
            return `<div class="cat-option${sel}" data-value="${cat}">
                <span>📁</span><span>${cat}</span>
                <span class="cat-option-badge">${stats.types} | ${stats.totalStock} qty</span>
            </div>`;
        }).join('');
    }

    menu.innerHTML = html;

    // Re-insert search wrap at top (preserved)
    const searchWrap = document.createElement('div');
    searchWrap.className = 'cat-search-wrap';
    searchWrap.innerHTML = '<input type="text" id="cat-search-input" placeholder="\uD83D\uDD0D Search category..." autocomplete="off">';
    menu.insertBefore(searchWrap, menu.firstChild);

    // Re-attach search event
    const si = searchWrap.querySelector('input');
    si.addEventListener('input', (e) => filterCatOptions(e.target.value));
    si.addEventListener('click', (e) => e.stopPropagation());

    // Update button label
    if (!selectedValue) label.textContent = 'All Categories';
    else if (selectedValue === '__STOCK_OUT__') label.textContent = '🚫 Stock Out';
    else label.textContent = selectedValue;

    // Sync hidden select
    categoryFilter.innerHTML = `<option value=""></option>` +
        (stockOutCount > 0 ? `<option value="__STOCK_OUT__"></option>` : '') +
        categories.map(c => `<option value="${c}"></option>`).join('');
    categoryFilter.value = selectedValue || '';

    // Click handlers
    menu.querySelectorAll('.cat-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const val = opt.dataset.value;
            categoryFilter.value = val;
            categoryFilter.dispatchEvent(new Event('change'));
            document.getElementById('cat-dropdown').classList.remove('open');
        });
    });

    // Delete category button
    const deleteCategoryBtn = document.getElementById('delete-category-btn');
    if (deleteCategoryBtn) {
        if (selectedValue && selectedValue !== '' && selectedValue !== '__STOCK_OUT__') {
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

// Custom confirm modal
function showConfirm(title, msg, onOk) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    modal.style.display = 'flex';
    const okBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const close = () => { modal.style.display = 'none'; okBtn.replaceWith(okBtn.cloneNode(true)); cancelBtn.replaceWith(cancelBtn.cloneNode(true)); };
    document.getElementById('confirm-ok-btn').addEventListener('click', () => { close(); onOk(); }, { once: true });
    document.getElementById('confirm-cancel-btn').addEventListener('click', close, { once: true });
}

function showStatus(message, type = 'success') {
    const container = document.getElementById('status-message-container');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `status-message ${type}`;
    
    // মেসেজ টাইপ অনুযায়ী আইকন যোগ করা
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    div.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    
    container.appendChild(div);
    
    // ৪ সেকেন্ড পর রিমুভ করা
    setTimeout(() => {
        div.remove();
    }, 4000);
}

function filterCatOptions(term) {
    const menu = document.getElementById('cat-dropdown-menu');
    if (!menu) return;
    const opts = menu.querySelectorAll('.cat-option');
    let visible = 0;
    opts.forEach(opt => {
        const match = opt.textContent.toLowerCase().includes(term.toLowerCase());
        opt.classList.toggle('hidden', !match);
        if (match) visible++;
    });
    let noRes = menu.querySelector('.cat-no-result');
    if (visible === 0) {
        if (!noRes) { noRes = document.createElement('div'); noRes.className = 'cat-no-result'; menu.appendChild(noRes); }
        noRes.textContent = 'No category found';
    } else if (noRes) noRes.remove();
}

function setupEventListeners() {
    hasEventListenersSetup = true;

    // Column sort
    document.querySelectorAll('.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (sortField === field) { sortAsc = !sortAsc; }
            else { sortField = field; sortAsc = true; }
            document.querySelectorAll('.sort-icon').forEach(ic => ic.textContent = '\u2195');
            th.querySelector('.sort-icon').textContent = sortAsc ? '\u2191' : '\u2193';
            applyFiltersAndRender(false);
        });
    });

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

    // Custom category dropdown toggle
    const catDropdownBtn = document.getElementById('cat-dropdown-btn');
    const catDropdown = document.getElementById('cat-dropdown');
    const catDropdownMenu = document.getElementById('cat-dropdown-menu');
    if (catDropdownBtn) {
        catDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = catDropdown.classList.toggle('open');
            if (isOpen) {
                const rect = catDropdownBtn.getBoundingClientRect();
                catDropdownMenu.style.top = (rect.bottom + 6) + 'px';
                catDropdownMenu.style.left = rect.left + 'px';
                catDropdownMenu.style.minWidth = rect.width + 'px';
                // Focus search input
                setTimeout(() => {
                    const si = document.getElementById('cat-search-input');
                    if (si) { si.value = ''; si.focus(); filterCatOptions(''); }
                }, 50);
            }
        });
    }
    document.addEventListener('click', (e) => {
        if (catDropdown && !catDropdown.contains(e.target)) {
            catDropdown.classList.remove('open');
        }
    });

    searchInput.addEventListener('input', () => applyFiltersAndRender(true));
    categoryFilter.addEventListener('change', () => {
        // Show/hide delete category button
        const deleteCategoryBtn = document.getElementById('delete-category-btn');
        if (deleteCategoryBtn) {
            const selectedCategory = categoryFilter.value;
            if (selectedCategory && selectedCategory !== '' && selectedCategory !== '__STOCK_OUT__') {
                deleteCategoryBtn.style.display = 'inline-block';
                deleteCategoryBtn.setAttribute('data-category', selectedCategory);
            } else {
                deleteCategoryBtn.style.display = 'none';
            }
        }
        applyFiltersAndRender(true);
    });
    stockLimitFilter.addEventListener('input', () => applyFiltersAndRender(true));
    
    // Date filter event listeners
    if (dateFromFilter) {
        dateFromFilter.addEventListener('change', () => applyFiltersAndRender(true));
    }
    if (dateToFilter) {
        dateToFilter.addEventListener('change', () => applyFiltersAndRender(true));
    }
    if (clearDateFilterBtn) {
        clearDateFilterBtn.addEventListener('click', clearDateFilter);
    }
    
    // Quick date filter buttons
    const filterTodayBtn = document.getElementById('filter-today-btn');
    const filterWeekBtn = document.getElementById('filter-week-btn');
    const filterMonthBtn = document.getElementById('filter-month-btn');
    
    if (filterTodayBtn) {
        filterTodayBtn.addEventListener('click', () => {
            setQuickDateFilter('today');
            showStatus('📅 Showing today\'s products', 'success');
        });
    }
    if (filterWeekBtn) {
        filterWeekBtn.addEventListener('click', () => {
            setQuickDateFilter('week');
            showStatus('📆 Showing this week\'s products', 'success');
        });
    }
    if (filterMonthBtn) {
        filterMonthBtn.addEventListener('click', () => {
            setQuickDateFilter('month');
            showStatus('🗓️ Showing this month\'s products', 'success');
        });
    }
    
    // Delete Category Button
    const deleteCategoryBtn = document.getElementById('delete-category-btn');
    if (deleteCategoryBtn) {
        deleteCategoryBtn.addEventListener('click', async () => {
            const category = deleteCategoryBtn.getAttribute('data-category');
            if (!category) return;
            const productsInCategory = allProducts.filter(p => p.category === category);
            showConfirm(
                `Delete "${category}"?`,
                `This will permanently delete ${productsInCategory.length} product(s). This action cannot be undone!`,
                async () => {
                    try {
                        deleteCategoryBtn.disabled = true;
                        deleteCategoryBtn.textContent = 'Deleting...';
                        await deleteCategoryWithProducts(category);
                        showStatus(`✅ Category "${category}" and ${productsInCategory.length} products deleted!`, 'success');
                        categoryFilter.value = '';
                        applyFiltersAndRender(true);
                    } catch (error) {
                        showStatus('❌ Failed: ' + error.message, 'error');
                    } finally {
                        deleteCategoryBtn.disabled = false;
                        deleteCategoryBtn.textContent = '🗑️ Delete Category';
                    }
                }
            );
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

    // Auto-calculate SP from CP + Margin (only via button click)
    const btnCalcSP = document.getElementById('btn-calc-sp');
    const editCP = document.getElementById('edit-cp');
    const editMargin = document.getElementById('edit-margin');
    const editSP = document.getElementById('edit-sp');
    
    if (btnCalcSP && editCP && editMargin && editSP) {
        btnCalcSP.addEventListener('click', () => {
            const cp = parseFloat(editCP.value) || 0;
            const marginPercent = parseFloat(editMargin.value) || 0;
            if (cp > 0) {
                const calculatedSP = cp + (cp * marginPercent / 100);
                editSP.value = Math.round(calculatedSP * 100) / 100;
                editSP.style.backgroundColor = '#d4edda';
                setTimeout(() => { editSP.style.backgroundColor = ''; }, 1000);
            }
        });
    }

    // Barcode real-time duplicate check
    const editBarcodeInput = document.getElementById('edit-barcode');
    const barcodeDupMsg    = document.getElementById('barcode-duplicate-msg');
    if (editBarcodeInput) {
        editBarcodeInput.addEventListener('input', function() {
            const val       = this.value.trim();
            const currentId = document.getElementById('edit-product-id').value;
            const currentColor = document.getElementById('edit-color')?.value.trim() || '';
            
            barcodeDupMsg.style.display = 'none';
            this.classList.remove('input-shake');

            if (!val) return;

            // Generate potential new document ID with color suffix
            let newDocId = val;
            if (currentColor) {
                const colorSuffix = currentColor.toUpperCase().replace(/\s+/g, '_');
                newDocId = `${val}_${colorSuffix}`;
            }

            const dup = allProducts.find(p => p.id === newDocId && p.id !== currentId);
            if (dup) {
                barcodeDupMsg.style.display = 'block';
                barcodeDupMsg.textContent   = `❌ Duplicate! "${dup.name}" এ ইতিমধ্যে এই barcode+color আছে`;
                this.classList.remove('input-shake');
                void this.offsetWidth; // reflow to restart animation
                this.classList.add('input-shake');
                document.getElementById('edit-save-btn').disabled = true;
            } else {
                barcodeDupMsg.style.display = 'none';
                document.getElementById('edit-save-btn').disabled = false;
            }
        });
        
        // Also check when color changes
        const editColorInput = document.getElementById('edit-color');
        if (editColorInput) {
            editColorInput.addEventListener('input', function() {
                // Trigger barcode validation
                editBarcodeInput.dispatchEvent(new Event('input'));
            });
        }
    }

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

    // Paste Zone setup
    const pasteZone      = document.getElementById('img-paste-zone');
    const pasteZoneText  = document.getElementById('paste-zone-text');
    const pasteZoneLoad  = document.getElementById('paste-zone-uploading');
    const pasteZoneInput = document.getElementById('paste-zone-input');

    pasteZone.addEventListener('click', () => {
        pasteZoneInput.focus();
        pasteZone.style.borderColor = '#2563eb';
        pasteZone.style.background  = '#eff6ff';
    });

    pasteZoneInput.addEventListener('blur', () => {
        pasteZone.style.borderColor = '#93c5fd';
        pasteZone.style.background  = '#f0f9ff';
    });

    async function handleImagePaste(file) {
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = ev => {
            editImagePreview.src = ev.target.result;
            editImagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);

        pasteZoneText.style.display = 'none';
        pasteZoneLoad.style.display = 'block';
        pasteZone.style.borderColor = '#f59e0b';
        pasteZone.style.background  = '#fffbeb';

        const saveBtn = document.getElementById('edit-save-btn');
        saveBtn.disabled = true;

        const uploadedUrl = await uploadImageToImgBB(file);

        pasteZoneText.style.display = 'block';
        pasteZoneLoad.style.display = 'none';
        saveBtn.disabled = false;
        pasteZoneInput.innerHTML = '';

        if (uploadedUrl) {
            window.switchImgTab('url');
            document.getElementById('edit-image-url').value = uploadedUrl;
            editImagePreview.src = uploadedUrl;
            editImagePreview.style.display = 'block';
            pasteZone.style.borderColor = '#22c55e';
            pasteZone.style.background  = '#f0fdf4';
            pasteZoneText.querySelector('div:first-child').textContent  = '\u2705';
            pasteZoneText.querySelector('div:nth-child(2)').textContent = 'Image uploaded!';
            showStatus('\u2705 Image pasted & uploaded!', 'success');
        } else {
            pasteZone.style.borderColor = '#dc2626';
            pasteZone.style.background  = '#fff5f5';
            showStatus('\u274c Image upload failed', 'error');
        }
    }

    // contenteditable paste
    pasteZoneInput.addEventListener('paste', e => {
        e.preventDefault();
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                handleImagePaste(item.getAsFile());
                break;
            }
        }
    });

    // Modal-level fallback paste
    document.getElementById('edit-modal').addEventListener('paste', e => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                handleImagePaste(item.getAsFile());
                break;
            }
        }
    });

    // Image URL preview
    const editImageUrl = document.getElementById('edit-image-url');
    if (editImageUrl) {
        editImageUrl.addEventListener('input', function() {
            const url = this.value.trim();
            if (url) {
                editImagePreview.src = url;
                editImagePreview.style.display = 'block';
                editImagePreview.onerror = () => { editImagePreview.style.display = 'none'; };
            } else {
                editImagePreview.style.display = 'none';
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
        else if (target.matches('.btn-clone')) {
            localStorage.setItem('cloned_product', JSON.stringify(product));
            window.location.href = '../add-product/add-product.html';
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

    // Barcode inline edit
    inventoryBody.addEventListener('click', async e => {
        const cell = e.target.closest('.barcode-cell');
        if (!cell || cell.querySelector('input')) return;

        const id          = cell.dataset.id;
        const oldBarcode  = cell.dataset.barcode;
        const span        = cell.querySelector('.barcode-display');
        
        // Get product data to preserve color/size info
        const product = allProducts.find(p => p.id === id);
        if (!product) return;

        const input = document.createElement('input');
        input.type  = 'text';
        input.value = oldBarcode;
        input.style.cssText = 'width:100%; padding:4px 8px; border:2px solid #4361ee; border-radius:6px; font-size:13px; font-weight:600;';
        cell.innerHTML = '';
        cell.appendChild(input);
        input.focus();
        input.select();

        const dupHint = document.createElement('div');
        dupHint.style.cssText = 'font-size:11px; color:#dc2626; margin-top:3px; display:none;';
        cell.appendChild(dupHint);

        input.addEventListener('input', () => {
            const val = input.value.trim();
            // Check if barcode + color combination already exists
            const colorSuffix = product.extraField2 ? `_${product.extraField2.trim().toUpperCase().replace(/\s+/g, '_')}` : '';
            const newDocId = val + colorSuffix;
            const dup = allProducts.find(p => p.id === newDocId && p.id !== id);
            
            if (dup) {
                dupHint.style.display = 'block';
                dupHint.textContent   = `❌ "${dup.name}" এ আছে`;
                input.style.borderColor = '#dc2626';
                input.classList.remove('input-shake');
                void input.offsetWidth;
                input.classList.add('input-shake');
            } else {
                dupHint.style.display = 'none';
                input.style.borderColor = '#4361ee';
            }
        });

        async function saveInlineBarcode() {
            const newBarcode = input.value.trim();
            
            // Generate new document ID with color suffix if exists
            const colorSuffix = product.extraField2 ? `_${product.extraField2.trim().toUpperCase().replace(/\s+/g, '_')}` : '';
            const newDocId = newBarcode + colorSuffix;
            
            // Check for duplicate
            const dup = allProducts.find(p => p.id === newDocId && p.id !== id);
            if (dup) {
                input.focus();
                return;
            }
            
            if (newBarcode === oldBarcode) {
                renderTable();
                return;
            }
            
            try {
                // Create new document with updated barcode but same color suffix
                const newRef = doc(db, 'shops', activeShopId, 'inventory', newDocId);
                await setDoc(newRef, { 
                    ...product, 
                    barcode: newBarcode, 
                    id: undefined, 
                    lastUpdated: new Date() 
                });
                
                // Delete old document
                await deleteDoc(doc(db, 'shops', activeShopId, 'inventory', id));
                
                // Update expenses relatedProductId
                const expRef = collection(db, 'shops', activeShopId, 'expenses');
                const expQ = query(expRef, where('relatedProductId', '==', id));
                const expSnap = await getDocs(expQ);
                expSnap.forEach(async d => {
                    await updateDoc(doc(db, 'shops', activeShopId, 'expenses', d.id), { 
                        relatedProductId: newDocId 
                    });
                });
                
                showStatus(`✅ Barcode updated: ${oldBarcode} → ${newBarcode}`, 'success');
            } catch (err) {
                console.error('Barcode update error:', err);
                showStatus('❌ Barcode update failed: ' + err.message, 'error');
                renderTable();
            }
        }

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter')  saveInlineBarcode();
            if (e.key === 'Escape') renderTable();
        });
        // blur e save — click outside hole save hobe
        input.addEventListener('blur', () => setTimeout(saveInlineBarcode, 150));
    });

    const hideStockOutBtn = document.getElementById('hide-stockout-btn');
    if (hideStockOutBtn) {
        hideStockOutBtn.addEventListener('click', () => {
            hideStockOut = !hideStockOut;
            hideStockOutBtn.classList.toggle('active', hideStockOut);
            hideStockOutBtn.textContent = hideStockOut ? '👁️ Show Stock Out' : '🙈 Hide Stock Out';
            applyFiltersAndRender(true);
        });
    }

    const catSearchInput = document.getElementById('cat-search-input');
    if (catSearchInput) {
        catSearchInput.addEventListener('input', (e) => filterCatOptions(e.target.value));
        catSearchInput.addEventListener('click', (e) => e.stopPropagation());
    }

    // View Logs button event listener
    const viewLogsBtn = document.getElementById('view-logs-btn');
    if (viewLogsBtn) {
        viewLogsBtn.addEventListener('click', async () => {
            const logModal = document.getElementById('log-modal');
            const logTbody = document.getElementById('log-tbody');
            logModal.style.display = 'flex';
            logTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading logs...</td></tr>';

            try {
                const q = query(collection(db, 'shops', activeShopId, 'inventory_logs'), orderBy('timestamp', 'desc'), limit(200));
                const snap = await getDocs(q);
                
                if (snap.empty) {
                    logTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#999;">No audit logs found.</td></tr>';
                    return;
                }

                const allLogs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                function renderLogs() {
                    const searchTerm = (document.getElementById('log-search')?.value || '').toLowerCase();
                    const actionFilter = document.getElementById('log-action-filter')?.value || '';
                    const filtered = allLogs.filter(d =>
                        (!searchTerm || (d.productName || '').toLowerCase().includes(searchTerm)) &&
                        (!actionFilter || d.action === actionFilter)
                    );
                    if (filtered.length === 0) {
                        logTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#999;">No results found.</td></tr>';
                        return;
                    }
                    logTbody.innerHTML = filtered.map(d => {
                        const date = d.timestamp ? d.timestamp.toDate().toLocaleString() : 'N/A';
                        return `<tr>
                            <td><small>${date}</small></td>
                            <td>${d.productName}</td>
                            <td><span class="badge ${d.action === 'DELETE' || d.action === 'DELETE_CATEGORY' ? 'btn-delete' : 'btn-edit'}" style="padding:2px 5px; font-size:10px;">${d.action}</span></td>
                            <td>${d.oldStock}</td>
                            <td>${d.newStock}</td>
                            <td><small>${(d.userEmail || '').split('@')[0]}</small></td>
                        </tr>`;
                    }).join('');
                }

                renderLogs();
                document.getElementById('log-search').addEventListener('input', renderLogs);
                document.getElementById('log-action-filter').addEventListener('change', renderLogs);

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
window.switchImgTab = function(tab) {
    const fileSection = document.getElementById('img-file-section');
    const urlSection  = document.getElementById('img-url-section');
    const fileBtn     = document.getElementById('img-tab-file');
    const urlBtn      = document.getElementById('img-tab-url');
    if (tab === 'file') {
        fileSection.style.display = 'block';
        urlSection.style.display  = 'none';
        fileBtn.style.background  = '#4361ee'; fileBtn.style.color = 'white'; fileBtn.style.borderColor = '#4361ee';
        urlBtn.style.background   = 'white';   urlBtn.style.color  = '#666';  urlBtn.style.borderColor  = '#ddd';
    } else {
        fileSection.style.display = 'none';
        urlSection.style.display  = 'block';
        urlBtn.style.background   = '#4361ee'; urlBtn.style.color  = 'white'; urlBtn.style.borderColor  = '#4361ee';
        fileBtn.style.background  = 'white';   fileBtn.style.color = '#666';  fileBtn.style.borderColor = '#ddd';
    }
};

window.openPrintPage = openPrintPage;
window.inventoryState = {
    get allProducts() { return allProducts; },
    set allProducts(v) { allProducts = v; },
    get activeShopId() { return activeShopId; },
    get filteredProducts() { return filteredProducts; }
};
window.inventoryFns = {
    showStatus,
    applyFiltersAndRender,
    renderTable,
    updateCategoryStats,
    saveInventoryLog
};

function openEditModal(product) {
    editForm.reset();
    // Paste zone reset
    const pz = document.getElementById('img-paste-zone');
    if (pz) {
        pz.style.borderColor = '#93c5fd';
        pz.style.background  = '#f0f9ff';
        const t = document.getElementById('paste-zone-text');
        if (t) {
            t.querySelector('div:first-child').textContent  = '📋';
            t.querySelector('div:nth-child(2)').textContent = 'এখানে Click করে Ctrl+V চাপুন';
        }
    }
    Object.entries({
        'edit-product-id': product.id, 
        'edit-name': product.name, 
        'edit-category': product.category,
        'edit-size': product.extraField1 || '',
        'edit-color': product.extraField2 || '',
        'edit-cp': product.costPrice, 
        'edit-sp': product.sellingPrice, 
        'edit-stock': product.stock,
        'edit-barcode': product.barcode
    }).forEach(([id, value]) => { document.getElementById(id).value = value || ''; });
    
    // Calculate and set margin from existing CP/SP
    const cp = parseFloat(product.costPrice) || 0;
    const sp = parseFloat(product.sellingPrice) || 0;
    if (cp > 0 && sp > 0) {
        const margin = ((sp - cp) / cp) * 100;
        const marginInput = document.getElementById('edit-margin');
        if (marginInput) marginInput.value = Math.round(margin * 10) / 10;
    }
    
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
    const newName = document.getElementById('edit-name').value.trim()
        .toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); // Auto Title Case
    const newCategory = document.getElementById('edit-category').value.trim().toUpperCase();
    const newSize = document.getElementById('edit-size').value.trim();
    const newColor = document.getElementById('edit-color').value.trim();
    const newCP = parseFloat(document.getElementById('edit-cp').value);
    const newSP = parseFloat(document.getElementById('edit-sp').value);
    const newStock = parseInt(document.getElementById('edit-stock').value, 10);
    const newBarcode = document.getElementById('edit-barcode').value.trim();

    // Barcode duplicate check with color suffix
    if (newBarcode) {
        // Generate new document ID with color suffix if exists
        let newDocId = newBarcode;
        if (newColor) {
            const colorSuffix = newColor.trim().toUpperCase().replace(/\s+/g, '_');
            newDocId = `${newBarcode}_${colorSuffix}`;
        }
        
        const existing = allProducts.find(p => p.id === newDocId && p.id !== id);
        if (existing) {
            showStatus(`❌ Barcode+Color combination "${newBarcode}" + "${newColor}" already used by "${existing.name}"`, 'error');
            return;
        }
    }

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
            extraField1: newSize,
            extraField2: newColor,
            costPrice: newCP,
            sellingPrice: newSP,
            stock: newStock,
            lastUpdated: new Date()
        };

        // Upload image if selected
        if (imageInput.files && imageInput.files[0]) {
            saveBtn.textContent = 'Uploading Image...';
            const uploadedUrl = await uploadImageToImgBB(imageInput.files[0]);
            if (uploadedUrl) data.imageUrl = uploadedUrl;
        } else {
            const urlInput = document.getElementById('edit-image-url');
            if (urlInput && urlInput.value.trim()) {
                data.imageUrl = urlInput.value.trim();
            }
        }

        // Barcode change হলে — নতুন doc বানাও, পুরনোটা delete করো
        // oldData.barcode er sathe compare korbo, id er sathe noy (id = barcode_COLOR)
        if (newBarcode && newBarcode !== (oldData.barcode || id)) {
            // Generate new document ID with color suffix if color exists
            let newDocId = newBarcode;
            if (newColor) {
                const colorSuffix = newColor.trim().toUpperCase().replace(/\s+/g, '_');
                newDocId = `${newBarcode}_${colorSuffix}`;
            }
            
            const newRef = doc(db, 'shops', activeShopId, 'inventory', newDocId);
            data.barcode = newBarcode;
            data.name = newName;
            data.category = newCategory;
            data.extraField1 = newSize;
            data.extraField2 = newColor;
            data.costPrice = newCP;
            data.sellingPrice = newSP;
            data.stock = newStock;
            data.imageUrl = data.imageUrl || oldData.imageUrl || null;
            data.createdAt = oldData.createdAt || serverTimestamp();
            await setDoc(newRef, data);
            await deleteDoc(productRef);
            // expenses এ relatedProductId update
            const expRef = collection(db, 'shops', activeShopId, 'expenses');
            const expQ = query(expRef, where('relatedProductId', '==', id));
            const expSnap = await getDocs(expQ);
            expSnap.forEach(async d => {
                await updateDoc(doc(db, 'shops', activeShopId, 'expenses', d.id), { relatedProductId: newDocId });
            });
        } else {
            await updateDoc(productRef, data);
        }

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
