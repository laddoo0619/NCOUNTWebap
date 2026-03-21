import db from '../config/database';
import { ParsedRow } from './excelService';
import { logAudit } from './auditService';

export async function findOrCreateDrug(din: string, row: ParsedRow): Promise<string> {
  let drug = await db('drugs').where({ din }).first();
  if (!drug) {
    [drug] = await db('drugs')
      .insert({
        din,
        name: row.drugName || `Unknown Drug (DIN: ${din})`,
        strength: row.strength,
        dosage_form: row.dosageForm,
        schedule: 'narcotic',
      })
      .returning('*');
  }
  return drug.id;
}

export async function processUploadedData(
  rows: ParsedRow[],
  transactionType: 'RECEIVED' | 'DISPENSED',
  userId: string,
  fileUploadId: string,
  ipAddress?: string
): Promise<{ processed: number; failed: number; errors: string[] }> {
  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      await db.transaction(async (trx) => {
        const drugId = await findOrCreateDrug(row.din, row);

        await trx('inventory_transactions').insert({
          drug_id: drugId,
          transaction_type: transactionType,
          quantity: row.quantity,
          reference_number: row.referenceNumber,
          source: row.source,
          patient_initials: row.patientInitials,
          rx_number: row.rxNumber,
          notes: row.notes,
          uploaded_by: userId,
          file_upload_id: fileUploadId,
          transaction_date: row.transactionDate || new Date().toISOString().split('T')[0],
        });

        // Update perpetual inventory
        const existing = await trx('perpetual_inventory').where({ drug_id: drugId }).first();
        const quantityChange = transactionType === 'RECEIVED' ? row.quantity : -row.quantity;

        if (existing) {
          await trx('perpetual_inventory')
            .where({ drug_id: drugId })
            .update({
              calculated_quantity: db.raw('calculated_quantity + ?', [quantityChange]),
              last_calculated_at: new Date(),
              updated_at: new Date(),
            });
        } else {
          await trx('perpetual_inventory').insert({
            drug_id: drugId,
            calculated_quantity: quantityChange,
            last_calculated_at: new Date(),
          });
        }

        await logAudit({
          userId,
          action: `TRANSACTION_${transactionType}`,
          entityType: 'inventory_transaction',
          entityId: drugId,
          details: { din: row.din, quantity: row.quantity, transactionType, referenceNumber: row.referenceNumber },
          ipAddress,
        });
      });
      processed++;
    } catch (error: any) {
      failed++;
      errors.push(`DIN ${row.din}: ${error.message}`);
    }
  }

  // Update file upload record
  await db('file_uploads')
    .where({ id: fileUploadId })
    .update({
      processed: true,
      records_processed: processed,
      records_failed: failed,
      error_message: errors.length > 0 ? errors.join('; ') : null,
      processed_at: new Date(),
    });

  return { processed, failed, errors };
}

export async function processPhysicalCount(
  rows: ParsedRow[],
  userId: string,
  fileUploadId: string,
  ipAddress?: string
): Promise<{ processed: number; failed: number; errors: string[] }> {
  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const drugId = await findOrCreateDrug(row.din, row);

      const existing = await db('perpetual_inventory').where({ drug_id: drugId }).first();
      if (existing) {
        await db('perpetual_inventory')
          .where({ drug_id: drugId })
          .update({
            physical_quantity: row.quantity,
            last_physical_count_at: new Date(),
            updated_at: new Date(),
          });
      } else {
        await db('perpetual_inventory').insert({
          drug_id: drugId,
          calculated_quantity: 0,
          physical_quantity: row.quantity,
          last_physical_count_at: new Date(),
        });
      }

      await logAudit({
        userId,
        action: 'PHYSICAL_COUNT_UPDATED',
        entityType: 'perpetual_inventory',
        entityId: drugId,
        details: { din: row.din, physicalQuantity: row.quantity },
        ipAddress,
      });

      processed++;
    } catch (error: any) {
      failed++;
      errors.push(`DIN ${row.din}: ${error.message}`);
    }
  }

  await db('file_uploads')
    .where({ id: fileUploadId })
    .update({
      processed: true,
      records_processed: processed,
      records_failed: failed,
      error_message: errors.length > 0 ? errors.join('; ') : null,
      processed_at: new Date(),
    });

  return { processed, failed, errors };
}

export async function getInventorySummary() {
  return db('perpetual_inventory')
    .join('drugs', 'perpetual_inventory.drug_id', 'drugs.id')
    .select(
      'drugs.id as drug_id',
      'drugs.din',
      'drugs.name',
      'drugs.strength',
      'drugs.dosage_form',
      'drugs.schedule',
      'perpetual_inventory.calculated_quantity',
      'perpetual_inventory.physical_quantity',
      'perpetual_inventory.last_physical_count_at',
      'perpetual_inventory.last_calculated_at'
    )
    .where('drugs.is_active', true)
    .orderBy('drugs.name');
}

export async function getDrugTransactionHistory(drugId: string, startDate?: string, endDate?: string) {
  const query = db('inventory_transactions')
    .join('drugs', 'inventory_transactions.drug_id', 'drugs.id')
    .join('users', 'inventory_transactions.uploaded_by', 'users.id')
    .select(
      'inventory_transactions.*',
      'drugs.din',
      'drugs.name as drug_name',
      'users.username as uploaded_by_name'
    )
    .where('inventory_transactions.drug_id', drugId)
    .orderBy('inventory_transactions.transaction_date', 'desc');

  if (startDate) query.where('inventory_transactions.transaction_date', '>=', startDate);
  if (endDate) query.where('inventory_transactions.transaction_date', '<=', endDate);

  return query;
}
