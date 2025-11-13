// billing.js (Firebase v10 - with Smart Search)

// Firebase মডিউল ইম্পোর্ট
import { 
    db, collection, getDocs, doc, query, where, orderBy, writeBatch, serverTimestamp, increment, addDoc 
} from '../js/firebase-config.js';

// DOM এলিমেন্টের রেফারেন্স
const productSearchInput = document.getElementById('product-search');
const searchResultsContainer = document.getElementById('search-results');
const cartItemsContainer = document.getElementById('cart-items');
const subtotalEl = document.getElementById('subtotal');
const taxEl = document.getElementById('tax');
const totalAmountEl = document.getElementById('total-amount');
const checkoutBtn = document.getElementById('checkout-btn');
const gstToggle = document.getElementById('gst-toggle');
const shopHeaderPlaceholder = document.getElementById('shop-header-placeholder');
const categoryProductListContainer = document.getElementById('category-product-list');

let cart = []; 
let allProducts = []; // সব প্রোডাক্টের লোকাল কপি

// দোকানের তথ্য লোড করা
fetch('../shop-details.html')
    .then(response => response.text())
    .then(html => {
        shopHeaderPlaceholder.innerHTML = html;
    })
    .catch(error => console.error('Error loading shop details:', error));

// ====================================================================
// --- নতুন এবং পরিবর্তিত ফাংশন (Smart Search এর জন্য) ---
// ====================================================================

/**
 * পেজ লোড হওয়ার সাথে সাথে সব প্রোডাক্ট লোড করে এবং ক্যাটাগরি ভিউ তৈরি করে।
 */
async function initializeProducts() {
    try {
        const q = query(collection(db, 'products'), where('stock', '>', 0), orderBy('name'));
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
    if (allProducts.length === 0) {
        categoryProductListContainer.innerHTML = '<p>No products available in stock.</p>';
        return;
    }

    const productsByCategory = allProducts.reduce((acc, product) => {
        const category = product.category || 'Uncategorized';
        if (!acc[category]) acc[category] = [];
        acc[category].push(product);
        return acc;
    }, {});

    categoryProductListContainer.innerHTML = '';
    // ক্যাটাগরিগুলোকে বর্ণানুক্রমে সাজানো
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


// --- প্রোডাক্ট সার্চের মূল লজিক (সম্পূর্ণ পরিবর্তিত) ---
productSearchInput.addEventListener('input', (e) => {
    const searchText = e.target.value.trim().toLowerCase();

    // যদি ইনপুট খালি থাকে, তাহলে সার্চ রেজাল্ট হাইড করা
    if (searchText.length < 2) {
        searchResultsContainer.style.display = 'none';
        return;
    }
    
    // allProducts অ্যারে থেকে ফিল্টার করা (substring search)
    const matchedProducts = allProducts.filter(product => 
        product.name.toLowerCase().includes(searchText) || 
        (product.barcode && product.barcode.toLowerCase().includes(searchText))
    ).slice(0, 10); // প্রথম ১০টি ফলাফল দেখানো

    searchResultsContainer.innerHTML = '';

    if (matchedProducts.length === 0) {
        searchResultsContainer.innerHTML = '<p class="product-item">No products found.</p>';
    } else {
        matchedProducts.forEach(product => {
            const productDiv = document.createElement('div');
            productDiv.classList.add('product-item');
            productDiv.innerHTML = `<span class="name">${product.name}</span> <span class="price">₹${product.sp.toFixed(2)}</span>`;
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

// বারকোড স্ক্যানারের জন্য Enter কী-এর হ্যান্ডলিং
productSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const searchText = e.target.value.trim().toLowerCase();
        if (searchText.length === 0) return;

        // বারকোড দিয়ে সরাসরি মিল খোঁজা
        const exactMatch = allProducts.find(p => p.barcode && p.barcode.toLowerCase() === searchText);
        if (exactMatch) {
            addToCart(exactMatch);
            productSearchInput.value = '';
            searchResultsContainer.style.display = 'none';
        } else {
            // যদি সরাসরি মিল না পাওয়া যায়, তাহলে প্রথম সার্চ রেজাল্টটি কার্টে যোগ করা
            const firstResult = searchResultsContainer.querySelector('.product-item');
            if (firstResult) {
                firstResult.click();
            }
        }
    }
});

// বাইরে ক্লিক করলে সার্চ রেজাল্ট হাইড করা
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box')) {
        searchResultsContainer.style.display = 'none';
    }
});


// ====================================================================
// --- বাকি ফাংশনগুলো প্রায় অপরিবর্তিত ---
// ====================================================================

categoryProductListContainer.addEventListener('click', (e) => {
    const card = e.target.closest('.product-card');
    if (card) {
        const productId = card.dataset.productId;
        const productToAdd = allProducts.find(p => p.id === productId);
        if (productToAdd) addToCart(productToAdd);
    }
});

function addToCart(product) { /* ...আগের মতোই ... */
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

function updateCartDisplay() { /* ...আগের মতোই ... */
    cartItemsContainer.innerHTML = '';
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p class="empty-cart-message">Your cart is empty.</p>';
        checkoutBtn.disabled = true;
    } else {
        cart.forEach((item, index) => {
            const cartItemDiv = document.createElement('div');
            cartItemDiv.classList.add('cart-item');
            cartItemDiv.innerHTML = `<div class="cart-item-details"><div class="cart-item-name">${item.name}</div><div class="cart-item-price">₹${item.sp.toFixed(2)}</div></div><div class="cart-item-actions"><input type="number" class="quantity-input" value="${item.quantity}" min="1" max="${item.stock}" data-index="${index}"><button class="remove-btn" data-index="${index}">&times;</button></div>`;
            cartItemsContainer.appendChild(cartItemDiv);
        });
        checkoutBtn.disabled = false;
    }
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.addEventListener('change', e => {
            const index = e.target.dataset.index;
            const newQuantity = parseInt(e.target.value);
            const item = cart[index];
            if (newQuantity > 0 && newQuantity <= item.stock) item.quantity = newQuantity;
            else if (newQuantity > item.stock) {
                alert(`Maximum stock available for ${item.name} is ${item.stock}.`);
                e.target.value = item.quantity;
            } else cart.splice(index, 1);
            updateCartDisplay();
        });
    });
    document.querySelectorAll('.remove-btn').forEach(button => {
        button.addEventListener('click', e => {
            cart.splice(e.target.dataset.index, 1);
            updateCartDisplay();
        });
    });
    calculateTotals();
}

