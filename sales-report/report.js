// report.js (নতুন ডেটা স্ট্রাকচারের জন্য সম্পূর্ণ আপডেট করা)

import { 
    db, collection, getDocs, query, where, orderBy, Timestamp 
} from '../js/firebase-config.js';

// DOM এলিমেন্টের রেফারেন্স
const todaySalesEl = document.getElementById('total-sales-today');
const monthSalesEl = document.getElementById('total-sales-month');
const overallSalesEl = document.getElementById('overall-total-sales');
const salesTableBody = document.getElementById('sales-table-body');
const filterBtn = document.getElementById('filter-btn');
const startDateInputEl = document.getElementById('start-date');
const endDateInputEl = document.getElementById('end-date');
const filteredCashSalesEl = document.getElementById('filtered-cash-sales');
const filteredCardSalesEl = document.getElementById('filtered-card-sales');
// const filteredOnlineSalesEl = document.getElementById('filtered-online-sales'); // এই এলিমেন্টটি আপনার HTML-এ না থাকলে মুছে দিতে পারেন

// সব সেলস ডেটা একটি গ্লোবাল ভেরিয়েবলে রাখা হবে, যাতে বারবার Firestore কল করতে না হয়
let allSalesData = [];

/**
 * Firestore থেকে একবার সমস্ত সেলস ডেটা লোড করে
 */
