import { pgTable, index, varchar, jsonb, timestamp, unique, boolean, integer, foreignKey, serial, text, numeric, uniqueIndex, bigint, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const sessions = pgTable("sessions", {
        sid: varchar().primaryKey().notNull(),
        sess: jsonb().notNull(),
        expire: timestamp({ mode: 'string' }).notNull(),
}, (table) => [
        index("IDX_session_expire").using("btree", table.expire.asc().nullsLast().op("timestamp_ops")),
]);

export const users = pgTable("users", {
        id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
        email: varchar().notNull(),
        password: varchar().notNull(),
        googleId: varchar("google_id"),
        firstName: varchar("first_name"),
        lastName: varchar("last_name"),
        profileImageUrl: varchar("profile_image_url"),
        role: varchar().default('owner'),
        isAdmin: boolean("is_admin").default(false).notNull(),
        staffId: integer("staff_id"),
        permissions: jsonb(),
        onboardingCompleted: boolean("onboarding_completed").default(false),
        passwordChanged: boolean("password_changed").default(false),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
        subscriptionStatus: varchar("subscription_status", { length: 20 }).default('active'),
        trialStartedAt: timestamp("trial_started_at", { mode: 'string' }),
        trialEndsAt: timestamp("trial_ends_at", { mode: 'string' }),
        accountType: varchar("account_type", { length: 32 }),
}, (table) => [
        unique("users_email_key").on(table.email),
]);

export const locations = pgTable("locations", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        timezone: text().default('UTC').notNull(),
        address: text(),
        phone: text(),
        email: text(),
        category: text(),
        city: text(),
        state: text(),
        postcode: text(),
        bookingSlug: text("booking_slug"),
        bookingTheme: text("booking_theme").default('simple'),
        commissionPayoutFrequency: text("commission_payout_frequency").default('monthly'),
        smsTokens: integer("sms_tokens").default(0).notNull(),
        smsAllowance: integer("sms_allowance").default(0).notNull(),
        smsCredits: integer("sms_credits").default(0).notNull(),
        smsCreditsTotalPurchased: integer("sms_credits_total_purchased").default(0).notNull(),
        userId: text("user_id"),
        accountStatus: text("account_status").default('Active'),
        storeLatitude: text("store_latitude"),
        storeLongitude: text("store_longitude"),
        yelpAlias: text("yelp_alias"),
        facebookPageId: text("facebook_page_id"),
        lateGracePeriodMinutes: integer("late_grace_period_minutes").default(10).notNull(),
        cancellationHoursCutoff: integer("cancellation_hours_cutoff").default(24).notNull(),
        posEnabled: boolean("pos_enabled").default(true).notNull(),
        weeklyDigestOptOut: boolean("weekly_digest_opt_out").default(false).notNull(),
        parkingOptions: jsonb("parking_options").default([]),
        accessibilityFeatures: jsonb("accessibility_features").default([]),
        beverageOptions: jsonb("beverage_options"),
        platformCredits: numeric("platform_credits", { precision: 10, scale:  2 }).default('0.00').notNull(),
        salesTaxRate: numeric("sales_tax_rate", { precision: 5, scale:  4 }).default('0.0000').notNull(),
        stripeCustomerId: text("stripe_customer_id"),
        taxServicesTaxable: boolean("tax_services_taxable").default(false).notNull(),
        taxAddonsTaxable: boolean("tax_addons_taxable").default(false).notNull(),
        taxProductsTaxable: boolean("tax_products_taxable").default(true).notNull(),
        taxGiftCardsTaxable: boolean("tax_gift_cards_taxable").default(false).notNull(),
        registerTargetFloat: numeric("register_target_float", { precision: 10, scale: 2 }),
        autoRefillEnabled: boolean("auto_refill_enabled").default(false).notNull(),
        autoRefillThreshold: numeric("auto_refill_threshold", { precision: 10, scale: 2 }).default('5.00').notNull(),
        autoRefillAmount: numeric("auto_refill_amount", { precision: 10, scale: 2 }).default('25.00').notNull(),
}, (table) => [
        index("idx_locations_stripe_customer_id").using("btree", table.stripeCustomerId.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [users.id],
                        name: "locations_user_id_fkey"
                }),
        unique("locations_booking_slug_key").on(table.bookingSlug),
]);

export const businessHours = pgTable("business_hours", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        dayOfWeek: integer("day_of_week").notNull(),
        openTime: text("open_time").default('09:00').notNull(),
        closeTime: text("close_time").default('17:00').notNull(),
        isClosed: boolean("is_closed").default(false).notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "business_hours_store_id_fkey"
                }),
]);

export const onboardingProgress = pgTable("onboarding_progress", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        flowKey: varchar("flow_key", { length: 64 }).notNull(),
        status: varchar("status", { length: 20 }).default('not_started').notNull(),
        state: jsonb("state").default({}).notNull(),
        startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
        completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
        skippedAt: timestamp("skipped_at", { withTimezone: true, mode: 'string' }),
        createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        unique("onboarding_progress_store_id_flow_key_key").on(table.storeId, table.flowKey),
]);

export const serviceCategories = pgTable("service_categories", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        imageUrl: text("image_url"),
        storeId: integer("store_id"),
        sortOrder: integer("sort_order").default(0),
}, (table) => [
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "service_categories_store_id_fkey"
                }),
]);

export const services = pgTable("services", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        description: text(),
        duration: integer().notNull(),
        price: numeric({ precision: 10, scale:  2 }).notNull(),
        category: text().notNull(),
        categoryId: integer("category_id"),
        imageUrl: text("image_url"),
        storeId: integer("store_id"),
        depositRequired: boolean("deposit_required").default(false),
        depositAmount: numeric("deposit_amount", { precision: 10, scale:  2 }),
        illustrationCategoryId: integer("illustration_category_id"),
        customIllustrationUrl: text("custom_illustration_url"),
        autoAssigned: boolean("auto_assigned").default(false),
        isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.categoryId],
                        foreignColumns: [serviceCategories.id],
                        name: "services_category_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "services_store_id_fkey"
                }),
]);

export const addons = pgTable("addons", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        description: text(),
        price: numeric({ precision: 10, scale:  2 }).notNull(),
        duration: integer().notNull(),
        imageUrl: text("image_url"),
        storeId: integer("store_id"),
        type: text().default('full'),
        parentAddonId: integer("parent_addon_id"),
        isStackable: boolean("is_stackable").default(true).notNull(),
        isActive: boolean("is_active").default(true).notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "addons_store_id_fkey"
                }),
]);

export const staff = pgTable("staff", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        email: text(),
        phone: text(),
        role: text().default('stylist'),
        bio: text(),
        color: text().default('#3b82f6'),
        avatarUrl: text("avatar_url"),
        commissionEnabled: boolean("commission_enabled").default(false),
        commissionRate: numeric("commission_rate", { precision: 5, scale:  2 }).default('0'),
        storeId: integer("store_id"),
        password: text(),
        permissions: jsonb(),
        status: text().default('active'),
        employmentType: text("employment_type").default('stylist'),
        inviteToken: text("invite_token"),
        inviteExpiresAt: timestamp("invite_expires_at", { mode: 'string' }),
        invitedAt: timestamp("invited_at", { mode: 'string' }),
        joinedAt: timestamp("joined_at", { mode: 'string' }),
        removedAt: timestamp("removed_at", { mode: 'string' }),
        invitedByUserId: text("invited_by_user_id"),
        mailingAddress1: text("mailing_address1"),
        mailingAddress2: text("mailing_address2"),
        mailingCity: text("mailing_city"),
        mailingState: text("mailing_state"),
        mailingZip: text("mailing_zip"),
        mailingCountry: text("mailing_country"),
        showOnCalendar: boolean("show_on_calendar").default(true).notNull(),
        avatarThumbUrl: text("avatar_thumb_url"),
        commissionStructureId: integer("commission_structure_id"),
}, (table) => [
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "staff_store_id_fkey"
                }),
]);

export const customers = pgTable("customers", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        email: text(),
        phone: text(),
        notes: text(),
        birthday: text(),
        allergies: text(),
        marketingOptIn: boolean("marketing_opt_in").default(true),
        loyaltyPoints: integer("loyalty_points").default(0),
        storeId: integer("store_id"),
}, (table) => [
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "customers_store_id_fkey"
                }),
]);

export const appointments = pgTable("appointments", {
        id: serial().primaryKey().notNull(),
        date: timestamp({ mode: 'string' }).notNull(),
        duration: integer().notNull(),
        status: text().default('pending'),
        notes: text(),
        cancellationReason: text("cancellation_reason"),
        paymentMethod: text("payment_method"),
        tipAmount: numeric("tip_amount", { precision: 10, scale:  2 }),
        discountAmount: numeric("discount_amount", { precision: 10, scale:  2 }),
        totalPaid: numeric("total_paid", { precision: 10, scale:  2 }),
        startedAt: timestamp("started_at", { mode: 'string' }),
        completedAt: timestamp("completed_at", { mode: 'string' }),
        serviceId: integer("service_id"),
        staffId: integer("staff_id"),
        customerId: integer("customer_id"),
        storeId: integer("store_id"),
        recurrenceRule: text("recurrence_rule"),
        recurrenceParentId: integer("recurrence_parent_id"),
        depositRequired: boolean("deposit_required").default(false),
        depositAmount: numeric("deposit_amount", { precision: 10, scale:  2 }),
        depositPaid: boolean("deposit_paid").default(false),
        giftCardId: integer("gift_card_id"),
        giftCardAmount: numeric("gift_card_amount", { precision: 10, scale:  2 }),
        loyaltyPointsEarned: integer("loyalty_points_earned").default(0),
        loyaltyPointsRedeemed: integer("loyalty_points_redeemed").default(0),
        clientRequestedStaff: boolean("client_requested_staff").default(false).notNull(),
        calendarHidden: boolean("calendar_hidden").default(false).notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        checkedInAt: timestamp("checked_in_at", { mode: 'string' }),
}, (table) => [
        foreignKey({
                        columns: [table.customerId],
                        foreignColumns: [customers.id],
                        name: "appointments_customer_id_fkey"
                }),
        foreignKey({
                        columns: [table.serviceId],
                        foreignColumns: [services.id],
                        name: "appointments_service_id_fkey"
                }),
        foreignKey({
                        columns: [table.staffId],
                        foreignColumns: [staff.id],
                        name: "appointments_staff_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "appointments_store_id_fkey"
                }),
]);

export const serviceAddons = pgTable("service_addons", {
        id: serial().primaryKey().notNull(),
        serviceId: integer("service_id").notNull(),
        addonId: integer("addon_id").notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.addonId],
                        foreignColumns: [addons.id],
                        name: "service_addons_addon_id_fkey"
                }),
        foreignKey({
                        columns: [table.serviceId],
                        foreignColumns: [services.id],
                        name: "service_addons_service_id_fkey"
                }),
]);

export const appointmentAddons = pgTable("appointment_addons", {
        id: serial().primaryKey().notNull(),
        appointmentId: integer("appointment_id").notNull(),
        addonId: integer("addon_id").notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.addonId],
                        foreignColumns: [addons.id],
                        name: "appointment_addons_addon_id_fkey"
                }),
        foreignKey({
                        columns: [table.appointmentId],
                        foreignColumns: [appointments.id],
                        name: "appointment_addons_appointment_id_fkey"
                }),
]);

