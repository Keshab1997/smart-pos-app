// billing/billing.js - With Product Images (v4.2)

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'firebase/auth';
import {
    collection, doc, getDocs, getDoc, updateDoc, query, where, orderBy, writeBatch, serverTimestamp, increment, runTransaction, addDoc, onSnapshot, deleteDoc, Timestamp
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
const modalTotalAmountEl = document.getElementById('modal-total-amount');
const discountTypeSelect = document.getElementById('discount-type');
const discountValueInput = document.getElementById('discount-value');
const cashReceivedInput = document.getElementById('cash-received');
const returnAmountDisplay = document.getElementById('return-amount');
const generateBillBtn = document.getElementById('generate-bill-btn');
const customerNameInput = document.getElementById('customer-name');
const customerPhoneInput = document.getElementById('customer-phone');
const customerAddressInput = document.getElementById('customer-address');

// ==========================================================
// --- গ্লোবাল ভেরিয়েবল ---
// ==========================================================
let cart = [];
let allProducts = [];
let currentTotals = { subtotal: 0, discount: 0, tax: 0, total: 0, advancePaid: 0, payableTotal: 0 };
let activeShopId = null;
let bookingData = null;
let selectedPaymentMethod = 'cash';

// Beep Sound Function
const playBeep = () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.1);
};

// ==========================================================
// --- Authentication & Initialization ---
// ==========================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        activeShopId = localStorage.getItem('activeShopId');
        if (activeShopId) {
            initializeBillingPage();
        } else {
            window.location.href = '../index.html';
        }
    } else {
        window.location.href = '../index.html';
    }
});

function initializeBillingPage() {
    updateCartDisplay();
    initializeProducts();
    setupEventListeners();
    handlePaymentMethodChange();
    checkPendingBooking();
    listenUnsettledBills();
    autoSettleOldBills();
}

// ==========================================================
// --- বুকিং ইন্টিগ্রেশন ফাংশন ---
// ==========================================================
async function checkPendingBooking() {
    const bookingId = sessionStorage.getItem('pending_booking_id');
    if (!bookingId || !activeShopId) return;

    try {
        const docRef = doc(db, 'shops', activeShopId, 'bookings', bookingId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.status === 'Billed') {
                sessionStorage.removeItem('pending_booking_id');
                return;
            }

            bookingData = { id: docSnap.id, ...data };
            customerNameInput.value = bookingData.customerName || '';
            customerPhoneInput.value = bookingData.phone || '';
            
            alert(`Booking Detected for: ${bookingData.customerName}\nAdvance Paid: ₹${bookingData.advancePaid}`);
            updateAllTotals();
        }
    } catch (error) {
        console.error("Error loading booking:", error);
    }
}

async function initializeProducts() {
    if (!activeShopId) return;
    categoryProductListContainer.innerHTML = '<p class="loading-message">Loading products...</p>';
    try {
        const inventoryRef = collection(db, 'shops', activeShopId, 'inventory');
        const q = query(inventoryRef, orderBy('name'));
        const querySnapshot = await getDocs(q);
        allProducts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        displayProductsByCategory();
    } catch (error) {
        console.error("Error initializing products: ", error);
        categoryProductListContainer.innerHTML = `<p class="error-message">Failed to load products. Please refresh.</p>`;
    }
}

// --- ইমেজ সহ প্রোডাক্ট ডিসপ্লে ফাংশন ---
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

            // ইমেজ লজিক: যদি ইমেজ থাকে দেখাবে, না থাকলে প্লেসহোল্ডার
            const imageHtml = product.imageUrl 
                ? `<div class="product-img-wrapper"><img src="${product.imageUrl}" alt="${product.name}" loading="lazy"></div>`
                : `<div class="product-img-wrapper no-img"><span>No Img</span></div>`;

            productCard.innerHTML = `
                ${imageHtml}
                <div class="product-info-content">
                    <span class="product-card-name">${product.name}</span>
                    <span class="product-card-price">₹${(product.sellingPrice || 0).toFixed(2)}</span>
                    <div class="product-card-stock ${product.stock <= 10 ? 'low-stock' : ''}">Stock: ${product.stock}</div>
                </div>
            `;
            productGrid.appendChild(productCard);
        });
        
        categoryGroup.appendChild(productGrid);
        categoryProductListContainer.appendChild(categoryGroup);
    });
}

