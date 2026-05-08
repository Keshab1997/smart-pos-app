# 🔥 Firebase Quota Management Guide

Firebase Free Tier-এ quota exceed এড়ানোর জন্য best practices।

---

## 📊 Firebase Free Tier Limits

### Firestore
- **Reads:** 50,000/day
- **Writes:** 20,000/day
- **Deletes:** 20,000/day

### Storage
- **Stored Data:** 1 GB
- **Network Egress:** 10 GB/month

---

## ⚠️ Quota Exceed হওয়ার কারণ

### 1. **Backup Workflows**
- Full backup: ~2,000-5,000 reads
- Lightweight backup: ~200-500 reads
- **Solution:** Weekly full backup, daily lite backup

### 2. **Daily Report**
- Full report: ~500-1,000 reads
- Ultra-lite report: ~50-150 reads
- **Solution:** Use ultra-lite version

### 3. **Real-time Listeners**
- Inventory page: ~100-500 reads on load
- **Solution:** Pagination, lazy loading

---

## ✅ Current Automation Setup (Optimized)

### Daily (Low Quota Usage)
1. **Lightweight Backup** - ~200 reads
2. **Ultra-Lite Report** - ~100 reads
3. **Total:** ~300 reads/day

### Weekly (Higher Quota Usage)
1. **Full Backup** - ~3,000 reads (Sunday only)

### Monthly Quota Usage
- Daily: 300 × 30 = 9,000 reads
- Weekly: 3,000 × 4 = 12,000 reads
- **Total:** ~21,000 reads/month
- **Remaining:** 29,000 reads for app usage ✅

---

## 🎯 Recommended Workflow Schedule

### **Option 1: Ultra Safe (Current)**
```yaml
Daily:
  - Ultra-Lite Report (4:30 AM IST)
  - Lightweight Backup (7:30 AM IST)

Weekly:
  - Full Backup (Sunday 2:00 AM UTC)
```
**Quota Usage:** ~21,000 reads/month (42% of limit)

### **Option 2: Balanced**
```yaml
Daily:
  - Ultra-Lite Report only

Weekly:
  - Full Backup (Sunday)
  - Full Report (Monday)
```
**Quota Usage:** ~15,000 reads/month (30% of limit)

### **Option 3: Minimal**
```yaml
Weekly:
  - Full Backup (Sunday)
  - Full Report (Monday)

Manual:
  - Run reports when needed
```
**Quota Usage:** ~5,000 reads/month (10% of limit)

---

## 🔧 How to Switch Workflows

### Disable Full Daily Report
1. GitHub → `.github/workflows/daily-report.yml`
2. Comment out or delete the `schedule:` section
3. Keep `workflow_dispatch:` for manual trigger

### Enable Ultra-Lite Report
1. Already created: `daily-report-lite.yml`
2. Runs automatically daily
3. Uses minimal quota (~100 reads)

---

## 📉 Quota Monitoring

### Check Current Usage
1. Firebase Console: https://console.firebase.google.com
2. Your Project → Usage tab
3. Check "Cloud Firestore" section

### Set Up Alerts
1. Firebase Console → Project Settings
2. Usage and billing → Set budget alerts
3. Get email when 50%, 80%, 90% used

---

## 💡 Quota Optimization Tips

### For App Usage

#### 1. **Use Pagination**
```javascript
// Instead of loading all products
const products = await getDocs(collection(db, 'inventory'));

// Load in batches
const products = await getDocs(
  query(collection(db, 'inventory'), limit(50))
);
```

#### 2. **Cache Data Locally**
```javascript
// Use localStorage for frequently accessed data
const cachedData = localStorage.getItem('inventory');
if (cachedData && isRecent(cachedData)) {
  return JSON.parse(cachedData);
}
```

#### 3. **Use Real-time Listeners Wisely**
```javascript
// Don't use listeners on large collections
// Use getDocs() instead for one-time reads
```

#### 4. **Implement Search Optimization**
```javascript
// Use Algolia or client-side search
// Instead of multiple Firestore queries
```

---

## 🚀 Upgrade Options

### If You Need More Quota

#### Blaze Plan (Pay as you go)
- **First 50,000 reads:** Free
- **Additional reads:** $0.06 per 100,000
- **Example:** 100,000 reads/day = ~$3/month

#### Benefits
- No daily limits
- Automatic scaling
- Better performance

---

## 📊 Current Workflows Comparison

| Workflow | Frequency | Reads | Quota Impact |
|----------|-----------|-------|--------------|
| **Ultra-Lite Report** | Daily | ~100 | ✅ Very Low |
| **Lightweight Backup** | Daily | ~200 | ✅ Low |
| **Full Report** | Manual | ~800 | ⚠️ Medium |
| **Full Backup** | Weekly | ~3,000 | ⚠️ High |
| **Test Workflow** | Manual | ~10 | ✅ Minimal |

---

## 🎯 Recommended Setup for Free Tier

### Enable These (Auto):
- ✅ Ultra-Lite Report (Daily)
- ✅ Lightweight Backup (Daily)
- ✅ Full Backup (Weekly - Sunday)

### Disable These (Manual Only):
- ❌ Full Daily Report (use ultra-lite instead)
- ❌ Test workflows (only when needed)

### Result:
- **Daily Usage:** ~300 reads
- **Monthly Usage:** ~21,000 reads
- **Remaining:** 29,000 reads for app
- **Safety Margin:** 58% quota available ✅

---

## 🔄 How to Disable a Workflow

### Method 1: Comment Schedule
```yaml
on:
  # schedule:
  #   - cron: '0 23 * * *'
  workflow_dispatch:  # Keep manual trigger
```

### Method 2: Delete Workflow File
```bash
# Delete from repository
rm .github/workflows/daily-report.yml
git commit -m "Disable full daily report"
git push
```

### Method 3: Disable in GitHub UI
1. Actions tab → Select workflow
2. Click "..." menu → Disable workflow

---

## 📈 Monitoring Dashboard (DIY)

Create a simple quota tracker:

```javascript
// Add to your app
const quotaUsage = {
  date: new Date().toISOString().split('T')[0],
  reads: 0,
  writes: 0
};

// Track each operation
db.collection('quota_log').add(quotaUsage);
```

---

## ⚡ Quick Actions

### If Quota Exceeded Today

1. **Immediate:**
   - Disable all scheduled workflows
   - Use manual triggers only

2. **Tomorrow:**
   - Quota resets at midnight UTC
   - Re-enable ultra-lite workflows only

3. **Long-term:**
   - Switch to weekly reports
   - Optimize app queries
   - Consider Blaze plan

---

## 🎯 Current Status

✅ **Ultra-Lite Report:** Enabled (Daily)  
✅ **Lightweight Backup:** Enabled (Daily)  
✅ **Full Backup:** Enabled (Weekly)  
⚠️ **Full Report:** Disabled (Manual only)  

**Estimated Monthly Usage:** 21,000 / 50,000 reads (42%)  
**Status:** ✅ Safe for Free Tier

---

**Last Updated:** 2024-01-15
