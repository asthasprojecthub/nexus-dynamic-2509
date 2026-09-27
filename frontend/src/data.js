export const seedData = {
  customers: [
    { id: 'c1', customer_no: 'CUS-0001', customer_name: 'Apex Process Systems', customer_type: 'OEM', is_active: true, created_at: '2026-08-05', departments: [
      { id: 'cd1', department_name: 'Projects', department_code: 'PRJ', is_active: true },
      { id: 'cd2', department_name: 'Purchase', department_code: 'PUR', is_active: true }
    ], contacts: [
      { id: 'cc1', customer_department_id: 'cd1', contact_name: 'Raj Mehta', designation: 'Project Manager', stakeholder_role: 'Decision Maker', email: 'raj@apex.example', phone: '+91 98765 10001', is_primary: true, is_active: true },
      { id: 'cc2', customer_department_id: 'cd2', contact_name: 'Nina Shah', designation: 'Purchase Engineer', stakeholder_role: 'Commercial', email: 'nina@apex.example', phone: '+91 98765 10002', is_primary: false, is_active: true }
    ]},
    { id: 'c2', customer_no: 'CUS-0002', customer_name: 'Sterling Pharma Engineering', customer_type: 'End User', is_active: true, created_at: '2026-08-08', departments: [
      { id: 'cd3', department_name: 'Engineering', department_code: 'ENG', is_active: true }
    ], contacts: [
      { id: 'cc3', customer_department_id: 'cd3', contact_name: 'Mihir Desai', designation: 'Automation Lead', stakeholder_role: 'Technical Evaluator', email: 'mihir@sterling.example', phone: '+91 98765 20001', is_primary: true, is_active: true }
    ]},
    { id: 'c3', customer_no: 'CUS-0003', customer_name: 'Orion Utilities', customer_type: 'Consultant', is_active: false, created_at: '2026-07-19', departments: [], contacts: [] },
  ],
  departments: [
    { id: 'd1', department_code: 'AUT', department_name: 'Automation', is_active: true },
    { id: 'd2', department_code: 'DES', department_name: 'Design', is_active: true },
    { id: 'd3', department_code: 'PUR', department_name: 'Purchase', is_active: true },
    { id: 'd4', department_code: 'PROD', department_name: 'Production', is_active: true },
    { id: 'd5', department_code: 'QC', department_name: 'QC', is_active: true },
    { id: 'd6', department_code: 'STO', department_name: 'Store', is_active: true },
    { id: 'd7', department_code: 'SAL', department_name: 'Sales', is_active: true },
  ],
  users: [
    { id: 'u1', full_name: 'Nexus Admin', email: 'admin@nexus.local', role: 'Admin', is_active: true, departments: [] },
    { id: 'u2', full_name: 'Aarav Shah', email: 'aarav@nexus.local', role: 'HOD', is_active: true, departments: ['Automation', 'Design'] },
    { id: 'u3', full_name: 'Diya Patel', email: 'diya@nexus.local', role: 'Team Lead', is_active: true, departments: ['Automation'] },
    { id: 'u4', full_name: 'Kabir Joshi', email: 'kabir@nexus.local', role: 'Employee', is_active: true, departments: ['Production'] },
  ],

  // ─── Inquiry Master ───────────────────────────────────────────────────────
  // Core identity fields (Customer, Project Name, Inquiry Date and Status) are
  // structural on the Inquiry page. Everything below is user-configurable.
  inquiryMaster: {
    id: 'im1',
    versions: [
      {
        id: 'imv1',
        form_name: 'Inquiry General Information Form',
        version_no: 1,
        is_active: true,
        created_at: '2026-08-01',
        created_by: 'Nexus Admin',
        sections: [
          {
            id: 'ims1',
            title: 'General Inquiry Information',
            description: 'Common inquiry specifications. Add, remove or reorder fields from Inquiry Master.',
            order: 1,
            is_active: true,
            fields: [
              { id: 'imf1', label: 'Order Expected End Date', field_type: 'date', required: true, is_active: true, order: 1, options: [], table_config: null },
              { id: 'imf2', label: 'Panel Area Classification', field_type: 'dropdown', required: true, is_active: true, order: 2, options: ['Non Hazardous', 'Zone 1', 'Zone 2', 'Not Applicable'], table_config: null },
              { id: 'imf3', label: 'Installation Type', field_type: 'dropdown', required: true, is_active: true, order: 3, options: ['Indoor', 'Outdoor', 'Not Applicable'], table_config: null },
              { id: 'imf4', label: 'IP Rating', field_type: 'dropdown', required: true, is_active: true, order: 4, options: ['IP42', 'IP54', 'IP55', 'IP65', 'IP66', 'Not Applicable'], table_config: null },
              { id: 'imf5', label: 'Enclosure Type', field_type: 'dropdown', required: true, is_active: true, order: 5, options: ['CRCA / MS', 'SS304', 'SS316', 'FLP', 'Not Applicable'], table_config: null },
              { id: 'imf6', label: 'Enclosure Make', field_type: 'text', required: false, is_active: true, order: 6, options: [], table_config: null },
              { id: 'imf7', label: 'Panel Structure', field_type: 'dropdown', required: false, is_active: true, order: 7, options: ['Floor Mounted', 'Wall Mounted', 'Desk Type', 'Not Applicable'], table_config: null },
              { id: 'imf8', label: 'Cable Entry', field_type: 'dropdown', required: false, is_active: true, order: 8, options: ['Top', 'Bottom', 'Top & Bottom', 'Not Applicable'], table_config: null },
              { id: 'imf9', label: 'Switchgear Make', field_type: 'text', required: false, is_active: true, order: 9, options: [], table_config: null },
              { id: 'imf10', label: 'Application / Process', field_type: 'text', required: false, is_active: true, order: 10, options: [], table_config: null },
              { id: 'imf11', label: 'Supply Voltage', field_type: 'text', required: false, is_active: true, order: 11, options: [], table_config: null },
              { id: 'imf12', label: 'Control Voltage', field_type: 'text', required: false, is_active: true, order: 12, options: [], table_config: null },
            ],
          },
        ],
      },
    ],
  },

  // ─── Project Master ───────────────────────────────────────────────────────
  // Same shape as inquiryMaster: one record with versions → sections → fields.
  // Drives the "Additional Project Information" section on the Project form.
  projectMaster: {
    id: 'prm1',
    versions: [
      {
        id: 'prmv1',
        form_name: 'Project Information Form',
        version_no: 1,
        is_active: true,
        created_at: '2026-08-01',
        created_by: 'Nexus Admin',
        sections: [
          {
            id: 'prms1',
            title: 'Project Information',
            order: 1,
            is_active: true,
            fields: [
              { id: 'prmf1', label: 'Project Quantity', field_type: 'number', required: true, is_active: true, order: 1, options: [], table_config: null },
              { id: 'prmf2', label: 'Project Type', field_type: 'dropdown', required: false, is_active: true, order: 2, options: ['New', 'Modification', 'AMC', 'Retrofit'], table_config: null },
              { id: 'prmf3', label: 'Priority', field_type: 'radio', required: false, is_active: true, order: 3, options: ['Low', 'Medium', 'High', 'Critical'], table_config: null },
              { id: 'prmf4', label: 'Remarks', field_type: 'textarea', required: false, is_active: true, order: 4, options: [], table_config: null },
            ],
          },
        ],
      },
    ],
  },

  // ─── Planning Grid Master ─────────────────────────────────────────────────
  // The project planning table itself is fixed to match the production Nexus
  // workflow. Only department task names and allowed status choices are dynamic.
  planningGridMaster: {
    id: 'pgm1',
    form_name: 'Project Planning Grid',
    statuses: ['Pending', 'In Progress', 'Delay', 'Completed', 'On Hold'],
    department_tasks: {
      Automation: [
        { id: 'pgt-aut-1', name: 'System Architecture Definition' },
        { id: 'pgt-aut-2', name: 'Control Architecture Definition' },
        { id: 'pgt-aut-3', name: 'Software Architecture Definition' },
        { id: 'pgt-aut-4', name: 'PLC Programming' },
        { id: 'pgt-aut-5', name: 'HMI / SCADA Development' },
      ],
      Design: [
        { id: 'pgt-des-1', name: 'GA Drawing' },
        { id: 'pgt-des-2', name: 'Power Diagram' },
        { id: 'pgt-des-3', name: 'Control Wiring' },
      ],
      Purchase: [
        { id: 'pgt-pur-1', name: 'BOM Review' },
        { id: 'pgt-pur-2', name: 'Material Purchase' },
      ],
      Production: [
        { id: 'pgt-pro-1', name: 'Panel Fabrication' },
        { id: 'pgt-pro-2', name: 'Assembly' },
        { id: 'pgt-pro-3', name: 'Testing' },
      ],
      QC: [
        { id: 'pgt-qc-1', name: 'Inspection' },
        { id: 'pgt-qc-2', name: 'FAT Support' },
      ],
      Store: [
        { id: 'pgt-sto-1', name: 'Material Receiving' },
        { id: 'pgt-sto-2', name: 'Material Issue' },
      ],
      Sales: [],
    },
  },

  // ─── Panel Masters ────────────────────────────────────────────────────────
  // Each panel has a meta section (code, type, is_active) plus versions[].
  panelMasters: [
    {
      id: 'p1',
      panel_code: 'PLC-STD',
      panel_type: 'PLC Panel',
      form_name: 'PLC Panel Form',
      is_active: true,
      created_at: '2026-08-01',
      versions: [
        {
          id: 'pmv1',
          form_name: 'PLC Panel Technical Form',
          version_no: 1,
          is_active: true,
          created_at: '2026-08-01',
          created_by: 'Nexus Admin',
          sections: [
            {
              id: 'pms1',
              title: 'PLC Panel – Technical Details',
              order: 1,
              is_active: true,
              fields: [
                { id: 'pmf1', label: 'IP Rating', field_type: 'dropdown', required: true, is_active: true, order: 1, options: ['IP54', 'IP55', 'IP65', 'IP66'], table_config: null },
                { id: 'pmf2', label: 'Enclosure Type', field_type: 'text', required: true, is_active: true, order: 2, options: [], table_config: null },
                { id: 'pmf3', label: 'PLC Make', field_type: 'dropdown', required: true, is_active: true, order: 3, options: ['Siemens', 'Allen Bradley', 'Mitsubishi', 'Delta', 'Schneider'], table_config: null },
                { id: 'pmf4', label: 'PLC Model', field_type: 'text', required: false, is_active: true, order: 4, options: [], table_config: null },
                { id: 'pmf5', label: 'I/O Count', field_type: 'number', required: false, is_active: true, order: 5, options: [], table_config: null },
              ],
            },
            {
              id: 'pms2',
              title: 'Product Details',
              order: 2,
              is_active: true,
              fields: [
                {
                  id: 'pmf6',
                  label: 'Product Details',
                  field_type: 'table',
                  required: false,
                  is_active: true,
                  order: 1,
                  options: [],
                  table_config: {
                    allow_add_rows: true,
                    fixed_rows: 0,
                    columns: [
                      { id: 'tc1', name: 'Product Name', field_type: 'text', required: true },
                      { id: 'tc2', name: 'Quantity', field_type: 'number', required: true },
                      { id: 'tc3', name: 'Rate', field_type: 'number', required: false },
                      { id: 'tc4', name: 'Amount', field_type: 'number', required: false },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'p2',
      panel_code: 'MCC-STD',
      panel_type: 'MCC Panel',
      form_name: 'MCC Panel Form',
      is_active: true,
      created_at: '2026-08-01',
      versions: [
        {
          id: 'pmv2',
          form_name: 'MCC Panel Technical Form',
          version_no: 1,
          is_active: true,
          created_at: '2026-08-01',
          created_by: 'Nexus Admin',
          sections: [
            {
              id: 'pms3',
              title: 'MCC Panel Configuration',
              order: 1,
              is_active: true,
              fields: [
                { id: 'pmf7', label: 'Form Type', field_type: 'radio', required: true, is_active: true, order: 1, options: ['Non Compartmental', 'Form 2b', 'Form 3b', 'Form 4b'], table_config: null },
                { id: 'pmf8', label: 'Incomer Type', field_type: 'dropdown', required: true, is_active: true, order: 2, options: ['MCCB', 'ACB', 'Fuse Switch'], table_config: null },
                { id: 'pmf9', label: 'Busbar Material', field_type: 'radio', required: true, is_active: true, order: 3, options: ['Copper', 'Aluminium'], table_config: null },
                { id: 'pmf10', label: 'Protection Relay', field_type: 'checkbox', required: false, is_active: true, order: 4, options: ['Over Current', 'Earth Fault', 'Under Voltage', 'Over Voltage'], table_config: null },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'p3',
      panel_code: 'VFD-STD',
      panel_type: 'VFD Panel',
      form_name: 'VFD Panel Form',
      is_active: true,
      created_at: '2026-08-01',
      versions: [
        {
          id: 'pmv3',
          form_name: 'VFD Panel Technical Form',
          version_no: 1,
          is_active: true,
          created_at: '2026-08-01',
          created_by: 'Nexus Admin',
          sections: [
            {
              id: 'pms4',
              title: 'VFD Specifications',
              order: 1,
              is_active: true,
              fields: [
                { id: 'pmf11', label: 'Drive Make', field_type: 'dropdown', required: true, is_active: true, order: 1, options: ['ABB', 'Siemens', 'Danfoss', 'Schneider', 'Delta'], table_config: null },
                { id: 'pmf12', label: 'Drive Model', field_type: 'text', required: false, is_active: true, order: 2, options: [], table_config: null },
                { id: 'pmf13', label: 'Bypass Required', field_type: 'radio', required: true, is_active: true, order: 3, options: ['Yes', 'No'], table_config: null },
                { id: 'pmf14', label: 'Cooling Method', field_type: 'dropdown', required: true, is_active: true, order: 4, options: ['Natural Convection', 'Forced Ventilation', 'Air Conditioned'], table_config: null },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'p4',
      panel_code: 'FLP-STD',
      panel_type: 'FLP Panel',
      form_name: 'FLP Panel Form',
      is_active: true,
      created_at: '2026-08-01',
      versions: [
        {
          id: 'pmv4',
          version_no: 1,
          is_active: true,
          created_at: '2026-08-01',
          created_by: 'Nexus Admin',
          sections: [
            {
              id: 'pms5',
              title: 'FLP Panel Details',
              order: 1,
              is_active: true,
              fields: [
                { id: 'pmf15', label: 'Hazardous Area Classification', field_type: 'dropdown', required: true, is_active: true, order: 1, options: ['Zone 0', 'Zone 1', 'Zone 2', 'Division 1', 'Division 2'], table_config: null },
                { id: 'pmf16', label: 'ATEX Certification', field_type: 'text', required: true, is_active: true, order: 2, options: [], table_config: null },
                { id: 'pmf17', label: 'Gas Group', field_type: 'dropdown', required: true, is_active: true, order: 3, options: ['IIA', 'IIB', 'IIC'], table_config: null },
                { id: 'pmf18', label: 'Temperature Class', field_type: 'dropdown', required: false, is_active: true, order: 4, options: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'], table_config: null },
              ],
            },
          ],
        },
      ],
    },
  ],

  // ─── Legacy panels (still used by old inquiries/projects) ────────────────
  panels: [
    { id: 'p1', panel_code: 'PLC-STD', panel_type: 'PLC Panel', is_active: true, dynamic_data: { ip_rating: 'IP54', enclosure: 'Powder Coated MS', plc_make: 'Siemens' } },
    { id: 'p2', panel_code: 'MCC-STD', panel_type: 'MCC Panel', is_active: true, dynamic_data: { form: 'Non Compartmental', incomer: 'MCCB', busbar: 'Copper' } },
    { id: 'p3', panel_code: 'VFD-STD', panel_type: 'VFD Panel', is_active: true, dynamic_data: { drive_make: 'ABB', bypass: false, cooling: 'Forced Ventilation' } },
    { id: 'p4', panel_code: 'FLP-STD', panel_type: 'FLP Panel', is_active: true, dynamic_data: { area: 'Zone 1', certification: 'CIMFR' } },
  ],

  inquiries: [
    { id: 'i1', inquiry_no: 'INQ-2026-0142', customer_id: 'c1', customer: 'Apex Process Systems', project_name: 'Reactor Automation Upgrade', status: 'Technical Evaluation', created_at: '2026-08-20', dynamic_data: { location: 'Ahmedabad' }, panels: [{ panel_id:'p1', panel_no: 'P-01', panel: 'PLC Panel', qty: 2 }, { panel_id:'p2', panel_no: 'P-02', panel: 'MCC Panel', qty: 1 }] },
    { id: 'i2', inquiry_no: 'INQ-2026-0141', customer_id: 'c2', customer: 'Sterling Pharma Engineering', project_name: 'Utility VFD Control Panel', status: 'New', created_at: '2026-08-19', dynamic_data: { location: 'Vadodara' }, panels: [{ panel_id:'p3', panel_no: 'P-01', panel: 'VFD Panel', qty: 3 }] },
    { id: 'i3', inquiry_no: 'INQ-2026-0138', customer_id: 'c1', customer: 'Apex Process Systems', project_name: 'Packaging Line Control Panel', status: 'Converted', created_at: '2026-08-14', dynamic_data: { location: 'Surat' }, panels: [{ panel_id:'p1', panel_no: 'P-01', panel: 'PLC Panel', qty: 1 }] },
  ],
  projects: [
    { id: 'pr1', project_no: 'PRJ-2026-0088', source_inquiry: 'INQ-2026-0138', customer_id:'c1', customer: 'Apex Process Systems', project_name:'Packaging Line Control Panel', status: 'In Progress', progress: 63, created_at: '2026-08-16', departments: ['Automation', 'Design', 'Purchase', 'Production'], assignments: ['Aarav Shah', 'Diya Patel'], panels: [{ panel_id:'p1', panel_no: 'P-01', panel: 'PLC Panel', qty: 1 }], planning_grid: [
      {id:'pg1',panel:'P-01 · PLC Panel',department:'Design',task:'Electrical drawing preparation',assigned_to:'Aarav Shah',planned_start:'2026-08-17',planned_end:'2026-08-20',status:'Completed',progress:100},
      {id:'pg2',panel:'P-01 · PLC Panel',department:'Automation',task:'PLC software development',assigned_to:'Diya Patel',planned_start:'2026-08-20',planned_end:'2026-08-28',status:'In Progress',progress:65},
      {id:'pg3',panel:'P-01 · PLC Panel',department:'Production',task:'Panel wiring and assembly',assigned_to:'Kabir Joshi',planned_start:'2026-08-24',planned_end:'2026-09-01',status:'Planned',progress:25},
    ] },
    { id: 'pr2', project_no: 'PRJ-2026-0083', source_inquiry: 'Direct', customer_id:'c2', customer: 'Sterling Pharma Engineering', project_name:'Process MCC Expansion', status: 'Planning', progress: 25, created_at: '2026-08-10', departments: ['Design', 'Purchase'], assignments: ['Kabir Joshi'], panels: [{ panel_id:'p2', panel_no: 'P-01', panel: 'MCC Panel', qty: 1 }, { panel_id:'p3', panel_no: 'P-02', panel: 'VFD Panel', qty: 2 }], planning_grid: [
      {id:'pg4',panel:'P-01 · MCC Panel',department:'Design',task:'GA and SLD preparation',assigned_to:'Aarav Shah',planned_start:'2026-08-24',planned_end:'2026-08-29',status:'In Progress',progress:50},
      {id:'pg5',panel:'P-02 · VFD Panel',department:'Purchase',task:'Release approved BOM for procurement',assigned_to:'',planned_start:'2026-08-29',planned_end:'2026-09-03',status:'Planned',progress:0},
    ] },
  ],
  documentTypes: [
    { id: 'dt1', document_type_code: 'GA', document_type_name: 'General Arrangement', is_active: true },
    { id: 'dt2', document_type_code: 'BOM', document_type_name: 'Bill of Material', is_active: true },
    { id: 'dt3', document_type_code: 'QAP', document_type_name: 'Quality Assurance Plan', is_active: true },
    { id: 'dt4', document_type_code: 'OTHER', document_type_name: 'Other Document', is_active: true },
  ],
  documents: [
    { id: 'doc1', document_type_id: 'dt1', file_name: 'PRJ-0088-GA-R1.pdf', original_file_name: 'GA Drawing.pdf', file_path: '/secure/projects/pr1/PRJ-0088-GA-R1.pdf', mime_type: 'application/pdf', file_size: '2.4 MB', version_no: 1, is_active: true, uploaded_by: 'Diya Patel', uploaded_at: '2026-08-20 11:24' },
    { id: 'doc2', document_type_id: 'dt2', file_name: 'INQ-0142-BOM-R2.xlsx', original_file_name: 'BOM.xlsx', file_path: '/secure/inquiries/i1/INQ-0142-BOM-R2.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', file_size: '620 KB', version_no: 2, is_active: true, uploaded_by: 'Aarav Shah', uploaded_at: '2026-08-21 15:05' },
    { id: 'doc3', document_type_id: 'dt3', file_name: 'PRJ-0088-QAP-R1.pdf', original_file_name: 'QAP.pdf', file_path: '/secure/projects/pr1/PRJ-0088-QAP-R1.pdf', mime_type: 'application/pdf', file_size: '1.1 MB', version_no: 1, is_active: true, uploaded_by: 'Nexus Admin', uploaded_at: '2026-08-22 10:18' },
  ],
  inquiryDocuments: [
    { id: 'idoc1', inquiry_id: 'i1', document_id: 'doc2', description: 'Commercial BOM received for technical review', is_active: true, created_by: 'Aarav Shah', created_at: '2026-08-21 15:05' },
  ],
  projectDocuments: [
    { id: 'pdoc1', project_id: 'pr1', document_id: 'doc1', description: 'Approved GA drawing - Revision 1', is_active: true, created_by: 'Diya Patel', created_at: '2026-08-20 11:24' },
    { id: 'pdoc2', project_id: 'pr1', document_id: 'doc3', description: 'Quality assurance plan for client approval', is_active: true, created_by: 'Nexus Admin', created_at: '2026-08-22 10:18' },
  ],
  auditLogs: [
    { id: 'a1', created_at: '2026-08-23 14:21:08', user: 'Nexus Admin', module: 'CUSTOMERS', action: 'UPDATE', record_id: 'c1', source: 'WEB', ip_address: '192.168.1.24', remarks: 'Updated customer contact details' },
    { id: 'a2', created_at: '2026-08-23 13:46:32', user: 'Diya Patel', module: 'INQUIRIES', action: 'UPDATE', record_id: 'i1', source: 'WEB', ip_address: '192.168.1.33', remarks: 'Updated inquiry panel quantity' },
    { id: 'a3', created_at: '2026-08-23 12:18:09', user: 'Aarav Shah', module: 'PROJECTS', action: 'CREATE', record_id: 'pr2', source: 'WEB', ip_address: '192.168.1.31', remarks: 'Created direct project' },
    { id: 'a4', created_at: '2026-08-22 17:10:44', user: 'Nexus Admin', module: 'PANELS', action: 'UPDATE', record_id: 'p2', source: 'WEB', ip_address: '192.168.1.24', remarks: 'Changed MCC master configuration' },
  ]
};
