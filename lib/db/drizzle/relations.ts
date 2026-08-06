import { relations } from "drizzle-orm/relations";
import { users, locations, businessHours, serviceCategories, services, addons, staff, customers, appointments, serviceAddons, appointmentAddons, staffServices, staffAvailability, products, cashDrawerSessions, drawerActions, calendarSettings, smsSettings, smsLog, mailSettings, stripeSettings, permissions, roles, app, staffSettings, storeSettings, googleBusinessProfiles, googleBusinessAccounts, googleBusinessLocations, googleBusinessSyncLogs, googleReviews, googleReviewResponses, passwordResetTokens, waitlist, giftCards, giftCardTransactions, intakeForms, intakeFormFields, intakeFormResponses, loyaltyTransactions, reviews, proCrews, proCrewLocations, proServiceOrders, proOrderNotes, proCustomers, proEstimates, proInvoices, onboardingSubmissions, subdomains, smsConversations, clients, clientEmails, clientPhones, clientAddresses, clientTags, clientTagRelationships, clientNotes, clientMarketingPreferences, clientCustomFields, clientCustomFieldValues, clientAuditLogs, clientExportJobs, clientImportJobs, apiKeys, campaigns, stripeCustomers, billingPlans, subscriptions, scheduledPlanChanges, customerBillingProfiles, invoiceRecords, paymentTransactions, billingActivityLogs, refunds, subscriptionPlanChanges, clientIntelligence, staffIntelligence, intelligenceInterventions, growthScoreSnapshots, deadSeatPatterns, conversations, messages, staffPins, timeclock, payrollRuns, payrollRunItems, supportTickets, supportTicketMessages } from "./schema";

export const locationsRelations = relations(locations, ({one, many}) => ({
	user: one(users, {
		fields: [locations.userId],
		references: [users.id]
	}),
	businessHours: many(businessHours),
	serviceCategories: many(serviceCategories),
	services: many(services),
	addons: many(addons),
	staff: many(staff),
	customers: many(customers),
	appointments: many(appointments),
	products: many(products),
	cashDrawerSessions: many(cashDrawerSessions),
	calendarSettings: many(calendarSettings),
	smsSettings: many(smsSettings),
	smsLogs: many(smsLog),
	mailSettings: many(mailSettings),
	stripeSettings: many(stripeSettings),
	permissions: many(permissions),
	roles: many(roles),
	apps: many(app),
	staffSettings: many(staffSettings),
	storeSettings: many(storeSettings),
	googleBusinessProfiles: many(googleBusinessProfiles),
	googleBusinessAccounts: many(googleBusinessAccounts),
	googleBusinessLocations: many(googleBusinessLocations),
	googleBusinessSyncLogs: many(googleBusinessSyncLogs),
	googleReviews: many(googleReviews),
	googleReviewResponses: many(googleReviewResponses),
	waitlists: many(waitlist),
	giftCards: many(giftCards),
	giftCardTransactions: many(giftCardTransactions),
	intakeForms: many(intakeForms),
	intakeFormResponses: many(intakeFormResponses),
	loyaltyTransactions: many(loyaltyTransactions),
	reviews: many(reviews),
	proCrews: many(proCrews),
	proServiceOrders: many(proServiceOrders),
	proOrderNotes: many(proOrderNotes),
	proCustomers: many(proCustomers),
	proEstimates: many(proEstimates),
	proInvoices: many(proInvoices),
	smsConversations: many(smsConversations),
	clients: many(clients),
	clientTags: many(clientTags),
	clientNotes: many(clientNotes),
	clientCustomFields: many(clientCustomFields),
	clientAuditLogs: many(clientAuditLogs),
	clientExportJobs: many(clientExportJobs),
	clientImportJobs: many(clientImportJobs),
	apiKeys: many(apiKeys),
	campaigns: many(campaigns),
	stripeCustomers: many(stripeCustomers),
	subscriptions: many(subscriptions),
	customerBillingProfiles: many(customerBillingProfiles),
	invoiceRecords: many(invoiceRecords),
	paymentTransactions: many(paymentTransactions),
	billingActivityLogs: many(billingActivityLogs),
	refunds: many(refunds),
	subscriptionPlanChanges: many(subscriptionPlanChanges),
	clientIntelligences: many(clientIntelligence),
	staffIntelligences: many(staffIntelligence),
	intelligenceInterventions: many(intelligenceInterventions),
	growthScoreSnapshots: many(growthScoreSnapshots),
	deadSeatPatterns: many(deadSeatPatterns),
	staffPins: many(staffPins),
	timeclocks: many(timeclock),
	payrollRuns: many(payrollRuns),
}));

