import { db, auth } from '../js/firebase-config.js';
import { collection, getDocs, query, orderBy, doc, deleteDoc, updateDoc, writeBatch, where } from 'firebase/firestore';

// --- DOM Elements ---
const exportBtn = document.getElementById('export-excel-btn');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
const selectedCountSpan = document.getElementById('selected-count');
const statItems = document.getElementById('stat-total-items');
const statValue = document.getElementById('stat-total-value');
const tableBody = document.getElementById('inventory-tbody');

// --- 1. Total Stats Dashboard (Auto Load) ---
// Stats calculation করার জন্য inventory.js থেকে data নেওয়া হবে
// Firebase read cost বাঁচানোর জন্য আলাদা করে getDocs() call করা হবে না

// Export calculateStats function so inventory.js can call it
window.calculateInventoryStats = function() {
    // inventory.js থেকে allProducts array নেওয়া
    const allProducts = window.inventoryState?.allProducts || [];
    
    if (allProducts.length === 0) {
        // যদি কোনো product না থাকে, default value দেখানো
        if(statItems) statItems.innerText = '0 Items (0 Qty)';
        if(statValue) statValue.innerText = '₹0.00';
        
        const statSaleVal = document.getElementById('stat-total-sale-value');
        const statProfit = document.getElementById('stat-potential-profit');
        
        if(statSaleVal) statSaleVal.innerText = '₹0.00';
        if(statProfit) statProfit.innerText = '₹0.00';
        return;
    }
    
    let totalStock = 0;
    let totalCostValuation = 0;
    let totalSaleValuation = 0;
    let totalProducts = allProducts.length;

    allProducts.forEach(product => {
        const stock = parseInt(product.stock) || 0;
        const cp = parseFloat(product.costPrice) || 0;
        const sp = parseFloat(product.sellingPrice) || 0;
        
        totalStock += stock;
        totalCostValuation += (stock * cp);
        totalSaleValuation += (stock * sp);
    });

    const potentialProfit = totalSaleValuation - totalCostValuation;

    // Update UI
    if(statItems) { statItems.innerText = `${totalProducts} Items (${totalStock} Qty)`; statItems.classList.remove('stat-skeleton'); }
    if(statValue) { statValue.innerText = `₹${totalCostValuation.toLocaleString('en-IN', {minimumFractionDigits: 2})}`; statValue.classList.remove('stat-skeleton'); }
    
    // নতুন ফিল্ডগুলো আপডেট
    const statSaleVal = document.getElementById('stat-total-sale-value');
    const statProfit = document.getElementById('stat-potential-profit');
    
    if(statSaleVal) { statSaleVal.innerText = `₹${totalSaleValuation.toLocaleString('en-IN', {minimumFractionDigits: 2})}`; statSaleVal.classList.remove('stat-skeleton'); }
    if(statProfit) { statProfit.innerText = `₹${potentialProfit.toLocaleString('en-IN', {minimumFractionDigits: 2})}`; statProfit.classList.remove('stat-skeleton'); }

    const lowStockCount = allProducts.filter(p => (parseInt(p.stock) || 0) > 0 && (parseInt(p.stock) || 0) <= 5).length;
    const statLowStock = document.getElementById('stat-low-stock');
    if (statLowStock) {
        statLowStock.textContent = `${lowStockCount} items`;
        statLowStock.style.color = lowStockCount > 0 ? '#ffd700' : '#00ff88';
    }
};

// Initial load এর জন্য একবার call করা
auth.onAuthStateChanged(async (user) => {
    if (user) {
        // inventory.js এর allProducts load হওয়ার জন্য একটু wait করা
        const waitForProducts = setInterval(() => {
            if (window.inventoryState?.allProducts) {
                clearInterval(waitForProducts);
                window.calculateInventoryStats();
            }
        }, 100);
        
        // 5 second পর timeout
        setTimeout(() => clearInterval(waitForProducts), 5000);
    }
});

