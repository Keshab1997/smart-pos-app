// printer.js (TSC TE244 লেবেল প্রিন্টারের জন্য সম্পূর্ণ আপডেটেড)

// একটি helper ফাংশন যা HTML ট্যাগ এস্কেপ করে নিরাপত্তা নিশ্চিত করে
const escapeHTML = (str) => {
    if (!str) return '';
    return str.toString().replace(/[&<>"']/g, (match) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[match]);
};

/**
 * একটিমাত্র বারকোড লেবেল প্রিন্ট করে।
 */
export function printSingleBarcode(barcode, name, price) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Popup blocked! Please allow popups for this site.");
        return;
    }

    const labelHTML = `
        <div class="label-item">
            <div class="product-name">${escapeHTML(name)}</div>
            <svg class="barcode-svg" data-barcode="${barcode}"></svg>
            <div class="product-price">Price: ₹${escapeHTML(price.toString())}</div>
        </div>
    `;

    writeToPrintWindow(printWindow, labelHTML);
}

/**
 * একাধিক পণ্যের জন্য একটির পর একটি বারকোড লেবেল প্রিন্ট করে।
 */
export function printMultipleBarcodes(products) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Popup blocked! Please allow popups for this site.");
        return;
    }

    let allLabelsHTML = '';
    products.forEach(p => {
        if (p.barcode && p.barcode !== 'N/A') {
            allLabelsHTML += `
                <div class="label-item">
                    <div class="product-name">${escapeHTML(p.name)}</div>
                    <svg class="barcode-svg" data-barcode="${p.barcode}"></svg>
                    <div class="product-price">Price: ₹${(p.sellingPrice || 0).toFixed(2)}</div>
                </div>
            `;
        }
    });

    writeToPrintWindow(printWindow, allLabelsHTML);
}


/**
 * একটি Helper ফাংশন যা প্রিন্ট উইন্ডোতে HTML লেখে এবং প্রিন্ট ডায়ালগ খোলে।
 * @param {Window} printWindow - window.open() দ্বারা তৈরি করা উইন্ডো।
 * @param {string} contentHTML - প্রিন্ট করার জন্য HTML কন্টেন্ট।
 */
function writeToPrintWindow(printWindow, contentHTML) {
    printWindow.document.write(`
        <html>
            <head>
                <title>Print Labels</title>
                <link rel="stylesheet" href="print-styles.css">
            </head>
            <body>
                ${contentHTML}
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
                <script>
                    document.querySelectorAll('.barcode-svg').forEach(svg => {
                        try {
                            JsBarcode(svg, svg.dataset.barcode, {
                                format: "CODE128",
                                displayValue: true, // বারকোডের নিচে সংখ্যা দেখাবে
                                textMargin: 0,
                                fontOptions: "bold",
                                // লেবেলের জন্য বারকোডের সাইজ ছোট করা হয়েছে
                                fontSize: 8,  // বারকোডের নিচের সংখ্যার ফন্ট সাইজ
                                width: 1.2,   // বারকোডের প্রতিটি লাইনের প্রস্থ
                                height: 25,   // বারকোডের উচ্চতা
                                margin: 0     // বারকোডের চারপাশে কোনো মার্জিন নেই
                            });
                        } catch(e) {
                           const item = svg.parentElement;
                           if(item) item.innerHTML = '<div style="color:red; font-size:8pt;">Invalid Barcode</div>';
                        }
                    });

                    // কন্টেন্ট রেন্ডার হওয়ার জন্য সামান্য সময় দেওয়া হচ্ছে
                    setTimeout(() => {
                        window.print();
                    }, 250);

                    window.onafterprint = () => window.close();
                <\/script>
            </body>
        </html>
    `);
    printWindow.document.close();
}