// billing/billing.js - With Serial Number Starting from 1000 (v4.1)

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth'; // signOut এখান থেকে সরিয়ে নেওয়া হয়েছে কারণ এটি এখন HTML ফাইলে হ্যান্ডেল হচ্ছে
import {
    collection, doc, getDocs, getDoc, updateDoc, query, where, orderBy, writeBatch, serverTimestamp, increment, runTransaction
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
const gstToggle = document.getElementById('gst-toggle');
const modalTaxEl = document.getElementById('modal-tax');
const modalTotalAmountEl = document.getElementById('modal-total-amount');
const discountTypeSelect = document.getElementById('discount-type');
const discountValueInput = document.getElementById('discount-value');
const modalDiscountEl = document.getElementById('modal-discount');
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

// নোট: logoutBtn এবং mobileMenuBtn এখান থেকে সরিয়ে ফেলা হয়েছে কারণ এগুলো navbar.js হ্যান্ডেল করছে।

// ==========================================================
// --- গ্লোবাল ভেরিয়েবল ---
// ==========================================================
let cart = [];
let allProducts = [];
// currentTotals এ advancePaid এবং payableTotal যোগ করা হয়েছে
let currentTotals = { subtotal: 0, discount: 0, tax: 0, total: 0, advancePaid: 0, payableTotal: 0 };
let currentUserId = null;
let bookingData = null; // বুকিং ডেটার জন্য ভেরিয়েবল

// ==========================================================
// --- Authentication & Initialization ---
// ==========================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        initializeBillingPage();
    } else {
        window.location.href = '../index.html';
    }
});

function initializeBillingPage() {
    updateCartDisplay();
    initializeProducts();
    setupEventListeners();
    handlePaymentMethodChange();
    
    // বুকিং চেক করা (যদি অ্যাডভান্স বুকিং পেজ থেকে এসে থাকে)
    checkPendingBooking();
}

// ==========================================================
// --- বুকিং ইন্টিগ্রেশন ফাংশন ---
// ==========================================================
async function checkPendingBooking() {
    const bookingId = sessionStorage.getItem('pending_booking_id');
    if (!bookingId || !currentUserId) return;

    try {
        const docRef = doc(db, 'shops', currentUserId, 'bookings', bookingId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            // স্ট্যাটাস যদি অলরেডি বিল্ড হয়, তাহলে ইগনোর করুন
            if (data.status === 'Billed') {
                sessionStorage.removeItem('pending_booking_id');
                return;
            }

            bookingData = { id: docSnap.id, ...data };
            
            // কাস্টমার ইনফো অটো-ফিল করা
            customerNameInput.value = bookingData.customerName || '';
            customerPhoneInput.value = bookingData.phone || '';
            
            // ইউজারকে নোটিফিকেশন দেওয়া
            alert(`Booking Detected for: ${bookingData.customerName}\nAdvance Paid: ₹${bookingData.advancePaid}`);
            
            // টোটাল আপডেট করা যাতে মডালে অ্যাডভান্স দেখায়
            updateAllTotals();
        }
    } catch (error) {
        console.error("Error loading booking:", error);
    }
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
        categoryProductListContainer.innerHTML = `<p class="error-message">Failed to load products. Please refresh.</p>`;
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
    Object.keys(productsByCategory).sort().forEach(category => {
        const categoryGroup = document.createElement('div');
        categoryGroup.classList.add('category-group');
        categoryGroup.innerHTML = `<h4 class="category-name">${category}</h4>`;
        const productGrid = document.createElement('div');
        productGrid.classList.add('product-grid');
        productsByCategory[category].forEach(product => {
            const productCard = document.createElement('div');
            productCard.classList.add('product-card');
            productCard.dataset.productId = product.id;
            productCard.innerHTML = `
                <span class="product-card-name">${product.name}</span>
                <span class="product-card-price">₹${(product.sellingPrice || 0).toFixed(2)}</span>
                <div class="product-card-stock ${product.stock <= 10 ? 'low-stock' : ''}">Stock: ${product.stock}</div>
            `;
            productGrid.appendChild(productCard);
        });
        categoryGroup.appendChild(productGrid);
        categoryProductListContainer.appendChild(categoryGroup);
    });
}

