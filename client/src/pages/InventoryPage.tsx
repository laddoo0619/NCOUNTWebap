import { useState, useEffect } from 'react';
import api from '../services/api';
import { InventorySummaryItem, InventoryTransaction } from '../types';

export default function InventoryPage() {
  const [inventory, setInventory] = useState<InventorySummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDrug, setSelectedDrug] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    api.get('/inventory/summary')
      .then(({ data }) => setInventory(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadTransactions = async (drugId: string) => {
    setSelectedDrug(drugId);
    setTxLoading(true);
    try {
      const { data } = await api.get(`/inventory/transactions/${drugId}`);
      setTransactions(data);
    } catch {
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  };

  const filtered = inventory.filter(item =>
    item.din.toLowerCase().includes(search.toLowerCase()) ||
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="empty-state"><p>Loading inventory...</p></div>;

  return (
    <div>
      <div className="page-header">
        <h2>Perpetual Inventory</h2>
        <p>Current narcotic inventory balances by DIN</p>
      </div>

      <div className="card">
        <div className="form-group" style={{ marginBottom: '0' }}>
          <input
            type="text"
            placeholder="Search by DIN or drug name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <h3>No inventory data</h3>
            <p>Upload received or dispensed data to populate inventory.</p>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>DIN</th>
                  <th>Drug Name</th>
                  <th>Strength</th>
                  <th>Form</th>
                  <th>Calculated Qty</th>
                  <th>Physical Qty</th>
                  <th>Discrepancy</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const disc = item.physical_quantity != null
                    ? Number(item.physical_quantity) - Number(item.calculated_quantity)
                    : null;
                  const hasDisc = disc !== null && Math.abs(disc) > 0.001;

                  return (
                    <tr key={item.drug_id} className={hasDisc ? 'discrepancy-row' : ''}>
                      <td><strong>{item.din}</strong></td>
                      <td>{item.name}</td>
                      <td>{item.strength || '-'}</td>
                      <td>{item.dosage_form || '-'}</td>
                      <td>{Number(item.calculated_quantity).toFixed(1)}</td>
                      <td>{item.physical_quantity != null ? Number(item.physical_quantity).toFixed(1) : 'N/A'}</td>
                      <td>
                        {hasDisc ? (
                          <span className="badge badge-danger">{disc! > 0 ? '+' : ''}{disc!.toFixed(1)}</span>
                        ) : disc !== null ? (
                          <span className="badge badge-success">OK</span>
                        ) : (
                          <span className="badge badge-neutral">N/A</span>
                        )}
                      </td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => loadTransactions(item.drug_id)}>
                          History
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedDrug && (
        <div className="card">
          <div className="card-header">
            <h3>Transaction History</h3>
            <button className="btn btn-sm btn-secondary" onClick={() => setSelectedDrug(null)}>Close</button>
          </div>
          {txLoading ? (
            <p>Loading...</p>
          ) : transactions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>No transactions found.</p>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Quantity</th>
                    <th>Reference</th>
                    <th>Rx #</th>
                    <th>By</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td>{new Date(tx.transaction_date).toLocaleDateString()}</td>
                      <td>
                        <span className={`badge ${
                          tx.transaction_type === 'RECEIVED' ? 'badge-success' :
                          tx.transaction_type === 'DISPENSED' ? 'badge-info' :
                          'badge-warning'
                        }`}>
                          {tx.transaction_type}
                        </span>
                      </td>
                      <td>{tx.quantity}</td>
                      <td>{tx.reference_number || '-'}</td>
                      <td>{tx.rx_number || '-'}</td>
                      <td>{tx.uploaded_by_name}</td>
                      <td>{tx.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