export const usersRelations = relations(users, ({many}) => ({
	locations: many(locations),
	googleBusinessAccounts: many(googleBusinessAccounts),
	googleBusinessLocations: many(googleBusinessLocations),
	googleBusinessSyncLogs: many(googleBusinessSyncLogs),
	googleReviewResponses: many(googleReviewResponses),
	passwordResetTokens: many(passwordResetTokens),
	clientNotes: many(clientNotes),
	clientAuditLogs: many(clientAuditLogs),
	clientExportJobs: many(clientExportJobs),
	clientImportJobs: many(clientImportJobs),
	stripeCustomers: many(stripeCustomers),
	customerBillingProfiles: many(customerBillingProfiles),
	paymentTransactions: many(paymentTransactions),
	billingActivityLogs: many(billingActivityLogs),
	refunds_initiatedByUserId: many(refunds, {
		relationName: "refunds_initiatedByUserId_users_id"
	}),
	refunds_userId: many(refunds, {
		relationName: "refunds_userId_users_id"
	}),
	subscriptionPlanChanges: many(subscriptionPlanChanges),
}));

export const businessHoursRelations = relations(businessHours, ({one}) => ({
	location: one(locations, {
		fields: [businessHours.storeId],
		references: [locations.id]
	}),
}));

export const serviceCategoriesRelations = relations(serviceCategories, ({one, many}) => ({
	location: one(locations, {
		fields: [serviceCategories.storeId],
		references: [locations.id]
	}),
	services: many(services),
}));

export const servicesRelations = relations(services, ({one, many}) => ({
	serviceCategory: one(serviceCategories, {
		fields: [services.categoryId],
		references: [serviceCategories.id]
	}),
	location: one(locations, {
		fields: [services.storeId],
		references: [locations.id]
	}),
	appointments: many(appointments),
	serviceAddons: many(serviceAddons),
	staffServices: many(staffServices),
	waitlists: many(waitlist),
	intakeForms: many(intakeForms),
}));

export const addonsRelations = relations(addons, ({one, many}) => ({
	location: one(locations, {
		fields: [addons.storeId],
		references: [locations.id]
	}),
	serviceAddons: many(serviceAddons),
	appointmentAddons: many(appointmentAddons),
}));

export const staffRelations = relations(staff, ({one, many}) => ({
	location: one(locations, {
		fields: [staff.storeId],
		references: [locations.id]
	}),
	appointments: many(appointments),
	staffServices: many(staffServices),
	staffAvailabilities: many(staffAvailability),
	staffSettings: many(staffSettings),
	googleReviewResponses: many(googleReviewResponses),
	waitlists: many(waitlist),
	reviews: many(reviews),
	clients: many(clients),
	clientIntelligences: many(clientIntelligence),
	staffIntelligences: many(staffIntelligence),
	staffPins: many(staffPins),
	timeclocks: many(timeclock),
	payrollRunItems: many(payrollRunItems),
}));

export const customersRelations = relations(customers, ({one, many}) => ({
	location: one(locations, {
		fields: [customers.storeId],
		references: [locations.id]
	}),
	appointments: many(appointments),
	smsLogs: many(smsLog),
	googleReviews: many(googleReviews),
	waitlists: many(waitlist),
	giftCards_purchasedByCustomerId: many(giftCards, {
		relationName: "giftCards_purchasedByCustomerId_customers_id"
	}),
	giftCards_recipientCustomerId: many(giftCards, {
		relationName: "giftCards_recipientCustomerId_customers_id"
	}),
	intakeFormResponses: many(intakeFormResponses),
	loyaltyTransactions: many(loyaltyTransactions),
	reviews: many(reviews),
	clientIntelligences: many(clientIntelligence),
	intelligenceInterventions: many(intelligenceInterventions),
}));