// =========================================================================================
// === প্রোডাক্ট সার্চ এবং বারকোড হ্যান্ডলিং ===
// =========================================================================================
function handleSearch(e) {
    const searchText = e.target.value.trim().toLowerCase();
    if (searchText.length < 2) {
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
            const div = document.createElement('div');
            div.classList.add('search-result-item');
            div.innerHTML = `<span>${product.name}</span> <span>₹${(product.sellingPrice || 0).toFixed(2)}</span>`;
            div.addEventListener('click', () => addProductToCart(product));
            searchResultsContainer.appendChild(div);
        });
    } else {
        searchResultsContainer.innerHTML = '<div class="search-result-item">No products found.</div>';
    }
    searchResultsContainer.style.display = 'block';
}

function handleBarcodeScan(barcode) {
    if (!barcode) return;
    const product = allProducts.find(p => p.barcode === barcode);
    if (product) {
        addToCart(product);
        productSearchInput.value = '';
        searchResultsContainer.style.display = 'none';
    } else {
        alert(`No product found with barcode: "${barcode}"`);
    }
}

function addProductToCart(product) {
    addToCart(product);
    productSearchInput.value = '';
    searchResultsContainer.style.display = 'none';
    productSearchInput.focus();
}

function addToCart(product) {
    if (!product || !product.id) return;
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
    cartItemsContainer.innerHTML = cart.length === 0 ? '<p class="empty-cart-message">Your cart is empty.</p>' : '';
    if (cart.length > 0) {
        cart.sort((a, b) => a.name.localeCompare(b.name));
        cart.forEach(item => {
            const cartItemEl = document.createElement('div');
            cartItemEl.className = 'cart-item';
            cartItemEl.innerHTML = `
                <div class="item-info"><span class="item-name">${item.name}</span><span class="item-price">₹${(item.sellingPrice || 0).toFixed(2)}</span></div>
                <div class="item-controls">
                    <button class="quantity-btn decrease-btn" data-id="${item.id}">-</button>
                    <input type="number" class="quantity-input" value="${item.quantity}" readonly>
                    <button class="quantity-btn increase-btn" data-id="${item.id}">+</button>
                </div>
                <div class="item-total">₹${((item.sellingPrice || 0) * item.quantity).toFixed(2)}</div>
                <button class="remove-item-btn" data-id="${item.id}">&times;</button>
            `;
            cartItemsContainer.prepend(cartItemEl);
        });
    }
    proceedToCheckoutBtn.disabled = cart.length === 0;
    addCartItemEventListeners();
    updateAllTotals();
}

function addCartItemEventListeners() {
    const handleQuantityChange = (productId, change) => {
        const item = cart.find(i => i.id === productId);
        if (!item) return;
        let newQuantity = item.quantity + change;
        const productFromStock = allProducts.find(p => p.id === productId);
        if (newQuantity > productFromStock.stock) {
            alert(`Maximum stock for ${item.name} is ${productFromStock.stock}.`);
            newQuantity = productFromStock.stock;
        }
        if (newQuantity <= 0) {
            cart = cart.filter(i => i.id !== productId);
        } else {
            item.quantity = newQuantity;
        }
        updateCartDisplay();
    };

    document.querySelectorAll('.cart-item').forEach(el => {
        el.querySelector('.increase-btn').onclick = e => handleQuantityChange(e.target.dataset.id, 1);
        el.querySelector('.decrease-btn').onclick = e => handleQuantityChange(e.target.dataset.id, -1);
        el.querySelector('.remove-item-btn').onclick = e => {
            cart = cart.filter(i => i.id !== e.target.dataset.id);
            updateCartDisplay();
        };
    });
}

