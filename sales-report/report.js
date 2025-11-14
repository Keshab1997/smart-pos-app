// sales-report/report.js (সম্পূর্ণ আপডেট করা)

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, getDocs, query, orderBy
} from 'firebase/firestore';

// ==========================================================
// --- DOM এলিমেন্টের রেফারেন্স (HTML অনুযায়ী) ---
// ==========================================================
const totalSalesTodayEl = document.getElementById('total-sales-today');
const totalSalesMonthEl = document.getElementById('total-sales-month');
const overallTotalSalesEl = document.getElementById('overall-total-sales');

const startDatePicker = document.getElementById('start-date');
const endDatePicker = document.getElementById('end-date');
const filterBtn = document.getElementById('filter-btn');

const filteredCashSalesEl = document.getElementById('filtered-cash-sales');
const filteredCardSalesEl = document.getElementById('filtered-card-sales');
const filteredTotalDiscountEl = document.getElementById('filtered-total-discount'); 

const salesTableBody = document.getElementById('sales-table-body');

const logoutBtn = document.getElementById('logout-btn');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mainNavLinks = document.getElementById('main-nav-links');

// ==========================================================
// --- গ্লোবাল ভেরিয়েবল ---
// ==========================================================
let currentUserId = null;
let allSalesData = []; // সব সেলস ডেটা এখানে ক্যাশ করা হবে

// ==========================================================
// --- Authentication ---
// ==========================================================
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        initializeReportPage();
    } else {
        window.location.href = '../index.html';
    }
});

// ==========================================================
// --- প্রাথমিক ফাংশন ---
// ==========================================================
function initializeReportPage() {
    setupEventListeners();
    fetchAllSalesAndRender();
}

/**
 * Firestore থেকে একবার সমস্ত সেলস ডেটা লোড করে এবং UI আপডেট করে
 */
async function fetchAllSalesAndRender() {
    if (!currentUserId) return;
    
    salesTableBody.innerHTML = '<tr><td colspan="8" class="loading-cell">Loading sales data...</td></tr>';
    
    try {
        const salesRef = collection(db, 'shops', currentUserId, 'sales');
        const q = query(salesRef, orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        
        allSalesData = querySnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(sale => sale.createdAt && typeof sale.createdAt.toDate === 'function');

        calculateTopSummaries(allSalesData);
        filterAndDisplayData();

    } catch (error) {
        console.error("Error loading sales data: ", error);
        salesTableBody.innerHTML = '<tr><td colspan="8" class="error-message">Failed to load sales data.</td></tr>';
    }
}

/**
 * উপরের সামারি বক্সগুলো (Today, Month, Overall) গণনা করে
 */
function calculateTopSummaries(sales) {
    let todayTotal = 0, monthTotal = 0, overallTotal = 0;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    sales.forEach(sale => {
        const saleDate = sale.createdAt.toDate();
        const netTotal = sale.total;
        overallTotal += netTotal;
        if (saleDate >= startOfToday) todayTotal += netTotal;
        if (saleDate >= startOfMonth) monthTotal += netTotal;
    });

    totalSalesTodayEl.textContent = `₹${todayTotal.toFixed(2)}`;
    totalSalesMonthEl.textContent = `₹${monthTotal.toFixed(2)}`;
    overallTotalSalesEl.textContent = `₹${overallTotal.toFixed(2)}`;
}

/**
 * তারিখ অনুযায়ী ডেটা ফিল্টার করে এবং সামারি ও টেবিল আপডেট করে
 */
function filterAndDisplayData() {
    if (!startDatePicker.value || !endDatePicker.value) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        startDatePicker.value = todayStr;
        endDatePicker.value = todayStr;
    }

    const startDate = new Date(startDatePicker.value);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(endDatePicker.value);
    endDate.setHours(23, 59, 59, 999);

    const filteredSales = allSalesData.filter(sale => {
        const saleDate = sale.createdAt.toDate();
        return saleDate >= startDate && saleDate <= endDate;
    });

    calculateFilteredPaymentSummary(filteredSales);
    renderSalesTable(filteredSales);
}

