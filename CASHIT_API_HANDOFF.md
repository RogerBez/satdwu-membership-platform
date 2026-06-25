# SATDWU Membership Platform - Current API Handoff For Cashit

Prepared for the Cashit technical team.

This document describes the SATDWU API exactly as it exists today on June 24, 2026, and keeps a strict line between:

- what SATDWU already supports now
- what Cashit already published now
- what still needs to be added later

## 1. Current Integration Position

SATDWU is the source of truth for:

- member registration
- SATDWU member number
- member status
- recruiter attribution
- Cashit field-agent attribution
- renewal status
- billing eligibility
- payment reconciliation

Cashit currently provides, from the published external API spec:

- phone number eligibility verification
- OTP send
- OTP verify
- debit request creation
- membership collection batch processing

Important current rule:

SATDWU should not assume that Cashit account creation is completed during SATDWU registration. The SATDWU platform currently models Cashit as a staged onboarding flow:

- `eligibility_pending`
- `eligible`
- `ussd_registration_pending`
- `exists`
- `active`
- `verified`
- `ready`

The live SATDWU API base URL is:

```text
https://satdwu-membership-294346590999.africa-south1.run.app
```

## 1.1 Current Confirmed Flow

This is the flow we can currently defend from the published Cashit API document and the current SATDWU implementation:

1. SATDWU registers the member and creates the SATDWU member record.
2. SATDWU calls Cashit `POST /phone_number_verification`.
3. Cashit returns eligibility, identity details, and SIM-swap details.
4. The member currently completes the debit-approval step through the Cashit-side flow, which we currently understand to be USSD-led.
5. Cashit must then tell SATDWU whether the debit / mandate step is completed.
6. SATDWU stores the returned mandate/debit state through `POST /api/cashit/mandate`.
7. At collection time, SATDWU sends the billing batch and Cashit returns collection results.

Important:

- phone verification does not equal account creation
- phone verification does not equal KYC complete
- phone verification does not equal debit complete
- the member is not collection-ready until Cashit confirms the debit/mandate outcome back to SATDWU

## 1.2 Preferred Pending Flow

This is the preferred version requested from Cashit, but not yet confirmed as approved:

1. SATDWU registers the member.
2. SATDWU calls `POST /phone_number_verification`.
3. Cashit sends an OTP instead of forcing the member out to USSD.
4. The member enters the OTP inside the SATDWU registration journey.
5. SATDWU or the Cashit backend calls:
   - `POST /send_otp`
   - `POST /verify_otp`
   - `POST /create_debit_request`
6. Cashit confirms debit completion back to SATDWU through `POST /api/cashit/mandate`.

This preferred flow keeps the member inside the SATDWU/Cashit registration journey and reduces drop-off from failed or abandoned USSD sessions.

## 2. Current SATDWU Endpoints Available To Cashit

### Public registration and lookup

- `GET /api/bootstrap`
- `POST /api/register`
- `POST /api/field-agent/register`
- `POST /api/renew`
- `GET /api/status/{member_id_or_mobile_or_reference}`
- `GET /api/field-agents/report`
- `GET /api/field-agents/{field_agent_id}/report`
- `GET /api/referrals/{referral_code}/report`

### Cashit-to-SATDWU integration endpoints

- `POST /api/cashit/mandate`
- `GET /api/billing/cashit/monthly`
- `POST /api/cashit/webhook`

## 3. Authentication Status

### Current MVP state

The registration and report endpoints are currently open JSON endpoints for integration and demo use.

The protected service-style endpoints already support token-based protection when configured:

- `POST /api/cashit/mandate`
  - header: `X-SATDWU-MANDATE-TOKEN` or `X-CASHIT-MANDATE-TOKEN`
  - server env: `CASHIT_MANDATE_TOKEN`
- `GET /api/billing/cashit/monthly`
  - header: `X-SATDWU-BILLING-TOKEN`
  - server env: `BILLING_API_TOKEN`
- SATDWU -> Cashit field-agent notifications
  - header: `X-SADTWU-NOTIFICATION-TOKEN`
  - server env: `CASHIT_NOTIFICATION_TOKEN`

### Production recommendation

Before go-live, SATDWU and Cashit should agree on:

- service authentication for all server-to-server calls
- webhook signing
- idempotency handling
- sandbox vs production credentials
- IP allowlisting if available