// =========================================================================================
// === প্রোডাক্ট সার্চ এবং বারকোড হ্যান্ডলিং (ইমেজ সহ) ===
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
            
            // সার্চ রেজাল্টে ছোট থাম্বনেইল
            const thumbHtml = product.imageUrl 
                ? `<img src="${product.imageUrl}" class="search-thumb" alt="img">` 
                : `<span class="search-thumb-placeholder"></span>`;

            div.innerHTML = `
                <div class="search-item-left">
                    ${thumbHtml}
                    <span>${product.name}</span>
                </div>
                <span>₹${(product.sellingPrice || 0).toFixed(2)}</span>
            `;
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
        alert(`❌ '${product.name}' স্টক শেষ (Out of Stock)!`);
        return;
    }
    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
        if (existingItem.quantity < product.stock) {
            existingItem.quantity++;
            playBeep();
        } else {
            alert(`⚠️ স্টকে মাত্র ${product.stock} টি আছে!`);
            return;
        }
    } else {
        cart.push({ ...product, quantity: 1 });
        playBeep();
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
                <div class="item-info">
                    <span class="item-name">${item.name}</span>
                    <span class="item-price">₹${(item.sellingPrice || 0).toFixed(2)}</span>
                </div>
                <div class="item-controls">
                    <button class="quantity-btn decrease-btn" data-id="${item.id}">-</button>
                    <input type="number" class="quantity-input" value="${item.quantity}" data-id="${item.id}">
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
            alert(`⚠️ স্টকে মাত্র ${productFromStock.stock} টি আছে!`);
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
        const qtyInput = el.querySelector('.quantity-input');
        const productId = qtyInput.dataset.id;

        qtyInput.onchange = (e) => {
            let newQty = parseInt(e.target.value);
            const productFromStock = allProducts.find(p => p.id === productId);
            
            if (isNaN(newQty) || newQty <= 0) {
                cart = cart.filter(i => i.id !== productId);
            } else if (newQty > productFromStock.stock) {
                alert(`⚠️ স্টকে মাত্র ${productFromStock.stock} টি আছে!`);
                newQty = productFromStock.stock;
            }
            
            const item = cart.find(i => i.id === productId);
            if (item) item.quantity = newQty;
            updateCartDisplay();
        };

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
    
    const taxableAmount = subtotal - discountAmount;
    
    const gstRate = parseFloat(document.getElementById('gst-rate-select').value);
    const totalGst = taxableAmount * (gstRate / 100);
    const cgst = totalGst / 2;
    const sgst = totalGst / 2;
    
    const total = taxableAmount + totalGst;

    let advancePaid = 0;
    const advanceRow = document.getElementById('advance-row');
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

    const payableTotal = Math.max(0, total - advancePaid);
    currentTotals = { subtotal, discount: discountAmount, tax: totalGst, total, advancePaid, payableTotal };

    footerTotalAmountEl.textContent = `₹${total.toFixed(2)}`;
    modalSubtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
    modalTotalAmountEl.textContent = `₹${payableTotal.toFixed(2)}`;
    
    const gstSplitDisplay = document.getElementById('gst-split-display');
    const cgstAmtEl = document.getElementById('cgst-amt');
    const sgstAmtEl = document.getElementById('sgst-amt');
    
    if (gstRate > 0) {
        if (gstSplitDisplay) gstSplitDisplay.classList.remove('hidden');
        if (cgstAmtEl) cgstAmtEl.textContent = `₹${cgst.toFixed(2)}`;
        if (sgstAmtEl) sgstAmtEl.textContent = `₹${sgst.toFixed(2)}`;
    } else {
        if (gstSplitDisplay) gstSplitDisplay.classList.add('hidden');
    }

    updatePaymentDetails();
}

