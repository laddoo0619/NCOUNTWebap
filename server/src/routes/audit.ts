import { Router, Response } from 'express';
import { authenticate, AuthRequest, authorize } from '../middleware/auth';
import { getAuditLogs } from '../services/auditService';

const router = Router();

router.get('/', authenticate, authorize('admin', 'pharmacist'), async (req: AuthRequest, res: Response) => {
  try {
    const result = await getAuditLogs({
      userId: req.query.userId as string,
      entityType: req.query.entityType as string,
      action: req.query.action as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
    });
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

export default router;
