// src/orders.js
// One canonical status layer shared by the whole Provider dashboard.
// It also understands legacy/driver aliases already stored in RTDB.

export const S = {
  PENDING: "pending",
  PREPARING: "preparing",
  READY: "ready",
  ASSIGNED: "assigned",
  PICKED: "pickedUp",
  WAY: "onDelivery",
  DONE: "completed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

const aliases = {
  pending_provider: S.PENDING,
  pendingprovider: S.PENDING,
  provider_pending: S.PENDING,

  pending: S.PENDING,
  new: S.PENDING,
  confirmed: S.PENDING,
  accepted: S.PENDING,
  approved: S.PREPARING,
  preparing: S.PREPARING,
  ready: S.READY,
  ready_for_pickup: S.READY,
  readyforpickup: S.READY,
  assigned: S.ASSIGNED,
  picked: S.PICKED,
  pickedup: S.PICKED,
  picked_up: S.PICKED,
  ondelivery: S.WAY,
  on_delivery: S.WAY,
  way: S.WAY,
  delivered: S.DONE,
  completed: S.DONE,
  done: S.DONE,
  rejected: S.REJECTED,
  cancelled: S.CANCELLED,
  canceled: S.CANCELLED,
};

export function normalizeStatus(orderOrStatus) {
  const raw =
    typeof orderOrStatus === "object"
      ? orderOrStatus?.status ?? orderOrStatus?.orderStatus ?? "pending"
      : orderOrStatus ?? "pending";

  const key = String(raw).trim().replaceAll("-", "_").toLowerCase();
  return aliases[key] || String(raw).trim();
}

export const labels = {
  [S.PENDING]: "طلب جديد",
  [S.PREPARING]: "جاري التجهيز",
  [S.READY]: "جاهز للطيار",
  [S.ASSIGNED]: "الطيار في الطريق للمتجر",
  [S.PICKED]: "استلمه الطيار",
  [S.WAY]: "في الطريق للعميل",
  [S.DONE]: "تم التسليم",
  [S.REJECTED]: "مرفوض",
  [S.CANCELLED]: "ملغي",
};

export function money(value) {
  return `${Number(value || 0).toLocaleString("ar-EG")} ج.م`;
}

export function date(value) {
  if (!value) return "-";
  const d = new Date(Number(value));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function isFinished(order) {
  return [S.DONE, S.REJECTED, S.CANCELLED].includes(normalizeStatus(order));
}

export function isAccounting(order) {
  return [S.PICKED, S.WAY, S.DONE].includes(normalizeStatus(order));
}
