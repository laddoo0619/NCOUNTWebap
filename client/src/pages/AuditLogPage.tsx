import { useState, useEffect } from 'react';
import api from '../services/api';
import { AuditLog, PaginatedResponse } from '../types';

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const loadLogs = async (p = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: '50' });
      if (actionFilter) params.set('action', actionFilter);
      if (entityFilter) params.set('entityType', entityFilter);
      const { data } = await api.get<PaginatedResponse<AuditLog>>(`/audit?${params}`);
      setLogs(data.data);
      setTotalPages(data.pagination.totalPages);
      setPage(p);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLogs(); }, [actionFilter, entityFilter]);

  return (
    <div>
      <div className="page-header">
        <h2>Audit Log</h2>
        <p>Complete audit trail for regulatory compliance</p>
      </div>

      <div className="card">
        <div className="form-row">
          <div className="form-group">
            <label>Filter by Action</label>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">All Actions</option>
              <option value="LOGIN">Login</option>
              <option value="FILE_UPLOADED">File Upload</option>
              <option value="TRANSACTION_RECEIVED">Received</option>
              <option value="TRANSACTION_DISPENSED">Dispensed</option>
              <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
              <option value="PHYSICAL_COUNT_UPDATED">Physical Count</option>
              <option value="RECONCILIATION_RUN">Reconciliation</option>
              <option value="DISCREPANCY_RESOLVED">Discrepancy Resolved</option>
              <option value="USER_CREATED">User Created</option>
            </select>
          </div>
          <div className="form-group">
            <label>Filter by Entity</label>
            <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="">All Entities</option>
              <option value="user">User</option>
              <option value="file_upload">File Upload</option>
              <option value="inventory_transaction">Inventory Transaction</option>
              <option value="perpetual_inventory">Perpetual Inventory</option>
              <option value="reconciliation">Reconciliation</option>
              <option value="reconciliation_item">Reconciliation Item</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p>Loading audit logs...</p>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <h3>No audit entries found</h3>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Details</th>
                    <th>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                      <td>{log.performer_username || '-'}</td>
                      <td><span className="badge badge-info">{log.action}</span></td>
                      <td>{log.entity_type}</td>
                      <td style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {log.details ? (
                          <code style={{ fontSize: '11px' }}>{JSON.stringify(log.details)}</code>
                        ) : '-'}
                      </td>
                      <td>{log.ip_address || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button disabled={page <= 1} onClick={() => loadLogs(page - 1)}>Previous</button>
                <span>Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => loadLogs(page + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