## 4. Shared Identifiers

### SATDWU member identifiers

- `member_id`: SATDWU internal UUID
- `satdwu_member_number`: SATDWU union member number
- `mobile_number`: member cellphone number
- `member_reference`: SATDWU payment reference currently derived from the member cellphone number
- `cashit_account_number`: blank until Cashit confirms or returns a value

Important:

- `satdwu_member_number` is the union identity
- `member_reference` is the payment matching reference
- `cashit_account_number` should only be treated as confirmed when Cashit sends it back

### Cashit field-agent identifiers

SATDWU can link a registration using any of:

- `referral_code`
- `field_agent_id`
- `agent_slug`

Recommended identifier:

```text
referral_code=AGENT-RB-1643
```

### SATDWU recruiter identifiers

SATDWU recruiters are separate from Cashit field agents.

SATDWU recruiter linking uses:

- `recruiter_code`
- `recruiter_id`

A member may be linked to both:

- a SATDWU recruiter
- a Cashit field agent

## 5. Registration Origins

SATDWU stores where the member came from. Current displayed origins are:

- `Direct`
- `USSD`
- `Field Agent`
- `SATDWU Recruiter`

For Cashit-side registrations, the recommended `source` values are:

- `field_agent_dashboard`
- `ussd`
- `cashit_app`

## 6. Bootstrap Endpoint

Use this to load branch choices before rendering a registration form.

```http
GET /api/bootstrap
```

Example:

```text
https://satdwu-membership-294346590999.africa-south1.run.app/api/bootstrap
```

Success response:

```json
{
  "branches": [
    { "id": "cape-town", "name": "Cape Town", "province": "Western Cape" }
  ],
  "settings": {
    "monthlyFee": 130,
    "graceDays": 30
  },
  "stats": {
    "totalMembers": 2,
    "pending": 0,
    "active": 2,
    "unpaid": 0,
    "collected": 390
  }
}
```

## 7. Register Member

Creates a SATDWU member application and stores attribution.

Both endpoints currently behave the same way:

```http
POST /api/register
POST /api/field-agent/register
Content-Type: application/json
```

### 7.1 Recommended Cashit field-agent payload

```json
{
  "full_name": "Driver Name",
  "first_name": "Driver",
  "surname": "Name",
  "mobile_number": "0820000000",
  "id_number": "9001015009087",
  "branch_id": "cape-town",
  "date_of_birth": "1990-01-01",
  "gender": "Male",
  "residential_address": "Khayelitsha, Cape Town",
  "work_categories": ["Driver"],
  "place_of_work": "Bellville Rank",
  "affiliation": "SANTACO",
  "income_frequency": "Monthly",
  "gross_monthly_income": "8000",
  "stop_order_accepted": true,
  "declaration_accepted": true,
  "member_signature_name": "Driver Name",
  "signed_at": "2026-06-24",
  "referral_code": "AGENT-RB-1643",
  "agent_slug": "roger-bezuidenhout",
  "source": "field_agent_dashboard"
}
```

### 7.2 Minimum required fields

The SATDWU API validates these as required:

- `full_name`
- `first_name`
- `surname`
- `mobile_number`
- `id_number`
- `branch_id`
- `date_of_birth`
- `gender`
- `residential_address`
- `work_categories`
- `place_of_work`
- `affiliation`
- `income_frequency`
- `gross_monthly_income`
- `stop_order_accepted`
- `declaration_accepted`
- `member_signature_name`
- `signed_at`

### 7.3 Optional field-agent linkage fields

- `referral_code`
- `field_agent_id`
- `agent_slug`

Recommended:

- send `referral_code`
- optionally also send `agent_slug`

### 7.4 Success response

```json
{
  "ok": true,
  "member_id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
  "satdwu_member_number": "SATDWU-CAP-000001",
  "member_reference": "0820000000",
  "cashit_account_number": "",
  "mandate_status": "not_requested",
  "application_id": "app_3001",
  "referral": {
    "id": "ref_6001",
    "memberId": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
    "fieldAgentId": "agent_roger_bezuidenhout",
    "fieldAgentName": "Roger Bezuidenhout",
    "referralCode": "AGENT-RB-1643",
    "agentSlug": "roger-bezuidenhout",
    "source": "field_agent_dashboard",
    "status": "attributed",
    "commissionStatus": "pending_payment"
  },
  "field_agent_dashboard": {
    "attributed": true,
    "referral_code": "AGENT-RB-1643",
    "field_agent_id": "agent_roger_bezuidenhout",
    "report_url": "/api/field-agents/report?referral_code=AGENT-RB-1643"
  },
  "cashit_setup": {
    "required": true,
    "status": "awaiting_cashit_eligibility",
    "message": "SATDWU member created. Next step is Cashit eligibility verification, then member onboarding via the currently published Cashit flow."
  }
}
```

