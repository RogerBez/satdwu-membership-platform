# SATDWU Membership Platform Review Summary

This document explains what has been built so far, what each page does, and the key product questions raised during review.

## Current Architecture

- App host: Google Cloud Run
- Live URL: https://satdwu-membership-294346590999.africa-south1.run.app
- Database: Firebase Firestore
- Local development URL: http://localhost:8001
- Local command: `npm run dev`

The app is currently a lite MVP. It is designed to prove the registration, member status, Cashit payment confirmation, admin workflow, finance reconciliation, and field-agent attribution flows before we harden the data model and permissions.

## Login Page

The login page separates the platform into different user experiences.

Current demo users:

- Union Admin: `rogerbezuidenhout@live.co.za`
- Member: `Rogerbez@gmail.com`
- Demo password: `Password123!`

Why it exists:

- A union member should only see their own membership status, payment instructions, reminders, and renewal flow.
- A union admin needs operational tools: approvals, reporting, registry, payment exceptions, and Cashit testing.

Next decision:

- Add separate roles for `admin`, `finance`, and `union_agent`.
- Stop using demo passwords once the workflow is approved.

## Member Portal

The member portal is the mobile-first view for a SATDWU member.

It currently shows:

- Member status
- SATDWU member number
- Mobile number
- Cashit account / cell number
- Monthly fee
- Grace expiry date
- Renewal instructions

Important review note:

The current UI makes the Cashit number very prominent because payment is the highest-risk operational step. However, the SATDWU member number may need to become the main identity shown on the platform, with the Cashit cell number presented clearly as the payment account.

Recommended adjustment:

- Put the SATDWU member number front and centre as the membership identity.
- Show the Cashit account / cell number as the payment method.
- Keep the payment instruction obvious, but do not make Cashit feel like the owner of the SATDWU member identity.

## Membership Renewal

The renewal section does not renew a member by itself.

It currently:

- Checks the renewal amount.
- Shows payment instructions.
- Tells the member to pay through Cashit.
- Waits for Cashit confirmation before extending the membership status.

Why:

The platform must not allow a member to click a button and become active without confirmed payment.

Open question:

When the member clicks the renewal/check amount button, should the SATDWU platform call Cashit in real time to retrieve:

- Account validity
- Amount due
- Payment initiation status
- USSD session initiation link or code
- Payment pending state
- Payment success/failure/reversal feedback

These questions are tracked in `CASHIT_INTEGRATION_QUESTIONS.md`.

## Union Dashboard

The Union Dashboard is the admin overview.

It currently shows:

- Registered members
- Paid-up members
- Payment due members
- Collections
- Status mix chart
- Collections chart
- Field agent conversion chart
- Unified member registry

Why:

The dashboard gives the union a quick view of where action is needed.

Review decisions/questions:

- The top cards should become clickable.
- Clicking a card should filter or open the detail view behind that metric.
- The Payment Due card should expose bulk reminder actions.
- The Field Agents card needs clearer naming because there are likely two types of agents:
  - Cashit field agents
  - Union-appointed agents

Recommended adjustment:

- Rename or split field-agent reporting into clear categories.
- Keep Cashit field-agent reporting focused on Cashit platform performance.
- Add a separate Union Agent dashboard for union-appointed agents.

## Payment Due Actions

Payment due members should support operational follow-up.

Possible actions:

- Send SMS reminder to overdue members.
- Trigger or suggest a USSD payment session.
- Send a payment link if Cashit supports it.
- Notify the linked field agent when one of their members becomes overdue.
- Allow union agents to send reminders to their own members.

Important:

We need Cashit clarity before building the USSD/payment-link action. SMS can be designed now, but real sending depends on the SMS provider and consent rules.

## Unified Member Registry

The registry is the admin working table.

It currently supports:

- Search
- Branch filter
- Status filter
- Review member
- Approve member
- KYC reminder
- Fee reminder

### Approve Button

Current behavior:

- Marks a pending member as approved/active.
- Assigns or confirms a SATDWU member number.
- Sets the grace period.
- Updates the KYC application status.

Important review question:

Should approval be allowed before the first Cashit payment, or should a member only become fully active after both KYC approval and confirmed payment?

Recommended policy:

- Separate the states:
  - `registered`
  - `kyc_pending`
  - `kyc_approved`
  - `payment_pending`
  - `active_paid`
  - `unpaid`
  - `suspended`
  - `cancelled`

### KYC Button

Current behavior:

- Sends or creates a KYC reminder inside the platform.

Open question:

Should SATDWU use Cashit field-agent KYC, or run its own KYC?

Recommended approach:

- If Cashit already performs verified KYC for the member, SATDWU should integrate with that rather than duplicate work.
- SATDWU should still store its own KYC status and evidence reference.
- The platform should support manual fallback KYC for members not verified through Cashit.

### Fee Reminder Button

Current behavior:

- Creates a fee reminder/alert for the member inside the app.

Required next step:

- Decide how reminders are delivered:
  - In-app only
  - SMS
  - WhatsApp
  - USSD prompt
  - Field-agent dashboard notification

## Finance Page

The Finance page is for payment reconciliation.

It currently shows:

- Unmatched Cashit payments
- Transaction ledger
- A way to link unmatched payments to members

Why:

Cashit payments may arrive with missing, bad, or mistyped references. Finance needs a queue to resolve these rather than losing payments.

Next decision:

- Finance should become its own role, separate from union admin.
- Finance users should be able to reconcile payments but not necessarily approve members or manage admin settings.

## Cashit Page

The Cashit page is currently a webhook tester.

It simulates:

- Successful payments
- Failed payments
- Reversals

Why:

It lets us test what happens when Cashit tells the SATDWU platform that money has been paid, failed, or reversed.

Future state:

- Replace the tester with real Cashit webhook logs, integration health, and error monitoring.
- Hide or restrict the tester to development/admin-only environments.

## Field Agents

There are two agent concepts that must be separated.

### Cashit Field Agents

These are agents from the Cashit Field Agent Dashboard.

They may:

- Register members using a referral code or referral link.
- Have registrations attributed to them.
- Earn commission only after confirmed payment.
- View their own reporting in the Cashit Field Agent Dashboard.

The SATDWU platform should expose APIs so the Cashit dashboard can show its own reporting.

### Union-Appointed Agents

These are agents appointed by SATDWU.

They likely need their own login and dashboard.

They should be able to:

- See their assigned members.
- Monitor registrations and payment status.
- Send renewal reminders to their members.
- Communicate with their members.
- Track their own activity and performance.

Recommended next build:

- Add `union_agent` role.
- Add Union Agent dashboard.
- Add member assignment logic.
- Add reminder permissions scoped to assigned members only.

## External API

The platform already supports API-style interaction for USSD, Cashit Field Agent Dashboard, or other external clients.

Important endpoints:

- `POST /api/register`
- `POST /api/renew`
- `GET /api/status/:member`
- `GET /api/field-agents/report`
- `GET /api/referrals/:code/report`
- `POST /api/cashit/webhook`

Recommended next step:

- Add API authentication before this becomes production-facing.
- Add per-client API keys or OAuth-style service credentials.
- Restrict CORS to approved domains.

## Recommended Next Build Sequence

1. Rework the Member Portal identity hierarchy:
   - SATDWU member number front and centre.
   - Cashit account/cell number as the payment method.

2. Add clickable dashboard cards:
   - Registered members opens all members.
   - Paid-up opens active members.
   - Payment due opens unpaid members and bulk reminder actions.
   - Collections opens transaction reporting.

3. Split roles:
   - Admin
   - Finance
   - Union Agent
   - Member

4. Add Union Agent dashboard:
   - Assigned members
   - Overdue members
   - Reminder actions
   - Activity reporting

5. Define Cashit integration contract:
   - Payment initiation
   - USSD/session flow
   - Webhook payloads
   - KYC reuse
   - Field-agent dashboard notifications

6. Replace the single Firestore state document with proper collections:
   - members
   - applications
   - users
   - payments
   - reminders
   - agents
   - referrals
   - commissions
   - auditLogs