async function loadAllSalesData() {
    salesTableBody.innerHTML = '<tr><td colspan="7">Loading sales data...</td></tr>';
    try {
        const salesQuery = query(collection(db, "sales"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(salesQuery);
        
        allSalesData = []; // প্রতিবার লোডের আগে রিসেট করা
        querySnapshot.forEach(doc => {
            if (doc.data().createdAt) {
                allSalesData.push({ id: doc.id, ...doc.data() });
            }
        });

        // প্রাথমিক লোডের পর সব হিসাব দেখানো
        calculateSummary(allSalesData);
        filterAndDisplayData(); // ডিফল্ট তারিখ অনুযায়ী ফিল্টার করে দেখাবে

    } catch (error) {
        console.error("Error loading sales data: ", error);
        salesTableBody.innerHTML = '<tr><td colspan="7" class="error-message">Failed to load sales data. Check console.</td></tr>';
    }
}

/**
 * বিক্রির প্রধান সামারি (Today, Month, Overall) গণনা করে
 */
function calculateSummary(sales) {
    let todayTotal = 0, monthTotal = 0, overallTotal = 0;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    sales.forEach(sale => {
        if (!sale.createdAt || typeof sale.createdAt.toDate !== 'function') return;
        const saleDate = sale.createdAt.toDate();
        overallTotal += sale.total;
        if (saleDate >= startOfToday) todayTotal += sale.total;
        if (saleDate >= startOfMonth) monthTotal += sale.total;
    });

    todaySalesEl.textContent = `₹${todayTotal.toFixed(2)}`;
    monthSalesEl.textContent = `₹${monthTotal.toFixed(2)}`;
    overallSalesEl.textContent = `₹${overallTotal.toFixed(2)}`;
}

/**
 * নির্দিষ্ট তারিখের মধ্যে থাকা ডেটা ফিল্টার করে এবং সামারি ও টেবিল আপডেট করে
 */
function filterAndDisplayData() {
    const startDateValue = startDateInputEl.value;
    const endDateValue = endDateInputEl.value;

    if (!startDateValue || !endDateValue) {
        // ডিফল্ট তারিখ সেট করা (আজকের দিন)
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        startDateInputEl.value = `${yyyy}-${mm}-${dd}`;
        endDateInputEl.value = `${yyyy}-${mm}-${dd}`;
    }

    const startDate = new Date(startDateInputEl.value);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(endDateInputEl.value);
    endDate.setHours(23, 59, 59, 999);

    // গ্লোবাল `allSalesData` থেকে ফিল্টার করা
    const filteredSales = allSalesData.filter(sale => {
        const saleDate = sale.createdAt.toDate();
        return saleDate >= startDate && saleDate <= endDate;
    });

    calculateFilteredSummary(filteredSales);
    displaySales(filteredSales);
}

/**
 * পেমেন্ট মেথড অনুযায়ী ফিল্টার করা বিক্রির সামারি গণনা করে (সম্পূর্ণ পরিবর্তিত)
 */
function calculateFilteredSummary(sales) {
    let cashTotal = 0, cardTotal = 0;

    sales.forEach(sale => {
        // নতুন লজিক এখানে
        switch (sale.paymentMethod) {
            case 'cash':
                cashTotal += sale.total;
                break;
            case 'card':
            case 'online': // কার্ড এবং অনলাইন একই হিসাবে ধরা হচ্ছে
                cardTotal += sale.total;
                break;
            case 'part-payment':
                if (sale.paymentBreakdown) {
                    cashTotal += sale.paymentBreakdown.cash || 0;
                    cardTotal += sale.paymentBreakdown.card_or_online || 0;
                }
                break;
            default:
                // যদি কোনো পেমেন্ট মেথড না থাকে (পুরনো ডেটা)
                cashTotal += sale.total; 
                break;
        }
    });

    filteredCashSalesEl.textContent = `₹${cashTotal.toFixed(2)}`;
    filteredCardSalesEl.textContent = `₹${cardTotal.toFixed(2)}`;
    // যদি অনলাইন আলাদাভাবে দেখাতে চান, তাহলে HTML-এ একটি নতুন এলিমেন্ট যোগ করতে হবে
    // filteredOnlineSalesEl.textContent = `₹${onlineTotal.toFixed(2)}`; 
}

/**
 * বিক্রির ডেটা টেবিলে প্রদর্শন করে (পরিবর্তিত)
 */
function displaySales(sales) {
    salesTableBody.innerHTML = '';
    if (sales.length === 0) {
        salesTableBody.innerHTML = '<tr><td colspan="7">No sales found for the selected period.</td></tr>';
        return;
    }

    sales.forEach(sale => {
        const row = document.createElement('tr');
        const saleDate = sale.createdAt.toDate();
        const formattedDate = saleDate.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
        const itemNames = sale.items.map(item => `${item.name} (x${item.quantity})`).join(', ');

        // পেমেন্ট মেথড ফরম্যাট করা
        let paymentDisplay = 'N/A';
        if (sale.paymentMethod) {
            paymentDisplay = sale.paymentMethod.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (sale.paymentMethod === 'part-payment' && sale.paymentBreakdown) {
                paymentDisplay += ` (Cash: ₹${sale.paymentBreakdown.cash.toFixed(2)}, Card: ₹${sale.paymentBreakdown.card_or_online.toFixed(2)})`;
            }
        }

        row.innerHTML = `
            <td>${sale.id.substring(0, 8)}...</td>
            <td>${formattedDate}</td>
            <td>${sale.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
            <td title="${itemNames}">${itemNames.length > 40 ? itemNames.substring(0, 40) + '...' : itemNames}</td>
            <td title="${paymentDisplay}">${paymentDisplay.length > 30 ? paymentDisplay.substring(0, 30) + '...' : paymentDisplay}</td>
            <td>₹${sale.total.toFixed(2)}</td>
            <td>
                <button class="reprint-btn btn btn-secondary" data-sale-id="${sale.id}">Reprint</button>
            </td>
        `;
        salesTableBody.appendChild(row);
    });
}

// "Filter" বাটনে ক্লিকের জন্য ইভেন্ট হ্যান্ডলার
filterBtn.addEventListener('click', filterAndDisplayData);

// "Reprint" বাটনে ক্লিকের জন্য ইভेंट হ্যান্ডলার
salesTableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('reprint-btn')) {
        const saleId = e.target.dataset.saleId;
        if (saleId) {
            window.open(`../billing/print.html?saleId=${saleId}`, '_blank');
        }
    }
});

// পেজ লোড হওয়ার পর ডেটা লোড করা
document.addEventListener('DOMContentLoaded', loadAllSalesData);