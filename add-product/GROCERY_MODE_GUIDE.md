# 🎯 Dynamic Table System - Updated Guide

## ✅ সম্পূর্ণ ফিচার লিস্ট

### 1. **Business Mode Selector**
4টি মোড যোগ করা হয়েছে:
- 🏪 **General Mode** - সাধারণ দোকানের জন্য
- 👗 **Clothing Mode** - কাপড়ের দোকানের জন্য
- 💍 **Jewelry Mode** - গয়নার দোকানের জন্য
- 🛒 **Grocery Mode** - মুদি/সুপারমার্কেটের জন্য

### 2. **Dynamic Table Columns**
Mode অনুযায়ী Table Header বদলায়:

| Mode | Column 1 | Column 2 |
|------|----------|----------|
| General | Rack/Shelf | Remark |
| Clothing | Size | Color |
| Jewelry | Weight (gm) | Purity |
| **Grocery** | **Brand Name** | **Weight/Unit** |

### 3. **Smart AI Prompts**

#### Grocery Mode Prompt (Updated):
```
Analyze this grocery/FMCG bill. For each item, extract: Brand, Product Name, 
Weight/Unit, Base Rate, GST%, Quantity, MRP. 
Calculate Net CP = Base Rate + (Base Rate * GST% / 100). 
Format: Brand | Name | Weight | Net CP | Qty | Category | MRP

Example: SOUL | BUTTER CHKN MASALA | 65gms | 35.43 | 30 | GROCERY | 50
```

### 4. **Smart Product Name Formatting**

#### 🛒 Grocery Mode (Special Handling):
- **Product Name column**: শুধু product name → "BUTTER CHKN MASALA"
- **Brand Name column**: Brand আলাদা → "SOUL"
- **Weight/Unit column**: Weight আলাদা → "65gms"
- **Database-এ save**: Brand + Name + Weight একসাথে → "SOUL BUTTER CHKN MASALA 65GMS"

#### Other Modes:
- Brand + Name + Size/Weight একসাথে product name-এ

### 5. **Accurate Net CP Calculation**
AI এখন Base Rate + GST% হিসাব করে Net CP দেয়:
- Base Rate: ₹30.00
- GST: 18%
- **Net CP: ₹35.40** ✅

### 6. **Firebase Integration**

#### Grocery Mode:
```javascript
{
  name: "SOUL BUTTER CHKN MASALA 65GMS",  // Full name for search
  category: "GROCERY",
  costPrice: 35.43,
  sellingPrice: 50,
  stock: 30,
  extraField1: "SOUL",      // Brand Name (আলাদা)
  extraField2: "65gms"      // Weight/Unit (আলাদা)
}
```

#### Other Modes:
```javascript
{
  name: "Product Name",
  extraField1: "Size/Weight/Rack",
  extraField2: "Color/Purity/Remark"
}
```

---

## 🚀 Grocery Mode Workflow

### Step 1: Mode Select
```
🛒 Grocery button ক্লিক করুন
```
Table columns বদলে যাবে: **Brand Name** | **Weight/Unit**

### Step 2: AI Prompt Copy
```
Prompt automatically update হবে (HSN/Expiry নেই, শুধু Brand এবং Weight)
```

### Step 3: AI Response
```
SOUL | BUTTER CHKN MASALA | 65gms | 35.43 | 30 | GROCERY | 50
MAGGI | NOODLES | 140gms | 12.50 | 50 | GROCERY | 14
PARLE-G | BISCUIT | 200gms | 18.00 | 40 | GROCERY | 20
```

### Step 4: Paste করলে Table-এ
| Product Name | Category | Brand Name | Weight/Unit | CP | SP | Stock |
|--------------|----------|------------|-------------|-----|-----|-------|
| BUTTER CHKN MASALA | GROCERY | SOUL | 65gms | 35.43 | 50 | 30 |
| NOODLES | GROCERY | MAGGI | 140gms | 12.50 | 14 | 50 |
| BISCUIT | GROCERY | PARLE-G | 200gms | 18.00 | 20 | 40 |

### Step 5: Database-এ Save
```
Product 1: "SOUL BUTTER CHKN MASALA 65GMS"
Product 2: "MAGGI NOODLES 140GMS"
Product 3: "PARLE-G BISCUIT 200GMS"
```
(Brand এবং Weight আলাদা field-এও থাকবে)

---

## 💡 Grocery Mode-এর বিশেষ সুবিধা

### 1. **Brand-wise Analysis**
```sql
SELECT * FROM inventory WHERE extraField1 = 'SOUL'
```
সব SOUL brand products একসাথে দেখা যাবে

### 2. **Weight-wise Filtering**
```sql
SELECT * FROM inventory WHERE extraField2 LIKE '%gms%'
```
গ্রাম/কেজি/লিটার অনুযায়ী filter করা যাবে

### 3. **Clean Table View**
- Product Name ছোট থাকে (শুধু নাম)
- Brand আলাদা column-এ
- Weight আলাদা column-এ
- Professional look

### 4. **Full Name in Database**
- Search করতে সুবিধা
- Barcode print-এ full name
- Invoice-এ full name

---

## 🎨 Technical Implementation

### Mode Config:
```javascript
grocery: {
    head1: "Brand Name", 
    head2: "Weight/Unit",
    p1: "e.g. SOUL, MAGGI, LUX", 
    p2: "e.g. 65gms, 1kg, 500ml"
}
```

### AI Data Parsing (Grocery):
```javascript
if (currentMode === 'grocery') {
    name = productName.trim().toUpperCase();  // শুধু Product Name
    extra1 = brand.trim().toUpperCase();      // Brand Name column
    extra2 = weightOrSize.trim();             // Weight/Unit column
}
```

### Firebase Save (Grocery):
```javascript
if (currentMode === 'grocery' && extra1 && extra2) {
    finalName = `${extra1} ${name} ${extra2}`.trim();
}
// finalName = "SOUL BUTTER CHKN MASALA 65GMS"
```

---

## 📊 Comparison: Before vs After

### Before (Old Grocery Mode):
| Product Name | HSN Code | Expiry Date |
|--------------|----------|-------------|
| SOUL BUTTER CHKN MASALA 65GMS | 21039090 | 12/2025 |

### After (New Grocery Mode):
| Product Name | Brand Name | Weight/Unit |
|--------------|------------|-------------|
| BUTTER CHKN MASALA | SOUL | 65gms |

**Database-এ save:** "SOUL BUTTER CHKN MASALA 65GMS" (full name)

---

## ✨ Benefits

1. ✅ **Professional Layout** - সুপারমার্কেট style table
2. ✅ **Brand Tracking** - brand-wise sales report সহজ
3. ✅ **Weight Analysis** - weight-wise inventory management
4. ✅ **Clean Data Entry** - ছোট ছোট field, easy to read
5. ✅ **Full Name in DB** - search এবং print-এ সুবিধা
6. ✅ **GST Accurate CP** - ট্যাক্স সহ সঠিক cost price

---

**Made with ❤️ for Smart POS System**
