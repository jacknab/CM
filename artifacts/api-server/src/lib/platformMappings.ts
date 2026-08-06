/**
 * Platform-specific CSV/XLSX column mappings for the data transfer system.
 *
 * Each platform entry defines:
 *   clients    – field → app field mappings for the client/customer CSV
 *   appointments – field → app field mappings for the appointment CSV
 *   services   – field → app field mappings for the service CSV
 *   products   – field → app field mappings for the product CSV
 *   giftCards  – field → app field mappings for the gift card CSV
 *
 * Values are arrays of possible source column names (case-insensitive match).
 */

export type DataType = "clients" | "appointments" | "services" | "products" | "giftCards";

export interface FieldMapping {
  [appField: string]: string[];
}

export interface PlatformMapping {
  displayName: string;
  clients: FieldMapping;
  appointments: FieldMapping;
  services: FieldMapping;
  products: FieldMapping;
  giftCards: FieldMapping;
}

const GENERIC: PlatformMapping = {
  displayName: "Generic CSV",
  clients: {
    firstName:   ["first name", "firstname", "first_name", "given name", "given_name"],
    lastName:    ["last name", "lastname", "last_name", "surname", "family name"],
    fullName:    ["full name", "fullname", "name", "client name", "customer name", "contact name"],
    email:       ["email", "email address", "e-mail", "email_address"],
    phone:       ["phone", "mobile", "mobile phone", "cell", "phone number", "telephone", "phone_number"],
    dateOfBirth: ["date of birth", "dob", "birthday", "birth date", "birthdate"],
    notes:       ["notes", "comments", "remarks", "internal notes"],
    gender:      ["gender", "sex"],
    city:        ["city", "town"],
    state:       ["state", "province", "region"],
    postalCode:  ["postal code", "zip", "zip code", "postcode", "postal_code"],
    country:     ["country"],
    allergies:   ["allergies", "allergy", "allergens", "medical notes"],
  },
  appointments: {
    date:        ["date", "appointment date", "appt date", "start date", "start_date"],
    time:        ["time", "appointment time", "start time", "start_time"],
    duration:    ["duration", "length", "minutes", "duration (min)"],
    status:      ["status", "appointment status"],
    clientName:  ["client", "client name", "customer", "customer name"],
    clientEmail: ["client email", "customer email"],
    staffName:   ["staff", "staff name", "provider", "stylist", "technician"],
    serviceName: ["service", "service name", "treatment"],
    notes:       ["notes", "comments", "appointment notes"],
    price:       ["price", "amount", "total", "charge"],
  },
  services: {
    name:        ["name", "service name", "service", "treatment name"],
    description: ["description", "details", "notes"],
    duration:    ["duration", "length", "minutes", "duration (min)", "service duration"],
    price:       ["price", "amount", "cost", "rate"],
    category:    ["category", "type", "service type", "service category"],
  },
  products: {
    name:          ["name", "product name", "item", "item name"],
    brand:         ["brand", "manufacturer", "brand name"],
    price:         ["price", "retail price", "sell price", "sale price"],
    purchasePrice: ["purchase price", "cost", "cost price", "wholesale price"],
    stock:         ["stock", "quantity", "qty", "inventory", "on hand"],
    category:      ["category", "type", "product type"],
    upc:           ["upc", "barcode", "sku", "product code"],
  },
  giftCards: {
    code:           ["code", "gift card code", "card number", "gc code", "voucher code"],
    originalAmount: ["amount", "original amount", "value", "original value", "face value"],
    remainingBalance: ["balance", "remaining balance", "remaining", "current balance"],
    issuedToName:   ["name", "issued to", "recipient name", "customer name"],
    issuedToEmail:  ["email", "issued to email", "recipient email"],
    expiresAt:      ["expires", "expiry", "expiry date", "expiration date", "expires at"],
    notes:          ["notes", "comments"],
  },
};

const VAGARO: PlatformMapping = {
  displayName: "Vagaro",
  clients: {
    firstName:   ["First Name"],
    lastName:    ["Last Name"],
    email:       ["Email"],
    phone:       ["Cell Phone", "Home Phone", "Work Phone"],
    dateOfBirth: ["Date of Birth"],
    notes:       ["Notes"],
    gender:      ["Gender"],
    city:        ["City"],
    state:       ["State"],
    postalCode:  ["Zip Code"],
    allergies:   ["Allergies"],
  },
  appointments: {
    date:        ["Date", "Appointment Date"],
    time:        ["Start Time", "Time"],
    duration:    ["Duration"],
    status:      ["Status"],
    clientName:  ["Client Name", "Customer Name"],
    staffName:   ["Employee", "Provider"],
    serviceName: ["Service"],
    price:       ["Price", "Total"],
    notes:       ["Notes"],
  },
  services: {
    name:        ["Service Name", "Name"],
    description: ["Description"],
    duration:    ["Duration"],
    price:       ["Price"],
    category:    ["Category"],
  },
  products: {
    name:          ["Product Name", "Name"],
    brand:         ["Brand"],
    price:         ["Retail Price", "Price"],
    purchasePrice: ["Purchase Price", "Cost"],
    stock:         ["Qty On Hand", "Stock"],
    category:      ["Category"],
    upc:           ["Barcode", "UPC"],
  },
  giftCards: {
    code:            ["Gift Card Code", "Code"],
    originalAmount:  ["Original Amount", "Amount"],
    remainingBalance:["Balance", "Remaining Balance"],
    issuedToName:    ["Customer Name"],
    issuedToEmail:   ["Customer Email"],
    expiresAt:       ["Expiration Date"],
  },
};

