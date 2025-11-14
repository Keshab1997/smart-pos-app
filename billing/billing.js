// billing/billing.js

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, getDocs, doc, query, orderBy, writeBatch, serverTimestamp, increment, addDoc
} from 'firebase/firestore';

// ==========================================================
// --- DOM এলিমেন্টের রেফারেন্স ---
// ==========================================================
const productSearchInput = document.getElementById('product-search');
const searchResultsContainer = document.getElementById('search-results');
const categoryProductListContainer = document.getElementById('category-product-list');
const cartItemsContainer = document.getElementById('cart-items');
const footerTotalAmountEl = document.getElementById('footer-total-amount');
const proceedToCheckoutBtn = document.getElementById('proceed-to-checkout-btn');
const checkoutModal = document.getElementById('checkout-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalSubtotalEl = document.getElementById('modal-subtotal');
const modalTaxEl = document.getElementById('modal-tax');
const modalTotalAmountEl = document.getElementById('modal-total-amount');
const gstToggle = document.getElementById('gst-toggle');
const paymentMethodSelect = document.getElementById('payment-method-select');
const generateBillBtn = document.getElementById('generate-bill-btn');
const partPaymentDetails = document.getElementById('part-payment-details');
const cashAmountInput = document.getElementById('cash-amount');
const cardAmountInput = document.getElementById('card-amount');
const logoutBtn = document.getElementById('logout-btn');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mainNavLinks = document.getElementById('main-nav-links');

// ==========================================================
// --- গ্লোবাল ভেরিয়েবল ---
// ==========================================================
let cart = [];
let allProducts = [];
let currentTotals = { subtotal: 0, tax: 0, total: 0 };
let currentUserId = null;

// ==========================================================
// --- Authentication ---
// ==========================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        initializeBillingPage();
    } else {
        window.location.href = '../index.html';
    }
});

// ==========================================================
// --- প্রাথমিক ফাংশন ---
// ==========================================================
function initializeBillingPage() {
    updateCartDisplay();
    initializeProducts();
    setupEventListeners();
}

async function initializeProducts() {
    if (!currentUserId) return;
    try {
        const inventoryRef = collection(db, 'shops', currentUserId, 'inventory');
        const q = query(inventoryRef, orderBy('name'));
        const querySnapshot = await getDocs(q);
        allProducts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayProductsByCategory();
    } catch (error) {
        console.error("Error initializing products: ", error);
        categoryProductListContainer.innerHTML = '<p class="error-message">Failed to load products. Check permissions or connection.</p>';
    }
}

function displayProductsByCategory() {
    const inStockProducts = allProducts.filter(p => p.stock > 0);
    if (inStockProducts.length === 0) {
        categoryProductListContainer.innerHTML = '<p class="loading-message">No products available in stock.</p>';
        return;
    }
    const productsByCategory = inStockProducts.reduce((acc, product) => {
        const category = product.category || 'Uncategorized';
        if (!acc[category]) acc[category] = [];
        acc[category].push(product);
        return acc;
    }, {});
    categoryProductListContainer.innerHTML = '';
    const sortedCategories = Object.keys(productsByCategory).sort();
    for (const category of sortedCategories) {
        const categoryGroup = document.createElement('div');
        categoryGroup.classList.add('category-group');
        categoryGroup.innerHTML = `<h4 class="category-name">${category}</h4>`;
        const productGrid = document.createElement('div');
        productGrid.classList.add('product-grid');
        productsByCategory[category].forEach(product => {
            const productCard = document.createElement('div');
            productCard.classList.add('product-card');
            productCard.dataset.productId = product.id;
            // *** এখানে পরিবর্তন: product.sp এর বদলে product.sellingPrice ***
            const price = product.sellingPrice || 0;
            productCard.innerHTML = `<span class="product-card-name">${product.name}</span><span class="product-card-price">₹${price.toFixed(2)}</span>`;
            productGrid.appendChild(productCard);
        });
        categoryGroup.appendChild(productGrid);
        categoryProductListContainer.appendChild(categoryGroup);
    }
}

