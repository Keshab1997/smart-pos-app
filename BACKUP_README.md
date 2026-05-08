# 🔄 Automatic Firestore Backup System

এই system automatically আপনার Firestore database-এর backup নেয় এবং GitHub-এ save করে।

## 📋 Two Backup Strategies

### 1. **Lightweight Backup (Daily)** ⚡ - Recommended
- ✅ **Daily Automatic** - প্রতিদিন রাত 2:00 AM UTC
- ✅ **Minimal Quota Usage** - শুধু inventory + last 7 days sales
- ✅ **Fast & Efficient** - কম data, কম সময়
- ✅ **14 Days Retention** - শেষ 14 দিনের backup
- 📁 **Location:** `backups-lite/`

### 2. **Full Backup (Weekly)** 📦
- ✅ **Weekly Automatic** - প্রতি রবিবার রাত 2:00 AM UTC
- ✅ **Complete Data** - Inventory, Sales, Expenses, Logs (সব কিছু)
- ✅ **Rate Limited** - Quota exceed এড়ানোর জন্য batch processing
- ✅ **30 Days Retention** - শেষ 30 দিনের backup
- 📁 **Location:** `backups/`

## 🚀 Setup Instructions

### Step 1: Firebase Service Account তৈরি করুন

1. **Firebase Console** এ যান: https://console.firebase.google.com
2. আপনার project select করুন
3. **Settings (⚙️) → Project Settings → Service Accounts** এ যান
4. **Generate New Private Key** button-এ click করুন
5. একটি JSON file download হবে

### Step 2: GitHub Secret যোগ করুন

1. আপনার GitHub repository-তে যান
2. **Settings → Secrets and variables → Actions** এ যান
3. **New repository secret** click করুন
4. Name: `FIREBASE_SERVICE_ACCOUNT`
5. Value: Download করা JSON file-এর **সম্পূর্ণ content** paste করুন
6. **Add secret** click করুন

### Step 3: Workflow Enable করুন

1. GitHub repository-তে **Actions** tab-এ যান
2. "Firestore Backup" workflow খুঁজুন
3. Enable করুন (যদি disabled থাকে)

## 📅 Backup Schedule

### Lightweight Backup (Recommended for Daily Use)
- **Automatic**: প্রতিদিন রাত 2:00 AM UTC (ভারতীয় সময় 7:30 AM)
- **Manual**: Actions tab → Lightweight Backup (Daily) → Run workflow
- **Data**: Inventory + Last 7 days sales only
- **Quota**: Very low (safe for free tier)

### Full Backup (For Complete Data)
- **Automatic**: প্রতি রবিবার রাত 2:00 AM UTC (Weekly)
- **Manual**: Actions tab → Firestore Backup → Run workflow
- **Data**: Everything (Inventory, Sales, Expenses, Logs)
- **Quota**: Higher usage (use sparingly)

## 📂 Backup Structure

### Lightweight Backup (Daily)
```
backups-lite/
├── 2024-01-15/
│   ├── backup-lite.json         # Inventory + Recent sales only
│   └── summary.json              # Backup summary
├── 2024-01-16/
└── ...
```

### Full Backup (Weekly)
```
backups/
├── 2024-01-15/
│   ├── firestore-backup.json    # Complete data
│   └── summary.json              # Backup summary
├── 2024-01-22/
└── ...
```

## 🔄 Manual Backup কিভাবে নিবেন

1. GitHub repository → **Actions** tab
2. **Firestore Backup** workflow select করুন
3. **Run workflow** button click করুন
4. **Run workflow** confirm করুন
5. কয়েক মিনিট পর backup complete হবে

## 📊 Backup Summary Example

```json
{
  "timestamp": "2024-01-15T02:00:00.000Z",
  "shops": 1,
  "totalInventory": 150,
  "totalExpenses": 45,
  "totalSales": 320,
  "totalLogs": 89
}
```

## 🔧 Restore কিভাবে করবেন

### Option 1: Manual Restore (Recommended)

1. `backups/YYYY-MM-DD/firestore-backup.json` file খুলুন
2. Firebase Console → Firestore Database
3. Manually data import করুন

### Option 2: Script দিয়ে Restore

```javascript
// restore.js (create this file)
const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = require('./service-account.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();
const backupData = JSON.parse(fs.readFileSync('./backups/2024-01-15/firestore-backup.json'));

async function restore() {
  for (const [shopId, shopData] of Object.entries(backupData)) {
    // Restore shop document
    await db.collection('shops').doc(shopId).set(shopData);
    
    // Restore inventory
    for (const [id, data] of Object.entries(shopData.inventory)) {
      await db.collection('shops').doc(shopId).collection('inventory').doc(id).set(data);
    }
    
    // Restore expenses, sales, logs similarly...
  }
  console.log('✅ Restore completed!');
}

restore();
```

## ⚠️ Important Notes

1. **Service Account JSON কখনো public করবেন না**
2. **GitHub Secrets-এ সঠিকভাবে store করুন**
3. **Backup files-এ sensitive data থাকতে পারে** - repository private রাখুন
4. **30 দিনের পুরনো backup automatically delete হয়**

## 🔐 Security Best Practices

- ✅ Repository **Private** রাখুন
- ✅ Service Account-এর শুধু **Read** permission দিন
- ✅ Regular backup verify করুন
- ✅ Test restore process মাঝে মাঝে

## 📞 Support

কোনো সমস্যা হলে GitHub Issues-এ জানান।

---

**Last Updated:** 2024-01-15