export const staffServices = pgTable("staff_services", {
        id: serial().primaryKey().notNull(),
        staffId: integer("staff_id").notNull(),
        serviceId: integer("service_id").notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.serviceId],
                        foreignColumns: [services.id],
                        name: "staff_services_service_id_fkey"
                }),
        foreignKey({
                        columns: [table.staffId],
                        foreignColumns: [staff.id],
                        name: "staff_services_staff_id_fkey"
                }),
]);

export const staffAvailability = pgTable("staff_availability", {
        id: serial().primaryKey().notNull(),
        staffId: integer("staff_id").notNull(),
        dayOfWeek: integer("day_of_week").notNull(),
        startTime: text("start_time").notNull(),
        endTime: text("end_time").notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.staffId],
                        foreignColumns: [staff.id],
                        name: "staff_availability_staff_id_fkey"
                }),
]);

export const products = pgTable("products", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        brand: text(),
        price: numeric({ precision: 10, scale:  2 }).notNull(),
        purchasePrice: numeric("purchase_price", { precision: 10, scale:  2 }),
        stock: integer().default(0),
        lowStockThreshold: integer("low_stock_threshold").default(5),
        category: text(),
        upc: text(),
        storeId: integer("store_id"),
}, (table) => [
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "products_store_id_fkey"
                }),
]);

export const cashDrawerSessions = pgTable("cash_drawer_sessions", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        openedAt: timestamp("opened_at", { mode: 'string' }).notNull(),
        closedAt: timestamp("closed_at", { mode: 'string' }),
        openingBalance: numeric("opening_balance", { precision: 10, scale:  2 }).default('0.00').notNull(),
        closingBalance: numeric("closing_balance", { precision: 10, scale:  2 }),
        denominationBreakdown: text("denomination_breakdown"),
        openingDenominationBreakdown: text("opening_denomination_breakdown"),
        reportedCardSales: numeric("reported_card_sales", { precision: 10, scale:  2 }),
        priorClosingMismatch: boolean("prior_closing_mismatch").default(false).notNull(),
        priorClosingVariance: numeric("prior_closing_variance", { precision: 10, scale:  2 }),
        priorClosingResolvedBy: text("prior_closing_resolved_by"),
        priorClosingResolvedAt: timestamp("prior_closing_resolved_at", { mode: 'string' }),
        priorClosingResolutionNotes: text("prior_closing_resolution_notes"),
        status: text().default('open').notNull(),
        openedBy: text("opened_by"),
        closedBy: text("closed_by"),
        notes: text(),
}, (table) => [
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "cash_drawer_sessions_store_id_fkey"
                }),
]);

export const drawerActions = pgTable("drawer_actions", {
        id: serial().primaryKey().notNull(),
        sessionId: integer("session_id").notNull(),
        type: text().notNull(),
        amount: numeric({ precision: 10, scale:  2 }),
        reason: text(),
        performedBy: text("performed_by"),
        performedAt: timestamp("performed_at", { mode: 'string' }).notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.sessionId],
                        foreignColumns: [cashDrawerSessions.id],
                        name: "drawer_actions_session_id_fkey"
                }),
]);

export const calendarSettings = pgTable("calendar_settings", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        startOfWeek: text("start_of_week").default('monday').notNull(),
        timeSlotInterval: integer("time_slot_interval").default(15).notNull(),
        nonWorkingHoursDisplay: integer("non_working_hours_display").default(1).notNull(),
        allowBookingOutsideHours: boolean("allow_booking_outside_hours").default(true).notNull(),
        autoCompleteAppointments: boolean("auto_complete_appointments").default(true).notNull(),
        autoMarkNoShows: boolean("auto_mark_no_shows").default(false).notNull(),
        showPrices: boolean("show_prices").default(true).notNull(),
        walkInsEnabled: boolean("walk_ins_enabled").default(true).notNull(),
        language: text("language").default('en').notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "calendar_settings_store_id_fkey"
                }),
]);

export const smsSettings = pgTable("sms_settings", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        twilioAccountSid: text("twilio_account_sid"),
        twilioAuthToken: text("twilio_auth_token"),
        twilioPhoneNumber: text("twilio_phone_number"),
        bookingConfirmationEnabled: boolean("booking_confirmation_enabled").default(false).notNull(),
        reminderEnabled: boolean("reminder_enabled").default(false).notNull(),
        reminderHoursBefore: integer("reminder_hours_before").default(24).notNull(),
        reviewRequestEnabled: boolean("review_request_enabled").default(false).notNull(),
        googleReviewUrl: text("google_review_url"),
        confirmationTemplate: text("confirmation_template"),
        reminderTemplate: text("reminder_template"),
        reviewTemplate: text("review_template"),
        autoEngageEnabled: boolean("auto_engage_enabled").default(true).notNull(),
        smsCancellationEnabled: boolean("sms_cancellation_enabled").default(true).notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "sms_settings_store_id_fkey"
                }),
]);

export const smsLog = pgTable("sms_log", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        appointmentId: integer("appointment_id"),
        customerId: integer("customer_id"),
        phone: text().notNull(),
        messageType: text("message_type").notNull(),
        messageBody: text("message_body").notNull(),
        status: text().default('pending').notNull(),
        twilioSid: text("twilio_sid"),
        errorMessage: text("error_message"),
        sentAt: timestamp("sent_at", { mode: 'string' }).notNull(),
        smsSource: text("sms_source"),
        costEstimate: numeric("cost_estimate", { precision: 10, scale:  4 }).default('0.0100'),
}, (table) => [
        foreignKey({
                        columns: [table.appointmentId],
                        foreignColumns: [appointments.id],
                        name: "sms_log_appointment_id_fkey"
                }),
        foreignKey({
                        columns: [table.customerId],
                        foreignColumns: [customers.id],
                        name: "sms_log_customer_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "sms_log_store_id_fkey"
                }),
]);

export const mailSettings = pgTable("mail_settings", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        mailgunApiKey: text("mailgun_api_key"),
        mailgunDomain: text("mailgun_domain"),
        senderEmail: text("sender_email"),
        bookingConfirmationEnabled: boolean("booking_confirmation_enabled").default(false).notNull(),
        reminderEnabled: boolean("reminder_enabled").default(false).notNull(),
        reminderHoursBefore: integer("reminder_hours_before").default(24).notNull(),
        reviewRequestEnabled: boolean("review_request_enabled").default(false).notNull(),
        googleReviewUrl: text("google_review_url"),
        confirmationTemplate: text("confirmation_template"),
        reminderTemplate: text("reminder_template"),
        reviewTemplate: text("review_template"),
}, (table) => [
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "mail_settings_store_id_fkey"
                }),
]);

export const stripeSettings = pgTable("stripe_settings", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        publishableKey: text("publishable_key"),
        secretKey: text("secret_key"),
        testMagstripeEnabled: boolean("test_magstripe_enabled").default(true).notNull(),
}, (table) => [
        uniqueIndex("stripe_settings_store_id_uidx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "stripe_settings_store_id_fkey"
                }),
]);

export const permissions = pgTable("permissions", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        slug: text().notNull(),
        description: text(),
        storeId: integer("store_id").notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("permissions_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "permissions_store_id_fkey"
                }),
        unique("permissions_slug_key").on(table.slug),
]);

export const roles = pgTable("roles", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        description: text(),
        storeId: integer("store_id").notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("roles_name_store_idx").using("btree", table.name.asc().nullsLast().op("int4_ops"), table.storeId.asc().nullsLast().op("int4_ops")),
        index("roles_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "roles_store_id_fkey"
                }),
]);

export const app = pgTable("app", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        appName: text("app_name").notNull(),
        active: boolean().default(false),
        activeDate: timestamp("active_date", { mode: 'string' }),
        userPin: text("user_pin"),
        permissions: integer(),
}, (table) => [
        index("app_store_app_unique_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops"), table.appName.asc().nullsLast().op("int4_ops")),
        index("app_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "app_store_id_fkey"
                }),
]);

export const staffSettings = pgTable("staff_settings", {
        id: serial().primaryKey().notNull(),
        staffId: integer("staff_id").notNull(),
        storeId: integer("store_id").notNull(),
        preferences: text().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        uniqueIndex("staff_settings_staff_id_uidx").using("btree", table.staffId.asc().nullsLast().op("int4_ops")),
        index("staff_settings_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.staffId],
                        foreignColumns: [staff.id],
                        name: "staff_settings_staff_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "staff_settings_store_id_fkey"
                }),
]);

export const storeSettings = pgTable("store_settings", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        preferences: text().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        uniqueIndex("store_settings_store_id_uidx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "store_settings_store_id_fkey"
                }),
]);

export const googleBusinessProfiles = pgTable("google_business_profiles", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        googleAccountEmail: text("google_account_email"),
        businessName: text("business_name"),
        businessAccountId: text("business_account_id"),
        businessAccountResourceName: text("business_account_resource_name"),
        locationId: text("location_id"),
        locationResourceName: text("location_resource_name"),
        locationAddress: text("location_address"),
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        tokenExpiresAt: timestamp("token_expires_at", { mode: 'string' }),
        isConnected: boolean("is_connected").default(false),
        syncEnabled: boolean("sync_enabled").default(true),
        lastSyncedAt: timestamp("last_synced_at", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("google_business_profiles_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        uniqueIndex("google_business_profiles_store_id_uidx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "google_business_profiles_store_id_fkey"
                }),
]);

export const googleBusinessAccounts = pgTable("google_business_accounts", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        userId: varchar("user_id").notNull(),
        googleAccountId: text("google_account_id").notNull(),
        accountName: text("account_name"),
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        tokenExpiry: timestamp("token_expiry", { mode: 'string' }),
        scopes: text(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("gba_google_account_id_idx").using("btree", table.googleAccountId.asc().nullsLast().op("text_ops")),
        index("gba_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        index("gba_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "google_business_accounts_store_id_fkey"
                }),
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [users.id],
                        name: "google_business_accounts_user_id_fkey"
                }),
]);

export const googleBusinessLocations = pgTable("google_business_locations", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        userId: varchar("user_id").notNull(),
        businessAccountId: integer("business_account_id").notNull(),
        locationResourceName: text("location_resource_name").notNull(),
        locationId: text("location_id").notNull(),
        locationName: text("location_name"),
        address: text(),
        phone: text(),
        isSelected: boolean("is_selected").default(false),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("gbl_business_account_id_idx").using("btree", table.businessAccountId.asc().nullsLast().op("int4_ops")),
        uniqueIndex("gbl_location_resource_name_uidx").using("btree", table.locationResourceName.asc().nullsLast().op("text_ops")),
        index("gbl_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        index("gbl_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.businessAccountId],
                        foreignColumns: [googleBusinessAccounts.id],
                        name: "google_business_locations_business_account_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "google_business_locations_store_id_fkey"
                }),
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [users.id],
                        name: "google_business_locations_user_id_fkey"
                }),
]);

