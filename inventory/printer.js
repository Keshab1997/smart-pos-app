// =================================================================
// --- বারকোড প্রিন্টিং এর সম্পূর্ণ লজিক ---
// =================================================================

// DOM এলিমেন্টগুলো (প্রিন্টিং এর জন্য)
const templateModal = document.getElementById('template-modal');
const closeModalBtn = templateModal ? templateModal.querySelector('.close-button') : null;
const templateChoices = document.getElementById('template-choices');
const printArea = document.getElementById('print-area');

// Modal-এর টেমপ্লেট প্রিভিউতে ডেমো বারকোড দেখানো
if (templateModal && typeof JsBarcode === 'function') {
    JsBarcode(".preview-barcode", "123456789", {
        format: "CODE128",
        height: 40,
        displayValue: false,
        margin: 0
    });
}

// Modal বন্ধ করার জন্য ইভেন্ট লিসনার
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => templateModal.style.display = 'none');
}
window.addEventListener('click', (event) => {
    if (event.target === templateModal) {
        templateModal.style.display = 'none';
    }
});


// =================================================================
// --- নতুন ফাংশন: সরাসরি বড় লেবেল প্রিন্ট করার জন্য ---
// =================================================================
/**
 * টেমপ্লেট Modal ছাড়াই সরাসরি বড় আকারের লেবেল প্রিন্ট করে (প্রতি পেজে একটি)
 * @param {Array<Object>} products - প্রিন্ট করার জন্য প্রোডাক্টের অ্যারে
 */
export function printLargeLabels(products) {
    if (!products || products.length === 0) {
        alert("No products to print.");
        return;
    }
    
    if (!printArea) {
        console.error("Print area (#print-area) not found in the HTML!");
        alert("A critical error occurred. The print area is missing.");
        return;
    }

    printArea.innerHTML = ''; // প্রিন্ট করার আগে পুরনো ডেটা মুছে ফেলা

    products.forEach(product => {
        const barcodeValue = product.barcode ? String(product.barcode).trim() : '';
        const productName = product.name || 'Unknown Product';
        const sellingPrice = (product.sellingPrice || 0).toFixed(2);

        // বড় লেবেলের জন্য নতুন HTML টেমপ্লেট
        // এখানে `.large-label-item` ক্লাস ব্যবহার করা হচ্ছে
        const labelHtml = `
            <div class="large-label-item">
                <p class="label-product-name">${productName}</p>
                ${barcodeValue ? `<svg class="label-barcode" jsbarcode-value="${barcodeValue}"></svg>` : '<p class="no-barcode">No Barcode</p>'}
                <p class="label-barcode-text">${barcodeValue}</p>
                <p class="label-price">Price: ₹${sellingPrice}</p>
            </div>
        `;
        
        printArea.innerHTML += labelHtml;
    });

    // সব বারকোড SVG তে রেন্ডার করা
    if (typeof JsBarcode === 'function') {
        try {
            JsBarcode(".label-barcode").init({
                format: "CODE128",
                displayValue: false, // বারকোডের নিচে টেক্সট SVG-তে দেখাবে না, আমরা আলাদা p ট্যাগ ব্যবহার করছি
                margin: 0
            });
        } catch (e) {
            console.error("Error initializing JsBarcode:", e);
            // এখানে ব্যবহারকারীকে একটি মেসেজ দেখানো যেতে পারে
        }
    }
    
    // প্রিন্ট ডায়ালগ খোলার জন্য সামান্য ডিলে
    // এটি নিশ্চিত করে যে বারকোড রেন্ডার হওয়ার জন্য যথেষ্ট সময় পায়
    setTimeout(() => {
        window.print();
    }, 300);
}


// =================================================================
// --- পুরনো ফাংশন: টেমপ্লেট ব্যবহার করে প্রিন্ট করার জন্য ---
// =================================================================
/**
 * প্রিন্ট করার জন্য প্রোডাক্টের তালিকা সহ টেমপ্লেট Modal দেখায়
 * @param {Array<Object>} productsToPrint - প্রিন্ট করার জন্য প্রোডাক্টের একটি অ্যারে
 */
