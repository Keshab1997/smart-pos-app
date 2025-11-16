// billing/billing.js - Fully Updated with COGS fix (v3.1)

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, doc, getDocs, query, orderBy, writeBatch, serverTimestamp, increment, runTransaction, getDoc
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

// --- চেকআউট মডাল এলিমেন্টস ---
const checkoutModal = document.getElementById('checkout-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalSubtotalEl = document.getElementById('modal-subtotal');
const gstToggle = document.getElementById('gst-toggle');
const modalTaxEl = document.getElementById('modal-tax');
const modalTotalAmountEl = document.getElementById('modal-total-amount');

// --- ডিসকাউন্টের জন্য রেফারেন্স ---
const discountTypeSelect = document.getElementById('discount-type');
const discountValueInput = document.getElementById('discount-value');
const modalDiscountEl = document.getElementById('modal-discount');

// --- পেমেন্ট, কাস্টমার এবং অন্যান্য UI এলিমেন্টস ---
const paymentMethodSelect = document.getElementById('payment-method-select');
const partPaymentDetails = document.getElementById('part-payment-details');
const cashPaymentDetails = document.getElementById('cash-payment-details');
const cashReceivedInput = document.getElementById('cash-received');
const returnAmountDisplay = document.getElementById('return-amount');
const cashAmountInput = document.getElementById('cash-amount');
const cardAmountInput = document.getElementById('card-amount');
const generateBillBtn = document.getElementById('generate-bill-btn');
const customerNameInput = document.getElementById('customer-name');
const customerPhoneInput = document.getElementById('customer-phone');
const customerAddressInput = document.getElementById('customer-address');
const logoutBtn = document.getElementById('logout-btn');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mainNavLinks = document.querySelector('header nav .nav-links');

// ==========================================================
// --- গ্লোবাল ভেরিয়েবল ---
// ==========================================================
let cart = [];
let allProducts = [];
let currentTotals = { subtotal: 0, discount: 0, tax: 0, total: 0 };
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
    handlePaymentMethodChange();
}

