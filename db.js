const mysql = require('mysql2/promise');
require('dotenv').config();

let pool = null;
let connectionError = null;

async function initDb() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3307', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '9695';
  const database = process.env.DB_NAME || 'graphassets';

  const connectionConfig = { host, port, user, password };

  try {
    // 1. Try to create connection without database to ensure it exists
    const tempConnection = await mysql.createConnection(connectionConfig);
    await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    await tempConnection.end();

    // 2. Establish connection pool with database selected
    pool = mysql.createPool({
      ...connectionConfig,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    console.log(`\x1b[32m[MySQL Success] Connected to database: ${database} on port ${port}\x1b[0m`);

    // 3. Run auto-migrations / table creation
    await runMigrations();
    connectionError = null;
  } catch (error) {
    connectionError = error.message;
    console.error(`\n\x1b[31m======================================================================
[MySQL Connection Failure]
Could not connect to MySQL database.
Details: ${error.message}

Please check that:
1. XAMPP MySQL is active and running.
2. The port (currently ${port}) matches your MySQL port.
3. The username (currently ${user}) and password are correct.

You can modify these configurations in your .env file:
c:\\Users\\User\\Desktop\\Graph.CLT\\Web\\Invoice\\.env
======================================================================\x1b[0m\n`);
  }
}

async function runMigrations() {
  try {
    // 1. Create clients table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        company_name VARCHAR(255),
        email VARCHAR(255),
        phone VARCHAR(50),
        address TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_clients_name (name),
        INDEX idx_clients_company (company_name)
      ) ENGINE=InnoDB;
    `);

    // 2. Create invoices table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id CHAR(36) PRIMARY KEY,
        document_type ENUM('invoice', 'quotation') NOT NULL,
        document_number VARCHAR(100) NOT NULL UNIQUE,
        client_id CHAR(36) NOT NULL,
        issue_date DATE NOT NULL,
        due_date DATE NOT NULL,
        status ENUM('draft', 'sent', 'paid', 'unpaid', 'expired', 'accepted', 'rejected') NOT NULL DEFAULT 'draft',
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        tax_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        discount_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        grand_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        advance_payment DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        project_description TEXT,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
        INDEX idx_invoices_client (client_id),
        INDEX idx_invoices_type_status (document_type, status),
        INDEX idx_invoices_issue_date (issue_date)
      ) ENGINE=InnoDB;
    `);

    // 3. Create invoice_items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id CHAR(36) PRIMARY KEY,
        invoice_id CHAR(36) NOT NULL,
        description TEXT NOT NULL,
        quantity DECIMAL(10,2) NOT NULL DEFAULT 1.00,
        unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        discount_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
        total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
        INDEX idx_invoice_items_invoice (invoice_id)
      ) ENGINE=InnoDB;
    `);

    // 4. Create company_settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_settings (
        id CHAR(36) PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL DEFAULT 'My Company',
        company_email VARCHAR(255),
        company_phone VARCHAR(50),
        company_address TEXT,
        tax_id VARCHAR(100),
        logo_url TEXT,
        bank_name VARCHAR(255),
        bank_account_no VARCHAR(100),
        bank_ifsc VARCHAR(50),
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // Seed default company settings row if empty
    const [settingsRows] = await pool.query('SELECT COUNT(*) as count FROM company_settings');
    if (settingsRows[0].count === 0) {
      await pool.query(`
        INSERT INTO company_settings (id, company_name, company_email, company_phone, company_address, tax_id, bank_name, bank_account_no, bank_ifsc)
        VALUES (
          '00000000-0000-0000-0000-000000000001',
          'Acme Innovations',
          'billing@acme.com',
          '+1 (555) 019-2834',
          '123 Business Rd, Suite 100, Tech City, TC 10101',
          'GSTIN1234567890',
          'Standard Chartered Bank',
          '987654321098',
          'SCBL0000123'
        )
      `);
      console.log('Seeded default company settings.');
    }

    // 5. Create assets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id CHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        serial_number VARCHAR(100),
        rental_rate DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        status ENUM('available', 'rented', 'maintenance') NOT NULL DEFAULT 'available',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_assets_name (name)
      ) ENGINE=InnoDB;
    `);

    // 6. Create rental_records table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS rental_records (
        id CHAR(36) PRIMARY KEY,
        asset_id CHAR(36) NOT NULL,
        client_id CHAR(36) NOT NULL,
        checkout_date DATE NOT NULL,
        expected_return_date DATE,
        actual_return_date DATE,
        rental_rate_at_checkout DECIMAL(12,2) NOT NULL,
        status ENUM('rented', 'returned', 'overdue') NOT NULL DEFAULT 'rented',
        notes TEXT,
        invoice_id CHAR(36),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL,
        INDEX idx_rentals_asset (asset_id),
        INDEX idx_rentals_client (client_id),
        INDEX idx_rentals_status (status),
        INDEX idx_rentals_invoice (invoice_id)
      ) ENGINE=InnoDB;
    `);

    console.log('Database tables verified/created successfully.');
  } catch (error) {
    console.error('Error running migrations:', error);
  }
}

// Helper to run query with params
async function query(sql, params) {
  if (!pool) {
    throw new Error(`Database connection not established. Error: ${connectionError || 'Unknown connection error'}`);
  }
  const [results] = await pool.execute(sql, params);
  return results;
}

// Transaction runner helper
async function transaction(callback) {
  if (!pool) {
    throw new Error(`Database connection not established. Error: ${connectionError || 'Unknown connection error'}`);
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  initDb,
  query,
  transaction,
  getPool: () => pool
};
