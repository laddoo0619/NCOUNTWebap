# NCOUNT - Beyond Pharmacy Narcotic Inventory Tracker

A web application for tracking and reconciling narcotic inventory at Beyond Pharmacy, designed for compliance with College of Pharmacists of BC and Health Canada standards.

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Frontend                        │
│  (Vite + TypeScript + React Router)                     │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │Dashboard │ │ Upload   │ │Inventory │ │Reconcile   │ │
│  │          │ │ (.xlsx)  │ │ View     │ │ & Audit    │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API (JSON)
┌──────────────────────┴──────────────────────────────────┐
│                Express.js Backend                        │
│  (TypeScript + JWT Auth + Multer)                       │
│                                                          │
│  ┌──────┐ ┌────────┐ ┌───────────┐ ┌─────────────────┐ │
│  │Auth  │ │Upload  │ │Inventory  │ │Reconciliation   │ │
│  │Routes│ │& Parse │ │Service    │ │Service          │ │
│  └──────┘ └────────┘ └───────────┘ └─────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │           Audit Service (immutable logging)         │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────────────┘
                       │ Knex.js ORM
┌──────────────────────┴──────────────────────────────────┐
│                    PostgreSQL                            │
│                                                          │
│  users · drugs · inventory_transactions                  │
│  perpetual_inventory · reconciliations                   │
│  reconciliation_items · audit_logs · file_uploads        │
└─────────────────────────────────────────────────────────┘
```

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `users` | Staff accounts with roles (admin, pharmacist, technician) |
| `drugs` | Narcotic catalog keyed by DIN (Drug Identification Number) |
| `inventory_transactions` | Ledger of all RECEIVED, DISPENSED, ADJUSTMENT, RETURN, DESTRUCTION events |
| `perpetual_inventory` | Running calculated balance + last physical count per drug |
| `file_uploads` | Tracks every uploaded file with processing status |
| `reconciliations` | Weekly batch reconciliation runs with period and status |
| `reconciliation_items` | Per-drug breakdown: opening balance, received, dispensed, expected vs physical |
| `audit_logs` | Immutable log of every action with user, timestamp, IP, and details |

### Key Relationships

- Every transaction links to a `drug` (by DIN) and the `user` who uploaded it
- Reconciliation items show `opening + received - dispensed + adjustments = expected` vs `physical`
- Discrepancies are flagged and must be resolved with notes before a reconciliation is marked complete

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | React 18 + TypeScript + Vite | Fast dev, type safety, modern tooling |
| Backend | Node.js + Express + TypeScript | Proven reliability, shared language with frontend |
| Database | PostgreSQL + Knex.js | ACID transactions, relational integrity, migration support |
| Auth | bcrypt + JWT | Industry-standard password hashing (12 rounds) + stateless tokens |
| Excel Parsing | SheetJS (xlsx) | Handles .xlsx, .xls, .csv with flexible column mapping |
| File Upload | Multer | Secure multipart file handling with size/type limits |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### 1. Database Setup

```bash
createdb ncount
```

### 2. Server Setup

```bash
cd server
cp .env.example .env
# Edit .env with your database URL and JWT secret
npm install
npm run migrate
npm run seed    # Creates default admin user
npm run dev
```

### 3. Client Setup

```bash
cd client
npm install
npm run dev
```

### 4. Login

- **Username:** `admin`
- **Password:** `BeyondPharmacy2024!`
- **Important:** Change this password immediately after first login.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate user |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/register` | Create user (admin only) |
| POST | `/api/upload/received` | Upload received inventory |
| POST | `/api/upload/dispensed` | Upload dispensed prescriptions |
| POST | `/api/upload/physical_count` | Upload physical count |
| GET | `/api/upload/history` | File upload history |
| GET | `/api/inventory/summary` | Perpetual inventory summary |
| GET | `/api/inventory/drugs` | Search drugs catalog |
| GET | `/api/inventory/transactions/:drugId` | Transaction history for a drug |
| POST | `/api/inventory/adjustment` | Record manual adjustment |
| GET | `/api/inventory/dashboard-stats` | Dashboard statistics |
| POST | `/api/reconciliation/run` | Run weekly reconciliation |
| GET | `/api/reconciliation/list` | List all reconciliations |
| GET | `/api/reconciliation/:id` | Reconciliation detail with items |
| POST | `/api/reconciliation/resolve/:itemId` | Resolve a discrepancy |
| GET | `/api/audit` | Query audit logs |

## Workflow

1. **Upload received inventory** — Upload the wholesaler invoice/report as Excel
2. **Upload dispensed prescriptions** — Upload the dispensing report from your PMS
3. **Upload physical count** — Upload your in-store narcotic count sheet
4. **Run reconciliation** — Select the week's date range and run the batch process
5. **Review discrepancies** — Flagged items show expected vs actual; resolve with notes
6. **Audit trail** — Every action is logged for College of Pharmacists of BC review

## Development Plan (MVP Phases)

### Phase 1 — Foundation (Complete)
- Project scaffolding, database schema, auth system
- Excel file parsing with flexible column mapping
- Core data ingestion (received, dispensed, physical count)

### Phase 2 — Reconciliation Engine
- Perpetual inventory calculation
- Weekly batch reconciliation with discrepancy flagging
- Resolution workflow with mandatory notes

### Phase 3 — Dashboard & Reporting
- At-a-glance dashboard with key metrics
- Transaction history drill-down
- Audit log with filters

### Phase 4 — Hardening
- Input validation and sanitization
- Rate limiting and CSRF protection
- Role-based access control enforcement
- Automated backup procedures
