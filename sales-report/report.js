// sales-report/report.js (Final Updated with Shop Name & Icon Design)

import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, getDocs, getDoc, query, orderBy, doc, updateDoc, runTransaction
} from 'firebase/firestore';

// --- DOM Elements ---
const totalSalesTodayEl = document.getElementById('total-sales-today');
const totalSalesMonthEl = document.getElementById('total-sales-month');
const overallTotalSalesEl = document.getElementById('overall-total-sales');
const totalCanceledAmountEl = document.getElementById('total-canceled-amount');

const startDatePicker = document.getElementById('start-date');
const endDatePicker = document.getElementById('end-date');
const filterBtn = document.getElementById('filter-btn');
const whatsappBtn = document.getElementById('whatsapp-btn');

const filteredCashSalesEl = document.getElementById('filtered-cash-sales');
const filteredCardSalesEl = document.getElementById('filtered-card-sales');
const filteredTotalDiscountEl = document.getElementById('filtered-total-discount');
const filteredCanceledAmountEl = document.getElementById('filtered-canceled-amount');

const salesTableBody = document.getElementById('sales-table-body');
const logoutBtn = document.getElementById('logout-btn');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mainNavLinks = document.getElementById('main-nav-links');

// --- Global Variables ---
let currentUserId = null;
let allSalesData = []; 
let myShopName = "My Smart Shop"; // ডিফল্ট নাম

// --- Auth & Initialization ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        initializeReportPage();
    } else {
        window.location.href = '../index.html';
    }
});

async function initializeReportPage() {
    setupEventListeners();
    await fetchShopDetails(); // দোকানের নাম আনা হবে
    fetchAllSalesAndRender();
}

// --- ১. দোকানের নাম ফায়ারবেস থেকে আনা ---
async function fetchShopDetails() {
    try {
        // সাধারণত এই পাথে শপ ডিটেইলস থাকে, আপনার ডাটাবেস স্ট্রাকচার অনুযায়ী এটি চেঞ্জ হতে পারে
        // চেষ্টা ১: settings/profile এর মধ্যে
        let shopDocRef = doc(db, 'shops', currentUserId, 'settings', 'profile');
        let shopDoc = await getDoc(shopDocRef);

        if (shopDoc.exists()) {
            const data = shopDoc.data();
            if(data.shopName) myShopName = data.shopName;
        } else {
            // চেষ্টা ২: সরাসরি shops/{uid} এর মধ্যে যদি থাকে
            shopDocRef = doc(db, 'shops', currentUserId);
            shopDoc = await getDoc(shopDocRef);
            if (shopDoc.exists()) {
                const data = shopDoc.data();
                if(data.shopName) myShopName = data.shopName; // ফিল্ডের নাম 'shopName' অথবা 'name' হতে পারে
            }
        }
        console.log("Loaded Shop Name:", myShopName);
    } catch (error) {
        console.error("Error fetching shop details:", error);
    }
}

// --- Data Loading ---
async function fetchAllSalesAndRender() {
    if (!currentUserId) return;
    salesTableBody.innerHTML = '<tr><td colspan="8" class="loading-cell">Loading data...</td></tr>';
    
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
        console.error("Error: ", error);
        salesTableBody.innerHTML = '<tr><td colspan="8">Error loading data.</td></tr>';
    }
}

