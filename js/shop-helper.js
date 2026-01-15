// js/shop-helper.js
// এই ফাইলটি সব পেজে ইমপোর্ট করে activeShopId পেতে ব্যবহার করুন

export function getActiveShopId() {
    const shopId = localStorage.getItem('activeShopId');
    if (!shopId) {
        console.error('No active shop ID found. Redirecting to login...');
        window.location.href = '../index.html';
        return null;
    }
    return shopId;
}

export function getUserRole() {
    return localStorage.getItem('userRole') || 'cashier';
}

export function isStaff() {
    return localStorage.getItem('isStaff') === 'true';
}

export function isOwner() {
    return localStorage.getItem('userRole') === 'owner';
}

export function hasPermission(requiredRole) {
    const userRole = getUserRole();
    
    const roleHierarchy = {
        'owner': 3,
        'manager': 2,
        'cashier': 1
    };
    
    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}
