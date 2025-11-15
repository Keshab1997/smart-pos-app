// sales-report/report.js (সম্পূর্ণ আপডেট করা)

// =================================================================
// --- মডিউল ইম্পোর্ট ---
// =================================================================
import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, getDocs, query, orderBy, doc, updateDoc, runTransaction // runTransaction যোগ করা হয়েছে
} from 'firebase/firestore';

// ==========================================================
// --- DOM এলিমেন্টের রেফারেন্স (HTML অনুযায়ী) ---
// ==========================================================
const totalSalesTodayEl = document.getElementById('total-sales-today');
const totalSalesMonthEl = document.getElementById('total-sales-month');
const overallTotalSalesEl = document.getElementById('overall-total-sales');
const totalCanceledAmountEl = document.getElementById('total-canceled-amount');

const startDatePicker = document.getElementById('start-date');
const endDatePicker = document.getElementById('end-date');
const filterBtn = document.getElementById('filter-btn');

const filteredCashSalesEl = document.getElementById('filtered-cash-sales');
const filteredCardSalesEl = document.getElementById('filtered-card-sales');
const filteredTotalDiscountEl = document.getElementById('filtered-total-discount');
const filteredCanceledAmountEl = document.getElementById('filtered-canceled-amount');

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

function calculateTopSummaries(sales) {
    let todayTotal = 0, monthTotal = 0, overallTotal = 0, totalCanceled = 0;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    sales.forEach(sale => {
        const saleDate = sale.createdAt.toDate();
        const netTotal = sale.total;

        if (sale.status === 'canceled') {
            totalCanceled += netTotal;
        } else {
            overallTotal += netTotal;
            if (saleDate >= startOfToday) todayTotal += netTotal;
            if (saleDate >= startOfMonth) monthTotal += netTotal;
        }
    });

    totalSalesTodayEl.textContent = `₹${todayTotal.toFixed(2)}`;
    totalSalesMonthEl.textContent = `₹${monthTotal.toFixed(2)}`;
    overallTotalSalesEl.textContent = `₹${overallTotal.toFixed(2)}`;
    totalCanceledAmountEl.textContent = `₹${totalCanceled.toFixed(2)}`;
}

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

function calculateFilteredPaymentSummary(sales) {
    let cashTotal = 0, cardOrOnlineTotal = 0, totalDiscount = 0, filteredCanceled = 0;

    sales.forEach(sale => {
        if (sale.status === 'canceled') {
            filteredCanceled += sale.total;
            return;
        }

        const discount = sale.discountAmount || sale.discount || 0;
        totalDiscount += discount;

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
    filteredCanceledAmountEl.textContent = `₹${filteredCanceled.toFixed(2)}`;
}

function formatDate(dateObject) {
    const day = String(dateObject.getDate()).padStart(2, '0');
    const month = String(dateObject.getMonth() + 1).padStart(2, '0');
    const year = dateObject.getFullYear();
    return `${day}-${month}-${year}`;
}

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
        const discount = sale.discountAmount || sale.discount || 0;

        const row = document.createElement('tr');

        let actionCellHTML = '';
        if (sale.status === 'canceled') {
            row.classList.add('sale-canceled');
            actionCellHTML = `<span class="status-canceled">Canceled</span>`;
        } else {
            actionCellHTML = `
                <button class="btn btn-secondary btn-sm reprint-btn" data-sale-id="${sale.id}">Print</button>
                <button class="btn btn-danger btn-sm cancel-btn" data-sale-id="${sale.id}">Cancel</button>
            `;
        }

        row.innerHTML = `
            <td>${sale.id.substring(0, 6)}...</td>
            <td>${saleDate}</td>
            <td>${totalItems}</td>
            <td title="${itemNames}">${itemNames.length > 40 ? itemNames.substring(0, 40) + '...' : itemNames}</td>
            <td>${sale.paymentMethod.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}</td>
            <td>₹${discount.toFixed(2)}</td>
            <td>₹${sale.total.toFixed(2)}</td>
            <td>${actionCellHTML}</td>
        `;
        salesTableBody.appendChild(row);
    });
}

