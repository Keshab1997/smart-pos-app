// inventory/inventory.js

// firebase-config.js থেকে db অবজেক্টটি ইম্পোর্ট করা হচ্ছে
import { db } from '../js/firebase-config.js'; 
// firebase-config.js এর সাথে মিলিয়ে SDK ভার্সন একই রাখা হয়েছে (e.g., 10.12.2)
import { collection, onSnapshot, doc, deleteDoc, orderBy, query } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const inventoryBody = document.getElementById('inventory-body');
const searchInput = document.getElementById('search-inventory');
let allProducts = []; // সার্চ ও ফিল্টারিংয়ের জন্য লোকাল কপি

// প্রোডাক্টগুলোকে নাম অনুযায়ী সাজানোর জন্য একটি কোয়েরি তৈরি করা
const productsQuery = query(collection(db, "products"), orderBy("name"));

// Firestore থেকে রিয়েল-টাইম আপডেটের জন্য লিসেন করা
const unsubscribe = onSnapshot(productsQuery, 
    // Success callback
    (querySnapshot) => {
        allProducts = []; // রেন্ডার করার আগে অ্যারে খালি করা হচ্ছে
        
        querySnapshot.forEach((doc) => {
            const product = { id: doc.id, ...doc.data() };
            allProducts.push(product);
        });

        renderInventory(allProducts); // নতুন ডেটা দিয়ে টেবিল রেন্ডার করা
    }, 
    // Error callback (উন্নত प्रैक्टिस)
    (error) => {
        console.error("Error fetching inventory: ", error);
        inventoryBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Failed to load data. Please check your connection or permissions.</td></tr>';
    }
);

function renderInventory(products) {
    inventoryBody.innerHTML = ''; // ডুপ্লিকেট এড়ানোর জন্য বর্তমান কনটেন্ট মুছে ফেলা হচ্ছে

    if (products.length === 0) {
        inventoryBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No products found.</td></tr>';
        return;
    }

    products.forEach(product => {
        const row = document.createElement('tr');
        // স্টক ১০ বা তার কম হলে 'low-stock' ক্লাস যোগ করা
        if (product.stock <= 10) {
            row.classList.add('low-stock');
        }

        // ডেটা অনুপস্থিত থাকলেও যেন ইরর না আসে, তার জন্য ডিফল্ট ভ্যালু সেট করা
        const name = product.name || 'N/A';
        const category = product.category || 'N/A';
        const cp = (typeof product.cp === 'number') ? product.cp.toFixed(2) : '0.00';
        const sp = (typeof product.sp === 'number') ? product.sp.toFixed(2) : '0.00';
        const stock = product.stock || 0;
        const barcode = product.barcode || 'N/A';

        row.innerHTML = `
            <td>${name}</td>
            <td>${category}</td>
            <td>${cp}</td>
            <td>${sp}</td>
            <td>${stock}</td>
            <td>${barcode}</td>
            <td>
                <button class="btn btn-danger action-btn" data-id="${product.id}">Delete</button>
            </td>
        `;
        inventoryBody.appendChild(row);
    });
}

// সার্চ ফাংশনালিটি
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    
    if (searchTerm === '') {
        renderInventory(allProducts); // সার্চ ইনপুট খালি থাকলে সব প্রোডাক্ট দেখানো
        return;
    }

    const filteredProducts = allProducts.filter(p => 
        (p.name && p.name.toLowerCase().includes(searchTerm)) || 
        (p.barcode && p.barcode.toLowerCase().includes(searchTerm)) ||
        (p.category && p.category.toLowerCase().includes(searchTerm))
    );

    renderInventory(filteredProducts);
});

// ইভেন্ট ডেলিগেশন ব্যবহার করে ডিলিট ফাংশনালিটি
inventoryBody.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-danger')) {
        const productId = e.target.dataset.id;
        
        if (confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
            const deleteButton = e.target;
            deleteButton.disabled = true; // ডিলিট করার সময় বাটনটি ডিজেবল করে দেওয়া
            deleteButton.textContent = 'Deleting...';

            try {
                const productDocRef = doc(db, "products", productId);
                await deleteDoc(productDocRef);
                // onSnapshot স্বয়ংক্রিয়ভাবে UI আপডেট করে দেবে, তাই এখানে কিছু করার প্রয়োজন নেই
            } catch (error) {
                console.error("Error deleting product: ", error);
                alert('Failed to delete product. Please try again.');
                deleteButton.disabled = false; // ইরর হলে বাটনটি আবার এনাবল করে দেওয়া
                deleteButton.textContent = 'Delete';
            }
        }
    }
});