async function initializeProducts() {
    if (!currentUserId) return;
    categoryProductListContainer.innerHTML = '<p class="loading-message">Loading products...</p>';
    try {
        const inventoryRef = collection(db, 'shops', currentUserId, 'inventory');
        const q = query(inventoryRef, orderBy('name'));
        const querySnapshot = await getDocs(q);
        allProducts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayProductsByCategory();
    } catch (error) {
        console.error("Error initializing products: ", error);
        categoryProductListContainer.innerHTML = `<p class="error-message">Failed to load products. Check console for details.</p>`;
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
    sortedCategories.forEach(category => {
        const categoryGroup = document.createElement('div');
        categoryGroup.classList.add('category-group');
        categoryGroup.innerHTML = `<h4 class="category-name">${category}</h4>`;
        const productGrid = document.createElement('div');
        productGrid.classList.add('product-grid');
        productsByCategory[category].forEach(product => {
            const productCard = document.createElement('div');
            productCard.classList.add('product-card');
            productCard.dataset.productId = product.id;
            const price = product.sellingPrice || 0;
            const stockClass = product.stock <= 10 ? 'low-stock' : '';

            productCard.innerHTML = `
                <span class="product-card-name">${product.name}</span>
                <span class="product-card-price">₹${price.toFixed(2)}</span>
                <div class="product-card-stock ${stockClass}">Stock: ${product.stock}</div>
            `;
            productGrid.appendChild(productCard);
        });
        categoryGroup.appendChild(productGrid);
        categoryProductListContainer.appendChild(categoryGroup);
    });
}

// ==========================================================
// --- প্রোডাক্ট সার্চ এবং কার্টে যোগ করা ---
// ==========================================================
function handleSearch(e) {
    const searchText = e.target.value.trim().toLowerCase();
    if (searchText.length < 1) {
        searchResultsContainer.style.display = 'none';
        return;
    }
    const matchedProducts = allProducts.filter(product =>
        product.stock > 0 &&
        (product.name.toLowerCase().includes(searchText) || (product.barcode && product.barcode.includes(searchText)))
    ).slice(0, 10);

    searchResultsContainer.innerHTML = '';
    if (matchedProducts.length > 0) {
        matchedProducts.forEach(product => {
            const price = product.sellingPrice || 0;
            const div = document.createElement('div');
            div.classList.add('search-result-item');
            div.innerHTML = `<span>${product.name}</span> <span>₹${price.toFixed(2)}</span>`;
            div.addEventListener('click', () => addProductToCart(product));
            searchResultsContainer.appendChild(div);
        });
    } else {
        searchResultsContainer.innerHTML = '<div class="search-result-item">No products found.</div>';
    }
    searchResultsContainer.style.display = 'block';
}

function handleSearchEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const searchTerm = productSearchInput.value.trim();
        if (!searchTerm) return;

        const productByBarcode = allProducts.find(p => p.barcode === searchTerm);
        if (productByBarcode) {
            addProductToCart(productByBarcode);
            return;
        }

        const firstResult = searchResultsContainer.querySelector('.search-result-item');
        if (firstResult && firstResult.textContent !== 'No products found.') {
            firstResult.click();
        } else {
             alert(`No product found with barcode or name: "${searchTerm}"`);
             productSearchInput.select();
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
    if (!product.stock || product.stock <= 0) {
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
    } else {
        cart.forEach((item, index) => {
            const cartItemEl = document.createElement('div');
            cartItemEl.className = 'cart-item';
            const itemTotal = (item.sellingPrice || 0) * item.quantity;

            cartItemEl.innerHTML = `
                <div class="item-info">
                    <span class="item-name">${item.name}</span>
                    <span class="item-price">₹${(item.sellingPrice || 0).toFixed(2)}</span>
                </div>
                <div class="item-controls">
                    <button class="quantity-btn decrease-btn" data-index="${index}">-</button>
                    <input type="number" class="quantity-input" value="${item.quantity}" data-index="${index}" readonly>
                    <button class="quantity-btn increase-btn" data-index="${index}">+</button>
                </div>
                <div class="item-total">₹${itemTotal.toFixed(2)}</div>
                <button class="remove-item-btn" data-index="${index}">&times;</button>
            `;
            cartItemsContainer.prepend(cartItemEl);
        });
    }
    proceedToCheckoutBtn.disabled = cart.length === 0;
    addCartItemEventListeners();
    updateAllTotals();
}

function addCartItemEventListeners() {
    const handleQuantityChange = (index, change) => {
        const item = cart[index];
        if (!item) return;
        let newQuantity = item.quantity + change;

        if (newQuantity > item.stock) {
            alert(`Maximum stock available for ${item.name} is ${item.stock}.`);
            newQuantity = item.stock;
        }

        if (newQuantity <= 0) {
            cart.splice(index, 1);
        } else {
            item.quantity = newQuantity;
        }
        updateCartDisplay();
    };

    document.querySelectorAll('.increase-btn').forEach(btn => {
        btn.addEventListener('click', e => handleQuantityChange(parseInt(e.target.dataset.index), 1));
    });
    document.querySelectorAll('.decrease-btn').forEach(btn => {
        btn.addEventListener('click', e => handleQuantityChange(parseInt(e.target.dataset.index), -1));
    });
    document.querySelectorAll('.remove-item-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            cart.splice(parseInt(e.target.dataset.index), 1);
            updateCartDisplay();
        });
    });
}

function updateAllTotals() {
    const subtotal = cart.reduce((sum, item) => sum + ((item.sellingPrice || 0) * item.quantity), 0);
    const discountType = discountTypeSelect.value;
    let discountValue = parseFloat(discountValueInput.value) || 0;
    let discountAmount = 0;

    if (discountType === 'percent') {
        discountAmount = (subtotal * discountValue) / 100;
    } else {
        discountAmount = discountValue > subtotal ? subtotal : discountValue;
    }
    const discountedSubtotal = subtotal - discountAmount;
    const tax = gstToggle.checked ? discountedSubtotal * 0.05 : 0;
    const total = discountedSubtotal + tax;
    currentTotals = { subtotal, discount: discountAmount, tax, total };

    footerTotalAmountEl.textContent = `₹${total.toFixed(2)}`;
    modalSubtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
    modalDiscountEl.textContent = `- ₹${discountAmount.toFixed(2)}`;
    modalTaxEl.textContent = `₹${tax.toFixed(2)}`;
    modalTotalAmountEl.textContent = `₹${total.toFixed(2)}`;

    calculateReturnAmount();
    validateFinalBillButton();
}

