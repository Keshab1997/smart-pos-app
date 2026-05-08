# 📊 Daily Sales Report & Low Stock Alert - Setup Guide

প্রতিদিন automatically আপনার email-এ sales report এবং low stock alert পাবেন!

---

## ✨ Features

### 📈 **Sales Metrics**
- ✅ Total Sales (দিনের মোট বিক্রয়)
- ✅ Total Profit (মোট লাভ)
- ✅ Total Transactions (লেনদেন সংখ্যা)
- ✅ Average Transaction Value

### 🏆 **Top Products**
- ✅ Top 5 Selling Products
- ✅ Quantity sold
- ✅ Revenue per product

### 📂 **Category Performance**
- ✅ Category-wise sales
- ✅ Percentage of total sales
- ✅ Best performing categories

### 🚨 **Stock Alerts**
- ✅ Out of Stock items (Stock = 0)
- ✅ Low Stock items (Stock ≤ 5)
- ✅ Product name, category, barcode

---

## 🚀 Setup Instructions

### Step 1: Gmail App Password তৈরি করুন

1. **Google Account** এ যান: https://myaccount.google.com
2. **Security** → **2-Step Verification** enable করুন (যদি না থাকে)
3. **Security** → **App passwords** এ যান
4. **Select app:** Mail
5. **Select device:** Other (Custom name)
6. Name লিখুন: "POS Daily Report"
7. **Generate** button click করুন
8. **16-digit password** copy করুন (এটা পরে লাগবে)

### Step 2: GitHub Secrets যোগ করুন

1. GitHub repository: https://github.com/Keshab1997/smart-pos-app
2. **Settings → Secrets and variables → Actions**
3. নিচের secrets যোগ করুন:

#### Secret 1: `FIREBASE_SERVICE_ACCOUNT`
- **Name:** `FIREBASE_SERVICE_ACCOUNT`
- **Value:** Firebase service account JSON (already added for backup)

#### Secret 2: `EMAIL_USER`
- **Name:** `EMAIL_USER`
- **Value:** আপনার Gmail address (যেমন: `yourshop@gmail.com`)

#### Secret 3: `EMAIL_PASSWORD`
- **Name:** `EMAIL_PASSWORD`
- **Value:** Step 1 এ generate করা 16-digit App Password

#### Secret 4: `REPORT_EMAIL`
- **Name:** `REPORT_EMAIL`
- **Value:** যে email-এ report পেতে চান (same বা different হতে পারে)

---

## 📅 Schedule

- **Automatic:** প্রতিদিন রাত 11:00 PM UTC (ভারতীয় সময় 4:30 AM)
  - দিনের শেষে সব data সহ report
- **Manual:** Actions tab → Daily Sales Report → Run workflow

---

## 📧 Email Report Sample

### Subject:
```
📊 Daily Sales Report - 15 January 2024 - Your Shop Name
```

### Content Includes:

#### 1. **Sales Metrics Card**
```
💰 Total Sales: ₹15,450.00
📈 Profit: ₹4,320.00 (28% margin)
🛒 Transactions: 45 (Avg: ₹343.33)
```

#### 2. **Top 5 Selling Products Table**
```
Rank | Product Name      | Qty Sold | Revenue
#1   | Cotton Shirt XL   | 12       | ₹4,800
#2   | Denim Jeans 32    | 8        | ₹3,200
...
```

#### 3. **Category Performance**
```
Category  | Revenue    | % of Total
CLOTHING  | ₹8,500.00  | 55%
FOOTWEAR  | ₹4,200.00  | 27%
...
```

#### 4. **🚨 Out of Stock Alert** (Red box)
```
Product Name        | Category  | Barcode
Cotton Shirt Blue   | CLOTHING  | CLO-BLU-0123
Denim Jeans Black   | CLOTHING  | CLO-BLA-0456
```

#### 5. **⚠️ Low Stock Alert** (Yellow box)
```
Product Name        | Category  | Stock | Barcode
T-Shirt Red         | CLOTHING  | 3     | CLO-RED-0789
Sneakers White      | FOOTWEAR  | 2     | FOO-WHI-0234
```

---

## 🎨 Email Design

- ✅ **Professional HTML design**
- ✅ **Mobile responsive**
- ✅ **Color-coded alerts** (Red = Out of Stock, Yellow = Low Stock)
- ✅ **Easy to read tables**
- ✅ **Visual metrics cards**

---

## 🧪 Testing

### Manual Test করুন:

1. GitHub → **Actions** tab
2. **"Daily Sales Report & Low Stock Alert"** select করুন
3. **"Run workflow"** button click করুন
4. কয়েক মিনিট পর email check করুন

---

## ⚙️ Customization Options

### Low Stock Threshold পরিবর্তন করুন:

File: `.github/workflows/daily-report.yml`

```javascript
// Line ~150 এর কাছে
} else if (stock <= 5) {  // এখানে 5 পরিবর্তন করুন
```

### Report Time পরিবর্তন করুন:

```yaml
schedule:
  - cron: '0 23 * * *'  # 23 = 11 PM UTC
  # 0 = 12 AM, 6 = 6 AM, 12 = 12 PM, 18 = 6 PM
```

### Top Products সংখ্যা পরিবর্তন করুন:

```javascript
// Line ~100 এর কাছে
.slice(0, 5)  // 5 পরিবর্তন করুন (যেমন: 10)
```

---

## 📱 Multiple Email Recipients

একাধিক email-এ পাঠাতে চাইলে:

```yaml
REPORT_EMAIL: "email1@gmail.com,email2@gmail.com,email3@gmail.com"
```

---

## 🔧 Troubleshooting

### Email পাচ্ছেন না?

1. **Spam folder check করুন**
2. **Gmail App Password সঠিক আছে কি না verify করুন**
3. **GitHub Actions logs check করুন** (Actions tab → workflow run → logs)
4. **2-Step Verification enable আছে কি না check করুন**

### "Authentication failed" error?

- Gmail App Password পুনরায় generate করুন
- GitHub Secret update করুন
- Space বা extra character নেই কি না check করুন

### No sales data?

- আজকের কোনো sale হয়েছে কি না check করুন
- Firestore timestamp সঠিক আছে কি না verify করুন

---

## 💡 Pro Tips

1. ✅ **Morning report পেতে চাইলে:** cron time `0 2 * * *` করুন (7:30 AM IST)
2. ✅ **Multiple shops:** প্রতিটি shop-এর জন্য আলাদা email পাবেন
3. ✅ **Mobile notification:** Gmail app-এ notification enable করুন
4. ✅ **Archive reports:** Gmail-এ label তৈরি করে auto-organize করুন

---

## 📊 Sample Report Preview

![Daily Report Preview](https://via.placeholder.com/800x600/667eea/ffffff?text=Daily+Sales+Report+Preview)

---

## ⚠️ Important Notes

1. ✅ **Gmail App Password ব্যবহার করুন** - regular password কাজ করবে না
2. ✅ **2-Step Verification enable করতে হবে**
3. ✅ **Free tier Gmail limit:** 500 emails/day (যথেষ্ট)
4. ✅ **Report size:** ~50-100 KB (very light)

---

## 🎯 Next Steps

Setup complete হলে:
1. ✅ Manual test করুন
2. ✅ Email design check করুন
3. ✅ Low stock threshold adjust করুন (যদি প্রয়োজন হয়)
4. ✅ Report time customize করুন

---

**Setup করে test করুন এবং জানান কেমন হলো!** 📧🚀

---

**Last Updated:** 2024-01-15