// ==============================================================
// --- START: টোটাল, ডিসকাউন্ট, এবং পেমেন্ট ক্যালকুলেশন ---
// ==============================================================
function updateAllTotals() {
    const subtotal = cart.reduce((sum, item) => sum + (item.sellingPrice || 0) * item.quantity, 0);
    const discountType = discountTypeSelect.value;
    let discountValue = parseFloat(discountValueInput.value);
    if (isNaN(discountValue) || discountValue < 0) discountValue = 0;

    if (discountType === 'percent') {
        if (discountValue > 100) {
            discountValue = 100;
            discountValueInput.value = 100;
        }
    } else { 
        if (discountValue > subtotal && subtotal > 0) {
            discountValue = subtotal;
            discountValueInput.value = subtotal.toFixed(2);
        }
    }

    let discountAmount = (discountType === 'percent') ? (subtotal * discountValue) / 100 : discountValue;
    if (discountAmount > subtotal) discountAmount = subtotal;
    
    const discountedSubtotal = subtotal - discountAmount;
    const tax = gstToggle.checked ? discountedSubtotal * 0.05 : 0;
    const total = discountedSubtotal + tax;

    // === ADVANCE ADJUSTMENT LOGIC ===
    let advancePaid = 0;
    const advanceRow = document.getElementById('advance-row'); // HTML এ এই ID টি থাকতে হবে
    const modalAdvanceEl = document.getElementById('modal-advance');

    if (bookingData && bookingData.advancePaid > 0) {
        advancePaid = bookingData.advancePaid;
        if (advanceRow) {
            advanceRow.style.display = 'flex';
            modalAdvanceEl.textContent = `- ₹${advancePaid.toFixed(2)}`;
        }
    } else {
        if (advanceRow) advanceRow.style.display = 'none';
    }

    // Payable Total (cannot be negative)
    const payableTotal = Math.max(0, total - advancePaid);

    currentTotals = { subtotal, discount: discountAmount, tax, total, advancePaid, payableTotal };

    // UI আপডেট
    footerTotalAmountEl.textContent = `₹${total.toFixed(2)}`; // এখানে গ্র্যান্ড টোটাল (বিল এমাউন্ট)
    modalSubtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
    modalDiscountEl.textContent = `- ₹${discountAmount.toFixed(2)}`;
    modalTaxEl.textContent = `₹${tax.toFixed(2)}`;
    
    // মডালে আমরা কাস্টমারকে কত দিতে হবে সেটা দেখাবো
    modalTotalAmountEl.textContent = `₹${payableTotal.toFixed(2)}`;

    updatePaymentDetails();
}

function updatePaymentDetails() {
    const method = paymentMethodSelect.value;
    // এখানে আমরা payableTotal ব্যবহার করবো, কারণ কাস্টমার এটাই দেবে
    const amountToPay = currentTotals.payableTotal;

    if (method === 'cash') {
        const cashReceived = parseFloat(cashReceivedInput.value);
        let returnAmount = 0;
        if (!isNaN(cashReceived) && cashReceived >= amountToPay) {
            returnAmount = cashReceived - amountToPay;
        }
        returnAmountDisplay.textContent = `₹${returnAmount.toFixed(2)}`;
    }
    validateFinalBillButton();
}

function validateFinalBillButton() {
    let isValid = false;
    if (cart.length > 0) {
        const method = paymentMethodSelect.value;
        const amountToPay = currentTotals.payableTotal;

        if (method === 'cash') {
            const cashReceived = parseFloat(cashReceivedInput.value);
            isValid = isNaN(cashReceived) || cashReceived >= amountToPay;
        } else if (method === 'part-payment') {
            const cashAmount = parseFloat(cashAmountInput.value) || 0;
            const cardAmount = parseFloat(cardAmountInput.value) || 0;
            isValid = Math.abs((cashAmount + cardAmount) - amountToPay) < 0.01;
        } else {
            isValid = true;
        }
    }
    generateBillBtn.disabled = !isValid;
}
// --- END: টোটাল, ডিসকাউন্ট, এবং পেমেন্ট ক্যালকুলেশন ---

