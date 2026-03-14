import { db, auth } from '../js/firebase-config.js';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
    collection, getDocs, getDoc, query, orderBy, doc, updateDoc, runTransaction, writeBatch, increment, where
} from 'firebase/firestore';

// --- DOM Elements ---
const totalSalesTodayEl = document.getElementById('total-sales-today');
const totalSalesMonthEl = document.getElementById('total-sales-month');
const overallTotalSalesEl = document.getElementById('overall-total-sales');

const startDatePicker = document.getElementById('start-date');
const endDatePicker = document.getElementById('end-date');
const filterBtn = document.getElementById('filter-btn');
const whatsappBtn = document.getElementById('whatsapp-btn');

const filteredCashSalesEl = document.getElementById('filtered-cash-sales');
const filteredCardSalesEl = document.getElementById('filtered-card-sales');
const filteredTotalDiscountEl = document.getElementById('filtered-total-discount');

const salesTableBody = document.getElementById('sales-table-body');
const logoutBtn = document.getElementById('logout-btn');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mainNavLinks = document.getElementById('main-nav-links');

// --- Global Variables ---
let activeShopId = null;
let allSalesData = []; 
let myShopName = "My Smart Shop";
let filteredSalesForPDF = []; // PDF এর জন্য আলাদা গ্লোবাল ভ্যারিয়েবল 