export function showTemplateModal(productsToPrint) {
    if (!productsToPrint || productsToPrint.length === 0) {
        alert("No products to print.");
        return;
    }
    
    // টেমপ্লেট বেছে নেওয়ার জন্য একটি ইভেন্ট লিসনার তৈরি করা
    const templateClickHandler = (event) => {
        const selectedCard = event.target.closest('.template-card');
        if (!selectedCard) return;

        const templateId = selectedCard.dataset.templateId;
        generateAndPrintLabels(productsToPrint, templateId); // নির্বাচিত প্রোডাক্ট ও টেমপ্লেট দিয়ে লেবেল তৈরি
        
        templateModal.style.display = 'none'; // Modal বন্ধ করা
        // এখানে আর removeEventListener এর প্রয়োজন নেই কারণ { once: true } ব্যবহার করা হয়েছে
    };

    // পুরনো লিসনার থাকলে রিমুভ করে নতুন করে যোগ করা ভালো
    templateChoices.replaceWith(templateChoices.cloneNode(true));
    document.getElementById('template-choices').addEventListener('click', templateClickHandler, { once: true });
    
    templateModal.style.display = 'flex'; // Modal দেখানো
}


/**
 * নির্বাচিত টেমপ্লেট অনুযায়ী লেবেল তৈরি করে এবং প্রিন্ট ডায়ালগ খোলে
 * @param {Array<Object>} products - প্রিন্ট করার জন্য প্রোডাক্টের অ্যারে
 * @param {string} templateId - বেছে নেওয়া টেমপ্লেটের আইডি
 */
function generateAndPrintLabels(products, templateId) {
    if (!printArea) {
        console.error("Print area (#print-area) not found in the HTML!");
        return;
    }

    printArea.innerHTML = ''; // প্রিন্ট করার আগে পুরনো ডেটা মুছে ফেলা

    products.forEach(product => {
        let labelHtml = '';
        const barcodeValue = product.barcode ? String(product.barcode).trim() : '';

        // বেছে নেওয়া টেমপ্লেট অনুযায়ী HTML তৈরি করা
        switch (templateId) {
            case 'template-1': // Standard Template
                labelHtml = `
                    <div class="label-item">
                        <p class="label-product-name">${product.name}</p>
                        ${barcodeValue ? `<svg class="label-barcode" jsbarcode-value="${barcodeValue}"></svg>` : ''}
                        <p class="label-barcode-text">${barcodeValue}</p>
                        <p class="label-price">Price: ₹${(product.sellingPrice || 0).toFixed(2)}</p>
                    </div>
                `;
                break;
            
            case 'template-2': // Price Focused Template
                labelHtml = `
                    <div class="label-item">
                        <p class="label-price" style="font-size: 16pt;">₹${(product.sellingPrice || 0).toFixed(2)}</p>
                        <p class="label-product-name" style="font-size: 8pt; margin-top: 5px;">${product.name}</p>
                        ${barcodeValue ? `<svg class="label-barcode" jsbarcode-value="${barcodeValue}"></svg>` : ''}
                        <p class="label-barcode-text">${barcodeValue}</p>
                    </div>
                `;
                break;

            case 'template-3': // Minimalist Template
                 labelHtml = `
                    <div class="label-item">
                        ${barcodeValue ? `<svg class="label-barcode" jsbarcode-value="${barcodeValue}"></svg>` : ''}
                        <p class="label-barcode-text">${barcodeValue}</p>
                    </div>
                `;
                break;
        }

        printArea.innerHTML += labelHtml;
    });

    // সব বারকোড SVG তে রেন্ডার করা
    if (typeof JsBarcode === 'function') {
        try {
            JsBarcode(".label-barcode").init();
        } catch (e) {
            console.error("Error initializing JsBarcode:", e);
        }
    }
    
    // প্রিন্ট ডায়ালগ খোলার জন্য সামান্য ডিলে
    setTimeout(() => {
        window.print();
    }, 300);
}