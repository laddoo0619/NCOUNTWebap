export interface User {
  id: string;
  username: string;
  email: string;
  role: 'admin' | 'pharmacist' | 'technician';
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Drug {
  id: string;
  din: string;
  name: string;
  generic_name?: string;
  strength?: string;
  dosage_form?: string;
  schedule: string;
  is_active: boolean;
}

export interface InventorySummaryItem {
  drug_id: string;
  din: string;
  name: string;
  strength?: string;
  dosage_form?: string;
  schedule: string;
  calculated_quantity: number;
  physical_quantity: number | null;
  last_physical_count_at: string | null;
  last_calculated_at: string | null;
}

export interface InventoryTransaction {
  id: string;
  drug_id: string;
  transaction_type: 'RECEIVED' | 'DISPENSED' | 'ADJUSTMENT' | 'RETURN' | 'DESTRUCTION';
  quantity: number;
  reference_number?: string;
  source?: string;
  patient_initials?: string;
  rx_number?: string;
  notes?: string;
  uploaded_by: string;
  uploaded_by_name: string;
  transaction_date: string;
  created_at: string;
  din: string;
  drug_name: string;
}

export interface FileUpload {
  id: string;
  filename: string;
  original_name: string;
  file_type: string;
  upload_type: string;
  uploaded_by_name: string;
  processed: boolean;
  records_processed: number;
  records_failed: number;
  error_message?: string;
  created_at: string;
}

export interface UploadResult {
  fileUploadId: string;
  originalName: string;
  uploadType: string;
  totalRows: number;
  processed: number;
  failed: number;
  parseErrors: Array<{ row: number; message: string }>;
  processingErrors: string[];
}

export interface Reconciliation {
  id: string;
  reconciliation_date: string;
  period_start: string;
  period_end: string;
  status: 'pending' | 'in_progress' | 'completed' | 'reviewed' | 'flagged';
  performed_by_name: string;
  total_items: number;
  discrepancies_found: number;
  discrepancies_resolved: number;
  notes?: string;
  created_at: string;
}

export interface ReconciliationItem {
  id: string;
  reconciliation_id: string;
  drug_id: string;
  din: string;
  drug_name: string;
  strength?: string;
  dosage_form?: string;
  opening_balance: number;
  total_received: number;
  total_dispensed: number;
  total_adjustments: number;
  expected_quantity: number;
  physical_quantity: number | null;
  discrepancy: number;
  has_discrepancy: boolean;
  resolved: boolean;
  resolution_notes?: string;
}

export interface ReconciliationDetail extends Reconciliation {
  items: ReconciliationItem[];
}

export interface AuditLog {
  id: string;
  user_id: string;
  performer_username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
  ip_address: string;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DashboardStats {
  totalDrugs: number;
  totalTransactions: number;
  activeDiscrepancies: number;
  recentUploads: FileUpload[];
  lastReconciliation: Reconciliation | null;
}
