# Memberships

## Overview
Certxa supports recurring membership plans that give clients a set number of services or discounts per month in exchange for a monthly fee.

## Creating a Membership Plan
1. Go to Settings → Memberships → New Plan
2. Enter plan name, price, billing frequency (monthly/annual)
3. Set the included services or discount percentage
4. Enable the plan

## Membership Benefits
- Included services (e.g., 2 manicures per month)
- Percentage discount on all services
- Priority booking
- Complimentary add-ons

## Assigning a Membership to a Client
1. Open the client profile
2. Click "Assign Membership"
3. Select the plan and billing start date
4. The client is charged automatically via Stripe

## Membership Status
- **Active** — Billing and benefits are active
- **Paused** — Benefits paused, billing stopped temporarily
- **Cancelled** — Plan cancelled, no further charges

## Pausing a Membership
Open the client profile → Membership tab → Pause. Specify the pause duration. Billing resumes automatically.

## Cancelling a Membership
Open the client profile → Membership tab → Cancel. The client retains benefits until the end of the current billing period.

## Rollover Credits
Unused service credits can roll over to the next month (configurable per plan in Settings → Memberships).

## Reporting
View all active memberships and monthly recurring revenue under Reports → Memberships.

## Common Issues
- **Billing failed**: Check that the client's payment method on file is valid
- **Benefits not applying**: Verify the membership is Active and the service is included in the plan
- **Client double-charged**: Contact support immediately with the transaction IDs