export const googleBusinessSyncLogs = pgTable("google_business_sync_logs", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id"),
        userId: varchar("user_id"),
        locationId: integer("location_id"),
        syncType: text("sync_type").notNull(),
        status: text().notNull(),
        errorMessage: text("error_message"),
        reviewsSynced: integer("reviews_synced"),
        syncedAt: timestamp("synced_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("gbsl_location_id_idx").using("btree", table.locationId.asc().nullsLast().op("int4_ops")),
        index("gbsl_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        index("gbsl_synced_at_idx").using("btree", table.syncedAt.asc().nullsLast().op("timestamp_ops")),
        foreignKey({
                        columns: [table.locationId],
                        foreignColumns: [googleBusinessLocations.id],
                        name: "google_business_sync_logs_location_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "google_business_sync_logs_store_id_fkey"
                }),
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [users.id],
                        name: "google_business_sync_logs_user_id_fkey"
                }),
]);

export const googleReviews = pgTable("google_reviews", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        googleReviewId: text("google_review_id").notNull(),
        googleLocationId: text("google_location_id"),
        gbLocationId: integer("gb_location_id"),
        customerName: text("customer_name"),
        customerPhoneNumber: text("customer_phone_number"),
        rating: integer().notNull(),
        reviewText: text("review_text"),
        reviewImageUrls: text("review_image_urls"),
        reviewCreateTime: timestamp("review_create_time", { mode: 'string' }),
        reviewUpdateTime: timestamp("review_update_time", { mode: 'string' }),
        reviewerLanguageCode: text("reviewer_language_code"),
        reviewPublishingStatus: text("review_publishing_status").default('published'),
        responseStatus: text("response_status").default('not_responded'),
        appointmentId: integer("appointment_id"),
        customerId: integer("customer_id"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("google_reviews_google_review_id_idx").using("btree", table.googleReviewId.asc().nullsLast().op("text_ops")),
        index("google_reviews_rating_idx").using("btree", table.rating.asc().nullsLast().op("int4_ops")),
        index("google_reviews_response_status_idx").using("btree", table.responseStatus.asc().nullsLast().op("text_ops")),
        index("google_reviews_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.appointmentId],
                        foreignColumns: [appointments.id],
                        name: "google_reviews_appointment_id_fkey"
                }),
        foreignKey({
                        columns: [table.customerId],
                        foreignColumns: [customers.id],
                        name: "google_reviews_customer_id_fkey"
                }),
        foreignKey({
                        columns: [table.gbLocationId],
                        foreignColumns: [googleBusinessLocations.id],
                        name: "google_reviews_gb_location_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "google_reviews_store_id_fkey"
                }),
        unique("google_reviews_google_review_id_key").on(table.googleReviewId),
]);

export const googleReviewResponses = pgTable("google_review_responses", {
        id: serial().primaryKey().notNull(),
        googleReviewId: integer("google_review_id").notNull(),
        storeId: integer("store_id").notNull(),
        responseText: text("response_text").notNull(),
        responseStatus: text("response_status").notNull(),
        staffId: integer("staff_id"),
        createdBy: text("created_by"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("google_review_responses_google_review_id_idx").using("btree", table.googleReviewId.asc().nullsLast().op("int4_ops")),
        index("google_review_responses_response_status_idx").using("btree", table.responseStatus.asc().nullsLast().op("text_ops")),
        index("google_review_responses_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.createdBy],
                        foreignColumns: [users.id],
                        name: "google_review_responses_created_by_fkey"
                }),
        foreignKey({
                        columns: [table.googleReviewId],
                        foreignColumns: [googleReviews.id],
                        name: "google_review_responses_google_review_id_fkey"
                }),
        foreignKey({
                        columns: [table.staffId],
                        foreignColumns: [staff.id],
                        name: "google_review_responses_staff_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "google_review_responses_store_id_fkey"
                }),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
        id: serial().primaryKey().notNull(),
        userId: text("user_id").notNull(),
        token: text().notNull(),
        expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
        usedAt: timestamp("used_at", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [users.id],
                        name: "password_reset_tokens_user_id_fkey"
                }).onDelete("cascade"),
        unique("password_reset_tokens_token_key").on(table.token),
]);

export const waitlist = pgTable("waitlist", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        serviceId: integer("service_id"),
        staffId: integer("staff_id"),
        customerId: integer("customer_id"),
        customerName: text("customer_name").notNull(),
        customerPhone: text("customer_phone"),
        customerEmail: text("customer_email"),
        preferredDate: timestamp("preferred_date", { mode: 'string' }),
        preferredTimeStart: text("preferred_time_start"),
        preferredTimeEnd: text("preferred_time_end"),
        notes: text(),
        partySize: integer("party_size").default(1),
        status: text().default('waiting'),
        notifiedAt: timestamp("notified_at", { mode: 'string' }),
        calledAt: timestamp("called_at", { mode: 'string' }),
        completedAt: timestamp("completed_at", { mode: 'string' }),
        customerLatitude: text("customer_latitude"),
        customerLongitude: text("customer_longitude"),
        smsSentAt: timestamp("sms_sent_at", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.customerId],
                        foreignColumns: [customers.id],
                        name: "waitlist_customer_id_fkey"
                }),
        foreignKey({
                        columns: [table.serviceId],
                        foreignColumns: [services.id],
                        name: "waitlist_service_id_fkey"
                }),
        foreignKey({
                        columns: [table.staffId],
                        foreignColumns: [staff.id],
                        name: "waitlist_staff_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "waitlist_store_id_fkey"
                }),
]);

export const giftCards = pgTable("gift_cards", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        code: text().notNull(),
        originalAmount: numeric("original_amount", { precision: 10, scale:  2 }).notNull(),
        remainingBalance: numeric("remaining_balance", { precision: 10, scale:  2 }).notNull(),
        issuedToName: text("issued_to_name"),
        issuedToEmail: text("issued_to_email"),
        purchasedByCustomerId: integer("purchased_by_customer_id"),
        recipientCustomerId: integer("recipient_customer_id"),
        isActive: boolean("is_active").default(true),
        expiresAt: timestamp("expires_at", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        notes: text(),
}, (table) => [
        foreignKey({
                        columns: [table.purchasedByCustomerId],
                        foreignColumns: [customers.id],
                        name: "gift_cards_purchased_by_customer_id_fkey"
                }),
        foreignKey({
                        columns: [table.recipientCustomerId],
                        foreignColumns: [customers.id],
                        name: "gift_cards_recipient_customer_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "gift_cards_store_id_fkey"
                }),
        unique("gift_cards_code_key").on(table.code),
]);

export const giftCardTransactions = pgTable("gift_card_transactions", {
        id: serial().primaryKey().notNull(),
        giftCardId: integer("gift_card_id").notNull(),
        storeId: integer("store_id").notNull(),
        appointmentId: integer("appointment_id"),
        amount: numeric({ precision: 10, scale:  2 }).notNull(),
        type: text().notNull(),
        balanceAfter: numeric("balance_after", { precision: 10, scale:  2 }).notNull(),
        notes: text(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.appointmentId],
                        foreignColumns: [appointments.id],
                        name: "gift_card_transactions_appointment_id_fkey"
                }),
        foreignKey({
                        columns: [table.giftCardId],
                        foreignColumns: [giftCards.id],
                        name: "gift_card_transactions_gift_card_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "gift_card_transactions_store_id_fkey"
                }),
]);

export const intakeForms = pgTable("intake_forms", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        name: text().notNull(),
        description: text(),
        isActive: boolean("is_active").default(true),
        requireBeforeBooking: boolean("require_before_booking").default(false),
        serviceId: integer("service_id"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.serviceId],
                        foreignColumns: [services.id],
                        name: "intake_forms_service_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "intake_forms_store_id_fkey"
                }),
]);

export const intakeFormFields = pgTable("intake_form_fields", {
        id: serial().primaryKey().notNull(),
        formId: integer("form_id").notNull(),
        label: text().notNull(),
        fieldType: text("field_type").notNull(),
        options: text(),
        required: boolean().default(false),
        sortOrder: integer("sort_order").default(0),
}, (table) => [
        foreignKey({
                        columns: [table.formId],
                        foreignColumns: [intakeForms.id],
                        name: "intake_form_fields_form_id_fkey"
                }),
]);

export const intakeFormResponses = pgTable("intake_form_responses", {
        id: serial().primaryKey().notNull(),
        formId: integer("form_id").notNull(),
        storeId: integer("store_id").notNull(),
        customerId: integer("customer_id"),
        appointmentId: integer("appointment_id"),
        customerName: text("customer_name"),
        responses: text().notNull(),
        submittedAt: timestamp("submitted_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.appointmentId],
                        foreignColumns: [appointments.id],
                        name: "intake_form_responses_appointment_id_fkey"
                }),
        foreignKey({
                        columns: [table.customerId],
                        foreignColumns: [customers.id],
                        name: "intake_form_responses_customer_id_fkey"
                }),
        foreignKey({
                        columns: [table.formId],
                        foreignColumns: [intakeForms.id],
                        name: "intake_form_responses_form_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "intake_form_responses_store_id_fkey"
                }),
]);

export const loyaltyTransactions = pgTable("loyalty_transactions", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        customerId: integer("customer_id").notNull(),
        appointmentId: integer("appointment_id"),
        type: text().notNull(),
        points: integer().notNull(),
        description: text(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.appointmentId],
                        foreignColumns: [appointments.id],
                        name: "loyalty_transactions_appointment_id_fkey"
                }),
        foreignKey({
                        columns: [table.customerId],
                        foreignColumns: [customers.id],
                        name: "loyalty_transactions_customer_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "loyalty_transactions_store_id_fkey"
                }),
]);

export const smsOptOuts = pgTable("sms_opt_outs", {
        id: serial().primaryKey().notNull(),
        phone: text().notNull(),
        optedOutAt: timestamp("opted_out_at", { mode: 'string' }).defaultNow(),
        optedBackInAt: timestamp("opted_back_in_at", { mode: 'string' }),
        isOptedOut: boolean("is_opted_out").default(true).notNull(),
}, (table) => [
        unique("sms_opt_outs_phone_key").on(table.phone),
]);

export const reviews = pgTable("reviews", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        customerId: integer("customer_id"),
        appointmentId: integer("appointment_id"),
        staffId: integer("staff_id"),
        rating: integer().notNull(),
        comment: text(),
        customerName: text("customer_name"),
        serviceName: text("service_name"),
        staffName: text("staff_name"),
        isPublic: boolean("is_public").default(true).notNull(),
        isFeatured: boolean("is_featured").default(false).notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.appointmentId],
                        foreignColumns: [appointments.id],
                        name: "reviews_appointment_id_fkey"
                }),
        foreignKey({
                        columns: [table.customerId],
                        foreignColumns: [customers.id],
                        name: "reviews_customer_id_fkey"
                }),
        foreignKey({
                        columns: [table.staffId],
                        foreignColumns: [staff.id],
                        name: "reviews_staff_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "reviews_store_id_fkey"
                }),
]);

export const proCrews = pgTable("pro_crews", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        name: text().notNull(),
        color: text().default('#00D4AA').notNull(),
        active: boolean().default(true).notNull(),
        notes: text(),
        phone: text(),
        pinHash: text("pin_hash"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "pro_crews_store_id_fkey"
                }),
]);

