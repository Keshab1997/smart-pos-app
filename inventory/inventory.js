import { db } from '../js/firebase-config.js';
import { collection, onSnapshot, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const inventoryBody = document.getElementById('inventory-body');
const searchInput = document.getElementById('search-inventory');
let allProducts = []; // To store a local copy for searching

// Listen for real-time updates from Firestore
onSnapshot(collection(db, "products"), (querySnapshot) => {
    allProducts = [];
    inventoryBody.innerHTML = ''; // Clear the table
    
    querySnapshot.forEach((doc) => {
        const product = { id: doc.id, ...doc.data() };
        allProducts.push(product);
    });

    renderInventory(allProducts);
});

function renderInventory(products) {
    inventoryBody.innerHTML = ''; // Clear current content
    products.forEach(product => {
        const row = document.createElement('tr');
        if (product.stock < 10) {
            row.classList.add('low-stock');
        }

        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.price.toFixed(2)}</td>
            <td>${product.stock}</td>
            <td>${product.barcode}</td>
            <td>
                <button class="btn btn-danger action-btn" data-id="${product.id}">Delete</button>
            </td>
        `;
        inventoryBody.appendChild(row);
    });
}

// Search functionality
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredProducts = allProducts.filter(p => 
        p.name.toLowerCase().includes(searchTerm) || 
        p.barcode.toLowerCase().includes(searchTerm)
    );
    renderInventory(filteredProducts);
});

// Delete functionality using event delegation
inventoryBody.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-danger')) {
        const productId = e.target.dataset.id;
        if (confirm('Are you sure you want to delete this product?')) {
            try {
                await deleteDoc(doc(db, "products", productId));
                // The onSnapshot listener will automatically update the UI
            } catch (error) {
                console.error("Error deleting product: ", error);
                alert('Failed to delete product.');
            }
        }
    }
});