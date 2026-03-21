import * as XLSX from 'xlsx';
import path from 'path';

export interface ParsedRow {
  din: string;
  drugName?: string;
  strength?: string;
  dosageForm?: string;
  quantity: number;
  referenceNumber?: string;
  source?: string;
  patientInitials?: string;
  rxNumber?: string;
  transactionDate?: string;
  notes?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: Array<{ row: number; message: string }>;
  headers: string[];
  totalRows: number;
}

const COLUMN_MAPPINGS: Record<string, string> = {
  'din': 'din',
  'din/nhp': 'din',
  'drug identification number': 'din',
  'drug name': 'drugName',
  'name': 'drugName',
  'product name': 'drugName',
  'medication': 'drugName',
  'strength': 'strength',
  'dosage form': 'dosageForm',
  'form': 'dosageForm',
  'quantity': 'quantity',
  'qty': 'quantity',
  'amount': 'quantity',
  'count': 'quantity',
  'units': 'quantity',
  'reference': 'referenceNumber',
  'reference number': 'referenceNumber',
  'ref': 'referenceNumber',
  'invoice': 'referenceNumber',
  'invoice number': 'referenceNumber',
  'po number': 'referenceNumber',
  'source': 'source',
  'supplier': 'source',
  'wholesaler': 'source',
  'vendor': 'source',
  'patient': 'patientInitials',
  'patient initials': 'patientInitials',
  'rx': 'rxNumber',
  'rx number': 'rxNumber',
  'rx#': 'rxNumber',
  'prescription': 'rxNumber',
  'prescription number': 'rxNumber',
  'date': 'transactionDate',
  'transaction date': 'transactionDate',
  'dispensed date': 'transactionDate',
  'received date': 'transactionDate',
  'notes': 'notes',
  'comments': 'notes',
};

function normalizeHeader(header: string): string | undefined {
  const normalized = header.trim().toLowerCase().replace(/[_\-]/g, ' ');
  return COLUMN_MAPPINGS[normalized];
}

export function parseExcelFile(filePath: string): ParseResult {
  const ext = path.extname(filePath).toLowerCase();
  const workbook = XLSX.readFile(filePath, {
    type: 'file',
    cellDates: true,
    dateNF: 'yyyy-mm-dd',
  });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rawData.length === 0) {
    return { rows: [], errors: [{ row: 0, message: 'File contains no data' }], headers: [], totalRows: 0 };
  }

  const headers = Object.keys(rawData[0]);
  const headerMap = new Map<string, string>();
  for (const header of headers) {
    const mapped = normalizeHeader(header);
    if (mapped) headerMap.set(header, mapped);
  }

  const rows: ParsedRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < rawData.length; i++) {
    const raw = rawData[i];
    const mapped: Record<string, unknown> = {};

    for (const [originalKey, mappedKey] of headerMap) {
      mapped[mappedKey] = raw[originalKey];
    }

    const din = String(mapped.din || '').trim();
    if (!din) {
      errors.push({ row: i + 2, message: 'Missing DIN' });
      continue;
    }

    const quantity = Number(mapped.quantity);
    if (isNaN(quantity)) {
      errors.push({ row: i + 2, message: `Invalid quantity for DIN ${din}` });
      continue;
    }

    let transactionDate = mapped.transactionDate as string | undefined;
    if (transactionDate instanceof Date) {
      transactionDate = (transactionDate as Date).toISOString().split('T')[0];
    } else if (transactionDate) {
      transactionDate = String(transactionDate);
    }

    rows.push({
      din,
      drugName: mapped.drugName ? String(mapped.drugName) : undefined,
      strength: mapped.strength ? String(mapped.strength) : undefined,
      dosageForm: mapped.dosageForm ? String(mapped.dosageForm) : undefined,
      quantity,
      referenceNumber: mapped.referenceNumber ? String(mapped.referenceNumber) : undefined,
      source: mapped.source ? String(mapped.source) : undefined,
      patientInitials: mapped.patientInitials ? String(mapped.patientInitials) : undefined,
      rxNumber: mapped.rxNumber ? String(mapped.rxNumber) : undefined,
      transactionDate,
      notes: mapped.notes ? String(mapped.notes) : undefined,
    });
  }

  return { rows, errors, headers, totalRows: rawData.length };
}