export const proCrewLocations = pgTable("pro_crew_locations", {
        id: serial().primaryKey().notNull(),
        crewId: integer("crew_id").notNull(),
        lat: numeric({ precision: 10, scale:  7 }).notNull(),
        lng: numeric({ precision: 10, scale:  7 }).notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.crewId],
                        foreignColumns: [proCrews.id],
                        name: "pro_crew_locations_crew_id_fkey"
                }),
]);

export const proServiceOrders = pgTable("pro_service_orders", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        orderNumber: text("order_number").notNull(),
        status: text().default('new').notNull(),
        priority: text().default('normal').notNull(),
        serviceType: text("service_type").notNull(),
        customerName: text("customer_name").notNull(),
        customerPhone: text("customer_phone"),
        customerEmail: text("customer_email"),
        address: text().notNull(),
        city: text(),
        state: text(),
        zip: text(),
        lat: numeric({ precision: 10, scale:  7 }),
        lng: numeric({ precision: 10, scale:  7 }),
        description: text(),
        crewId: integer("crew_id"),
        scheduledAt: timestamp("scheduled_at", { mode: 'string' }),
        startedAt: timestamp("started_at", { mode: 'string' }),
        completedAt: timestamp("completed_at", { mode: 'string' }),
        estimatedHours: numeric("estimated_hours", { precision: 4, scale:  1 }),
        overtimeFlagged: boolean("overtime_flagged").default(false),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.crewId],
                        foreignColumns: [proCrews.id],
                        name: "pro_service_orders_crew_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "pro_service_orders_store_id_fkey"
                }),
]);

export const proOrderNotes = pgTable("pro_order_notes", {
        id: serial().primaryKey().notNull(),
        orderId: integer("order_id").notNull(),
        storeId: integer("store_id").notNull(),
        note: text().notNull(),
        authorName: text("author_name"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.orderId],
                        foreignColumns: [proServiceOrders.id],
                        name: "pro_order_notes_order_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "pro_order_notes_store_id_fkey"
                }),
]);

export const proCustomers = pgTable("pro_customers", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        name: text().notNull(),
        phone: text(),
        email: text(),
        address: text(),
        city: text(),
        state: text(),
        zip: text(),
        propertyType: text("property_type").default('residential'),
        notes: text(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "pro_customers_store_id_fkey"
                }),
]);

export const proEstimates = pgTable("pro_estimates", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        estimateNumber: text("estimate_number").notNull(),
        status: text().default('draft').notNull(),
        customerId: integer("customer_id"),
        customerName: text("customer_name").notNull(),
        customerPhone: text("customer_phone"),
        customerEmail: text("customer_email"),
        address: text(),
        city: text(),
        state: text(),
        zip: text(),
        serviceType: text("service_type"),
        description: text(),
        lineItems: text("line_items"),
        subtotal: numeric({ precision: 10, scale:  2 }).default('0'),
        tax: numeric({ precision: 10, scale:  2 }).default('0'),
        total: numeric({ precision: 10, scale:  2 }).default('0'),
        convertedToOrderId: integer("converted_to_order_id"),
        validUntil: timestamp("valid_until", { mode: 'string' }),
        notes: text(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.customerId],
                        foreignColumns: [proCustomers.id],
                        name: "pro_estimates_customer_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "pro_estimates_store_id_fkey"
                }),
]);

export const proInvoices = pgTable("pro_invoices", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        orderId: integer("order_id"),
        invoiceNumber: text("invoice_number").notNull(),
        status: text().default('draft').notNull(),
        customerName: text("customer_name").notNull(),
        customerPhone: text("customer_phone"),
        customerEmail: text("customer_email"),
        address: text(),
        lineItems: text("line_items"),
        subtotal: numeric({ precision: 10, scale:  2 }).default('0'),
        tax: numeric({ precision: 10, scale:  2 }).default('0'),
        total: numeric({ precision: 10, scale:  2 }).default('0'),
        paidAt: timestamp("paid_at", { mode: 'string' }),
        dueAt: timestamp("due_at", { mode: 'string' }),
        notes: text(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.orderId],
                        foreignColumns: [proServiceOrders.id],
                        name: "pro_invoices_order_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "pro_invoices_store_id_fkey"
                }),
]);

export const proLeads = pgTable("pro_leads", {
        id: serial().primaryKey().notNull(),
        name: varchar({ length: 255 }).notNull(),
        email: varchar({ length: 255 }).notNull(),
        phone: varchar({ length: 50 }),
        businessName: varchar("business_name", { length: 255 }),
        industry: varchar({ length: 100 }),
        teamSize: varchar("team_size", { length: 50 }),
        message: text(),
        source: varchar({ length: 100 }).default('pro-hub'),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const seoRegions = pgTable("seo_regions", {
        id: serial().primaryKey().notNull(),
        city: varchar({ length: 100 }).notNull(),
        state: varchar({ length: 100 }).notNull(),
        stateCode: varchar("state_code", { length: 10 }).notNull(),
        slug: varchar({ length: 200 }).notNull(),
        phone: varchar({ length: 30 }),
        zip: varchar({ length: 20 }),
        product: varchar({ length: 20 }).default('booking').notNull(),
        businessType: varchar("business_type", { length: 100 }),
        businessTypes: text("business_types"),
        nearbyCities: text("nearby_cities"),
        metaTitle: text("meta_title"),
        metaDesc: text("meta_desc"),
        h1Override: text("h1_override"),
        pageGenerated: boolean("page_generated").default(false),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        unique("seo_regions_slug_key").on(table.slug),
]);

export const names = pgTable("names", {
        id: serial().primaryKey().notNull(),
        name: varchar({ length: 100 }).notNull(),
        origin: varchar({ length: 32 }).notNull(),
        gender: varchar({ length: 16 }).default('female').notNull(),
}, (table) => [
        uniqueIndex("idx_names_name_origin_unique").using("btree", table.name.asc().nullsLast().op("text_ops"), table.origin.asc().nullsLast().op("text_ops")),
        index("idx_names_origin").using("btree", table.origin.asc().nullsLast().op("text_ops")),
]);

export const onboardingSubmissions = pgTable("onboarding_submissions", {
        id: serial().primaryKey().notNull(),
        email: text(),
        contactEmail: text("contact_email"),
        businessName: text("business_name"),
        templateId: text("template_id"),
        phone: text(),
        addressLine1: text("address_line1"),
        addressLine2: text("address_line2"),
        city: text(),
        countyState: text("county_state"),
        postcode: text(),
        country: text().default('GB'),
        hours: jsonb(),
        bookingEnabled: boolean("booking_enabled").default(false),
        domainType: text("domain_type").default('subdomain'),
        subdomain: text(),
        customDomain: text("custom_domain"),
        domainPaymentStatus: text("domain_payment_status").default('n/a'),
        heroImage: text("hero_image"),
        plan: text().default('free'),
        poweredByCertxa: boolean("powered_by_certxa").default(true),
        status: text().default('pending'),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const subdomains = pgTable("subdomains", {
        id: serial().primaryKey().notNull(),
        submissionId: integer("submission_id"),
        slug: text().notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.submissionId],
                        foreignColumns: [onboardingSubmissions.id],
                        name: "subdomains_submission_id_fkey"
                }),
        unique("subdomains_slug_key").on(table.slug),
]);

export const smsConversations = pgTable("sms_conversations", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        clientPhone: text("client_phone").notNull(),
        clientName: text("client_name"),
        direction: text().notNull(),
        body: text().notNull(),
        twilioSid: text("twilio_sid"),
        readAt: timestamp("read_at", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("sms_conv_store_created_idx").using("btree", table.storeId.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("int4_ops")),
        index("sms_conv_store_phone_idx").using("btree", table.storeId.asc().nullsLast().op("text_ops"), table.clientPhone.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "sms_conversations_store_id_fkey"
                }),
]);

export const clientEmails = pgTable("client_emails", {
        id: serial().primaryKey().notNull(),
        clientId: integer("client_id").notNull(),
        emailAddress: text("email_address").notNull(),
        isPrimary: boolean("is_primary").default(false).notNull(),
        verified: boolean().default(false).notNull(),
        marketingOptIn: boolean("marketing_opt_in").default(true).notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("client_emails_address_idx").using("btree", table.emailAddress.asc().nullsLast().op("text_ops")),
        index("client_emails_client_id_idx").using("btree", table.clientId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.clientId],
                        foreignColumns: [clients.id],
                        name: "client_emails_client_id_fkey"
                }).onDelete("cascade"),
]);

export const clients = pgTable("clients", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        firstName: text("first_name").default('').notNull(),
        lastName: text("last_name").default('').notNull(),
        fullName: text("full_name").default('').notNull(),
        preferredName: text("preferred_name"),
        dateOfBirth: text("date_of_birth"),
        allergies: text(),
        gender: text(),
        preferredStaffId: integer("preferred_staff_id"),
        clientStatus: text("client_status").default('active').notNull(),
        source: text().default('manual'),
        referralSource: text("referral_source"),
        avatarUrl: text("avatar_url"),
        totalVisits: integer("total_visits").default(0).notNull(),
        totalSpentCents: integer("total_spent_cents").default(0).notNull(),
        lastVisitAt: timestamp("last_visit_at", { mode: 'string' }),
        nextAppointmentAt: timestamp("next_appointment_at", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
        archivedAt: timestamp("archived_at", { mode: 'string' }),
        loyaltyPoints: integer("loyalty_points").default(0).notNull(),
        notes: text(),
}, (table) => [
        index("clients_full_name_idx").using("btree", table.fullName.asc().nullsLast().op("text_ops")),
        index("clients_last_visit_idx").using("btree", table.lastVisitAt.asc().nullsLast().op("timestamp_ops")),
        index("clients_status_idx").using("btree", table.clientStatus.asc().nullsLast().op("text_ops")),
        index("clients_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.preferredStaffId],
                        foreignColumns: [staff.id],
                        name: "clients_preferred_staff_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "clients_store_id_fkey"
                }),
]);

export const clientPhones = pgTable("client_phones", {
        id: serial().primaryKey().notNull(),
        clientId: integer("client_id").notNull(),
        phoneNumberE164: text("phone_number_e164").notNull(),
        displayPhone: text("display_phone"),
        phoneType: text("phone_type").default('mobile').notNull(),
        smsOptIn: boolean("sms_opt_in").default(true).notNull(),
        verified: boolean().default(false).notNull(),
        isPrimary: boolean("is_primary").default(false).notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
        storeId: integer("store_id"),
}, (table) => [
        index("client_phones_client_id_idx").using("btree", table.clientId.asc().nullsLast().op("int4_ops")),
        index("client_phones_e164_idx").using("btree", table.phoneNumberE164.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.clientId],
                        foreignColumns: [clients.id],
                        name: "client_phones_client_id_fkey"
                }).onDelete("cascade"),
]);

export const clientAddresses = pgTable("client_addresses", {
        id: serial().primaryKey().notNull(),
        clientId: integer("client_id").notNull(),
        addressLine1: text("address_line1"),
        addressLine2: text("address_line2"),
        city: text(),
        state: text(),
        postalCode: text("postal_code"),
        country: text().default('US'),
        addressType: text("address_type").default('home').notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("client_addresses_client_id_idx").using("btree", table.clientId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.clientId],
                        foreignColumns: [clients.id],
                        name: "client_addresses_client_id_fkey"
                }).onDelete("cascade"),
]);

