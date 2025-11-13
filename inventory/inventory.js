// inventory/inventory.js

// firebase-config.js থেকে db অবজেক্টটি ইম্পোর্ট করা হচ্ছে
import { db } from '../js/firebase-config.js'; 
import { collection, onSnapshot, doc, deleteDoc, updateDoc, orderBy, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- DOM Elements ---
const inventoryBody = document.getElementById('inventory-body');
const searchInput = document.getElementById('search-inventory');
const categoryFilter = document.getElementById('category-filter');
const paginationContainer = document.getElementById('pagination-container');
const editModal = document.getElementById('edit-modal');
const editForm = document.getElementById('edit-form');
const closeModalBtn = document.querySelector('.close-button');

// --- Global State ---
let allProducts = []; // Firebase থেকে আসা সব প্রোডাক্টের লোকাল কপি
let filteredProducts = []; // সার্চ ও ফিল্টারের পর পাওয়া প্রোডাক্ট
let uniqueCategories = new Set(); // ডুপ্লিকেট ছাড়া ক্যাটাগরি রাখার জন্য
const ROWS_PER_PAGE = 10; // প্রতি পৃষ্ঠায় কয়টি প্রোডাক্ট দেখানো হবে
let currentPage = 1;
const LOW_STOCK_THRESHOLD = 10; // লো-স্টক হাইলাইটের জন্য সংখ্যা

// প্রোডাক্টগুলোকে নাম অনুযায়ী সাজানোর জন্য একটি কোয়েরি তৈরি করা
const productsQuery = query(collection(db, "products"), orderBy("name"));

// Firestore থেকে রিয়েল-টাইম আপডেটের জন্য লিসেন করা
const unsubscribe = onSnapshot(productsQuery, 
    (querySnapshot) => {
        allProducts = []; 
        uniqueCategories.clear(); // প্রতিবার ক্যাটাগরি সেট রিসেট করা
        
        querySnapshot.forEach((doc) => {
            const product = { id: doc.id, ...doc.data() };
            allProducts.push(product);
            if (product.category) {
                uniqueCategories.add(product.category);
            }
        });

        populateCategoryFilter(); // ক্যাটাগরি ফিল্টার আপডেট করা
        applyFiltersAndRender(); // নতুন ডেটা দিয়ে সবকিছু আবার রেন্ডার করা
    }, 
    (error) => {
        console.error("Error fetching inventory: ", error);
        inventoryBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Failed to load data. Please check connection.</td></tr>';
    }
);

// সেন্ট্রাল রেন্ডারিং ফাংশন: সার্চ, ফিল্টার ও পেজিনেশন প্রয়োগ করে
function applyFiltersAndRender() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedCategory = categoryFilter.value;

    // ১. সার্চ এবং ক্যাটাগরি দিয়ে ফিল্টার করা
    filteredProducts = allProducts.filter(p => {
        const matchesSearch = searchTerm === '' ||
            (p.name && p.name.toLowerCase().includes(searchTerm)) || 
            (p.barcode && p.barcode.toLowerCase().includes(searchTerm));
        
        const matchesCategory = selectedCategory === '' || p.category === selectedCategory;

        return matchesSearch && matchesCategory;
    });

    // ২. পেজিনেশন বাটন তৈরি করা
    setupPagination();

    // ৩. বর্তমান পেজের জন্য প্রোডাক্টগুলো ভাগ করা
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    const endIndex = startIndex + ROWS_PER_PAGE;
    const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

    // ৪. টেবিল রেন্ডার করা
    renderTable(paginatedProducts);
}

// শুধু টেবিল রেন্ডার করার ফাংশন
function renderTable(products) {
    inventoryBody.innerHTML = '';

    if (products.length === 0) {
        inventoryBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No products found.</td></tr>';
        return;
    }

    products.forEach(product => {
        const row = document.createElement('tr');
        if (product.stock <= LOW_STOCK_THRESHOLD) {
            row.classList.add('low-stock');
        }

        // *** প্রধান পরিবর্তন এখানে: Print বাটন যোগ করা হয়েছে ***
        row.innerHTML = `
            <td>${product.name || 'N/A'}</td>
            <td>${product.category || 'N/A'}</td>
            <td>${(typeof product.cp === 'number') ? product.cp.toFixed(2) : '0.00'}</td>
            <td>${(typeof product.sp === 'number') ? product.sp.toFixed(2) : '0.00'}</td>
            <td>${product.stock || 0}</td>
            <td>${product.barcode || 'N/A'}</td>
            <td class="action-buttons">
                <button class="btn-edit action-btn" data-id="${product.id}">Edit</button>
                <button class="btn-danger action-btn" data-id="${product.id}">Delete</button>
                <button class="btn-print action-btn" data-barcode="${product.barcode}" data-name="${product.name}" data-price="${product.sp || 0}">Print</button>
            </td>
        `;
        inventoryBody.appendChild(row);
    });
}

// ক্যাটাগরি ফিল্টার ড্রপডাউন তৈরি করা
function populateCategoryFilter() {
    const selectedValue = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="">All Categories</option>';
    
    Array.from(uniqueCategories).sort().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });

    categoryFilter.value = selectedValue; // আগের সিলেক্ট করা ভ্যালু ঠিক রাখা
}