// ==========================================================
// --- বিল নম্বর জেনারেশন (MODIFIED FOR SERIAL 1000+) ---
// ==========================================================
async function getNextBillNumber() {
    if (!currentUserId) throw new Error("User not authenticated.");
    const counterRef = doc(db, 'shops', currentUserId, 'metadata', 'counters');
    
    try {
        return await runTransaction(db, async transaction => {
            const counterDoc = await transaction.get(counterRef);
            
            let lastBillNumber = 0;
            if (counterDoc.exists()) {
                const data = counterDoc.data();
                lastBillNumber = data.lastBillNumber || 0;
            }

            // --- লজিক পরিবর্তন ---
            // যদি বর্তমান নম্বর ৯৯৯-এর কম হয়, আমরা সেটাকে ৯৯৯ ধরে নেব।
            // এর ফলে পরবর্তী নম্বরটি হবে (৯৯৯ + ১) = ১০০০।
            if (lastBillNumber < 999) {
                lastBillNumber = 999;
            }

            const nextBillNumber = lastBillNumber + 1;
            
            // ডাটাবেসে নতুন নম্বর আপডেট করা
            transaction.set(counterRef, { lastBillNumber: nextBillNumber }, { merge: true });
            
            // এখন আর padStart(5, '0') ব্যবহার করছি না, সরাসরি নম্বর স্ট্রিং হিসেবে পাঠাচ্ছি।
            // উদাহরণ: 1000, 1001, 1002
            return String(nextBillNumber);
        });
    } catch (error) {
        console.error("Error getting next bill number:", error);
        // ব্যাকআপ হিসেবে টাইমস্ট্যাম্প ব্যবহার (যদি নেটওয়ার্ক এরর হয়)
        return `${Date.now().toString()}`;
    }
}

async function generateFinalBill() {
    if (!preCheckoutValidation()) return;
    generateBillBtn.disabled = true;
    generateBillBtn.textContent = 'Processing...';

    try {
        const newBillNo = await getNextBillNumber();
        const sale = {
            billNo: newBillNo,
            items: cart.map(item => ({
                id: item.id, name: item.name, quantity: item.quantity,
                price: item.sellingPrice || 0, category: item.category || 'N/A',
                purchasePrice: item.purchasePrice || item.costPrice || 0
            })),
            // নতুন ডেটা স্ট্রাকচার
            subtotal: currentTotals.subtotal,
            discount: currentTotals.discount,
            tax: currentTotals.tax,
            total: currentTotals.total, // বিল এমাউন্ট
            advanceAdjusted: currentTotals.advancePaid, // অ্যাডভান্স
            finalPaidAmount: currentTotals.payableTotal, // কাস্টমার যা দিল
            
            paymentMethod: paymentMethodSelect.value,
            gstApplied: gstToggle.checked,
            customerDetails: { name: customerNameInput.value.trim() || 'Walk-in Customer', phone: customerPhoneInput.value.trim(), address: customerAddressInput.value.trim() },
            createdAt: serverTimestamp(),
            discountDetails: { type: discountTypeSelect.value, value: parseFloat(discountValueInput.value) || 0 },
            gstRate: 5,
            bookingId: bookingData ? bookingData.id : null // বুকিং আইডি লিঙ্ক করা
        };

        const amountToPay = currentTotals.payableTotal;

        if (sale.paymentMethod === 'cash') {
            const cashReceived = parseFloat(cashReceivedInput.value);
            const finalCashReceived = isNaN(cashReceived) ? amountToPay : cashReceived;
            sale.paymentBreakdown = { cashReceived: finalCashReceived, changeReturned: finalCashReceived - amountToPay };
        } else if (sale.paymentMethod === 'part-payment') {
            sale.paymentBreakdown = { cash: parseFloat(cashAmountInput.value) || 0, card_or_online: parseFloat(cardAmountInput.value) || 0 };
        }

        const batch = writeBatch(db);
        const newSaleRef = doc(collection(db, 'shops', currentUserId, 'sales'));
        batch.set(newSaleRef, sale);
        cart.forEach(item => batch.update(doc(db, 'shops', currentUserId, 'inventory', item.id), { stock: increment(-item.quantity) }));
        
        // === যদি বুকিং থেকে এসে থাকে, তবে বুকিং স্ট্যাটাস আপডেট করা ===
        if(bookingData && bookingData.id) {
            const bookingRef = doc(db, 'shops', currentUserId, 'bookings', bookingData.id);
            batch.update(bookingRef, { status: 'Billed' });
        }

        await batch.commit();

        // সেশন ক্লিয়ার করা
        if(bookingData) {
            sessionStorage.removeItem('pending_booking_id');
            bookingData = null;
        }

        window.open(`print.html?saleId=${newSaleRef.id}`, '_blank');
        resetAfterSale();
        await initializeProducts();
    } catch (error) {
        console.error("Error during checkout:", error);
        alert(`Checkout failed: ${error.message}`);
    } finally {
        generateBillBtn.disabled = false;
        generateBillBtn.textContent = 'Generate Bill & Finalize';
    }
}