const GLOSSGENIUS: PlatformMapping = {
  displayName: "GlossGenius",
  clients: {
    firstName:   ["First Name"],
    lastName:    ["Last Name"],
    email:       ["Email", "Email Address"],
    phone:       ["Phone", "Phone Number"],
    dateOfBirth: ["Birthday", "Date of Birth"],
    notes:       ["Notes", "Client Notes"],
    gender:      ["Preferred Pronouns", "Gender"],
    city:        ["City"],
    state:       ["State"],
    postalCode:  ["Zip"],
    allergies:   ["Allergies"],
  },
  appointments: {
    date:        ["Date", "Appointment Date"],
    time:        ["Start Time"],
    duration:    ["Duration (minutes)", "Duration"],
    status:      ["Status"],
    clientName:  ["Client", "Client Name"],
    clientEmail: ["Client Email"],
    staffName:   ["Provider", "Staff"],
    serviceName: ["Service", "Service Name"],
    price:       ["Total", "Price"],
    notes:       ["Notes"],
  },
  services: {
    name:        ["Service Name"],
    description: ["Description"],
    duration:    ["Duration (minutes)", "Duration"],
    price:       ["Price"],
    category:    ["Category"],
  },
  products: {
    name:          ["Name", "Product Name"],
    brand:         ["Brand"],
    price:         ["Price", "Retail Price"],
    purchasePrice: ["Cost"],
    stock:         ["Quantity", "Stock"],
    category:      ["Category"],
  },
  giftCards: {
    code:            ["Code"],
    originalAmount:  ["Amount"],
    remainingBalance:["Balance"],
    issuedToName:    ["Client Name"],
    expiresAt:       ["Expires"],
  },
};

const SQUARE: PlatformMapping = {
  displayName: "Square Appointments",
  clients: {
    fullName:    ["Customer Name", "Name"],
    firstName:   ["First Name"],
    lastName:    ["Last Name"],
    email:       ["Email", "Email Address"],
    phone:       ["Phone Number", "Phone"],
    dateOfBirth: ["Birthday"],
    notes:       ["Note", "Notes"],
    city:        ["City"],
    state:       ["State"],
    postalCode:  ["Zip Code", "Postal Code"],
  },
  appointments: {
    date:        ["Start Date", "Date"],
    time:        ["Start Time"],
    duration:    ["Duration"],
    status:      ["Status"],
    clientName:  ["Customer Name"],
    staffName:   ["Staff Name", "Team Member"],
    serviceName: ["Service Name", "Item Name"],
    price:       ["Gross Sales", "Total"],
    notes:       ["Note"],
  },
  services: {
    name:        ["Item Name", "Name"],
    description: ["Description"],
    duration:    ["Duration"],
    price:       ["Price"],
    category:    ["Category"],
  },
  products: {
    name:          ["Item Name", "Name"],
    brand:         ["Vendor Name", "Brand"],
    price:         ["Price"],
    purchasePrice: ["Cost Per Item", "Purchase Price"],
    stock:         ["On Hand", "Quantity"],
    category:      ["Category"],
    upc:           ["GTIN", "UPC"],
  },
  giftCards: {
    code:            ["ID", "Gift Card ID"],
    originalAmount:  ["Initial Balance"],
    remainingBalance:["Current Balance"],
    issuedToName:    ["Buyer", "Customer"],
  },
};

const MINDBODY: PlatformMapping = {
  displayName: "Mindbody",
  clients: {
    firstName:   ["First Name", "Client First Name"],
    lastName:    ["Last Name", "Client Last Name"],
    email:       ["Email"],
    phone:       ["Phone Number", "Home Phone", "Mobile Phone"],
    dateOfBirth: ["Birth Date", "Date of Birth"],
    notes:       ["Referred By", "Notes"],
    gender:      ["Gender"],
    city:        ["City"],
    state:       ["State"],
    postalCode:  ["Postal Code", "Zip Code"],
    allergies:   ["Liability Release Note"],
  },
  appointments: {
    date:        ["Start Date/Time", "Date"],
    time:        ["Start Time"],
    duration:    ["Duration"],
    status:      ["Status", "Appt Status"],
    clientName:  ["Client Name"],
    staffName:   ["Staff Name", "Provider"],
    serviceName: ["Session Type Name", "Service"],
    price:       ["Price", "Amount"],
    notes:       ["Notes"],
  },
  services: {
    name:        ["Name", "Session Type Name"],
    description: ["Description"],
    duration:    ["Duration"],
    price:       ["Price", "Online Price"],
    category:    ["Category"],
  },
  products: {
    name:          ["Product Name", "Name"],
    brand:         ["Brand"],
    price:         ["Retail Price"],
    purchasePrice: ["Wholesale Price"],
    stock:         ["Quantity On Hand"],
    category:      ["Category"],
    upc:           ["Barcode"],
  },
  giftCards: {
    code:            ["Serial Number", "Card Number"],
    originalAmount:  ["Original Balance", "Amount"],
    remainingBalance:["Remaining Balance"],
    issuedToName:    ["Client Name"],
  },
};

