import { db, auth, collection, query, where, orderBy, getDocs, deleteDoc, doc, limit, startAfter } from "../js/firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const recordsList = document.getElementById('recordsList');
const filterFromDateInput = document.getElementById('filterFromDate');
const filterToDateInput = document.getElementById('filterToDate');
const filterMonthInput = document.getElementById('filterMonth');
const filterBtn = document.getElementById('filterBtn');
const thisMonthBtn = document.getElementById('thisMonthBtn');
const showAllBtn = document.getElementById('showAllBtn');
const printBtn = document.getElementById('printBtn');
const pdfBtn = document.getElementById('pdfBtn');
const loadMoreWrap = document.getElementById('loadMoreWrap');
const loadMoreBtn = document.getElementById('loadMoreBtn');

// বর্তমানে প্রদর্শিত ডাটা স্টোর করার জন্য ভেরিয়েবল
let currentData = [];
const PAGE_SIZE = 25;
let lastDocSnap = null;
let hasMore = false;
let activeFilter = null;
let isLoading = false;

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function toNumber(value, fallback = 0) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
}

function formatMoney(value) {
    return toNumber(value, 0).toFixed(2);
}

const KOLKATA_TZ = 'Asia/Kolkata';

function formatDateUi(dateStr) {
    const raw = String(dateStr ?? '').trim();
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return raw;
    const [, y, mm, dd] = m;
    return `${dd}/${mm}/${y}`;
}

function getNowInKolkataParts() {
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: KOLKATA_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    // en-CA gives YYYY-MM-DD
    const ymd = fmt.format(new Date());
    const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
    return { y, m, d, ymd };
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

function lastDayOfMonth(year, month1to12) {
    // JS Date month is 0-based; day 0 gives last day of previous month.
    return new Date(year, month1to12, 0).getDate();
}

function monthToRange(monthValue /* YYYY-MM */) {
    if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) return null;
    const [yStr, mStr] = monthValue.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const last = lastDayOfMonth(y, m);
    return { from: `${yStr}-${mStr}-01`, to: `${yStr}-${mStr}-${pad2(last)}` };
}

function normalizeRange(from, to) {
    const f = (from || '').trim();
    const t = (to || '').trim();
    if (!f && !t) return null;
    if (f && !t) return { from: f, to: f };
    if (!f && t) return { from: t, to: t };
    // Swap if user inverted
    return f <= t ? { from: f, to: t } : { from: t, to: f };
}

// পেজ লোড হলে সব ডাটা দেখাবে
window.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (!user) {
            // rules সাধারণত auth ছাড়া allow করে না; তাই login-এ পাঠিয়ে দিচ্ছি
            window.location.href = '../index.html';
            return;
        }
        // Default month selection (Kolkata)
        const now = getNowInKolkataParts();
        if (filterMonthInput && !filterMonthInput.value) {
            filterMonthInput.value = `${now.y}-${pad2(now.m)}`;
        }
        loadRecords();
    });
});

// ফিল্টার বাটন ক্লিক
if(filterBtn) {
    filterBtn.addEventListener('click', () => {
        // Priority: month filter, then from-to, then fallback show all
        const monthRange = monthToRange(filterMonthInput?.value || '');
        if (monthRange) {
            loadRecords({ range: monthRange });
            return;
        }

        const range = normalizeRange(filterFromDateInput?.value, filterToDateInput?.value);
        if (range) {
            loadRecords({ range });
            return;
        }

        alert("Select Month or From-To date to search!");
    });
}

if (thisMonthBtn) {
    thisMonthBtn.addEventListener('click', () => {
        const now = getNowInKolkataParts();
        const monthValue = `${now.y}-${pad2(now.m)}`;
        if (filterMonthInput) filterMonthInput.value = monthValue;
        const range = monthToRange(monthValue);
        if (range) loadRecords({ range });
    });
}

// Show All বাটন
if(showAllBtn) {
    showAllBtn.addEventListener('click', () => {
        if (filterFromDateInput) filterFromDateInput.value = '';
        if (filterToDateInput) filterToDateInput.value = '';
        if (filterMonthInput) filterMonthInput.value = '';
        loadRecords();
    });
}

function setLoadMoreVisible(visible) {
    if (!loadMoreWrap) return;
    loadMoreWrap.style.display = visible ? 'block' : 'none';
}

if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
        if (!hasMore || isLoading) return;
        loadRecords(activeFilter, { append: true });
    });
}

// প্রিন্ট বাটন ইভেন্ট
if (printBtn) {
    printBtn.addEventListener('click', async () => {
        if (currentData.length === 0) {
            alert("No data available to print!");
            return;
        }
        // If paginated and more exists, fetch remaining before printing.
        if (hasMore) {
            const ok = confirm("More records are available. Load all matching records for printing?");
            if (ok) {
                await loadAllForPrint();
            }
        }
        printReport();
    });
}

