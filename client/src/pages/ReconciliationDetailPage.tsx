import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { ReconciliationDetail } from '../types';

export default function ReconciliationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ReconciliationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState('');

  const loadDetail = async () => {
    try {
      const { data } = await api.get(`/reconciliation/${id}`);
      setDetail(data);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDetail(); }, [id]);

  const handleResolve = async (itemId: string) => {
    if (!resolutionNotes.trim()) return;
    try {
      await api.post(`/reconciliation/resolve/${itemId}`, { resolutionNotes });
      setResolvingId(null);
      setResolutionNotes('');
      loadDetail();
    } catch {}
  };

  if (loading) return <div className="empty-state"><p>Loading...</p></div>;
  if (!detail) return <div className="empty-state"><h3>Reconciliation not found</h3></div>;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'badge-success',
      flagged: 'badge-danger',
      in_progress: 'badge-warning',
      reviewed: 'badge-info',
    };
    return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <h2>Reconciliation Detail</h2>
        <p>
          <Link to="/reconciliation" style={{ color: 'var(--primary)' }}>Back to list</Link>
        </p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Status</div>
          <div style={{ marginTop: '8px' }}>{statusBadge(detail.status)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Period</div>
          <div className="stat-value" style={{ fontSize: '14px' }}>
            {new Date(detail.period_start).toLocaleDateString()} - {new Date(detail.period_end).toLocaleDateString()}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Items</div>
          <div className="stat-value">{detail.total_items}</div>
        </div>
        <div className={`stat-card ${detail.discrepancies_found > 0 ? 'warning' : ''}`}>
          <div className="stat-label">Discrepancies</div>
          <div className="stat-value">{detail.discrepancies_found}</div>
        </div>
      </div>

      {detail.notes && (
        <div className="card">
          <strong>Notes:</strong> {detail.notes}
        </div>
      )}

      <div className="card">
        <h3>Line Items</h3>
        <div className="table-container" style={{ marginTop: '12px' }}>
          <table>
            <thead>
              <tr>
                <th>DIN</th>
                <th>Drug</th>
                <th>Opening</th>
                <th>Received</th>
                <th>Dispensed</th>
                <th>Adjustments</th>
                <th>Expected</th>
                <th>Physical</th>
                <th>Discrepancy</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.items.map((item) => (
                <tr key={item.id} className={item.has_discrepancy && !item.resolved ? 'discrepancy-row' : ''}>
                  <td><strong>{item.din}</strong></td>
                  <td>{item.drug_name} {item.strength || ''}</td>
                  <td>{Number(item.opening_balance).toFixed(1)}</td>
                  <td style={{ color: 'var(--success)' }}>+{Number(item.total_received).toFixed(1)}</td>
                  <td style={{ color: 'var(--danger)' }}>-{Number(item.total_dispensed).toFixed(1)}</td>
                  <td>{Number(item.total_adjustments).toFixed(1)}</td>
                  <td><strong>{Number(item.expected_quantity).toFixed(1)}</strong></td>
                  <td>{item.physical_quantity != null ? Number(item.physical_quantity).toFixed(1) : 'N/A'}</td>
                  <td>
                    {item.has_discrepancy ? (
                      <span className="badge badge-danger">
                        {Number(item.discrepancy) > 0 ? '+' : ''}{Number(item.discrepancy).toFixed(1)}
                      </span>
                    ) : (
                      <span className="badge badge-success">OK</span>
                    )}
                  </td>
                  <td>
                    {item.has_discrepancy ? (
                      item.resolved ? (
                        <span className="badge badge-success" title={item.resolution_notes}>Resolved</span>
                      ) : resolvingId === item.id ? (
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Resolution notes..."
                            value={resolutionNotes}
                            onChange={(e) => setResolutionNotes(e.target.value)}
                            style={{ padding: '4px 8px', fontSize: '12px', width: '150px' }}
                          />
                          <button className="btn btn-sm btn-primary" onClick={() => handleResolve(item.id)}>Save</button>
                          <button className="btn btn-sm btn-secondary" onClick={() => setResolvingId(null)}>X</button>
                        </div>
                      ) : (
                        <button className="btn btn-sm btn-danger" onClick={() => setResolvingId(item.id)}>
                          Resolve
                        </button>
                      )
                    ) : (
                      <span className="badge badge-success">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