function calculateTopSummaries(sales) {
    let todayTotal = 0, monthTotal = 0, overallTotal = 0, totalCanceled = 0;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    sales.forEach(sale => {
        const netTotal = sale.total;
        if (sale.status === 'canceled') {
            totalCanceled += netTotal;
        } else {
            overallTotal += netTotal;
            if (sale.createdAt.toDate() >= startOfToday) todayTotal += netTotal;
            if (sale.createdAt.toDate() >= startOfMonth) monthTotal += netTotal;
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
        startDatePicker.value = today.toISOString().split('T')[0];
        endDatePicker.value = today.toISOString().split('T')[0];
    }

    const startDate = new Date(startDatePicker.value);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(endDatePicker.value);
    endDate.setHours(23, 59, 59, 999);

    const filteredSales = allSalesData.filter(sale => {
        const d = sale.createdAt.toDate();
        return d >= startDate && d <= endDate;
    });

    calculateFilteredPaymentSummary(filteredSales);
    renderSalesTable(filteredSales);
}

function calculateFilteredPaymentSummary(sales) {
    let cashTotal = 0, onlineTotal = 0, discountTotal = 0, canceledTotal = 0;

    sales.forEach(sale => {
        if (sale.status === 'canceled') {
            canceledTotal += sale.total;
            return;
        }
        discountTotal += (sale.discountAmount || sale.discount || 0);

        const method = (sale.paymentMethod || 'cash').toLowerCase();
        if (method === 'cash') cashTotal += sale.total;
        else onlineTotal += sale.total;
    });

    filteredCashSalesEl.textContent = `₹${cashTotal.toFixed(2)}`;
    filteredCardSalesEl.textContent = `₹${onlineTotal.toFixed(2)}`;
    filteredTotalDiscountEl.textContent = `₹${discountTotal.toFixed(2)}`;
    filteredCanceledAmountEl.textContent = `₹${canceledTotal.toFixed(2)}`;
}

function formatDate(dateObject) {
    return dateObject.toLocaleDateString('en-GB'); // DD/MM/YYYY Format
}

// --- ২. টেবিল রেন্ডার (আইকন বাটন সহ) ---
function renderSalesTable(sales) {
    salesTableBody.innerHTML = '';
    if (sales.length === 0) {
        salesTableBody.innerHTML = '<tr><td colspan="8" class="no-data">No data found.</td></tr>';
        return;
    }

    sales.forEach(sale => {
        const saleDate = formatDate(sale.createdAt.toDate()); 
        const itemNames = sale.items ? sale.items.map(i => i.name).join(', ') : '';
        const discount = sale.discountAmount || sale.discount || 0;
        let payMethod = (sale.paymentMethod || 'Cash').toUpperCase();

        const row = document.createElement('tr');
        let actionHTML = '';

        // আইকনগুলো (SVG) এখানে ব্যবহার করা হচ্ছে যাতে ডিজাইন ক্লিন হয়
        const iconEdit = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/></svg>`;
        const iconPrint = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z"/></svg>`;
        const iconTrash = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>`;

        if (sale.status === 'canceled') {
            row.classList.add('sale-canceled');
            actionHTML = `<span class="status-canceled">Canceled</span>`;
        } else {
            actionHTML = `
                <div class="action-buttons">
                    <button class="btn-icon btn-edit edit-pay-btn" data-sale-id="${sale.id}" data-current-pay="${sale.paymentMethod}" title="Edit Payment">${iconEdit}</button>
                    <button class="btn-icon btn-print reprint-btn" data-sale-id="${sale.id}" title="Print Receipt">${iconPrint}</button>
                    <button class="btn-icon btn-delete cancel-btn" data-sale-id="${sale.id}" title="Cancel Bill">${iconTrash}</button>
                </div>
            `;
        }

        row.innerHTML = `
            <td>${sale.id.substring(0, 6)}</td>
            <td>${saleDate}</td>
            <td>${sale.items.length}</td>
            <td title="${itemNames}">${itemNames.length > 25 ? itemNames.substring(0, 25) + '..' : itemNames}</td>
            <td><span class="badge badge-${payMethod.toLowerCase() === 'cash' ? 'success' : 'warning'}">${payMethod}</span></td>
            <td>₹${discount}</td>
            <td><strong>₹${sale.total}</strong></td>
            <td>${actionHTML}</td>
        `;
        salesTableBody.appendChild(row);
    });
}

// --- Actions (Edit, Cancel, WhatsApp) ---

async function handleEditPayment(saleId, currentMethod) {
    let newMethod = prompt(`Change Payment (Current: ${currentMethod})\nEnter: Cash, Card or Online`, "");
    if (!newMethod) return;
    newMethod = newMethod.toLowerCase();

    if (!['cash', 'card', 'online'].includes(newMethod)) {
        alert("Invalid! Type Cash, Card or Online.");
        return;
    }

    try {
        const saleRef = doc(db, 'shops', currentUserId, 'sales', saleId);
        await updateDoc(saleRef, { paymentMethod: newMethod });
        
        // Local update
        const s = allSalesData.find(x => x.id === saleId);
        if(s) s.paymentMethod = newMethod;
        
        calculateTopSummaries(allSalesData);
        filterAndDisplayData();
    } catch (e) { alert("Update failed."); }
}

async function handleCancelBill(saleId) {
    if(!confirm("Confirm cancel? Items will restock.")) return;
    try {
        await runTransaction(db, async (t) => {
            const sRef = doc(db, 'shops', currentUserId, 'sales', saleId);
            const sDoc = await t.get(sRef);
            if(!sDoc.exists()) throw "No doc";
            const items = sDoc.data().items;

            for (const item of items) {
                if(!item.id) continue;
                const pRef = doc(db, 'shops', currentUserId, 'inventory', item.id);
                const pDoc = await t.get(pRef);
                if(pDoc.exists()) t.update(pRef, { stock: (pDoc.data().stock || 0) + item.quantity });
            }
            t.update(sRef, { status: 'canceled' });
        });
        const s = allSalesData.find(x => x.id === saleId);
        if(s) s.status = 'canceled';
        calculateTopSummaries(allSalesData);
        filterAndDisplayData();
        alert("Bill Canceled.");
    } catch(e) { console.log(e); alert("Error canceling."); }
}

// --- ৫. WhatsApp রিপোর্ট পাঠানো (Emoji Fix - 100% Working) ---
function sendReportToWhatsApp() {
    const today = new Date();
    const dateStr = formatDate(today);
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let tCash = 0, tOnline = 0, tTotal = 0, tDisc = 0, tCount = 0;

    allSalesData.forEach(sale => {
        const saleDate = sale.createdAt.toDate();
        if (saleDate >= startOfToday && sale.status !== 'canceled') {
            tTotal += sale.total;
            tDisc += (sale.discountAmount || sale.discount || 0);
            tCount++;

            const method = (sale.paymentMethod || '').toLowerCase();
            if (method === 'cash') tCash += sale.total;
            else tOnline += sale.total;
        }
    });

    // এখানে সরাসরি ইমোজির বদলে ইউনিকোড ব্যবহার করা হয়েছে যাতে কখনও না ভাঙে
    // \uD83D\uDCC5 = 📅 (Calendar)
    // \uD83C\uDFEA = 🏪 (Shop)
    // \uD83D\uDCDD = 📝 (Memo)
    // \uD83D\uDCB5 = 💵 (Cash)
    // \uD83D\uDCB3 = 💳 (Card)
    // \uD83D\uDD3B = 🔻 (Discount)
    // \uD83D\uDCB0 = 💰 (Money Bag)

    let msg = `\uD83D\uDCC5 *Sales Report - ${dateStr}*\n`;
    msg += `\uD83C\uDFEA *${myShopName}*\n`;
    msg += `----------------------------\n`;
    msg += `\uD83D\uDCDD Total Bills: ${tCount}\n`;
    msg += `\uD83D\uDCB5 Cash: ₹${tCash.toFixed(2)}\n`;
    msg += `\uD83D\uDCB3 Online: ₹${tOnline.toFixed(2)}\n`;
    msg += `\uD83D\uDD3B Discount: ₹${tDisc.toFixed(2)}\n`;
    msg += `----------------------------\n`;
    msg += `\uD83D\uDCB0 *TOTAL: ₹${tTotal.toFixed(2)}*`;

    // মেসেজ এনকোড করা
    let encodedMsg = encodeURIComponent(msg);

    // WhatsApp ওপেন করা
    window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
}

// --- Event Listeners ---
function setupEventListeners() {
    filterBtn.addEventListener('click', filterAndDisplayData);
    if(whatsappBtn) whatsappBtn.addEventListener('click', sendReportToWhatsApp);

    salesTableBody.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const id = btn.dataset.saleId;
        if (btn.classList.contains('edit-pay-btn')) handleEditPayment(id, btn.dataset.currentPay);
        if (btn.classList.contains('reprint-btn')) window.open(`../billing/print.html?saleId=${id}`, '_blank');
        if (btn.classList.contains('cancel-btn')) handleCancelBill(id);
    });

    logoutBtn.addEventListener('click', async () => await signOut(auth));
    mobileMenuBtn.addEventListener('click', () => mainNavLinks.classList.toggle('mobile-nav-active'));
}