export const appointmentsRelations = relations(appointments, ({one, many}) => ({
	customer: one(customers, {
		fields: [appointments.customerId],
		references: [customers.id]
	}),
	service: one(services, {
		fields: [appointments.serviceId],
		references: [services.id]
	}),
	staff: one(staff, {
		fields: [appointments.staffId],
		references: [staff.id]
	}),
	location: one(locations, {
		fields: [appointments.storeId],
		references: [locations.id]
	}),
	appointmentAddons: many(appointmentAddons),
	smsLogs: many(smsLog),
	googleReviews: many(googleReviews),
	giftCardTransactions: many(giftCardTransactions),
	intakeFormResponses: many(intakeFormResponses),
	loyaltyTransactions: many(loyaltyTransactions),
	reviews: many(reviews),
}));

export const serviceAddonsRelations = relations(serviceAddons, ({one}) => ({
	addon: one(addons, {
		fields: [serviceAddons.addonId],
		references: [addons.id]
	}),
	service: one(services, {
		fields: [serviceAddons.serviceId],
		references: [services.id]
	}),
}));

export const appointmentAddonsRelations = relations(appointmentAddons, ({one}) => ({
	addon: one(addons, {
		fields: [appointmentAddons.addonId],
		references: [addons.id]
	}),
	appointment: one(appointments, {
		fields: [appointmentAddons.appointmentId],
		references: [appointments.id]
	}),
}));

export const staffServicesRelations = relations(staffServices, ({one}) => ({
	service: one(services, {
		fields: [staffServices.serviceId],
		references: [services.id]
	}),
	staff: one(staff, {
		fields: [staffServices.staffId],
		references: [staff.id]
	}),
}));

export const staffAvailabilityRelations = relations(staffAvailability, ({one}) => ({
	staff: one(staff, {
		fields: [staffAvailability.staffId],
		references: [staff.id]
	}),
}));

export const productsRelations = relations(products, ({one}) => ({
	location: one(locations, {
		fields: [products.storeId],
		references: [locations.id]
	}),
}));

export const cashDrawerSessionsRelations = relations(cashDrawerSessions, ({one, many}) => ({
	location: one(locations, {
		fields: [cashDrawerSessions.storeId],
		references: [locations.id]
	}),
	drawerActions: many(drawerActions),
}));

export const drawerActionsRelations = relations(drawerActions, ({one}) => ({
	cashDrawerSession: one(cashDrawerSessions, {
		fields: [drawerActions.sessionId],
		references: [cashDrawerSessions.id]
	}),
}));

export const calendarSettingsRelations = relations(calendarSettings, ({one}) => ({
	location: one(locations, {
		fields: [calendarSettings.storeId],
		references: [locations.id]
	}),
}));

export const smsSettingsRelations = relations(smsSettings, ({one}) => ({
	location: one(locations, {
		fields: [smsSettings.storeId],
		references: [locations.id]
	}),
}));

export const smsLogRelations = relations(smsLog, ({one}) => ({
	appointment: one(appointments, {
		fields: [smsLog.appointmentId],
		references: [appointments.id]
	}),
	customer: one(customers, {
		fields: [smsLog.customerId],
		references: [customers.id]
	}),
	location: one(locations, {
		fields: [smsLog.storeId],
		references: [locations.id]
	}),
}));

export const mailSettingsRelations = relations(mailSettings, ({one}) => ({
	location: one(locations, {
		fields: [mailSettings.storeId],
		references: [locations.id]
	}),
}));

export const stripeSettingsRelations = relations(stripeSettings, ({one}) => ({
	location: one(locations, {
		fields: [stripeSettings.storeId],
		references: [locations.id]
	}),
}));

export const permissionsRelations = relations(permissions, ({one}) => ({
	location: one(locations, {
		fields: [permissions.storeId],
		references: [locations.id]
	}),
}));

export const rolesRelations = relations(roles, ({one}) => ({
	location: one(locations, {
		fields: [roles.storeId],
		references: [locations.id]
	}),
}));

export const appRelations = relations(app, ({one}) => ({
	location: one(locations, {
		fields: [app.storeId],
		references: [locations.id]
	}),
}));

export const staffSettingsRelations = relations(staffSettings, ({one}) => ({
	staff: one(staff, {
		fields: [staffSettings.staffId],
		references: [staff.id]
	}),
	location: one(locations, {
		fields: [staffSettings.storeId],
		references: [locations.id]
	}),
}));

