import { Router, Response } from 'express';
import { authenticate, AuthRequest, authorize } from '../middleware/auth';
import {
  runReconciliation,
  getReconciliationDetails,
  listReconciliations,
  resolveDiscrepancy,
} from '../services/reconciliationService';

const router = Router();

router.post('/run', authenticate, authorize('admin', 'pharmacist'), async (req: AuthRequest, res: Response) => {
  try {
    const { periodStart, periodEnd, notes } = req.body;
    if (!periodStart || !periodEnd) {
      res.status(400).json({ error: 'Period start and end dates are required' });
      return;
    }

    const result = await runReconciliation(
      periodStart,
      periodEnd,
      req.user!.id,
      notes,
      req.ip
    );

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: `Reconciliation failed: ${error.message}` });
  }
});

router.get('/list', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await listReconciliations(page, limit);
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to fetch reconciliations' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await getReconciliationDetails(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Reconciliation not found' });
      return;
    }
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to fetch reconciliation details' });
  }
});

router.post('/resolve/:itemId', authenticate, authorize('admin', 'pharmacist'), async (req: AuthRequest, res: Response) => {
  try {
    const { resolutionNotes } = req.body;
    if (!resolutionNotes) {
      res.status(400).json({ error: 'Resolution notes are required' });
      return;
    }
    await resolveDiscrepancy(req.params.itemId, resolutionNotes, req.user!.id, req.ip);
    res.json({ message: 'Discrepancy resolved successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
