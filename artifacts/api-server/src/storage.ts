import { 
  locations, services, serviceOptions, staff, appointments, products,
  clients, clientPhones, clientEmails,
  serviceCategories, addons, serviceAddons, appointmentAddons, staffServices, staffAvailability,
  calendarSettings, cashDrawerSessions, drawerActions, businessHours,
  businessDays, businessDayActions,
  smsSettings, smsLog, mailSettings,
  type Store, type InsertStore,
  type ServiceCategory, type InsertServiceCategory,
  type Service, type InsertService,
  type ServiceOption, type InsertServiceOption, type ServiceWithOptions,
  type Addon, type InsertAddon,
  type ServiceAddon, type InsertServiceAddon,
  type AppointmentAddon, type InsertAppointmentAddon,
  type Staff, type InsertStaff,
  type StaffService, type InsertStaffService,
  type StaffAvailability, type InsertStaffAvailability,
  type BusinessHours, type InsertBusinessHours,
  type CalendarSettings, type InsertCalendarSettings,
  type Customer, type InsertCustomer,
  type Appointment, type InsertAppointment, type AppointmentWithDetails,
  type Product, type InsertProduct,
  type CashDrawerSession, type InsertCashDrawerSession, type CashDrawerSessionWithActions,
  type DrawerAction, type InsertDrawerAction,
  type BusinessDay, type InsertBusinessDay, type BusinessDayWithActions,
  type BusinessDayAction, type InsertBusinessDayAction,
  type SmsSettings, type InsertSmsSettings,
  type SmsLogEntry, type InsertSmsLog,
  type MailSettings, type InsertMailSettings,
} from "@shared/schema";
import { users, type User, type UpsertUser } from "@shared/models/auth";
import { db } from "./db";
import { eq, and, gte, lte, inArray, desc, isNotNull, ne, isNull, sql } from "drizzle-orm";
import { toE164US, displayPhone as formatDisplayPhone } from "./lib/phoneUtils";
import { claimStaffColor } from "./lib/staffColorUtils";

export interface IStorage {
  getStores(userId?: string): Promise<Store[]>;
  getStore(id: number): Promise<Store | undefined>;
  getStoreBySlug(slug: string): Promise<Store | undefined>;
  createStore(store: InsertStore): Promise<Store>;
  updateStore(id: number, store: Partial<InsertStore>): Promise<Store | undefined>;

  getBusinessDays(storeId: number): Promise<BusinessDayWithActions[]>;
  getBusinessDay(id: number): Promise<BusinessDayWithActions | undefined>;
  getBusinessDayByDate(storeId: number, date: string): Promise<BusinessDayWithActions | undefined>;
  getLatestUnreconciledBusinessDay(storeId: number, beforeDate: string): Promise<BusinessDayWithActions | undefined>;
  createBusinessDay(day: InsertBusinessDay): Promise<BusinessDay>;
  updateBusinessDay(id: number, data: Partial<InsertBusinessDay>): Promise<BusinessDay | undefined>;
  createBusinessDayAction(action: InsertBusinessDayAction): Promise<BusinessDayAction>;
  getBusinessDayActions(businessDayId: number): Promise<BusinessDayAction[]>;

  getBusinessHours(storeId: number): Promise<BusinessHours[]>;
  setBusinessHours(storeId: number, hours: InsertBusinessHours[]): Promise<BusinessHours[]>;

  getServiceCategories(storeId?: number): Promise<ServiceCategory[]>;
  getServiceCategory(id: number): Promise<ServiceCategory | undefined>;
  createServiceCategory(cat: InsertServiceCategory): Promise<ServiceCategory>;
  updateServiceCategory(id: number, cat: Partial<InsertServiceCategory>): Promise<ServiceCategory | undefined>;
  deleteServiceCategory(id: number): Promise<void>;

  getServices(storeId?: number): Promise<ServiceWithOptions[]>;
  getService(id: number): Promise<ServiceWithOptions | undefined>;
  createService(service: InsertService): Promise<ServiceWithOptions>;
  updateService(id: number, service: Partial<InsertService>): Promise<ServiceWithOptions | undefined>;
  getServiceOptions(serviceId: number): Promise<ServiceOption[]>;
  createServiceOption(option: InsertServiceOption): Promise<ServiceOption>;
  updateServiceOption(id: number, option: Partial<InsertServiceOption>): Promise<ServiceOption | undefined>;
  deactivateServiceOption(id: number): Promise<void>;
  deleteService(id: number): Promise<void>;
  deactivateAllServices(storeId: number): Promise<Service[]>;

  getAddons(storeId?: number): Promise<Addon[]>;
  getAddon(id: number): Promise<Addon | undefined>;
  createAddon(addon: InsertAddon): Promise<Addon>;
  updateAddon(id: number, addon: Partial<InsertAddon>): Promise<Addon | undefined>;
  deleteAddon(id: number): Promise<void>;