// --- Auth & Initialization ---
onAuthStateChanged(auth, (user) => {
    if (user) {
        activeShopId = localStorage.getItem('activeShopId'); if (!activeShopId) { window.location.href = '../index.html'; return; }
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
        let shopDocRef = doc(db, 'shops', activeShopId, 'settings', 'profile');
        let shopDoc = await getDoc(shopDocRef);

        if (shopDoc.exists()) {
            const data = shopDoc.data();
            if(data.shopName) myShopName = data.shopName;
        } else {
            shopDocRef = doc(db, 'shops', activeShopId);
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
    if (!activeShopId) return;
    if (salesTableBody) salesTableBody.innerHTML = '<tr><td colspan="10" class="loading-cell">Loading data...</td></tr>';
    
    try {
        const salesRef = collection(db, 'shops', activeShopId, 'sales');
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
    let todayTotal = 0, monthTotal = 0, overallTotal = 0;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    sales.forEach(sale => {
        // cancelled এবং canceled দুটোই চেক করা হচ্ছে
        if (sale.status === 'canceled' || sale.status === 'cancelled') return;
        
        const netTotal = sale.total;
        overallTotal += netTotal;
        if (sale.createdAt.toDate() >= startOfToday) todayTotal += netTotal;
        if (sale.createdAt.toDate() >= startOfMonth) monthTotal += netTotal;
    });

    if(totalSalesTodayEl) totalSalesTodayEl.textContent = `₹${todayTotal.toFixed(2)}`;
    if(totalSalesMonthEl) totalSalesMonthEl.textContent = `₹${monthTotal.toFixed(2)}`;
    if(overallTotalSalesEl) overallTotalSalesEl.textContent = `₹${overallTotal.toFixed(2)}`;
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

    filteredSalesForPDF = allSalesData.filter(sale => {
        const d = sale.createdAt.toDate();
        const method = (sale.paymentMethod || 'cash').toLowerCase();
        const hasDiscount = (sale.discountAmount || sale.discount || 0) > 0;

        if (d < startDate || d > endDate) return false;
        if (sale.status === 'canceled' || sale.status === 'cancelled') return false;

        // --- ফিল্টার লজিক ফিক্স ---
        let checkMethod = method;
        if (method === 'upi' || method === 'card') checkMethod = 'online';

        if (selectedMethods.length > 0 && !selectedMethods.includes(checkMethod)) return false;
        if (showOnlyDiscount && !hasDiscount) return false;

        return true;
    });

    calculateFilteredPaymentSummary(filteredSalesForPDF);
    renderSalesTable(filteredSalesForPDF);
}

function calculateFilteredPaymentSummary(sales) {
    let cashTotal = 0, onlineTotal = 0, discountTotal = 0;

    sales.forEach(sale => {
        if (sale.status === 'canceled' || sale.status === 'cancelled') return;
        
        discountTotal += (sale.discountAmount || sale.discount || 0);

        if (sale.paymentMethod === 'part-payment' && sale.paymentBreakdown) {
            // পার্ট পেমেন্টের ব্রেকডাউন থেকে নিখুঁত হিসাব
            const pCash = parseFloat(sale.paymentBreakdown.cash) || 0;
            // upi, online, card—সবগুলোকে অনলাইন হিসেবে যোগ করা
            const pOnline = (parseFloat(sale.paymentBreakdown.upi) || 0) + 
                           (parseFloat(sale.paymentBreakdown.online) || 0) + 
                           (parseFloat(sale.paymentBreakdown.card) || 0);
            
            cashTotal += pCash;
            onlineTotal += pOnline;
        } else if (sale.paymentMethod === 'cash') {
            cashTotal += (sale.total || 0);
        } else {
            onlineTotal += (sale.total || 0);
        }
    });

    if(filteredCashSalesEl) filteredCashSalesEl.textContent = `₹${cashTotal.toFixed(2)}`;
    if(filteredCardSalesEl) filteredCardSalesEl.textContent = `₹${onlineTotal.toFixed(2)}`;
    if(filteredTotalDiscountEl) filteredTotalDiscountEl.textContent = `₹${discountTotal.toFixed(2)}`;
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
        if (sale.status === 'canceled' || sale.status === 'cancelled') return;
        
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
        let payMethodHTML = '';
        
        if (sale.paymentMethod === 'part-payment' && sale.paymentBreakdown) {
            const onlineTotal = (sale.paymentBreakdown.online || sale.paymentBreakdown.upi || 0) + (sale.paymentBreakdown.card || 0);
            payMethodHTML = `
                <div class="type-container">
                    <span class="badge badge-warning">PART-PAY</span>
                    <div class="part-breakdown">C: ₹${(sale.paymentBreakdown.cash || 0).toFixed(0)} | O: ₹${onlineTotal.toFixed(0)}</div>
                </div>
            `;
        } else {
            payMethodHTML = `<span class="badge badge-${payMethod.toLowerCase() === 'cash' ? 'success' : 'warning'}">${payMethod}</span>`;
        }

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

        if (sale.status === 'canceled' || sale.status === 'cancelled') {
            row.classList.add('sale-canceled');
            actionHTML = `<span style="color:red; font-weight:bold; font-size:12px;">CANCELED</span>`;
        } else {
            // সব বিলের জন্য সব বাটন দেখাবে (লক সিস্টেম বন্ধ করা হয়েছে)
            actionHTML = `
                <div class="action-buttons">
                    <button class="btn-icon btn-edit edit-pay-btn" data-sale-id="${sale.id}" title="Edit Payment">${iconEdit}</button>
                    <button class="btn-icon btn-print reprint-btn" data-sale-id="${sale.id}" title="Print Receipt">${iconPrint}</button>
                    <button class="btn-icon btn-delete cancel-bill-btn" data-sale-id="${sale.id}" title="Cancel Bill">${iconTrash}</button>
                    <button class="btn-icon btn-edit edit-cp-btn" data-sale-id="${sale.id}" title="Edit Cost Price" style="background:#9b59b6;"><i class="fa-solid fa-dollar-sign"></i></button>
                </div>
            `;
        }

        row.innerHTML = `
            <td style="font-weight:600;">${displayBillNumber}</td>
            <td>${saleDateStr}</td>
            <td>${sale.items ? sale.items.length : 0}</td>
            <td class="details-column">${detailsHTML}</td>
            <td>${payMethodHTML}</td>
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
        const settingsRef = doc(db, 'shops', activeShopId, 'settings', 'security');
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
window.openPaymentEdit = async (saleId) => {
    const saleRef = doc(db, 'shops', activeShopId, 'sales', saleId);
    const snap = await getDoc(saleRef);
    if (!snap.exists()) return;
    
    const data = snap.data();
    const saleTotal = data.total || 0;
    
    document.getElementById('edit-sale-id').value = saleId;
    document.getElementById('edit-total-display').textContent = `₹${saleTotal.toFixed(2)}`;
    document.getElementById('new-payment-method').value = data.paymentMethod || 'cash';
    
    // পার্ট পেমেন্ট সেকশন কন্ট্রোল
    const partArea = document.getElementById('edit-part-area');
    if (data.paymentMethod === 'part-payment') {
        partArea.classList.remove('hidden');
        document.getElementById('edit-part-cash').value = data.paymentBreakdown?.cash || 0;
        document.getElementById('edit-part-upi').value = data.paymentBreakdown?.upi || data.paymentBreakdown?.online || 0;
        document.getElementById('edit-part-card').value = data.paymentBreakdown?.card || 0;
    } else {
        partArea.classList.add('hidden');
    }
    
    // স্মার্ট অটো-ক্যালকুলেশন
    const cashInput = document.getElementById('edit-part-cash');
    const upiInput = document.getElementById('edit-part-upi');
    const cardInput = document.getElementById('edit-part-card');
    
    cashInput.oninput = () => {
        const cash = parseFloat(cashInput.value) || 0;
        const remaining = Math.max(0, saleTotal - cash);
        upiInput.value = remaining.toFixed(2);
        cardInput.value = 0;
    };
    
    document.getElementById('edit-payment-modal').classList.remove('hidden');
};

async function handleEditPayment(saleId) {
    openPaymentEdit(saleId);
}

async function handleCancelBill(saleId) {
    const isAuthorized = await verifyAdminPIN();
    if (!isAuthorized) return;

    const reason = prompt("বিক্রয় বাতিলের কারণ লিখুন:");
    if(!reason) { alert("কারণ উল্লেখ করা বাধ্যতামূলক!"); return; }

    if(!confirm("আপনি কি নিশ্চিত? পণ্যগুলো স্টকে ফেরত যাবে এবং এই বিক্রয়টি বাতিল হিসেবে চিহ্নিত হবে।")) return;

    try {
        // ব্যাচ ব্যবহার করে একসাথে সব আপডেট করা
        const batch = writeBatch(db);
        
        // বিলের ডাটা আনা
        const saleRef = doc(db, 'shops', activeShopId, 'sales', saleId);
        const saleSnap = await getDoc(saleRef);
        
        if (!saleSnap.exists()) {
            alert("বিল খুঁজে পাওয়া যায়নি!");
            return;
        }
        
        const saleData = saleSnap.data();
        
        if (saleData.status === 'cancelled' || saleData.status === 'canceled') {
            alert("এই বিলটি আগেই বাতিল করা হয়েছে।");
            return;
        }
        
        // বিল ক্যানসেল করা (cancelled-bills মডিউলের সাথে সামঞ্জস্যপূর্ণ)
        batch.update(saleRef, {
            status: 'cancelled', // cancelled-bills মডিউলের জন্য
            cancellationReason: reason,
            cancelledAt: new Date(),
            cancelledBy: 'Admin'
        });
        
        // স্টক ফেরত পাঠানো
        if (saleData.items && Array.isArray(saleData.items)) {
            saleData.items.forEach(item => {
                if (item.id) {
                    const productRef = doc(db, 'shops', activeShopId, 'inventory', item.id);
                    batch.update(productRef, {
                        stock: increment(item.quantity)
                    });
                }
            });
        }
        
        // ব্যাচ কমিট করা
        await batch.commit();
        
        // লোকাল ডাটা আপডেট
        const s = allSalesData.find(x => x.id === saleId);
        if(s) s.status = 'cancelled';
        
        calculateTopSummaries(allSalesData);
        filterAndDisplayData();
        alert("✅ বিক্রয়টি সফলভাবে বাতিল করা হয়েছে এবং স্টক আপডেট হয়েছে।");

    } catch(e) { 
        console.error("Cancel error:", e); 
        alert("❌ বিক্রয় বাতিল করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
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
        if (saleDate >= startOfToday && sale.status !== 'canceled' && sale.status !== 'cancelled') {
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
        const isCanceled = sale.status === 'canceled' || sale.status === 'cancelled';
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

        // PDF হেডার সামারি ক্যালকুলেশন (পার্ট পেমেন্ট হ্যান্ডলিং সহ)
        if (!isCanceled) {
            if (method === 'part-payment' && sale.paymentBreakdown) {
                totals.cash += (sale.paymentBreakdown.cash || 0);
                totals.online += (sale.paymentBreakdown.upi || 0) + (sale.paymentBreakdown.card || 0) + (sale.paymentBreakdown.online || 0);
            } else if (method === 'cash') {
                totals.cash += netTotal;
            } else {
                totals.online += netTotal;
            }
            
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
            if (btn.classList.contains('edit-pay-btn')) handleEditPayment(id);
            if (btn.classList.contains('reprint-btn')) window.open(`../billing/print.html?saleId=${id}`, '_blank');
            if (btn.classList.contains('cancel-bill-btn')) handleCancelBill(id);
            if (btn.classList.contains('edit-cp-btn')) window.openEditCPModal(id);
        });
    }

    document.getElementById('close-payment-modal')?.addEventListener('click', () => {
        document.getElementById('edit-payment-modal').classList.add('hidden');
    });

    document.getElementById('new-payment-method')?.addEventListener('change', (e) => {
        const partArea = document.getElementById('edit-part-area');
        if (e.target.value === 'part-payment') {
            partArea.classList.remove('hidden');
            const total = parseFloat(document.getElementById('edit-total-display').textContent.replace('₹','')) || 0;
            document.getElementById('edit-part-cash').value = total.toFixed(2);
            document.getElementById('edit-part-upi').value = 0;
            document.getElementById('edit-part-card').value = 0;
        } else {
            partArea.classList.add('hidden');
        }
    });

    document.getElementById('btn-save-new-payment')?.addEventListener('click', async () => {
        const saleId = document.getElementById('edit-sale-id').value;
        const method = document.getElementById('new-payment-method').value;
        const saleTotal = parseFloat(document.getElementById('edit-total-display').textContent.replace('₹',''));
        
        let updateData = { paymentMethod: method };
        
        if (method === 'part-payment') {
            const cashAmt = parseFloat(document.getElementById('edit-part-cash').value) || 0;
            const upiAmt = parseFloat(document.getElementById('edit-part-upi').value) || 0;
            const cardAmt = parseFloat(document.getElementById('edit-part-card').value) || 0;

            // ভ্যালিডেশন: ব্রেকডাউন কি টোটালের সমান?
            if (Math.abs((cashAmt + upiAmt + cardAmt) - saleTotal) > 0.1) {
                alert("❌ Error: Breakdown sum must match the Total Bill Amount!");
                return;
            }

            updateData.paymentBreakdown = {
                cash: cashAmt,
                upi: upiAmt,
                card: cardAmt
            };
        }

        try {
            await updateDoc(doc(db, 'shops', activeShopId, 'sales', saleId), updateData);
            
            // লোকাল ডাটা আপডেট করা
            const saleIndex = allSalesData.findIndex(x => x.id === saleId);
            if(saleIndex !== -1) {
                allSalesData[saleIndex].paymentMethod = method;
                if(updateData.paymentBreakdown) allSalesData[saleIndex].paymentBreakdown = updateData.paymentBreakdown;
            }

            calculateTopSummaries(allSalesData);
            filterAndDisplayData();
            document.getElementById('edit-payment-modal').classList.add('hidden');
            alert("✅ Payment method and summary updated!");
        } catch (e) { 
            console.error(e);
            alert("Error updating payment."); 
        }
    });

    if (logoutBtn) logoutBtn.addEventListener('click', async () => await signOut(auth));
    if (mobileMenuBtn && mainNavLinks) {
        mobileMenuBtn.addEventListener('click', () => mainNavLinks.classList.toggle('mobile-nav-active'));
    }
}


// ============================================================================
// 🔴 EDIT COST PRICE (CP) MODAL LOGIC - SYNC WITH INVENTORY & EXPENSE
// ============================================================================
let currentEditingSaleId = null;
let currentEditingSaleData = null;

window.openEditCPModal = async function(saleId) {
    currentEditingSaleId = saleId;
    const saleRef = doc(db, 'shops', activeShopId, 'sales', saleId);
    const snap = await getDoc(saleRef);
    
    if(!snap.exists()) {
        alert("Bill not found!");
        return;
    }
    
    currentEditingSaleData = snap.data();
    const editTbody = document.getElementById('edit-cp-tbody');
    editTbody.innerHTML = '';

    if (currentEditingSaleData.items && Array.isArray(currentEditingSaleData.items)) {
        currentEditingSaleData.items.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.quantity}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">₹${(item.price || 0).toFixed(2)}</td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">
                    <input type="number" class="form-control edit-cp-input" data-index="${index}" value="${item.costPrice || 0}" style="width: 100px; padding: 5px; border: 2px solid #3498db; border-radius: 4px;">
                </td>
            `;
            editTbody.appendChild(tr);
        });
    }

    document.getElementById('edit-cp-modal').style.display = 'flex';
}

document.getElementById('close-cp-modal')?.addEventListener('click', () => {
    document.getElementById('edit-cp-modal').style.display = 'none';
});

document.getElementById('save-cp-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('save-cp-btn');
    btn.disabled = true;
    btn.textContent = "Saving & Syncing...";

    try {
        const inputs = document.querySelectorAll('.edit-cp-input');
        let updatedItems = [...currentEditingSaleData.items];
        let newTotalCost = 0;

        // 1. Get new CPs from inputs
        inputs.forEach(input => {
            const index = input.getAttribute('data-index');
            const newCp = parseFloat(input.value) || 0;
            updatedItems[index].costPrice = newCp;
        });

        // 2. Calculate new Total Cost
        updatedItems.forEach(item => {
            newTotalCost += (item.costPrice * item.quantity);
        });

        // 3. Calculate new Profit
        const netTotal = currentEditingSaleData.finalPaidAmount || currentEditingSaleData.total || 0;
        const newProfit = netTotal - newTotalCost;

        const batch = writeBatch(db);

        // --- A. Update Sale Document ---
        const saleRef = doc(db, 'shops', activeShopId, 'sales', currentEditingSaleId);
        batch.update(saleRef, {
            items: updatedItems,
            profit: newProfit
        });

        // --- B. Update Inventory & Expenses ---
        for (const item of updatedItems) {
            if (item.id) {
                // Update Inventory CP
                const invRef = doc(db, 'shops', activeShopId, 'inventory', item.id);
                batch.update(invRef, { costPrice: item.costPrice });

                // Update Expense (Find expense by relatedProductId)
                const expQ = query(
                    collection(db, 'shops', activeShopId, 'expenses'),
                    where('relatedProductId', '==', item.id)
                );
                const expSnap = await getDocs(expQ);
                
                if (!expSnap.empty) {
                    const expenses = [];
                    expSnap.forEach(d => {
                        const data = d.data();
                        if (data.category === 'inventory_purchase' || data.category === 'Inventory Purchase') {
                            expenses.push({ id: d.id, ref: d.ref, ...data });
                        }
                    });
                    
                    if (expenses.length > 0) {
                        // সবচেয়ে শেষের (Latest) এন্ট্রিটি বের করা
                        expenses.sort((a, b) => b.date.toMillis() - a.date.toMillis());
                        const latestExp = expenses[0];
                        
                        // নতুন এমাউন্ট হিসাব করা (নতুন দাম * পরিমাণ)
                        const qty = latestExp.quantity || 1;
                        const newAmount = item.costPrice * qty;
                        
                        // Expense আপডেট করা
                        batch.update(latestExp.ref, {
                            unitPrice: item.costPrice,
                            amount: newAmount
                        });
                    }
                }
            }
        }

        // Commit all changes together
        await batch.commit();
        
        alert("✅ Cost Price updated successfully! Inventory and Expenses have been synced.");
        document.getElementById('edit-cp-modal').style.display = 'none';
        
        // Reload Data
        fetchAllSalesAndRender();

    } catch (error) {
        console.error("Error updating CP:", error);
        alert("Failed to update Cost Price.");
    } finally {
        btn.disabled = false;
        btn.textContent = "💾 Save & Sync Everywhere";
    }
});
