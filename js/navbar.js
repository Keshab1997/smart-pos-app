// js/navbar.js

document.addEventListener('DOMContentLoaded', () => {
    // এলিমেন্টগুলো সিলেক্ট করা
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mainNavLinks = document.getElementById('main-nav-links');

    // যদি বাটন এবং মেনু দুইটাই খুঁজে পাওয়া যায় তবেই কোড রান করবে
    if (mobileMenuBtn && mainNavLinks) {
        
        // ১. বাটন ক্লিক করলে মেনু ওপেন/ক্লোজ হবে
        mobileMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // ইভেন্ট বাবলিং বন্ধ করা
            mainNavLinks.classList.toggle('mobile-nav-active');
        });

        // ২. স্ক্রিনের অন্য কোথাও ক্লিক করলে মেনু বন্ধ হয়ে যাবে
        document.addEventListener('click', (e) => {
            // যদি ক্লিকটি মেনুর ভেতরে না হয় এবং বাটনের ওপরেও না হয়
            if (!mobileMenuBtn.contains(e.target) && !mainNavLinks.contains(e.target)) {
                mainNavLinks.classList.remove('mobile-nav-active');
            }
        });

        // ৩. মেনুর যেকোনো লিংকে ক্লিক করলে মেনু বন্ধ হবে (মোবাইলে সুবিধাজনক)
        const navLinks = mainNavLinks.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                mainNavLinks.classList.remove('mobile-nav-active');
            });
        });
    }
});