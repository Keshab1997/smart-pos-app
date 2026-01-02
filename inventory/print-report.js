import { db, auth } from '../js/firebase-config.js';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

// --- DOM Elements ---
// আমরা নতুন বাটন ID 'print-report-btn' ধরছি
const printReportBtn = document.getElementById('print-report-btn');
const searchInput = document.getElementById('search-inventory');
const categoryFilter = document.getElementById('category-filter');

// --- Event Listener ---
if (printReportBtn) {
    printReportBtn.addEventListener('click', async () => {
        
        // ১. অথেন্টিকেশন চেক
        const user = auth.currentUser;
        if (!user) {
            alert("Please login to print reports.");
            return;
        }

        // বাটন লোডিং স্ট্যাটাস
        const originalText = printReportBtn.innerText;
        printReportBtn.innerText = "Generating...";
        printReportBtn.disabled = true;

        try {
            // ২. ফায়ারবেস থেকে সব ইনভেন্টরি ডাটা আনা
            // (inventory.js এর উপর নির্ভর না করার জন্য আমরা এখানে ডাটা ফেচ করছি)
            const productsRef = collection(db, 'shops', user.uid, 'inventory');
            // নাম অনুযায়ী সাজিয়ে আনা
            const q = query(productsRef, orderBy("name"));
            const snapshot = await getDocs(q);
            
            const fetchedProducts = snapshot.docs.map(doc => doc.data());

            // ৩. বর্তমানে HTML পেজে যে ফিল্টার/সার্চ দেওয়া আছে, সেটা অ্যাপ্লাই করা
            const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";
            const selectedCategory = categoryFilter ? categoryFilter.value : "";

            const filteredProducts = fetchedProducts.filter(p => {
                const pName = (p.name || '').toLowerCase();
                const pBarcode = (p.barcode || '').toLowerCase();
                const pCat = p.category || '';

                const matchesSearch = !searchTerm || pName.includes(searchTerm) || pBarcode.includes(searchTerm);
                // লক্ষ্য করো: ইনভেন্টরি পেজের ড্রপডাউনে ভ্যালু হিসেবে ক্যাটাগরি থাকে
                const matchesCategory = !selectedCategory || pCat === selectedCategory;
                
                return matchesSearch && matchesCategory;
            });

            if (filteredProducts.length === 0) {
                alert("No products found to print with current filters.");
                return;
            }

            // ৪. রিপোর্ট তৈরি করা
            generateCategoryWisePDF(filteredProducts, selectedCategory);

        } catch (error) {
            console.error("Report Generation Error:", error);
            alert("Failed to generate report. See console for error.");
        } finally {
            // বাটন রিসেট
            printReportBtn.innerText = originalText;
            printReportBtn.disabled = false;
        }
    });
}

// --- PDF Generator Function ---
function generateCategoryWisePDF(products, filterName) {
    // ১. ডাটা প্রসেসিং ( গ্রুপিং )
    const groupedData = {};
    let grandTotalStock = 0;
    let grandTotalValue = 0; // Cost Price * Stock

    products.forEach(product => {
        // ক্যাটাগরি না থাকলে 'Uncategorized' এ যাবে
        const cat = product.category || 'Uncategorized';
        
        if (!groupedData[cat]) {
            groupedData[cat] = [];
        }
        groupedData[cat].push(product);
    });

    // ক্যাটাগরি নামগুলো A-Z সাজানো
    const sortedCategories = Object.keys(groupedData).sort();

    // ২. নতুন উইন্ডো খোলা
    const printWindow = window.open('', '_blank', 'width=950,height=700');
    if(!printWindow) {
        alert("Pop-up blocked! Please allow pop-ups for this site.");
        return;
    }

    // ৩. HTML রিপোর্ট ডিজাইন
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
                
                /* টেবিল হেডার ডিজাইন */
                th { background-color: #f0f0f0; font-weight: 700; color: #000; }
                
                .text-right { text-align: right; }
                .text-center { text-align: center; }

                /* ক্যাটাগরি টাইটেল */
                .cat-header { 
                    background-color: #4a5568; 
                    color: white; 
                    padding: 8px; 
                    font-size: 14px; 
                    font-weight: bold; 
                    margin-top: 20px;
                    border-radius: 4px 4px 0 0;
                    -webkit-print-color-adjust: exact; 
                }
                
                /* সাব টোটাল রো */
                .subtotal-row { background-color: #e2e8f0; font-weight: bold; }

                /* গ্র্যান্ড টোটাল সেকশন */
                .grand-total-box {
                    margin-top: 30px;
                    border-top: 2px solid #000;
                    padding-top: 15px;
                    display: flex;
                    justify-content: flex-end;
                }
                .total-card {
                    text-align: right;
                    background: #f8f9fa;
                    padding: 15px;
                    border: 1px solid #ddd;
                    border-radius: 5px;
                }
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

    // ৪. টেবিল জেনারেশন লুপ
    sortedCategories.forEach(category => {
        const items = groupedData[category];
        let catStock = 0;
        let catTotalValue = 0;

        // ক্যাটাগরি টাইটেল
        htmlContent += `<div class="cat-header">${category} (${items.length} Items)</div>`;
        
        // টেবিল শুরু
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

        // আইটেম লুপ
        items.forEach((item, index) => {
            const stock = parseInt(item.stock) || 0;
            const cp = parseFloat(item.costPrice) || 0;
            const sp = parseFloat(item.sellingPrice) || 0;
            const totalVal = stock * cp; // ইনভেন্টরি ভ্যালু সাধারণত Cost Price এর উপর হয়

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

        // ক্যাটাগরি সাব-টোটাল
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

    // ৫. গ্র্যান্ড টোটাল এবং ফুটার
    htmlContent += `
        <div class="grand-total-box">
            <div class="total-card">
                <div>Total Stock Quantity: ${grandTotalStock}</div>
                <div>Total Inventory Valuation: ₹${grandTotalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
            </div>
        </div>
        
        <script>
            // পেজ লোড হলে অটোমেটিক প্রিন্ট ডায়ালগ আসবে
            window.onload = function() { 
                setTimeout(function() {
                    window.print();
                    // প্রিন্ট শেষে বা ক্যানসেল করলে উইন্ডো ক্লোজ করার অপশন (Optional)
                    // window.close(); 
                }, 500);
            }
        </script>
        </body>
        </html>
    `;

    // ৬. ডকুমেন্ট লেখা শেষ করা
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
}