export const storeSettingsRelations = relations(storeSettings, ({one}) => ({
	location: one(locations, {
		fields: [storeSettings.storeId],
		references: [locations.id]
	}),
}));

export const googleBusinessProfilesRelations = relations(googleBusinessProfiles, ({one}) => ({
	location: one(locations, {
		fields: [googleBusinessProfiles.storeId],
		references: [locations.id]
	}),
}));

export const googleBusinessAccountsRelations = relations(googleBusinessAccounts, ({one, many}) => ({
	location: one(locations, {
		fields: [googleBusinessAccounts.storeId],
		references: [locations.id]
	}),
	user: one(users, {
		fields: [googleBusinessAccounts.userId],
		references: [users.id]
	}),
	googleBusinessLocations: many(googleBusinessLocations),
}));

export const googleBusinessLocationsRelations = relations(googleBusinessLocations, ({one, many}) => ({
	googleBusinessAccount: one(googleBusinessAccounts, {
		fields: [googleBusinessLocations.businessAccountId],
		references: [googleBusinessAccounts.id]
	}),
	location: one(locations, {
		fields: [googleBusinessLocations.storeId],
		references: [locations.id]
	}),
	user: one(users, {
		fields: [googleBusinessLocations.userId],
		references: [users.id]
	}),
	googleBusinessSyncLogs: many(googleBusinessSyncLogs),
	googleReviews: many(googleReviews),
}));

export const googleBusinessSyncLogsRelations = relations(googleBusinessSyncLogs, ({one}) => ({
	googleBusinessLocation: one(googleBusinessLocations, {
		fields: [googleBusinessSyncLogs.locationId],
		references: [googleBusinessLocations.id]
	}),
	location: one(locations, {
		fields: [googleBusinessSyncLogs.storeId],
		references: [locations.id]
	}),
	user: one(users, {
		fields: [googleBusinessSyncLogs.userId],
		references: [users.id]
	}),
}));

export const googleReviewsRelations = relations(googleReviews, ({one, many}) => ({
	appointment: one(appointments, {
		fields: [googleReviews.appointmentId],
		references: [appointments.id]
	}),
	customer: one(customers, {
		fields: [googleReviews.customerId],
		references: [customers.id]
	}),
	googleBusinessLocation: one(googleBusinessLocations, {
		fields: [googleReviews.gbLocationId],
		references: [googleBusinessLocations.id]
	}),
	location: one(locations, {
		fields: [googleReviews.storeId],
		references: [locations.id]
	}),
	googleReviewResponses: many(googleReviewResponses),
}));

