// Row types for new tables introduced in migration 20261112000000_scan_receipts_stock

export type StorageZone = "fridge" | "freezer" | "pantry";
export type MovementSource = "scan" | "cooked" | "inventory" | "manual";
export type ScanInputType = "receipt" | "voice" | "video" | "screenshot" | "text";
export type ScanStatus = "pending" | "confirmed" | "rejected";
export type ScanMode = "add" | "set";

export type PantryMovementRow = {
  id: string;
  household_id: string;
  product_id: string;
  delta: number;
  source: MovementSource;
  scan_id: string | null;
  meal_plan_entry_id: string | null;
  created_at: string;
};

export type ReceiptRow = {
  id: string;
  household_id: string;
  store_id: string | null;
  store_name: string | null;
  purchased_at: string;
  total: number | null;
  input_source: string;
  scan_id: string | null;
  created_at: string;
};

export type ReceiptItemRow = {
  id: string;
  receipt_id: string;
  household_id: string;
  product_id: string | null;
  raw_name: string;
  quantity: number;
  unit: string | null;
  price: number | null;
  created_at: string;
};

export type IncomingScanRow = {
  id: string;
  household_id: string;
  sent_by: string;
  channel: string;
  input_type: ScanInputType;
  status: ScanStatus;
  mode: ScanMode;
  store_name: string | null;
  total: number | null;
  items: unknown; // jsonb — array of ScanItem from scan-types.ts
  channel_data: unknown; // jsonb
  created_at: string;
  confirmed_at: string | null;
};

export type ChannelBindingRow = {
  id: string;
  household_id: string;
  user_id: string;
  channel: string;
  external_id: string;
  link_code: string | null;
  link_code_expires_at: string | null;
  linked_at: string | null;
  created_at: string;
};