function preCheckoutValidation() {
    if (cart.length === 0) {
        alert("Cart is empty.");
        return false;
    }
    const method = paymentMethodSelect.value;
    const amountToPay = currentTotals.payableTotal;

    if (method === 'cash') {
        const cashReceived = parseFloat(cashReceivedInput.value);
        if (!isNaN(cashReceived) && cashReceived < amountToPay) {
            alert("Cash received is less than payable amount.");
            cashReceivedInput.focus();
            return false;
        }
    }
    if (method === 'part-payment' && Math.abs(((parseFloat(cashAmountInput.value) || 0) + (parseFloat(cardAmountInput.value) || 0)) - amountToPay) > 0.01) {
        alert("Part payment amounts do not match payable amount.");
        return false;
    }
    return true;
}

function resetAfterSale() {
    cart = [];
    checkoutModal.classList.add('hidden');
    [customerNameInput, customerPhoneInput, customerAddressInput, discountValueInput, cashReceivedInput, cashAmountInput, cardAmountInput, productSearchInput].forEach(input => input.value = '');
    discountTypeSelect.value = 'percent';
    gstToggle.checked = true;
    paymentMethodSelect.value = 'cash';
    
    // Advance row লুকিয়ে ফেলা
    const advanceRow = document.getElementById('advance-row');
    if(advanceRow) advanceRow.style.display = 'none';

    updateCartDisplay();
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

    document.addEventListener('keydown', (e) => {
        const activeEl = document.activeElement;
        const isTypingInInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA';

        if (!isTypingInInput && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            productSearchInput.focus();
            productSearchInput.value += e.key;
        }

        if (e.key === 'Enter' && activeEl === productSearchInput) {
            e.preventDefault();
            const searchTerm = productSearchInput.value.trim();
            if (searchTerm) {
                handleBarcodeScan(searchTerm);
            }
        }
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('.search-box')) {
            searchResultsContainer.style.display = 'none';
        }
    });

    categoryProductListContainer.addEventListener('click', e => {
        const card = e.target.closest('.product-card');
        if (card) {
            const product = allProducts.find(p => p.id === card.dataset.productId);
            if (product) addProductToCart(product);
        }
    });

    proceedToCheckoutBtn.addEventListener('click', () => {
        if (cart.length > 0) {
            updateAllTotals();
            checkoutModal.classList.remove('hidden');
            // যদি বুকিং থেকে নাম না এসে থাকে, তাহলে ফোকাস করবে
            if(!customerNameInput.value) customerNameInput.focus();
        }
    });

    closeModalBtn.addEventListener('click', () => checkoutModal.classList.add('hidden'));
    checkoutModal.addEventListener('click', e => {
        if (e.target === checkoutModal) {
            checkoutModal.classList.add('hidden');
        }
    });
    
    [gstToggle, discountTypeSelect, discountValueInput, cashReceivedInput, cashAmountInput, cardAmountInput].forEach(el => {
        el.addEventListener('input', updateAllTotals);
    });
    
    paymentMethodSelect.addEventListener('change', handlePaymentMethodChange);

    generateBillBtn.addEventListener('click', generateFinalBill);
    
    // নোট: logoutBtn এবং mobileMenuBtn এর ইভেন্ট লিসেনার এখান থেকে সরিয়ে ফেলা হয়েছে।
}