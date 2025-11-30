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
let myShopName = "My Smart Shop"; 

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
    await fetchShopDetails();
    fetchAllSalesAndRender();
}

// --- Shop Name Fetching ---
async function fetchShopDetails() {
    try {
        let shopDocRef = doc(db, 'shops', currentUserId, 'settings', 'profile');
        let shopDoc = await getDoc(shopDocRef);

        if (shopDoc.exists()) {
            const data = shopDoc.data();
            if(data.shopName) myShopName = data.shopName;
        } else {
            shopDocRef = doc(db, 'shops', currentUserId);
            shopDoc = await getDoc(shopDocRef);
            if (shopDoc.exists() && shopDoc.data().shopName) {
                myShopName = shopDoc.data().shopName;
            }
        }
    } catch (error) {
        console.error("Error fetching shop details:", error);
    }
}

// --- Data Loading ---
async function fetchAllSalesAndRender() {
    if (!currentUserId) return;
    if (salesTableBody) salesTableBody.innerHTML = '<tr><td colspan="8" class="loading-cell">Loading data...</td></tr>';
    
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
        if (salesTableBody) salesTableBody.innerHTML = '<tr><td colspan="8">Error loading data.</td></tr>';
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

    if(totalSalesTodayEl) totalSalesTodayEl.textContent = `₹${todayTotal.toFixed(2)}`;
    if(totalSalesMonthEl) totalSalesMonthEl.textContent = `₹${monthTotal.toFixed(2)}`;
    if(overallTotalSalesEl) overallTotalSalesEl.textContent = `₹${overallTotal.toFixed(2)}`;
    if(totalCanceledAmountEl) totalCanceledAmountEl.textContent = `₹${totalCanceled.toFixed(2)}`;
}

// --- Helper: Check if Date is Today ---
function isTransactionToday(dateObj) {
    const today = new Date();
    return dateObj.getDate() === today.getDate() &&
           dateObj.getMonth() === today.getMonth() &&
           dateObj.getFullYear() === today.getFullYear();
}

function filterAndDisplayData() {
    if (!startDatePicker || !endDatePicker) return;

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

    if(filteredCashSalesEl) filteredCashSalesEl.textContent = `₹${cashTotal.toFixed(2)}`;
    if(filteredCardSalesEl) filteredCardSalesEl.textContent = `₹${onlineTotal.toFixed(2)}`;
    if(filteredTotalDiscountEl) filteredTotalDiscountEl.textContent = `₹${discountTotal.toFixed(2)}`;
    if(filteredCanceledAmountEl) filteredCanceledAmountEl.textContent = `₹${canceledTotal.toFixed(2)}`;
}

function formatDate(dateObject) {
    return dateObject.toLocaleDateString('en-GB') + ' ' + dateObject.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// --- Render Table (With Security Logic) ---
function renderSalesTable(sales) {
    if (!salesTableBody) return;
    salesTableBody.innerHTML = '';

    if (sales.length === 0) {
        salesTableBody.innerHTML = '<tr><td colspan="8" class="no-data">No data found.</td></tr>';
        return;
    }

    sales.forEach(sale => {
        const saleDateObj = sale.createdAt.toDate();
        const saleDateStr = formatDate(saleDateObj); 
        const itemNames = sale.items ? sale.items.map(i => i.name).join(', ') : '';
        const discount = sale.discountAmount || sale.discount || 0;
        let payMethod = (sale.paymentMethod || 'Cash').toUpperCase();

        const row = document.createElement('tr');
        let actionHTML = '';

        // Icons (SVG)
        const iconEdit = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708l-3-3zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11l.178-.178z"/></svg>`;
        const iconPrint = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/><path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z"/></svg>`;
        const iconTrash = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>`;

        // Check Security Condition
        const isToday = isTransactionToday(saleDateObj);

        if (sale.status === 'canceled') {
            row.classList.add('sale-canceled');
            actionHTML = `<span style="color:red; font-weight:bold; font-size:12px;">CANCELED</span>`;
        } else {
            if (isToday) {
                actionHTML = `
                    <div class="action-buttons">
                        <button class="btn-icon btn-edit edit-pay-btn" data-sale-id="${sale.id}" data-current-pay="${sale.paymentMethod}" title="Edit Payment">${iconEdit}</button>
                        <button class="btn-icon btn-print reprint-btn" data-sale-id="${sale.id}" title="Print Receipt">${iconPrint}</button>
                        <button class="btn-icon btn-delete cancel-btn" data-sale-id="${sale.id}" title="Cancel Bill">${iconTrash}</button>
                    </div>
                `;
            } else {
                actionHTML = `<span style="color:gray; font-size:12px;"><i class="fas fa-lock"></i> Locked</span>`;
            }
        }

        row.innerHTML = `
            <td>${sale.id.substring(0, 6)}</td>
            <td>${saleDateStr}</td>
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

// --- PIN VERIFICATION HELPER ---
async function verifyAdminPIN() {
    const userPin = prompt("🔒 SECURITY: Enter Master PIN:");
    if (!userPin) return false;

    try {
        const settingsRef = doc(db, 'shops', currentUserId, 'settings', 'security');
        const snap = await getDoc(settingsRef);
        
        if (snap.exists()) {
            if (snap.data().master_pin === userPin) return true;
        } else {
             alert("Security PIN not set in database. Please configure 'settings/security'.");
             return false;
        }
        alert("❌ Wrong PIN!");
        return false;
    } catch (e) {
        console.error(e);
        alert("Error checking PIN.");
        return false;
    }
}

// --- Actions with Security ---
async function handleEditPayment(saleId, currentMethod) {
    const isAuthorized = await verifyAdminPIN();
    if (!isAuthorized) return;

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
        
        const s = allSalesData.find(x => x.id === saleId);
        if(s) s.paymentMethod = newMethod;
        
        calculateTopSummaries(allSalesData);
        filterAndDisplayData();
        alert("Payment updated successfully.");
    } catch (e) { alert("Update failed."); }
}

async function handleCancelBill(saleId) {
    const isAuthorized = await verifyAdminPIN();
    if (!isAuthorized) return;

    const reason = prompt("Reason for cancellation?");
    if(!reason) { alert("Reason is mandatory!"); return; }

    if(!confirm("Are you sure? Items will be returned to stock.")) return;

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
                if(pDoc.exists()) {
                    t.update(pRef, { stock: (pDoc.data().stock || 0) + item.quantity });
                }
            }
            t.update(sRef, { 
                status: 'canceled',
                canceledAt: new Date(),
                cancelReason: reason
            });
        });

        const s = allSalesData.find(x => x.id === saleId);
        if(s) s.status = 'canceled';
        
        calculateTopSummaries(allSalesData);
        filterAndDisplayData();
        alert("Bill Canceled.");

    } catch(e) { console.log(e); alert("Error canceling."); }
}

