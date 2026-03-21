import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate, AuthRequest } from '../middleware/auth';
import { parseExcelFile } from '../services/excelService';
import { processUploadedData, processPhysicalCount } from '../services/inventoryService';
import { logAudit } from '../services/auditService';
import db from '../config/database';

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExts = ['.xlsx', '.xls', '.csv'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only .xlsx, .xls, and .csv files are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

router.post(
  '/:uploadType',
  authenticate,
  upload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { uploadType } = req.params;
      const validTypes = ['received', 'dispensed', 'physical_count'];
      if (!validTypes.includes(uploadType)) {
        res.status(400).json({ error: `Invalid upload type. Must be one of: ${validTypes.join(', ')}` });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }

      const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
      const fileType = ext === 'csv' ? 'csv' : 'xlsx';

      // Create file upload record
      const [fileUpload] = await db('file_uploads')
        .insert({
          filename: req.file.filename,
          original_name: req.file.originalname,
          file_type: fileType,
          upload_type: uploadType,
          uploaded_by: req.user!.id,
        })
        .returning('*');

      await logAudit({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'FILE_UPLOADED',
        entityType: 'file_upload',
        entityId: fileUpload.id,
        details: { originalName: req.file.originalname, uploadType, fileType },
        ipAddress: req.ip,
      });

      // Parse the file
      const parseResult = parseExcelFile(req.file.path);

      if (parseResult.rows.length === 0) {
        await db('file_uploads').where({ id: fileUpload.id }).update({
          processed: true,
          records_failed: parseResult.errors.length,
          error_message: 'No valid rows found in file',
          processed_at: new Date(),
        });
        res.status(400).json({
          error: 'No valid data rows found',
          parseErrors: parseResult.errors,
          headers: parseResult.headers,
        });
        return;
      }

      // Process based on type
      let result;
      if (uploadType === 'physical_count') {
        result = await processPhysicalCount(parseResult.rows, req.user!.id, fileUpload.id, req.ip);
      } else {
        const transactionType = uploadType === 'received' ? 'RECEIVED' : 'DISPENSED';
        result = await processUploadedData(
          parseResult.rows,
          transactionType as 'RECEIVED' | 'DISPENSED',
          req.user!.id,
          fileUpload.id,
          req.ip
        );
      }

      res.json({
        fileUploadId: fileUpload.id,
        originalName: req.file.originalname,
        uploadType,
        totalRows: parseResult.totalRows,
        processed: result.processed,
        failed: result.failed,
        parseErrors: parseResult.errors,
        processingErrors: result.errors,
      });
    } catch (error: any) {
      res.status(500).json({ error: `Upload processing failed: ${error.message}` });
    }
  }
);

router.get('/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const query = db('file_uploads')
      .join('users', 'file_uploads.uploaded_by', 'users.id')
      .select('file_uploads.*', 'users.username as uploaded_by_name')
      .orderBy('file_uploads.created_at', 'desc');

    const countResult = await query.clone().clearSelect().clearOrder().count('* as total').first();
    const total = Number(countResult?.total || 0);
    const data = await query.offset((page - 1) * limit).limit(limit);

    res.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch upload history' });
  }
});

export default router;
