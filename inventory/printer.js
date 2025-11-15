// =================================================================
// --- বারকোড প্রিন্টিং এর মূল লজিক ---
// =================================================================

/**
 * ইউজার-এর দেওয়া সাইজ অনুযায়ী লেবেল তৈরি করে এবং প্রিন্ট করে।
 * এই ফাংশনটি inventory.js থেকে কল করা হবে।
 * @param {Array<Object>} products - প্রিন্ট করার জন্য প্রোডাক্টের তালিকা।
 * @param {number} width - লেবেলের প্রস্থ mm এককে।
 * @param {number} height - লেবেলের উচ্চতা mm এককে।
 */
export function printCustomLabels(products, width, height) {
    if (!products || products.length === 0) {
        console.error("প্রিন্ট করার জন্য কোনো প্রোডাক্ট পাওয়া যায়নি।");
        return;
    }

    const printArea = document.getElementById('print-area');
    if (!printArea) {
        console.error("প্রিন্ট করার জন্য 'print-area' এলিমেন্টটি পাওয়া যায়নি।");
        return;
    }

    const styleId = 'dynamic-print-style';
    // পুরনো ডাইনামিক স্টাইল থাকলে মুছে ফেলা
    document.getElementById(styleId)?.remove();

    // নতুন স্টাইল ট্যাগ তৈরি করা
    const style = document.createElement('style');
    style.id = styleId;
    
    // ডাইনামিক CSS কোড তৈরি করা
    // এখানে @page ব্যবহার করা হচ্ছে প্রতিটি লেবেলকে একটি আলাদা পৃষ্ঠা হিসেবে প্রিন্ট করার জন্য।
    const css = `
        @media print {
            /* প্রিন্টের সময় print-area ছাড়া সব কিছু হাইড করা */
            body > *:not(#print-area) {
                display: none !important;
            }
            #print-area {
                display: block !important;
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
            }

            /* প্রিন্ট পেজের সাইজ ডাইনামিকভাবে সেট করা */
            @page {
                size: ${width}mm ${height}mm;
                margin: 0;
            }

            .barcode-label {
                width: ${width}mm;
                height: ${height}mm;
                display: flex;
                flex-direction: column;
                justify-content: space-around;
                align-items: center;
                box-sizing: border-box;
                padding: 2mm; /* লেবেলের ভিতরে একটু প্যাডিং */
                overflow: hidden;
                page-break-after: always; /* প্রতিটি লেবেলের পর নতুন পৃষ্ঠা */
            }

            .barcode-label:last-child {
                page-break-after: auto; /* শেষ লেবেলের পর পৃষ্ঠা ভাঙবে না */
            }
        }
    `;

    style.innerHTML = css;
    document.head.appendChild(style);


    // প্রিন্ট এরিয়াতে HTML তৈরি করা
    printArea.innerHTML = '';
    products.forEach(product => {
        const barcodeValue = product.barcode ? String(product.barcode).trim() : '';
        const labelHtml = `
            <div class="barcode-label">
                <p class="product-name">${product.name}</p>
                ${barcodeValue ? `<svg class="barcode-svg" jsbarcode-value="${barcodeValue}"></svg>` : ''}
                ${barcodeValue ? `<p class="barcode-text">${barcodeValue}</p>` : ''}
                <p class="price">Price: ₹${(product.sellingPrice || 0).toFixed(2)}</p>
            </div>
        `;
        printArea.innerHTML += labelHtml;
    });

    // বারকোড রেন্ডার করা
    try {
        if (typeof JsBarcode === 'function') {
            JsBarcode(".barcode-svg").init({
                width: 1.5,
                height: 30,
                fontSize: 14,
                displayValue: false // আমরা টেক্সট আলাদাভাবে দেখাচ্ছি
            });
        }
    } catch (e) {
        console.error("বারকোড রেন্ডার করার সময় সমস্যা হয়েছে:", e);
    }

    // সামান্য ডিলে দিয়ে প্রিন্ট ডায়ালগ খোলা, যাতে বারকোড রেন্ডার হতে পারে
    setTimeout(() => {
        window.print();
    }, 300);

    // প্রিন্টের পর ডাইনামিক স্টাইল মুছে ফেলার জন্য ইভেন্ট লিসনার
    window.addEventListener('afterprint', () => {
        document.getElementById(styleId)?.remove();
    }, { once: true });
}