document.addEventListener('DOMContentLoaded', () => {
    // Firebase Firestore ইনিশিয়ালাইজ করা
    const db = firebase.firestore();

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

    let cart = []; // কার্টের জন্য অ্যারে
    let allProducts = []; // সব প্রোডাক্টের তালিকা সংরক্ষণের জন্য অ্যারে

    // দোকানের তথ্য লোড করা
    fetch('../shop-details.html')
        .then(response => response.text())
        .then(html => {
            shopHeaderPlaceholder.innerHTML = html;
        })
        .catch(error => console.error('Error loading shop details:', error));

    // প্রোডাক্ট সার্চ এবং বারকোড স্ক্যানিং-এর জন্য ইভেন্ট লিসেনার
    productSearchInput.addEventListener('keyup', async (e) => {
        const searchText = e.target.value.trim().toLowerCase();

        if (e.key === 'Enter' && searchText.length > 0) {
            e.preventDefault();
            try {
                const snapshot = await db.collection('products').where('barcode', '==', searchText).limit(1).get();
                if (!snapshot.empty) {
                    const doc = snapshot.docs[0];
                    const product = { id: doc.id, ...doc.data() };
                    addToCart(product);
                    productSearchInput.value = '';
                    searchResultsContainer.innerHTML = '';
                    return;
                } else {
                    console.log('No product found with this barcode.');
                }
            } catch (error) {
                console.error("Error fetching product by barcode:", error);
            }
        }
        
        if (searchText.length < 2) {
            searchResultsContainer.innerHTML = '';
            return;
        }

        try {
            const snapshot = await db.collection('products').orderBy('name').startAt(searchText).endAt(searchText + '\uf8ff').limit(10).get();
            searchResultsContainer.innerHTML = '';
            if (snapshot.empty) {
                searchResultsContainer.innerHTML = '<p>No products found.</p>';
                return;
            }
            snapshot.forEach(doc => {
                const product = { id: doc.id, ...doc.data() };
                const productDiv = document.createElement('div');
                productDiv.classList.add('product-item');
                // কারেন্সি সিম্বল পরিবর্তন (₹)
                productDiv.innerHTML = `<span class="name">${product.name}</span> <span class="price">₹${product.sp.toFixed(2)}</span>`;
                productDiv.addEventListener('click', () => {
                    addToCart(product);
                    productSearchInput.value = '';
                    searchResultsContainer.innerHTML = '';
                });
                searchResultsContainer.appendChild(productDiv);
            });
        } catch (error) {
            console.error("Error searching products by name: ", error);
        }
    });

    // ক্যাটাগরি অনুযায়ী প্রোডাক্ট লোড করা
    async function loadAndDisplayProductsByCategory() {
        try {
            const snapshot = await db.collection('products').where('stock', '>', 0).orderBy('category').orderBy('name').get();
            
            if (snapshot.empty) {
                categoryProductListContainer.innerHTML = '<p>No products available in stock.</p>';
                return;
            }

            const productsByCategory = {};
            allProducts = []; // প্রতিবার লোড করার আগে অ্যারে খালি করা
            
            snapshot.forEach(doc => {
                const product = { id: doc.id, ...doc.data() };
                allProducts.push(product);
                
                const category = product.category || 'Uncategorized';

                if (!productsByCategory[category]) {
                    productsByCategory[category] = [];
                }
                productsByCategory[category].push(product);
            });

            categoryProductListContainer.innerHTML = '';
            for (const category in productsByCategory) {
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
                    
                    // কারেন্সি সিম্বল পরিবর্তন (₹)
                    productCard.innerHTML = `
                        <span class="product-card-name">${product.name}</span>
                        <span class="product-card-price">₹${product.sp.toFixed(2)}</span>
                    `;
                    productGrid.appendChild(productCard);
                });

                categoryGroup.appendChild(categoryName);
                categoryGroup.appendChild(productGrid);
                categoryProductListContainer.appendChild(categoryGroup);
            }
        } catch (error) {
            console.error("Error loading products by category: ", error);
            categoryProductListContainer.innerHTML = '<p class="error-message">Failed to load products.</p>';
        }
    }

    // প্রোডাক্ট কার্ডে ক্লিকের জন্য ইভেন্ট লিসেনার
    categoryProductListContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.product-card');
        if (!card) return;

        const productId = card.dataset.productId;
        const productToAdd = allProducts.find(p => p.id === productId);

        if (productToAdd) {
            addToCart(productToAdd);
        }
    });

    // কার্টে প্রোডাক্ট যোগ করার ফাংশন
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

    // কার্ট ডিসপ্লে আপডেট করার ফাংশন
    function updateCartDisplay() {
        cartItemsContainer.innerHTML = '';
        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p class="empty-cart-message">Your cart is empty.</p>';
            checkoutBtn.disabled = true;
        } else {
            cart.forEach((item, index) => {
                const cartItemDiv = document.createElement('div');
                cartItemDiv.classList.add('cart-item');
                // কারেন্সি সিম্বল পরিবর্তন (₹)
                cartItemDiv.innerHTML = `
                    <div class="cart-item-details">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-price">₹${item.sp.toFixed(2)}</div>
                    </div>
                    <div class="cart-item-actions">
                        <input type="number" class="quantity-input" value="${item.quantity}" min="1" max="${item.stock}" data-index="${index}">
                        <button class="remove-btn" data-index="${index}">&times;</button>
                    </div>`;
                cartItemsContainer.appendChild(cartItemDiv);
            });
            checkoutBtn.disabled = false;
        }

        document.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('change', e => {
                const index = e.target.dataset.index;
                const newQuantity = parseInt(e.target.value);
                const item = cart[index];
                
                if (newQuantity > 0 && newQuantity <= item.stock) {
                    item.quantity = newQuantity;
                } else if (newQuantity > item.stock) {
                    alert(`Maximum stock available for ${item.name} is ${item.stock}.`);
                    e.target.value = item.quantity;
                } else {
                    cart.splice(index, 1);
                }
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

    // মোট বিল গণনা করার ফাংশন
    function calculateTotals() {
        const subtotal = cart.reduce((sum, item) => sum + (item.sp * item.quantity), 0);
        const tax = gstToggle.checked ? subtotal * 0.05 : 0;
        const total = subtotal + tax;

        // কারেন্সি সিম্বল পরিবর্তন (₹)
        subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
        taxEl.textContent = `₹${tax.toFixed(2)}`;
        totalAmountEl.textContent = `₹${total.toFixed(2)}`;
    }

    // GST টগল-এর জন্য ইভেন্ট
    gstToggle.addEventListener('change', calculateTotals);

    // চেকআউট বাটন ক্লিক
    checkoutBtn.addEventListener('click', async () => {
        if (cart.length === 0) return;

        checkoutBtn.disabled = true;
        checkoutBtn.textContent = 'Processing...';

        const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
        const subtotal = cart.reduce((sum, item) => sum + (item.sp * item.quantity), 0);
        const tax = gstToggle.checked ? subtotal * 0.05 : 0;
        const total = subtotal + tax;

        const sale = {
            items: cart.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.sp })),
            subtotal, tax, total, paymentMethod,
            gstApplied: gstToggle.checked,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const docRef = await db.collection('sales').add(sale);
            
            const batch = db.batch();
            cart.forEach(item => {
                const productRef = db.collection('products').doc(item.id);
                batch.update(productRef, { stock: firebase.firestore.FieldValue.increment(-item.quantity) });
            });
            await batch.commit();

            // print.html পেজের পাথ আপনার প্রোজেক্ট স্ট্রাকচার অনুযায়ী পরিবর্তন করতে পারেন
            window.open(`print/print.html?saleId=${docRef.id}`, '_blank');

            cart = [];
            updateCartDisplay();
            loadAndDisplayProductsByCategory(); // নতুন স্টক সহ প্রোডাক্ট লিস্ট আবার লোড করা

        } catch (error) {
            console.error("Error during checkout: ", error);
            alert('Checkout failed. Please try again.');
        } finally {
            checkoutBtn.disabled = false;
            checkoutBtn.textContent = 'Generate Bill & Checkout';
        }
    });

    // পেজ লোড হওয়ার পর প্রাথমিক অবস্থা সেট করা
    updateCartDisplay();
    loadAndDisplayProductsByCategory();
});