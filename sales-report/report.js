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
let filteredSalesForPDF = []; // PDF এর জন্য আলাদা গ্লোবাল ভ্যারিয়েবল 

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
    if (salesTableBody) salesTableBody.innerHTML = '<tr><td colspan="10" class="loading-cell">Loading data...</td></tr>';
    
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
        if (salesTableBody) salesTableBody.innerHTML = '<tr><td colspan="10">Error loading data.</td></tr>';
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

    filteredSalesForPDF = allSalesData.filter(sale => {
        const d = sale.createdAt.toDate();
        return d >= startDate && d <= endDate;
    });

    calculateFilteredPaymentSummary(filteredSalesForPDF);
    renderSalesTable(filteredSalesForPDF);
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

// --- Render Table (Updated for Bill Number) ---
function renderSalesTable(sales) {
    if (!salesTableBody) return;
    salesTableBody.innerHTML = '';

    if (sales.length === 0) {
        salesTableBody.innerHTML = '<tr><td colspan="10" class="no-data">No data found.</td></tr>';
        return;
    }

    sales.forEach(sale => {
        const saleDateObj = sale.createdAt.toDate();
        const saleDateStr = formatDate(saleDateObj); 
        // বিলের প্রতিটি আইটেমের নাম এবং তার দাম/পরিমাণ দেখানোর জন্য
        const detailsStr = sale.items ? sale.items.map(i => `${i.name} (${i.quantity}x)`).join(', ') : '';
        
        // মোট কস্ট প্রাইস ক্যালকুলেশন
        let totalBillCost = 0;
        if (sale.items) {
            totalBillCost = sale.items.reduce((sum, item) => sum + ((item.costPrice || 0) * item.quantity), 0);
        }

        const netTotal = sale.total || 0;
        const profit = netTotal - totalBillCost;

        const discount = sale.discountAmount || sale.discount || 0;
        let payMethod = (sale.paymentMethod || 'Cash').toUpperCase();

        // ===============================================
        // BILL NUMBER LOGIC (এখানে পরিবর্তন করা হয়েছে)
        // ===============================================
        // ১. যদি ডাটাবেসে 'billNumber' বা 'billNo' থাকে, সেটা দেখাবে।
        // ২. যদি না থাকে, তাহলে ID এর প্রথম ৬ অক্ষর বড় হাতের (Uppercase) করে দেখাবে (যেমন: CRNB9U)।
        let displayBillNumber = sale.billNumber || sale.billNo;
        
        if (!displayBillNumber) {
            // যদি বিল নাম্বার না পাওয়া যায়, সুন্দর ফরম্যাটে ID দেখাবে
            displayBillNumber = "#" + sale.id.substring(0, 6).toUpperCase(); 
        }

        const row = document.createElement('tr');
        let actionHTML = '';

        // Icons
        const iconEdit = `<i class="fa-solid fa-pen"></i>`;
        const iconPrint = `<i class="fa-solid fa-print"></i>`;
        const iconTrash = `<i class="fa-solid fa-trash"></i>`;

        // Security Check
        const isToday = isTransactionToday(saleDateObj);

        if (sale.status === 'canceled') {
            row.classList.add('sale-canceled');
            actionHTML = `<span style="color:red; font-weight:bold; font-size:12px;">CANCELED</span>`;
        } else {
            if (isToday) {
                // আজকের বিল: সব বাটন থাকবে
                actionHTML = `
                    <div class="action-buttons">
                        <button class="btn-icon btn-edit edit-pay-btn" data-sale-id="${sale.id}" data-current-pay="${sale.paymentMethod}" title="Edit Payment">${iconEdit}</button>
                        <button class="btn-icon btn-print reprint-btn" data-sale-id="${sale.id}" title="Print Receipt">${iconPrint}</button>
                        <button class="btn-icon btn-delete cancel-btn" data-sale-id="${sale.id}" title="Cancel Bill">${iconTrash}</button>
                    </div>
                `;
            } else {
                // পুরনো বিল: Locked থাকবে, কিন্তু PRINT বাটন থাকবে
                actionHTML = `
                    <div class="locked-wrapper">
                        <div class="locked-badge"><i class="fas fa-lock"></i> Locked</div>
                        <button class="btn-icon btn-print reprint-btn" data-sale-id="${sale.id}" title="Print Old Bill">${iconPrint}</button>
                    </div>
                `;
            }
        }

        row.innerHTML = `
            <td style="font-weight:600;">${displayBillNumber}</td>
            <td>${saleDateStr}</td>
            <td>${sale.items ? sale.items.length : 0}</td>
            <td title="${detailsStr}">${detailsStr.length > 30 ? detailsStr.substring(0, 30) + '...' : detailsStr}</td>
            <td><span class="badge badge-${payMethod.toLowerCase() === 'cash' ? 'success' : 'warning'}">${payMethod}</span></td>
            <td>₹${discount.toFixed(2)}</td>
            <td style="color:#d35400; font-weight:500;">₹${totalBillCost.toFixed(2)}</td>
            <td><strong>₹${netTotal.toFixed(2)}</strong></td>
            <td style="color:${profit >= 0 ? '#27ae60' : '#e74c3c'}; font-weight:bold;">₹${profit.toFixed(2)}</td>
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

// --- PDF DOWNLOAD (Enhanced with New Page & Footer) ---
window.downloadPDF = function() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');

    // Add custom footer function
    const addFooter = (pageNumber) => {
        const pageHeight = doc.internal.pageSize.height;
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Page ${pageNumber} | Developed by Keshab Sarkar`, 14, pageHeight - 10);
        doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`, doc.internal.pageSize.width - 80, pageHeight - 10);
    };

    // Header
    doc.setFontSize(18);
    doc.text(myShopName, 14, 15);
    doc.setFontSize(12);
    doc.text("Detailed Sales Report (Including Item-wise Cost)", 14, 22);
    doc.setFontSize(10);
    doc.text(`Period: ${startDatePicker.value} to ${endDatePicker.value}`, 14, 28);

    // Main table data
    const tableData = [];
    filteredSalesForPDF.forEach(sale => {
        const saleDate = formatDate(sale.createdAt.toDate());
        const billNo = sale.billNumber || sale.billNo || sale.id.substring(0,6).toUpperCase();
        
        let itemsDetails = "";
        let totalCost = 0;
        
        if(sale.items) {
            itemsDetails = sale.items.map(i => {
                const itemCostTotal = (i.costPrice || 0) * i.quantity;
                totalCost += itemCostTotal;
                return `${i.name} [Qty: ${i.quantity}] (CP: ${i.costPrice || 0} | Total CP: ${itemCostTotal})`;
            }).join('\n');
        }

        const statusText = sale.status === 'canceled' ? 'CANCELED' : 'SUCCESS';

        const netTotal = sale.total || 0;
        const profit = netTotal - totalCost;

        tableData.push([
            billNo,
            saleDate,
            itemsDetails,
            (sale.paymentMethod || 'Cash').toUpperCase(),
            (sale.discountAmount || 0).toFixed(2),
            totalCost.toFixed(2),
            netTotal.toFixed(2),
            profit.toFixed(2),
            statusText
        ]);
    });

    doc.autoTable({
        startY: 35,
        head: [['Bill No', 'Date', 'Items Breakdown (Name, Qty, Cost Price)', 'Type', 'Disc.', 'Total CP', 'Net Total', 'Profit', 'Status']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        columnStyles: {
            2: { cellWidth: 80 },
        },
        headStyles: { fillColor: [44, 62, 80] },
        didDrawPage: function(data) {
            addFooter(data.pageNumber);
        }
    });

    // Add new page for summary
    doc.addPage();
    
    // Summary page header
    doc.setFontSize(16);
    doc.setTextColor(44, 62, 80);
    doc.text('Financial Summary Report', 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(`${myShopName} | Period: ${startDatePicker.value} to ${endDatePicker.value}`, 14, 28);
    
    // Calculate totals
    let totalRevenue = 0, totalCost = 0, totalDiscount = 0, totalCanceled = 0;
    let cashSales = 0, cardSales = 0;
    
    filteredSalesForPDF.forEach(sale => {
        if (sale.status === 'canceled') {
            totalCanceled += sale.total;
            return;
        }
        
        totalRevenue += sale.total;
        totalDiscount += (sale.discountAmount || 0);
        
        if (sale.items) {
            totalCost += sale.items.reduce((sum, item) => sum + ((item.costPrice || 0) * item.quantity), 0);
        }
        
        const method = (sale.paymentMethod || 'cash').toLowerCase();
        if (method === 'cash') cashSales += sale.total;
        else cardSales += sale.total;
    });
    
    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100) : 0;
    
    // Professional Summary Table
    doc.autoTable({
        startY: 40,
        head: [['Financial Summary', 'Amount (Rs.)']],
        body: [
            ['Total Revenue', totalRevenue.toFixed(2)],
            ['Total Cost', totalCost.toFixed(2)],
            ['Gross Profit', totalProfit.toFixed(2)],
            ['Profit Margin', profitMargin.toFixed(1) + '%'],
            ['Total Discount Given', totalDiscount.toFixed(2)],
            ['Cash Sales', cashSales.toFixed(2)],
            ['Card/Online Sales', cardSales.toFixed(2)],
            ['Canceled Amount', totalCanceled.toFixed(2)]
        ],
        theme: 'striped',
        styles: { fontSize: 12, cellPadding: 4 },
        headStyles: { fillColor: [52, 73, 94], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 80 },
            1: { halign: 'right', cellWidth: 60, fontStyle: 'bold' }
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        didDrawPage: function(data) {
            addFooter(data.pageNumber);
        }
    });

    doc.save(`Detailed_Sales_Report_${startDatePicker.value}.pdf`);
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