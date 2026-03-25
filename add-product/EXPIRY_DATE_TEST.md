# 🧪 AI Paste Test Guide - With Expiry Dates

## ✅ সঠিক Format (9 Fields)

### Grocery Mode Format:
```
Brand | Name | Weight | Net CP | Qty | Category | MRP | HSN | Expiry
```

### Example Data (Copy & Paste করুন):
```
SOUL | BUTTER CHKN MASALA | 65gms | 35.43 | 30 | GROCERY | 50 | 21039090 | 12/2025
SOUL | CARROT PICKLE IN O | 300GMS | 72.50 | 30 | GROCERY | 95 | 20019000 | 06/2026
SOUL | CHIKEN TIKKA MASALA | 70GM | 35.43 | 30 | GROCERY | 50 | 21039090 | 11/2025
SOUL | GARLIC PICKLE IN O | 300gms | 76.32 | 30 | GROCERY | 100 | 20019000 | 08/2026
SOUL | GARLIC PICKLE | 400gms | 64.87 | 20 | GROCERY | 85 | 20019000 | 09/2026
```

## 🔍 Current Issue Analysis

### আপনার Screenshot থেকে:
```
Product: BUTTER CHKN MASALA
Brand: SOUL ✅
Weight: 65gms ✅
HSN: 21039090 ✅
Expiry: (placeholder দেখাচ্ছে) ❌
```

### সম্ভাব্য কারণ:

#### 1. AI Response-এ Expiry ছিল না
```
যদি AI এভাবে দিয়ে থাকে:
SOUL | BUTTER CHKN MASALA | 65gms | 35.43 | 30 | GROCERY | 50 | 21039090

তাহলে 8টি field আছে, 9টি নয়
→ Expiry (9th field) missing
```

#### 2. AI Response-এ Expiry ছিল কিন্তু format ভুল
```
যদি AI এভাবে দিয়ে থাকে:
SOUL | BUTTER CHKN MASALA | 65gms | 35.43 | 30 | GROCERY | 50 | 21039090 | 

(শেষে খালি)
→ Empty expiry field
```

## 🛠️ Solution

### Option 1: AI Prompt আরও Specific করুন
```
Current Prompt:
"...HSN Code, and Expiry Date..."

Better Prompt:
"...HSN Code (8 digits), and Expiry Date (MM/YYYY format, MANDATORY)..."

Example: "If expiry date is not visible, write 'N/A' instead of leaving blank"
```

### Option 2: Manual Entry
```
যদি AI Expiry না দেয়, তাহলে:
1. Products add হওয়ার পর
2. Table-এ manually Expiry Date টাইপ করুন
3. তারপর Save করুন
```

### Option 3: Default Expiry Set করুন
```javascript
// যদি Expiry না থাকে, তাহলে 1 year পরের date set করুন
if (!extra4 || extra4.trim() === '') {
    const today = new Date();
    const nextYear = new Date(today.setFullYear(today.getFullYear() + 1));
    extra4 = `${String(nextYear.getMonth() + 1).padStart(2, '0')}/${nextYear.getFullYear()}`;
}
```

## 📋 Test Steps

### Step 1: Clear Table
```
"🗑️ Clear All" button ক্লিক করুন
```

### Step 2: Select Grocery Mode
```
"🛒 Grocery" button ক্লিক করুন
→ 4টি column দেখাবে
```

### Step 3: Paste Test Data
```
"📋 Paste AI Data" ক্লিক করুন
→ উপরের Example Data paste করুন
→ "Process & Add to List" ক্লিক করুন
```

### Step 4: Verify
```
Check করুন:
✅ Brand Name filled?
✅ Weight/Unit filled?
✅ HSN Code filled?
✅ Expiry Date filled? ← এটা check করুন
```

## 🎯 Expected Result

### Table-এ দেখাবে:
| Product Name | Brand | Weight | HSN | Expiry | CP | SP |
|--------------|-------|--------|-----|--------|-----|-----|
| BUTTER CHKN MASALA | SOUL | 65gms | 21039090 | **12/2025** | 35.43 | 50 |

### যদি Expiry খালি থাকে:
```
→ AI response-এ 9th field ছিল না
→ AI-কে আবার বলুন: "Include expiry date in MM/YYYY format"
```

## 💡 Pro Tips

### 1. AI Prompt-এ Example দিন
```
"Format: Brand | Name | Weight | CP | Qty | Category | MRP | HSN | Expiry

Example with ALL 9 fields:
SOUL | BUTTER CHKN MASALA | 65gms | 35.43 | 30 | GROCERY | 50 | 21039090 | 12/2025"
```

### 2. AI Response Verify করুন
```
Paste করার আগে check করুন:
- প্রতিটি line-এ 8টি | (pipe) আছে কি না?
- 8টি | মানে 9টি field
- শেষ field-এ date আছে কি না?
```

### 3. Batch Processing
```
যদি 27টি product-এর মধ্যে কয়েকটিতে expiry নেই:
1. প্রথমে সব products add করুন
2. Table-এ manually expiry dates fill করুন
3. তারপর Save করুন
```

## 🔧 Code Check

### Current Parsing Logic:
```javascript
if (currentMode === 'grocery') {
    extra1 = brand;           // Field 1
    extra2 = weight;          // Field 3
    extra3 = parts[7];        // Field 8 (HSN)
    extra4 = parts[8];        // Field 9 (Expiry) ← এটা check করুন
}
```

### Debug করার জন্য:
```javascript
console.log('Parts length:', parts.length);
console.log('Extra4 (Expiry):', extra4);
```

---

## 📝 Summary

**আপনার Current Issue:**
- Expiry Date field placeholder দেখাচ্ছে
- Actual data নেই

**Most Likely Cause:**
- AI response-এ 9th field (Expiry) ছিল না
- অথবা empty ছিল

**Solution:**
1. AI-কে আরও specific prompt দিন
2. অথবা manually expiry dates fill করুন
3. অথবা code-এ default expiry logic যোগ করুন

**Test করুন:**
উপরের Example Data paste করে দেখুন Expiry আসছে কি না।
