import { db } from '../js/firebase-config.js';
import {
    doc, updateDoc, collection, getDocs, query,
    orderBy, limit, where
} from 'firebase/firestore';

// Wait for inventory.js to initialize
function waitForInventory(cb) {
    if (window.inventoryState && window.inventoryFns) {
        cb();
    } else {
        setTimeout(() => waitForInventory(cb), 100);
    }
}

waitForInventory(() => {
    const state = window.inventoryState;
    const fns   = window.inventoryFns;

    // ============================================================
    // 1. QUICK STOCK UPDATE — stock cell click করলে popup আসবে
    // ============================================================
    const popup     = document.getElementById('quick-stock-popup');
    const qsName    = document.getElementById('quick-stock-name');
    const qsInput   = document.getElementById('qs-input');
    const qsMinus   = document.getElementById('qs-minus');
    const qsPlus    = document.getElementById('qs-plus');
    const qsSave    = document.getElementById('qs-save');
    const qsCancel  = document.getElementById('qs-cancel');
    let qsProductId = null;

    document.getElementById('inventory-tbody').addEventListener('click', e => {
        const cell = e.target.closest('.stock-cell');
        if (!cell) return;
        const row = cell.closest('tr');
        const id  = row.querySelector('.btn-edit')?.dataset.id;
        if (!id) return;

        const product = state.allProducts.find(p => p.id === id);
        if (!product) return;

        qsProductId = id;
        qsName.textContent = product.name;
        qsInput.value = parseInt(product.stock) || 0;

        const rect = cell.getBoundingClientRect();
        popup.style.top  = (rect.bottom + window.scrollY + 8) + 'px';
        popup.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 240) + 'px';
        popup.style.display = 'block';
        qsInput.focus();
        qsInput.select();
    });

    qsMinus.addEventListener('click', () => { qsInput.value = Math.max(0, parseInt(qsInput.value) - 1); });
    qsPlus.addEventListener('click',  () => { qsInput.value = parseInt(qsInput.value) + 1; });
    qsCancel.addEventListener('click', () => { popup.style.display = 'none'; });

    document.addEventListener('click', e => {
        if (!popup.contains(e.target) && !e.target.closest('.stock-cell')) {
            popup.style.display = 'none';
        }
    });

    qsSave.addEventListener('click', async () => {
        const newStock = parseInt(qsInput.value);
        if (isNaN(newStock) || newStock < 0) return;

        const product = state.allProducts.find(p => p.id === qsProductId);
        if (!product) return;

        try {
            qsSave.textContent = '...';
            await updateDoc(doc(db, 'shops', state.activeShopId, 'inventory', qsProductId), {
                stock: newStock, lastUpdated: new Date()
            });
            await fns.saveInventoryLog(qsProductId, product.name, 'QUICK_UPDATE', product.stock, newStock);
            fns.showStatus(`✅ ${product.name} stock updated to ${newStock}`, 'success');
            popup.style.display = 'none';
        } catch (e) {
            console.error('Quick Stock Update Error:', e);
            fns.showStatus('❌ Update failed', 'error');
        } finally {
            qsSave.textContent = 'Save';
        }
    });

    // ============================================================
    // 2. BULK PRICE UPDATE
    // ============================================================
    const bulkModal    = document.getElementById('bulk-price-modal');
    const bulkCatSel   = document.getElementById('bulk-price-category');
    const bulkType     = document.getElementById('bulk-price-type');
    const bulkValue    = document.getElementById('bulk-price-value');
    const bulkLabel    = document.getElementById('bulk-price-label');
    const bulkPreview  = document.getElementById('bulk-price-preview');
    const bulkApply    = document.getElementById('bulk-price-apply');

    document.getElementById('bulk-price-btn').addEventListener('click', () => {
        // Populate categories
        const cats = [...new Set(state.allProducts.map(p => p.category).filter(Boolean))].sort();
        bulkCatSel.innerHTML = '<option value="">All Categories</option>' +
            cats.map(c => `<option value="${c}">${c}</option>`).join('');
        bulkModal.style.display = 'flex';
        updateBulkPreview();
    });

    document.getElementById('close-bulk-price').addEventListener('click', () => bulkModal.style.display = 'none');
    bulkModal.addEventListener('click', e => { if (e.target === bulkModal) bulkModal.style.display = 'none'; });

    const typeLabels = {
        sp_percent: 'Percentage (+ বাড়াতে, - কমাতে):',
        sp_fixed:   'Fixed Amount (+ যোগ, - বিয়োগ):',
        sp_from_cp: 'Margin % (CP এর উপর):'
    };

    bulkType.addEventListener('change', () => {
        bulkLabel.textContent = typeLabels[bulkType.value];
        updateBulkPreview();
    });
    bulkCatSel.addEventListener('change', updateBulkPreview);
    bulkValue.addEventListener('input', updateBulkPreview);

    function updateBulkPreview() {
        const cat = bulkCatSel.value;
        const val = parseFloat(bulkValue.value);
        const products = state.allProducts.filter(p => !cat || p.category === cat);

        if (isNaN(val) || products.length === 0) {
            bulkPreview.innerHTML = `<strong>${products.length}</strong> products selected`;
            return;
        }

        let sample = products.slice(0, 3).map(p => {
            const sp = parseFloat(p.sellingPrice) || 0;
            const cp = parseFloat(p.costPrice) || 0;
            let newSP;
            if (bulkType.value === 'sp_percent') newSP = sp + (sp * val / 100);
            else if (bulkType.value === 'sp_fixed') newSP = sp + val;
            else newSP = cp + (cp * val / 100);
            return `<div>${p.name}: ₹${sp.toFixed(0)} → <strong style="color:#16a34a;">₹${Math.round(newSP)}</strong></div>`;
        }).join('');

        bulkPreview.innerHTML = `<strong>${products.length}</strong> products affected<br><br>${sample}${products.length > 3 ? `<div style="color:#999;">...and ${products.length - 3} more</div>` : ''}`;
    }

    bulkApply.addEventListener('click', async () => {
        const cat = bulkCatSel.value;
        const val = parseFloat(bulkValue.value);
        if (isNaN(val)) { alert('Value দিন'); return; }

        const products = state.allProducts.filter(p => !cat || p.category === cat);
        if (!confirm(`${products.length}টি product এর price update করবেন?`)) return;

        bulkApply.textContent = 'Updating...';
        bulkApply.disabled = true;

        try {
            for (const p of products) {
                const sp = parseFloat(p.sellingPrice) || 0;
                const cp = parseFloat(p.costPrice) || 0;
                let newSP;
                if (bulkType.value === 'sp_percent') newSP = Math.round(sp + (sp * val / 100));
                else if (bulkType.value === 'sp_fixed') newSP = Math.round(sp + val);
                else newSP = Math.round(cp + (cp * val / 100));

                if (newSP > 0 && newSP !== sp) {
                    await updateDoc(doc(db, 'shops', state.activeShopId, 'inventory', p.id), {
                        sellingPrice: newSP, lastUpdated: new Date()
                    });
                }
            }
            fns.showStatus(`✅ ${products.length}টি product এর price update হয়েছে!`, 'success');
            bulkModal.style.display = 'none';
        } catch (e) {
            console.error('Bulk Price Update Error:', e);
            fns.showStatus('❌ Update failed: ' + e.message, 'error');
        } finally {
            bulkApply.textContent = 'Apply to All';
            bulkApply.disabled = false;
        }
    });

    // ============================================================
    // 3. DUPLICATE FINDER
    // ============================================================
    const dupModal   = document.getElementById('duplicate-modal');
    const dupContent = document.getElementById('duplicate-content');

    document.getElementById('duplicate-btn').addEventListener('click', () => {
        findDuplicates();
        dupModal.style.display = 'flex';
    });

    document.getElementById('close-duplicate').addEventListener('click', () => dupModal.style.display = 'none');
    dupModal.addEventListener('click', e => { if (e.target === dupModal) dupModal.style.display = 'none'; });

    function findDuplicates() {
        const nameMap = {};
        const barcodeMap = {};

        state.allProducts.forEach(p => {
            const name = (p.name || '').trim().toUpperCase();
            if (!nameMap[name]) nameMap[name] = [];
            nameMap[name].push(p);

            if (p.barcode) {
                if (!barcodeMap[p.barcode]) barcodeMap[p.barcode] = [];
                barcodeMap[p.barcode].push(p);
            }
        });

        const nameDups    = Object.entries(nameMap).filter(([, v]) => v.length > 1);
        const barcodeDups = Object.entries(barcodeMap).filter(([, v]) => v.length > 1);

        if (nameDups.length === 0 && barcodeDups.length === 0) {
            dupContent.innerHTML = '<div style="text-align:center; padding:30px; color:#16a34a; font-size:16px;">✅ কোনো duplicate নেই!</div>';
            return;
        }

        let html = '';

        if (barcodeDups.length > 0) {
            html += `<h3 style="color:#dc2626; margin:0 0 10px;">⚠️ Same Barcode (${barcodeDups.length})</h3>`;
            barcodeDups.forEach(([barcode, products]) => {
                html += `<div style="background:#fff5f5; border:1px solid #fecaca; border-radius:8px; padding:12px; margin-bottom:10px;">
                    <strong>Barcode: ${barcode}</strong>
                    ${products.map(p => `<div style="padding:4px 0; font-size:13px;">• ${p.name} — Stock: ${p.stock}, SP: ₹${p.sellingPrice}</div>`).join('')}
                </div>`;
            });
        }

        if (nameDups.length > 0) {
            html += `<h3 style="color:#d97706; margin:10px 0 10px;">⚠️ Same Name (${nameDups.length})</h3>`;
            nameDups.forEach(([name, products]) => {
                html += `<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:12px; margin-bottom:10px;">
                    <strong>${name}</strong>
                    ${products.map(p => `<div style="padding:4px 0; font-size:13px;">• Barcode: ${p.barcode || 'N/A'} — Stock: ${p.stock}, CP: ₹${p.costPrice}, SP: ₹${p.sellingPrice}</div>`).join('')}
                </div>`;
            });
        }

        dupContent.innerHTML = html;
    }

    // ============================================================
    // 4. SCAN SEARCH — barcode scan করলে product highlight হবে
    // ============================================================
    const scanModal  = document.getElementById('scan-search-modal');
    let scannerInst  = null;

    document.getElementById('quick-scan-btn').addEventListener('click', () => {
        scanModal.style.display = 'flex';
        startScanSearch();
    });

    document.getElementById('close-scan-search').addEventListener('click', () => {
        stopScanSearch();
        scanModal.style.display = 'none';
        document.getElementById('scan-search-reader').innerHTML = '';
    });
    scanModal.addEventListener('click', e => {
        if (e.target === scanModal) {
            stopScanSearch();
            scanModal.style.display = 'none';
            document.getElementById('scan-search-reader').innerHTML = '';
        }
    });

    function startScanSearch() {
        if (typeof Html5Qrcode === 'undefined') {
            document.getElementById('scan-search-reader').innerHTML = '<p style="color:red;">Scanner library load হয়নি।</p>';
            return;
        }
        scannerInst = new Html5Qrcode('scan-search-reader');
        scannerInst.start(
            { facingMode: 'environment' },
            { fps: 15, qrbox: { width: 250, height: 100 } },
            (barcode) => {
                stopScanSearch();
                scanModal.style.display = 'none';
                highlightProduct(barcode);
            },
            () => {}
        ).catch(err => {
            console.error('Scanner Error:', err);
            document.getElementById('scan-search-reader').innerHTML = '<p style="color:red;">Camera চালু করা যাচ্ছে না।</p>';
        });
    }

    function stopScanSearch() {
        if (scannerInst) {
            scannerInst.stop().catch(() => {});
            scannerInst = null;
        }
    }

    function highlightProduct(barcode) {
        const product = state.allProducts.find(p => p.barcode === barcode || p.id === barcode);
        if (!product) {
            fns.showStatus(`❌ "${barcode}" পাওয়া যায়নি`, 'error');
            return;
        }

        // Search box এ barcode বসিয়ে filter করা
        document.getElementById('search-inventory').value = barcode;
        fns.applyFiltersAndRender(true);

        // Row highlight
        setTimeout(() => {
            const rows = document.querySelectorAll('#inventory-tbody tr');
            rows.forEach(row => {
                if (row.innerHTML.includes(product.name)) {
                    row.style.outline = '3px solid #f59e0b';
                    row.style.background = '#fffbeb';
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => {
                        row.style.outline = '';
                        row.style.background = '';
                    }, 4000);
                }
            });
        }, 300);

        fns.showStatus(`✅ "${product.name}" পাওয়া গেছে!`, 'success');
    }

    // ============================================================
    // 5. PRODUCT HISTORY — product name click করলে history দেখাবে
    // ============================================================
    document.getElementById('inventory-tbody').addEventListener('click', async e => {
        const nameCell = e.target.closest('td:nth-child(3)');
        if (!nameCell) return;
        const row = nameCell.closest('tr');
        const id  = row.querySelector('.btn-edit')?.dataset.id;
        if (!id) return;

        const product = state.allProducts.find(p => p.id === id);
        if (!product) return;

        showProductHistory(product);
    });

    async function showProductHistory(product) {
        // Modal dynamically create
        let histModal = document.getElementById('product-history-modal');
        if (!histModal) {
            histModal = document.createElement('div');
            histModal.id = 'product-history-modal';
            histModal.className = 'modal';
            histModal.style.display = 'none';
            histModal.innerHTML = `
                <div class="modal-content" style="max-width:650px;">
                    <span class="close-button" id="close-hist">&times;</span>
                    <h2 id="hist-title">Product History</h2>
                    <div id="hist-content" style="max-height:400px; overflow-y:auto;"></div>
                </div>`;
            document.body.appendChild(histModal);
            document.getElementById('close-hist').addEventListener('click', () => histModal.style.display = 'none');
            histModal.addEventListener('click', e => { if (e.target === histModal) histModal.style.display = 'none'; });
        }

        document.getElementById('hist-title').textContent = `📦 ${product.name}`;
        document.getElementById('hist-content').innerHTML = '<p style="text-align:center; color:#999;">Loading...</p>';
        histModal.style.display = 'flex';

        try {
            const logsRef = collection(db, 'shops', state.activeShopId, 'inventory_logs');
            const q = query(logsRef, where('productId', '==', product.id), orderBy('timestamp', 'desc'), limit(30));
            const snap = await getDocs(q);

            const info = `
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:15px;">
                    <div style="background:#f0f9ff; padding:12px; border-radius:8px; text-align:center;">
                        <div style="font-size:11px; color:#666;">Current Stock</div>
                        <div style="font-size:22px; font-weight:700; color:#0369a1;">${product.stock || 0}</div>
                    </div>
                    <div style="background:#f0fdf4; padding:12px; border-radius:8px; text-align:center;">
                        <div style="font-size:11px; color:#666;">Cost Price</div>
                        <div style="font-size:22px; font-weight:700; color:#16a34a;">₹${product.costPrice || 0}</div>
                    </div>
                    <div style="background:#fefce8; padding:12px; border-radius:8px; text-align:center;">
                        <div style="font-size:11px; color:#666;">Selling Price</div>
                        <div style="font-size:22px; font-weight:700; color:#a16207;">₹${product.sellingPrice || 0}</div>
                    </div>
                </div>`;

            if (snap.empty) {
                document.getElementById('hist-content').innerHTML = info + '<p style="text-align:center; color:#999; padding:20px;">কোনো history নেই।</p>';
                return;
            }

            const rows = snap.docs.map(d => {
                const data = d.data();
                const date = data.timestamp ? data.timestamp.toDate().toLocaleString('en-IN') : 'N/A';
                const diff = data.newStock - data.oldStock;
                const diffStr = diff > 0 ? `<span style="color:#16a34a;">+${diff}</span>` : `<span style="color:#dc2626;">${diff}</span>`;
                const actionColor = { UPDATE: '#3b82f6', DELETE: '#ef4444', STOCKTAKE: '#8b5cf6', QUICK_UPDATE: '#f59e0b' }[data.action] || '#666';
                return `<tr>
                    <td style="padding:8px; font-size:12px; color:#666;">${date}</td>
                    <td style="padding:8px;"><span style="background:${actionColor}20; color:${actionColor}; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600;">${data.action}</span></td>
                    <td style="padding:8px; text-align:center;">${data.oldStock}</td>
                    <td style="padding:8px; text-align:center;">${data.newStock}</td>
                    <td style="padding:8px; text-align:center;">${diffStr}</td>
                    <td style="padding:8px; font-size:11px; color:#999;">${(data.userEmail || '').split('@')[0]}</td>
                </tr>`;
            }).join('');

            document.getElementById('hist-content').innerHTML = info + `
                <table style="width:100%; border-collapse:collapse; font-size:13px;">
                    <thead><tr style="background:#f8f9fa;">
                        <th style="padding:8px; text-align:left;">Date</th>
                        <th style="padding:8px; text-align:left;">Action</th>
                        <th style="padding:8px; text-align:center;">Old</th>
                        <th style="padding:8px; text-align:center;">New</th>
                        <th style="padding:8px; text-align:center;">Change</th>
                        <th style="padding:8px; text-align:left;">User</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
        } catch (err) {
            console.error('History Load Error:', err);
            document.getElementById('hist-content').innerHTML = '<p style="color:red;">Error loading history.</p>';
        }
    }
});
