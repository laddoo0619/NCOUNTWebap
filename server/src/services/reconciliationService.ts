import db from '../config/database';
import { logAudit } from './auditService';

export async function runReconciliation(
  periodStart: string,
  periodEnd: string,
  userId: string,
  notes?: string,
  ipAddress?: string
) {
  return db.transaction(async (trx) => {
    // Create reconciliation record
    const [reconciliation] = await trx('reconciliations')
      .insert({
        reconciliation_date: new Date().toISOString().split('T')[0],
        period_start: periodStart,
        period_end: periodEnd,
        status: 'in_progress',
        performed_by: userId,
        notes,
      })
      .returning('*');

    // Get all active drugs with perpetual inventory
    const drugs = await trx('perpetual_inventory')
      .join('drugs', 'perpetual_inventory.drug_id', 'drugs.id')
      .where('drugs.is_active', true)
      .select('drugs.id as drug_id', 'drugs.din', 'drugs.name', 'perpetual_inventory.*');

    let totalItems = 0;
    let discrepanciesFound = 0;

    for (const drug of drugs) {
      // Calculate period totals
      const received = await trx('inventory_transactions')
        .where({ drug_id: drug.drug_id, transaction_type: 'RECEIVED' })
        .whereBetween('transaction_date', [periodStart, periodEnd])
        .sum('quantity as total')
        .first();

      const dispensed = await trx('inventory_transactions')
        .where({ drug_id: drug.drug_id, transaction_type: 'DISPENSED' })
        .whereBetween('transaction_date', [periodStart, periodEnd])
        .sum('quantity as total')
        .first();

      const adjustments = await trx('inventory_transactions')
        .where({ drug_id: drug.drug_id })
        .whereIn('transaction_type', ['ADJUSTMENT', 'RETURN', 'DESTRUCTION'])
        .whereBetween('transaction_date', [periodStart, periodEnd])
        .sum('quantity as total')
        .first();

      // Get opening balance (transactions before period start)
      const priorReceived = await trx('inventory_transactions')
        .where({ drug_id: drug.drug_id, transaction_type: 'RECEIVED' })
        .where('transaction_date', '<', periodStart)
        .sum('quantity as total')
        .first();

      const priorDispensed = await trx('inventory_transactions')
        .where({ drug_id: drug.drug_id, transaction_type: 'DISPENSED' })
        .where('transaction_date', '<', periodStart)
        .sum('quantity as total')
        .first();

      const priorAdjustments = await trx('inventory_transactions')
        .where({ drug_id: drug.drug_id })
        .whereIn('transaction_type', ['ADJUSTMENT', 'RETURN', 'DESTRUCTION'])
        .where('transaction_date', '<', periodStart)
        .sum('quantity as total')
        .first();

      const openingBalance = Number(priorReceived?.total || 0) - Number(priorDispensed?.total || 0) + Number(priorAdjustments?.total || 0);
      const totalRec = Number(received?.total || 0);
      const totalDisp = Number(dispensed?.total || 0);
      const totalAdj = Number(adjustments?.total || 0);
      const expectedQuantity = openingBalance + totalRec - totalDisp + totalAdj;
      const physicalQuantity = drug.physical_quantity;
      const discrepancy = physicalQuantity != null ? Number(physicalQuantity) - expectedQuantity : 0;
      const hasDiscrepancy = physicalQuantity != null && Math.abs(discrepancy) > 0.001;

      await trx('reconciliation_items').insert({
        reconciliation_id: reconciliation.id,
        drug_id: drug.drug_id,
        opening_balance: openingBalance,
        total_received: totalRec,
        total_dispensed: totalDisp,
        total_adjustments: totalAdj,
        expected_quantity: expectedQuantity,
        physical_quantity: physicalQuantity,
        discrepancy,
        has_discrepancy: hasDiscrepancy,
      });

      totalItems++;
      if (hasDiscrepancy) discrepanciesFound++;
    }

    // Update reconciliation totals
    const status = discrepanciesFound > 0 ? 'flagged' : 'completed';
    await trx('reconciliations')
      .where({ id: reconciliation.id })
      .update({
        total_items: totalItems,
        discrepancies_found: discrepanciesFound,
        status,
        updated_at: new Date(),
      });

    await logAudit({
      userId,
      action: 'RECONCILIATION_RUN',
      entityType: 'reconciliation',
      entityId: reconciliation.id,
      details: { periodStart, periodEnd, totalItems, discrepanciesFound, status },
      ipAddress,
    });

    return {
      ...reconciliation,
      status,
      total_items: totalItems,
      discrepancies_found: discrepanciesFound,
    };
  });
}

export async function getReconciliationDetails(reconciliationId: string) {
  const reconciliation = await db('reconciliations')
    .join('users', 'reconciliations.performed_by', 'users.id')
    .select('reconciliations.*', 'users.username as performed_by_name')
    .where('reconciliations.id', reconciliationId)
    .first();

  if (!reconciliation) return null;

  const items = await db('reconciliation_items')
    .join('drugs', 'reconciliation_items.drug_id', 'drugs.id')
    .select('reconciliation_items.*', 'drugs.din', 'drugs.name as drug_name', 'drugs.strength', 'drugs.dosage_form')
    .where('reconciliation_items.reconciliation_id', reconciliationId)
    .orderBy([
      { column: 'reconciliation_items.has_discrepancy', order: 'desc' },
      { column: 'drugs.name', order: 'asc' },
    ]);

  return { ...reconciliation, items };
}

export async function listReconciliations(page = 1, limit = 20) {
  const query = db('reconciliations')
    .join('users', 'reconciliations.performed_by', 'users.id')
    .select('reconciliations.*', 'users.username as performed_by_name')
    .orderBy('reconciliations.created_at', 'desc');

  const countResult = await query.clone().clearSelect().clearOrder().count('* as total').first();
  const total = Number(countResult?.total || 0);

  const data = await query.offset((page - 1) * limit).limit(limit);

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function resolveDiscrepancy(
  itemId: string,
  resolutionNotes: string,
  userId: string,
  ipAddress?: string
) {
  const item = await db('reconciliation_items').where({ id: itemId }).first();
  if (!item) throw new Error('Reconciliation item not found');

  await db('reconciliation_items')
    .where({ id: itemId })
    .update({
      resolved: true,
      resolution_notes: resolutionNotes,
      resolved_by: userId,
      resolved_at: new Date(),
      updated_at: new Date(),
    });

  // Update reconciliation resolved count
  const resolvedCount = await db('reconciliation_items')
    .where({ reconciliation_id: item.reconciliation_id, resolved: true })
    .count('* as count')
    .first();

  const reconciliation = await db('reconciliations').where({ id: item.reconciliation_id }).first();
  if (reconciliation && Number(resolvedCount?.count) >= reconciliation.discrepancies_found) {
    await db('reconciliations')
      .where({ id: item.reconciliation_id })
      .update({ status: 'completed', discrepancies_resolved: Number(resolvedCount?.count), updated_at: new Date() });
  } else {
    await db('reconciliations')
      .where({ id: item.reconciliation_id })
      .update({ discrepancies_resolved: Number(resolvedCount?.count), updated_at: new Date() });
  }

  await logAudit({
    userId,
    action: 'DISCREPANCY_RESOLVED',
    entityType: 'reconciliation_item',
    entityId: itemId,
    details: { resolutionNotes, reconciliationId: item.reconciliation_id },
    ipAddress,
  });
}
