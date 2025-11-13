document.addEventListener('DOMContentLoaded', async () => {
    const db = firebase.firestore();

    // Load shop details
    fetch('../shop-details.html')
        .then(response => response.text())
        .then(html => {
            document.getElementById('shop-details-container').innerHTML = html;
        });

    // Get saleId from URL
    const urlParams = new URLSearchParams(window.location.search);
    const saleId = urlParams.get('saleId');

    if (!saleId) {
        document.body.innerHTML = '<h1>Error: No Sale ID provided.</h1>';
        return;
    }

    try {
        const saleDoc = await db.collection('sales').doc(saleId).get();
        if (!saleDoc.exists) {
            document.body.innerHTML = '<h1>Error: Sale not found.</h1>';
            return;
        }

        const saleData = saleDoc.data();
        
        // Populate bill details
        document.getElementById('bill-no').textContent = saleId;
        const saleDate = saleData.createdAt.toDate();
        document.getElementById('bill-date').textContent = saleDate.toLocaleString();
        
        // Populate items
        const itemsTbody = document.getElementById('receipt-items');
        itemsTbody.innerHTML = '';
        saleData.items.forEach(item => {
            const row = itemsTbody.insertRow();
            row.innerHTML = `
                <td>${item.name}</td>
                <td>${item.quantity}</td>
                <td>${item.price.toFixed(2)}</td>
                <td>${(item.quantity * item.price).toFixed(2)}</td>
            `;
        });

        // Populate totals
        document.getElementById('receipt-subtotal').textContent = `৳${saleData.subtotal.toFixed(2)}`;
        if (saleData.gstApplied) {
            document.getElementById('receipt-tax').textContent = `৳${saleData.tax.toFixed(2)}`;
        } else {
            document.getElementById('gst-line').style.display = 'none';
        }
        document.getElementById('receipt-total').textContent = `৳${saleData.total.toFixed(2)}`;
        
        // Populate payment method
        document.getElementById('payment-method').textContent = saleData.paymentMethod;

        // Automatically trigger print dialog
        window.print();
        
        // Close window after printing (optional)
        window.onafterprint = () => {
            // window.close(); // You can uncomment this to auto-close the tab after printing.
        };

    } catch (error) {
        console.error("Error fetching sale data:", error);
        document.body.innerHTML = '<h1>Error loading bill data.</h1>';
    }
});