/**
 * পেমেন্ট মেথড এবং ডিসকাউন্ট অনুযায়ী ফিল্টার করা বিক্রির সামারি গণনা করে
 */
function calculateFilteredPaymentSummary(sales) {
    let cashTotal = 0, cardOrOnlineTotal = 0, totalDiscount = 0;

    sales.forEach(sale => {
        // ===== START: মূল পরিবর্তন এখানে =====
        // পুরোনো (discount) এবং নতুন (discountAmount) উভয় ফিল্ড চেক করা হচ্ছে
        const discount = sale.discountAmount || sale.discount || 0;
        totalDiscount += discount;
        // ===== END: মূল পরিবর্তন =====

        // পেমেন্ট অনুযায়ী গণনা
        switch (sale.paymentMethod) {
            case 'cash':
                cashTotal += sale.total;
                break;
            case 'card':
            case 'online':
                cardOrOnlineTotal += sale.total;
                break;
            case 'part-payment':
                if (sale.paymentBreakdown) {
                    cashTotal += sale.paymentBreakdown.cash || 0;
                    cardOrOnlineTotal += sale.paymentBreakdown.card_or_online || 0;
                } else {
                    cashTotal += sale.total;
                }
                break;
            default:
                cashTotal += sale.total;
                break;
        }
    });

    filteredCashSalesEl.textContent = `₹${cashTotal.toFixed(2)}`;
    filteredCardSalesEl.textContent = `₹${cardOrOnlineTotal.toFixed(2)}`;
    filteredTotalDiscountEl.textContent = `₹${totalDiscount.toFixed(2)}`;
}

/**
 * তারিখকে dd-mm-yyyy ফরম্যাটে রূপান্তর করার জন্য হেল্পার ফাংশন
 */
function formatDate(dateObject) {
    const day = String(dateObject.getDate()).padStart(2, '0');
    const month = String(dateObject.getMonth() + 1).padStart(2, '0');
    const year = dateObject.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * বিক্রির ডেটা দিয়ে টেবিল তৈরি করে
 */
function renderSalesTable(sales) {
    salesTableBody.innerHTML = '';
    if (sales.length === 0) {
        salesTableBody.innerHTML = '<tr><td colspan="8" class="no-data">No sales found for the selected period.</td></tr>';
        return;
    }

    sales.forEach(sale => {
        const saleDate = formatDate(sale.createdAt.toDate()); 
        const totalItems = sale.items.reduce((sum, item) => sum + item.quantity, 0);
        const itemNames = sale.items.map(item => item.name).join(', ');
        
        // ===== START: মূল পরিবর্তন এখানে =====
        // পুরোনো (discount) এবং নতুন (discountAmount) উভয় ফিল্ড চেক করা হচ্ছে
        const discount = sale.discountAmount || sale.discount || 0;
        // ===== END: মূল পরিবর্তন =====

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${sale.id.substring(0, 6)}...</td>
            <td>${saleDate}</td>
            <td>${totalItems}</td>
            <td title="${itemNames}">${itemNames.length > 40 ? itemNames.substring(0, 40) + '...' : itemNames}</td>
            <td>${sale.paymentMethod.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
            <td>₹${discount.toFixed(2)}</td>
            <td>₹${sale.total.toFixed(2)}</td>
            <td>
                <button class="btn btn-secondary reprint-btn" data-sale-id="${sale.id}">Print</button>
            </td>
        `;
        salesTableBody.appendChild(row);
    });
}

// ==========================================================
// --- ইভেন্ট লিসেনার সেটআপ ---
// ==========================================================
function setupEventListeners() {
    filterBtn.addEventListener('click', filterAndDisplayData);

    salesTableBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('reprint-btn')) {
            const saleId = e.target.dataset.saleId;
            if (saleId) {
                window.open(`../billing/print.html?saleId=${saleId}`, '_blank');
            }
        }
    });

    logoutBtn.addEventListener('click', async () => {
        await signOut(auth);
    });

    mobileMenuBtn.addEventListener('click', () => {
        mainNavLinks.classList.toggle('mobile-nav-active');
    });
}