import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getInventorySummary, getDrugTransactionHistory } from '../services/inventoryService';
import { logAudit } from '../services/auditService';
import db from '../config/database';

const router = Router();

router.get('/summary', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const summary = await getInventorySummary();
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch inventory summary' });
  }
});

router.get('/drugs', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const search = req.query.search as string;
    let query = db('drugs').where('is_active', true).orderBy('name');
    if (search) {
      query = query.where(function () {
        this.where('din', 'ilike', `%${search}%`)
          .orWhere('name', 'ilike', `%${search}%`)
          .orWhere('generic_name', 'ilike', `%${search}%`);
      });
    }
    const drugs = await query;
    res.json(drugs);
  } catch {
    res.status(500).json({ error: 'Failed to fetch drugs' });
  }
});

router.get('/transactions/:drugId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { drugId } = req.params;
    const { startDate, endDate } = req.query;
    const transactions = await getDrugTransactionHistory(
      drugId,
      startDate as string,
      endDate as string
    );
    res.json(transactions);
  } catch {
    res.status(500).json({ error: 'Failed to fetch transaction history' });
  }
});

router.post('/adjustment', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { drugId, quantity, notes, transactionDate } = req.body;
    if (!drugId || quantity === undefined) {
      res.status(400).json({ error: 'Drug ID and quantity are required' });
      return;
    }

    await db.transaction(async (trx) => {
      await trx('inventory_transactions').insert({
        drug_id: drugId,
        transaction_type: 'ADJUSTMENT',
        quantity,
        notes,
        uploaded_by: req.user!.id,
        transaction_date: transactionDate || new Date().toISOString().split('T')[0],
      });

      await trx('perpetual_inventory')
        .where({ drug_id: drugId })
        .update({
          calculated_quantity: db.raw('calculated_quantity + ?', [quantity]),
          last_calculated_at: new Date(),
          updated_at: new Date(),
        });

      await logAudit({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'MANUAL_ADJUSTMENT',
        entityType: 'inventory_transaction',
        entityId: drugId,
        details: { quantity, notes },
        ipAddress: req.ip,
      });
    });

    res.json({ message: 'Adjustment recorded successfully' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to record adjustment' });
  }
});

router.get('/dashboard-stats', authenticate, async (_req: AuthRequest, res: Response) => {
  try {
    const totalDrugs = await db('drugs').where('is_active', true).count('* as count').first();
    const totalTransactions = await db('inventory_transactions').count('* as count').first();
    const discrepancies = await db('perpetual_inventory')
      .whereNotNull('physical_quantity')
      .whereRaw('ABS(calculated_quantity - physical_quantity) > 0.001')
      .count('* as count')
      .first();
    const recentUploads = await db('file_uploads')
      .orderBy('created_at', 'desc')
      .limit(5)
      .join('users', 'file_uploads.uploaded_by', 'users.id')
      .select('file_uploads.*', 'users.username as uploaded_by_name');
    const lastReconciliation = await db('reconciliations')
      .orderBy('created_at', 'desc')
      .first();

    res.json({
      totalDrugs: Number(totalDrugs?.count || 0),
      totalTransactions: Number(totalTransactions?.count || 0),
      activeDiscrepancies: Number(discrepancies?.count || 0),
      recentUploads,
      lastReconciliation,
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

export default router;
