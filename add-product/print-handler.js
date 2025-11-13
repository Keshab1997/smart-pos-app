// print-handler.js

document.addEventListener('DOMContentLoaded', () => {
    const barcodesContainer = document.getElementById('barcodes-container');

    // যদি বারকোড কন্টেইনার পেজে থাকে, তাহলেই কেবল কোডটি রান হবে
    if (barcodesContainer) {
        
        // কন্টেইনারের উপর ক্লিক ইভেন্ট সেট করা হচ্ছে (Event Delegation)
        barcodesContainer.addEventListener('click', (event) => {
            
            // ক্লিক করা এলিমেন্টটির সবচেয়ে কাছের '.barcode-wrapper' কে খুঁজে বের করা
            const clickedBarcode = event.target.closest('.barcode-wrapper');

            // যদি একটি বৈধ বারকোড র‍্যাপারে ক্লিক করা হয়
            if (clickedBarcode) {
                // প্রিন্টের জন্য একটি বিশেষ ক্লাস যোগ করা হচ্ছে
                clickedBarcode.classList.add('printable-barcode');
                
                // ব্রাউজারের প্রিন্ট ডায়ালগ চালু করা
                window.print();
            }
        });
    }

    // প্রিন্ট ডায়ালগ বন্ধ হয়ে গেলে বা প্রিন্ট শেষ হলে এই ফাংশনটি কাজ করবে
    window.onafterprint = () => {
        // যে বারকোডটিতে প্রিন্ট ক্লাস যোগ করা হয়েছিল, সেটিকে খুঁজে বের করা
        const printableElement = document.querySelector('.printable-barcode');
        
        // যদি এমন কোনো এলিমেন্ট পাওয়া যায়, তাহলে ক্লাসটি মুছে ফেলা হবে
        if (printableElement) {
            printableElement.classList.remove('printable-barcode');
        }
    };
});