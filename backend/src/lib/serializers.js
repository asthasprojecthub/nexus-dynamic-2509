const dateOnly = (v) => v ? new Date(v).toISOString().slice(0, 10) : '';
const dateTime = (v) => v ? new Date(v).toISOString().replace('T', ' ').slice(0, 19) : '';

const decodeStatusDetails = (value) => {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed && parsed.nexusStatusDetails === 1) return parsed;
  } catch {}
  return {};
};

const latestInquiryRevision = (inquiry) => {
  for (const row of inquiry.statusHistory || []) {
    const details = decodeStatusDetails(row.note);
    if (details.revisionNumber !== null && details.revisionNumber !== undefined) {
      const revisionNumber = Number(details.revisionNumber);
      if (Number.isFinite(revisionNumber)) return { revisionNumber, versionLabel:details.versionLabel || `Revision ${revisionNumber}` };
    }
  }
  const uiRevision = inquiry.uiData?.current_revision_number ?? inquiry.uiData?.revision_number;
  if (uiRevision !== null && uiRevision !== undefined && uiRevision !== '') {
    const revisionNumber = Number(uiRevision);
    if (Number.isFinite(revisionNumber)) return { revisionNumber, versionLabel:inquiry.uiData?.current_revision_label || inquiry.uiData?.revision_label || `Revision ${revisionNumber}` };
  }
  return { revisionNumber:null, versionLabel:'' };
};

const latestInquiryStatusDetails = (inquiry) => {
  const row=(inquiry.statusHistory || []).find((item)=>item.toStatus===inquiry.status) || (inquiry.statusHistory || [])[0];
  if (!row) return { reason:'', remark:'', summary:'', changedAt:'' };
  const details=decodeStatusDetails(row.note);
  return {
    reason:details.reason || '',
    remark:details.additionalRemark || details.remarks || details.customerComment || '',
    summary:details.summary || '',
    changedAt:dateTime(row.changedAt),
  };
};

export function serializeField(field) {
  return {
    id: field.id,
    field_key: field.fieldKey,
    label: field.fieldLabel,
    placeholder: field.configJson?.placeholder || '',
    field_type: field.fieldType,
    required: field.isActive === false ? false : field.isRequired,
    is_active: field.isActive,
    order: field.displayOrder,
    options: (field.options || [])
      .filter((o) => o.isActive !== false)
      .sort((a,b) => a.displayOrder-b.displayOrder)
      .map((o) => o.optionLabel),
    table_config: field.configJson?.table_config || null,
    document_type_id: field.configJson?.document_type_id || '',
  };
}

export function serializeVersion(version) {
  return {
    id: version.id,
    form_name: version.versionName || `Version ${version.versionNo}`,
    version_no: version.versionNo,
    is_active: version.isActive,
    created_at: dateOnly(version.createdAt),
    created_by: 'System',
    sections: (version.sections || [])
      .filter((section) => section.isActive !== false)
      .sort((a,b) => a.displayOrder-b.displayOrder)
      .map((s) => {
        const sortedFields = (s.fields || [])
          .filter((field) => field.isActive !== false)
          .sort((a,b) => a.displayOrder-b.displayOrder);
        const rootFields = [];
        const subsectionMap = new Map();

        for (const field of sortedFields) {
          const subsection = field.configJson?.subsection;
          if (!subsection) {
            rootFields.push(serializeField(field));
            continue;
          }

          const key = String(subsection.id || subsection.title || `subsection-${subsection.order || 0}`);
          if (!subsectionMap.has(key)) {
            subsectionMap.set(key, {
              id: key,
              title: subsection.title || 'Sub Section',
              description: subsection.description || '',
              order: Number(subsection.order || 0),
              is_active: subsection.is_active !== false,
              fields: [],
            });
          }
          subsectionMap.get(key).fields.push(serializeField(field));
        }

        return {
          id: s.id,
          title: s.sectionName,
          description: s.description || '',
          order: s.displayOrder,
          is_active: s.isActive,
          fields: rootFields,
          subsections: [...subsectionMap.values()].sort((a,b) => a.order-b.order),
        };
      }),
  };
}