function calculateTotals() { /* ...আগের মতোই ... */
    const subtotal = cart.reduce((sum, item) => sum + (item.sp * item.quantity), 0);
    const tax = gstToggle.checked ? subtotal * 0.05 : 0;
    const total = subtotal + tax;
    subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
    taxEl.textContent = `₹${tax.toFixed(2)}`;
    totalAmountEl.textContent = `₹${total.toFixed(2)}`;
}

gstToggle.addEventListener('change', calculateTotals);

checkoutBtn.addEventListener('click', async () => { /* ...আগের মতোই ... */
    if (cart.length === 0) return;
    checkoutBtn.disabled = true;
    checkoutBtn.textContent = 'Processing...';

    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    const subtotal = cart.reduce((sum, item) => sum + (item.sp * item.quantity), 0);
    const tax = gstToggle.checked ? subtotal * 0.05 : 0;
    const total = subtotal + tax;
    const sale = {
        items: cart.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.sp })),
        subtotal, tax, total, paymentMethod, gstApplied: gstToggle.checked, createdAt: serverTimestamp()
    };
    try {
        const batch = writeBatch(db);
        const saleRef = await addDoc(collection(db, "sales"), sale);
        cart.forEach(item => {
            const productRef = doc(db, "products", item.id);
            batch.update(productRef, { stock: increment(-item.quantity) });
        });
        await batch.commit();
        window.open(`../print/print.html?saleId=${saleRef.id}`, '_blank');
        cart = [];
        updateCartDisplay();
        // প্রোডাক্ট স্টক আপডেট হওয়ার পর আবার লোড করা
        initializeProducts();
    } catch (error) {
        console.error("Error during checkout: ", error);
        alert('Checkout failed. Please try again.');
    } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'Generate Bill & Checkout';
    }
});

// পেজ লোড হওয়ার পর প্রাথমিক ফাংশন কল
updateCartDisplay();
initializeProducts();