export const clientTags = pgTable("client_tags", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        tagName: text("tag_name").notNull(),
        tagColor: text("tag_color").default('#6366f1').notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("client_tags_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        uniqueIndex("client_tags_store_name_uidx").using("btree", table.storeId.asc().nullsLast().op("int4_ops"), table.tagName.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "client_tags_store_id_fkey"
                }),
]);

export const clientTagRelationships = pgTable("client_tag_relationships", {
        id: serial().primaryKey().notNull(),
        clientId: integer("client_id").notNull(),
        tagId: integer("tag_id").notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("client_tag_rel_client_idx").using("btree", table.clientId.asc().nullsLast().op("int4_ops")),
        index("client_tag_rel_tag_idx").using("btree", table.tagId.asc().nullsLast().op("int4_ops")),
        uniqueIndex("client_tag_rel_uidx").using("btree", table.clientId.asc().nullsLast().op("int4_ops"), table.tagId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.clientId],
                        foreignColumns: [clients.id],
                        name: "client_tag_relationships_client_id_fkey"
                }).onDelete("cascade"),
        foreignKey({
                        columns: [table.tagId],
                        foreignColumns: [clientTags.id],
                        name: "client_tag_relationships_tag_id_fkey"
                }).onDelete("cascade"),
]);

export const clientNotes = pgTable("client_notes", {
        id: serial().primaryKey().notNull(),
        clientId: integer("client_id").notNull(),
        storeId: integer("store_id").notNull(),
        createdByUserId: text("created_by_user_id"),
        noteType: text("note_type").default('general').notNull(),
        visibility: text().default('internal').notNull(),
        noteContent: text("note_content").notNull(),
        pinned: boolean().default(false).notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("client_notes_client_id_idx").using("btree", table.clientId.asc().nullsLast().op("int4_ops")),
        index("client_notes_pinned_idx").using("btree", table.pinned.asc().nullsLast().op("bool_ops")),
        index("client_notes_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.clientId],
                        foreignColumns: [clients.id],
                        name: "client_notes_client_id_fkey"
                }).onDelete("cascade"),
        foreignKey({
                        columns: [table.createdByUserId],
                        foreignColumns: [users.id],
                        name: "client_notes_created_by_user_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "client_notes_store_id_fkey"
                }),
]);

export const clientMarketingPreferences = pgTable("client_marketing_preferences", {
        id: serial().primaryKey().notNull(),
        clientId: integer("client_id").notNull(),
        smsMarketingOptIn: boolean("sms_marketing_opt_in").default(true).notNull(),
        emailMarketingOptIn: boolean("email_marketing_opt_in").default(true).notNull(),
        promotionalNotifications: boolean("promotional_notifications").default(true).notNull(),
        appointmentReminders: boolean("appointment_reminders").default(true).notNull(),
        birthdayMessages: boolean("birthday_messages").default(true).notNull(),
        reviewRequests: boolean("review_requests").default(true).notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("client_mkt_prefs_client_idx").using("btree", table.clientId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.clientId],
                        foreignColumns: [clients.id],
                        name: "client_marketing_preferences_client_id_fkey"
                }).onDelete("cascade"),
        unique("client_marketing_preferences_client_id_key").on(table.clientId),
]);

export const clientCustomFields = pgTable("client_custom_fields", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        fieldName: text("field_name").notNull(),
        fieldType: text("field_type").default('text').notNull(),
        fieldOptionsJson: jsonb("field_options_json"),
        active: boolean().default(true).notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("client_custom_fields_store_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "client_custom_fields_store_id_fkey"
                }),
]);

export const clientCustomFieldValues = pgTable("client_custom_field_values", {
        id: serial().primaryKey().notNull(),
        clientId: integer("client_id").notNull(),
        customFieldId: integer("custom_field_id").notNull(),
        fieldValue: text("field_value"),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("client_cfv_client_idx").using("btree", table.clientId.asc().nullsLast().op("int4_ops")),
        uniqueIndex("client_cfv_uidx").using("btree", table.clientId.asc().nullsLast().op("int4_ops"), table.customFieldId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.clientId],
                        foreignColumns: [clients.id],
                        name: "client_custom_field_values_client_id_fkey"
                }).onDelete("cascade"),
        foreignKey({
                        columns: [table.customFieldId],
                        foreignColumns: [clientCustomFields.id],
                        name: "client_custom_field_values_custom_field_id_fkey"
                }).onDelete("cascade"),
]);

export const clientAuditLogs = pgTable("client_audit_logs", {
        id: serial().primaryKey().notNull(),
        clientId: integer("client_id"),
        storeId: integer("store_id").notNull(),
        actionType: text("action_type").notNull(),
        actorUserId: text("actor_user_id"),
        metadataJson: jsonb("metadata_json"),
        ipAddress: text("ip_address"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("client_audit_action_idx").using("btree", table.actionType.asc().nullsLast().op("text_ops")),
        index("client_audit_client_idx").using("btree", table.clientId.asc().nullsLast().op("int4_ops")),
        index("client_audit_created_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
        index("client_audit_store_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.actorUserId],
                        foreignColumns: [users.id],
                        name: "client_audit_logs_actor_user_id_fkey"
                }),
        foreignKey({
                        columns: [table.clientId],
                        foreignColumns: [clients.id],
                        name: "client_audit_logs_client_id_fkey"
                }).onDelete("set null"),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "client_audit_logs_store_id_fkey"
                }),
]);

export const clientExportJobs = pgTable("client_export_jobs", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        requestedByUserId: text("requested_by_user_id"),
        format: text().default('csv').notNull(),
        status: text().default('pending').notNull(),
        filterJson: jsonb("filter_json"),
        totalRows: integer("total_rows"),
        downloadUrl: text("download_url"),
        errorMessage: text("error_message"),
        expiresAt: timestamp("expires_at", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        completedAt: timestamp("completed_at", { mode: 'string' }),
}, (table) => [
        index("client_export_jobs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
        index("client_export_jobs_store_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.requestedByUserId],
                        foreignColumns: [users.id],
                        name: "client_export_jobs_requested_by_user_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "client_export_jobs_store_id_fkey"
                }),
]);

export const clientImportJobs = pgTable("client_import_jobs", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        requestedByUserId: text("requested_by_user_id"),
        status: text().default('pending').notNull(),
        fileName: text("file_name"),
        totalRows: integer("total_rows").default(0),
        importedRows: integer("imported_rows").default(0),
        skippedRows: integer("skipped_rows").default(0),
        errorRows: integer("error_rows").default(0),
        duplicatesFound: integer("duplicates_found").default(0),
        previewJson: jsonb("preview_json"),
        errorsJson: jsonb("errors_json"),
        fieldMappingJson: jsonb("field_mapping_json"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        completedAt: timestamp("completed_at", { mode: 'string' }),
}, (table) => [
        index("client_import_jobs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
        index("client_import_jobs_store_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.requestedByUserId],
                        foreignColumns: [users.id],
                        name: "client_import_jobs_requested_by_user_id_fkey"
                }),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "client_import_jobs_store_id_fkey"
                }),
]);

export const apiKeys = pgTable("api_keys", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        name: text().notNull(),
        keyHash: text("key_hash").notNull(),
        keyPrefix: text("key_prefix").notNull(),
        scopes: text().default('read'),
        isActive: boolean("is_active").default(true),
        lastUsedAt: timestamp("last_used_at", { mode: 'string' }),
        expiresAt: timestamp("expires_at", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("idx_api_keys_hash").using("btree", table.keyHash.asc().nullsLast().op("text_ops")),
        index("idx_api_keys_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "api_keys_store_id_fkey"
                }),
        unique("api_keys_key_hash_key").on(table.keyHash),
]);

export const campaigns = pgTable("campaigns", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        name: text().notNull(),
        status: text().default('draft').notNull(),
        channel: text().default('sms').notNull(),
        audience: text().default('all').notNull(),
        audienceValue: text("audience_value"),
        messageTemplate: text("message_template").notNull(),
        scheduledAt: timestamp("scheduled_at", { mode: 'string' }),
        sentAt: timestamp("sent_at", { mode: 'string' }),
        sentCount: integer("sent_count").default(0),
        failedCount: integer("failed_count").default(0),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("idx_campaigns_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
        index("idx_campaigns_store_id").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "campaigns_store_id_fkey"
                }),
]);

export const stripeCustomers = pgTable("stripe_customers", {
        id: serial().primaryKey().notNull(),
        userId: text("user_id").notNull(),
        customerId: text("customer_id").notNull(),
        storeNumber: integer("store_number"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
        deletedAt: timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
        index("idx_stripe_customers_customer_id").using("btree", table.customerId.asc().nullsLast().op("text_ops")),
        index("idx_stripe_customers_store_number").using("btree", table.storeNumber.asc().nullsLast().op("int4_ops")),
        index("idx_stripe_customers_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.storeNumber],
                        foreignColumns: [locations.id],
                        name: "stripe_customers_store_number_fkey"
                }),
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [users.id],
                        name: "stripe_customers_user_id_fkey"
                }),
        unique("stripe_customers_customer_id_key").on(table.customerId),
        unique("stripe_customers_store_number_key").on(table.storeNumber),
]);

export const stripeSubscriptions = pgTable("stripe_subscriptions", {
        id: serial().primaryKey().notNull(),
        customerId: text("customer_id").notNull(),
        subscriptionId: text("subscription_id"),
        priceId: text("price_id"),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        currentPeriodStart: bigint("current_period_start", { mode: "number" }),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        currentPeriodEnd: bigint("current_period_end", { mode: "number" }),
        cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
        paymentMethodBrand: text("payment_method_brand"),
        paymentMethodLast4: text("payment_method_last4"),
        status: text().default('not_started').notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
        deletedAt: timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
        index("idx_stripe_subs_customer_id").using("btree", table.customerId.asc().nullsLast().op("text_ops")),
        index("idx_stripe_subs_subscription_id").using("btree", table.subscriptionId.asc().nullsLast().op("text_ops")),
        unique("stripe_subscriptions_customer_id_key").on(table.customerId),
]);

export const subscriptions = pgTable("subscriptions", {
        id: serial().primaryKey().notNull(),
        storeNumber: integer("store_number").notNull(),
        planCode: text("plan_code").notNull(),
        stripeCustomerId: text("stripe_customer_id"),
        stripeSubscriptionId: text("stripe_subscription_id"),
        status: text(),
        currentPeriodEnd: text("current_period_end"),
        currentPeriodStart: text("current_period_start"),
        interval: text().default('month'),
        priceId: text("price_id"),
        cancelAtPeriodEnd: integer("cancel_at_period_end").default(0),
        paymentMethodBrand: text("payment_method_brand"),
        paymentMethodLast4: text("payment_method_last4"),
        seatQuantity: integer("seat_quantity").default(1),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("idx_subscriptions_store_number").using("btree", table.storeNumber.asc().nullsLast().op("int4_ops")),
        index("idx_subscriptions_stripe_sub_id").using("btree", table.stripeSubscriptionId.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.planCode],
                        foreignColumns: [billingPlans.code],
                        name: "subscriptions_plan_code_fkey"
                }),
        foreignKey({
                        columns: [table.storeNumber],
                        foreignColumns: [locations.id],
                        name: "subscriptions_store_number_fkey"
                }),
]);