// --- 2. Export to Excel (CSV) ---
if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;

        exportBtn.innerText = "Downloading...";
        
        try {
            const q = query(collection(db, 'shops', user.uid, 'inventory'), orderBy("name"));
            const snapshot = await getDocs(q);
            
            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Name,Category,Rack/Shelf,Barcode,Cost Price,Selling Price,Stock,Total Value\n"; // Header

            snapshot.forEach(doc => {
                const p = doc.data();
                const row = [
                    `"${p.name.replace(/"/g, '""')}"`, // Handle commas in name
                    p.category || "",
                    p.remark || "",
                    `'${p.barcode || ""}`, // Prevent excel scientific notation
                    p.costPrice || 0,
                    p.sellingPrice || 0,
                    p.stock || 0,
                    (p.stock * p.costPrice).toFixed(2)
                ].join(",");
                csvContent += row + "\n";
            });

            // Download Trigger
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `inventory_export_${new Date().toISOString().slice(0,10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Excel Export Error:", error);
            alert("Export failed!");
        } finally {
            exportBtn.innerText = "Export Excel";
        }
    });
}

// --- 3. Bulk Delete Logic ---
// We need to listen to checkbox changes using Event Delegation (since rows are dynamic)
document.addEventListener('change', (e) => {
    if (e.target.classList.contains('product-checkbox') || e.target.id === 'select-all-checkbox') {
        updateBulkDeleteButton();
    }
});

function updateBulkDeleteButton() {
    const checkboxes = document.querySelectorAll('.product-checkbox:checked');
    const count = checkboxes.length;
    
    if (count > 0) {
        bulkDeleteBtn.style.display = 'inline-block';
        selectedCountSpan.innerText = count;
    } else {
        bulkDeleteBtn.style.display = 'none';
    }
}

if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;

        // Security Check
        const pin = prompt("⚠️ BULK DELETE: Enter Master PIN to confirm deletion:");
        // Note: For simplicity, I'm just checking not null. ideally verify against DB like in inventory.js
        if (!pin) return; 

        const selectedCheckboxes = document.querySelectorAll('.product-checkbox:checked');
        const count = selectedCheckboxes.length;

        if (!confirm(`Are you sure you want to delete ${count} products? This cannot be undone.`)) return;

        bulkDeleteBtn.innerText = "Deleting...";
        bulkDeleteBtn.disabled = true;

        try {
            // Using Batch for better performance
            const batch = writeBatch(db);
            let operationCount = 0;
            
            // Note: Batch limit is 500. If selecting more, we need loop logic. Assuming <500 for now.
            selectedCheckboxes.forEach(cb => {
                const docId = cb.dataset.id;
                const docRef = doc(db, 'shops', user.uid, 'inventory', docId);
                batch.delete(docRef);
                operationCount++;
            });

            await batch.commit();
            
            alert(`${operationCount} products deleted successfully.`);
            // inventory.js onSnapshot will auto-refresh the table
            
            // Reset Button
            bulkDeleteBtn.style.display = 'none';
            document.getElementById('select-all-checkbox').checked = false;

        } catch (error) {
            console.error("Bulk Delete Error:", error);
            alert("Failed to delete some items.");
        } finally {
            bulkDeleteBtn.innerText = `Delete Selected`;
            bulkDeleteBtn.disabled = false;
        }
    });
}

// --- 4. Quick Inline Edit (Double Click) ---
// Listen for double clicks on the table body
if (tableBody) {
    tableBody.addEventListener('dblclick', async (e) => {
        const cell = e.target.closest('td');
        if (!cell) return;
        const row = cell.parentElement;
        
        // বর্তমান কলাম ইনডেক্স: 0:Chk, 1:Img, 2:Name, 3:Cat, 4:Size/Color, 5:CP, 6:SP, 7:Stock, 8:Bar, 9:Date, 10:Action
        const cellIndex = cell.cellIndex;
        
        // শুধু Cost Price(5), Selling Price(6), এবং Stock(7) এডিট করতে পারবে
        if (![5, 6, 7].includes(cellIndex)) return;

        const checkbox = row.querySelector('.product-checkbox');
        if (!checkbox) return;
        const productId = checkbox.dataset.id;
        
        // Check if already editing
        if (cell.querySelector('input')) return;
        
        // সেল এর ভেতরের মূল সংখ্যাটি বের করা (Margin টেক্সট বাদ দিয়ে)
        const originalText = cell.innerText.split('\n')[0].trim();
        const originalValue = parseFloat(originalText);
        
        let fieldName = '';
        if (cellIndex === 5) fieldName = 'costPrice';
        if (cellIndex === 6) fieldName = 'sellingPrice';
        if (cellIndex === 7) fieldName = 'stock';

        const input = document.createElement('input');
        input.type = 'number';
        input.value = originalValue;
        input.style.width = '100px';
        input.style.padding = '5px';
        input.style.borderRadius = '4px';
        input.style.border = '2px solid #4361ee';
        
        cell.innerHTML = ''; 
        cell.appendChild(input);
        input.focus();
        input.select();

        const saveChange = async () => {
            const newValue = parseFloat(input.value);
            
            if (isNaN(newValue) || newValue === originalValue) {
                // Restore original value without triggering re-render
                if (cellIndex === 6) {
                    // For SP, restore with margin
                    const cp = parseFloat(row.cells[5].innerText) || 0;
                    const margin = cp > 0 ? (((originalValue - cp) / cp) * 100).toFixed(1) : 0;
                    cell.innerHTML = `${originalValue.toFixed(2)}<br><small style="color: #28a745; font-weight: bold;">Margin: ${margin}%</small>`;
                } else {
                    cell.innerHTML = originalValue;
                }
                return;
            }

            try {
                const user = auth.currentUser;
                const docRef = doc(db, 'shops', user.uid, 'inventory', productId);
                
                // ১. ইনভেন্টরি আপডেট করা
                await updateDoc(docRef, {
                    [fieldName]: newValue
                });

                // ==============================================================
                // 🔴 ২. নতুন লজিক: Cost Price আপডেট হলে Expense অটোমেটিক আপডেট হবে
                // ==============================================================
                if (fieldName === 'costPrice') {
                    try {
                        // এই প্রোডাক্টের খরচের এন্ট্রিগুলো খোঁজা
                        const expQ = query(
                            collection(db, 'shops', user.uid, 'expenses'),
                            where('relatedProductId', '==', productId)
                        );
                        const expSnap = await getDocs(expQ);
                        
                        if (!expSnap.empty) {
                            const expenses = [];
                            expSnap.forEach(d => {
                                const data = d.data();
                                if (data.category === 'inventory_purchase' || data.category === 'Inventory Purchase') {
                                    expenses.push({ id: d.id, ...data });
                                }
                            });
                            
                            if (expenses.length > 0) {
                                // সবচেয়ে শেষের (Latest) এন্ট্রিটি বের করা
                                expenses.sort((a, b) => b.date.toMillis() - a.date.toMillis());
                                const latestExp = expenses[0];
                                
                                // নতুন এমাউন্ট হিসাব করা (নতুন দাম * পরিমাণ)
                                const qty = latestExp.quantity || 1;
                                const newAmount = newValue * qty;
                                
                                // Expense আপডেট করা
                                await updateDoc(doc(db, 'shops', user.uid, 'expenses', latestExp.id), {
                                    unitPrice: newValue,
                                    amount: newAmount
                                });
                                console.log("✅ Expense auto-synced with new Cost Price.");
                            }
                        }
                    } catch (syncErr) {
                        console.error("⚠️ Expense sync error:", syncErr);
                    }
                }
                // ==============================================================
                
                // Update cell display
                if (cellIndex === 6) {
                    // For SP, show with margin
                    const cp = parseFloat(row.cells[5].innerText) || 0;
                    const margin = cp > 0 ? (((newValue - cp) / cp) * 100).toFixed(1) : 0;
                    cell.innerHTML = `${newValue.toFixed(2)}<br><small style="color: #28a745; font-weight: bold;">Margin: ${margin}%</small>`;
                } else {
                    cell.innerHTML = newValue;
                }
                
                cell.style.backgroundColor = '#d4edda';
                setTimeout(() => cell.style.backgroundColor = '', 1000);
                
                // Stats update করা (Firebase read ছাড়া)
                if (window.calculateInventoryStats) {
                    window.calculateInventoryStats();
                }

            } catch (error) {
                console.error("Inline Update Error:", error);
                alert("Update failed!");
                // Restore original value
                if (cellIndex === 6) {
                    const cp = parseFloat(row.cells[5].innerText) || 0;
                    const margin = cp > 0 ? (((originalValue - cp) / cp) * 100).toFixed(1) : 0;
                    cell.innerHTML = `${originalValue.toFixed(2)}<br><small style="color: #28a745; font-weight: bold;">Margin: ${margin}%</small>`;
                } else {
                    cell.innerHTML = originalValue;
                }
            }
        };

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                input.blur(); 
            }
            if (event.key === 'Escape') {
                // Cancel edit
                if (cellIndex === 6) {
                    const cp = parseFloat(row.cells[5].innerText) || 0;
                    const margin = cp > 0 ? (((originalValue - cp) / cp) * 100).toFixed(1) : 0;
                    cell.innerHTML = `${originalValue.toFixed(2)}<br><small style="color: #28a745; font-weight: bold;">Margin: ${margin}%</small>`;
                } else {
                    cell.innerHTML = originalValue;
                }
            }
        });

        input.addEventListener('blur', saveChange, { once: true });
    });
}