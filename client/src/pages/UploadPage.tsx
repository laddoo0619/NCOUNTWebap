import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import api from '../services/api';
import { UploadResult } from '../types';

type UploadType = 'received' | 'dispensed' | 'physical_count';

export default function UploadPage() {
  const [uploadType, setUploadType] = useState<UploadType>('received');
  const [file, setFile] = useState<File | null>(null);
  const [dragover, setDragover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragover(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await api.post<UploadResult>(`/upload/${uploadType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Upload Inventory Data</h2>
        <p>Upload Excel or CSV files containing narcotic inventory data</p>
      </div>

      <div className="card">
        <div className="form-group">
          <label>Upload Type</label>
          <select value={uploadType} onChange={(e) => setUploadType(e.target.value as UploadType)}>
            <option value="received">Items Received (from wholesaler)</option>
            <option value="dispensed">Prescriptions Dispensed</option>
            <option value="physical_count">Physical Count (in-store report)</option>
          </select>
        </div>

        <div
          className={`upload-area ${dragover ? 'dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          {file ? (
            <>
              <h3>Selected: {file.name}</h3>
              <p>{(file.size / 1024).toFixed(1)} KB</p>
            </>
          ) : (
            <>
              <h3>Drop your file here or click to browse</h3>
              <p>Accepts .xlsx, .xls, and .csv files (max 10MB)</p>
            </>
          )}
        </div>

        <div style={{ marginTop: '16px' }}>
          <button
            className="btn btn-primary"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? 'Processing...' : 'Upload & Process'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {result && (
        <div className="card">
          <h3>Upload Results</h3>
          <div className="stats-grid" style={{ marginTop: '16px' }}>
            <div className="stat-card">
              <div className="stat-label">Total Rows</div>
              <div className="stat-value">{result.totalRows}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Processed</div>
              <div className="stat-value" style={{ color: 'var(--success)' }}>{result.processed}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Failed</div>
              <div className="stat-value" style={{ color: result.failed > 0 ? 'var(--danger)' : 'inherit' }}>
                {result.failed}
              </div>
            </div>
          </div>

          {result.parseErrors.length > 0 && (
            <div className="alert alert-warning" style={{ marginTop: '12px' }}>
              <strong>Parse Warnings:</strong>
              <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                {result.parseErrors.map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {result.processingErrors.length > 0 && (
            <div className="alert alert-error" style={{ marginTop: '12px' }}>
              <strong>Processing Errors:</strong>
              <ul style={{ marginTop: '4px', paddingLeft: '20px' }}>
                {result.processingErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>Expected File Format</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>
          Your Excel/CSV file should contain columns with these headers (case-insensitive):
        </p>
        <div className="table-container" style={{ marginTop: '12px' }}>
          <table>
            <thead>
              <tr>
                <th>Column</th>
                <th>Required</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><strong>DIN</strong></td><td>Yes</td><td>Drug Identification Number</td></tr>
              <tr><td><strong>Quantity</strong> / Qty / Amount</td><td>Yes</td><td>Number of units</td></tr>
              <tr><td>Drug Name / Name</td><td>No</td><td>Medication name</td></tr>
              <tr><td>Strength</td><td>No</td><td>e.g., "5mg", "10mg/mL"</td></tr>
              <tr><td>Date / Transaction Date</td><td>No</td><td>Defaults to today</td></tr>
              <tr><td>Reference / Invoice</td><td>No</td><td>PO or invoice number</td></tr>
              <tr><td>Source / Supplier</td><td>No</td><td>Wholesaler name (for received)</td></tr>
              <tr><td>Rx Number / Prescription</td><td>No</td><td>Rx number (for dispensed)</td></tr>
              <tr><td>Patient Initials</td><td>No</td><td>Patient ID (for dispensed)</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