function updatePaymentDetails() {
    const amountToPay = currentTotals.payableTotal;

    if (selectedPaymentMethod === 'cash') {
        const cashReceived = parseFloat(cashReceivedInput.value);
        let returnAmount = 0;
        if (!isNaN(cashReceived) && cashReceived >= amountToPay) {
            returnAmount = cashReceived - amountToPay;
        }
        returnAmountDisplay.textContent = `₹${returnAmount.toFixed(2)}`;
    } else if (selectedPaymentMethod === 'part-payment') {
        validatePartPayment();
    }
    validateFinalBillButton();
}

function validatePartPayment() {
    if (selectedPaymentMethod !== 'part-payment') return true;

    const pCash = parseFloat(document.getElementById('part-cash').value) || 0;
    const pUpi = parseFloat(document.getElementById('part-upi').value) || 0;
    const pCard = parseFloat(document.getElementById('part-card').value) || 0;
    
    const totalEntered = pCash + pUpi + pCard;
    const grandTotal = currentTotals.payableTotal;

    document.getElementById('part-total-entered').textContent = `₹${totalEntered.toFixed(2)}`;
    
    const msgEl = document.getElementById('part-status-msg');

    if (Math.abs(totalEntered - grandTotal) < 0.01) {
        msgEl.textContent = "✅ Amount Matched!";
        msgEl.style.color = "green";
        return true;
    } else if (totalEntered > grandTotal) {
        msgEl.textContent = `⚠️ Excess: ₹${(totalEntered - grandTotal).toFixed(2)}`;
        msgEl.style.color = "orange";
        return false;
    } else {
        msgEl.textContent = `❌ Need ₹${(grandTotal - totalEntered).toFixed(2)} more`;
        msgEl.style.color = "red";
        return false;
    }
}

function setupPartPaymentAutoCalc() {
    const pCashInput = document.getElementById('part-cash');
    const pUpiInput = document.getElementById('part-upi');
    const pCardInput = document.getElementById('part-card');

    pCashInput.addEventListener('input', () => {
        const cash = parseFloat(pCashInput.value) || 0;
        const grandTotal = currentTotals.payableTotal;
        const remaining = Math.max(0, grandTotal - cash);
        pUpiInput.value = remaining.toFixed(2);
        pCardInput.value = 0;
        validatePartPayment();
    });
}

function validateFinalBillButton() {
    const generateBtn = document.getElementById('generate-bill-btn');
    if (!generateBtn) return;

    let isValid = false;
    const amountToPay = currentTotals.payableTotal;

    if (cart.length > 0) {
        if (selectedPaymentMethod === 'part-payment') {
            const pCashEl = document.getElementById('part-cash');
            const pUpiEl = document.getElementById('part-upi');
            const pCardEl = document.getElementById('part-card');
            
            const pCash = pCashEl ? parseFloat(pCashEl.value) || 0 : 0;
            const pUpi = pUpiEl ? parseFloat(pUpiEl.value) || 0 : 0;
            const pCard = pCardEl ? parseFloat(pCardEl.value) || 0 : 0;
            const totalEntered = pCash + pUpi + pCard;
            
            isValid = Math.abs(totalEntered - amountToPay) < 0.01;
        } else if (selectedPaymentMethod === 'cash') {
            const cashReceivedEl = document.getElementById('cash-received');
            const cashReceived = cashReceivedEl ? parseFloat(cashReceivedEl.value) : 0;
            isValid = isNaN(cashReceived) || cashReceived >= amountToPay;
        } else {
            isValid = true;
        }
    }

    generateBtn.disabled = !isValid;
    
    if (isValid) {
        generateBtn.style.background = "#28a745";
        generateBtn.style.opacity = "1";
        generateBtn.style.cursor = "pointer";
    } else {
        generateBtn.style.background = "#a5d6a7";
        generateBtn.style.opacity = "0.6";
        generateBtn.style.cursor = "not-allowed";
    }
}

// ==========================================================
// --- বিল নম্বর জেনারেশন ---
// ==========================================================
async function getNextBillNumber() {
    if (!activeShopId) throw new Error("User not authenticated.");
    const counterRef = doc(db, 'shops', activeShopId, 'metadata', 'counters');
    
    try {
        return await runTransaction(db, async transaction => {
            const counterDoc = await transaction.get(counterRef);
            let lastBillNumber = 0;
            if (counterDoc.exists()) {
                const data = counterDoc.data();
                lastBillNumber = data.lastBillNumber || 0;
            }
            if (lastBillNumber < 999) lastBillNumber = 999;
            const nextBillNumber = lastBillNumber + 1;
            transaction.set(counterRef, { lastBillNumber: nextBillNumber }, { merge: true });
            return String(nextBillNumber);
        });
    } catch (error) {
        console.error("Error getting next bill number:", error);
        return `${Date.now().toString()}`;
    }
}