export function serializeCustomer(c) {
  return {
    id: c.id,
    customer_no: c.customerNo,
    customer_name: c.customerName,
    customer_type: c.customerType || '',
    city: c.city || '',
    is_active: c.isActive,
    created_at: dateOnly(c.createdAt),
    created_by: c.createdBy?.fullName || '',
    created_by_id: c.createdById || null,
    project_count: c._count?.projects || 0,
    // Kept for backward compatibility with any older code that still reads departments.
    // The UI no longer manages customer departments separately.
    departments: (c.departments || []).map((d) => ({
      id: d.id,
      department_name: d.departmentName,
      department_code: d.departmentCode || '',
      is_active: d.isActive,
    })),
    contacts: (c.departments || []).flatMap((d) => (d.contacts || []).map((x) => ({
      id: x.id,
      customer_department_id: d.id,
      department_name: d.departmentName,
      contact_name: x.contactName,
      designation: x.designation || '',
      stakeholder_role: x.stakeholderRole || '',
      email: x.email || '',
      phone: x.phone || '',
      is_primary: x.isPrimary,
      is_active: x.isActive,
    }))),
  };
}

export function serializeInquiry(i) {
  const dynamic = {};
  for (const fv of i.fieldValues || []) dynamic[fv.formField?.fieldKey || fv.formFieldId] = fv.valueJson;
  const revision = latestInquiryRevision(i);
  const statusDetails = latestInquiryStatusDetails(i);
  const hasConvertedProject = Boolean(
    i.projects?.length ||
    i.uiData?.project_created ||
    i.uiData?.converted_to_project ||
    i.uiData?.project_id
  );
  return {
    ...(i.uiData || {}),
    id: i.id,
    inquiry_no: i.inquiryNo,
    inquiry_date: dateOnly(i.inquiryDate),
    customer_id: i.customerId,
    customer: i.customer?.customerName || '',
    project_name: i.projectName,
    status: i.status,
    amendment: Boolean(hasConvertedProject && i.uiData?.amendment_active && i.status !== 'Order Won'),
    amendment_message: hasConvertedProject && i.uiData?.amendment_active && i.status !== 'Order Won'
      ? `Amendment started after the converted inquiry changed from Order Won to ${i.status}.`
      : '',
    status_reason: statusDetails.reason,
    status_remark: statusDetails.remark,
    status_summary: statusDetails.summary,
    status_changed_at: statusDetails.changedAt,
    qty: i.qty,
    revision_number: revision.revisionNumber,
    revision_label: revision.versionLabel,
    created_by: i.uiData?.created_by || '',
    created_by_id: i.createdById || null,
    created_at: dateOnly(i.createdAt),
    dynamic_data: dynamic,
    panels: (i.panels || []).map((p) => ({
      id: p.id, panel_id: p.panelMasterId, panel_master_id: p.panelMasterId, panel_no: p.panelNo,
      panel_version_id: p.formVersionId, panel: p.panelMaster?.panelType || '', panel_type: p.panelMaster?.panelType || '', panel_code: p.panelMaster?.panelCode || '', qty: p.quantity,
    })),
  };
}