function calculateReturnAmount() {
    const cashReceived = parseFloat(cashReceivedInput.value) || 0;
    const totalBill = currentTotals.total;
    const returnAmount = cashReceived >= totalBill ? cashReceived - totalBill : 0;
    returnAmountDisplay.textContent = `₹${returnAmount.toFixed(2)}`;
}

function validateFinalBillButton() {
    let isValid = false;
    if (cart.length > 0) {
        const method = paymentMethodSelect.value;
        if (method === 'cash') {
            const cashReceivedValue = cashReceivedInput.value.trim();
            if (cashReceivedValue === '') {
                isValid = true;
            } else {
                const cashReceived = parseFloat(cashReceivedValue) || 0;
                isValid = cashReceived >= currentTotals.total;
            }
        } else if (method === 'part-payment') {
            const cashPaid = parseFloat(cashAmountInput.value) || 0;
            const cardPaid = parseFloat(cardAmountInput.value) || 0;
            isValid = Math.abs((cashPaid + cardPaid) - currentTotals.total) < 0.01;
        } else {
            isValid = true;
        }
    }
    generateBillBtn.disabled = !isValid;
}

// ==========================================================
// --- বিল নম্বর জেনারেশন ---
// ==========================================================
async function getNextBillNumber() {
    if (!currentUserId) throw new Error("User not authenticated.");
    const counterRef = doc(db, 'shops', currentUserId, 'metadata', 'counters');

    try {
        const newBillNumber = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let lastBillNumber = 0;
            if (counterDoc.exists() && counterDoc.data().lastBillNumber) {
                lastBillNumber = counterDoc.data().lastBillNumber;
            }
            const nextBillNumber = lastBillNumber + 1;
            transaction.set(counterRef, { lastBillNumber: nextBillNumber }, { merge: true });
            return nextBillNumber;
        });
        return String(newBillNumber).padStart(5, '0');
    } catch (error) {
        console.error("Error getting next bill number: ", error);
        return `E-${Date.now().toString().slice(-6)}`;
    }
}

// ==========================================================
// --- চেকআউট এবং বিল জেনারেশন ---
// ==========================================================
async function generateFinalBill() {
    if (!preCheckoutValidation()) {
        return;
    }

    generateBillBtn.disabled = true;
    generateBillBtn.textContent = 'Processing...';

    try {
        const newBillNo = await getNextBillNumber();
        
        const sale = {
            billNo: newBillNo,
            // ================== START: THE FIX IS HERE ==================
            items: cart.map(item => ({ 
                id: item.id, 
                name: item.name, 
                quantity: item.quantity, 
                price: item.sellingPrice || 0, 
                category: item.category || 'N/A',
                // This line ensures Cost of Goods Sold can be calculated
                purchasePrice: item.purchasePrice || item.costPrice || 0 
            })),
            // =================== END: THE FIX IS HERE ===================
            ...currentTotals,
            paymentMethod: paymentMethodSelect.value,
            gstApplied: gstToggle.checked,
            customerDetails: { name: customerNameInput.value.trim() || 'Walk-in Customer', phone: customerPhoneInput.value.trim(), address: customerAddressInput.value.trim() },
            createdAt: serverTimestamp(),
            discountDetails: { type: discountTypeSelect.value, value: parseFloat(discountValueInput.value) || 0 },
            gstRate: 5
        };
        
        if (sale.paymentMethod === 'cash') {
            let cashReceived = parseFloat(cashReceivedInput.value);
            if (isNaN(cashReceived) || cashReceivedInput.value.trim() === '') {
                cashReceived = sale.total;
            }
            sale.paymentBreakdown = { 
                cashReceived: cashReceived, 
                changeReturned: cashReceived - sale.total 
            };
        } else if (sale.paymentMethod === 'part-payment') {
            sale.paymentBreakdown = { cash: parseFloat(cashAmountInput.value) || 0, card_or_online: parseFloat(cardAmountInput.value) || 0 };
        }

        const batch = writeBatch(db);
        const newSaleRef = doc(collection(db, 'shops', currentUserId, 'sales'));
        batch.set(newSaleRef, sale);

        for (const item of cart) {
            const productRef = doc(db, 'shops', currentUserId, 'inventory', item.id);
            batch.update(productRef, { stock: increment(-item.quantity) });
        }
        await batch.commit();

        const newSaleId = newSaleRef.id;
        const printUrl = `print.html?saleId=${newSaleId}`;
        window.open(printUrl, '_blank');
        
        resetAfterSale();
        await initializeProducts();

    } catch (error) {
        console.error("Error during checkout: ", error);
        alert(`Checkout failed. Error: ${error.message}`);
    } finally {
        generateBillBtn.disabled = false;
        generateBillBtn.textContent = 'Generate Bill & Finalize';
    }
}

