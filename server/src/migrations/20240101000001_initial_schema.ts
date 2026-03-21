import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('username', 100).notNullable().unique();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.enum('role', ['admin', 'pharmacist', 'technician']).notNullable().defaultTo('technician');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('last_login_at');
    table.timestamps(true, true);
  });

  // Drugs table (keyed by DIN)
  await knex.schema.createTable('drugs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('din', 20).notNullable().unique();
    table.string('name', 255).notNullable();
    table.string('generic_name', 255);
    table.string('strength', 100);
    table.string('dosage_form', 100);
    table.string('manufacturer', 255);
    table.enum('schedule', ['I', 'II', 'III', 'IV', 'V', 'narcotic', 'controlled', 'targeted']).notNullable();
    table.string('unit_of_measure', 50).defaultTo('tablets');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  // File uploads tracking
  await knex.schema.createTable('file_uploads', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('filename', 500).notNullable();
    table.string('original_name', 500).notNullable();
    table.enum('file_type', ['xlsx', 'csv']).notNullable();
    table.enum('upload_type', ['received', 'dispensed', 'physical_count', 'combined']).notNullable();
    table.uuid('uploaded_by').notNullable().references('id').inTable('users');
    table.boolean('processed').notNullable().defaultTo(false);
    table.integer('records_processed').defaultTo(0);
    table.integer('records_failed').defaultTo(0);
    table.text('error_message');
    table.timestamp('processed_at');
    table.timestamps(true, true);
  });

  // Inventory transactions (core ledger)
  await knex.schema.createTable('inventory_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('drug_id').notNullable().references('id').inTable('drugs');
    table.enum('transaction_type', ['RECEIVED', 'DISPENSED', 'ADJUSTMENT', 'RETURN', 'DESTRUCTION']).notNullable();
    table.decimal('quantity', 12, 4).notNullable();
    table.string('reference_number', 100);
    table.string('source', 255);
    table.string('patient_initials', 10);
    table.string('rx_number', 50);
    table.text('notes');
    table.uuid('uploaded_by').notNullable().references('id').inTable('users');
    table.uuid('file_upload_id').references('id').inTable('file_uploads');
    table.date('transaction_date').notNullable();
    table.timestamps(true, true);

    table.index(['drug_id', 'transaction_date']);
    table.index(['transaction_type']);
  });

  // Perpetual inventory (running balance per drug)
  await knex.schema.createTable('perpetual_inventory', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('drug_id').notNullable().unique().references('id').inTable('drugs');
    table.decimal('calculated_quantity', 12, 4).notNullable().defaultTo(0);
    table.decimal('physical_quantity', 12, 4);
    table.timestamp('last_physical_count_at');
    table.timestamp('last_calculated_at');
    table.timestamps(true, true);
  });

  // Reconciliation batches
  await knex.schema.createTable('reconciliations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.date('reconciliation_date').notNullable();
    table.date('period_start').notNullable();
    table.date('period_end').notNullable();
    table.enum('status', ['pending', 'in_progress', 'completed', 'reviewed', 'flagged']).notNullable().defaultTo('pending');
    table.uuid('performed_by').notNullable().references('id').inTable('users');
    table.uuid('reviewed_by').references('id').inTable('users');
    table.integer('total_items').defaultTo(0);
    table.integer('discrepancies_found').defaultTo(0);
    table.integer('discrepancies_resolved').defaultTo(0);
    table.text('notes');
    table.timestamps(true, true);

    table.index(['reconciliation_date']);
    table.index(['status']);
  });

  // Reconciliation line items
  await knex.schema.createTable('reconciliation_items', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('reconciliation_id').notNullable().references('id').inTable('reconciliations').onDelete('CASCADE');
    table.uuid('drug_id').notNullable().references('id').inTable('drugs');
    table.decimal('opening_balance', 12, 4).notNullable().defaultTo(0);
    table.decimal('total_received', 12, 4).notNullable().defaultTo(0);
    table.decimal('total_dispensed', 12, 4).notNullable().defaultTo(0);
    table.decimal('total_adjustments', 12, 4).notNullable().defaultTo(0);
    table.decimal('expected_quantity', 12, 4).notNullable();
    table.decimal('physical_quantity', 12, 4);
    table.decimal('discrepancy', 12, 4).notNullable().defaultTo(0);
    table.boolean('has_discrepancy').notNullable().defaultTo(false);
    table.boolean('resolved').notNullable().defaultTo(false);
    table.text('resolution_notes');
    table.uuid('resolved_by').references('id').inTable('users');
    table.timestamp('resolved_at');
    table.timestamps(true, true);

    table.index(['reconciliation_id']);
    table.index(['has_discrepancy']);
  });

  // Audit log (immutable)
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users');
    table.string('username', 100);
    table.string('action', 100).notNullable();
    table.string('entity_type', 100).notNullable();
    table.uuid('entity_id');
    table.jsonb('details');
    table.jsonb('previous_values');
    table.string('ip_address', 45);
    table.string('user_agent', 500);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    table.index(['user_id']);
    table.index(['entity_type', 'entity_id']);
    table.index(['action']);
    table.index(['created_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('reconciliation_items');
  await knex.schema.dropTableIfExists('reconciliations');
  await knex.schema.dropTableIfExists('perpetual_inventory');
  await knex.schema.dropTableIfExists('inventory_transactions');
  await knex.schema.dropTableIfExists('file_uploads');
  await knex.schema.dropTableIfExists('drugs');
  await knex.schema.dropTableIfExists('users');
}
