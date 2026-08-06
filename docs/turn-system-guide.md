# The Certxa Turn System
### A complete guide for salon owners and staff

---

## What Is the Turn System?

The Turn system is Certxa's built-in walk-in client rotation. Instead of staff racing to greet walk-ins or managers making judgment calls on the spot, the system maintains a live, automatically ordered queue that decides who is "up next" at all times.

Every time a staff member finishes a qualifying service and checks out the client, the system rotates them to the back of the active queue. The next person in line moves up to first. This keeps the day fair and transparent for everyone — staff know exactly where they stand, and owners don't have to referee disputes.

---

## How the Queue Is Built

### Step 1 — Clocking In Sets the Starting Order

When staff clock in at the beginning of their shift, the system records the exact time. The first person to clock in is placed at position #1, the second at #2, and so on.

This clock-in order is the starting lineup for the day. It only matters at the very beginning. From that point forward, completed checkouts determine order — not who clocked in first.

> **Staff tip:** Clocking in on time matters. Being the first to clock in means you are first up for the day's first walk-in.

---

### Step 2 — A Walk-In Is Assigned

When a walk-in client arrives, the staff member at position #1 (shown with a **purple border** and "NEXT" label on their card) is the designated next up.

Once they are assigned that client, they immediately move from **AVAILABLE** to **BUSY** and are pulled out of the active queue entirely. Their card moves to the **HOLD** section at the bottom of the Turn popup (shown with a **hot pink border** and "HOLD" label). The queue advances — whoever was at #2 is now #1 and becomes the new NEXT.

The HOLD section is simply a visual holding area so the team can see who is currently with a client. Staff in HOLD are not waiting in any position in the line — they are out of rotation until their client is fully checked out.

> **Think of it like the "currently being served" window at a deli counter.** The active queue shows who is waiting to be called. Hold shows who is currently being served. Two completely separate lists.

---

### Step 3 — Checkout Determines What Happens Next

When a staff member finishes with their client and completes the checkout, the system evaluates the ticket to decide where that staff member goes. The comparison is made against the **service total only — tips are excluded**.

> **Why exclude tips?** A $10 tip on a $20 haircut should not count the ticket as a $30 qualifying turn. The threshold measures the value of the service rendered, not the generosity of the client.

#### Qualifying Turn (service total at or above the threshold — default $30)

The staff member is moved to the **back of the active queue**. Their turn count increases by one. They are now waiting for the full rotation to come back around.

#### Short Turn (service total below the threshold — default $30)

The service total was below the minimum. This is considered a **short turn**. The staff member is returned to **position #1** at the front of the active queue — they get another chance before rotating back. Their card shows a "Kept Turn" badge so the team can see why they are at the front again.

Short turns protect staff from losing their place over a quick add-on, a small express service, or any ticket that genuinely didn't represent a full service.

---

## The Queue in Action — An Example

Four staff clock in this morning in this order: **Anna, Ben, Clara, David.**

| Start of day | Status |
|---|---|
| Anna — **#1 NEXT** | Available |
| Ben — #2 | Available |
| Clara — #3 | Available |
| David — #4 | Available |

A walk-in arrives. Anna is assigned. She goes **BUSY** and moves to **HOLD**. Ben advances to #1.

| Anna with client | Status |
|---|---|
| Ben — **#1 NEXT** | Available |
| Clara — #2 | Available |
| David — #3 | Available |
| ── HOLD ── | |
| Anna | Busy |

Anna finishes. Checkout: **$65 service + $10 tip = $75 total, $65 service amount.**
$65 is above the $30 threshold → **standard turn**. Anna moves to the back of the active queue.

| After Anna's checkout | Status |
|---|---|
| Ben — **#1 NEXT** | Available |
| Clara — #2 | Available |
| David — #3 | Available |
| Anna — #4 | Available |

Ben takes a walk-in and goes BUSY → HOLD. Clara advances to #1.
Ben finishes. Checkout: **$25 service + $5 tip = $30 total, $25 service amount.**
$25 is below the $30 threshold → **short turn**. Ben returns to #1.

| After Ben's short turn | Status |
|---|---|
| Ben — **#1 NEXT** (Kept Turn) | Available |
| Clara — #2 | Available |
| David — #3 | Available |
| Anna — #4 | Available |

Ben takes another walk-in. Checkout: **$45 service + $8 tip = $53 total, $45 service amount.**
$45 ≥ $30 → standard turn. Ben rotates to the back.

| After Ben's qualifying checkout | Status |
|---|---|
| Clara — **#1 NEXT** | Available |
| David — #2 | Available |
| Anna — #3 | Available |
| Ben — #4 | Available |

The rotation continues this way throughout the entire day.

---

## Cycles

A **cycle** is one complete rotation — every clocked-in staff member has taken at least one qualifying turn. The system tracks the current cycle number and displays it in the right panel of the Turn popup.

When the day progresses into a second cycle (some staff have gone twice while others are still on their first turn), the popup shows a visual divider — a solid bar with the next cycle number — between those two groups of cards. Staff on the left of the divider are still completing the current cycle. Staff after the divider have already looped into the next cycle and are waiting for the others to catch up.