function preCheckoutValidation() {
    if (cart.length === 0) {
        alert("Cart is empty. Please add products to proceed.");
        return false;
    }
    const method = paymentMethodSelect.value;

    if (method === 'cash' && cashReceivedInput.value.trim() !== '' && (parseFloat(cashReceivedInput.value) || 0) < currentTotals.total) {
        alert("Cash received is less than the total amount. Please enter a valid amount.");
        cashReceivedInput.focus();
        return false;
    }

    if (method === 'part-payment') {
        const cashPaid = parseFloat(cashAmountInput.value) || 0;
        const cardPaid = parseFloat(cardAmountInput.value) || 0;
        if (Math.abs((cashPaid + cardPaid) - currentTotals.total) > 0.01) {
            alert("Part payment amounts do not match the total bill.");
            return false;
        }
    }
    return true;
}

function resetAfterSale() {
    cart = [];
    updateCartDisplay();
    checkoutModal.classList.add('hidden');
    
    [customerNameInput, customerPhoneInput, customerAddressInput, discountValueInput, cashReceivedInput, cashAmountInput, cardAmountInput].forEach(input => input.value = '');
    discountTypeSelect.value = 'percent';
    gstToggle.checked = true;
    paymentMethodSelect.value = 'cash';
    handlePaymentMethodChange();
}

function handlePaymentMethodChange() {
    const method = paymentMethodSelect.value;
    cashPaymentDetails.classList.toggle('hidden', method !== 'cash');
    partPaymentDetails.classList.toggle('hidden', method !== 'part-payment');
    updateAllTotals();
}

// ==========================================================
// --- সব ইভেন্ট লিসেনার সেটআপ ---
// ==========================================================
function setupEventListeners() {
    productSearchInput.addEventListener('input', handleSearch);
    productSearchInput.addEventListener('keydown', handleSearchEnter);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-box')) {
            searchResultsContainer.style.display = 'none';
        }
    });

    categoryProductListContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (card) {
            const productToAdd = allProducts.find(p => p.id === card.dataset.productId);
            if (productToAdd) addToCart(productToAdd);
        }
    });

    proceedToCheckoutBtn.addEventListener('click', () => {
        if (cart.length > 0) {
            updateAllTotals();
            checkoutModal.classList.remove('hidden');
        }
    });

    closeModalBtn.addEventListener('click', () => checkoutModal.classList.add('hidden'));
    checkoutModal.addEventListener('click', (e) => {
        if (e.target === checkoutModal) {
            checkoutModal.classList.add('hidden');
        }
    });
    
    [gstToggle, discountTypeSelect, discountValueInput].forEach(el => el.addEventListener('input', updateAllTotals));
    
    paymentMethodSelect.addEventListener('change', handlePaymentMethodChange);
    
    cashReceivedInput.addEventListener('input', () => {
        calculateReturnAmount();
        validateFinalBillButton();
    });
    
    [cashAmountInput, cardAmountInput].forEach(el => {
        el.addEventListener('input', validateFinalBillButton);
    });

    generateBillBtn.addEventListener('click', generateFinalBill);

    logoutBtn.addEventListener('click', () => {
        signOut(auth).catch(error => console.error("Logout error", error));
    });

    mobileMenuBtn.addEventListener('click', () => {
        mainNavLinks.classList.toggle('mobile-nav-active');
    });
}