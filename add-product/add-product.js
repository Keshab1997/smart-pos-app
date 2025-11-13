import { db } from '../js/firebase-config.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const form = document.getElementById('add-product-form');
const statusMessage = document.getElementById('status-message');
const barcodeSection = document.getElementById('barcode-section');
const barcodeDisplay = document.getElementById('barcode-display');
const printBtn = document.getElementById('print-barcode-btn');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = form['product-name'].value;
    const price = parseFloat(form['product-price'].value);
    const stock = parseInt(form['product-stock'].value);
    const barcode = form['product-barcode'].value;

    if (!name || isNaN(price) || isNaN(stock) || !barcode) {
        showStatus('Please fill all fields correctly.', 'error');
        return;
    }

    try {
        // Add a new document with a generated id.
        const docRef = await addDoc(collection(db, "products"), {
            name: name,
            price: price,
            stock: stock,
            barcode: barcode
        });

        showStatus(`Product "${name}" added successfully!`, 'success');
        form.reset();
        
        // Generate and display barcode
        JsBarcode(barcodeDisplay, barcode, {
            format: "CODE128",
            displayValue: true,
            fontSize: 18,
            textMargin: 5
        });
        barcodeSection.classList.remove('hidden');

    } catch (error) {
        console.error("Error adding document: ", error);
        showStatus('Error adding product. Please try again.', 'error');
    }
});

printBtn.addEventListener('click', () => {
    window.print();
});

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = type;
}