async function generateFinalBill() {
    if (!preCheckoutValidation()) return;
    generateBillBtn.disabled = true;
    generateBillBtn.textContent = 'Processing...';

    try {
        const newBillNo = await getNextBillNumber();
        const gstRate = parseFloat(document.getElementById('gst-rate-select').value);
        const cgst = parseFloat(document.getElementById('cgst-amt').textContent.replace('₹','')) || 0;
        const sgst = parseFloat(document.getElementById('sgst-amt').textContent.replace('₹','')) || 0;
        
        const sale = {
            billNo: newBillNo,
            items: cart.map(item => ({
                id: item.id, 
                name: item.name, 
                quantity: item.quantity,
                price: item.sellingPrice || 0, 
                category: item.category || 'N/A',
                costPrice: item.costPrice || item.purchasePrice || 0
            })),
            subtotal: currentTotals.subtotal,
            discount: currentTotals.discount,
            tax: currentTotals.tax,
            total: currentTotals.total,
            advanceAdjusted: currentTotals.advancePaid,
            finalPaidAmount: currentTotals.payableTotal,
            paymentMethod: selectedPaymentMethod,
            gstApplied: gstRate > 0,
            gstData: {
                rate: gstRate,
                cgst: cgst,
                sgst: sgst,
                totalGst: currentTotals.tax
            },
            customerDetails: { 
                name: customerNameInput.value.trim() || 'Walk-in Customer', 
                phone: customerPhoneInput.value.trim(), 
                address: customerAddressInput.value.trim() 
            },
            createdAt: serverTimestamp(),
            discountDetails: { 
                type: discountTypeSelect.value, 
                value: parseFloat(discountValueInput.value) || 0 
            },
            bookingId: bookingData ? bookingData.id : null
        };

        const amountToPay = currentTotals.payableTotal;

        if (sale.paymentMethod === 'cash') {
            const cashReceived = parseFloat(cashReceivedInput.value);
            const finalCashReceived = isNaN(cashReceived) ? amountToPay : cashReceived;
            sale.paymentBreakdown = { 
                cashReceived: finalCashReceived, 
                changeReturned: finalCashReceived - amountToPay 
            };
        } else if (sale.paymentMethod === 'part-payment') {
            sale.paymentBreakdown = {
                cash: parseFloat(document.getElementById('part-cash').value) || 0,
                online: parseFloat(document.getElementById('part-upi').value) || 0,
                card: parseFloat(document.getElementById('part-card').value) || 0
            };
        }

        const batch = writeBatch(db);
        const newSaleRef = doc(collection(db, 'shops', activeShopId, 'sales'));
        batch.set(newSaleRef, sale);
        cart.forEach(item => batch.update(doc(db, 'shops', activeShopId, 'inventory', item.id), { stock: increment(-item.quantity) }));
        
        if(bookingData && bookingData.id) {
            const bookingRef = doc(db, 'shops', activeShopId, 'bookings', bookingData.id);
            batch.update(bookingRef, { status: 'Billed' });
        }

        await batch.commit();

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
    const amountToPay = currentTotals.payableTotal;

    if (selectedPaymentMethod === 'cash') {
        const cashReceived = parseFloat(cashReceivedInput.value);
        if (!isNaN(cashReceived) && cashReceived < amountToPay) {
            alert("Cash received is less than payable amount.");
            cashReceivedInput.focus();
            return false;
        }
    }
    return true;
}

function resetAfterSale() {
    cart = [];
    checkoutModal.classList.add('hidden');
    [customerNameInput, customerPhoneInput, customerAddressInput, discountValueInput, cashReceivedInput, productSearchInput].forEach(input => input.value = '');
    ['part-cash', 'part-upi', 'part-card'].forEach(id => document.getElementById(id).value = '');
    discountTypeSelect.value = 'percent';
    document.getElementById('gst-rate-select').value = '0';
    selectedPaymentMethod = 'cash';
    document.querySelectorAll('.pay-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.pay-btn[data-method="cash"]').classList.add('active');
    document.getElementById('cash-calc-area').classList.remove('hidden');
    document.getElementById('part-payment-calc-area').classList.add('hidden');
    const advanceRow = document.getElementById('advance-row');
    if(advanceRow) advanceRow.style.display = 'none';
    updateCartDisplay();
}

// ==========================================================
// --- Hold/Unsettled Bill Functions ---
// ==========================================================
async function holdCurrentBill() {
    if (cart.length === 0) {
        alert("Cart is empty!");
        return;
    }
    
    const billData = {
        items: cart,
        subtotal: currentTotals.subtotal,
        discount: currentTotals.discount,
        tax: currentTotals.tax,
        total: currentTotals.total,
        customerDetails: {
            name: customerNameInput.value || 'Walk-in Customer',
            phone: customerPhoneInput.value || ''
        },
        status: 'unsettled',
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, 'shops', activeShopId, 'unsettled_bills'), billData);
        alert("Bill put on HOLD.");
        resetAfterSale();
    } catch (e) {
        console.error("Error holding bill:", e);
        alert("Failed to hold bill.");
    }
}