export const googleReviewResponsesRelations = relations(googleReviewResponses, ({one}) => ({
	user: one(users, {
		fields: [googleReviewResponses.createdBy],
		references: [users.id]
	}),
	googleReview: one(googleReviews, {
		fields: [googleReviewResponses.googleReviewId],
		references: [googleReviews.id]
	}),
	staff: one(staff, {
		fields: [googleReviewResponses.staffId],
		references: [staff.id]
	}),
	location: one(locations, {
		fields: [googleReviewResponses.storeId],
		references: [locations.id]
	}),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({one}) => ({
	user: one(users, {
		fields: [passwordResetTokens.userId],
		references: [users.id]
	}),
}));

export const waitlistRelations = relations(waitlist, ({one}) => ({
	customer: one(customers, {
		fields: [waitlist.customerId],
		references: [customers.id]
	}),
	service: one(services, {
		fields: [waitlist.serviceId],
		references: [services.id]
	}),
	staff: one(staff, {
		fields: [waitlist.staffId],
		references: [staff.id]
	}),
	location: one(locations, {
		fields: [waitlist.storeId],
		references: [locations.id]
	}),
}));

export const giftCardsRelations = relations(giftCards, ({one, many}) => ({
	customer_purchasedByCustomerId: one(customers, {
		fields: [giftCards.purchasedByCustomerId],
		references: [customers.id],
		relationName: "giftCards_purchasedByCustomerId_customers_id"
	}),
	customer_recipientCustomerId: one(customers, {
		fields: [giftCards.recipientCustomerId],
		references: [customers.id],
		relationName: "giftCards_recipientCustomerId_customers_id"
	}),
	location: one(locations, {
		fields: [giftCards.storeId],
		references: [locations.id]
	}),
	giftCardTransactions: many(giftCardTransactions),
}));

export const giftCardTransactionsRelations = relations(giftCardTransactions, ({one}) => ({
	appointment: one(appointments, {
		fields: [giftCardTransactions.appointmentId],
		references: [appointments.id]
	}),
	giftCard: one(giftCards, {
		fields: [giftCardTransactions.giftCardId],
		references: [giftCards.id]
	}),
	location: one(locations, {
		fields: [giftCardTransactions.storeId],
		references: [locations.id]
	}),
}));

export const intakeFormsRelations = relations(intakeForms, ({one, many}) => ({
	service: one(services, {
		fields: [intakeForms.serviceId],
		references: [services.id]
	}),
	location: one(locations, {
		fields: [intakeForms.storeId],
		references: [locations.id]
	}),
	intakeFormFields: many(intakeFormFields),
	intakeFormResponses: many(intakeFormResponses),
}));

export const intakeFormFieldsRelations = relations(intakeFormFields, ({one}) => ({
	intakeForm: one(intakeForms, {
		fields: [intakeFormFields.formId],
		references: [intakeForms.id]
	}),
}));

export const intakeFormResponsesRelations = relations(intakeFormResponses, ({one}) => ({
	appointment: one(appointments, {
		fields: [intakeFormResponses.appointmentId],
		references: [appointments.id]
	}),
	customer: one(customers, {
		fields: [intakeFormResponses.customerId],
		references: [customers.id]
	}),
	intakeForm: one(intakeForms, {
		fields: [intakeFormResponses.formId],
		references: [intakeForms.id]
	}),
	location: one(locations, {
		fields: [intakeFormResponses.storeId],
		references: [locations.id]
	}),
}));

export const loyaltyTransactionsRelations = relations(loyaltyTransactions, ({one}) => ({
	appointment: one(appointments, {
		fields: [loyaltyTransactions.appointmentId],
		references: [appointments.id]
	}),
	customer: one(customers, {
		fields: [loyaltyTransactions.customerId],
		references: [customers.id]
	}),
	location: one(locations, {
		fields: [loyaltyTransactions.storeId],
		references: [locations.id]
	}),
}));

export const reviewsRelations = relations(reviews, ({one}) => ({
	appointment: one(appointments, {
		fields: [reviews.appointmentId],
		references: [appointments.id]
	}),
	customer: one(customers, {
		fields: [reviews.customerId],
		references: [customers.id]
	}),
	staff: one(staff, {
		fields: [reviews.staffId],
		references: [staff.id]
	}),
	location: one(locations, {
		fields: [reviews.storeId],
		references: [locations.id]
	}),
}));

export const proCrewsRelations = relations(proCrews, ({one, many}) => ({
	location: one(locations, {
		fields: [proCrews.storeId],
		references: [locations.id]
	}),
	proCrewLocations: many(proCrewLocations),
	proServiceOrders: many(proServiceOrders),
}));

export const proCrewLocationsRelations = relations(proCrewLocations, ({one}) => ({
	proCrew: one(proCrews, {
		fields: [proCrewLocations.crewId],
		references: [proCrews.id]
	}),
}));

export const proServiceOrdersRelations = relations(proServiceOrders, ({one, many}) => ({
	proCrew: one(proCrews, {
		fields: [proServiceOrders.crewId],
		references: [proCrews.id]
	}),
	location: one(locations, {
		fields: [proServiceOrders.storeId],
		references: [locations.id]
	}),
	proOrderNotes: many(proOrderNotes),
	proInvoices: many(proInvoices),
}));

export const proOrderNotesRelations = relations(proOrderNotes, ({one}) => ({
	proServiceOrder: one(proServiceOrders, {
		fields: [proOrderNotes.orderId],
		references: [proServiceOrders.id]
	}),
	location: one(locations, {
		fields: [proOrderNotes.storeId],
		references: [locations.id]
	}),
}));

export const proCustomersRelations = relations(proCustomers, ({one, many}) => ({
	location: one(locations, {
		fields: [proCustomers.storeId],
		references: [locations.id]
	}),
	proEstimates: many(proEstimates),
}));

export const proEstimatesRelations = relations(proEstimates, ({one}) => ({
	proCustomer: one(proCustomers, {
		fields: [proEstimates.customerId],
		references: [proCustomers.id]
	}),
	location: one(locations, {
		fields: [proEstimates.storeId],
		references: [locations.id]
	}),
}));

export const proInvoicesRelations = relations(proInvoices, ({one}) => ({
	proServiceOrder: one(proServiceOrders, {
		fields: [proInvoices.orderId],
		references: [proServiceOrders.id]
	}),
	location: one(locations, {
		fields: [proInvoices.storeId],
		references: [locations.id]
	}),
}));

export const subdomainsRelations = relations(subdomains, ({one}) => ({
	onboardingSubmission: one(onboardingSubmissions, {
		fields: [subdomains.submissionId],
		references: [onboardingSubmissions.id]
	}),
}));

export const onboardingSubmissionsRelations = relations(onboardingSubmissions, ({many}) => ({
	subdomains: many(subdomains),
}));

export const smsConversationsRelations = relations(smsConversations, ({one}) => ({
	location: one(locations, {
		fields: [smsConversations.storeId],
		references: [locations.id]
	}),
}));

export const clientEmailsRelations = relations(clientEmails, ({one}) => ({
	client: one(clients, {
		fields: [clientEmails.clientId],
		references: [clients.id]
	}),
}));

export const clientsRelations = relations(clients, ({one, many}) => ({
	clientEmails: many(clientEmails),
	staff: one(staff, {
		fields: [clients.preferredStaffId],
		references: [staff.id]
	}),
	location: one(locations, {
		fields: [clients.storeId],
		references: [locations.id]
	}),
	clientPhones: many(clientPhones),
	clientAddresses: many(clientAddresses),
	clientTagRelationships: many(clientTagRelationships),
	clientNotes: many(clientNotes),
	clientMarketingPreferences: many(clientMarketingPreferences),
	clientCustomFieldValues: many(clientCustomFieldValues),
	clientAuditLogs: many(clientAuditLogs),
}));

export const clientPhonesRelations = relations(clientPhones, ({one}) => ({
	client: one(clients, {
		fields: [clientPhones.clientId],
		references: [clients.id]
	}),
}));

export const clientAddressesRelations = relations(clientAddresses, ({one}) => ({
	client: one(clients, {
		fields: [clientAddresses.clientId],
		references: [clients.id]
	}),
}));

export const clientTagsRelations = relations(clientTags, ({one, many}) => ({
	location: one(locations, {
		fields: [clientTags.storeId],
		references: [locations.id]
	}),
	clientTagRelationships: many(clientTagRelationships),
}));

export const clientTagRelationshipsRelations = relations(clientTagRelationships, ({one}) => ({
	client: one(clients, {
		fields: [clientTagRelationships.clientId],
		references: [clients.id]
	}),
	clientTag: one(clientTags, {
		fields: [clientTagRelationships.tagId],
		references: [clientTags.id]
	}),
}));

export const clientNotesRelations = relations(clientNotes, ({one}) => ({
	client: one(clients, {
		fields: [clientNotes.clientId],
		references: [clients.id]
	}),
	user: one(users, {
		fields: [clientNotes.createdByUserId],
		references: [users.id]
	}),
	location: one(locations, {
		fields: [clientNotes.storeId],
		references: [locations.id]
	}),
}));

export const clientMarketingPreferencesRelations = relations(clientMarketingPreferences, ({one}) => ({
	client: one(clients, {
		fields: [clientMarketingPreferences.clientId],
		references: [clients.id]
	}),
}));

export const clientCustomFieldsRelations = relations(clientCustomFields, ({one, many}) => ({
	location: one(locations, {
		fields: [clientCustomFields.storeId],
		references: [locations.id]
	}),
	clientCustomFieldValues: many(clientCustomFieldValues),
}));

export const clientCustomFieldValuesRelations = relations(clientCustomFieldValues, ({one}) => ({
	client: one(clients, {
		fields: [clientCustomFieldValues.clientId],
		references: [clients.id]
	}),
	clientCustomField: one(clientCustomFields, {
		fields: [clientCustomFieldValues.customFieldId],
		references: [clientCustomFields.id]
	}),
}));

export const clientAuditLogsRelations = relations(clientAuditLogs, ({one}) => ({
	user: one(users, {
		fields: [clientAuditLogs.actorUserId],
		references: [users.id]
	}),
	client: one(clients, {
		fields: [clientAuditLogs.clientId],
		references: [clients.id]
	}),
	location: one(locations, {
		fields: [clientAuditLogs.storeId],
		references: [locations.id]
	}),
}));

export const clientExportJobsRelations = relations(clientExportJobs, ({one}) => ({
	user: one(users, {
		fields: [clientExportJobs.requestedByUserId],
		references: [users.id]
	}),
	location: one(locations, {
		fields: [clientExportJobs.storeId],
		references: [locations.id]
	}),
}));

export const clientImportJobsRelations = relations(clientImportJobs, ({one}) => ({
	user: one(users, {
		fields: [clientImportJobs.requestedByUserId],
		references: [users.id]
	}),
	location: one(locations, {
		fields: [clientImportJobs.storeId],
		references: [locations.id]
	}),
}));

export const apiKeysRelations = relations(apiKeys, ({one}) => ({
	location: one(locations, {
		fields: [apiKeys.storeId],
		references: [locations.id]
	}),
}));

export const campaignsRelations = relations(campaigns, ({one}) => ({
	location: one(locations, {
		fields: [campaigns.storeId],
		references: [locations.id]
	}),
}));

export const stripeCustomersRelations = relations(stripeCustomers, ({one}) => ({
	location: one(locations, {
		fields: [stripeCustomers.storeNumber],
		references: [locations.id]
	}),
	user: one(users, {
		fields: [stripeCustomers.userId],
		references: [users.id]
	}),
}));

export const subscriptionsRelations = relations(subscriptions, ({one}) => ({
	billingPlan: one(billingPlans, {
		fields: [subscriptions.planCode],
		references: [billingPlans.code]
	}),
	location: one(locations, {
		fields: [subscriptions.storeNumber],
		references: [locations.id]
	}),
}));

export const billingPlansRelations = relations(billingPlans, ({many}) => ({
	subscriptions: many(subscriptions),
	scheduledPlanChanges: many(scheduledPlanChanges),
	customerBillingProfiles: many(customerBillingProfiles),
	subscriptionPlanChanges_newPlanId: many(subscriptionPlanChanges, {
		relationName: "subscriptionPlanChanges_newPlanId_billingPlans_id"
	}),
	subscriptionPlanChanges_oldPlanId: many(subscriptionPlanChanges, {
		relationName: "subscriptionPlanChanges_oldPlanId_billingPlans_id"
	}),
}));

export const scheduledPlanChangesRelations = relations(scheduledPlanChanges, ({one}) => ({
	billingPlan: one(billingPlans, {
		fields: [scheduledPlanChanges.newPlanCode],
		references: [billingPlans.code]
	}),
}));

export const customerBillingProfilesRelations = relations(customerBillingProfiles, ({one}) => ({
	billingPlan: one(billingPlans, {
		fields: [customerBillingProfiles.currentPlanId],
		references: [billingPlans.id]
	}),
	location: one(locations, {
		fields: [customerBillingProfiles.salonId],
		references: [locations.id]
	}),
	user: one(users, {
		fields: [customerBillingProfiles.userId],
		references: [users.id]
	}),
}));

export const invoiceRecordsRelations = relations(invoiceRecords, ({one}) => ({
	location: one(locations, {
		fields: [invoiceRecords.salonId],
		references: [locations.id]
	}),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({one}) => ({
	location: one(locations, {
		fields: [paymentTransactions.salonId],
		references: [locations.id]
	}),
	user: one(users, {
		fields: [paymentTransactions.userId],
		references: [users.id]
	}),
}));

export const billingActivityLogsRelations = relations(billingActivityLogs, ({one}) => ({
	location: one(locations, {
		fields: [billingActivityLogs.salonId],
		references: [locations.id]
	}),
	user: one(users, {
		fields: [billingActivityLogs.userId],
		references: [users.id]
	}),
}));

export const refundsRelations = relations(refunds, ({one}) => ({
	user_initiatedByUserId: one(users, {
		fields: [refunds.initiatedByUserId],
		references: [users.id],
		relationName: "refunds_initiatedByUserId_users_id"
	}),
	location: one(locations, {
		fields: [refunds.salonId],
		references: [locations.id]
	}),
	user_userId: one(users, {
		fields: [refunds.userId],
		references: [users.id],
		relationName: "refunds_userId_users_id"
	}),
}));

export const subscriptionPlanChangesRelations = relations(subscriptionPlanChanges, ({one}) => ({
	billingPlan_newPlanId: one(billingPlans, {
		fields: [subscriptionPlanChanges.newPlanId],
		references: [billingPlans.id],
		relationName: "subscriptionPlanChanges_newPlanId_billingPlans_id"
	}),
	billingPlan_oldPlanId: one(billingPlans, {
		fields: [subscriptionPlanChanges.oldPlanId],
		references: [billingPlans.id],
		relationName: "subscriptionPlanChanges_oldPlanId_billingPlans_id"
	}),
	location: one(locations, {
		fields: [subscriptionPlanChanges.salonId],
		references: [locations.id]
	}),
	user: one(users, {
		fields: [subscriptionPlanChanges.userId],
		references: [users.id]
	}),
}));

export const clientIntelligenceRelations = relations(clientIntelligence, ({one}) => ({
	customer: one(customers, {
		fields: [clientIntelligence.customerId],
		references: [customers.id]
	}),
	staff: one(staff, {
		fields: [clientIntelligence.preferredStaffId],
		references: [staff.id]
	}),
	location: one(locations, {
		fields: [clientIntelligence.storeId],
		references: [locations.id]
	}),
}));

export const staffIntelligenceRelations = relations(staffIntelligence, ({one}) => ({
	staff: one(staff, {
		fields: [staffIntelligence.staffId],
		references: [staff.id]
	}),
	location: one(locations, {
		fields: [staffIntelligence.storeId],
		references: [locations.id]
	}),
}));

export const intelligenceInterventionsRelations = relations(intelligenceInterventions, ({one}) => ({
	customer: one(customers, {
		fields: [intelligenceInterventions.customerId],
		references: [customers.id]
	}),
	location: one(locations, {
		fields: [intelligenceInterventions.storeId],
		references: [locations.id]
	}),
}));

export const growthScoreSnapshotsRelations = relations(growthScoreSnapshots, ({one}) => ({
	location: one(locations, {
		fields: [growthScoreSnapshots.storeId],
		references: [locations.id]
	}),
}));

export const deadSeatPatternsRelations = relations(deadSeatPatterns, ({one}) => ({
	location: one(locations, {
		fields: [deadSeatPatterns.storeId],
		references: [locations.id]
	}),
}));

export const messagesRelations = relations(messages, ({one}) => ({
	conversation: one(conversations, {
		fields: [messages.conversationId],
		references: [conversations.id]
	}),
}));

export const conversationsRelations = relations(conversations, ({many}) => ({
	messages: many(messages),
}));

export const staffPinsRelations = relations(staffPins, ({one}) => ({
	staff: one(staff, {
		fields: [staffPins.staffId],
		references: [staff.id]
	}),
	location: one(locations, {
		fields: [staffPins.storeId],
		references: [locations.id]
	}),
}));

export const timeclockRelations = relations(timeclock, ({one}) => ({
	staff: one(staff, {
		fields: [timeclock.staffId],
		references: [staff.id]
	}),
	location: one(locations, {
		fields: [timeclock.storeId],
		references: [locations.id]
	}),
}));

export const payrollRunsRelations = relations(payrollRuns, ({one, many}) => ({
	location: one(locations, {
		fields: [payrollRuns.storeId],
		references: [locations.id]
	}),
	payrollRunItems: many(payrollRunItems),
}));

export const payrollRunItemsRelations = relations(payrollRunItems, ({one}) => ({
	payrollRun: one(payrollRuns, {
		fields: [payrollRunItems.payrollRunId],
		references: [payrollRuns.id]
	}),
	staff: one(staff, {
		fields: [payrollRunItems.staffId],
		references: [staff.id]
	}),
}));

export const supportTicketMessagesRelations = relations(supportTicketMessages, ({one}) => ({
	supportTicket: one(supportTickets, {
		fields: [supportTicketMessages.ticketId],
		references: [supportTickets.id]
	}),
}));

export const supportTicketsRelations = relations(supportTickets, ({many}) => ({
	supportTicketMessages: many(supportTicketMessages),
}));