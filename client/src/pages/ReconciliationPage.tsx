import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Reconciliation, PaginatedResponse } from '../types';

export default function ReconciliationPage() {
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const navigate = useNavigate();

  const loadReconciliations = async (p = 1) => {
    try {
      const { data } = await api.get<PaginatedResponse<Reconciliation>>(`/reconciliation/list?page=${p}`);
      setReconciliations(data.data);
      setTotalPages(data.pagination.totalPages);
      setPage(p);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReconciliations(); }, []);

  // Default date range: last 7 days
  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 7);
    setPeriodStart(start.toISOString().split('T')[0]);
    setPeriodEnd(end.toISOString().split('T')[0]);
  }, []);

  const handleRunReconciliation = async () => {
    if (!periodStart || !periodEnd) {
      setError('Please select both start and end dates');
      return;
    }
    setRunning(true);
    setError('');
    try {
      const { data } = await api.post('/reconciliation/run', {
        periodStart,
        periodEnd,
        notes: notes || undefined,
      });
      navigate(`/reconciliation/${data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Reconciliation failed');
    } finally {
      setRunning(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'badge-success',
      flagged: 'badge-danger',
      in_progress: 'badge-warning',
      reviewed: 'badge-info',
      pending: 'badge-neutral',
    };
    return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <h2>Weekly Reconciliation</h2>
        <p>Compare calculated perpetual inventory against physical counts</p>
      </div>

      <div className="card">
        <h3>Run New Reconciliation</h3>
        <div className="form-row" style={{ marginTop: '16px' }}>
          <div className="form-group">
            <label>Period Start</label>
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Period End</label>
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label>Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Weekly reconciliation notes..." />
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <button className="btn btn-primary" onClick={handleRunReconciliation} disabled={running}>
          {running ? 'Running Reconciliation...' : 'Run Reconciliation'}
        </button>
      </div>

      <div className="card">
        <h3>Reconciliation History</h3>
        {loading ? (
          <p>Loading...</p>
        ) : reconciliations.length === 0 ? (
          <div className="empty-state">
            <h3>No reconciliations yet</h3>
            <p>Run your first reconciliation above.</p>
          </div>
        ) : (
          <>
            <div className="table-container" style={{ marginTop: '12px' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Period</th>
                    <th>Status</th>
                    <th>Items</th>
                    <th>Discrepancies</th>
                    <th>Resolved</th>
                    <th>By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliations.map((rec) => (
                    <tr key={rec.id}>
                      <td>{new Date(rec.reconciliation_date).toLocaleDateString()}</td>
                      <td>{new Date(rec.period_start).toLocaleDateString()} - {new Date(rec.period_end).toLocaleDateString()}</td>
                      <td>{statusBadge(rec.status)}</td>
                      <td>{rec.total_items}</td>
                      <td>{rec.discrepancies_found > 0 ? (
                        <span className="badge badge-danger">{rec.discrepancies_found}</span>
                      ) : '0'}</td>
                      <td>{rec.discrepancies_resolved}</td>
                      <td>{rec.performed_by_name}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => navigate(`/reconciliation/${rec.id}`)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button disabled={page <= 1} onClick={() => loadReconciliations(page - 1)}>Previous</button>
                <span>Page {page} of {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => loadReconciliations(page + 1)}>Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