// --- WhatsApp Report ---
function sendReportToWhatsApp() {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-GB');
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

    let msg = `*SALES REPORT: ${dateStr}*\n`;
    msg += `*${myShopName}*\n`;
    msg += `------------------------\n`;
    msg += `Total Bills: ${tCount}\n`;
    msg += `Cash Sales: Rs. ${tCash.toFixed(2)}\n`;
    msg += `Online/Card: Rs. ${tOnline.toFixed(2)}\n`;
    msg += `Total Discount: Rs. ${tDisc.toFixed(2)}\n`;
    msg += `------------------------\n`;
    msg += `*NET TOTAL: Rs. ${tTotal.toFixed(2)}*`;

    let encodedMsg = encodeURIComponent(msg);
    window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
}

// --- PDF DOWNLOAD FUNCTION (FIXED: Numbers & Layout) ---
window.downloadPDF = function() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // 1. Header
    doc.setFontSize(16);
    doc.text("Sales Report", 14, 20);
    doc.setFontSize(12);
    doc.text(myShopName, 14, 28);
    
    const sDate = startDatePicker.value;
    const eDate = endDatePicker.value;
    doc.setFontSize(10);
    doc.text(`Period: ${sDate} to ${eDate}`, 14, 35);

    // 2. Table (Removing '₹' symbol for clean numbers)
    doc.autoTable({
        html: '#salesTable',
        startY: 40,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2 },
        columns: [
            { header: 'ID', dataKey: 0 },
            { header: 'Date', dataKey: 1 },
            { header: 'Items', dataKey: 2 },
            { header: 'Names', dataKey: 3 },
            { header: 'Type', dataKey: 4 },
            { header: 'Disc.', dataKey: 5 },
            { header: 'Total', dataKey: 6 }
        ],
        didParseCell: function (data) {
            // Clean numbers in Body cells (Remove ₹ symbol)
            if (data.section === 'body') {
                if (data.column.index === 5 || data.column.index === 6) {
                    data.cell.text = [data.cell.text[0].replace(/₹/g, '').trim()]; 
                }
            }
            // Hide Action Column
            if(data.column.index === 7) data.cell.text = ""; 
        }
    });

    // 3. Summary Section (All 4 Values Cleanly)
    const finalY = doc.lastAutoTable.finalY + 10;
    
    // Get values and strip '₹' symbol for PDF to prevent glitch
    const cash = filteredCashSalesEl ? filteredCashSalesEl.innerText.replace(/₹/g, '').trim() : '0.00';
    const card = filteredCardSalesEl ? filteredCardSalesEl.innerText.replace(/₹/g, '').trim() : '0.00';
    const discount = filteredTotalDiscountEl ? filteredTotalDiscountEl.innerText.replace(/₹/g, '').trim() : '0.00';
    const canceled = filteredCanceledAmountEl ? filteredCanceledAmountEl.innerText.replace(/₹/g, '').trim() : '0.00';

    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.text("Filtered Summary:", 14, finalY);
    doc.setFont(undefined, 'normal');
    
    // Display nicely formatted summary
    doc.text(`Filtered Cash Sales: Rs. ${cash}`, 14, finalY + 6);
    doc.text(`Filtered Card Sales: Rs. ${card}`, 14, finalY + 11);
    doc.text(`Total Discount:       Rs. ${discount}`, 14, finalY + 16);
    doc.text(`Filtered Canceled:   Rs. ${canceled}`, 14, finalY + 21);
    
    // Footer
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, finalY + 30);

    doc.save(`Sales_Report_${sDate}.pdf`);
};

// --- Event Listeners ---
function setupEventListeners() {
    if (filterBtn) filterBtn.addEventListener('click', filterAndDisplayData);
    if (whatsappBtn) whatsappBtn.addEventListener('click', sendReportToWhatsApp);

    if (salesTableBody) {
        salesTableBody.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;

            const id = btn.dataset.saleId;
            if (btn.classList.contains('edit-pay-btn')) handleEditPayment(id, btn.dataset.currentPay);
            if (btn.classList.contains('reprint-btn')) window.open(`../billing/print.html?saleId=${id}`, '_blank');
            if (btn.classList.contains('cancel-btn')) handleCancelBill(id);
        });
    }

    if (logoutBtn) logoutBtn.addEventListener('click', async () => await signOut(auth));
    if (mobileMenuBtn && mainNavLinks) {
        mobileMenuBtn.addEventListener('click', () => mainNavLinks.classList.toggle('mobile-nav-active'));
    }
}