export const billingPlans = pgTable("billing_plans", {
        id: serial().primaryKey().notNull(),
        code: text().notNull(),
        name: text().notNull(),
        description: text(),
        priceCents: numeric("price_cents", { precision: 12, scale:  0 }).notNull(),
        contactsMin: numeric("contacts_min", { precision: 12, scale:  0 }),
        contactsMax: numeric("contacts_max", { precision: 12, scale:  0 }),
        stripePriceId: text("stripe_price_id"),
        stripeProductId: text("stripe_product_id"),
        interval: text().default('month'),
        smsCredits: numeric("sms_credits", { precision: 12, scale:  0 }),
        currency: text().default('usd'),
        active: boolean().default(true),
        featuresJson: jsonb("features_json"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        unique("billing_plans_code_key").on(table.code),
]);

export const stripeOrders = pgTable("stripe_orders", {
        id: serial().primaryKey().notNull(),
        checkoutSessionId: text("checkout_session_id").notNull(),
        paymentIntentId: text("payment_intent_id").notNull(),
        customerId: text("customer_id").notNull(),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        amountSubtotal: bigint("amount_subtotal", { mode: "number" }).notNull(),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        amountTotal: bigint("amount_total", { mode: "number" }).notNull(),
        currency: text().notNull(),
        paymentStatus: text("payment_status").notNull(),
        status: text().default('pending').notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
        deletedAt: timestamp("deleted_at", { mode: 'string' }),
}, (table) => [
        index("idx_stripe_orders_checkout_session").using("btree", table.checkoutSessionId.asc().nullsLast().op("text_ops")),
        index("idx_stripe_orders_customer_id").using("btree", table.customerId.asc().nullsLast().op("text_ops")),
]);

export const scheduledPlanChanges = pgTable("scheduled_plan_changes", {
        id: serial().primaryKey().notNull(),
        stripeSubscriptionId: text("stripe_subscription_id").notNull(),
        newPlanCode: text("new_plan_code").notNull(),
        interval: text(),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        effectiveAt: bigint("effective_at", { mode: "number" }).notNull(),
        status: text().default('pending').notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("idx_scheduled_plan_changes_sub_id").using("btree", table.stripeSubscriptionId.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.newPlanCode],
                        foreignColumns: [billingPlans.code],
                        name: "scheduled_plan_changes_new_plan_code_fkey"
                }),
]);

export const customerBillingProfiles = pgTable("customer_billing_profiles", {
        id: serial().primaryKey().notNull(),
        userId: text("user_id").notNull(),
        salonId: integer("salon_id"),
        stripeCustomerId: text("stripe_customer_id"),
        defaultPaymentMethodId: text("default_payment_method_id"),
        customerEmail: text("customer_email"),
        customerName: text("customer_name"),
        billingPhone: text("billing_phone"),
        billingAddressLine1: text("billing_address_line1"),
        billingAddressLine2: text("billing_address_line2"),
        billingCity: text("billing_city"),
        billingState: text("billing_state"),
        billingZip: text("billing_zip"),
        billingCountry: text("billing_country").default('US'),
        taxExemptStatus: text("tax_exempt_status").default('none'),
        preferredCurrency: text("preferred_currency").default('usd'),
        currentPlanId: integer("current_plan_id"),
        currentSubscriptionStatus: text("current_subscription_status").default('none'),
        trialEndsAt: timestamp("trial_ends_at", { mode: 'string' }),
        currentPeriodStart: timestamp("current_period_start", { mode: 'string' }),
        currentPeriodEnd: timestamp("current_period_end", { mode: 'string' }),
        cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
        canceledAt: timestamp("canceled_at", { mode: 'string' }),
        subscriptionStartedAt: timestamp("subscription_started_at", { mode: 'string' }),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        lifetimeValueCents: bigint("lifetime_value_cents", { mode: "number" }).default(0),
        totalSuccessfulPayments: integer("total_successful_payments").default(0),
        totalFailedPayments: integer("total_failed_payments").default(0),
        lastPaymentDate: timestamp("last_payment_date", { mode: 'string' }),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        lastPaymentAmountCents: bigint("last_payment_amount_cents", { mode: "number" }),
        lastFailedPaymentDate: timestamp("last_failed_payment_date", { mode: 'string' }),
        lastFailedPaymentReason: text("last_failed_payment_reason"),
        delinquent: boolean().default(false),
        accountHold: boolean("account_hold").default(false),
        internalBillingNotes: text("internal_billing_notes"),
        accountStatus: text("account_status").default('active'),
        suspendedAt: timestamp("suspended_at", { mode: 'string' }),
        lockedAt: timestamp("locked_at", { mode: 'string' }),
        suspendedReason: text("suspended_reason"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("idx_cbp_salon_id").using("btree", table.salonId.asc().nullsLast().op("int4_ops")),
        index("idx_cbp_stripe_customer_id").using("btree", table.stripeCustomerId.asc().nullsLast().op("text_ops")),
        index("idx_cbp_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.currentPlanId],
                        foreignColumns: [billingPlans.id],
                        name: "customer_billing_profiles_current_plan_id_fkey"
                }),
        foreignKey({
                        columns: [table.salonId],
                        foreignColumns: [locations.id],
                        name: "customer_billing_profiles_salon_id_fkey"
                }),
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [users.id],
                        name: "customer_billing_profiles_user_id_fkey"
                }),
        unique("customer_billing_profiles_user_id_key").on(table.userId),
        unique("customer_billing_profiles_stripe_customer_id_key").on(table.stripeCustomerId),
]);

export const invoiceRecords = pgTable("invoice_records", {
        id: serial().primaryKey().notNull(),
        stripeInvoiceId: text("stripe_invoice_id").notNull(),
        stripeCustomerId: text("stripe_customer_id"),
        stripeSubscriptionId: text("stripe_subscription_id"),
        salonId: integer("salon_id"),
        invoiceNumber: text("invoice_number"),
        status: text(),
        paid: boolean().default(false),
        attempted: boolean().default(false),
        forgiven: boolean().default(false),
        collectionMethod: text("collection_method"),
        currency: text().default('usd'),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        subtotalCents: bigint("subtotal_cents", { mode: "number" }).default(0),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        taxCents: bigint("tax_cents", { mode: "number" }).default(0),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        totalCents: bigint("total_cents", { mode: "number" }).default(0),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        amountPaidCents: bigint("amount_paid_cents", { mode: "number" }).default(0),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        amountRemainingCents: bigint("amount_remaining_cents", { mode: "number" }).default(0),
        hostedInvoiceUrl: text("hosted_invoice_url"),
        invoicePdfUrl: text("invoice_pdf_url"),
        billingReason: text("billing_reason"),
        periodStart: timestamp("period_start", { mode: 'string' }),
        periodEnd: timestamp("period_end", { mode: 'string' }),
        dueDate: timestamp("due_date", { mode: 'string' }),
        paidAt: timestamp("paid_at", { mode: 'string' }),
        attemptedAt: timestamp("attempted_at", { mode: 'string' }),
        nextPaymentAttempt: timestamp("next_payment_attempt", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("idx_invoice_records_salon_id").using("btree", table.salonId.asc().nullsLast().op("int4_ops")),
        index("idx_invoice_records_stripe_customer_id").using("btree", table.stripeCustomerId.asc().nullsLast().op("text_ops")),
        index("idx_invoice_records_stripe_invoice_id").using("btree", table.stripeInvoiceId.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.salonId],
                        foreignColumns: [locations.id],
                        name: "invoice_records_salon_id_fkey"
                }),
        unique("invoice_records_stripe_invoice_id_key").on(table.stripeInvoiceId),
]);

export const paymentTransactions = pgTable("payment_transactions", {
        id: serial().primaryKey().notNull(),
        stripePaymentIntentId: text("stripe_payment_intent_id"),
        stripeChargeId: text("stripe_charge_id"),
        stripeInvoiceId: text("stripe_invoice_id"),
        salonId: integer("salon_id"),
        userId: text("user_id"),
        status: text(),
        paymentMethodBrand: text("payment_method_brand"),
        paymentMethodLast4: text("payment_method_last4"),
        paymentMethodFingerprint: text("payment_method_fingerprint"),
        cardExpMonth: integer("card_exp_month"),
        cardExpYear: integer("card_exp_year"),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        amountCents: bigint("amount_cents", { mode: "number" }).default(0),
        currency: text().default('usd'),
        failureCode: text("failure_code"),
        failureMessage: text("failure_message"),
        receiptUrl: text("receipt_url"),
        refunded: boolean().default(false),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        refundAmountCents: bigint("refund_amount_cents", { mode: "number" }).default(0),
        disputeStatus: text("dispute_status"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("idx_payment_txn_salon_id").using("btree", table.salonId.asc().nullsLast().op("int4_ops")),
        index("idx_payment_txn_stripe_charge_id").using("btree", table.stripeChargeId.asc().nullsLast().op("text_ops")),
        index("idx_payment_txn_stripe_pi_id").using("btree", table.stripePaymentIntentId.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.salonId],
                        foreignColumns: [locations.id],
                        name: "payment_transactions_salon_id_fkey"
                }),
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [users.id],
                        name: "payment_transactions_user_id_fkey"
                }),
        unique("payment_transactions_stripe_charge_id_key").on(table.stripeChargeId),
]);

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
        id: serial().primaryKey().notNull(),
        stripeEventId: text("stripe_event_id").notNull(),
        eventType: text("event_type").notNull(),
        apiVersion: text("api_version"),
        processed: boolean().default(false),
        processingAttempts: integer("processing_attempts").default(0),
        processingError: text("processing_error"),
        payloadJson: jsonb("payload_json"),
        receivedAt: timestamp("received_at", { mode: 'string' }).defaultNow(),
        processedAt: timestamp("processed_at", { mode: 'string' }),
}, (table) => [
        index("idx_stripe_webhook_events_event_id").using("btree", table.stripeEventId.asc().nullsLast().op("text_ops")),
        index("idx_stripe_webhook_events_processed").using("btree", table.processed.asc().nullsLast().op("bool_ops")),
        index("idx_stripe_webhook_events_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
        unique("stripe_webhook_events_stripe_event_id_key").on(table.stripeEventId),
]);

export const billingActivityLogs = pgTable("billing_activity_logs", {
        id: serial().primaryKey().notNull(),
        salonId: integer("salon_id"),
        userId: text("user_id"),
        eventType: text("event_type").notNull(),
        severity: text().default('info').notNull(),
        message: text().notNull(),
        metadataJson: jsonb("metadata_json"),
        source: text().default('system'),
        ipAddress: text("ip_address"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("idx_billing_activity_created_at").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
        index("idx_billing_activity_event_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
        index("idx_billing_activity_salon_id").using("btree", table.salonId.asc().nullsLast().op("int4_ops")),
        index("idx_billing_activity_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.salonId],
                        foreignColumns: [locations.id],
                        name: "billing_activity_logs_salon_id_fkey"
                }),
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [users.id],
                        name: "billing_activity_logs_user_id_fkey"
                }),
]);

