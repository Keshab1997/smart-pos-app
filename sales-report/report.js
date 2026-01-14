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

    // ফিল্টার ভ্যালু সংগ্রহ
    const selectedMethods = Array.from(document.querySelectorAll('.data-filter[value]:checked')).map(cb => cb.value);
    const showOnlyDiscount = document.getElementById('filter-discount')?.checked || false;
    const showCanceled = document.getElementById('filter-canceled')?.checked || false;

    filteredSalesForPDF = allSalesData.filter(sale => {
        const d = sale.createdAt.toDate();
        const method = (sale.paymentMethod || 'cash').toLowerCase();
        const hasDiscount = (sale.discountAmount || sale.discount || 0) > 0;
        const isCanceled = sale.status === 'canceled';

        // ১. তারিখ চেক
        if (d < startDate || d > endDate) return false;

        // ২. ক্যানসেল ফিল্টার: যদি 'Canceled' চেক করা থাকে তবে শুধু ক্যানসেলগুলো দেখাবে, নাহলে শুধু সাকসেসগুলো
        if (showCanceled) {
            if (!isCanceled) return false;
        } else {
            if (isCanceled) return false;
        }

        // ৩. পেমেন্ট মেথড চেক (ক্যানসেল মোডে না থাকলে)
        if (!showCanceled && selectedMethods.length > 0 && !selectedMethods.includes(method)) return false;

        // ৪. ডিসকাউন্ট ফিল্টার
        if (showOnlyDiscount && !hasDiscount) return false;

        return true;
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
        // আইটেম ডিটেইলস জেনারেট করার লজিক পরিবর্তন (SP এর বদলে Cost Price দেখানো)
        const detailsHTML = sale.items ? sale.items.map(i => {
            // এখানে i.price বা sellingPrice এর বদলে i.costPrice ব্যবহার করা হয়েছে
            const unitCostPrice = i.costPrice || 0;
            
            return `
                <div class="item-info">
                    <span class="item-name">• ${i.name}</span>
                    <span class="item-qty-price">(${i.quantity} x ₹${parseFloat(unitCostPrice).toFixed(2)})</span>
                </div>
            `;
        }).join('') : 'No items';
        
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
            <td class="details-column">${detailsHTML}</td>
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

    const reason = prompt("বিক্রয় বাতিলের কারণ লিখুন:");
    if(!reason) { alert("কারণ উল্লেখ করা বাধ্যতামূলক!"); return; }

    if(!confirm("আপনি কি নিশ্চিত? পণ্যগুলো স্টকে ফেরত যাবে এবং এই বিক্রয়টি বাতিল হিসেবে চিহ্নিত হবে।")) return;

    try {
        await runTransaction(db, async (t) => {
            const sRef = doc(db, 'shops', currentUserId, 'sales', saleId);
            const sDoc = await t.get(sRef);
            if(!sDoc.exists()) throw "Sale not found";
            
            const saleData = sDoc.data();
            if(saleData.status === 'canceled') {
                throw "This sale is already canceled";
            }
            
            const items = saleData.items || [];

            // স্টক ফেরত দেওয়া
            for (const item of items) {
                if(!item.id) continue;
                const pRef = doc(db, 'shops', currentUserId, 'inventory', item.id);
                const pDoc = await t.get(pRef);
                if(pDoc.exists()) {
                    const currentStock = pDoc.data().stock || 0;
                    t.update(pRef, { stock: currentStock + item.quantity });
                }
            }
            
            // বিক্রয় বাতিল করা
            t.update(sRef, { 
                status: 'canceled',
                canceledAt: new Date(),
                cancelReason: reason
            });
        });

        // লোকাল ডাটা আপডেট
        const s = allSalesData.find(x => x.id === saleId);
        if(s) s.status = 'canceled';
        
        calculateTopSummaries(allSalesData);
        filterAndDisplayData();
        alert("✅ বিক্রয়টি সফলভাবে বাতিল করা হয়েছে এবং স্টক আপডেট হয়েছে।");

    } catch(e) { 
        console.error("Cancel error:", e); 
        if(e === "This sale is already canceled") {
            alert("⚠️ এই বিক্রয়টি আগেই বাতিল করা হয়েছে।");
        } else {
            alert("❌ বিক্রয় বাতিল করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
        }
    }
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

// --- PDF DOWNLOAD (Fixed Syntax Error & Header Summary) ---
window.downloadPDF = function() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4'); 
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const startStr = startDatePicker.value || 'Start';
    const endStr = endDatePicker.value || 'End';

    // ১. সব হিসাব একটি মাত্র অবজেক্টে (totals) রাখা হয়েছে
    const totals = { 
        cash: 0, 
        card: 0, 
        online: 0, 
        net: 0, 
        cost: 0, 
        disc: 0 
    };

    const tableData = [];

    // ২. ডাটা প্রসেসিং এবং হিসাব একসাথে করা
    filteredSalesForPDF.forEach(sale => {
        const isCanceled = sale.status === 'canceled';
        const billNo = sale.billNumber || sale.billNo || sale.id.substring(0, 6).toUpperCase();
        const date = formatDate(sale.createdAt.toDate());
        
        let itemsList = "";
        let saleCost = 0;
        if (sale.items) {
            itemsList = sale.items.map(i => {
                const cost = i.costPrice || 0;
                if (!isCanceled) saleCost += (cost * i.quantity);
                return `• ${i.name} (${i.quantity} x ${cost.toFixed(2)})`;
            }).join('\n');
        }

        const netTotal = sale.total || 0;
        const discount = sale.discountAmount || sale.discount || 0;
        const profit = isCanceled ? 0 : (netTotal - saleCost);
        const method = (sale.paymentMethod || 'cash').toLowerCase();

        // শুধুমাত্র সাকসেসফুল বিলের হিসাব রাখা
        if (!isCanceled) {
            if (method === 'cash') totals.cash += netTotal;
            else if (method === 'card') totals.card += netTotal;
            else if (method === 'online') totals.online += netTotal;
            
            totals.net += netTotal;
            totals.cost += saleCost;
            totals.disc += discount;
        }

        tableData.push([
            billNo,
            date,
            itemsList,
            method.toUpperCase(),
            discount.toFixed(2),
            saleCost.toFixed(2),
            netTotal.toFixed(2),
            profit.toFixed(2),
            isCanceled ? 'CANCELED' : 'SUCCESS'
        ]);
    });

    // ৩. মেইন হেডার (Dark Blue Bar)
    doc.setFillColor(31, 41, 55); 
    doc.rect(0, 0, pageWidth, 45, 'F'); 

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text(myShopName.toUpperCase(), 15, 18); 

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`PERIOD: ${startStr} TO ${endStr}`, 15, 27);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 15, 33);
    
    // ডান দিকের পেমেন্ট সামারি
    const rightX = pageWidth - 15;
    doc.setFontSize(10);
    doc.setTextColor(200, 200, 200);
    doc.text(`CASH: RS. ${totals.cash.toFixed(2)}`, rightX, 18, { align: 'right' });
    doc.text(`CARD: RS. ${totals.card.toFixed(2)}`, rightX, 24, { align: 'right' });
    doc.text(`ONLINE: RS. ${totals.online.toFixed(2)}`, rightX, 30, { align: 'right' });
    
    doc.setFontSize(12);
    doc.setTextColor(255, 215, 0); // Gold Color
    doc.text(`NET REVENUE: RS. ${totals.net.toFixed(2)}`, rightX, 40, { align: 'right' });

    // ৪. টেবিল রেন্ডারিং
    doc.autoTable({
        startY: 50,
        margin: { left: 15, right: 15 },
        head: [['Bill No', 'Date', 'Items & Details', 'Type', 'Disc.', 'Cost', 'Net Total', 'Profit', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [55, 65, 81], fontSize: 10 },
        styles: { fontSize: 9, cellPadding: 3, valign: 'middle' },
        columnStyles: {
            2: { cellWidth: 80 },
            6: { fontStyle: 'bold' },
            7: { fontStyle: 'bold' }
        },
        didParseCell: function(data) {
            if (data.column.index === 7 && data.section === 'body') {
                const val = parseFloat(data.cell.raw);
                if (val > 0) data.cell.styles.textColor = [22, 101, 52];
                else if (val < 0) data.cell.styles.textColor = [185, 28, 28];
            }
        }
    });

    // ৫. ফুটার
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${i} of ${totalPages}`, 15, pageHeight - 10);
        doc.text(`Developed by Keshab Sarkar`, pageWidth - 50, pageHeight - 10);
    }

    doc.save(`Sales_Report_${startStr}.pdf`);
};

// --- Event Listeners ---
function setupEventListeners() {
    // ডেট পরিবর্তন করলে সাথে সাথে আপডেট
    if (startDatePicker) startDatePicker.addEventListener('change', filterAndDisplayData);
    if (endDatePicker) endDatePicker.addEventListener('change', filterAndDisplayData);

    // সব চেক বক্সে ক্লিক করলে সাথে সাথে আপডেট
    document.querySelectorAll('.data-filter').forEach(el => {
        el.addEventListener('change', filterAndDisplayData);
    });

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