Cycle numbers reset to zero at the end of every business day when all staff are automatically clocked out.

---

## Multiple Short Turns at the Same Time

When two staff members finish their clients at nearly the same moment and both have short-turn tickets, the system processes them sequentially in the order the checkouts are completed. The first checkout processed goes to #1, and the second goes to #2 right behind them — both ahead of the regular queue. The team can always see who is "Kept Turn" on each card, so there is no ambiguity about why those two are at the front.

---

## Staff Statuses

Each card in the Turn popup shows a colored status badge.

| Status | What It Means |
|---|---|
| **AVAILABLE** (green) | Clocked in, not busy, no upcoming appointment — eligible for the next walk-in |
| **BUSY** (red) | Currently with a client — card is in the HOLD section, not the active queue |
| **ON BREAK** (grey) | Manually paused by a manager — stays in the queue but is skipped for walk-ins until unpaused |

---

## Card Border Colors at a Glance

| Border Color | Meaning |
|---|---|
| **Purple** | This staff member is **NEXT** — first in the active queue |
| **None / subtle** | Regular queue position |
| **Hot Pink** | **HOLD** — this staff member is currently serving a client |

---

## The Appointment Exclusion Window

Staff who have a booked appointment coming up within **20 minutes** are automatically skipped for walk-in assignment.

This prevents the situation where a staff member gets assigned a walk-in right before a scheduled appointment, leaving the booked client waiting. The system looks ahead 20 minutes and protects that buffer.

Once the appointment begins or passes, the exclusion lifts and the staff member re-enters the walk-in eligible pool.

> **Owner note:** The 20-minute window is the default. This value can be adjusted in Turn settings.

---

## Name Requests — Client Asks for a Specific Staff Member

When a client walks in and specifically asks for a certain staff member, a manager can assign that walk-in directly to them by name rather than following the queue order.

**What happens to that staff member:**
- They are assigned the client and immediately go **BUSY → HOLD**, just like a normal assignment.
- Their position in the active queue is vacated. Everyone behind them does **not** shift — the queue stays as-is and the person who was at #1 before the reassignment (if they were not the requested staff member) remains at #1.
- When the appointment is completed and checked out, the normal threshold logic applies — service total minus tip is compared to the threshold. If it qualifies, they rotate to the back. If it's a short turn, they return to #1.