### 7.5 Important interpretation

Today this registration response means:

- SATDWU member has been created
- attribution has been stored
- SATDWU has not yet confirmed a Cashit account exists
- SATDWU has not yet confirmed Cashit KYC is complete
- SATDWU has not yet confirmed mandate approval

### 7.6 Error responses

Missing fields:

```json
{
  "error": "Missing required fields",
  "details": ["mobile_number"]
}
```

Duplicate mobile or ID:

```json
{
  "error": "A member with that mobile or ID number already exists"
}
```

## 8. Renewal / Amount Due

This does not mark the member paid-up. It only returns the amount due and payment reference.

```http
POST /api/renew
Content-Type: application/json
```

Request example:

```json
{
  "member_id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b"
}
```

or:

```json
{
  "mobile_number": "0820000000"
}
```

Success response:

```json
{
  "ok": true,
  "payment_required": true,
  "member_id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
  "member_reference": "0820000000",
  "amount_due": 130,
  "grace_expiry_date": "2026-07-24T10:00:00.000Z",
  "instructions": "Pay R130 via Cashit using cell number 0820000000. Membership status updates only after Cashit confirms payment."
}
```

## 9. Member Status Lookup

```http
GET /api/status/{member_id_or_mobile_or_reference}
```

Example:

```text
https://satdwu-membership-294346590999.africa-south1.run.app/api/status/0820000000
```

Success response:

```json
{
  "member_id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
  "mobile_number": "0820000000",
  "status": "active",
  "status_label": "Active / Paid-Up",
  "grace_expiry_date": "2026-07-24T10:00:00.000Z",
  "member_reference": "0820000000",
  "member": {
    "memberNumber": "SATDWU-CAP-000001",
    "branchName": "Cape Town",
    "registrationOrigin": {
      "key": "field_agent",
      "label": "Field Agent"
    },
    "cashitWalletStatus": {
      "key": "eligible",
      "label": "Eligible for Cashit Registration",
      "tone": "green"
    },
    "kycStatus": {
      "key": "missing",
      "label": "Cashit KYC Not Started",
      "tone": "muted"
    }
  }
}
```

## 10. Cashit Mandate Callback

SATDWU already supports a mandate callback endpoint.

```http
POST /api/cashit/mandate
Content-Type: application/json
X-SATDWU-MANDATE-TOKEN: <shared secret token>
```

Yes: this is the current SATDWU endpoint Cashit should use to tell us that the debit / mandate step has been completed, failed, or is still pending.

Accepted `mandate_status` values:

- `pending`
- `approved`
- `declined`
- `cancelled`
- `expired`

Recommended payload:

```json
{
  "satdwu_member_id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
  "cashit_account_number": "0820000000",
  "wallet_status": "exists",
  "mandate_id": "mandate_123",
  "mandate_status": "approved",
  "approval_method": "USSD",
  "approved_at": "2026-06-24T10:00:00.000Z"
}
```

What SATDWU does with it:

- stores `cashit_account_number`
- stores `wallet_status`
- stores `mandate_id`
- stores `mandate_status`
- stores `approval_method`
- stores sync timestamps

Current interpretation:

- `mandate_status = approved` means the member can be treated as mandate-complete on the SATDWU side
- `mandate_status = pending` means the member is still in-flight and not yet collectible
- `mandate_status = declined`, `cancelled`, or `expired` means the member is not yet collectible

## 11. Month-End Billing Export

SATDWU already exposes a billing export endpoint.

```http
GET /api/billing/cashit/monthly
Authorization: Bearer <admin token>
```

or service-token mode:

```http
GET /api/billing/cashit/monthly
X-SATDWU-BILLING-TOKEN: <shared secret token>
```

Optional test parameter:

```text
?include_pending=1
```

Success response:

