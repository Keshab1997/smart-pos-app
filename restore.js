/**
 * Firestore Restore Script
 * 
 * এই script দিয়ে backup থেকে data restore করতে পারবেন
 * 
 * Usage:
 * 1. Firebase Service Account JSON file download করুন
 * 2. এই folder-এ 'service-account.json' নামে save করুন
 * 3. npm install firebase-admin
 * 4. node restore.js backups/2024-01-15/firestore-backup.json
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Check if backup file path is provided
if (process.argv.length < 3) {
  console.error('❌ Usage: node restore.js <backup-file-path>');
  console.error('   Example: node restore.js backups/2024-01-15/firestore-backup.json');
  process.exit(1);
}

const backupFilePath = process.argv[2];

// Check if backup file exists
if (!fs.existsSync(backupFilePath)) {
  console.error(`❌ Backup file not found: ${backupFilePath}`);
  process.exit(1);
}

// Check if service account file exists
const serviceAccountPath = path.join(__dirname, 'service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Service account file not found: service-account.json');
  console.error('   Download it from Firebase Console → Project Settings → Service Accounts');
  process.exit(1);
}

// Initialize Firebase Admin
const serviceAccount = require(serviceAccountPath);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function restoreFirestore() {
  console.log('🔄 Starting Firestore restore...');
  console.log(`📂 Backup file: ${backupFilePath}`);
  
  // Read backup data
  const backupData = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));
  
  // Confirm before restore
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const shops = Object.keys(backupData);
  console.log(`\n⚠️  WARNING: This will restore data for ${shops.length} shop(s)`);
  console.log('   Existing data may be overwritten!');
  
  const answer = await new Promise(resolve => {
    readline.question('\n❓ Are you sure you want to continue? (yes/no): ', resolve);
  });
  readline.close();
  
  if (answer.toLowerCase() !== 'yes') {
    console.log('❌ Restore cancelled.');
    process.exit(0);
  }
  
  try {
    let totalRestored = {
      shops: 0,
      inventory: 0,
      expenses: 0,
      sales: 0,
      logs: 0
    };
    
    for (const [shopId, shopData] of Object.entries(backupData)) {
      console.log(`\n📦 Restoring shop: ${shopId}`);
      
      // Restore shop document (excluding subcollections)
      const shopDoc = { ...shopData };
      delete shopDoc.inventory;
      delete shopDoc.expenses;
      delete shopDoc.sales;
      delete shopDoc.inventory_logs;
      
      await db.collection('shops').doc(shopId).set(shopDoc, { merge: true });
      totalRestored.shops++;
      
      // Restore inventory
      if (shopData.inventory) {
        console.log(`  📦 Restoring ${Object.keys(shopData.inventory).length} inventory items...`);
        for (const [id, data] of Object.entries(shopData.inventory)) {
          await db.collection('shops').doc(shopId).collection('inventory').doc(id).set(data);
          totalRestored.inventory++;
        }
      }
      
      // Restore expenses
      if (shopData.expenses) {
        console.log(`  💰 Restoring ${Object.keys(shopData.expenses).length} expenses...`);
        for (const [id, data] of Object.entries(shopData.expenses)) {
          await db.collection('shops').doc(shopId).collection('expenses').doc(id).set(data);
          totalRestored.expenses++;
        }
      }
      
      // Restore sales
      if (shopData.sales) {
        console.log(`  🛒 Restoring ${Object.keys(shopData.sales).length} sales...`);
        for (const [id, data] of Object.entries(shopData.sales)) {
          await db.collection('shops').doc(shopId).collection('sales').doc(id).set(data);
          totalRestored.sales++;
        }
      }
      
      // Restore inventory logs
      if (shopData.inventory_logs) {
        console.log(`  📋 Restoring ${Object.keys(shopData.inventory_logs).length} logs...`);
        for (const [id, data] of Object.entries(shopData.inventory_logs)) {
          await db.collection('shops').doc(shopId).collection('inventory_logs').doc(id).set(data);
          totalRestored.logs++;
        }
      }
    }
    
    console.log('\n✅ Restore completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Shops: ${totalRestored.shops}`);
    console.log(`   Inventory: ${totalRestored.inventory}`);
    console.log(`   Expenses: ${totalRestored.expenses}`);
    console.log(`   Sales: ${totalRestored.sales}`);
    console.log(`   Logs: ${totalRestored.logs}`);
    
  } catch (error) {
    console.error('\n❌ Restore failed:', error);
    throw error;
  }
}

restoreFirestore()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