**What does not happen:**
- The staff member at #1 in the active queue does **not** lose their position. A name request is an out-of-order assignment and does not disturb the existing queue.
- The name-requested staff member does not skip the turn count — the checkout still counts (or doesn't) toward their turn total the same as any other checkout.

> **Owner note:** Name requests happen in every salon. Staff generally understand them as a business reality. What matters is that the team can see the reason for the out-of-order assignment — the HOLD section makes it visible in real time, and the queue positions make it clear no one lost their spot.

---

## Scheduled Appointments and the Turn Queue

Booked appointments on the calendar are separate from walk-in assignments, but they interact with the turn queue in two important ways.

### 1 — The Exclusion Window Protects Scheduled Clients

When a staff member has a booked appointment coming up within the configured window (default 20 minutes), the system automatically skips them for walk-in assignment. This prevents a walk-in from being stacked on top of a client who already has a reservation.

The staff member remains visible in the turn popup in their current queue position — they are just ineligible for the next walk-in until their upcoming appointment begins or the window passes.

### 2 — Completing a Scheduled Appointment Rotates the Queue

When a staff member starts a scheduled appointment, they go **BUSY** and their card moves to the **HOLD** section, exactly the same as a walk-in. When the appointment is finished and checked out, the same short-turn / standard-turn evaluation runs:

- **Service total (minus tip) ≥ threshold** → standard turn, staff member rotates to the back of the active queue.
- **Service total (minus tip) < threshold** → short turn, staff member returns to #1.

This means scheduled appointments count toward the daily turn count and affect queue position just like walk-ins. A staff member who spends the morning doing back-to-back booked appointments earns turns for each one and will naturally be positioned toward the back of the queue by the time they are available for walk-ins again. This keeps the rotation fair for staff who do not have as many bookings.

> **Example:** Anna has three booked appointments from 10 am to 1 pm. Each checkout rotates her in the queue. By 1 pm when she becomes available again, her turn count reflects all three services. She is positioned in the queue behind staff who had fewer turns during that window — the system automatically balances it out without any manual intervention.

---

## What Managers Can Do

### Manually Reorder the Queue

Owners and managers can drag and reorder staff positions in the active queue at any time. Manual changes take effect immediately and are broadcast live to all devices.

### Assign a Walk-In to a Specific Staff Member

Managers can assign an incoming walk-in directly to any available staff member instead of following the queue. When assigned this way, the staff member goes BUSY and moves to HOLD just like a normal assignment. Their checkout will trigger the normal short-turn or standard-turn evaluation.

### Pause a Staff Member

If a staff member needs to step away — a break, a phone call, a personal matter — a manager can pause them. A paused staff member shows as "On Break" and is skipped for walk-in assignments. Their queue position is held. When they return and are unpaused, they are right back where they were.

### Clock In / Clock Out

The **In/Out** button inside the Turn popup opens the time clock. Staff clock themselves in and out using their PIN. When a staff member clocks in mid-day, they are added to the back of the queue. When they clock out, they are removed from the queue entirely.

---

## Automatic End-of-Day Clock-Out

At the end of each business day — once the salon's configured closing time has passed in the salon's local timezone — the system automatically clocks out any staff members who are still clocked in. Their clock-out time is recorded as the salon's official closing time.

When this happens, the turn queue is fully reset: all queue positions, HOLD assignments, cycle counters, locks, and short-turn protections are cleared so the next morning starts completely clean.

---

## Turn Count and Fairness

Each staff member's **Turn Count** (visible on their card) shows how many qualifying checkouts they have completed today. The system uses this count to keep the day balanced — if a staff member clocked in late and has fewer turns than everyone else, the queue automatically places them closer to the front.

Specifically, the queue always sorts by ascending turn count. The staff member with the fewest qualifying turns is closest to position #1. Ties are broken by who has been waiting longer (FIFO — whoever has been in the queue the longest among equals goes first).

---

## Settings (Owners Only)

These values can be adjusted from the Turn settings panel.

| Setting | Default | What It Controls |
|---|---|---|
| **Turn Value Threshold** | $30 | The minimum **service total (excluding tip)** that counts as a qualifying turn. Service totals below this are short turns. |
| **Appointment Exclusion Window** | 20 minutes | How far ahead the system looks for upcoming appointments. Staff with an appointment within this window are skipped for walk-ins. |
| **Auto-Advance on Checkout** | On | Whether the queue automatically rotates when a checkout is completed. |
| **Allow Manager Overrides** | On | Whether managers can manually reorder the queue or assign walk-ins to specific staff. |

---

## Reading the Turn Popup at a Glance

| Element | What It Shows |
|---|---|
| **NEXT** (purple text) + purple border | The staff member who should take the next walk-in |
| **#1, #2, #3… badge** | Position in the active queue |
| **HOLD** (pink text) + hot pink border | Currently serving a client — not in the active queue |
| **Kept Turn badge** | Their last ticket was a short turn — they're at the front for one more turn |
| **Turn Count** | Qualifying checkouts completed today |
| **Daily Processing** (orders) | Appointments still in progress, not yet checked out |
| **Daily Done Income** | Revenue from completed checkouts today |
| **Daily Processing $** | Revenue from in-progress appointments |
| **Cycle # (right panel)** | How many full rotations the team has completed today |
| **Staff Clocked In (right panel)** | Total staff currently on the clock |
| **Daily Total (right panel)** | Combined done + in-progress revenue for all staff |
| **Dark bar divider** | Separates staff still in the current cycle from those already in the next |
| **Pink bar divider** | Marks the start of the HOLD section |

---

## Frequently Asked Questions

**Q: A client specifically requested my staff member who is not next in line. What do we do?**

A manager can assign that staff member directly via the Walk-In button and select them by name. They will go to HOLD as normal, and their checkout will trigger the usual short-turn or standard-turn evaluation.

**Q: Two walk-ins arrived at the same time. How do we handle it?**

Assign the first walk-in to the #1 staff member. That staff member immediately goes BUSY → HOLD, and the queue advances. Assign the second walk-in to whoever is now #1.

**Q: A staff member clocked out early and came back. What happens?**

When they clock back in, they are added to the back of the queue. Their turn count from earlier in the day carries forward — the system remembers their history across multiple clock-in events in the same day.

**Q: Why is someone at #1 with a "Kept Turn" badge?**

Their last checkout had a service total below the minimum threshold — a short turn. The system gave them another chance before rotating them back. Once they complete a qualifying checkout, they rotate to the back normally.

**Q: Two staff finished at the same time and both had short turns. Why is one at #1 and one at #2?**

The system processes checkouts in the order they were completed. The first to check out goes to #1, the second goes to #2. Both have "Kept Turn" badges so the team can see the reason. Once either of them completes a qualifying turn, they rotate to the back.

**Q: The order looks wrong — how do I fix it?**

A manager can drag and drop cards in the queue to any order. Use "Why this order?" in the Turn popup header — it gives a detailed explanation of exactly why each staff member is ranked where they are.

**Q: What happens to the queue overnight?**

Everything resets. At closing time, all staff are automatically clocked out, the queue is cleared, the HOLD section is emptied, turn counts start back at zero, and any short-turn protection or manual locks are removed. The next morning is a completely fresh start.

**Q: Does the Turn system affect booked appointments?**

No. The Turn system is specifically for walk-in assignment. Booked appointments are unaffected and stay on the calendar as scheduled. The only interaction is the exclusion window: staff with a booked appointment coming up soon are skipped for walk-ins during that buffer period.

---

*Certxa Turn System — built for fair, transparent, automatic walk-in distribution.*