```json
{
  "billing_run_id": "satdwu-2026-06",
  "union": "SATDWU",
  "collection_window": {
    "primary_date": "2026-06-30",
    "retry_dates": ["2026-07-01", "2026-07-02"]
  },
  "eligibility": {
    "include_pending_mandates": false,
    "required_mandate_status": "approved"
  },
  "members": [
    {
      "satdwu_member_id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
      "satdwu_member_number": "SATDWU-CAP-000001",
      "full_name": "Driver Name",
      "id_number": "9001015009087",
      "mobile_number": "0820000000",
      "cashit_account_number": "0820000000",
      "mandate_id": "mandate_123",
      "mandate_status": "approved",
      "amount": 130,
      "currency": "ZAR",
      "referral_code": "AGENT-RB-1643",
      "recruiter_code": "SAT-CPT-001"
    }
  ]
}
```

## 12. Cashit Payment Webhook

SATDWU already accepts payment result webhooks.

```http
POST /api/cashit/webhook
Content-Type: application/json
```

Current accepted event types:

- `success`
- `paid`
- `failed`
- `reversal`
- `reversed`

Recommended payload:

```json
{
  "event_type": "success",
  "cashit_transaction_id": "cashit_123",
  "member_reference": "0820000000",
  "amount_paid": 130,
  "payment_date": "2026-06-24T10:00:00.000Z"
}
```

Current behavior:

- `success` / `paid`
  - creates ledger entry
  - activates the member
  - extends grace expiry
  - creates first-payment commission if applicable
- `failed`
  - creates a failed ledger entry
- `reversal` / `reversed`
  - creates reversal entry
  - moves member to unpaid
  - reverses earned commission where applicable
- unmatched references
  - are parked in finance reconciliation queue

## 13. Field-Agent Reporting API

Cashit Field Agent Dashboard can already read attributed-member reporting from SATDWU.

### 13.1 Query by referral code

```http
GET /api/field-agents/report?referral_code=AGENT-RB-1643
```

### 13.2 Query by field agent ID

```http
GET /api/field-agents/agent_roger_bezuidenhout/report
```

### 13.3 Query by path referral code

```http
GET /api/referrals/AGENT-RB-1643/report
```

### 13.4 Accepted query keys

- `field_agent_id`
- `fieldAgentId`
- `agent_id`
- `agentId`
- `referral_code`
- `referralCode`
- `ref`
- `agent_slug`
- `agentSlug`
- `agent`
- `slug`

### 13.5 Success response shape

```json
{
  "agent": {
    "id": "agent_roger_bezuidenhout",
    "referralCode": "AGENT-RB-1643",
    "slug": "roger-bezuidenhout",
    "fullName": "Roger Bezuidenhout",
    "status": "active"
  },
  "summary": {
    "registrations": 12,
    "pending": 2,
    "active": 8,
    "unpaid": 2,
    "suspended": 0,
    "cancelled": 0,
    "paidConversions": 8,
    "commissionEarned": 0,
    "commissionReversed": 0
  },
  "referrals": [],
  "members": [],
  "commissionEvents": []
}
```

## 14. SATDWU To Cashit Field-Agent Notification

SATDWU already supports sending a follow-up notification into the Cashit dashboard.

```http
POST https://cashit.africa/api/post_agent_notification.php
Content-Type: application/json
X-SADTWU-NOTIFICATION-TOKEN: <shared secret token>
```

Current SATDWU usage:

- when an admin sends a fee reminder for a referred member

Payload example:

```json
{
  "referral_code": "AGENT-RB-1643",
  "type": "PAYMENT_REMINDER",
  "title": "Membership payment due",
  "message": "Please follow up with Driver Name for their monthly SADTWU renewal.",
  "action_url": "membership.php"
}
```

## 15. What SATDWU Needs Cashit To Build Next

These are the next integration gaps, in priority order:

1. Cashit eligibility verification call wired into the SATDWU registration journey
2. a confirmed onboarding-complete / account-created callback or lookup
3. a confirmed KYC-complete callback or lookup
4. a clear account number confirmation field
5. webhook signing and idempotency

Important:

The SATDWU API today is ready for:

- member creation
- referral attribution
- report retrieval
- mandate callback
- billing export
- payment webhook ingestion

The main missing Cashit-side piece is the onboarding status handshake after member creation.