function listenUnsettledBills() {
    const q = query(collection(db, 'shops', activeShopId, 'unsettled_bills'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snapshot) => {
        const count = snapshot.size;
        document.getElementById('unsettled-count').textContent = count;
        document.getElementById('unsettled-dot').style.display = count > 0 ? 'block' : 'none';
        renderUnsettledList(snapshot);
    });
}

function renderUnsettledList(snapshot) {
    const tbody = document.getElementById('unsettled-list-body');
    tbody.innerHTML = '';
    
    if (snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">No pending bills</td></tr>';
        return;
    }
    
    snapshot.forEach(docSnap => {
        const bill = docSnap.data();
        const time = bill.createdAt ? bill.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Now';
        const itemsSummary = bill.items.map(i => i.name).join(', ').substring(0, 30) + '...';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${time}</td>
            <td>${bill.customerDetails.name}</td>
            <td><small>${itemsSummary}</small></td>
            <td><strong>₹${bill.total.toFixed(2)}</strong></td>
            <td>
                <button class="btn-sm btn-success" onclick="window.finalizeUnsettled('${docSnap.id}')">Pay</button>
                <button class="btn-sm btn-danger" onclick="window.deleteUnsettled('${docSnap.id}')">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function finalizeUnsettled(billId) {
    try {
        const billRef = doc(db, 'shops', activeShopId, 'unsettled_bills', billId);
        const billSnap = await getDoc(billRef);
        
        if (!billSnap.exists()) {
            alert("Bill not found!");
            return;
        }
        
        const billData = billSnap.data();
        cart = billData.items;
        customerNameInput.value = billData.customerDetails.name || '';
        customerPhoneInput.value = billData.customerDetails.phone || '';
        
        updateCartDisplay();
        document.getElementById('unsettled-modal').classList.add('hidden');
        checkoutModal.classList.remove('hidden');
        
        await deleteDoc(billRef);
    } catch (e) {
        console.error("Error finalizing unsettled bill:", e);
        alert("Failed to load bill.");
    }
}

async function deleteUnsettled(billId) {
    if (!confirm("Delete this pending bill?")) return;
    
    try {
        await deleteDoc(doc(db, 'shops', activeShopId, 'unsettled_bills', billId));
    } catch (e) {
        console.error("Error deleting unsettled bill:", e);
        alert("Failed to delete bill.");
    }
}

async function autoSettleOldBills() {
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);

    const q = query(collection(db, 'shops', activeShopId, 'unsettled_bills'), where('createdAt', '<', startOfToday));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
        const batch = writeBatch(db);
        snapshot.forEach(billDoc => {
            const data = billDoc.data();
            const saleRef = doc(collection(db, 'shops', activeShopId, 'sales'));
            batch.set(saleRef, { 
                ...data, 
                status: 'completed', 
                paymentMethod: 'cash', 
                settledAt: serverTimestamp(), 
                isAutoSettled: true,
                billNo: `AUTO-${Date.now()}`
            });
            batch.delete(billDoc.ref);
        });
        await batch.commit();
        alert(`✅ ${snapshot.size} forgotten bills from yesterday settled as CASH.`);
    }
}

async function manualSettleAll() {
    const q = query(collection(db, 'shops', activeShopId, 'unsettled_bills'));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        alert("No pending bills to settle.");
        return;
    }

    if (!confirm(`Settle all ${snapshot.size} pending bills as CASH?`)) return;

    const batch = writeBatch(db);
    snapshot.forEach(billDoc => {
        const data = billDoc.data();
        const saleRef = doc(collection(db, 'shops', activeShopId, 'sales'));
        batch.set(saleRef, { 
            ...data, 
            status: 'completed', 
            paymentMethod: 'cash', 
            settledAt: serverTimestamp(), 
            isAutoSettled: true,
            billNo: `MANUAL-${Date.now()}`
        });
        batch.delete(billDoc.ref);
    });
    
    try {
        await batch.commit();
        alert(`✅ ${snapshot.size} bills settled successfully.`);
    } catch (e) {
        console.error("Error settling bills:", e);
        alert("Failed to settle bills.");
    }
}

