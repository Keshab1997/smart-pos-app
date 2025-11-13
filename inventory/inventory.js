import { db } from '../js/firebase-config.js';
import { collection, onSnapshot, doc, deleteDoc, orderBy, query } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const inventoryBody = document.getElementById('inventory-body');
const searchInput = document.getElementById('search-inventory');
let allProducts = []; // To store a local copy for searching and filtering

// Create a query to order products, e.g., by name
const productsQuery = query(collection(db, "products"), orderBy("name"));

// Listen for real-time updates from Firestore
onSnapshot(productsQuery, (querySnapshot) => {
    allProducts = [];
    inventoryBody.innerHTML = ''; // Clear the table before rendering
    
    querySnapshot.forEach((doc) => {
        const product = { id: doc.id, ...doc.data() };
        allProducts.push(product);
    });

    renderInventory(allProducts);
});

function renderInventory(products) {
    inventoryBody.innerHTML = ''; // Clear current content to prevent duplicates

    if (products.length === 0) {
        inventoryBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No products found.</td></tr>';
        return;
    }

    products.forEach(product => {
        const row = document.createElement('tr');
        // Add a 'low-stock' class if stock is 10 or less
        if (product.stock <= 10) {
            row.classList.add('low-stock');
        }

        // Safely access properties with default values in case they are missing
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

// Search functionality
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    
    if (searchTerm === '') {
        renderInventory(allProducts); // If search is empty, show all products
        return;
    }

    const filteredProducts = allProducts.filter(p => 
        (p.name && p.name.toLowerCase().includes(searchTerm)) || 
        (p.barcode && p.barcode.toLowerCase().includes(searchTerm)) ||
        (p.category && p.category.toLowerCase().includes(searchTerm))
    );

    renderInventory(filteredProducts);
});

// Delete functionality using event delegation
inventoryBody.addEventListener('click', async (e) => {
    if (e.target.classList.contains('btn-danger')) {
        const productId = e.target.dataset.id;
        
        if (confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
            try {
                // Get a reference to the document to be deleted
                const productDocRef = doc(db, "products", productId);
                // Delete the document
                await deleteDoc(productDocRef);
                // The onSnapshot listener will automatically refresh the UI, so no need to call renderInventory here.
                // console.log("Product deleted successfully");
            } catch (error) {
                console.error("Error deleting product: ", error);
                alert('Failed to delete product. Please try again.');
            }
        }
    }
});