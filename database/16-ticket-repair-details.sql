-- Ticket Phase 2: "Repairing should be done by" details.
-- In-house / Store  -> department + employee(s) (stored in ticket_assignments as before)
-- Local Repairer / OEM-Vendor / Customer Site -> company name, 10-digit contact, optional payment amount
-- Apply once on an existing database after 15-ticket-phase-module.sql, then run: npx prisma generate
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS repair_details JSONB;
