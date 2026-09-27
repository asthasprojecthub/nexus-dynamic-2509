// Shared helpers for the Ticket Form (Phase 1 / Phase 2 builder sections, plus the
// version-specific "Ticket Core Dropdown Options" that back the fixed Ticket fields:
// Ticket Type, Problem Type, Make/Manufacturer, Received Through, Warranty,
// Support Location, Support Type, Repair Location and Priority.
//
// This mirrors backend/src/server.js (ticketCoreOptionFields) and
// database/15-ticket-phase-module.sql (section "Ticket Core Dropdown Options",
// fields keyed __ticket_core_*) - keep the categories/field keys in sync with those.

export const CORE_OPTIONS_SECTION_TITLE = "Ticket Core Dropdown Options";

export const TICKET_CORE_OPTION_DEFINITIONS = [
  { category: "TICKET_TYPE", fieldKey: "__ticket_core_ticket_type", label: "Ticket Type" },
  { category: "PROBLEM_TYPE", fieldKey: "__ticket_core_problem_type", label: "Problem Type" },
  { category: "MANUFACTURER", fieldKey: "__ticket_core_manufacturer", label: "Make / Manufacturer" },
  { category: "RECEIVED_VIA", fieldKey: "__ticket_core_received_via", label: "Received Through" },
  { category: "WARRANTY_STATUS", fieldKey: "__ticket_core_warranty_status", label: "Warranty" },
  { category: "SUPPORT_MODE", fieldKey: "__ticket_core_support_mode", label: "Support Location" },
  { category: "SUPPORT_TYPE", fieldKey: "__ticket_core_support_type", label: "Support Type" },
  { category: "REPAIR_LOCATION", fieldKey: "__ticket_core_repair_location", label: "Repair Location" },
  { category: "PRIORITY", fieldKey: "__ticket_core_priority", label: "Priority" },
];

const DEFAULT_CORE_OPTIONS = {
  TICKET_TYPE: ["Hardware", "Software"],
  PROBLEM_TYPE: ["PLC", "HMI", "Software", "IPC", "VFD", "Servo"],
  MANUFACTURER: ["Siemens", "Rockwell", "ABB", "Yaskawa", "IDEC", "Exor", "Mitsubishi", "Schneider"],
  RECEIVED_VIA: ["Courier", "Hand Delivery", "Customer Site", "Not Applicable"],
  WARRANTY_STATUS: ["Yes", "No", "Confirmation Required"],
  SUPPORT_MODE: ["On-site", "Remote / Offline", "Off-site"],
  SUPPORT_TYPE: ["AMC", "FOC", "Chargeable", "Warranty"],
  REPAIR_LOCATION: ["In-house / Store", "Local Repairer", "OEM / Vendor", "Customer Site"],
  PRIORITY: ["Low", "Medium", "High", "Critical"],
};

const isCoreSection = (section) =>
  String(section?.title || section?.section_name || "").trim().toLowerCase() ===
  CORE_OPTIONS_SECTION_TITLE.toLowerCase();

const cloneOptions = (list) => (Array.isArray(list) ? [...list] : []);

const newId = () => `core-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

/** Legacy fallback: the old flat ticket_master_options table, [{category, option_label}]. */
function legacyOptionsFor(category, legacyOptions = []) {
  return (legacyOptions || [])
    .filter((item) => item?.category === category && item?.is_active !== false)
    .map((item) => item.option_label)
    .filter(Boolean);
}

/**
 * Read the per-version dropdown option lists for the fixed Ticket fields.
 * Falls back to the legacy master table, then to sane defaults, so a brand new
 * Ticket Form version (or one saved before this feature existed) still works.
 */
export function ticketCoreOptions(sections = [], legacyOptions = []) {
  const coreSection = (sections || []).find(isCoreSection);
  const fieldsByKey = new Map(
    (coreSection?.fields || []).map((field) => [field.field_key || field.key, field]),
  );
  const result = {};
  for (const definition of TICKET_CORE_OPTION_DEFINITIONS) {
    const field = fieldsByKey.get(definition.fieldKey);
    const configured = cloneOptions(field?.options);
    result[definition.category] = configured.length
      ? configured
      : legacyOptionsFor(definition.category, legacyOptions).length
        ? legacyOptionsFor(definition.category, legacyOptions)
        : [...DEFAULT_CORE_OPTIONS[definition.category]];
  }
  return result;
}

/** Every section except the internal "Ticket Core Dropdown Options" one - what FormBuilder edits. */
export function ticketDynamicSections(sections = []) {
  return (sections || []).filter((section) => !isCoreSection(section));
}

/**
 * Make sure `sections` has a "Ticket Core Dropdown Options" section with all 9 fixed
 * fields, seeded from the legacy table / defaults where nothing is configured yet.
 */
export function ensureTicketFormOptions(sections = [], legacyOptions = []) {
  const rest = ticketDynamicSections(sections);
  const existing = (sections || []).find(isCoreSection);
  const options = ticketCoreOptions(sections, legacyOptions);
  const coreSection = {
    id: existing?.id || newId(),
    title: CORE_OPTIONS_SECTION_TITLE,
    description: "Version-specific options for locked Ticket fields.",
    display_order: existing?.display_order ?? existing?.order ?? 9999,
    is_active: true,
    subsections: [],
    fields: TICKET_CORE_OPTION_DEFINITIONS.map((definition, index) => {
      const existingField = (existing?.fields || []).find(
        (field) => (field.field_key || field.key) === definition.fieldKey,
      );
      return {
        id: existingField?.id || `${definition.fieldKey}-${newId()}`,
        field_key: definition.fieldKey,
        label: definition.label,
        field_type: "dropdown",
        required: false,
        is_active: true,
        order: index,
        options: options[definition.category],
      };
    }),
  };
  return [...rest, coreSection];
}

/**
 * Combine the structural sections (as edited in FormBuilder) with an updated set of
 * core dropdown options, producing the full `sections` array to save back to the API.
 * `sourceSections` (optional) supplies the core section's ids/order if present.
 */
export function mergeTicketFormSections(dynamicSections = [], optionsMap = {}, sourceSections = []) {
  const existing = (sourceSections || []).find(isCoreSection);
  const coreSection = {
    id: existing?.id || newId(),
    title: CORE_OPTIONS_SECTION_TITLE,
    description: existing?.description || "Version-specific options for locked Ticket fields.",
    display_order: existing?.display_order ?? existing?.order ?? 9999,
    is_active: true,
    subsections: [],
    fields: TICKET_CORE_OPTION_DEFINITIONS.map((definition, index) => {
      const existingField = (existing?.fields || []).find(
        (field) => (field.field_key || field.key) === definition.fieldKey,
      );
      return {
        id: existingField?.id || `${definition.fieldKey}-${newId()}`,
        field_key: definition.fieldKey,
        label: definition.label,
        field_type: "dropdown",
        required: false,
        is_active: true,
        order: index,
        options: cloneOptions(optionsMap[definition.category]),
      };
    }),
  };
  return [...ticketDynamicSections(dynamicSections), coreSection];
}