const FRESHA: PlatformMapping = {
  displayName: "Fresha",
  clients: {
    firstName:   ["First name", "First Name"],
    lastName:    ["Last name", "Last Name"],
    email:       ["Email"],
    phone:       ["Mobile", "Phone"],
    dateOfBirth: ["Date of birth", "Birthday"],
    notes:       ["Notes"],
    gender:      ["Gender"],
    city:        ["City"],
    state:       ["County", "State"],
    postalCode:  ["Postcode", "Zip"],
    allergies:   ["Allergies"],
  },
  appointments: {
    date:        ["Date"],
    time:        ["Start time", "Time"],
    duration:    ["Duration"],
    status:      ["Status"],
    clientName:  ["Client", "Client name"],
    staffName:   ["Staff", "Provider"],
    serviceName: ["Service"],
    price:       ["Price", "Total"],
    notes:       ["Notes"],
  },
  services: {
    name:        ["Service name", "Name"],
    description: ["Description"],
    duration:    ["Duration"],
    price:       ["Price"],
    category:    ["Category"],
  },
  products: {
    name:         ["Product name", "Name"],
    brand:        ["Brand"],
    price:        ["Retail price", "Price"],
    stock:        ["Stock"],
    category:     ["Category"],
  },
  giftCards: {
    code:            ["Voucher code", "Code"],
    originalAmount:  ["Value", "Amount"],
    remainingBalance:["Balance"],
    issuedToName:    ["Client name"],
  },
};

const BOOKSY: PlatformMapping = {
  displayName: "Booksy",
  clients: {
    firstName:   ["First Name"],
    lastName:    ["Last Name"],
    email:       ["Email"],
    phone:       ["Phone", "Phone Number"],
    dateOfBirth: ["Birthday", "Date of Birth"],
    notes:       ["Notes"],
    gender:      ["Gender"],
    city:        ["City"],
    state:       ["State"],
    postalCode:  ["Zip Code"],
  },
  appointments: {
    date:        ["Date", "Appointment Date"],
    time:        ["Time", "Start Time"],
    duration:    ["Duration"],
    status:      ["Status"],
    clientName:  ["Client", "Client Name"],
    staffName:   ["Professional", "Staff"],
    serviceName: ["Service"],
    price:       ["Price", "Total"],
    notes:       ["Notes"],
  },
  services: {
    name:        ["Name", "Service Name"],
    description: ["Description"],
    duration:    ["Duration"],
    price:       ["Price"],
    category:    ["Category"],
  },
  products: {
    name:        ["Name"],
    brand:       ["Brand"],
    price:       ["Price"],
    stock:       ["Stock"],
    category:    ["Category"],
  },
  giftCards: {
    code:            ["Code"],
    originalAmount:  ["Amount"],
    remainingBalance:["Balance"],
    issuedToName:    ["Client"],
  },
};

export const PLATFORM_MAPPINGS: Record<string, PlatformMapping> = {
  vagaro: VAGARO,
  glossgenius: GLOSSGENIUS,
  square: SQUARE,
  mindbody: MINDBODY,
  fresha: FRESHA,
  booksy: BOOKSY,
  csv: GENERIC,
  other: GENERIC,
};

/**
 * Resolve a platform mapping into a simple {sourceCol → appField} map
 * for a given data type. Checks exact (case-insensitive) match first,
 * then substring match.
 */
export function buildFieldMap(
  headers: string[],
  platform: string,
  dataType: DataType
): Record<string, string> {
  const mapping = PLATFORM_MAPPINGS[platform] ?? GENERIC;
  const fieldDefs = mapping[dataType] ?? {};
  const result: Record<string, string> = {};

  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    for (const [appField, patterns] of Object.entries(fieldDefs)) {
      if (patterns.some((p) => p.toLowerCase() === lower)) {
        result[header] = appField;
        break;
      }
    }
  }
  // Second pass: substring match for unmapped headers
  for (const header of headers) {
    if (result[header]) continue;
    const lower = header.toLowerCase().trim();
    for (const [appField, patterns] of Object.entries(fieldDefs)) {
      if (patterns.some((p) => lower.includes(p.toLowerCase()) || p.toLowerCase().includes(lower))) {
        result[header] = appField;
        break;
      }
    }
  }
  return result;
}
