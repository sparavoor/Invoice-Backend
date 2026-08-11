const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// 1. Environment variables ആദ്യം ലോഡ് ചെയ്യുക
require('dotenv').config();

const db = require('./db');

// 2. Express App ഉണ്ടാക്കുക
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*', // Allows Vercel frontend and all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 4. Middlewares
app.use(express.json());
app.use(express.static(__dirname));

// Initialize DB and start server
db.initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});

// ==========================================
// CLIENTS ENDPOINTS
// ==========================================

// GET all clients
app.get('/api/clients', async (req, res) => {
  try {
    const clients = await db.query('SELECT * FROM clients ORDER BY name ASC');
    res.json(clients);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST new client
app.post('/api/clients', async (req, res) => {
  try {
    const { name, company_name, email, phone, address } = req.body;
    const id = crypto.randomUUID();

    await db.query(
      'INSERT INTO clients (id, name, company_name, email, phone, address) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, company_name, email, phone, address]
    );

    const clients = await db.query('SELECT * FROM clients WHERE id = ?', [id]);
    res.json(clients[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// PUT update client
app.put('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, company_name, email, phone, address } = req.body;

    const result = await db.query(
      'UPDATE clients SET name = ?, company_name = ?, email = ?, phone = ?, address = ? WHERE id = ?',
      [name, company_name, email, phone, address, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const clients = await db.query('SELECT * FROM clients WHERE id = ?', [id]);
    res.json(clients[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE client
app.delete('/api/clients/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if client has active documents
    const counts = await db.query('SELECT COUNT(*) as count FROM invoices WHERE client_id = ?', [id]);
    if (counts[0].count > 0) {
      return res.status(400).json({ error: `Cannot delete client. There are active documents associated with them.` });
    }

    await db.query('DELETE FROM clients WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// DOCUMENTS (INVOICES / QUOTATIONS) ENDPOINTS
// ==========================================

// GET all documents
app.get('/api/documents', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT 
        i.*,
        c.name as client_name,
        c.company_name as client_company_name,
        c.email as client_email,
        c.phone as client_phone,
        c.address as client_address
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      ORDER BY i.created_at DESC
    `);

    const invoices = rows.map(row => ({
      id: row.id,
      document_type: row.document_type,
      document_number: row.document_number,
      client_id: row.client_id,
      issue_date: row.issue_date,
      due_date: row.due_date,
      status: row.status,
      subtotal: Number(row.subtotal),
      tax_total: Number(row.tax_total),
      discount_total: Number(row.discount_total),
      grand_total: Number(row.grand_total),
      advance_payment: Number(row.advance_payment || 0),
      project_description: row.project_description,
      notes: row.notes,
      created_at: row.created_at,
      client: {
        id: row.client_id,
        name: row.client_name,
        company_name: row.client_company_name,
        email: row.client_email,
        phone: row.client_phone,
        address: row.client_address
      }
    }));

    res.json(invoices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET single document by ID
app.get('/api/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const invRows = await db.query(`
      SELECT 
        i.*,
        c.name as client_name,
        c.company_name as client_company_name,
        c.email as client_email,
        c.phone as client_phone,
        c.address as client_address
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `, [id]);

    if (invRows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const row = invRows[0];
    const itemRows = await db.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [id]);

    const formattedItems = itemRows.map(item => ({
      id: item.id,
      invoice_id: item.invoice_id,
      description: item.description,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      tax_rate: Number(item.tax_rate),
      discount_rate: Number(item.discount_rate),
      total: Number(item.total)
    }));

    const invoice = {
      id: row.id,
      document_type: row.document_type,
      document_number: row.document_number,
      client_id: row.client_id,
      issue_date: row.issue_date,
      due_date: row.due_date,
      status: row.status,
      subtotal: Number(row.subtotal),
      tax_total: Number(row.tax_total),
      discount_total: Number(row.discount_total),
      grand_total: Number(row.grand_total),
      advance_payment: Number(row.advance_payment || 0),
      project_description: row.project_description,
      notes: row.notes,
      created_at: row.created_at,
      items: formattedItems,
      client: {
        id: row.client_id,
        name: row.client_name,
        company_name: row.client_company_name,
        email: row.client_email,
        phone: row.client_phone,
        address: row.client_address
      }
    };

    res.json(invoice);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST new document (header + items) in a transaction
app.post('/api/documents', async (req, res) => {
  try {
    const body = req.body;
    const invoiceId = crypto.randomUUID();

    const result = await db.transaction(async (conn) => {
      // 1. Insert Invoice
      await conn.execute(`
        INSERT INTO invoices (
          id, document_type, document_number, client_id, issue_date, due_date, 
          status, subtotal, tax_total, discount_total, grand_total, 
          advance_payment, project_description, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        invoiceId,
        body.document_type,
        body.document_number,
        body.client_id,
        body.issue_date,
        body.due_date,
        body.status || 'draft',
        body.subtotal,
        body.tax_total,
        body.discount_total,
        body.grand_total,
        Number(body.advance_payment || 0),
        body.project_description,
        body.notes
      ]);

      // 2. Insert Items
      const insertedItems = [];
      if (body.items && Array.isArray(body.items)) {
        for (const item of body.items) {
          const itemId = crypto.randomUUID();
          await conn.execute(`
            INSERT INTO invoice_items (
              id, invoice_id, description, quantity, unit_price, tax_rate, discount_rate, total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            itemId,
            invoiceId,
            item.description,
            Number(item.quantity),
            Number(item.unit_price),
            Number(item.tax_rate),
            Number(item.discount_rate),
            Number(item.total)
          ]);

          insertedItems.push({
            id: itemId,
            invoice_id: invoiceId,
            description: item.description,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            tax_rate: Number(item.tax_rate),
            discount_rate: Number(item.discount_rate),
            total: Number(item.total)
          });
        }
      }

      return { invoiceId, insertedItems };
    });

    // Fetch full invoice with client info to return
    const invRows = await db.query(`
      SELECT 
        i.*,
        c.name as client_name,
        c.company_name as client_company_name,
        c.email as client_email,
        c.phone as client_phone,
        c.address as client_address
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `, [result.invoiceId]);

    const newInvoice = invRows[0];
    res.json({
      id: newInvoice.id,
      document_type: newInvoice.document_type,
      document_number: newInvoice.document_number,
      client_id: newInvoice.client_id,
      issue_date: newInvoice.issue_date,
      due_date: newInvoice.due_date,
      status: newInvoice.status,
      subtotal: Number(newInvoice.subtotal),
      tax_total: Number(newInvoice.tax_total),
      discount_total: Number(newInvoice.discount_total),
      grand_total: Number(newInvoice.grand_total),
      advance_payment: Number(newInvoice.advance_payment || 0),
      project_description: newInvoice.project_description,
      notes: newInvoice.notes,
      created_at: newInvoice.created_at,
      items: result.insertedItems,
      client: {
        id: newInvoice.client_id,
        name: newInvoice.client_name,
        company_name: newInvoice.client_company_name,
        email: newInvoice.client_email,
        phone: newInvoice.client_phone,
        address: newInvoice.client_address
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update document
app.put('/api/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    const result = await db.transaction(async (conn) => {
      // 1. Update Invoice Details
      await conn.execute(`
        UPDATE invoices SET 
          document_type = ?, document_number = ?, client_id = ?, 
          issue_date = ?, due_date = ?, status = ?, subtotal = ?, 
          tax_total = ?, discount_total = ?, grand_total = ?, 
          advance_payment = ?, project_description = ?, notes = ?
        WHERE id = ?
      `, [
        body.document_type,
        body.document_number,
        body.client_id,
        body.issue_date,
        body.due_date,
        body.status,
        body.subtotal,
        body.tax_total,
        body.discount_total,
        body.grand_total,
        Number(body.advance_payment || 0),
        body.project_description,
        body.notes,
        id
      ]);

      // 2. Delete Existing Items
      conn.execute('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);

      // 3. Insert New Items
      const insertedItems = [];
      if (body.items && Array.isArray(body.items)) {
        for (const item of body.items) {
          const itemId = crypto.randomUUID();
          await conn.execute(`
            INSERT INTO invoice_items (
              id, invoice_id, description, quantity, unit_price, tax_rate, discount_rate, total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            itemId,
            id,
            item.description,
            Number(item.quantity),
            Number(item.unit_price),
            Number(item.tax_rate),
            Number(item.discount_rate),
            Number(item.total)
          ]);

          insertedItems.push({
            id: itemId,
            invoice_id: id,
            description: item.description,
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price),
            tax_rate: Number(item.tax_rate),
            discount_rate: Number(item.discount_rate),
            total: Number(item.total)
          });
        }
      }

      return { insertedItems };
    });

    // Fetch updated invoice
    const invRows = await db.query(`
      SELECT 
        i.*,
        c.name as client_name,
        c.company_name as client_company_name,
        c.email as client_email,
        c.phone as client_phone,
        c.address as client_address
      FROM invoices i
      LEFT JOIN clients c ON i.client_id = c.id
      WHERE i.id = ?
    `, [id]);

    if (invRows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const updatedInvoice = invRows[0];
    res.json({
      id: updatedInvoice.id,
      document_type: updatedInvoice.document_type,
      document_number: updatedInvoice.document_number,
      client_id: updatedInvoice.client_id,
      issue_date: updatedInvoice.issue_date,
      due_date: updatedInvoice.due_date,
      status: updatedInvoice.status,
      subtotal: Number(updatedInvoice.subtotal),
      tax_total: Number(updatedInvoice.tax_total),
      discount_total: Number(updatedInvoice.discount_total),
      grand_total: Number(updatedInvoice.grand_total),
      advance_payment: Number(updatedInvoice.advance_payment || 0),
      project_description: updatedInvoice.project_description,
      notes: updatedInvoice.notes,
      created_at: updatedInvoice.created_at,
      items: result.insertedItems,
      client: {
        id: updatedInvoice.client_id,
        name: updatedInvoice.client_name,
        company_name: updatedInvoice.client_company_name,
        email: updatedInvoice.client_email,
        phone: updatedInvoice.client_phone,
        address: updatedInvoice.client_address
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH status of document
app.patch('/api/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (status) {
      await db.query('UPDATE invoices SET status = ? WHERE id = ?', [status, id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE document
app.delete('/api/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM invoices WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// CATALOG SUGGESTIONS ENDPOINT
// ==========================================
app.get('/api/catalog', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT description, unit_price, tax_rate, discount_rate 
      FROM invoice_items 
      WHERE description IS NOT NULL AND TRIM(description) != ''
    `);

    // Deduplicate in JS memory to ensure unique descriptions
    const unique = new Map();
    rows.forEach(item => {
      const desc = item.description?.trim();
      if (desc && !unique.has(desc)) {
        unique.set(desc, {
          description: desc,
          unit_price: Number(item.unit_price),
          tax_rate: Number(item.tax_rate),
          discount_rate: Number(item.discount_rate)
        });
      }
    });

    res.json(Array.from(unique.values()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SETTINGS ENDPOINTS
// ==========================================

// GET settings
app.get('/api/settings', async (req, res) => {
  try {
    const rows = await db.query('SELECT * FROM company_settings LIMIT 1');
    if (rows.length === 0) {
      return res.json(null);
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST save settings
app.post('/api/settings', async (req, res) => {
  try {
    const body = req.body;
    const settingsId = '00000000-0000-0000-0000-000000000001'; // Lock to single settings row

    await db.query(`
      INSERT INTO company_settings (
        id, company_name, company_email, company_phone, company_address, tax_id, bank_name, bank_account_no, bank_ifsc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        company_name = VALUES(company_name),
        company_email = VALUES(company_email),
        company_phone = VALUES(company_phone),
        company_address = VALUES(company_address),
        tax_id = VALUES(tax_id),
        bank_name = VALUES(bank_name),
        bank_account_no = VALUES(bank_account_no),
        bank_ifsc = VALUES(bank_ifsc)
    `, [
      settingsId,
      body.company_name,
      body.company_email,
      body.company_phone,
      body.company_address,
      body.tax_id,
      body.bank_name,
      body.bank_account_no,
      body.bank_ifsc
    ]);

    const [updatedSettings] = await db.query('SELECT * FROM company_settings WHERE id = ?', [settingsId]);
    res.json(updatedSettings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ASSETS ENDPOINTS
// ==========================================

// GET all assets
app.get('/api/assets', async (req, res) => {
  try {
    const assets = await db.query('SELECT * FROM assets ORDER BY name ASC');
    res.json(assets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST new asset
app.post('/api/assets', async (req, res) => {
  try {
    const { name, description, serial_number, rental_rate, status } = req.body;
    const id = crypto.randomUUID();

    await db.query(`
      INSERT INTO assets (id, name, description, serial_number, rental_rate, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, name, description, serial_number, Number(rental_rate || 0), status || 'available']);

    const [newAsset] = await db.query('SELECT * FROM assets WHERE id = ?', [id]);
    res.json(newAsset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update asset
app.put('/api/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, serial_number, rental_rate, status } = req.body;

    const result = await db.query(`
      UPDATE assets SET name = ?, description = ?, serial_number = ?, rental_rate = ?, status = ? WHERE id = ?
    `, [name, description, serial_number, Number(rental_rate || 0), status, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const [updatedAsset] = await db.query('SELECT * FROM assets WHERE id = ?', [id]);
    res.json(updatedAsset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE asset
app.delete('/api/assets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM assets WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// RENTALS ENDPOINTS
// ==========================================

// GET all rental records
app.get('/api/rentals', async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT 
        r.*,
        a.name as asset_name,
        a.description as asset_description,
        a.serial_number as asset_serial_number,
        a.rental_rate as asset_rental_rate,
        a.status as asset_status,
        c.name as client_name,
        c.company_name as client_company_name,
        c.email as client_email,
        c.phone as client_phone,
        c.address as client_address,
        i.document_number as invoice_number,
        i.status as invoice_status
      FROM rental_records r
      LEFT JOIN assets a ON r.asset_id = a.id
      LEFT JOIN clients c ON r.client_id = c.id
      LEFT JOIN invoices i ON r.invoice_id = i.id
      ORDER BY r.created_at DESC
    `);

    const rentals = rows.map(row => ({
      id: row.id,
      asset_id: row.asset_id,
      client_id: row.client_id,
      checkout_date: row.checkout_date,
      expected_return_date: row.expected_return_date,
      actual_return_date: row.actual_return_date,
      rental_rate_at_checkout: Number(row.rental_rate_at_checkout),
      status: row.status,
      notes: row.notes,
      invoice_id: row.invoice_id,
      created_at: row.created_at,
      asset: {
        id: row.asset_id,
        name: row.asset_name,
        description: row.asset_description,
        serial_number: row.asset_serial_number,
        rental_rate: Number(row.asset_rental_rate),
        status: row.asset_status
      },
      client: {
        id: row.client_id,
        name: row.client_name,
        company_name: row.client_company_name,
        email: row.client_email,
        phone: row.client_phone,
        address: row.client_address
      },
      invoice: row.invoice_id ? {
        id: row.invoice_id,
        document_number: row.invoice_number,
        status: row.invoice_status
      } : null
    }));

    res.json(rentals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST new rental record
app.post('/api/rentals', async (req, res) => {
  try {
    const body = req.body;
    const rentalId = crypto.randomUUID();

    const result = await db.transaction(async (conn) => {
      // 1. Insert Rental Record
      await conn.execute(`
        INSERT INTO rental_records (
          id, asset_id, client_id, checkout_date, expected_return_date, 
          actual_return_date, rental_rate_at_checkout, status, notes, invoice_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        rentalId,
        body.asset_id,
        body.client_id,
        body.checkout_date,
        body.expected_return_date || null,
        body.actual_return_date || null,
        Number(body.rental_rate_at_checkout),
        body.status || 'rented',
        body.notes || null,
        body.invoice_id || null
      ]);

      // 2. Set Asset status to rented
      await conn.execute('UPDATE assets SET status = "rented" WHERE id = ?', [body.asset_id]);

      return { rentalId };
    });

    const [newRental] = await db.query('SELECT * FROM rental_records WHERE id = ?', [result.rentalId]);
    res.json(newRental);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT update rental record
app.put('/api/rentals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    const prevRecords = await db.query('SELECT * FROM rental_records WHERE id = ?', [id]);
    if (prevRecords.length === 0) {
      return res.status(404).json({ error: 'Rental record not found' });
    }
    const prevRecord = prevRecords[0];

    await db.transaction(async (conn) => {
      // 1. Update Rental Record
      await conn.execute(`
        UPDATE rental_records SET 
          asset_id = ?, client_id = ?, checkout_date = ?, expected_return_date = ?, 
          actual_return_date = ?, rental_rate_at_checkout = ?, status = ?, notes = ?, invoice_id = ?
        WHERE id = ?
      `, [
        body.asset_id,
        body.client_id,
        body.checkout_date,
        body.expected_return_date || null,
        body.actual_return_date || null,
        Number(body.rental_rate_at_checkout),
        body.status,
        body.notes || null,
        body.invoice_id || null,
        id
      ]);

      // 2. If checking in, mark asset available
      if (body.actual_return_date && prevRecord.status !== 'returned') {
        await conn.execute('UPDATE assets SET status = "available" WHERE id = ?', [prevRecord.asset_id]);
      }
    });

    const [updatedRental] = await db.query('SELECT * FROM rental_records WHERE id = ?', [id]);
    res.json(updatedRental);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE rental record
app.delete('/api/rentals/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const records = await db.query('SELECT * FROM rental_records WHERE id = ?', [id]);
    if (records.length === 0) {
      return res.status(404).json({ error: 'Rental record not found' });
    }
    const record = records[0];

    await db.transaction(async (conn) => {
      await conn.execute('DELETE FROM rental_records WHERE id = ?', [id]);

      // If deleted record was in 'rented' state, make asset available again
      if (record.status === 'rented') {
        await conn.execute('UPDATE assets SET status = "available" WHERE id = ?', [record.asset_id]);
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
