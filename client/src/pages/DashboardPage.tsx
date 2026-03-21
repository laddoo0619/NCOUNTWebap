import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { DashboardStats } from '../types';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/inventory/dashboard-stats')
      .then(({ data }) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty-state"><p>Loading dashboard...</p></div>;
  if (!stats) return <div className="empty-state"><p>Failed to load dashboard data.</p></div>;

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Narcotic inventory overview for Beyond Pharmacy</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Tracked Narcotics</div>
          <div className="stat-value">{stats.totalDrugs}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Transactions</div>
          <div className="stat-value">{stats.totalTransactions}</div>
        </div>
        <div className={`stat-card ${stats.activeDiscrepancies > 0 ? 'warning' : ''}`}>
          <div className="stat-label">Active Discrepancies</div>
          <div className="stat-value">{stats.activeDiscrepancies}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Reconciliation</div>
          <div className="stat-value" style={{ fontSize: '16px' }}>
            {stats.lastReconciliation
              ? new Date(stats.lastReconciliation.reconciliation_date).toLocaleDateString()
              : 'Never'}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Quick Actions</h3>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <Link to="/upload" className="btn btn-primary">Upload Inventory Data</Link>
          <Link to="/reconciliation" className="btn btn-secondary">Run Reconciliation</Link>
          <Link to="/inventory" className="btn btn-secondary">View Inventory</Link>
        </div>
      </div>

      {stats.recentUploads.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Recent Uploads</h3>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type</th>
                  <th>Records</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentUploads.map((upload) => (
                  <tr key={upload.id}>
                    <td>{upload.original_name}</td>
                    <td><span className="badge badge-info">{upload.upload_type}</span></td>
                    <td>{upload.records_processed} processed / {upload.records_failed} failed</td>
                    <td>
                      <span className={`badge ${upload.processed ? 'badge-success' : 'badge-warning'}`}>
                        {upload.processed ? 'Processed' : 'Pending'}
                      </span>
                    </td>
                    <td>{new Date(upload.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