// পেজিনেশন বাটন তৈরি ও সেটআপ করা
function setupPagination() {
    paginationContainer.innerHTML = '';
    const pageCount = Math.ceil(filteredProducts.length / ROWS_PER_PAGE);

    if (pageCount > 1) {
        for (let i = 1; i <= pageCount; i++) {
            const btn = document.createElement('button');
            btn.innerText = i;
            if (i === currentPage) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                currentPage = i;
                applyFiltersAndRender();
            });
            paginationContainer.appendChild(btn);
        }
    }
}

// --- Event Listeners ---

// সার্চ ও ফিল্টার এর জন্য
searchInput.addEventListener('input', () => {
    currentPage = 1; // নতুন সার্চে প্রথম পেজে ফিরে যাওয়া
    applyFiltersAndRender();
});
categoryFilter.addEventListener('change', () => {
    currentPage = 1; // ফিল্টার পরিবর্তনে প্রথম পেজে ফিরে যাওয়া
    applyFiltersAndRender();
});

// এডিট, ডিলিট এবং প্রিন্ট বাটনের জন্য ইভেন্ট ডেলিগেশন
inventoryBody.addEventListener('click', async (e) => {
    const target = e.target;

    // ডিলিট বাটন ক্লিক হলে
    if (target.classList.contains('btn-danger')) {
        const productId = target.dataset.id;
        if (confirm('Are you sure you want to delete this product?')) {
            try {
                await deleteDoc(doc(db, "products", productId));
                // onSnapshot স্বয়ংক্রিয়ভাবে UI আপডেট করবে
            } catch (error) {
                console.error("Error deleting product: ", error);
                alert('Failed to delete product.');
            }
        }
    }
    
    // এডিট বাটন ক্লিক হলে
    if (target.classList.contains('btn-edit')) {
        const productId = target.dataset.id;
        const product = allProducts.find(p => p.id === productId);
        if (product) {
            document.getElementById('edit-product-id').value = product.id;
            document.getElementById('edit-name').value = product.name || '';
            document.getElementById('edit-category').value = product.category || '';
            document.getElementById('edit-cp').value = product.cp || 0;
            document.getElementById('edit-sp').value = product.sp || 0;
            document.getElementById('edit-stock').value = product.stock || 0;
            document.getElementById('edit-barcode').value = product.barcode || '';
            editModal.style.display = 'block';
        }
    }
    
    // *** নতুন পরিবর্তন: প্রিন্ট বাটন ক্লিক হলে ***
    if (target.classList.contains('btn-print')) {
        const barcodeValue = target.dataset.barcode;
        const productName = target.dataset.name;
        const productPrice = parseFloat(target.dataset.price).toFixed(2);

        if (barcodeValue && barcodeValue !== 'N/A') {
            printSingleBarcode(barcodeValue, productName, productPrice);
        } else {
            alert('Barcode is not available for this product.');
        }
    }
});

// মডাল বন্ধ করার ইভেন্ট
closeModalBtn.addEventListener('click', () => editModal.style.display = 'none');
window.addEventListener('click', (e) => {
    if (e.target === editModal) {
        editModal.style.display = 'none';
    }
});

// এডিট ফর্ম সাবমিট হলে
editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const productId = document.getElementById('edit-product-id').value;
    
    const updatedData = {
        name: document.getElementById('edit-name').value,
        category: document.getElementById('edit-category').value,
        cp: parseFloat(document.getElementById('edit-cp').value),
        sp: parseFloat(document.getElementById('edit-sp').value),
        stock: parseInt(document.getElementById('edit-stock').value),
        barcode: document.getElementById('edit-barcode').value,
    };

    const saveButton = editForm.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {
        await updateDoc(doc(db, "products", productId), updatedData);
        editModal.style.display = 'none';
    } catch (error) {
        console.error("Error updating product: ", error);
        alert('Failed to update product.');
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Changes';
    }
});


// *** নতুন ফাংশন: একটিমাত্র বারকোড প্রিন্ট করার জন্য ***
function printSingleBarcode(barcode, name, price) {
    const printWindow = window.open('', '_blank', 'width=400,height=300');
    printWindow.document.write(`
        <html>
            <head>
                <title>Print Barcode</title>
                <style>
                    @media print {
                        body { margin: 0; }
                        @page { size: 3in 2in; margin: 5px; } /* Typical label size */
                    }
                    body { font-family: sans-serif; text-align: center; }
                    .barcode-wrapper { display: inline-block; padding: 10px; }
                    .product-info { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
                    .product-price { font-size: 13px; margin-top: 5px; }
                </style>
            </head>
            <body>
                <div class="barcode-wrapper">
                    <div class="product-info">${name}</div>
                    <svg id="barcode-svg"></svg>
                    <div class="product-price">Price: ${price}</div>
                </div>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
                <script>
                    try {
                        JsBarcode("#barcode-svg", "${barcode}", {
                            format: "CODE128",
                            displayValue: true,
                            fontSize: 14,
                            width: 1.5,
                            height: 40,
                            margin: 10
                        });
                        window.onafterprint = function() { window.close(); };
                        window.print();
                    } catch (e) {
                        console.error("JsBarcode error:", e);
                        document.body.innerHTML = "Error generating barcode. The value might be invalid.";
                    }
                <\/script>
            </body>
        </html>
    `);
    printWindow.document.close();
}