// ==========================================================
// --- প্রোডাক্ট সার্চ এবং কার্টে যোগ ---
// ==========================================================
function handleSearch(e) {
    const searchText = e.target.value.trim().toLowerCase();
    if (searchText.length < 2) {
        searchResultsContainer.style.display = 'none';
        return;
    }
    const matchedProducts = allProducts.filter(product =>
        product.stock > 0 &&
        (product.name.toLowerCase().includes(searchText) || (product.barcode && product.barcode.toLowerCase().includes(searchText)))
    ).slice(0, 10);
    searchResultsContainer.innerHTML = '';
    if (matchedProducts.length === 0) {
        searchResultsContainer.innerHTML = '<div class="search-result-item">No products found.</div>';
    } else {
        matchedProducts.forEach(product => {
            const productDiv = document.createElement('div');
            productDiv.classList.add('search-result-item');
            // *** এখানে পরিবর্তন: product.sp এর বদলে product.sellingPrice ***
            const price = product.sellingPrice || 0;
            productDiv.innerHTML = `<span>${product.name}</span> <span>₹${price.toFixed(2)}</span>`;
            productDiv.addEventListener('click', () => addProductToCart(product));
            searchResultsContainer.appendChild(productDiv);
        });
    }
    searchResultsContainer.style.display = 'block';
}

function handleSearchEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const searchText = e.target.value.trim().toLowerCase();
        if (!searchText) return;
        const exactMatch = allProducts.find(p => p.stock > 0 && p.barcode && p.barcode.toLowerCase() === searchText);
        if (exactMatch) {
            addProductToCart(exactMatch);
        } else {
            const firstResult = searchResultsContainer.querySelector('.search-result-item');
            if (firstResult) firstResult.click();
        }
    }
}

function addProductToCart(product) {
    addToCart(product);
    productSearchInput.value = '';
    searchResultsContainer.style.display = 'none';
    productSearchInput.focus();
}

function addToCart(product) {
    if (product.stock <= 0) {
        alert(`'${product.name}' is out of stock!`);
        return;
    }
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
        if (existingItem.quantity < product.stock) {
            existingItem.quantity++;
        } else {
            alert(`Cannot add more. Stock limit for '${product.name}' reached!`);
        }
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    updateCartDisplay();
}

// ==========================================================
// --- কার্ট ম্যানেজমেন্ট এবং UI আপডেট ---
// ==========================================================
function updateCartDisplay() {
    cartItemsContainer.innerHTML = '';
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p class="empty-cart-message">Your cart is empty.</p>';
        proceedToCheckoutBtn.disabled = true;
        generateBillBtn.disabled = true;
    } else {
        cart.forEach((item, index) => {
            const cartItemDiv = document.createElement('div');
            cartItemDiv.classList.add('cart-item');
            // *** এখানে পরিবর্তন: item.sp এর বদলে item.sellingPrice ***
            const itemTotal = (item.sellingPrice || 0) * item.quantity;
            cartItemDiv.innerHTML = `
                <span class="cart-item-name">${item.name}</span>
                <div class="cart-item-quantity">
                    <input type="number" class="quantity-input" value="${item.quantity}" min="1" max="${item.stock}" data-index="${index}">
                </div>
                <span class="cart-item-price">₹${itemTotal.toFixed(2)}</span>
                <button class="cart-item-remove" data-index="${index}">&times;</button>
            `;
            cartItemsContainer.prepend(cartItemDiv);
        });
        proceedToCheckoutBtn.disabled = false;
        generateBillBtn.disabled = false;
    }
    addCartItemEventListeners();
    calculateTotals();
}

function addCartItemEventListeners() {
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.addEventListener('change', e => {
            const index = parseInt(e.target.dataset.index);
            let newQuantity = parseInt(e.target.value);
            const item = cart[index];
            if (newQuantity > item.stock) {
                alert(`Maximum stock available for ${item.name} is ${item.stock}.`);
                newQuantity = item.stock;
                e.target.value = newQuantity;
            }
            if (newQuantity > 0) {
                item.quantity = newQuantity;
            } else {
                cart.splice(index, 1);
            }
            updateCartDisplay();
        });
    });
    document.querySelectorAll('.cart-item-remove').forEach(button => {
        button.addEventListener('click', e => {
            cart.splice(parseInt(e.target.dataset.index), 1);
            updateCartDisplay();
        });
    });
}

function calculateTotals() {
    // *** এখানে পরিবর্তন: item.sp এর বদলে item.sellingPrice ***
    const subtotal = cart.reduce((sum, item) => sum + ((item.sellingPrice || 0) * item.quantity), 0);
    const tax = gstToggle.checked ? subtotal * 0.05 : 0;
    const total = subtotal + tax;
    currentTotals = { subtotal, tax, total };
    footerTotalAmountEl.textContent = `₹${total.toFixed(2)}`;
}