  getServiceAddons(serviceId?: number): Promise<(ServiceAddon & { addon: Addon })[]>;
  getAllServiceAddonMappings(): Promise<ServiceAddon[]>;
  getAddonsForService(serviceId: number): Promise<Addon[]>;
  getServicesForAddon(addonId: number): Promise<ServiceAddon[]>;
  setAddonServices(addonId: number, serviceIds: number[]): Promise<void>;
  createServiceAddon(sa: InsertServiceAddon): Promise<ServiceAddon>;
  deleteServiceAddon(id: number): Promise<void>;

  getAppointmentAddons(appointmentId: number): Promise<(AppointmentAddon & { addon: Addon })[]>;
  setAppointmentAddons(appointmentId: number, addonIds: number[]): Promise<void>;

  getAllStaff(storeId?: number): Promise<Staff[]>;
  getStaffMember(id: number): Promise<Staff | undefined>;
  createStaff(staffMember: InsertStaff): Promise<Staff>;
  updateStaff(id: number, staffMember: Partial<InsertStaff>): Promise<Staff | undefined>;
  deleteStaff(id: number): Promise<void>;

  getStaffServices(staffId?: number, serviceId?: number): Promise<StaffService[]>;
  getStaffForService(serviceId: number): Promise<Staff[]>;
  setStaffServices(staffId: number, serviceIds: number[]): Promise<void>;

  getStaffAvailability(staffId: number): Promise<StaffAvailability[]>;
  setStaffAvailability(staffId: number, rules: InsertStaffAvailability[]): Promise<StaffAvailability[]>;
  deleteStaffAvailabilityRule(id: number): Promise<void>;

  getCustomers(storeId?: number): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  searchCustomerByPhone(phone: string, storeId: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer | undefined>;
  deleteCustomer(id: number): Promise<void>;

  getAppointments(filters?: { from?: Date; to?: Date; staffId?: number; storeId?: number; customerId?: number }): Promise<AppointmentWithDetails[]>;
  getAppointmentsByCustomerPhone(phoneDigits: string, storeId?: number): Promise<AppointmentWithDetails[]>;
  getAppointment(id: number): Promise<AppointmentWithDetails | undefined>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: number, appointment: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  deleteAppointment(id: number): Promise<void>;

  getProducts(storeId?: number): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<void>;

  getCalendarSettings(storeId: number): Promise<CalendarSettings | undefined>;
  upsertCalendarSettings(storeId: number, settings: Partial<InsertCalendarSettings>): Promise<CalendarSettings>;

  getCashDrawerSessions(storeId: number): Promise<CashDrawerSessionWithActions[]>;
  getCashDrawerSession(id: number): Promise<CashDrawerSessionWithActions | undefined>;
  getOpenCashDrawerSession(storeId: number): Promise<CashDrawerSessionWithActions | undefined>;
  createCashDrawerSession(session: InsertCashDrawerSession): Promise<CashDrawerSession>;
  updateCashDrawerSession(id: number, data: Partial<InsertCashDrawerSession>): Promise<CashDrawerSession | undefined>;
  createDrawerAction(action: InsertDrawerAction): Promise<DrawerAction>;
  getDrawerActions(sessionId: number): Promise<DrawerAction[]>;

  getSmsSettings(storeId: number): Promise<SmsSettings | undefined>;
  upsertSmsSettings(storeId: number, settings: Partial<InsertSmsSettings>): Promise<SmsSettings>;
  createSmsLog(log: InsertSmsLog): Promise<SmsLogEntry>;
  getSmsLogs(storeId: number, limit?: number): Promise<SmsLogEntry[]>;
  getAppointmentsNeedingReminders(fromTime: Date, toTime: Date): Promise<AppointmentWithDetails[]>;
  getRecentlyCompletedAppointments(fromTime: Date, toTime: Date): Promise<AppointmentWithDetails[]>;
  getSmsLogByAppointmentAndType(appointmentId: number, messageType: string): Promise<SmsLogEntry | undefined>;

  getMailSettings(storeId: number): Promise<MailSettings | undefined>;
  upsertMailSettings(storeId: number, settings: Partial<InsertMailSettings>): Promise<MailSettings>;

  // User Auth
  getUser(id: string): Promise<User | undefined>;
  findUserByEmail(email: string): Promise<User | undefined>;
  findUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, user: Partial<UpsertUser>): Promise<User | undefined>;
}

export class DatabaseStorage implements IStorage {
  // Stores
  async getStores(userId?: string): Promise<Store[]> {
    if (userId) {
      return await db.select().from(locations).where(eq(locations.userId, userId));
    }
    return await db.select().from(locations);
  }
  async getStore(id: number): Promise<Store | undefined> {
    const [store] = await db.select().from(locations).where(eq(locations.id, id));
    return store;
  }
  async getStoreBySlug(slug: string): Promise<Store | undefined> {
    const [store] = await db.select().from(locations).where(eq(locations.bookingSlug, slug));
    return store;
  }
  async createStore(insertStore: InsertStore): Promise<Store> {
    const [store] = await db.insert(locations).values(insertStore).returning();
    return store;
  }
  async updateStore(id: number, data: Partial<InsertStore>): Promise<Store | undefined> {
    const [store] = await db.update(locations).set(data).where(eq(locations.id, id)).returning();
    return store;
  }

