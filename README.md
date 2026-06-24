# SATDWU Membership System

Ultra-lean Phase 1 membership platform for SATDWU.

## Run Locally

```powershell
npm run dev
```

Open `http://localhost:8001`.

## Demo Logins

Both demo accounts use:

```text
Password123!
```

- Union Admin: `rogerbezuidenhout@live.co.za`
- Member: `Rogerbez@gmail.com` / `0655499876`

## Phase 1 Scope

- Reusable, skinnable membership component for registration and renewal
- Mobile member self-registration with ID document photo upload
- Pending approval, active paid-up, and overdue status badges
- Admin approval workflow with 30-day grace expiry
- SATDWU member number plus Cashit account number based on the member cell number
- Cashit wallet/mandate status tracking on each member
- Field Agent Dashboard registration endpoint with referral attribution
- SATDWU recruiter profile management and member attribution
- Recruiter-level reporting for registrations, active members, overdue members, mandate coverage, and collections
- Month-end Cashit billing export endpoint
- Cashit-led KYC reminder flow and monthly fee reminders
- Cashit webhook endpoint at `/api/cashit/webhook`
- Matched transaction ledger and unmatched reference reconciliation queue

## API Contract

- `POST /api/register`: create a member, application, and optional KYC document record
- `POST /api/field-agent/register`: same registration service, optimized for external Field Agent Dashboard calls
- `GET /api/admin/recruiters`: list SATDWU recruiter profiles with live stats
- `POST /api/admin/recruiters`: create a SATDWU recruiter profile
- `PATCH /api/admin/recruiters/{id}`: update a SATDWU recruiter profile
- `GET /api/admin/recruiters/{id}/report`: return recruiter profile, linked members, and ledger rows
- `PATCH /api/admin/members/{id}`: update editable member profile fields and recruiter assignment
- `POST /api/renew`: return Cashit payment instructions for an existing member; does not change paid-up status
- `POST /api/cashit/mandate`: receive Cashit mandate approval/decline/cancellation state
- `GET /api/billing/cashit/monthly`: export the SATDWU month-end collection list for Cashit
- `GET /api/status/{mobile_or_member_id}`: return current status and grace expiry
- `POST /api/cashit/webhook`: receive Cashit payment, failure, and reversal events

## Cashit Webhook Shape

```json
{
  "event_type": "success",
  "cashit_transaction_id": "cashit_123",
  "member_reference": "0655499876",
  "amount_paid": 130,
  "payment_date": "2026-06-22T10:00:00.000Z"
}
```

Supported `event_type` values: `success`, `failed`, `reversal`.

## Cashit Field Agent Notifications

When an admin sends a fee reminder for a member linked to a referral code, the platform can post a notification to the Cashit Field Agent Dashboard.

Configure these Cloud Run environment variables:

```text
CASHIT_NOTIFICATION_ENDPOINT=https://cashit.africa/api/post_agent_notification.php
CASHIT_NOTIFICATION_TOKEN=<shared secret token>
```

The outbound request uses:

```http
POST https://cashit.africa/api/post_agent_notification.php
Content-Type: application/json
X-SADTWU-NOTIFICATION-TOKEN: <shared secret token>
```

For SATDWU payment reminders the platform sends:

```json
{
  "referral_code": "AGENT-RB-1643",
  "type": "PAYMENT_REMINDER",
  "title": "Membership payment due",
  "message": "Please follow up with this member for their monthly SADTWU renewal.",
  "action_url": "membership.php"
}
```

If `CASHIT_NOTIFICATION_TOKEN` is missing, the SATDWU reminder still works and the Cashit notification is logged as skipped.

## Notes

This scaffold uses a local JSON datastore at `data/db.json` so the Phase 1 workflow can be tested immediately. That file is runtime data and is intentionally ignored by git.

The datastore is shaped around the tech spec tables: `members`, `applications`, `kycDocuments`, `memberLedger`, `cashitTransactions`, and `paymentExceptions`. In production, this persistence layer should be replaced with the mandated single MySQL instance while keeping the API contract and reusable component stable.

The reusable component lives in `public/membership-component.js` and uses host-injected CSS variables:

```css
:root {
  --sd-primary-color: #000;
  --sd-border-radius: 8px;
  --sd-font-family: sans-serif;
  --sd-input-bg: #f9f9f9;
}
```

## External Registration Clients

USSD services, the Cashit Field Agent Dashboard, and other approved spokes should call the central API rather than duplicating registration logic.

Registration request:

```http
POST /api/register
Content-Type: application/json
```

```json
{
  "full_name": "Driver Name",
  "mobile_number": "0820000000",
  "id_number": "9001015009087",
  "branch_id": "cape-town",
  "id_doc_data_url": "",
  "recruiter_code": "SAT-CPT-001",
  "referral_code": "AGENT-RB-1643",
  "agent_slug": "roger-bezuidenhout",
  "source": "field_agent_dashboard"
}
```

The service returns `member_id`, `satdwu_member_number`, `member_reference`, `cashit_account_number`, `mandate_status`, optional `recruiter`, and `application_id`. `member_reference` and `cashit_account_number` are the member's cell number for Cashit payment matching. Browser clients can call the API cross-origin; configure `ALLOWED_ORIGINS` in production to restrict which external domains are allowed.

SATDWU recruiters are union-owned profiles. Cashit field agents are Cashit-owned referral profiles. A member can carry both relationships.

After registration, SATDWU expects Cashit to initiate wallet/account setup and debit mandate approval. Until the final Cashit setup endpoint is confirmed, the registration response includes:

```json
{
  "cashit_setup": {
    "required": true,
    "status": "pending_endpoint"
  }
}
```

Renewal rule: `/api/renew` only returns payment instructions. Paid-up status is extended exclusively by a confirmed successful Cashit webhook.

## Cashit Mandates and Month-End Billing

Cashit should confirm mandate outcomes by calling:

```http
POST /api/cashit/mandate
Content-Type: application/json
X-SATDWU-MANDATE-TOKEN: <shared secret token>
```

The billing export is:

```http
GET /api/billing/cashit/monthly
Authorization: Bearer <admin-session-token>
```

For production service-to-service access, configure `BILLING_API_TOKEN` and call with:

```http
X-SATDWU-BILLING-TOKEN: <shared secret token>
```

The default billing list includes only members with an approved Cashit mandate.

## Field Agent Referral and Commission Flow

The Field Agent Dashboard should pass either `referral_code` or `field_agent_id` when it calls `/api/register`, or mount the reusable component with:

```html
<satdwu-membership
  mode="registration"
  api-base="https://membership.satdwu.org"
  referral-code="AGENT-RB-1643"
  agent-slug="roger-bezuidenhout">
</satdwu-membership>
```

It can also link directly to the membership portal using the same referral format currently used in the Cashit profile:

```text
https://membership.satdwu.org/?ref=AGENT-RB-1643&agent=roger-bezuidenhout
```

The membership platform stores the referral against the member at registration time. The field agent does not earn commission from registration alone. Commission is created only when Cashit sends a confirmed successful payment webhook for that referred member.

Field Agent Dashboard reporting endpoints:

```http
GET /api/field-agents/report?ref=AGENT-RB-1643&agent=roger-bezuidenhout
GET /api/field-agents/report?referral_code=AGENT-RB-1643
GET /api/referrals/AGENT-RB-1643/report
```

The report returns:

- `summary.registrations`
- `summary.pending`
- `summary.active`
- `summary.paidConversions`
- `summary.commissionEarned`
- `members`
- `referrals`
- `commissionEvents`

If Cashit reverses the payment, the member is moved back to unpaid and the related commission event is marked `reversed`.