// ==========================================================
// --- চেকআউট এবং বিল জেনারেশন ---
// ==========================================================
async function generateFinalBill() {
    if (cart.length === 0 || !currentUserId) return;
    
    generateBillBtn.disabled = true;
    generateBillBtn.textContent = 'Processing...';

    const paymentMethod = paymentMethodSelect.value;
    const sale = {
        // *** এখানে পরিবর্তন: price এর জন্য item.sellingPrice ব্যবহার করা ***
        items: cart.map(item => ({ 
            id: item.id, 
            name: item.name, 
            quantity: item.quantity, 
            price: item.sellingPrice || 0,
            category: item.category || 'N/A'
        })),
        subtotal: currentTotals.subtotal,
        tax: currentTotals.tax,
        total: currentTotals.total,
        paymentMethod: paymentMethod,
        gstApplied: gstToggle.checked,
        createdAt: serverTimestamp()
    };

    if (paymentMethod === 'part-payment') {
        const cashPaid = parseFloat(cashAmountInput.value) || 0;
        const cardPaid = parseFloat(cardAmountInput.value) || 0;
        if ((cashPaid + cardPaid).toFixed(2) !== currentTotals.total.toFixed(2)) {
            alert('Part payment amounts do not match the total bill. Please check.');
            generateBillBtn.disabled = false;
            generateBillBtn.textContent = 'Generate Bill & Finalize';
            return;
        }
        sale.paymentBreakdown = { cash: cashPaid, card_or_online: cardPaid };
    }

    try {
        const batch = writeBatch(db);
        const salesRef = collection(db, 'shops', currentUserId, 'sales');
        const newSaleRef = doc(salesRef);
        batch.set(newSaleRef, sale);

        for (const item of cart) {
            const productRef = doc(db, 'shops', currentUserId, 'inventory', item.id);
            batch.update(productRef, { stock: increment(-item.quantity) });
        }
        await batch.commit();

        const printUrl = `print.html?saleId=${newSaleRef.id}`;
        window.open(printUrl, '_blank');
        
        cart = [];
        updateCartDisplay();
        checkoutModal.classList.add('hidden');
        await initializeProducts();

    } catch (error) {
        console.error("Error during checkout: ", error);
        alert('Checkout failed. Please try again.');
    } finally {
        generateBillBtn.disabled = false;
        generateBillBtn.textContent = 'Generate Bill & Finalize';
    }
}

// ==========================================================
// --- সব ইভেন্ট লিসেনার সেটআপ ---
// ==========================================================
function setupEventListeners() {
    productSearchInput.addEventListener('input', handleSearch);
    productSearchInput.addEventListener('keydown', handleSearchEnter);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) searchResultsContainer.style.display = 'none';
    });
    categoryProductListContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (card) {
            const productId = card.dataset.productId;
            const productToAdd = allProducts.find(p => p.id === productId);
            if (productToAdd) addToCart(productToAdd);
        }
    });
    gstToggle.addEventListener('change', calculateTotals);
    proceedToCheckoutBtn.addEventListener('click', () => {
        calculateTotals();
        modalSubtotalEl.textContent = `₹${currentTotals.subtotal.toFixed(2)}`;
        modalTaxEl.textContent = `₹${currentTotals.tax.toFixed(2)}`;
        modalTotalAmountEl.textContent = `₹${currentTotals.total.toFixed(2)}`;
        checkoutModal.classList.remove('hidden');
    });
    closeModalBtn.addEventListener('click', () => checkoutModal.classList.add('hidden'));
    checkoutModal.addEventListener('click', (e) => {
        if (e.target === checkoutModal) checkoutModal.classList.add('hidden');
    });
    paymentMethodSelect.addEventListener('change', (e) => {
        partPaymentDetails.classList.toggle('hidden', e.target.value !== 'part-payment');
    });
    generateBillBtn.addEventListener('click', generateFinalBill);
    logoutBtn.addEventListener('click', async () => {
        await signOut(auth);
    });
    mobileMenuBtn.addEventListener('click', () => {
        mainNavLinks.classList.toggle('mobile-nav-active');
    });
}