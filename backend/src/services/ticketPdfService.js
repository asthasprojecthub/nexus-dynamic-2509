// Ticket PDF - uses the same canvas/look as the Inquiry PDF (logo header, blue section bars,
// bordered key/value tables, "Generated ... / Page x of y" footer).
// NOTE: workflow status is intentionally NOT part of the ticket PDF.
import {
  PdfCanvas,
  pdfSafeText as safeText,
  pdfFormatDate as formatDate,
  pdfRenderSections,
  pdfSafeFilePart,
  pdfWrapText,
  PDF_LEFT,
  PDF_CONTENT_WIDTH,
  PDF_CONTENT_BOTTOM,
} from './inquiryPdfService.js';

const LABEL_WIDTH = 88;
const LINE_HEIGHT = 8;

class TicketPdfCanvas extends PdfCanvas {
  // Full-width "label | long text" rows (problem description, comments...). Splits across pages if needed.
  wideRows(rows = []) {
    for (const row of rows) {
      if (!row) continue;
      const valueWidth = PDF_CONTENT_WIDTH - LABEL_WIDTH;
      const labelLines = pdfWrapText(row.label, LABEL_WIDTH - 8, 6.2, true);
      const valueLines = pdfWrapText(row.value, valueWidth - 8, 6.5, false);
      let index = 0;
      let first = true;
      while (index < valueLines.length) {
        const room = PDF_CONTENT_BOTTOM - this.y;
        let fit = Math.floor((room - 6) / LINE_HEIGHT);
        if (fit < Math.min(2, valueLines.length - index)) {
          this.addPage();
          continue;
        }
        fit = Math.min(fit, valueLines.length - index);
        const chunk = valueLines.slice(index, index + fit);
        const height = Math.max(17, Math.max(chunk.length, first ? labelLines.length : 1) * LINE_HEIGHT + 6);
        this.rect(PDF_LEFT, this.y, LABEL_WIDTH, height, { fill: '#f9fafb', stroke: '#e5e7eb', lineWidth: 0.35 });
        this.rect(PDF_LEFT + LABEL_WIDTH, this.y, valueWidth, height, { fill: '#ffffff', stroke: '#e5e7eb', lineWidth: 0.35 });
        if (first) labelLines.forEach((text, i) => this.text(text, PDF_LEFT + 4, this.y + 3 + i * LINE_HEIGHT, { size: 6.2, bold: true, color: '#4b5563' }));
        chunk.forEach((text, i) => this.text(text, PDF_LEFT + LABEL_WIDTH + 4, this.y + 3 + i * LINE_HEIGHT, { size: 6.5, color: '#111827' }));
        this.y += height;
        index += chunk.length;
        first = false;
      }
    }
  }
}

