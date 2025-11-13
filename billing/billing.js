// Firebase মডিউল ইম্পোর্ট
import { 
    db, collection, getDocs, doc, query, where, orderBy, writeBatch, serverTimestamp, increment, addDoc 
} from '../js/firebase-config.js';

// ==========================================================
// --- DOM এলিমেন্টের রেফারেন্স (নতুন UI অনুযায়ী) ---
// ==========================================================
const productSearchInput = document.getElementById('product-search');
const searchResultsContainer = document.getElementById('search-results');
const categoryProductListContainer = document.getElementById('category-product-list');

// কার্ট এবং ফুটার
const cartItemsContainer = document.getElementById('cart-items');
const footerTotalAmountEl = document.getElementById('footer-total-amount');
const proceedToCheckoutBtn = document.getElementById('proceed-to-checkout-btn');

// মডাল (Modal) এলিমেন্ট
const checkoutModal = document.getElementById('checkout-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalSubtotalEl = document.getElementById('modal-subtotal');
const modalTaxEl = document.getElementById('modal-tax');
const modalTotalAmountEl = document.getElementById('modal-total-amount');
const gstToggle = document.getElementById('gst-toggle');
const paymentMethodSelect = document.getElementById('payment-method-select');
const generateBillBtn = document.getElementById('generate-bill-btn');

// পার্ট পেমেন্ট এলিমেন্ট
const partPaymentDetails = document.getElementById('part-payment-details');
const cashAmountInput = document.getElementById('cash-amount');
const cardAmountInput = document.getElementById('card-amount');

// গ্লোবাল ভেরিয়েবল
let cart = []; 
let allProducts = [];
let currentTotals = { subtotal: 0, tax: 0, total: 0 };


// ==========================================================
// --- প্রাথমিক ফাংশন (পেজ লোড) ---
// ==========================================================

// দোকানের তথ্য লোড করা (যদি থাকে)
fetch('../shop-details.html')
    .then(response => response.text())
    .then(html => {
        const shopHeaderPlaceholder = document.getElementById('shop-header-placeholder');
        if(shopHeaderPlaceholder) shopHeaderPlaceholder.innerHTML = html;
    })
    .catch(error => console.error('Error loading shop details:', error));


/**
 * পেজ লোড হওয়ার সাথে সাথে সব প্রোডাক্ট লোড করে এবং ক্যাটাগরি ভিউ তৈরি করে।
 */
async function initializeProducts() {
    try {
        const q = query(collection(db, 'products'), orderBy('name'));
        const querySnapshot = await getDocs(q);
        
        allProducts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        displayProductsByCategory();

    } catch (error) {
        console.error("Error initializing products: ", error);
        categoryProductListContainer.innerHTML = '<p class="error-message">Failed to load products.</p>';
    }
}

/**
 * allProducts অ্যারে থেকে ক্যাটাগরি অনুযায়ী প্রোডাক্ট প্রদর্শন করে।
 */
function displayProductsByCategory() {
    const inStockProducts = allProducts.filter(p => p.stock > 0);

    if (inStockProducts.length === 0) {
        categoryProductListContainer.innerHTML = '<p>No products available in stock.</p>';
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
        const categoryName = document.createElement('h4');
        categoryName.classList.add('category-name');
        categoryName.textContent = category;
        const productGrid = document.createElement('div');
        productGrid.classList.add('product-grid');

        productsByCategory[category].forEach(product => {
            const productCard = document.createElement('div');
            productCard.classList.add('product-card');
            productCard.dataset.productId = product.id;
            productCard.innerHTML = `<span class="product-card-name">${product.name}</span><span class="product-card-price">₹${product.sp.toFixed(2)}</span>`;
            productGrid.appendChild(productCard);
        });
        
        categoryGroup.appendChild(categoryName);
        categoryGroup.appendChild(productGrid);
        categoryProductListContainer.appendChild(categoryGroup);
    }
}


// ==========================================================
// --- প্রোডাক্ট সার্চ এবং কার্টে যোগ করার লজিক ---
// ==========================================================

productSearchInput.addEventListener('input', (e) => {
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
            productDiv.innerHTML = `<span>${product.name}</span> <span>₹${product.sp.toFixed(2)}</span>`;
            productDiv.addEventListener('click', () => {
                addToCart(product);
                productSearchInput.value = '';
                searchResultsContainer.style.display = 'none';
            });
            searchResultsContainer.appendChild(productDiv);
        });
    }
    searchResultsContainer.style.display = 'block';
});

productSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const searchText = e.target.value.trim().toLowerCase();
        if (!searchText) return;
        const exactMatch = allProducts.find(p => p.stock > 0 && p.barcode && p.barcode.toLowerCase() === searchText);
        if (exactMatch) addToCart(exactMatch);
        else {
            const firstResult = searchResultsContainer.querySelector('.search-result-item');
            if (firstResult) firstResult.click();
        }
        productSearchInput.value = '';
        searchResultsContainer.style.display = 'none';
    }
});

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

function addToCart(product) {
    if (product.stock <= 0) {
        alert(`'${product.name}' is out of stock!`);
        return;
    }
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
        if (existingItem.quantity < product.stock) existingItem.quantity++;
        else alert(`Cannot add more. Stock limit for '${product.name}' reached!`);
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
    } else {
        cart.forEach((item, index) => {
            const cartItemDiv = document.createElement('div');
            cartItemDiv.classList.add('cart-item');
            cartItemDiv.innerHTML = `
                <span class="cart-item-name">${item.name}</span>
                <div class="cart-item-quantity">
                    <input type="number" class="quantity-input" value="${item.quantity}" min="1" max="${item.stock}" data-index="${index}">
                </div>
                <span class="cart-item-price">₹${(item.sp * item.quantity).toFixed(2)}</span>
                <button class="cart-item-remove" data-index="${index}">&times;</button>
            `;
            cartItemsContainer.prepend(cartItemDiv);
        });
        proceedToCheckoutBtn.disabled = false;
    }
    addCartItemEventListeners();
    calculateTotals();
}