export const refunds = pgTable("refunds", {
        id: serial().primaryKey().notNull(),
        stripeRefundId: text("stripe_refund_id"),
        stripeChargeId: text("stripe_charge_id"),
        stripePaymentIntentId: text("stripe_payment_intent_id"),
        stripeInvoiceId: text("stripe_invoice_id"),
        salonId: integer("salon_id"),
        userId: text("user_id"),
        initiatedByUserId: text("initiated_by_user_id"),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
        currency: text().default('usd'),
        reason: text(),
        internalReasonNotes: text("internal_reason_notes"),
        refundType: text("refund_type").default('manual'),
        status: text().default('pending').notNull(),
        receiptUrl: text("receipt_url"),
        metadataJson: jsonb("metadata_json"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("idx_refunds_salon_id").using("btree", table.salonId.asc().nullsLast().op("int4_ops")),
        index("idx_refunds_stripe_charge_id").using("btree", table.stripeChargeId.asc().nullsLast().op("text_ops")),
        index("idx_refunds_stripe_refund_id").using("btree", table.stripeRefundId.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.initiatedByUserId],
                        foreignColumns: [users.id],
                        name: "refunds_initiated_by_user_id_fkey"
                }),
        foreignKey({
                        columns: [table.salonId],
                        foreignColumns: [locations.id],
                        name: "refunds_salon_id_fkey"
                }),
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [users.id],
                        name: "refunds_user_id_fkey"
                }),
        unique("refunds_stripe_refund_id_key").on(table.stripeRefundId),
]);

export const subscriptionPlanChanges = pgTable("subscription_plan_changes", {
        id: serial().primaryKey().notNull(),
        salonId: integer("salon_id"),
        userId: text("user_id"),
        stripeSubscriptionId: text("stripe_subscription_id"),
        oldPlanId: integer("old_plan_id"),
        newPlanId: integer("new_plan_id"),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        oldPriceCents: bigint("old_price_cents", { mode: "number" }),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        newPriceCents: bigint("new_price_cents", { mode: "number" }),
        changeType: text("change_type"),
        prorationUsed: boolean("proration_used").default(false),
        // You can use { mode: "bigint" } if numbers are exceeding js number limitations
        proratedAmountCents: bigint("prorated_amount_cents", { mode: "number" }),
        effectiveDate: timestamp("effective_date", { mode: 'string' }),
        initiatedBy: text("initiated_by"),
        reason: text(),
        metadataJson: jsonb("metadata_json"),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
        index("idx_sub_plan_changes_salon_id").using("btree", table.salonId.asc().nullsLast().op("int4_ops")),
        index("idx_sub_plan_changes_stripe_sub_id").using("btree", table.stripeSubscriptionId.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.newPlanId],
                        foreignColumns: [billingPlans.id],
                        name: "subscription_plan_changes_new_plan_id_fkey"
                }),
        foreignKey({
                        columns: [table.oldPlanId],
                        foreignColumns: [billingPlans.id],
                        name: "subscription_plan_changes_old_plan_id_fkey"
                }),
        foreignKey({
                        columns: [table.salonId],
                        foreignColumns: [locations.id],
                        name: "subscription_plan_changes_salon_id_fkey"
                }),
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [users.id],
                        name: "subscription_plan_changes_user_id_fkey"
                }),
]);

export const clientIntelligence = pgTable("client_intelligence", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        customerId: integer("customer_id").notNull(),
        avgVisitCadenceDays: numeric("avg_visit_cadence_days", { precision: 6, scale:  1 }),
        lastVisitDate: timestamp("last_visit_date", { mode: 'string' }),
        nextExpectedVisitDate: timestamp("next_expected_visit_date", { mode: 'string' }),
        daysSinceLastVisit: integer("days_since_last_visit"),
        daysOverduePct: numeric("days_overdue_pct", { precision: 6, scale:  1 }),
        totalVisits: integer("total_visits").default(0),
        totalRevenue: numeric("total_revenue", { precision: 10, scale:  2 }).default('0.00'),
        avgTicketValue: numeric("avg_ticket_value", { precision: 10, scale:  2 }).default('0.00'),
        ltv12Month: numeric("ltv_12_month", { precision: 10, scale:  2 }).default('0.00'),
        ltvAllTime: numeric("ltv_all_time", { precision: 10, scale:  2 }).default('0.00'),
        ltvScore: integer("ltv_score").default(0),
        churnRiskScore: integer("churn_risk_score").default(0),
        churnRiskLabel: text("churn_risk_label").default('low'),
        noShowCount: integer("no_show_count").default(0),
        noShowRate: numeric("no_show_rate", { precision: 5, scale:  2 }).default('0.00'),
        rebookingRate: numeric("rebooking_rate", { precision: 5, scale:  2 }).default('0.00'),
        preferredStaffId: integer("preferred_staff_id"),
        preferredDayOfWeek: integer("preferred_day_of_week"),
        preferredTimeOfDay: text("preferred_time_of_day"),
        lastWinbackSentAt: timestamp("last_winback_sent_at", { mode: 'string' }),
        winbackSentCount: integer("winback_sent_count").default(0),
        isDrifting: boolean("is_drifting").default(false),
        isAtRisk: boolean("is_at_risk").default(false),
        computedAt: timestamp("computed_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
        index("ci_churn_risk_idx").using("btree", table.churnRiskScore.asc().nullsLast().op("int4_ops")),
        index("ci_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
        index("ci_is_at_risk_idx").using("btree", table.isAtRisk.asc().nullsLast().op("bool_ops")),
        index("ci_is_drifting_idx").using("btree", table.isDrifting.asc().nullsLast().op("bool_ops")),
        index("ci_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.customerId],
                        foreignColumns: [customers.id],
                        name: "client_intelligence_customer_id_fkey"
                }).onDelete("cascade"),
        foreignKey({
                        columns: [table.preferredStaffId],
                        foreignColumns: [staff.id],
                        name: "client_intelligence_preferred_staff_id_fkey"
                }).onDelete("set null"),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "client_intelligence_store_id_fkey"
                }).onDelete("cascade"),
        unique("ci_store_customer_uidx").on(table.storeId, table.customerId),
]);

export const staffIntelligence = pgTable("staff_intelligence", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        staffId: integer("staff_id").notNull(),
        totalAppointments: integer("total_appointments").default(0),
        completedAppointments: integer("completed_appointments").default(0),
        noShowCount: integer("no_show_count").default(0),
        cancellationCount: integer("cancellation_count").default(0),
        rebookedCount: integer("rebooked_count").default(0),
        rebookingRatePct: numeric("rebooking_rate_pct", { precision: 5, scale:  2 }).default('0.00'),
        avgTicketValue: numeric("avg_ticket_value", { precision: 10, scale:  2 }).default('0.00'),
        totalRevenue: numeric("total_revenue", { precision: 10, scale:  2 }).default('0.00'),
        uniqueClientsServed: integer("unique_clients_served").default(0),
        clientRetentionRate: numeric("client_retention_rate", { precision: 5, scale:  2 }).default('0.00'),
        trend: text().default('stable'),
        computedAt: timestamp("computed_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
        index("si_staff_id_idx").using("btree", table.staffId.asc().nullsLast().op("int4_ops")),
        index("si_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.staffId],
                        foreignColumns: [staff.id],
                        name: "staff_intelligence_staff_id_fkey"
                }).onDelete("cascade"),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "staff_intelligence_store_id_fkey"
                }).onDelete("cascade"),
        unique("si_store_staff_uidx").on(table.storeId, table.staffId),
]);

export const intelligenceInterventions = pgTable("intelligence_interventions", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        customerId: integer("customer_id"),
        interventionType: text("intervention_type").notNull(),
        channel: text().default('sms').notNull(),
        messageBody: text("message_body"),
        status: text().default('sent').notNull(),
        triggeredBy: text("triggered_by").default('auto').notNull(),
        metadata: jsonb(),
        sentAt: timestamp("sent_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
        respondedAt: timestamp("responded_at", { mode: 'string' }),
        convertedAt: timestamp("converted_at", { mode: 'string' }),
        appointmentId: integer("appointment_id"),
}, (table) => [
        index("ii_customer_id_idx").using("btree", table.customerId.asc().nullsLast().op("int4_ops")),
        index("ii_sent_at_idx").using("btree", table.sentAt.asc().nullsLast().op("timestamp_ops")),
        index("ii_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        index("ii_type_idx").using("btree", table.interventionType.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.customerId],
                        foreignColumns: [customers.id],
                        name: "intelligence_interventions_customer_id_fkey"
                }).onDelete("set null"),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "intelligence_interventions_store_id_fkey"
                }).onDelete("cascade"),
]);

export const growthScoreSnapshots = pgTable("growth_score_snapshots", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        overallScore: integer("overall_score").notNull(),
        retentionScore: integer("retention_score").notNull(),
        rebookingScore: integer("rebooking_score").notNull(),
        utilizationScore: integer("utilization_score").notNull(),
        revenueScore: integer("revenue_score").notNull(),
        newClientScore: integer("new_client_score").notNull(),
        activeClients: integer("active_clients").default(0),
        driftingClients: integer("drifting_clients").default(0),
        atRiskClients: integer("at_risk_clients").default(0),
        avgRebookingRate: numeric("avg_rebooking_rate", { precision: 5, scale:  2 }),
        seatUtilizationPct: numeric("seat_utilization_pct", { precision: 5, scale:  2 }),
        monthlyRevenue: numeric("monthly_revenue", { precision: 10, scale:  2 }),
        snapshotDate: timestamp("snapshot_date", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
        index("gss_snapshot_date_idx").using("btree", table.snapshotDate.asc().nullsLast().op("timestamp_ops")),
        index("gss_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "growth_score_snapshots_store_id_fkey"
                }).onDelete("cascade"),
]);

export const deadSeatPatterns = pgTable("dead_seat_patterns", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        dayOfWeek: integer("day_of_week").notNull(),
        hourStart: integer("hour_start").notNull(),
        avgUtilizationPct: numeric("avg_utilization_pct", { precision: 5, scale:  2 }).default('0.00'),
        totalSlotsAnalyzed: integer("total_slots_analyzed").default(0),
        bookedSlots: integer("booked_slots").default(0),
        estimatedLostRevenue: numeric("estimated_lost_revenue", { precision: 10, scale:  2 }).default('0.00'),
        computedAt: timestamp("computed_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
        index("dsp_store_id_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "dead_seat_patterns_store_id_fkey"
                }).onDelete("cascade"),
        unique("dsp_store_slot_uidx").on(table.storeId, table.dayOfWeek, table.hourStart),
]);

export const conversations = pgTable("conversations", {
        id: serial().primaryKey().notNull(),
        title: text().notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
        id: serial().primaryKey().notNull(),
        conversationId: integer("conversation_id").notNull(),
        role: text().notNull(),
        content: text().notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.conversationId],
                        foreignColumns: [conversations.id],
                        name: "messages_conversation_id_fkey"
                }).onDelete("cascade"),
]);