  async getBusinessHours(storeId: number): Promise<BusinessHours[]> {
    return await db.select().from(businessHours).where(eq(businessHours.storeId, storeId));
  }
  async setBusinessHours(storeId: number, hours: InsertBusinessHours[]): Promise<BusinessHours[]> {
    await db.delete(businessHours).where(eq(businessHours.storeId, storeId));
    if (hours.length === 0) return [];
    const result = await db.insert(businessHours).values(hours).returning();
    return result;
  }

  // Service Categories
  async getServiceCategories(storeId?: number): Promise<ServiceCategory[]> {
    if (!storeId) return [];
    return await db.select().from(serviceCategories)
      .where(eq(serviceCategories.storeId, storeId))
      .orderBy(serviceCategories.sortOrder, serviceCategories.name);
  }
  async getServiceCategory(id: number): Promise<ServiceCategory | undefined> {
    const [category] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, id));
    return category;
  }
  async createServiceCategory(cat: InsertServiceCategory): Promise<ServiceCategory> {
    const [result] = await db.insert(serviceCategories).values(cat).returning();
    return result;
  }
  async updateServiceCategory(id: number, cat: Partial<InsertServiceCategory>): Promise<ServiceCategory | undefined> {
    const [result] = await db.update(serviceCategories).set(cat).where(eq(serviceCategories.id, id)).returning();
    return result;
  }
  async deleteServiceCategory(id: number): Promise<void> {
    // Unlink services from this category first
    // This allows us to hard delete the category without violating FK constraints
    await db.update(services)
      .set({ categoryId: null, category: "Uncategorized" })
      .where(eq(services.categoryId, id));
    
    await db.delete(serviceCategories).where(eq(serviceCategories.id, id));
  }

  // Services — returns with embedded options array
  private async _attachOptions(svcs: Service[]): Promise<ServiceWithOptions[]> {
    if (svcs.length === 0) return [];
    const ids = svcs.map(s => s.id);
    const opts = await db.select().from(serviceOptions)
      .where(and(inArray(serviceOptions.serviceId, ids), eq(serviceOptions.isActive, true)));
    const byId = new Map<number, ServiceOption[]>();
    for (const o of opts) {
      const arr = byId.get(o.serviceId) ?? [];
      arr.push(o);
      byId.set(o.serviceId, arr);
    }
    return svcs.map(s => ({ ...s, options: (byId.get(s.id) ?? []).sort((a, b) => a.displayOrder - b.displayOrder) }));
  }

  async getServices(storeId?: number): Promise<ServiceWithOptions[]> {
    if (!storeId) return [];
    const svcs = await db.select().from(services).where(eq(services.storeId, storeId));
    return this._attachOptions(svcs);
  }
  async getService(id: number): Promise<ServiceWithOptions | undefined> {
    const [service] = await db.select().from(services).where(eq(services.id, id));
    if (!service) return undefined;
    const [withOpts] = await this._attachOptions([service]);
    return withOpts;
  }
  async createService(insertService: InsertService): Promise<ServiceWithOptions> {
    const [service] = await db.insert(services).values(insertService).returning();
    return { ...service, options: [] };
  }
  async updateService(id: number, updateData: Partial<InsertService>): Promise<ServiceWithOptions | undefined> {
    const [service] = await db.update(services).set(updateData).where(eq(services.id, id)).returning();
    if (!service) return undefined;
    const [withOpts] = await this._attachOptions([service]);
    return withOpts;
  }
  async deactivateService(id: number): Promise<void> {
    await db.update(services).set({ isActive: false }).where(eq(services.id, id));
  }
  async deleteService(id: number): Promise<void> {
    await this.deactivateService(id);
  }
  async deactivateAllServices(storeId: number): Promise<Service[]> {
    return await db.update(services)
      .set({ isActive: false })
      .where(and(eq(services.storeId, storeId), eq(services.isActive, true)))
      .returning();
  }

  // Service Options
  async getServiceOptions(serviceId: number): Promise<ServiceOption[]> {
    return await db.select().from(serviceOptions)
      .where(and(eq(serviceOptions.serviceId, serviceId), eq(serviceOptions.isActive, true)));
  }
  async createServiceOption(option: InsertServiceOption): Promise<ServiceOption> {
    const [opt] = await db.insert(serviceOptions).values(option).returning();
    await this._syncServiceFromOptions(option.serviceId);
    return opt;
  }
  async updateServiceOption(id: number, option: Partial<InsertServiceOption>): Promise<ServiceOption | undefined> {
    const [opt] = await db.update(serviceOptions).set({ ...option, updatedAt: new Date() }).where(eq(serviceOptions.id, id)).returning();
    if (opt) await this._syncServiceFromOptions(opt.serviceId);
    return opt;
  }
  async deactivateServiceOption(id: number): Promise<void> {
    const [opt] = await db.update(serviceOptions).set({ isActive: false, updatedAt: new Date() }).where(eq(serviceOptions.id, id)).returning();
    if (opt) await this._syncServiceFromOptions(opt.serviceId);
  }
  /** Keep services.price and services.duration in sync with lowest-price active option */
  private async _syncServiceFromOptions(serviceId: number): Promise<void> {
    const opts = await db.select().from(serviceOptions)
      .where(and(eq(serviceOptions.serviceId, serviceId), eq(serviceOptions.isActive, true)));
    if (opts.length === 0) return;
    const minPrice = Math.min(...opts.map(o => Number(o.price)));
    const minDuration = Math.min(...opts.map(o => o.durationMinutes));
    await db.update(services).set({ price: String(minPrice), duration: minDuration }).where(eq(services.id, serviceId));
  }

  // Addons
  async getAddons(storeId?: number): Promise<Addon[]> {
    if (!storeId) return [];
    return await db.select().from(addons).where(eq(addons.storeId, storeId));
  }
  async getAddon(id: number): Promise<Addon | undefined> {
    const [addon] = await db.select().from(addons).where(eq(addons.id, id));
    return addon;
  }
  async createAddon(insertAddon: InsertAddon): Promise<Addon> {
    const [addon] = await db.insert(addons).values(insertAddon).returning();
    return addon;
  }
  async updateAddon(id: number, updateData: Partial<InsertAddon>): Promise<Addon | undefined> {
    const [addon] = await db.update(addons).set(updateData).where(eq(addons.id, id)).returning();
    return addon;
  }
  async deactivateAddon(id: number): Promise<void> {
    await db.update(addons).set({ isActive: false }).where(eq(addons.id, id));
  }

  async deleteAddon(id: number): Promise<void> {
    await this.deactivateAddon(id);
  }

  // Service Addons
  async getServiceAddons(serviceId?: number): Promise<(ServiceAddon & { addon: Addon })[]> {
    const result = await db.query.serviceAddons.findMany({
      where: serviceId ? eq(serviceAddons.serviceId, serviceId) : undefined,
      with: { addon: true },
    });
    return result as any;
  }
  async getAllServiceAddonMappings(): Promise<ServiceAddon[]> {
    return await db.select().from(serviceAddons);
  }
  async getAddonsForService(serviceId: number): Promise<Addon[]> {
    const result = await db.query.serviceAddons.findMany({
      where: eq(serviceAddons.serviceId, serviceId),
      with: { addon: true },
    });
    return result.map((sa: any) => sa.addon);
  }
  async getServicesForAddon(addonId: number): Promise<ServiceAddon[]> {
    return await db.select().from(serviceAddons).where(eq(serviceAddons.addonId, addonId));
  }
  async setAddonServices(addonId: number, serviceIds: number[]): Promise<void> {
    await db.delete(serviceAddons).where(eq(serviceAddons.addonId, addonId));
    if (serviceIds.length > 0) {
      await db.insert(serviceAddons).values(
        serviceIds.map(serviceId => ({ serviceId, addonId }))
      );
    }
  }
  async createServiceAddon(sa: InsertServiceAddon): Promise<ServiceAddon> {
    const [result] = await db.insert(serviceAddons).values(sa).returning();
    return result;
  }
  async deleteServiceAddon(id: number): Promise<void> {
    await db.delete(serviceAddons).where(eq(serviceAddons.id, id));
  }

  // Appointment Addons
  async getAppointmentAddons(appointmentId: number): Promise<(AppointmentAddon & { addon: Addon })[]> {
    const result = await db.query.appointmentAddons.findMany({
      where: eq(appointmentAddons.appointmentId, appointmentId),
      with: { addon: true },
    });
    return result as any;
  }
  async setAppointmentAddons(appointmentId: number, addonIds: number[]): Promise<void> {
    await db.delete(appointmentAddons).where(eq(appointmentAddons.appointmentId, appointmentId));
    if (addonIds.length > 0) {
      await db.insert(appointmentAddons).values(
        addonIds.map(addonId => ({ appointmentId, addonId }))
      );
    }
  }

  // Staff
  async getAllStaff(storeId?: number): Promise<Staff[]> {
    if (!storeId) return [];
    return await db.select().from(staff).where(
      and(eq(staff.storeId, storeId), ne(staff.status, "removed"))
    );
  }
  async getStaffMember(id: number): Promise<Staff | undefined> {
    const [staffMember] = await db.select().from(staff).where(eq(staff.id, id));
    return staffMember;
  }
  async createStaff(insertStaff: InsertStaff): Promise<Staff> {
    // Enforce 1-color-per-staff before inserting.
    if (insertStaff.color && insertStaff.storeId) {
      await claimStaffColor(insertStaff.storeId, -1, insertStaff.color);
    }
    const [staffMember] = await db.insert(staff).values(insertStaff).returning();
    return staffMember;
  }
  async updateStaff(id: number, updateData: Partial<InsertStaff>): Promise<Staff | undefined> {
    // Enforce 1-color-per-staff: resolve storeId from the existing row if not supplied.
    if (updateData.color) {
      const storeId = updateData.storeId ?? (await db.select({ storeId: staff.storeId }).from(staff).where(eq(staff.id, id)))[0]?.storeId;
      if (storeId) await claimStaffColor(storeId, id, updateData.color);
    }
    const [staffMember] = await db.update(staff).set(updateData).where(eq(staff.id, id)).returning();
    return staffMember;
  }
  async deleteStaff(id: number): Promise<void> {
    await db.delete(staffServices).where(eq(staffServices.staffId, id));
    await db.delete(staff).where(eq(staff.id, id));
  }

  // Staff Services
  async getStaffServices(staffId?: number, serviceId?: number): Promise<StaffService[]> {
    const conditions = [];
    if (staffId) conditions.push(eq(staffServices.staffId, staffId));
    if (serviceId) conditions.push(eq(staffServices.serviceId, serviceId));
    return await db.select().from(staffServices).where(
      conditions.length > 0 ? and(...conditions) : undefined
    );
  }

  async getStaffForService(serviceId: number): Promise<Staff[]> {
    const result = await db.query.staffServices.findMany({
      where: eq(staffServices.serviceId, serviceId),
      with: { staff: true },
    });
    // Exclude removed/deactivated staff so they never appear in booking availability
    return result
      .map((ss: any) => ss.staff)
      .filter((s: any) => s && s.status !== "removed" && s.status !== "deactivated");
  }

  async setStaffServices(staffId: number, serviceIds: number[]): Promise<void> {
    await db.delete(staffServices).where(eq(staffServices.staffId, staffId));
    if (serviceIds.length > 0) {
      await db.insert(staffServices).values(
        serviceIds.map(serviceId => ({ staffId, serviceId }))
      );
    }
  }

  // Staff Availability
  async getStaffAvailability(staffId: number): Promise<StaffAvailability[]> {
    return await db.select().from(staffAvailability).where(eq(staffAvailability.staffId, staffId));
  }

  async setStaffAvailability(staffId: number, rules: InsertStaffAvailability[]): Promise<StaffAvailability[]> {
    await db.delete(staffAvailability).where(eq(staffAvailability.staffId, staffId));
    if (rules.length > 0) {
      const result = await db.insert(staffAvailability).values(
        rules.map(r => ({ ...r, staffId }))
      ).returning();
      return result;
    }
    return [];
  }

  async deleteStaffAvailabilityRule(id: number): Promise<void> {
    await db.delete(staffAvailability).where(eq(staffAvailability.id, id));
  }

  // Customers — backed by the clients table (clients is the single source of truth)
  private _clientToCustomer(row: any): Customer {
    return {
      id: row.id,
      name: row.name ?? row.fullName ?? "",
      email: row.email ?? null,
      phone: row.phone ?? null,
      birthday: row.birthday ?? row.dateOfBirth ?? null,
      allergies: row.allergies ?? null,
      marketingOptIn: row.marketingOptIn ?? true,
      loyaltyPoints: Number(row.loyaltyPoints ?? 0),
      storeId: row.storeId ?? null,
    } as Customer;
  }

  async getCustomers(storeId?: number): Promise<Customer[]> {
    if (!storeId) return [];
    const rows = await db
      .select({
        id: clients.id,
        name: clients.fullName,
        storeId: clients.storeId,
        birthday: clients.dateOfBirth,
        allergies: clients.allergies,
        loyaltyPoints: clients.loyaltyPoints,
        phone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        email: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        marketingOptIn: sql<boolean>`COALESCE((SELECT sms_marketing_opt_in FROM client_marketing_preferences WHERE client_id = clients.id LIMIT 1), true)`,
      })
      .from(clients)
      .where(and(eq(clients.storeId, storeId), isNull(clients.archivedAt)));
    return rows.map(r => this._clientToCustomer(r));
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    const [row] = await db
      .select({
        id: clients.id,
        name: clients.fullName,
        storeId: clients.storeId,
        birthday: clients.dateOfBirth,
        allergies: clients.allergies,
        loyaltyPoints: clients.loyaltyPoints,
        phone: sql<string>`(SELECT display_phone FROM client_phones WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        email: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        marketingOptIn: sql<boolean>`COALESCE((SELECT sms_marketing_opt_in FROM client_marketing_preferences WHERE client_id = clients.id LIMIT 1), true)`,
      })
      .from(clients)
      .where(eq(clients.id, id));
    return row ? this._clientToCustomer(row) : undefined;
  }

  async searchCustomerByPhone(phone: string, storeId: number): Promise<Customer | undefined> {
    const digits = phone.replace(/\D/g, "").slice(-10);
    if (!digits) return undefined;
    const [row] = await db
      .select({
        id: clients.id,
        name: clients.fullName,
        storeId: clients.storeId,
        birthday: clients.dateOfBirth,
        allergies: clients.allergies,
        loyaltyPoints: clients.loyaltyPoints,
        phone: clientPhones.displayPhone,
        email: sql<string>`(SELECT email_address FROM client_emails WHERE client_id = clients.id AND is_primary = true LIMIT 1)`,
        marketingOptIn: sql<boolean>`COALESCE((SELECT sms_marketing_opt_in FROM client_marketing_preferences WHERE client_id = clients.id LIMIT 1), true)`,
      })
      .from(clientPhones)
      .innerJoin(clients, and(eq(clientPhones.clientId, clients.id), eq(clients.storeId, storeId), isNull(clients.archivedAt)))
      .where(sql`right(regexp_replace(${clientPhones.phoneNumberE164}, '[^0-9]', '', 'g'), 10) = ${digits}`)
      .limit(1);
    return row ? this._clientToCustomer(row) : undefined;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const { name, email, phone, storeId, notes, birthday, allergies, marketingOptIn, loyaltyPoints } = insertCustomer as any;

    // Enforce phone uniqueness per store before inserting
    if (phone && storeId) {
      const existing = await this.searchCustomerByPhone(phone, storeId);
      if (existing) {
        const err: any = new Error("A customer with this phone number already exists.");
        err.code = "PHONE_DUPLICATE";
        throw err;
      }
    }

    const parts = (name ?? "").trim().split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ");
    const fullName = name ?? "";
    const [newClient] = await db
      .insert(clients)
      .values({
        storeId: storeId!,
        firstName,
        lastName,
        fullName,
        dateOfBirth: birthday ?? null,
        allergies: allergies ?? null,
        notes: notes ?? null,
        loyaltyPoints: loyaltyPoints ?? 0,
        clientStatus: "active",
        source: "pos",
      })
      .returning();
    if (phone) {
      const e164 = toE164US(phone) ?? phone;
      await db.insert(clientPhones).values({
        clientId: newClient.id,
        phoneNumberE164: e164,
        displayPhone: formatDisplayPhone(e164) || phone,
        phoneType: "mobile",
        smsOptIn: true,
        isPrimary: true,
        storeId: storeId ?? null,
      } as any).onConflictDoNothing();
    }
    if (email) {
      await db.insert(clientEmails).values({
        clientId: newClient.id,
        emailAddress: email.toLowerCase().trim(),
        isPrimary: true,
        verified: false,
        marketingOptIn: marketingOptIn ?? true,
      }).onConflictDoNothing();
    }
    return this._clientToCustomer({ id: newClient.id, name: fullName, email: email ?? null, phone: phone ?? null, notes, birthday, allergies, marketingOptIn, loyaltyPoints: loyaltyPoints ?? 0, storeId });
  }

  async updateCustomer(id: number, updateData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const updates: any = {};
    if (updateData.name !== undefined) {
      const parts = (updateData.name ?? "").trim().split(/\s+/);
      updates.firstName = parts[0] ?? "";
      updates.lastName = parts.slice(1).join(" ");
      updates.fullName = updateData.name;
    }
    if (updateData.allergies !== undefined) updates.allergies = updateData.allergies;
    if ((updateData as any).birthday !== undefined) updates.dateOfBirth = (updateData as any).birthday;
    if (updateData.loyaltyPoints !== undefined) updates.loyaltyPoints = updateData.loyaltyPoints;
    if (Object.keys(updates).length > 0) {
      await db.update(clients).set({ ...updates, updatedAt: new Date() }).where(eq(clients.id, id));
    }
    if (updateData.phone) {
      const e164 = toE164US(updateData.phone);
      if (e164) {
        const display = formatDisplayPhone(e164) || updateData.phone;
        await db.insert(clientPhones).values({ clientId: id, phoneNumberE164: e164, displayPhone: display, phoneType: "mobile", smsOptIn: true, isPrimary: true }).onConflictDoNothing();
      }
    }
    if (updateData.email) {
      await db.insert(clientEmails).values({ clientId: id, emailAddress: updateData.email.toLowerCase().trim(), isPrimary: true, verified: false, marketingOptIn: true }).onConflictDoNothing();
    }
    return this.getCustomer(id);
  }

  async deleteCustomer(id: number): Promise<void> {
    await db.update(clients).set({ archivedAt: new Date() }).where(eq(clients.id, id));
  }

  // Appointments
  async getAppointments(filters?: { from?: Date; to?: Date; staffId?: number; storeId?: number; customerId?: number }): Promise<AppointmentWithDetails[]> {
    const conditions = [];
    if (filters?.from) conditions.push(gte(appointments.date, filters.from));
    if (filters?.to) conditions.push(lte(appointments.date, filters.to));
    if (filters?.staffId) conditions.push(eq(appointments.staffId, filters.staffId));
    if (filters?.storeId) conditions.push(eq(appointments.storeId, filters.storeId));
    if (filters?.customerId) conditions.push(eq(appointments.customerId, filters.customerId));

    const result = await db.query.appointments.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      with: {
        service: true,
        staff: true,
        customer: true,
        store: true,
        appointmentAddons: {
          with: { addon: true },
        },
      },
      orderBy: (appointments, { asc }) => [asc(appointments.date)],
    });
    
    return result as any;
  }

  async getAppointment(id: number): Promise<AppointmentWithDetails | undefined> {
    const result = await db.query.appointments.findFirst({
      where: eq(appointments.id, id),
      with: {
        service: true,
        staff: true,
        customer: true,
        store: true,
        appointmentAddons: {
          with: { addon: true },
        },
      },
    });
    return result as any;
  }

  async createAppointment(insertAppointment: InsertAppointment): Promise<Appointment> {
    const [appointment] = await db.insert(appointments).values(insertAppointment).returning();
    return appointment;
  }

  async getAppointmentsByCustomerPhone(phoneDigits: string, storeId?: number): Promise<AppointmentWithDetails[]> {
    const digits = phoneDigits.replace(/\D/g, "").slice(-10);
    if (!digits) return [];

    const phoneRows = storeId
      ? await db
          .select({ clientId: clientPhones.clientId })
          .from(clientPhones)
          .innerJoin(clients, and(eq(clientPhones.clientId, clients.id), eq(clients.storeId, storeId), isNull(clients.archivedAt)))
          .where(sql`right(regexp_replace(${clientPhones.phoneNumberE164}, '[^0-9]', '', 'g'), 10) = ${digits}`)
      : await db
          .select({ clientId: clientPhones.clientId })
          .from(clientPhones)
          .where(sql`right(regexp_replace(${clientPhones.phoneNumberE164}, '[^0-9]', '', 'g'), 10) = ${digits}`);

    const clientIds = phoneRows.map(r => r.clientId).filter(Boolean) as number[];
    if (clientIds.length === 0) return [];

    const where = storeId
      ? and(inArray(appointments.customerId, clientIds), eq(appointments.storeId, storeId))
      : inArray(appointments.customerId, clientIds);

    const result = await db.query.appointments.findMany({
      where,
      with: {
        service: true,
        staff: true,
        customer: true,
        store: true,
        appointmentAddons: {
          with: { addon: true },
        },
      },
      orderBy: (appointments, { desc }) => [desc(appointments.date)],
    });

    return result as AppointmentWithDetails[];
  }

  async updateAppointment(id: number, updateData: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [appointment] = await db.update(appointments).set(updateData).where(eq(appointments.id, id)).returning();
    return appointment;
  }

  async deleteAppointment(id: number): Promise<void> {
    await db.delete(appointmentAddons).where(eq(appointmentAddons.appointmentId, id));
    await db.delete(appointments).where(eq(appointments.id, id));
  }

  // Products
  async getProducts(storeId?: number): Promise<Product[]> {
    if (!storeId) return [];
    return await db.select().from(products).where(eq(products.storeId, storeId));
  }
  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }
  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db.insert(products).values(insertProduct).returning();
    return product;
  }
  async updateProduct(id: number, updateData: Partial<InsertProduct>): Promise<Product | undefined> {
    const [product] = await db.update(products).set(updateData).where(eq(products.id, id)).returning();
    return product;
  }
  async deleteProduct(id: number): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  // Calendar Settings
  async getCalendarSettings(storeId: number): Promise<CalendarSettings | undefined> {
    const [settings] = await db.select().from(calendarSettings).where(eq(calendarSettings.storeId, storeId));
    return settings;
  }

  async upsertCalendarSettings(storeId: number, settings: Partial<InsertCalendarSettings>): Promise<CalendarSettings> {
    const existing = await this.getCalendarSettings(storeId);
    if (existing) {
      const [updated] = await db.update(calendarSettings).set(settings).where(eq(calendarSettings.id, existing.id)).returning();
      return updated;
    } else {
      const [created] = await db.insert(calendarSettings).values({ ...settings, storeId }).returning();
      return created;
    }
  }

  // Cash Drawer Sessions
  async getCashDrawerSessions(storeId: number): Promise<CashDrawerSessionWithActions[]> {
    const result = await db.query.cashDrawerSessions.findMany({
      where: eq(cashDrawerSessions.storeId, storeId),
      with: { actions: true },
      orderBy: (sessions, { desc }) => [desc(sessions.openedAt)],
    });
    return result as any;
  }

  async getCashDrawerSession(id: number): Promise<CashDrawerSessionWithActions | undefined> {
    const result = await db.query.cashDrawerSessions.findFirst({
      where: eq(cashDrawerSessions.id, id),
      with: { actions: true },
    });
    return result as any;
  }

  async getOpenCashDrawerSession(storeId: number): Promise<CashDrawerSessionWithActions | undefined> {
    const result = await db.query.cashDrawerSessions.findFirst({
      where: and(eq(cashDrawerSessions.storeId, storeId), eq(cashDrawerSessions.status, "open")),
      with: { actions: true },
    });
    return result as any;
  }

  async createCashDrawerSession(session: InsertCashDrawerSession): Promise<CashDrawerSession> {
    const [result] = await db.insert(cashDrawerSessions).values(session).returning();
    return result;
  }

  async updateCashDrawerSession(id: number, data: Partial<InsertCashDrawerSession>): Promise<CashDrawerSession | undefined> {
    const [result] = await db.update(cashDrawerSessions).set(data).where(eq(cashDrawerSessions.id, id)).returning();
    return result;
  }

  async createDrawerAction(action: InsertDrawerAction): Promise<DrawerAction> {
    const [result] = await db.insert(drawerActions).values(action).returning();
    return result;
  }

  async getDrawerActions(sessionId: number): Promise<DrawerAction[]> {
    return await db.select().from(drawerActions).where(eq(drawerActions.sessionId, sessionId));
  }

  // Business Days (timezone-aware cash reconciliation state machine)
  async getBusinessDays(storeId: number): Promise<BusinessDayWithActions[]> {
    const result = await db.query.businessDays.findMany({
      where: eq(businessDays.storeId, storeId),
      with: { actions: true },
      orderBy: (days, { desc }) => [desc(days.date)],
    });
    return result as any;
  }

  async getBusinessDay(id: number): Promise<BusinessDayWithActions | undefined> {
    const result = await db.query.businessDays.findFirst({
      where: eq(businessDays.id, id),
      with: { actions: true },
    });
    return result as any;
  }

  async getBusinessDayByDate(storeId: number, date: string): Promise<BusinessDayWithActions | undefined> {
    const result = await db.query.businessDays.findFirst({
      where: and(eq(businessDays.storeId, storeId), eq(businessDays.date, date)),
      with: { actions: true },
    });
    return result as any;
  }

  async getLatestUnreconciledBusinessDay(storeId: number, beforeDate: string): Promise<BusinessDayWithActions | undefined> {
    const result = await db.query.businessDays.findFirst({
      where: and(
        eq(businessDays.storeId, storeId),
        sql`${businessDays.date} < ${beforeDate}`,
        ne(businessDays.status, "reconciled"),
      ),
      with: { actions: true },
      orderBy: (days, { desc }) => [desc(days.date)],
    });
    return result as any;
  }

  async createBusinessDay(day: InsertBusinessDay): Promise<BusinessDay> {
    const [result] = await db.insert(businessDays).values(day).returning();
    return result;
  }

  async updateBusinessDay(id: number, data: Partial<InsertBusinessDay>): Promise<BusinessDay | undefined> {
    const [result] = await db.update(businessDays).set(data).where(eq(businessDays.id, id)).returning();
    return result;
  }

  async createBusinessDayAction(action: InsertBusinessDayAction): Promise<BusinessDayAction> {
    const [result] = await db.insert(businessDayActions).values(action).returning();
    return result;
  }

  async getBusinessDayActions(businessDayId: number): Promise<BusinessDayAction[]> {
    return await db.select().from(businessDayActions).where(eq(businessDayActions.businessDayId, businessDayId));
  }

  async getSmsSettings(storeId: number): Promise<SmsSettings | undefined> {
    const result = await db.select().from(smsSettings).where(eq(smsSettings.storeId, storeId));
    return result[0];
  }

  async upsertSmsSettings(storeId: number, settings: Partial<InsertSmsSettings>): Promise<SmsSettings> {
    const existing = await this.getSmsSettings(storeId);
    if (existing) {
      const [result] = await db.update(smsSettings).set(settings).where(eq(smsSettings.storeId, storeId)).returning();
      return result;
    }
    const [result] = await db.insert(smsSettings).values({ ...settings, storeId }).returning();
    return result;
  }

  async getMailSettings(storeId: number): Promise<MailSettings | undefined> {
    const result = await db.select().from(mailSettings).where(eq(mailSettings.storeId, storeId));
    return result[0];
  }

  async upsertMailSettings(storeId: number, settings: Partial<InsertMailSettings>): Promise<MailSettings> {
    const existing = await this.getMailSettings(storeId);
    if (existing) {
      const [result] = await db.update(mailSettings).set(settings).where(eq(mailSettings.storeId, storeId)).returning();
      return result;
    }
    const [result] = await db.insert(mailSettings).values({ ...settings, storeId }).returning();
    return result;
  }

  async createSmsLog(log: InsertSmsLog): Promise<SmsLogEntry> {
    const [result] = await db.insert(smsLog).values(log).returning();
    return result;
  }

  async getSmsLogs(storeId: number, limit = 50): Promise<SmsLogEntry[]> {
    return await db.select().from(smsLog)
      .where(eq(smsLog.storeId, storeId))
      .orderBy(desc(smsLog.sentAt))
      .limit(limit);
  }

  async getAppointmentsNeedingReminders(fromTime: Date, toTime: Date): Promise<AppointmentWithDetails[]> {
    const result = await db.query.appointments.findMany({
      where: and(
        gte(appointments.date, fromTime),
        lte(appointments.date, toTime),
      ),
      with: {
        service: true,
        staff: true,
        customer: true,
        store: true,
      },
    });
    const activeStatuses = ["pending", "confirmed"];
    return (result as AppointmentWithDetails[]).filter(a => activeStatuses.includes(a.status || ""));
  }

  async getRecentlyCompletedAppointments(fromTime: Date, toTime: Date): Promise<AppointmentWithDetails[]> {
    const result = await db.query.appointments.findMany({
      where: and(
        isNotNull(appointments.completedAt),
        gte(appointments.completedAt, fromTime),
        lte(appointments.completedAt, toTime),
        eq(appointments.status, "completed")
      ),
      with: {
        service: true,
        staff: true,
        customer: true,
        store: true,
      },
    });
    return result as AppointmentWithDetails[];
  }

  async getSmsLogByAppointmentAndType(appointmentId: number, messageType: string): Promise<SmsLogEntry | undefined> {
    const result = await db.select().from(smsLog)
      .where(and(
        eq(smsLog.appointmentId, appointmentId),
        eq(smsLog.messageType, messageType)
      ));
    return result[0];
  }

  // User Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async findUserByGoogleId(googleId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user;
  }

  async createUser(user: UpsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: string, user: Partial<UpsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(user).where(eq(users.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
