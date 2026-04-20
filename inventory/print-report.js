import { auth } from '../js/firebase-config.js';

const printReportBtn = document.getElementById('print-report-btn');

if (printReportBtn) {
    printReportBtn.addEventListener('click', () => {
        if (!auth.currentUser) { alert("Please login."); return; }

        // inventory.js er already filtered products directly use koro — no extra Firestore call
        const products = window.inventoryState?.filteredProducts || [];
        const selectedCategory = document.getElementById('category-filter')?.value || '';

        if (products.length === 0) {
            alert("No products found to print with current filters.");
            return;
        }

        generateCategoryWisePDF(products, selectedCategory);
    });
}

// --- PDF Generator Function ---
function generateCategoryWisePDF(products, filterName) {
    const groupedData = {};
    let grandTotalStock = 0;
    let grandTotalValue = 0;

    products.forEach(product => {
        const cat = product.category || 'Uncategorized';
        if (!groupedData[cat]) groupedData[cat] = [];
        groupedData[cat].push(product);
    });

    const sortedCategories = Object.keys(groupedData).sort();

    const printWindow = window.open('', '_blank', 'width=950,height=700');
    if (!printWindow) {
        alert("Pop-up blocked! Please allow pop-ups for this site.");
        return;
    }

    let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Inventory Report</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; padding: 30px; color: #333; }
                h1 { text-align: center; margin: 0; padding-bottom: 5px; text-transform: uppercase; letter-spacing: 1px; }
                .sub-header { text-align: center; font-size: 13px; color: #666; margin-bottom: 25px; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 12px; }
                th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
                th { background-color: #f0f0f0; font-weight: 700; color: #000; }
                .text-right { text-align: right; }
                .text-center { text-align: center; }
                .cat-header { background-color: #4a5568; color: white; padding: 8px; font-size: 14px; font-weight: bold; margin-top: 20px; border-radius: 4px 4px 0 0; -webkit-print-color-adjust: exact; }
                .subtotal-row { background-color: #e2e8f0; font-weight: bold; }
                .grand-total-box { margin-top: 30px; border-top: 2px solid #000; padding-top: 15px; display: flex; justify-content: flex-end; }
                .total-card { text-align: right; background: #f8f9fa; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
                .total-card div { margin-bottom: 5px; font-size: 16px; font-weight: bold; }
                @media print {
                    @page { margin: 15mm; }
                    .cat-header { background-color: #4a5568 !important; color: white !important; }
                    .subtotal-row { background-color: #e2e8f0 !important; }
                }
            </style>
        </head>
        <body>
            <h1>Inventory Report</h1>
            <div class="sub-header">
                Generated on: ${new Date().toLocaleString()} <br>
                Filter Applied: ${filterName ? filterName : 'All Categories'}
            </div>
    `;

    sortedCategories.forEach(category => {
        const items = groupedData[category];
        let catStock = 0;
        let catTotalValue = 0;

        htmlContent += `<div class="cat-header">${category} (${items.length} Items)</div>`;
        htmlContent += `
            <table>
                <thead>
                    <tr>
                        <th width="5%">SL</th>
                        <th width="35%">Product Name</th>
                        <th width="15%">Barcode</th>
                        <th width="10%" class="text-right">Cost (₹)</th>
                        <th width="10%" class="text-right">Sale (₹)</th>
                        <th width="10%" class="text-right">Stock</th>
                        <th width="15%" class="text-right">Total Value</th>
                    </tr>
                </thead>
                <tbody>
        `;

        items.forEach((item, index) => {
            const stock = parseInt(item.stock) || 0;
            const cp = parseFloat(item.costPrice) || 0;
            const sp = parseFloat(item.sellingPrice) || 0;
            const totalVal = stock * cp;

            catStock += stock;
            catTotalValue += totalVal;

            htmlContent += `
                <tr>
                    <td class="text-center">${index + 1}</td>
                    <td>${item.name}</td>
                    <td>${item.barcode || '-'}</td>
                    <td class="text-right">${cp.toFixed(2)}</td>
                    <td class="text-right">${sp.toFixed(2)}</td>
                    <td class="text-right">${stock}</td>
                    <td class="text-right">${totalVal.toFixed(2)}</td>
                </tr>
            `;
        });

        htmlContent += `
                <tr class="subtotal-row">
                    <td colspan="5" class="text-right">Sub Total for ${category}:</td>
                    <td class="text-right">${catStock}</td>
                    <td class="text-right">${catTotalValue.toFixed(2)}</td>
                </tr>
                </tbody>
            </table>
        `;

        grandTotalStock += catStock;
        grandTotalValue += catTotalValue;
    });

    htmlContent += `
        <div class="grand-total-box">
            <div class="total-card">
                <div>Total Stock Quantity: ${grandTotalStock}</div>
                <div>Total Inventory Valuation: ₹${grandTotalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            </div>
        </div>
        <script>
            window.onload = function() { setTimeout(function() { window.print(); }, 500); }
        <\/script>
        </body>
        </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
}