const money = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return `Rs. ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
};

const humanSize = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};

const isInHouse = (value) => /in[\s-]?house|store/i.test(String(value || ''));
const externalNameLabel = (location) => {
  const text = String(location || '');
  if (/vendor|oem/i.test(text)) return 'Vendor / OEM Name';
  if (/local/i.test(text)) return 'Local Repairer Name';
  if (/customer|site/i.test(text)) return 'Customer Site / Company';
  return 'Company Name';
};

const phaseOf = (title = '') => (/^phase\s*2\b/i.test(title) ? 2 : /^phase\s*1\b/i.test(title) ? 1 : 0);
const isCoreOptions = (title = '') => String(title).toLowerCase().includes('core dropdown');
const clip = (value, max) => {
  const text = safeText(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
};

// Date-type form fields are stored as ISO strings; print them like the rest of the PDF (19 Sept 2026).
function withFormattedDates(sections = [], values = {}) {
  const result = { ...values };
  const fields = sections.flatMap((section) => [
    ...(section.fields || []),
    ...(section.subsections || []).flatMap((sub) => sub.fields || []),
  ]);
  for (const field of fields) {
    if (field.field_type === 'date' && result[field.id]) result[field.id] = formatDate(result[field.id]);
  }
  return result;
}

function newCanvas(title, refLine) {
  return new TicketPdfCanvas({}, { title, refLine });
}

function customerRows(ticket) {
  return [
    { label: 'Customer Number', value: ticket.customer_no || '-' },
    { label: 'Created By', value: ticket.created_by || '-' },
    { label: 'Customer Name', value: ticket.customer || '-' },
    { label: 'Company Type', value: ticket.customer_type || '-' },
    { label: 'City', value: ticket.customer_city || '-' },
    { label: 'Created Department', value: ticket.created_department || '-' },
  ];
}

export function buildTicketPdf(ticket = {}, options = {}) {
  const sections = (options.sections || []).filter((section) => section.is_active !== false && !isCoreOptions(section.title));
  const phase1Values = ticket.phase1_data || ticket.ticket_data || {};
  const phase2Values = ticket.phase2_data || {};
  const phase1Sections = sections.filter((section) => phaseOf(section.title) !== 2);
  const phase2Sections = sections.filter((section) => phaseOf(section.title) === 2);
  const phase1Merged = withFormattedDates(sections, { ...phase2Values, ...phase1Values });

  const canvas = newCanvas(
    'TICKET DETAILS',
    `Ticket: ${safeText(ticket.ticket_no)} | Customer: ${clip(ticket.customer, 34)} | Date: ${formatDate(ticket.created_at)}`,
  );

  canvas.section('Customer / Company Details');
  canvas.keyValueTable(customerRows(ticket));

  canvas.section('Ticket Summary');
  canvas.keyValueTable([
    { label: 'Ticket Number', value: ticket.ticket_no || '-' },
    { label: 'Ticket Date', value: formatDate(ticket.created_at) },
    { label: 'Subject', value: ticket.subject || '-' },
    { label: 'Priority', value: ticket.priority || '-' },
    { label: 'Ticket Type', value: ticket.ticket_type || '-' },
    { label: 'Problem Type', value: ticket.problem_type || '-' },
    { label: 'Make / Manufacturer', value: ticket.manufacturer || '-' },
    { label: 'Model Number', value: ticket.model_number || '-' },
    { label: 'Received Through', value: ticket.received_via || '-' },
    { label: 'Warranty', value: ticket.warranty_status || '-' },
    { label: 'Support Location', value: ticket.support_mode || '-' },
    { label: 'Support Type', value: ticket.support_type || '-' },
    { label: 'Inquiry Number', value: ticket.inquiry_no || '-' },
    { label: 'Project Number', value: ticket.project_no || '-' },
    { label: 'Current Phase', value: Number(ticket.current_phase) === 2 ? 'Phase 2 - Technical' : 'Phase 1 - Intake' },
  ]);

  canvas.section('Problem Details');
  canvas.wideRows([
    { label: 'Problem Description', value: ticket.complaint || '-' },
    { label: 'Customer Comment', value: ticket.customer_comment || '-' },
  ]);

  if (phase1Sections.length) pdfRenderSections(canvas, phase1Sections, phase1Merged, { major: true });

  // ---- Phase 2 : repairing done by ------------------------------------------------------
  const location = ticket.repair_location || '';
  const details = ticket.repair_details || {};
  const activeAssignments = (ticket.assignments || []).filter((item) => item.is_active !== false);
  const team = activeAssignments.filter((item) => item.user);

  canvas.section('Phase 2 - Repair & Assignment');
  const repairRows = [
    { label: 'Repairing Done By', value: location || '-' },
    { label: 'Phase 2 Submitted', value: formatDate(ticket.phase2_submitted_at, true) },
  ];
  if (!location || isInHouse(location)) {
    repairRows.push(
      { label: 'Department', value: ticket.assigned_department || '-' },
      { label: 'Employee(s)', value: ticket.assigned_to || '-' },
    );
  } else {
    repairRows.push(
      { label: externalNameLabel(location), value: details.company_name || '-' },
      { label: 'Contact Number', value: details.contact_number || '-' },
      { label: 'Payment Amount', value: money(details.payment_amount) },
    );
  }
  if (ticket.rma_no) repairRows.push({ label: 'RMA Number', value: ticket.rma_no });
  canvas.keyValueTable(repairRows);

  if (isInHouse(location) && team.length) {
    canvas.subsection('Assigned Team');
    canvas.table([
      { key: 'no', label: 'No.', width: 28 },
      { key: 'user', label: 'Employee', width: 150 },
      { key: 'department', label: 'Department', width: 130 },
      { key: 'assigned_by', label: 'Assigned By', width: 120 },
      { key: 'assigned_at', label: 'Assigned On', width: 100 },
    ], team.map((item, index) => ({ no: index + 1, ...item, assigned_at: formatDate(item.assigned_at, true) })), {
      fontSize: 5.8, headerFontSize: 5.5, lineHeight: 7.1, padding: 2.4, minRowHeight: 15, maxLines: 3,
    });
  }

  if (phase2Sections.length) pdfRenderSections(canvas, phase2Sections, withFormattedDates(sections, phase2Values), { major: false });

  // ---- Documents / photos ---------------------------------------------------------------
  const documents = ticket.documents || [];
  if (documents.length) {
    canvas.section('Photos & Documents');
    canvas.table([
      { key: 'kind', label: 'Type', width: 90 },
      { key: 'file_name', label: 'File Name', width: 250 },
      { key: 'size', label: 'Size', width: 60 },
      { key: 'uploaded_at', label: 'Uploaded', width: 110 },
    ], documents.map((doc) => ({
      kind: doc.document_role === 'PHOTO' ? 'Photo' : (doc.document_type || 'Attachment'),
      file_name: doc.file_name,
      size: humanSize(doc.file_size),
      uploaded_at: formatDate(doc.uploaded_at, true),
    })), { fontSize: 5.6, headerFontSize: 5.3, lineHeight: 6.9, padding: 2.4, minRowHeight: 15, maxLines: 3 });
  }

  // Status / status history / SLA are intentionally excluded from the Ticket PDF.

  canvas.section('Record Information');
  canvas.keyValueTable([
    { label: 'Created At', value: formatDate(ticket.created_at, true) },
    { label: 'Updated At', value: formatDate(ticket.updated_at, true) },
    { label: 'Ticket Number', value: ticket.ticket_no || '-' },
    { label: 'Customer Number', value: ticket.customer_no || '-' },
  ]);

  return canvas.toBuffer();
}

export function buildTicketRmaPdf(ticket = {}) {
  const canvas = newCanvas(
    'RMA DOCUMENT',
    `RMA: ${safeText(ticket.rma_no)} | Ticket: ${safeText(ticket.ticket_no)} | Date: ${formatDate(ticket.rma_generated_at || ticket.updated_at)}`,
  );

  canvas.section('Customer / Company Details');
  canvas.keyValueTable(customerRows(ticket));

  canvas.section('RMA Summary');
  canvas.keyValueTable([
    { label: 'RMA Number', value: ticket.rma_no || '-' },
    { label: 'RMA Date', value: formatDate(ticket.rma_generated_at) },
    { label: 'Ticket Number', value: ticket.ticket_no || '-' },
    { label: 'Subject', value: ticket.subject || '-' },
    { label: 'Ticket Type', value: ticket.ticket_type || '-' },
    { label: 'Problem Type', value: ticket.problem_type || '-' },
    { label: 'Make / Manufacturer', value: ticket.manufacturer || '-' },
    { label: 'Model Number', value: ticket.model_number || '-' },
    { label: 'Warranty', value: ticket.warranty_status || '-' },
    { label: 'Repairing Done By', value: ticket.repair_location || '-' },
  ]);

  canvas.section('Problem Details');
  canvas.wideRows([{ label: 'Problem Description', value: ticket.complaint || '-' }]);

  if (ticket.rma_data && Object.keys(ticket.rma_data).length) {
    canvas.section('RMA Details');
    canvas.renderObject(ticket.rma_data);
  }

  canvas.section('Record Information');
  canvas.keyValueTable([
    { label: 'Created By', value: ticket.created_by || '-' },
    { label: 'Ticket Created', value: formatDate(ticket.created_at, true) },
  ]);
  return canvas.toBuffer();
}

export function buildTicketPdfFileName(ticket = {}) {
  return `Ticket-${pdfSafeFilePart(ticket.ticket_no || 'Ticket')}.pdf`;
}
