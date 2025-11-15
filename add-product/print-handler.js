// print-handler.js (সঠিক সংস্করণ)

document.addEventListener('DOMContentLoaded', () => {
    // এই পেজে যে কন্টেইনারে বারকোডগুলো আছে তার ID
    const barcodesContainer = document.getElementById('barcodes-container');

    if (!barcodesContainer) {
        // যদি কন্টেইনার না থাকে, তাহলে কোনো কাজ নেই
        return;
    }

    let currentlyPrintingElement = null;

    // কন্টেইনারের উপর ক্লিক ইভেন্ট সেট করা (Event Delegation)
    barcodesContainer.addEventListener('click', (event) => {
        
        // ===================================================================
        // --- পরিবর্তন এখানে ---
        // ক্লিক করা এলিমেন্টের সবচেয়ে কাছের '.barcode-item' কে খুঁজে বের করা হচ্ছে
        const barcodeItem = event.target.closest('.barcode-item');
        // ===================================================================

        if (barcodeItem) {
            // যদি আগে কোনো এলিমেন্ট প্রিন্ট করা হয়ে থাকে, তার ক্লাস মুছে ফেলা
            if (currentlyPrintingElement) {
                currentlyPrintingElement.classList.remove('printable-barcode');
            }

            // নতুন এলিমেন্টটিকে প্রিন্টের জন্য প্রস্তুত করা
            currentlyPrintingElement = barcodeItem;
            currentlyPrintingElement.classList.add('printable-barcode');
            
            // প্রিন্ট ডায়ালগ চালু করা
            window.print();
        }
    });

    // প্রিন্ট ডায়ালগ বন্ধ হলে বা প্রিন্ট শেষ হলে এই ফাংশনটি কাজ করবে
    window.addEventListener('afterprint', () => {
        // যে বারকোডটিতে প্রিন্ট ক্লাস যোগ করা হয়েছিল, সেটি থেকে ক্লাসটি মুছে ফেলা
        if (currentlyPrintingElement) {
            currentlyPrintingElement.classList.remove('printable-barcode');
            currentlyPrintingElement = null; // ভেরিয়েবল রিসেট করা
        }
    });
});