if (pdfBtn) {
    pdfBtn.addEventListener('click', async () => {
        if (currentData.length === 0) {
            alert("No data available to export!");
            return;
        }
        if (hasMore) {
            const ok = confirm("More records are available. Load all matching records before generating PDF?");
            if (ok) {
                await loadAllForPrint();
            }
        }
        downloadPdfReport();
    });
}

function buildReportTitle() {
    const monthValue = (filterMonthInput?.value || '').trim();
    const range = normalizeRange(filterFromDateInput?.value, filterToDateInput?.value);
    if (monthValue) return `Purchase Report • ${monthValue} (Kolkata)`;
    if (range) return `Purchase Report • ${formatDateUi(range.from)} - ${formatDateUi(range.to)} (Kolkata)`;
    return 'Purchase Report • All Records';
}

function downloadPdfReport() {
    const jsPdfNs = window.jspdf;
    if (!jsPdfNs?.jsPDF) {
        alert("PDF library not loaded. Please refresh once.");
        return;
    }

    const { jsPDF } = jsPdfNs;
    const docPdf = new jsPDF({ unit: 'pt', format: 'a4' });

    const title = buildReportTitle();
    const generatedAt = new Intl.DateTimeFormat('en-IN', { timeZone: KOLKATA_TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date());

    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(14);
    docPdf.text(title, 40, 40);

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(10);
    docPdf.text(`Generated: ${generatedAt}`, 40, 58);

    // Flatten rows for autoTable
    const rows = [];
    currentData.forEach((r) => {
        const items = Array.isArray(r?.items) ? r.items : [];
        if (items.length === 0) {
            rows.push([
                formatDateUi(r?.date || ''),
                r?.billName || '',
                '-',
                '-',
                '-',
                formatMoney(r?.totalAmount || 0)
            ]);
            return;
        }
        items.forEach((it, idx) => {
            rows.push([
                idx === 0 ? formatDateUi(r?.date || '') : '',
                idx === 0 ? (r?.billName || '') : '',
                it?.itemName || '',
                it?.itemQty || '-',
                formatMoney(it?.itemPrice || 0),
                idx === 0 ? formatMoney(r?.totalAmount || 0) : ''
            ]);
        });
        // spacer row
        rows.push(['', '', '', '', '', '']);
    });

    docPdf.autoTable({
        startY: 78,
        head: [['Date', 'Supplier/Bill', 'Item', 'Qty', 'Line Total (₹)', 'Bill Total (₹)']],
        body: rows,
        styles: { fontSize: 9, cellPadding: 4, valign: 'top' },
        headStyles: { fillColor: [44, 62, 80] },
        columnStyles: {
            0: { cellWidth: 70 },
            1: { cellWidth: 140 },
            2: { cellWidth: 170 },
            3: { cellWidth: 60 },
            4: { cellWidth: 80, halign: 'right' },
            5: { cellWidth: 80, halign: 'right' }
        },
        didParseCell: (data) => {
            // lighter spacer row
            const isSpacer = data.row?.raw?.every((c) => c === '');
            if (isSpacer) {
                data.cell.styles.fillColor = [255, 255, 255];
                data.cell.styles.lineWidth = 0;
            }
        }
    });

    const filenameSafe = title.replaceAll(/[^\w\- ]+/g, '').replaceAll(/\s+/g, '_').slice(0, 60);
    docPdf.save(`${filenameSafe || 'purchase_report'}.pdf`);
}

// ডাটা লোড ফাংশন
async function loadRecords(filter = null, { append = false } = {}) {
    if (isLoading) return;
    isLoading = true;

    if (!append) {
        recordsList.innerHTML = `
            <div class="loading-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>Loading records...</p>
            </div>`;
        currentData = [];
        lastDocSnap = null;
        hasMore = false;
        activeFilter = filter || null;
        setLoadMoreVisible(false);
    }
    
    try {
        const activeShopId = localStorage.getItem('activeShopId');
        const user = auth?.currentUser;
        if (!user) {
            recordsList.innerHTML = '<p style="text-align: center; color: red;">Please login first.</p>';
            return;
        }
        if (!activeShopId) {
            recordsList.innerHTML = '<p style="text-align: center; color: red;">Active shop not found. Please login again.</p>';
            return;
        }

        const recordsRef = collection(db, "shops", activeShopId, "purchase_notes_isolated");
        let q;

        const range = filter?.range || null;
        if (range?.from && range?.to) {
            // date stored as YYYY-MM-DD string; lexicographic range works.
            q = query(
                recordsRef,
                where("date", ">=", range.from),
                where("date", "<=", range.to),
                orderBy("date", "desc"),
                limit(PAGE_SIZE)
            );
        } else {
            q = query(recordsRef, orderBy("date", "desc"), limit(PAGE_SIZE));
        }

        if (append && lastDocSnap) {
            // Rebuild query with cursor
            if (range?.from && range?.to) {
                q = query(
                    recordsRef,
                    where("date", ">=", range.from),
                    where("date", "<=", range.to),
                    orderBy("date", "desc"),
                    startAfter(lastDocSnap),
                    limit(PAGE_SIZE)
                );
            } else {
                q = query(recordsRef, orderBy("date", "desc"), startAfter(lastDocSnap), limit(PAGE_SIZE));
            }
        }

        const querySnapshot = await getDocs(q);

        if (!append) {
            recordsList.innerHTML = '';
        }

        if (!append && querySnapshot.empty) {
            recordsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #7f8c8d;">
                    <i class="far fa-folder-open" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>No records found!</p>
                </div>`;
            setLoadMoreVisible(false);
            return;
        }

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            currentData.push({ id: docSnap.id, ...data });
            createRecordCard(data, docSnap.id);
        });

        lastDocSnap = querySnapshot.docs[querySnapshot.docs.length - 1] || lastDocSnap;
        hasMore = querySnapshot.size === PAGE_SIZE;
        setLoadMoreVisible(hasMore);

    } catch (error) {
        console.error("Error getting documents: ", error);
        if (error?.code === 'permission-denied') {
            const activeShopId = localStorage.getItem('activeShopId');
            const user = auth?.currentUser;
            recordsList.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #c0392b;">
                    <p><strong>Access denied.</strong> Firestore rules blocked reading purchase records.</p>
                    <p style="font-size:12px; opacity:0.9; margin-top:10px;">
                        Debug: shopId=${escapeHtml(activeShopId)} • uid=${escapeHtml(user?.uid)} • email=${escapeHtml(user?.email)}
                    </p>
                    <p style="font-size:12px; opacity:0.9; margin-top:10px;">
                        If you recently changed rules, try saving a NEW record first.
                    </p>
                </div>`;
            return;
        }
        recordsList.innerHTML = '<p style="text-align: center; color: red;">Error loading data. Check console.</p>';
        setLoadMoreVisible(false);
    } finally {
        isLoading = false;
    }
}

async function loadAllForPrint() {
    // Fetch remaining pages for activeFilter and append into currentData silently.
    while (hasMore) {
        await loadRecords(activeFilter, { append: true });
        // Safety: prevent infinite loop if something goes wrong.
        if (!lastDocSnap) break;
    }
}

// কার্ড তৈরি করার ফাংশন
function createRecordCard(data, id) {
    const card = document.createElement('div');
    card.className = 'record-card';
    card.id = `record-${id}`;

    let itemsHtml = '';
    if (data.items && Array.isArray(data.items)) {
        data.items.forEach((item, index) => {
            itemsHtml += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${escapeHtml(item.itemName)}</td>
                    <td>${escapeHtml(item.itemQty || '-')}</td>
                    <td>₹ ${formatMoney(item.itemPrice)}</td>
                </tr>
            `;
        });
    }

    card.innerHTML = `
        <div class="record-header" onclick="toggleDetails('${id}')">
            <div class="record-info">
                <h3>${escapeHtml(data.billName || 'Unknown Shop')}</h3>
                <span class="record-date"><i class="far fa-calendar-alt"></i> ${escapeHtml(formatDateUi(data.date))}</span>
            </div>
            <div class="record-right">
                <span class="record-total">₹ ${formatMoney(data.totalAmount)}</span>
                ${data.billImageUrl ? `<a class="bill-image-link" href="${escapeHtml(data.billImageUrl)}" target="_blank" rel="noopener noreferrer" title="View bill image" onclick="event.stopPropagation()"><i class="fas fa-receipt"></i> View Bill</a>` : ``}
                <a class="bill-image-link" href="purchase-record.html?id=${encodeURIComponent(id)}" title="Edit this record" onclick="event.stopPropagation()">
                    <i class="fas fa-pen"></i> Edit
                </a>
                <span class="click-hint">Click to view items</span>
            </div>
        </div>

        <div class="items-container" id="details-${id}">
            <table class="mini-table">
                <thead>
                    <tr>
                        <th>No.</th>
                        <th>Item Name</th>
                        <th>Qty</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>
            
            <button onclick="deleteRecord('${id}')" class="btn-delete-record">
                <i class="fas fa-trash-alt"></i> Delete Record
            </button>
        </div>
    `;

    recordsList.appendChild(card);
}

// =======================================================
//   FULL DETAILS PRINT FUNCTION
// =======================================================
function printReport() {
    const grandTotal = currentData.reduce((sum, record) => sum + toNumber(record.totalAmount || 0, 0), 0);
    const monthValue = (filterMonthInput?.value || '').trim();
    const range = normalizeRange(filterFromDateInput?.value, filterToDateInput?.value);
    const reportDate = monthValue
        ? `Month: ${escapeHtml(monthValue)} (Kolkata)`
        : range
            ? `Date Range: ${escapeHtml(formatDateUi(range.from))} → ${escapeHtml(formatDateUi(range.to))} (Kolkata)`
            : "All Records History";

    const printWindow = window.open('', '', 'height=600,width=800');

    let tableContent = '';

    currentData.forEach((record, index) => {
        tableContent += `
            <tr class="bill-header-row">
                <td>${index + 1}</td>
                <td colspan="3">
                    <strong>${escapeHtml(record.billName)}</strong> 
                    <span style="font-size: 12px; color: #555; margin-left: 10px;">(Date: ${escapeHtml(formatDateUi(record.date))})</span>
                </td>
            </tr>
        `;

        if (record.items && record.items.length > 0) {
            record.items.forEach(item => {
                tableContent += `
                    <tr class="item-row">
                        <td></td>
                        <td style="padding-left: 25px;">• ${escapeHtml(item.itemName)}</td>
                        <td style="text-align: center;">${escapeHtml(item.itemQty || '-')}</td>
                        <td style="text-align: right;">${formatMoney(item.itemPrice)}</td>
                    </tr>
                `;
            });
        }

        tableContent += `
            <tr class="bill-total-row">
                <td colspan="3" style="text-align: right;">Bill Total:</td>
                <td style="text-align: right;">₹ ${formatMoney(record.totalAmount)}</td>
            </tr>
            <tr><td colspan="4" style="border: none; height: 10px;"></td></tr>
        `;
    });

    printWindow.document.write(`
        <html>
        <head>
            <title>Detailed Purchase Report</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #333; }
                h1 { text-align: center; margin-bottom: 5px; color: #2c3e50; }
                .subtitle { text-align: center; color: #7f8c8d; margin-bottom: 30px; font-size: 14px; }
                table { width: 100%; border-collapse: collapse; font-size: 13px; }
                th { background-color: #2c3e50; color: white; padding: 8px; text-align: left; }
                td { border: 1px solid #ddd; padding: 6px 8px; }
                .bill-header-row td { background-color: #f0f2f5; font-weight: bold; border-bottom: none; }
                .item-row td { border-top: none; border-bottom: 1px dotted #eee; color: #444; }
                .bill-total-row td { font-weight: bold; background-color: #fff; border-top: 1px solid #999; }
                .grand-total { background-color: #2ecc71 !important; color: white; font-size: 16px; font-weight: bold; }
                .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
            </style>
        </head>
        <body>
            <h1>Purchase Detail Report</h1>
            <p class="subtitle">Report Filter: ${reportDate}</p>

            <table>
                <thead>
                    <tr>
                        <th width="5%">SL</th>
                        <th width="55%">Description / Item Name</th>
                        <th width="20%" style="text-align: center;">Qty</th>
                        <th width="20%" style="text-align: right;">Price (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableContent}
                </tbody>
                <tfoot>
                    <tr class="grand-total">
                        <td colspan="3" style="text-align: right; color: white;">GRAND TOTAL COST:</td>
                        <td style="text-align: right; color: white;">₹ ${grandTotal.toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>

            <div class="footer">
                Generated via Smart POS • Printed on: ${new Date().toLocaleString()}
            </div>
        </body>
        </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}

// গ্লোবাল ফাংশন (HTML onclick এর জন্য)
window.toggleDetails = function(id) {
    const container = document.getElementById(`details-${id}`);
    if (container.style.display === "block") {
        container.style.display = "none";
    } else {
        container.style.display = "block";
    }
}

window.deleteRecord = async function(id) {
    if (!confirm("Are you sure you want to delete this purchase record?")) {
        return;
    }

    try {
        const activeShopId = localStorage.getItem('activeShopId');
        await deleteDoc(doc(db, "shops", activeShopId, "purchase_notes_isolated", id));
        
        // অ্যারে থেকে রিমুভ করা
        currentData = currentData.filter(item => item.id !== id);

        const cardElement = document.getElementById(`record-${id}`);
        if (cardElement) {
            cardElement.style.transition = "all 0.5s ease";
            cardElement.style.opacity = "0";
            cardElement.style.transform = "translateX(100px)";
            
            setTimeout(() => {
                cardElement.remove();
            }, 500);
        }
        
    } catch (error) {
        console.error("Error removing document: ", error);
        alert("Error deleting record: " + error.message);
    }
}