// Make functions globally accessible
window.finalizeUnsettled = finalizeUnsettled;
window.deleteUnsettled = deleteUnsettled;

// ==========================================================
// --- Shift Summary Function ---
// ==========================================================
async function showShiftSummary() {
    const summaryModal = document.getElementById('summary-modal');
    const summaryContent = document.getElementById('summary-content');
    summaryModal.classList.remove('hidden');
    summaryContent.innerHTML = '<p>Calculating accurate cash flow...</p>';
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayStart = Timestamp.fromDate(today);
    
    try {
        const salesQ = query(collection(db, 'shops', activeShopId, 'sales'), where('createdAt', '>=', todayStart));
        const salesSnap = await getDocs(salesQ);
        
        let totals = { cash: 0, online: 0, total: 0 };
        
        salesSnap.forEach(doc => {
            const data = doc.data();
            
            if (data.status === 'canceled') return;

            const billTotal = data.total || 0;
            totals.total += billTotal;

            if (data.paymentMethod === 'part-payment' && data.paymentBreakdown) {
                totals.cash += (parseFloat(data.paymentBreakdown.cash) || 0);
                totals.online += (parseFloat(data.paymentBreakdown.upi) || 0) + 
                                 (parseFloat(data.paymentBreakdown.online) || 0) + 
                                 (parseFloat(data.paymentBreakdown.card) || 0);
            } else if (data.paymentMethod === 'cash') {
                totals.cash += billTotal;
            } else {
                totals.online += billTotal;
            }
        });

        const expenseQ = query(collection(db, 'shops', activeShopId, 'expenses'), where('date', '>=', todayStart));
        const expSnap = await getDocs(expenseQ);
        
        let boxExpenses = 0;
        expSnap.forEach(doc => {
            const expData = doc.data();
            const cat = expData.category ? expData.category.toLowerCase() : '';
            const source = expData.source || 'box';
            if (cat !== 'inventory_purchase' && !cat.includes('inventory') && source === 'box') {
                boxExpenses += (expData.amount || 0);
            }
        });

        summaryContent.innerHTML = `
            <div style="font-size: 15px; line-height: 1.8;">
                <div class="summary-row"><span>💵 Today's Cash Sales:</span> <strong>+ ₹${totals.cash.toFixed(2)}</strong></div>
                <div class="summary-row" style="color: #dc3545;"><span>📦 Shop Box Expenses:</span> <strong>- ₹${boxExpenses.toFixed(2)}</strong></div>
                <div class="summary-row" style="border-top: 1px solid #eee; padding-top: 5px;">
                    <span>📊 Net Cash Change:</span> <strong>₹${(totals.cash - boxExpenses).toFixed(2)}</strong>
                </div>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 15px; border: 1px solid #eef2ff;">
                    <label style="font-size: 12px; color: #666;">Opening Cash in Box:</label>
                    <input type="number" id="opening-cash-input" placeholder="0.00" style="width: 100%; padding: 8px; margin-top: 5px; border: 1px solid #ddd; border-radius: 5px; font-weight: bold;">
                    
                    <div class="summary-row" style="margin-top: 15px; font-size: 18px; color: #28a745;">
                        <span>💰 Cash in Hand:</span> <strong id="final-cash-display">₹${(totals.cash - boxExpenses).toFixed(2)}</strong>
                    </div>
                </div>

                <hr>
                <div class="summary-row"><span>🌐 Online Total (UPI+Card):</span> <strong>₹${totals.online.toFixed(2)}</strong></div>
                <div class="summary-row" style="font-weight: 800; font-size: 18px; color: #4361ee; margin-top: 10px;">
                    <span>🚀 Grand Total Sales:</span> <strong>₹${totals.total.toFixed(2)}</strong>
                </div>
            </div>
        `;

        const openingInput = document.getElementById('opening-cash-input');
        const finalDisplay = document.getElementById('final-cash-display');
        openingInput.addEventListener('input', () => {
            const opening = parseFloat(openingInput.value) || 0;
            finalDisplay.textContent = `₹${(opening + totals.cash - boxExpenses).toFixed(2)}`;
        });

    } catch (e) { 
        console.error(e);
        summaryContent.innerHTML = '<p style="color:red;">Error loading summary.</p>';
    }
}

