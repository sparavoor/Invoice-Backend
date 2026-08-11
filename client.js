// client.js - HTML/JS Frontend Form Handler
const API_URL = typeof window !== 'undefined' && (window.location.origin === 'null' || window.location.protocol === 'file:')
  ? 'http://localhost:5000/api'
  : '/api';

// ==========================================
// CLIENTS TAB
// ==========================================

// Add a new client via REST API using fetch()
async function saveClient() {
  const nameInput = document.getElementById('name');
  const companyInput = document.getElementById('company');
  const emailInput = document.getElementById('email');
  const phoneInput = document.getElementById('phone');
  const addressInput = document.getElementById('address');

  if (!nameInput.value.trim()) {
    alert('Please enter the client name.');
    return;
  }

  const clientData = {
    name: nameInput.value.trim(),
    company_name: companyInput.value.trim(),
    email: emailInput.value.trim(),
    phone: phoneInput.value.trim(),
    address: addressInput.value.trim()
  };

  try {
    const response = await fetch(`${API_URL}/clients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientData)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to add client');
    
    alert(result.name ? `Client "${result.name}" added successfully!` : 'Client added successfully!');
    
    // Clear form inputs
    nameInput.value = '';
    companyInput.value = '';
    emailInput.value = '';
    phoneInput.value = '';
    addressInput.value = '';

    // Reload list and drop-downs
    await loadClients();
  } catch (error) {
    console.error('Error in saveClient:', error);
    alert('Error: ' + error.message);
  }
}

// Load and display all clients
async function loadClients() {
  try {
    const response = await fetch(`${API_URL}/clients`);
    const clients = await response.json();
    if (!response.ok) throw new Error(clients.error || 'Failed to fetch clients');

    const tableBody = document.getElementById('clientsTableBody');
    const clientSelect = document.getElementById('invoiceClientSelect');
    
    if (tableBody) {
      tableBody.innerHTML = '';
      if (clients.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="no-data">No clients found. Add a client above!</td></tr>';
      } else {
        clients.forEach(client => {
          tableBody.innerHTML += `
            <tr>
              <td><strong>${escapeHtml(client.name)}</strong></td>
              <td>${escapeHtml(client.company_name || '-')}</td>
              <td>${escapeHtml(client.email || '-')}</td>
              <td>${escapeHtml(client.phone || '-')}</td>
              <td>${escapeHtml(client.address || '-')}</td>
              <td>
                <button class="btn btn-delete btn-sm" onclick="deleteClient('${client.id}')">Delete</button>
              </td>
            </tr>
          `;
        });
      }
    }

    if (clientSelect) {
      clientSelect.innerHTML = '<option value="">-- Select Client --</option>';
      clients.forEach(client => {
        clientSelect.innerHTML += `
          <option value="${client.id}">${escapeHtml(client.name)} (${escapeHtml(client.company_name || 'Individual')})</option>
        `;
      });
    }
  } catch (error) {
    console.error('Error loading clients:', error);
  }
}

// Delete client
async function deleteClient(id) {
  if (!confirm('Are you sure you want to delete this client?')) return;

  try {
    const response = await fetch(`${API_URL}/clients/${id}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to delete client');

    alert('Client deleted successfully!');
    await loadClients();
    await loadInvoices();
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// ==========================================
// INVOICES TAB
// ==========================================

// Add item row to the invoice creation form
function addInvoiceItemRow() {
  const container = document.getElementById('invoiceItemsContainer');
  const rowId = 'row-' + Date.now();
  const rowHtml = `
    <div class="item-row" id="${rowId}">
      <input type="text" placeholder="Item Description" class="form-control item-desc" required>
      <input type="number" placeholder="Qty" class="form-control item-qty" value="1" min="1" step="any" oninput="calculateRowTotal('${rowId}')" required>
      <input type="number" placeholder="Price" class="form-control item-price" value="0.00" min="0" step="any" oninput="calculateRowTotal('${rowId}')" required>
      <input type="number" placeholder="Tax %" class="form-control item-tax" value="18" min="0" step="any" oninput="calculateRowTotal('${rowId}')" required>
      <input type="number" placeholder="Disc %" class="form-control item-disc" value="0" min="0" step="any" oninput="calculateRowTotal('${rowId}')" required>
      <div class="row-total" id="${rowId}-total">0.00</div>
      <button class="btn btn-delete btn-sm" onclick="removeInvoiceItemRow('${rowId}')">Remove</button>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', rowHtml);
  calculateGrandTotal();
}

function removeInvoiceItemRow(rowId) {
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    calculateGrandTotal();
  }
}

function calculateRowTotal(rowId) {
  const row = document.getElementById(rowId);
  if (!row) return;

  const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
  const price = parseFloat(row.querySelector('.item-price').value) || 0;
  const taxRate = parseFloat(row.querySelector('.item-tax').value) || 0;
  const discRate = parseFloat(row.querySelector('.item-disc').value) || 0;

  const sub = qty * price;
  const discount = sub * (discRate / 100);
  const taxedAmount = (sub - discount) * (taxRate / 100);
  const total = sub - discount + taxedAmount;

  document.getElementById(`${rowId}-total`).innerText = total.toFixed(2);
  calculateGrandTotal();
}

function calculateGrandTotal() {
  const rows = document.querySelectorAll('.item-row');
  let subtotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;
  let grandTotal = 0;

  rows.forEach(row => {
    const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    const taxRate = parseFloat(row.querySelector('.item-tax').value) || 0;
    const discRate = parseFloat(row.querySelector('.item-disc').value) || 0;

    const sub = qty * price;
    const disc = sub * (discRate / 100);
    const tax = (sub - disc) * (taxRate / 100);

    subtotal += sub;
    discountTotal += disc;
    taxTotal += tax;
    grandTotal += (sub - disc + tax);
  });

  const advance = parseFloat(document.getElementById('invoiceAdvance').value) || 0;

  document.getElementById('summarySubtotal').innerText = subtotal.toFixed(2);
  document.getElementById('summaryDiscount').innerText = discountTotal.toFixed(2);
  document.getElementById('summaryTax').innerText = taxTotal.toFixed(2);
  document.getElementById('summaryGrand').innerText = grandTotal.toFixed(2);
  document.getElementById('summaryBalance').innerText = (grandTotal - advance).toFixed(2);
}

// Save invoice to database via REST API
async function saveInvoice() {
  const clientSelect = document.getElementById('invoiceClientSelect');
  const typeSelect = document.getElementById('invoiceType');
  const numberInput = document.getElementById('invoiceNumber');
  const issueDateInput = document.getElementById('invoiceIssueDate');
  const dueDateInput = document.getElementById('invoiceDueDate');
  const statusSelect = document.getElementById('invoiceStatus');
  const advanceInput = document.getElementById('invoiceAdvance');
  const notesInput = document.getElementById('invoiceNotes');
  const descInput = document.getElementById('invoiceDescription');

  if (!clientSelect.value) {
    alert('Please select a client.');
    return;
  }
  if (!numberInput.value.trim()) {
    alert('Please enter a document number.');
    return;
  }

  const items = [];
  const rows = document.querySelectorAll('.item-row');
  if (rows.length === 0) {
    alert('Please add at least one line item.');
    return;
  }

  rows.forEach(row => {
    const desc = row.querySelector('.item-desc').value.trim();
    const qty = parseFloat(row.querySelector('.item-qty').value) || 0;
    const price = parseFloat(row.querySelector('.item-price').value) || 0;
    const taxRate = parseFloat(row.querySelector('.item-tax').value) || 0;
    const discRate = parseFloat(row.querySelector('.item-disc').value) || 0;
    const total = parseFloat(row.querySelector('.row-total').innerText) || 0;

    items.push({
      description: desc,
      quantity: qty,
      unit_price: price,
      tax_rate: taxRate,
      discount_rate: discRate,
      total: total
    });
  });

  const invoiceData = {
    client_id: clientSelect.value,
    document_type: typeSelect.value,
    document_number: numberInput.value.trim(),
    issue_date: issueDateInput.value,
    due_date: dueDateInput.value,
    status: statusSelect.value,
    subtotal: parseFloat(document.getElementById('summarySubtotal').innerText),
    tax_total: parseFloat(document.getElementById('summaryTax').innerText),
    discount_total: parseFloat(document.getElementById('summaryDiscount').innerText),
    grand_total: parseFloat(document.getElementById('summaryGrand').innerText),
    advance_payment: parseFloat(advanceInput.value) || 0,
    project_description: descInput.value.trim(),
    notes: notesInput.value.trim(),
    items: items
  };

  try {
    const response = await fetch(`${API_URL}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to save document');

    alert(`Document ${result.document_number} saved successfully!`);
    
    // Reset Invoice form
    clientSelect.value = '';
    numberInput.value = 'INV-' + Math.floor(10000 + Math.random() * 90000);
    notesInput.value = '';
    descInput.value = '';
    advanceInput.value = '0.00';
    document.getElementById('invoiceItemsContainer').innerHTML = '';
    addInvoiceItemRow(); // start with one blank row

    await loadInvoices();
  } catch (error) {
    console.error('Error in saveInvoice:', error);
    alert('Error: ' + error.message);
  }
}

// Load all documents
async function loadInvoices() {
  try {
    const response = await fetch(`${API_URL}/documents`);
    const invoices = await response.json();
    if (!response.ok) throw new Error(invoices.error || 'Failed to load invoices');

    const tableBody = document.getElementById('invoicesTableBody');
    if (tableBody) {
      tableBody.innerHTML = '';
      if (invoices.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="no-data">No documents found. Create one above!</td></tr>';
      } else {
        invoices.forEach(inv => {
          const typeBadge = inv.document_type === 'invoice' ? 'badge-primary' : 'badge-accent';
          const statusBadge = getStatusBadgeClass(inv.status);
          tableBody.innerHTML += `
            <tr>
              <td><strong>${escapeHtml(inv.document_number)}</strong></td>
              <td><span class="badge ${typeBadge}">${inv.document_type.toUpperCase()}</span></td>
              <td>${escapeHtml(inv.client?.name || 'Unknown')}</td>
              <td>${new Date(inv.issue_date).toLocaleDateString()}</td>
              <td>$${Number(inv.grand_total).toFixed(2)}</td>
              <td>$${Number(inv.advance_payment).toFixed(2)}</td>
              <td><span class="badge ${statusBadge}">${inv.status.toUpperCase()}</span></td>
              <td>
                <button class="btn btn-delete btn-sm" onclick="deleteInvoice('${inv.id}')">Delete</button>
              </td>
            </tr>
          `;
        });
      }
    }
  } catch (error) {
    console.error('Error loading invoices:', error);
  }
}

async function deleteInvoice(id) {
  if (!confirm('Are you sure you want to delete this document?')) return;

  try {
    const response = await fetch(`${API_URL}/documents/${id}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to delete invoice');

    alert('Document deleted successfully!');
    await loadInvoices();
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'paid': return 'badge-status-paid';
    case 'sent': return 'badge-status-sent';
    case 'draft': return 'badge-status-draft';
    case 'unpaid': return 'badge-status-unpaid';
    case 'accepted': return 'badge-status-accepted';
    default: return 'badge-status-draft';
  }
}

function toggleTab(tabId) {
  // Hide all sections
  document.querySelectorAll('.tab-content').forEach(section => {
    section.classList.remove('active');
  });
  
  // Deactivate all tab links
  document.querySelectorAll('.tab-link').forEach(tab => {
    tab.classList.remove('active');
  });

  // Activate selected
  document.getElementById(tabId + 'Section').classList.add('active');
  document.querySelector(`[onclick="toggleTab('${tabId}')"]`).classList.add('active');
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  // Set default dates
  document.getElementById('invoiceIssueDate').value = new Date().toISOString().split('T')[0];
  const due = new Date();
  due.setDate(due.getDate() + 30);
  document.getElementById('invoiceDueDate').value = due.toISOString().split('T')[0];

  // Set default invoice number
  document.getElementById('invoiceNumber').value = 'INV-' + Math.floor(10000 + Math.random() * 90000);

  // Add one blank line item row to start
  addInvoiceItemRow();

  // Load clients and invoices list
  loadClients();
  loadInvoices();
});