export const launchsiteTemplates = pgTable("launchsite_templates", {
        id: text().primaryKey().notNull(),
        name: text().notNull(),
        category: text().notNull(),
        style: text().default('Modern').notNull(),
        desc: text().default('').notNull(),
        badge: text().default('').notNull(),
        features: jsonb().default([]).notNull(),
        accent: text().default('#a855f7').notNull(),
        dark: text().default('#0a0b15').notNull(),
        light: text().default('#1c1d27').notNull(),
        urlSlug: text("url_slug").notNull(),
        heroTagline: text("hero_tagline").default('').notNull(),
        heroSub: text("hero_sub").default('').notNull(),
        businessName: text("business_name").default('').notNull(),
        type: text().default('php').notNull(),
        reactPath: text("react_path"),
        scrapedPath: text("scraped_path"),
        sourceUrl: text("source_url"),
        sortOrder: integer("sort_order").default(0).notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
        index("launchsite_templates_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
        index("launchsite_templates_sort_idx").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops"), table.createdAt.asc().nullsLast().op("int4_ops")),
]);

export const staffPins = pgTable("staff_pins", {
        id: serial().primaryKey().notNull(),
        staffId: integer("staff_id").notNull(),
        storeId: integer("store_id").notNull(),
        pin: text().notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
        uniqueIndex("sp_staff_store_uidx").using("btree", table.staffId.asc().nullsLast().op("int4_ops"), table.storeId.asc().nullsLast().op("int4_ops")),
        uniqueIndex("sp_store_pin_uidx").using("btree", table.storeId.asc().nullsLast().op("int4_ops"), table.pin.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.staffId],
                        foreignColumns: [staff.id],
                        name: "staff_pins_staff_id_fkey"
                }).onDelete("cascade"),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "staff_pins_store_id_fkey"
                }).onDelete("cascade"),
]);

export const timeclock = pgTable("timeclock", {
        id: serial().primaryKey().notNull(),
        staffId: integer("staff_id").notNull(),
        storeId: integer("store_id").notNull(),
        clockIn: timestamp("clock_in", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
        clockOut: timestamp("clock_out", { mode: 'string' }),
        workDate: text("work_date").notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
        index("tc_staff_date_idx").using("btree", table.staffId.asc().nullsLast().op("int4_ops"), table.workDate.asc().nullsLast().op("int4_ops")),
        index("tc_store_date_idx").using("btree", table.storeId.asc().nullsLast().op("text_ops"), table.workDate.asc().nullsLast().op("text_ops")),
        foreignKey({
                        columns: [table.staffId],
                        foreignColumns: [staff.id],
                        name: "timeclock_staff_id_fkey"
                }).onDelete("cascade"),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "timeclock_store_id_fkey"
                }).onDelete("cascade"),
]);

export const payrollRuns = pgTable("payroll_runs", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        periodStart: text("period_start").notNull(),
        periodEnd: text("period_end").notNull(),
        status: text().default('draft').notNull(),
        totalCommission: numeric("total_commission", { precision: 10, scale:  2 }).default('0').notNull(),
        contractorCount: integer("contractor_count").default(0).notNull(),
        notes: text(),
        createdBy: text("created_by"),
        createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
        finalizedAt: timestamp("finalized_at", { mode: 'string' }),
}, (table) => [
        index("pr_store_created_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops"), table.createdAt.desc().nullsFirst().op("int4_ops")),
        index("pr_store_status_idx").using("btree", table.storeId.asc().nullsLast().op("int4_ops"), table.status.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.storeId],
                        foreignColumns: [locations.id],
                        name: "payroll_runs_store_id_fkey"
                }).onDelete("cascade"),
]);

export const payrollRunItems = pgTable("payroll_run_items", {
        id: serial().primaryKey().notNull(),
        payrollRunId: integer("payroll_run_id").notNull(),
        staffId: integer("staff_id").notNull(),
        staffName: text("staff_name").default('').notNull(),
        commissionRate: numeric("commission_rate", { precision: 5, scale:  2 }).default('0').notNull(),
        appointmentCount: integer("appointment_count").default(0).notNull(),
        serviceRevenue: numeric("service_revenue", { precision: 10, scale:  2 }).default('0').notNull(),
        addonRevenue: numeric("addon_revenue", { precision: 10, scale:  2 }).default('0').notNull(),
        totalRevenue: numeric("total_revenue", { precision: 10, scale:  2 }).default('0').notNull(),
        commissionAmount: numeric("commission_amount", { precision: 10, scale:  2 }).default('0').notNull(),
        status: text().default('pending').notNull(),
        notes: text(),
        createdAt: timestamp("created_at", { mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => [
        index("pri_run_idx").using("btree", table.payrollRunId.asc().nullsLast().op("int4_ops")),
        foreignKey({
                        columns: [table.payrollRunId],
                        foreignColumns: [payrollRuns.id],
                        name: "payroll_run_items_payroll_run_id_fkey"
                }).onDelete("cascade"),
        foreignKey({
                        columns: [table.staffId],
                        foreignColumns: [staff.id],
                        name: "payroll_run_items_staff_id_fkey"
                }).onDelete("cascade"),
]);

export const turnAssignmentLog = pgTable("turn_assignment_log", {
        id: serial().primaryKey().notNull(),
        storeId: integer("store_id").notNull(),
        appointmentId: integer("appointment_id"),
        assignedStaffId: integer("assigned_staff_id").notNull(),
        turnRecommendedStaffId: integer("turn_recommended_staff_id"),
        isOverride: boolean("is_override").default(false).notNull(),
        source: text().default('turn_system').notNull(),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        bookedByUserId: integer("booked_by_user_id"),
});

export const supportTickets = pgTable("support_tickets", {
        id: serial().primaryKey().notNull(),
        accountId: integer("account_id"),
        ticketNumber: varchar("ticket_number", { length: 32 }),
        subject: text(),
        description: text(),
        priority: text().default('normal').notNull(),
        status: text().default('open').notNull(),
        assignedAgentId: integer("assigned_agent_id"),
        assignedAgentName: varchar("assigned_agent_name", { length: 128 }),
        createdByAgentId: integer("created_by_agent_id"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
        name: text("name"),
        businessName: text("business_name"),
        phone: text("phone"),
        email: text("email"),
        issue: text("issue"),
        callSid: text("call_sid"),
        callLogId: integer("call_log_id"),
        resolvedAt: timestamp("resolved_at", { mode: 'string' }),
        resolvedBy: text("resolved_by"),
        internalNotes: text("internal_notes"),
        customerEmail: text("customer_email"),
        customerName: text("customer_name"),
        ipAddress: text("ip_address"),
        imapMessageId: text("imap_message_id"),
        imapThreadId: text("imap_thread_id"),
        accountName: text("account_name"),
        category: text("category"),
        subcategory: text("subcategory"),
        channel: text("channel"),
        firstResponseAt: timestamp("first_response_at", { mode: 'string' }),
        lastResponseAt: timestamp("last_response_at", { mode: 'string' }),
        closedAt: timestamp("closed_at", { mode: 'string' }),
        tags: jsonb("tags"),
}, (table) => [
        unique("support_tickets_ticket_number_key").on(table.ticketNumber),
]);

export const supportTicketMessages = pgTable("support_ticket_messages", {
        id: serial().primaryKey().notNull(),
        ticketId: integer("ticket_id").notNull(),
        authorType: varchar("author_type", { length: 16 }).default('user').notNull(),
        authorName: varchar("author_name", { length: 128 }),
        agentId: integer("agent_id"),
        content: text().notNull(),
        isInternal: boolean("is_internal").default(false).notNull(),
        direction: text("direction"),
        rawHeaders: text("raw_headers"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.ticketId],
                        foreignColumns: [supportTickets.id],
                        name: "support_ticket_messages_ticket_id_fkey"
                }).onDelete("cascade"),
]);

// ─── Live Chat ────────────────────────────────────────────────────────────────
// Tables created by migration 0057_live_chat.sql and extended by 0061.
// Declared here so drizzle-kit push never treats them as orphans.

export const liveChatDepartments = pgTable("live_chat_departments", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        description: text(),
        isActive: boolean("is_active").default(true).notNull(),
        routingKeywords: text("routing_keywords"),
        createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const liveChats = pgTable("live_chats", {
        id: uuid().primaryKey().defaultRandom().notNull(),
        visitorName: text("visitor_name"),
        visitorEmail: text("visitor_email"),
        visitorToken: text("visitor_token"),
        departmentId: integer("department_id"),
        agentId: integer("agent_id"),
        status: text().default('queued').notNull(),
        subject: text(),
        pageUrl: text("page_url"),
        routedBy: text("routed_by").default('manual'),
        startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
        acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: 'string' }),
        closedAt: timestamp("closed_at", { withTimezone: true, mode: 'string' }),
        rating: integer(),
        ratingComment: text("rating_comment"),
}, (table) => [
        index("idx_live_chats_status").on(table.status),
        index("idx_live_chats_agent_id").on(table.agentId),
]);

export const liveChatMessages = pgTable("live_chat_messages", {
        id: uuid().primaryKey().defaultRandom().notNull(),
        chatId: uuid("chat_id").notNull(),
        senderType: text("sender_type").notNull(),
        senderId: integer("sender_id"),
        senderName: text("sender_name"),
        content: text().notNull(),
        createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        index("idx_live_chat_msgs_chat").on(table.chatId, table.createdAt),
        foreignKey({
                columns: [table.chatId],
                foreignColumns: [liveChats.id],
                name: "live_chat_messages_chat_id_fkey",
        }).onDelete("cascade"),
]);

export const liveChatCanned = pgTable("live_chat_canned", {
        id: serial().primaryKey().notNull(),
        shortcut: text().notNull(),
        title: text().notNull(),
        content: text().notNull(),
        createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        unique("live_chat_canned_shortcut_key").on(table.shortcut),
]);

export const supportAgents = pgTable("support_agents", {
        id: serial().primaryKey().notNull(),
        name: text(),
        email: text(),
        role: varchar({ length: 32 }).notNull().default('agent'),
        isActive: boolean("is_active").notNull().default(true),
        passwordHash: text("password_hash"),
        firstName: text("first_name"),
        lastName: text("last_name"),
        avatarUrl: text("avatar_url"),
        lastLoginAt: timestamp("last_login_at", { mode: 'string' }),
        createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const liveChatAgentDepartments = pgTable("live_chat_agent_departments", {
        agentId: integer("agent_id").notNull(),
        departmentId: integer("department_id").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        foreignKey({
                columns: [table.agentId],
                foreignColumns: [supportAgents.id],
                name: "live_chat_agent_departments_agent_id_fkey",
        }).onDelete("cascade"),
        foreignKey({
                columns: [table.departmentId],
                foreignColumns: [liveChatDepartments.id],
                name: "live_chat_agent_departments_department_id_fkey",
        }).onDelete("cascade"),
]);

// ─── Processed Emails ─────────────────────────────────────────────────────────
// Tracks IMAP message-IDs already imported so we never create duplicate tickets.
// Created by migration 0059_email_ticket_sync.sql.

export const processedEmails = pgTable("processed_emails", {
        id: serial().primaryKey().notNull(),
        messageId: text("message_id").notNull(),
        ticketId: integer("ticket_id"),
        processedAt: timestamp("processed_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
        unique("processed_emails_message_id_key").on(table.messageId),
        index("idx_processed_emails_message_id").on(table.messageId),
]);

// ─── Site Assets ──────────────────────────────────────────────────────────────
// Admin-managed R2 assets (hero images, logos, etc.) keyed by a slug.
// Table is created at API startup by initSiteAssetsTable().

export const siteAssets = pgTable("site_assets", {
        key: text().primaryKey().notNull(),
        label: text().default('').notNull(),
        r2Url: text("r2_url").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});