function handlePaymentMethodChange() {
    updateAllTotals();
}

// ==========================================================
// --- ইভেন্ট লিসেনার ---
// ==========================================================
function setupEventListeners() {
    productSearchInput.addEventListener('input', handleSearch);

    document.addEventListener('keydown', (e) => {
        const activeEl = document.activeElement;
        const isTypingInInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA';

        if (e.key === 'F2') {
            e.preventDefault();
            productSearchInput.focus();
        }
        if (e.key === 'F4') {
            e.preventDefault();
            holdCurrentBill();
        }
        if (e.key === 'F8') {
            e.preventDefault();
            if (proceedToCheckoutBtn && !proceedToCheckoutBtn.disabled) {
                proceedToCheckoutBtn.click();
            }
        }

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
            if(!customerNameInput.value) customerNameInput.focus();
        }
    });

    closeModalBtn.addEventListener('click', () => checkoutModal.classList.add('hidden'));
    checkoutModal.addEventListener('click', e => {
        if (e.target === checkoutModal) {
            checkoutModal.classList.add('hidden');
        }
    });
    
    [discountTypeSelect, discountValueInput, cashReceivedInput].forEach(el => {
        el.addEventListener('input', updateAllTotals);
    });
    
    ['part-cash', 'part-upi', 'part-card'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            updateAllTotals();
            validateFinalBillButton();
        });
    });
    
    document.querySelectorAll('.part-input').forEach(input => {
        input.addEventListener('input', updateAllTotals);
    });
    
    setupPartPaymentAutoCalc();
    
    document.getElementById('gst-rate-select').addEventListener('change', updateAllTotals);
    
    document.querySelectorAll('.pay-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedPaymentMethod = btn.dataset.method;
            document.getElementById('cash-calc-area').classList.toggle('hidden', selectedPaymentMethod !== 'cash');
            const partPaymentArea = document.getElementById('part-payment-calc-area');
            if (partPaymentArea) partPaymentArea.classList.toggle('hidden', selectedPaymentMethod !== 'part-payment');
            updateAllTotals();
            validateFinalBillButton();
        });
    });
    
    generateBillBtn.addEventListener('click', generateFinalBill);
    
    document.getElementById('btn-hold-bill').addEventListener('click', holdCurrentBill);
    
    document.getElementById('open-unsettled-btn').addEventListener('click', () => {
        document.getElementById('unsettled-modal').classList.remove('hidden');
    });
    document.getElementById('close-unsettled-modal').addEventListener('click', () => {
        document.getElementById('unsettled-modal').classList.add('hidden');
    });
    
    document.getElementById('btn-auto-settle').addEventListener('click', manualSettleAll);
    
    document.getElementById('btn-shift-summary').addEventListener('click', showShiftSummary);
    document.getElementById('close-summary-modal').addEventListener('click', () => {
        document.getElementById('summary-modal').classList.add('hidden');
    });
}