function addCartItemEventListeners() {
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.addEventListener('change', e => {
            const index = e.target.dataset.index;
            let newQuantity = parseInt(e.target.value);
            const item = cart[index];
            if (newQuantity > item.stock) {
                alert(`Maximum stock available for ${item.name} is ${item.stock}.`);
                newQuantity = item.stock;
                e.target.value = newQuantity;
            }
            if (newQuantity > 0) item.quantity = newQuantity;
            else cart.splice(index, 1);
            updateCartDisplay();
        });
    });
    document.querySelectorAll('.cart-item-remove').forEach(button => {
        button.addEventListener('click', e => {
            cart.splice(e.target.dataset.index, 1);
            updateCartDisplay();
        });
    });
}

function calculateTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.sp * item.quantity), 0);
    const tax = gstToggle.checked ? subtotal * 0.05 : 0;
    const total = subtotal + tax;
    currentTotals = { subtotal, tax, total };
    footerTotalAmountEl.textContent = `₹${total.toFixed(2)}`;
}

gstToggle.addEventListener('change', calculateTotals);


// ==========================================================
// --- চেকআউট এবং মডাল লজিক ---
// ==========================================================

proceedToCheckoutBtn.addEventListener('click', () => {
    calculateTotals();
    modalSubtotalEl.textContent = `₹${currentTotals.subtotal.toFixed(2)}`;
    modalTaxEl.textContent = `₹${currentTotals.tax.toFixed(2)}`;
    modalTotalAmountEl.textContent = `₹${currentTotals.total.toFixed(2)}`;
    cashAmountInput.value = '';
    cardAmountInput.value = '';
    checkoutModal.classList.remove('hidden');
});

closeModalBtn.addEventListener('click', () => checkoutModal.classList.add('hidden'));
checkoutModal.addEventListener('click', (e) => {
    if (e.target === checkoutModal) checkoutModal.classList.add('hidden');
});

cashAmountInput.addEventListener('input', () => {
    const total = currentTotals.total;
    const cashPaid = parseFloat(cashAmountInput.value) || 0;
    if (cashPaid > total) {
        cashAmountInput.value = total.toFixed(2);
        cardAmountInput.value = '0.00';
        return;
    }
    cardAmountInput.value = (total - cashPaid).toFixed(2);
});

cardAmountInput.addEventListener('input', () => {
    const total = currentTotals.total;
    const cardPaid = parseFloat(cardAmountInput.value) || 0;
    if (cardPaid > total) {
        cardAmountInput.value = total.toFixed(2);
        cashAmountInput.value = '0.00';
        return;
    }
    cashAmountInput.value = (total - cardPaid).toFixed(2);
});

/**
 * ফাইনাল বিল তৈরি এবং ডাটাবেসে সংরক্ষণ।
 */
generateBillBtn.addEventListener('click', async () => {
    if (cart.length === 0) return;
    generateBillBtn.disabled = true;
    generateBillBtn.textContent = 'Processing...';

    const paymentMethod = paymentMethodSelect.value;
    
    // === এই অংশে মূল পরিবর্তন ===
    const sale = {
        items: cart.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.sp })),
        subtotal: currentTotals.subtotal,
        tax: currentTotals.tax,
        total: currentTotals.total,
        paymentMethod: paymentMethod, // পেমেন্টের মূল ধরন (cash, card, part-payment)
        gstApplied: gstToggle.checked,
        createdAt: serverTimestamp()
    };

    // পার্ট পেমেন্টের ক্ষেত্রে অতিরিক্ত তথ্য যোগ করা
    if (paymentMethod === 'part-payment') {
        const cashPaid = parseFloat(cashAmountInput.value) || 0;
        const cardPaid = parseFloat(cardAmountInput.value) || 0;
        
        if ((cashPaid + cardPaid).toFixed(2) !== currentTotals.total.toFixed(2)) {
            alert('Part payment amounts do not match the total bill. Please check.');
            generateBillBtn.disabled = false;
            generateBillBtn.textContent = 'Generate Bill & Finalize';
            return;
        }

        // sale অবজেক্টে breakdown যোগ করা
        sale.paymentBreakdown = {
            cash: cashPaid,
            card_or_online: cardPaid
        };
    }

    try {
        const batch = writeBatch(db);
        const saleRef = await addDoc(collection(db, "sales"), sale);

        for (const item of cart) {
            const productRef = doc(db, "products", item.id);
            batch.update(productRef, { stock: increment(-item.quantity) });
        }
        await batch.commit();

        window.open(`print.html?saleId=${saleRef.id}`, '_blank');
        
        // রিসেট
        cart = [];
        updateCartDisplay();
        checkoutModal.classList.add('hidden');
        await initializeProducts(); // স্টক আপডেটের পর প্রোডাক্ট লিস্ট রিফ্রেশ

    } catch (error) {
        console.error("Error during checkout: ", error);
        alert('Checkout failed. Please try again.');
    } finally {
        generateBillBtn.disabled = false;
        generateBillBtn.textContent = 'Generate Bill & Finalize';
    }
});


// ==========================================================
// --- পেজ লোড হওয়ার পর প্রাথমিক ফাংশন কল ---
// ==========================================================
updateCartDisplay();
initializeProducts();