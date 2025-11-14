/**
 * printer.js - Smart POS এর জন্য প্রিন্টিং ফাংশন।
 * এই ফাইলটি দুটি ফাংশন এক্সপোর্ট করে:
 * 1. printSingleBarcode: একটিমাত্র লেবেল প্রিন্ট করার জন্য।
 * 2. printMultipleBarcodes: একাধিক বারকোড A4 পেজে প্রিন্ট করার জন্য।
 */

/**
 * একটিমাত্র বারকোড প্রিন্ট করার জন্য নতুন উইন্ডো খোলে (লেবেল প্রিন্টারের জন্য অপটিমাইজড)।
 * @param {string} barcode - পণ্যের বারকোড।
 * @param {string} name - পণ্যের নাম।
 * @param {number|string} price - পণ্যের বিক্রয়মূল্য।
 */
export function printSingleBarcode(barcode, name, price) {
    const printWindow = window.open('', '_blank', 'width=400,height=300');
    if (!printWindow) {
        alert("Popup blocked! Please allow popups for this site to print barcodes.");
        return;
    }
    printWindow.document.write(`
        <html>
            <head>
                <title>Print Barcode</title>
                <style>
                    @page { 
                        size: 3in 2in; /* লেবেল সাইজ, প্রয়োজন অনুযায়ী পরিবর্তন করুন */
                        margin: 0; 
                    }
                    body { 
                        font-family: sans-serif; 
                        text-align: center;
                        margin: 5px;
                        overflow: hidden;
                    }
                    .barcode-wrapper { display: inline-block; break-inside: avoid; }
                    .product-info { font-size: 13px; font-weight: bold; margin: 0; padding: 0; }
                    .product-price { font-size: 12px; margin-top: 3px; }
                </style>
            </head>
            <body>
                <div class="barcode-wrapper">
                    <div class="product-info">${name}</div>
                    <svg id="barcode-svg"></svg>
                    <div class="product-price">Price: ₹${price}</div>
                </div>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
                <script>
                    try {
                        JsBarcode("#barcode-svg", "${barcode}", {
                            format: "CODE128", displayValue: true, fontSize: 14,
                            width: 1.5, height: 35, margin: 5
                        });
                        window.onafterprint = () => window.close();
                        window.print();
                    } catch (e) {
                        console.error("JsBarcode error:", e);
                        document.body.innerHTML = "Error: " + e.message;
                    }
                <\/script>
            </body>
        </html>
    `);
    printWindow.document.close();
}


/**
 * একাধিক বারকোড একটি A4 পেজে গ্রিড আকারে প্রিন্ট করে।
 * @param {Array<Object>} products - প্রিন্ট করার জন্য নির্বাচিত পণ্যের তালিকা।
 */
export function printMultipleBarcodes(products) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Popup blocked! Please allow popups for this site.");
        return;
    }

    let barcodesHTML = '';
    products.forEach(p => {
        if (p.barcode && p.barcode !== 'N/A') {
            barcodesHTML += `
                <div class="barcode-item">
                    <div class="product-name">${p.name}</div>
                    <svg class="barcode-svg" data-barcode="${p.barcode}"></svg>
                    <div class="product-price">Price: ₹${(p.sellingPrice || 0).toFixed(2)}</div>
                </div>
            `;
        }
    });

    printWindow.document.write(`
        <html>
            <head>
                <title>Print Multiple Barcodes</title>
                <style>
                    @page { size: A4; margin: 1cm; }
                    body { margin: 0; font-family: sans-serif; }
                    .barcode-grid { display: flex; flex-wrap: wrap; }
                    .barcode-item {
                        width: 30%;
                        height: 1.8in;
                        padding: 10px;
                        margin: 5px;
                        text-align: center;
                        border: 1px dashed #ccc;
                        box-sizing: border-box;
                        break-inside: avoid;
                    }
                    .product-name { font-size: 11px; font-weight: bold; margin-bottom: 3px; word-wrap: break-word; }
                    .product-price { font-size: 10px; margin-top: 3px; }
                </style>
            </head>
            <body>
                <div class="barcode-grid">${barcodesHTML}</div>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
                <script>
                    document.querySelectorAll('.barcode-svg').forEach(svg => {
                        JsBarcode(svg, svg.dataset.barcode, {
                            format: "CODE128", displayValue: true, fontSize: 12,
                            width: 1.2, height: 30, margin: 2
                        });
                    });
                    window.onafterprint = () => window.close();
                    window.print();
                <\/script>
            </body>
        </html>
    `);
    printWindow.document.close();
}