// ===== START: handleCancelBill ফাংশনটি সম্পূর্ণ আপডেট করা হয়েছে =====
/**
 * নির্দিষ্ট বিল ক্যানসেল করার ফাংশন এবং আইটেম স্টক ফিরিয়ে আনা
 */
async function handleCancelBill(saleId) {
    if (!currentUserId || !saleId) return;

    // ব্যবহারকারীকে নিশ্চিত করতে বলা হচ্ছে
    const confirmation = confirm("Are you sure you want to cancel this bill? This will mark the bill as canceled, return the items to stock, and adjust sales totals. This action cannot be undone.");
    if (!confirmation) return;

    // টার্গেট করা সেল ডকুমেন্টটি খুঁজে বের করা
    const saleToCancel = allSalesData.find(s => s.id === saleId);
    if (!saleToCancel) {
        alert("Error: Sale not found in local data.");
        return;
    }
    
    // যদি বিলটি আগে থেকেই ক্যানসেল করা থাকে তবে ফাংশন বন্ধ করে দিন
    if (saleToCancel.status === 'canceled') {
        alert("This bill has already been canceled.");
        return;
    }

    try {
        // Firebase Transaction শুরু করা হচ্ছে
        await runTransaction(db, async (transaction) => {
            const saleRef = doc(db, 'shops', currentUserId, 'sales', saleId);
            
            // Transaction-এর মধ্যে সেল ডকুমেন্টটি আবার পড়া হচ্ছে ডেটা সিঙ্ক রাখতে
            const saleDoc = await transaction.get(saleRef);
            if (!saleDoc.exists()) {
                throw "Error: Sale document does not exist in Firestore!";
            }
            const saleData = saleDoc.data();

            // 1. প্রতিটি আইটেমের স্টক আপডেট করা
            const itemsToRestock = saleData.items;
            for (const item of itemsToRestock) {
                // item.id হলো inventory-তে থাকা প্রোডাক্টের ডকুমেন্ট আইডি
                if (!item.id) { 
                    console.warn(`Item '${item.name}' is missing an ID, cannot restock.`);
                    continue; 
                }

                const productRef = doc(db, 'shops', currentUserId, 'inventory', item.id);
                const productDoc = await transaction.get(productRef);

                if (productDoc.exists()) {
                    const currentStock = productDoc.data().stock || 0;
                    const newStock = currentStock + item.quantity;
                    transaction.update(productRef, { stock: newStock });
                } else {
                    console.warn(`Product with ID ${item.id} not found in inventory. Cannot restock '${item.name}'.`);
                }
            }

            // 2. সেলের স্ট্যাটাস 'canceled' হিসেবে আপডেট করা
            transaction.update(saleRef, { status: 'canceled' });
        });

        // Transaction সফল হলে লোকাল ডেটা ও UI আপডেট করা
        saleToCancel.status = 'canceled';
        calculateTopSummaries(allSalesData);
        filterAndDisplayData(); // ফিল্টার করা ডেটা ও টেবিল রি-রেন্ডার হবে

        alert("Bill has been canceled successfully, and items have been returned to stock.");

    } catch (error) {
        console.error("Transaction failed: ", error);
        alert("Failed to cancel the bill due to an error. Please check your connection and try again.");
    }
}
// ===== END: handleCancelBill ফাংশন আপডেট সম্পন্ন =====


// ==========================================================
// --- ইভেন্ট লিসেনার সেটআপ ---
// ==========================================================
function setupEventListeners() {
    filterBtn.addEventListener('click', filterAndDisplayData);

    salesTableBody.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('reprint-btn')) {
            const saleId = target.dataset.saleId;
            if (saleId) {
                window.open(`../billing/print.html?saleId=${saleId}`, '_blank');
            }
        }
        
        if (target.classList.contains('cancel-btn')) {
            const saleId = target.dataset.saleId;
            if (saleId) {
                handleCancelBill(saleId);
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