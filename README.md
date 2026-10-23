# Bringo Provider Web

لوحة React متجاوبة لمقدمي الخدمات.

## التشغيل
1. انسخ `.env.example` إلى `.env`.
2. ضع إعدادات Firebase.
3. نفذ `npm install` ثم `npm run dev`.

## الربط
- `providerUsers/{uid}` يحتوي `storeId`, `name`, `isActive`.
- `stores/{storeId}` بيانات المتجر.
- `orders/{orderId}` ويجب أن يحتوي الطلب `storeId` و`status`.

الحالات: `pending_provider`, `preparing`, `ready_for_pickup`, `assigned_to_driver`, `picked_up`, `on_the_way`, `delivered`, `rejected_by_provider`, `cancelled`.
