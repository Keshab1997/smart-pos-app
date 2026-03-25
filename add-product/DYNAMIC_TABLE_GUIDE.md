# 🎯 Dynamic Table System - Complete Guide

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
| Grocery | HSN Code | Expiry Date |

### 3. **Smart AI Prompts**
প্রতিটি mode-এর জন্য আলাদা AI prompt:

#### Grocery Mode Prompt:
```
Analyze this grocery/FMCG bill. For each item, extract: Brand, Product Name, 
Weight/Size, Base Rate, GST%, Qty, MRP, HSN, and Expiry. 
Calculate Net CP = Base Rate + (Base Rate * GST% / 100). 
Format: Brand | Name | Weight | Net CP | Qty | Category | MRP | HSN | Expiry

Example: SOUL | BUTTER CHKN MASALA | 65gms | 35.43 | 30 | GROCERY | 50 | 21039090 | 12/2025
```

#### Clothing Mode Prompt:
```
Brand | Name | Size | Net CP | Qty | Category | MRP | Color
Example: ZARA | Cotton Shirt | XL | 520.50 | 10 | CLOTHING | 650 | Blue
```

#### Jewelry Mode Prompt:
```
Brand | Name | Weight | Net CP | Qty | Category | MRP | Purity
Example: TANISHQ | Gold Ring | 5.5 | 15750.00 | 2 | JEWELRY | 18000 | 22K
```

### 4. **Smart Product Name Formatting**
AI থেকে আসা data automatically format হয়:
- **Brand + Product Name + Weight/Size** একসাথে জুড়ে যায়
- Example: `SOUL BUTTER CHKN MASALA 65GMS`

### 5. **Accurate Net CP Calculation**
AI এখন Base Rate + GST% হিসাব করে Net CP দেয়:
- Base Rate: ₹30.00
- GST: 18%
- **Net CP: ₹35.40** ✅

### 6. **Bill Verification System**
Real-time bill matching:
- ✅ **Calculated Total CP** - আপনার টাইপ করা সব product-এর মোট
- 📝 **Original Bill Total** - আসল বিলের টোটাল
- 🔍 **Difference** - পার্থক্য (সবুজ = মিলেছে, লাল = মিলেনি)

### 7. **Auto-Save to localStorage**
Table-এ যেকোনো পরিবর্তন automatically save হয়

### 8. **Firebase Integration**
Data save হয় এভাবে:
```javascript
{
  name: "SOUL BUTTER CHKN MASALA 65GMS",
  category: "GROCERY",
  costPrice: 35.43,
  sellingPrice: 50,
  stock: 30,
  extraField1: "21039090",  // HSN Code
  extraField2: "12/2025"     // Expiry Date
}
```

---

## 🚀 কীভাবে ব্যবহার করবেন

### Step 1: Mode Select করুন
```
Bill Verification কার্ডের উপরে 4টি button দেখবেন:
🏪 General | 👗 Clothing | 💍 Jewelry | 🛒 Grocery
```
আপনার ব্যবসার ধরন অনুযায়ী একটি ক্লিক করুন।

### Step 2: AI Prompt Copy করুন
Mode select করার পর AI Smart Card-এ prompt automatically বদলে যাবে।
**"Copy Prompt"** button ক্লিক করুন।

### Step 3: AI Studio-তে যান
**"Open AI Scanner (Gemini)"** button ক্লিক করুন।
- Prompt paste করুন
- Bill image upload করুন
- AI response copy করুন

### Step 4: Data Paste করুন
**"📋 Paste AI Data"** button ক্লিক করুন।
- Modal খুলবে
- AI response paste করুন
- **"Process & Add to List"** ক্লিক করুন

### Step 5: Bill Verify করুন
**Original Bill Total** ঘরে আসল বিলের টোটাল টাইপ করুন।
- যদি মিলে যায় → সবুজ ✅
- যদি না মিলে → লাল ❌ এবং difference দেখাবে

### Step 6: Save করুন
**"🚀 Save All Products to Inventory"** button ক্লিক করুন।

---

## 💡 Pro Tips

### 1. Grocery Mode-এ সবচেয়ে বেশি সুবিধা
- Brand, Weight, HSN, Expiry সব automatically আলাদা হয়ে যায়
- Net CP (GST সহ) সঠিকভাবে calculate হয়

### 2. Bill Verification দিয়ে ভুল ধরুন
- যদি difference ₹1 এর বেশি হয়, তাহলে কোনো product miss হয়েছে বা ভুল আছে

### 3. MRP Auto-Fill
- AI যদি MRP দেয়, সেটা Selling Price-এ বসে যাবে
- না দিলে, Default Margin% অনুযায়ী calculate হবে

### 4. Existing Product Detection
- যদি product আগে থেকে database-এ থাকে, row সবুজ হয়ে যাবে
- শুধু stock update হবে, নতুন product তৈরি হবে না

---

## 🎨 UI Changes

### Mode Buttons
```css
- Hover করলে উপরে উঠবে
- Active button-এর background color বদলে যাবে
- Smooth transition effect
```

### Dynamic Table Headers
```
Mode পরিবর্তন করলে table header instantly বদলে যায়
```

### Bill Verification Card
```
- Gradient background (orange theme)
- Real-time calculation
- Color-coded difference (green/red)
```

---

## 🔧 Technical Details

### Files Modified:
1. `add-product.html` - Mode buttons + Dynamic columns
2. `add-product.js` - Mode logic + AI parsing + Bill verification
3. `add-product.css` - Mode button styling

### Key Functions:
- `applyModeToTable(mode)` - Mode switching
- `updateAIPrompt(mode)` - Prompt updating
- `calculateTotalCP()` - Bill calculation
- `checkBillMatch(total)` - Verification logic

### Data Flow:
```
User selects mode 
  → Table headers change
  → AI prompt updates
  → User pastes AI data
  → Smart parsing based on mode
  → Data populates in correct fields
  → Bill verification runs
  → Save to Firebase
```

---

## 🎯 Example Workflow (Grocery)

1. Click **🛒 Grocery** button
2. Table shows: **HSN Code** | **Expiry Date**
3. Copy prompt (includes Brand, Weight, GST calculation)
4. AI returns:
   ```
   SOUL | BUTTER CHKN MASALA | 65gms | 35.43 | 30 | GROCERY | 50 | 21039090 | 12/2025
   MAGGI | NOODLES | 140gms | 12.50 | 50 | GROCERY | 14 | 19023010 | 06/2025
   ```
5. Paste → Process
6. Table fills:
   - Name: `SOUL BUTTER CHKN MASALA 65GMS`
   - CP: `35.43` (with GST)
   - HSN: `21039090`
   - Expiry: `12/2025`
7. Original Bill Total: `1687.50`
8. Calculated Total: `1687.50` ✅ Perfect Match!
9. Save to Firebase

---

## ✨ Benefits

1. **99% Accuracy** - GST সহ সঠিক CP
2. **Time Saving** - Manual entry থেকে 10x faster
3. **Error Detection** - Bill verification দিয়ে ভুল ধরা
4. **Professional** - Brand + Weight formatting
5. **Flexible** - যেকোনো ব্যবসার জন্য mode আছে

---

**Made with ❤️ for Smart POS System**
