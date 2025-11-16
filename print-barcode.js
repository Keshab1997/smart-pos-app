document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id');
    const productName = urlParams.get('name');
    const productPrice = urlParams.get('price');

    // Control elements
    const templateSelect = document.getElementById('template-select');
    const copiesInput = document.getElementById('copies-input');
    const printButton = document.getElementById('print-button');
    const printArea = document.getElementById('print-area');
    
    // Custom size and margin elements
    const customSizeInputs = document.getElementById('custom-size-inputs');
    const customWidthInput = document.getElementById('custom-width');
    const customHeightInput = document.getElementById('custom-height');
    const marginTopInput = document.getElementById('margin-top');
    const marginRightInput = document.getElementById('margin-right');
    const marginBottomInput = document.getElementById('margin-bottom');
    const marginLeftInput = document.getElementById('margin-left');

    const shopName = ""; 
    const currency = "₹"; 

    function renderSticker() {
        printArea.innerHTML = ''; 

        const sticker = document.createElement('div');
        sticker.id = 'sticker-preview';
        sticker.className = 'sticker';
        sticker.setAttribute('tabindex', '0'); // Make it focusable for keyboard events
        
        const selectedTemplate = templateSelect.value;
        if (selectedTemplate !== 'custom') {
            sticker.classList.add(selectedTemplate);
        }

        // Special handling for dual sticker template
        if (selectedTemplate === 'template-11') {
            sticker.innerHTML = `
                <div class="inner-sticker">
                    <div class="product-name">${productName}</div>
                    <div class="price">${currency} ${productPrice}</div>
                    <div class="barcode-container"><svg id="barcode1"></svg></div>
                </div>
                <div class="inner-sticker">
                    <div class="product-name">${productName}</div>
                    <div class="price">${currency} ${productPrice}</div>
                    <div class="barcode-container"><svg id="barcode2"></svg></div>
                </div>
            `;
        } else if (selectedTemplate === 'template-5' || selectedTemplate === 'template-10') {
             sticker.innerHTML = `
                <div class="price">${currency} ${productPrice}</div>
                <div class="barcode-container"><svg id="barcode"></svg></div>
                <div class="product-name">${productName}</div>
                <div class="shop-name">${shopName}</div>
            `;
        } else {
            // Default structure for other templates
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
        }

        printArea.appendChild(sticker);

        // Generate Barcode(s)
        if (productId) {
            try {
                const barcodeOptions = {
                    format: "CODE128", lineColor: "#000", width: 2, height: 40,
                    displayValue: true, fontSize: 14, margin: 5
                };
                if (selectedTemplate === 'template-11') {
                    JsBarcode("#barcode1", productId, barcodeOptions);
                    JsBarcode("#barcode2", productId, barcodeOptions);
                } else {
                    JsBarcode("#barcode", productId, barcodeOptions);
                }
            } catch (e) {
                console.error("Barcode generation failed:", e);
                sticker.querySelector('.barcode-container').innerText = 'Invalid Barcode ID';
            }
        }
        
        // Add keyboard listener for margin adjustments
        sticker.addEventListener('keydown', handleMarginKeydown);

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
        updateStickerMargins(); // Apply margins
    }

    function updateStickerMargins() {
        const sticker = document.getElementById('sticker-preview');
        if (!sticker || templateSelect.value !== 'custom') {
            sticker.style.marginTop = sticker.style.marginRight = sticker.style.marginBottom = sticker.style.marginLeft = '0px';
            return;
        };

        sticker.style.marginTop = `${marginTopInput.value}mm`;
        sticker.style.marginRight = `${marginRightInput.value}mm`;
        sticker.style.marginBottom = `${marginBottomInput.value}mm`;
        sticker.style.marginLeft = `${marginLeftInput.value}mm`;
    }

    function handleMarginKeydown(event) {
        if (templateSelect.value !== 'custom') return;

        const key = event.key;
        if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
            return;
        }
        
        event.preventDefault(); // Prevent page scrolling

        let targetInput;
        const increment = event.shiftKey ? 1 : 0.5; // Smaller steps, hold Shift for larger steps

        switch (key) {
            case 'ArrowUp':
                targetInput = marginTopInput;
                targetInput.value = (parseFloat(targetInput.value) - increment).toFixed(2);
                break;
            case 'ArrowDown':
                targetInput = marginTopInput;
                targetInput.value = (parseFloat(targetInput.value) + increment).toFixed(2);
                break;
            case 'ArrowLeft':
                targetInput = marginLeftInput;
                targetInput.value = (parseFloat(targetInput.value) - increment).toFixed(2);
                break;
            case 'ArrowRight':
                targetInput = marginLeftInput;
                targetInput.value = (parseFloat(targetInput.value) + increment).toFixed(2);
                break;
        }
        
        // Trigger input event to update the sticker style
        if (targetInput) {
            targetInput.dispatchEvent(new Event('input'));
        }
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
            stickerClone.style.margin = '0'; // Reset screen margins for print
            printArea.appendChild(stickerClone);
        }
        window.print();
    }
    
    // Event Listeners
    templateSelect.addEventListener('change', renderSticker);
    printButton.addEventListener('click', handlePrint);
    
    // Listeners for custom inputs
    customWidthInput.addEventListener('input', updateStickerSize);
    customHeightInput.addEventListener('input', updateStickerSize);
    marginTopInput.addEventListener('input', updateStickerMargins);
    marginRightInput.addEventListener('input', updateStickerMargins);
    marginBottomInput.addEventListener('input', updateStickerMargins);
    marginLeftInput.addEventListener('input', updateStickerMargins);
    
    window.onafterprint = () => {
        const pageStyle = document.getElementById('page-style');
        if (pageStyle) pageStyle.remove();
        renderSticker(); 
    };

    // Initial render
    renderSticker();
});