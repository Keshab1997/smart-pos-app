document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const productName = urlParams.get('name');
    const productPrice = urlParams.get('price');

    const templateSelect = document.getElementById('template-select');
    const customSizeInputs = document.getElementById('custom-size-inputs');
    const customWidthInput = document.getElementById('custom-width');
    const customHeightInput = document.getElementById('custom-height');
    const copiesInput = document.getElementById('copies-input');
    const printButton = document.getElementById('print-button');
    const printArea = document.getElementById('print-area');

    // *** পরিবর্তন: দোকানের নাম খালি রাখা হয়েছে এবং কারেন্সি পরিবর্তন করা হয়েছে ***
    const shopName = ""; // দোকানের নাম দেখানো হবে না
    const currency = "₹"; // রুপি চিহ্ন

    function renderSticker() {
        printArea.innerHTML = ''; 

        const sticker = document.createElement('div');
        sticker.id = 'sticker-preview';
        sticker.className = 'sticker';
        
        const selectedTemplate = templateSelect.value;
        if (selectedTemplate !== 'custom') {
            sticker.classList.add(selectedTemplate);
        }

        sticker.innerHTML = `
            <div class="details">
                <div class="shop-name">${shopName}</div>
                <div class="product-name">${productName}</div>
                <div class="price">${currency} ${productPrice}</div>
            </div>
            <div class="barcode-container">
                <svg id="barcode"></svg>
            </div>
        `;
        
        if (selectedTemplate === 'template-5' || selectedTemplate === 'template-10') {
            sticker.innerHTML = `
                <div class="price">${currency} ${productPrice}</div>
                <div class="barcode-container"><svg id="barcode"></svg></div>
                <div class="product-name">${productName}</div>
                <div class="shop-name">${shopName}</div>
            `;
        }

        printArea.appendChild(sticker);

        if (productId) {
            try {
                JsBarcode("#barcode", productId, {
                    format: "CODE128",
                    lineColor: "#000",
                    width: 2,
                    height: 40,
                    displayValue: true,
                    fontSize: 14,
                    margin: 5
                });
            } catch (e) {
                console.error("Barcode generation failed:", e);
                sticker.querySelector('.barcode-container').innerText = 'Invalid Barcode ID';
            }
        }
        updateStickerSize();
    }

    function updateStickerSize() {
        const sticker = document.getElementById('sticker-preview');
        if (!sticker) return;

        let width, height;
        const selectedOption = templateSelect.options[templateSelect.selectedIndex];

        if (templateSelect.value === 'custom') {
            width = customWidthInput.value;
            height = customHeightInput.value;
            customSizeInputs.style.display = 'block';
        } else {
            width = selectedOption.getAttribute('data-width');
            height = selectedOption.getAttribute('data-height');
            customSizeInputs.style.display = 'none';
        }
        
        sticker.style.width = `${width}mm`;
        sticker.style.height = `${height}mm`;
    }

    function handlePrint() {
        const copies = parseInt(copiesInput.value, 10);
        const stickerPreview = document.getElementById('sticker-preview');
        if (!stickerPreview || copies < 1) return;

        let width, height;
        if (templateSelect.value === 'custom') {
            width = customWidthInput.value;
            height = customHeightInput.value;
        } else {
            const selectedOption = templateSelect.options[templateSelect.selectedIndex];
            width = selectedOption.getAttribute('data-width');
            height = selectedOption.getAttribute('data-height');
        }

        const pageStyle = document.createElement('style');
        pageStyle.id = 'page-style';
        pageStyle.innerHTML = `@page { size: ${width}mm ${height}mm; margin: 0; }`;
        document.head.appendChild(pageStyle);

        printArea.innerHTML = '';
        for (let i = 0; i < copies; i++) {
            const stickerClone = stickerPreview.cloneNode(true);
            stickerClone.id = '';
            printArea.appendChild(stickerClone);
        }
        window.print();
    }
    
    templateSelect.addEventListener('change', renderSticker);
    customWidthInput.addEventListener('input', updateStickerSize);
    customHeightInput.addEventListener('input', updateStickerSize);
    printButton.addEventListener('click', handlePrint);
    
    window.onafterprint = () => {
        const pageStyle = document.getElementById('page-style');
        if (pageStyle) {
            pageStyle.remove();
        }
        renderSticker(); 
    };

    renderSticker();
});