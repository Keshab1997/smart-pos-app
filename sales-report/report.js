// report.js (Payment Type কলাম সহ সম্পূর্ণ আপডেট করা)

import { 
    db, collection, getDocs, query, where, orderBy 
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
const filteredOnlineSalesEl = document.getElementById('filtered-online-sales');


/**
 * সমস্ত সেলস ডেটা লোড করে
 */
async function loadSalesData() {
    salesTableBody.innerHTML = '<tr><td colspan="7">Loading sales data...</td></tr>'; // colspan="7"
    try {
        const salesQuery = query(collection(db, "sales"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(salesQuery);
        
        const salesData = [];
        querySnapshot.forEach(doc => {
            if (doc.data().createdAt) {
                salesData.push({ id: doc.id, ...doc.data() });
            }
        });

        calculateSummary(salesData);
        calculateFilteredSummary(salesData);
        displaySales(salesData);

    } catch (error) {
        console.error("Error loading sales data: ", error);
        salesTableBody.innerHTML = '<tr><td colspan="7" class="error-message">Failed to load sales data. Check console.</td></tr>'; // colspan="7"
    }
}

/**
 * বিক্রির প্রধান সামারি গণনা করে
 */
function calculateSummary(sales) {
    let todayTotal = 0, monthTotal = 0, overallTotal = 0;
    const now = new Date(), startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()), startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

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
 * পেমেন্ট মেথড অনুযায়ী ফিল্টার করা বিক্রির সামারি গণনা করে
 */
function calculateFilteredSummary(sales) {
    let cashTotal = 0, cardTotal = 0, onlineTotal = 0;

    sales.forEach(sale => {
        switch (sale.paymentMethod) {
            case 'cash': cashTotal += sale.total; break;
            case 'card': cardTotal += sale.total; break;
            case 'online': onlineTotal += sale.total; break;
        }
    });

    filteredCashSalesEl.textContent = `₹${cashTotal.toFixed(2)}`;
    filteredCardSalesEl.textContent = `₹${cardTotal.toFixed(2)}`;
    filteredOnlineSalesEl.textContent = `₹${onlineTotal.toFixed(2)}`;
}

/**
 * বিক্রির ডেটা টেবিলে প্রদর্শন করে (পরিবর্তিত)
 */
function displaySales(sales) {
    salesTableBody.innerHTML = '';
    if (sales.length === 0) {
        salesTableBody.innerHTML = '<tr><td colspan="7">No sales found for the selected period.</td></tr>'; // colspan="7"
        return;
    }

    sales.forEach(sale => {
        const row = document.createElement('tr');
        const saleDate = sale.createdAt.toDate();
        const formattedDate = saleDate.toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const itemNames = sale.items.map(item => item.name).join(', ');

        // ========= নতুন পরিবর্তন এখানে ==========
        // পেমেন্ট মেথড ফরম্যাট করা, যেমন 'cash' কে 'Cash' দেখানো
        const paymentMethod = sale.paymentMethod 
            ? sale.paymentMethod.charAt(0).toUpperCase() + sale.paymentMethod.slice(1) 
            : 'N/A'; // যদি কোনো কারণে paymentMethod না থাকে

        row.innerHTML = `
            <td>${sale.id.substring(0, 8)}...</td>
            <td>${formattedDate}</td>
            <td>${sale.items.length}</td>
            <td title="${itemNames}">${itemNames.length > 40 ? itemNames.substring(0, 40) + '...' : itemNames}</td>
            <td>${paymentMethod}</td> <!-- নতুন সেল -->
            <td>₹${sale.total.toFixed(2)}</td>
            <td>
                <button class="reprint-btn btn btn-secondary" data-sale-id="${sale.id}">Reprint</button>
            </td>
        `;
        salesTableBody.appendChild(row);
    });
}

/**
 * তারিখ অনুযায়ী ফিল্টার করার ইভেন্ট হ্যান্ডলার
 */
filterBtn.addEventListener('click', async () => {
    const startDateValue = startDateInputEl.value;
    const endDateValue = endDateInputEl.value;

    if (!startDateValue || !endDateValue) {
        alert('Please select both start and end dates.');
        return;
    }

    const startDate = new Date(startDateValue);
    const endDate = new Date(endDateValue);
    endDate.setHours(23, 59, 59, 999);

    salesTableBody.innerHTML = '<tr><td colspan="7">Filtering data...</td></tr>'; // colspan="7"

    try {
        const q = query(collection(db, "sales"), where("createdAt", ">=", startDate), where("createdAt", "<=", endDate), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const filteredSales = [];
        querySnapshot.forEach(doc => filteredSales.push({ id: doc.id, ...doc.data() }));
        
        calculateFilteredSummary(filteredSales);
        displaySales(filteredSales);

    } catch (error) {
        console.error("Error filtering sales data: ", error);
        salesTableBody.innerHTML = '<tr><td colspan="7" class="error-message">Filtering failed.</td></tr>'; // colspan="7"
    }
});

/**
 * 'Reprint' বাটনে ক্লিকের জন্য ইভেন্ট হ্যান্ডলার
 */
salesTableBody.addEventListener('click', (e) => {
    if (e.target.classList.contains('reprint-btn')) {
        const saleId = e.target.dataset.saleId;
        if (saleId) {
            window.open(`../billing/print.html?saleId=${saleId}`, '_blank');
        }
    }
});

// পেজ লোড হওয়ার পর ডেটা লোড করা
document.addEventListener('DOMContentLoaded', loadSalesData);