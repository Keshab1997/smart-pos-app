import { db } from '../js/firebase-config.js';
import { collection, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

const todaySalesEl = document.getElementById('total-sales-today');
const monthSalesEl = document.getElementById('total-sales-month');
const overallSalesEl = document.getElementById('overall-total-sales');
const salesTableBody = document.getElementById('sales-table-body');
const filterBtn = document.getElementById('filter-btn');

async function loadSalesData() {
    const salesQuery = query(collection(db, "sales"), orderBy("saleDate", "desc"));
    const querySnapshot = await getDocs(salesQuery);
    
    const salesData = [];
    querySnapshot.forEach(doc => {
        salesData.push({ id: doc.id, ...doc.data() });
    });

    calculateSummary(salesData);
    displayAllSales(salesData);
}

function calculateSummary(sales) {
    let todayTotal = 0;
    let monthTotal = 0;
    let overallTotal = 0;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    sales.forEach(sale => {
        const saleDate = sale.saleDate.toDate(); // Convert Firebase Timestamp to JS Date
        overallTotal += sale.grandTotal;

        if (saleDate >= startOfToday) {
            todayTotal += sale.grandTotal;
        }

        if (saleDate >= startOfMonth) {
            monthTotal += sale.grandTotal;
        }
    });

    todaySalesEl.textContent = todayTotal.toFixed(2);
    monthSalesEl.textContent = monthTotal.toFixed(2);
    overallSalesEl.textContent = overallTotal.toFixed(2);
}

function displayAllSales(sales) {
    salesTableBody.innerHTML = '';
    sales.forEach(sale => {
        const row = document.createElement('tr');
        const saleDate = sale.saleDate.toDate();
        const formattedDate = saleDate.toLocaleString();
        
        row.innerHTML = `
            <td>${sale.id.substring(0, 8)}...</td>
            <td>${formattedDate}</td>
            <td>${sale.items.length} items</td>
            <td>${sale.grandTotal.toFixed(2)}</td>
        `;
        salesTableBody.appendChild(row);
    });
}

filterBtn.addEventListener('click', async () => {
    const startDateInput = document.getElementById('start-date').value;
    const endDateInput = document.getElementById('end-date').value;

    if (!startDateInput || !endDateInput) {
        alert('Please select both start and end dates.');
        return;
    }

    const startDate = new Date(startDateInput);
    const endDate = new Date(endDateInput);
    // To include the whole end day
    endDate.setHours(23, 59, 59, 999);

    const q = query(
        collection(db, "sales"), 
        where("saleDate", ">=", startDate),
        where("saleDate", "<=", endDate),
        orderBy("saleDate", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const filteredSales = [];
    querySnapshot.forEach(doc => {
        filteredSales.push({ id: doc.id, ...doc.data() });
    });
    
    displayAllSales(filteredSales);
});

// Initial Load
loadSalesData();