export function serializeProject(p, createdByName = '') {
  const ui = p.uiData || {};
  const locked = Boolean(p.inquiry && ['Order Lost', 'Inquiry Hold'].includes(p.inquiry.status));
  const sourceInquiryAmendment = Boolean(
    p.inquiry &&
    p.inquiry.uiData?.amendment_active &&
    p.inquiry.status !== 'Order Won'
  );
  return {
    ...ui,
    id: p.id,
    project_no: p.projectNo,
    source_inquiry: p.inquiry?.inquiryNo || 'Direct',
    source_inquiry_status: p.inquiry?.status || '',
    source_inquiry_amendment: sourceInquiryAmendment,
    source_inquiry_amendment_message: sourceInquiryAmendment
      ? `Amendment active: source inquiry ${p.inquiry?.inquiryNo || ''} changed from Order Won to ${p.inquiry?.status || 'another status'}.`
      : '',
    project_locked: locked,
    project_lock_reason: locked ? `Source inquiry ${p.inquiry?.inquiryNo || ''} is ${p.inquiry?.status}. Restore the inquiry to Order Won to continue project updates.` : '',
    inquiry_id: p.inquiryId,
    customer_id: p.customerId,
    customer: p.customer?.customerName || '',
    project_name: p.projectName,
    status: p.status,
    progress: p.progress,
    created_at: dateOnly(p.createdAt),
    target_end_date: dateOnly(p.targetEndDate),
    created_by_id: p.createdById || null,
    created_by: ui.created_by || createdByName || '',
    departments: ui.departments || (p.departments || []).map((d) => d.department.departmentName),
    assignments: ui.assignments || [...new Set((p.planning || []).map((x) => x.assignedUser?.fullName).filter(Boolean))],
    panels: ui.panels || (p.panels || []).map((x) => ({ panel_id: x.panelMasterId, panel_no: x.panelNo, panel: x.panelMaster?.panelType || '', qty: x.quantity })),
    planning_grid: ui.planning_grid || (p.planning || []).map((x) => ({
      id: x.id,
      panel: x.projectPanel ? `${x.projectPanel.panelNo} · ${x.projectPanel.panelMaster?.panelType || ''}` : 'Common',
      department: x.department.departmentName,
      task: x.taskName,
      assigned_to: x.assignedUser?.fullName || '',
      planned_start: dateOnly(x.plannedStart), planned_end: dateOnly(x.plannedEnd),
      status: x.status, progress: x.progress,
    })),
  };
}

const auditActionLabel = (action = '') => ({
  CREATE:'Created',
  LOGIN:'Logged In',
  UPDATE:'Updated',
  STATUS_CHANGE:'Status Changed',
  STATUS_CREATE:'Status Created',
  STATUS_UPDATE:'Status Updated',
  KICKOFF_COMPLETE:'Kickoff Completed',
  COPY:'Copied',
  ARCHIVE:'Archived',
  UNARCHIVE:'Unarchived',
  UPLOAD:'Uploaded',
  VERSION_CREATE:'Version Created',
  VERSION_UPDATE:'Version Updated',
  VERSION_ACTIVATE:'Version Activated',
}[String(action || '').toUpperCase()] || String(action || '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()));

const auditRecordFallback = (a) => {
  const values = a.newValues || a.oldValues || {};
  const first = (...keys) => keys.map((key) => values?.[key]).find((value) => value !== undefined && value !== null && String(value).trim() !== '');
  const module = String(a.module || 'Record');
  if (module === 'INQUIRIES') return [first('inquiry_no'), first('project_name')].filter(Boolean).join(' · ') || 'Inquiry';
  if (module === 'PROJECTS') return [first('project_no'), first('project_name')].filter(Boolean).join(' · ') || 'Project';
  if (module === 'CUSTOMERS') return [first('customer_no'), first('customer_name')].filter(Boolean).join(' · ') || 'Customer';
  if (module === 'USERS' || module === 'USER_ACCESS' || module === 'AUTH') return [first('employee_no'), first('full_name')].filter(Boolean).join(' · ') || 'User';
  if (module === 'DEPARTMENTS') return [first('department_code'), first('department_name')].filter(Boolean).join(' · ') || 'Department';
  if (module === 'PANELS') return [first('panel_code'), first('panel_type')].filter(Boolean).join(' · ') || 'Panel';
  if (module === 'TIMESHEET') return first('title') || 'Timesheet Task';
  if (module === 'DOCUMENTS') return first('document_name', 'original_upload_name') || 'Document';
  if (module === 'DOCUMENT_TYPES') return first('document_type_name', 'document_type_code') || 'Document Type';
  return module.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

export function serializeAudit(a) {
  return {
    id: a.id,
    created_at: a.createdAt.toISOString(),
    user: a.user?.fullName || 'System',
    user_id: a.userId || '',
    departments: [...new Set((a.user?.userDepartments || []).map((membership) => membership.department?.departmentName).filter(Boolean))],
    module: a.module,
    action: a.action,
    action_label: auditActionLabel(a.action),
    record_id: a.recordId || '',
    record_label: a.recordLabel || auditRecordFallback(a),
    field_labels: a.fieldLabels || {},
    old_values: a.oldValues ?? null,
    new_values: a.newValues ?? null,
  };
}
