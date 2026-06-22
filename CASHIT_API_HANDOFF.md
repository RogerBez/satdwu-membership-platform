# SATDWU Membership Platform - Cashit API Handoff

Prepared for the Cashit technical team.

## 1. Overview

The SATDWU Membership Platform is the source of truth for union membership registration, member status, renewals, payment reconciliation, and field-agent attribution.

Cashit integration has three main responsibilities:

1. Cashit or Cashit Field Agent Dashboard registers members into SATDWU.
2. SATDWU sends member details and linked cell/payment account details to Cashit for wallet and debit mandate setup.
3. Cashit asks the member to approve the debit mandate through webpage, USSD, SMS, OTP, or wallet flow.
4. Cashit confirms mandate approval/decline back to SATDWU.
5. SATDWU sends Cashit the month-end billing list.
6. Cashit sends confirmed payment/failure/reversal events back to SATDWU.
7. SATDWU sends field-agent notifications back to the Cashit Field Agent Dashboard.

Live SATDWU API base URL:

```text
https://satdwu-membership-294346590999.africa-south1.run.app
```

Current environment:

- Hosting: Google Cloud Run
- Database: Firebase Firestore
- Region: `africa-south1`
- Content type: JSON

## 2. Authentication

### 2.1 Current MVP Status

The public integration endpoints currently accept JSON without a production API key.

These endpoints are intended for external integration:

- `POST /api/register`
- `POST /api/field-agent/register`
- `POST /api/renew`
- `GET /api/status/{member}`
- `GET /api/field-agents/report`
- `GET /api/referrals/{referral_code}/report`
- `POST /api/cashit/mandate`
- `GET /api/billing/cashit/monthly`
- `POST /api/cashit/webhook`

### 2.2 Required Production Hardening

Before production use, SATDWU and Cashit should agree on:

- API key or OAuth/client-credential authentication for Cashit-to-SATDWU calls.
- Webhook signature validation for Cashit payment webhooks.
- IP allowlisting if Cashit supports fixed egress IPs.
- Sandbox and production credentials.

### 2.3 SATDWU-to-Cashit Notification Auth

SATDWU sends notifications to Cashit using:

```http
X-SADTWU-NOTIFICATION-TOKEN: <shared secret token>
```

The same shared token must be configured on:

- SATDWU Cloud Run: `CASHIT_NOTIFICATION_TOKEN`
- Cashit cPanel: `CASHIT_NOTIFICATION_TOKEN`

## 3. Shared Concepts

### 3.1 Member Identifiers

SATDWU stores:

- `member_id`: SATDWU internal UUID.
- `memberNumber`: SATDWU membership number, assigned on approval.
- `mobile_number`: Member cellphone number.
- `member_reference`: Current payment reference used for Cashit matching. Current assumption: this is the member cellphone number.
- `cashit_account_number`: Linked cell number/account number to use at Cashit. Current assumption: same as `mobile_number`.
- `cashit_mandate_status`: Debit mandate state returned by Cashit.

Important product note:

SATDWU member number should remain the main union identity. The Cashit cell/account number should be treated as the payment account/reference.

### 3.2 Field Agent Identifiers

SATDWU can link a member to a Cashit field agent using any of:

- `referral_code` - recommended.
- `field_agent_id`
- `agent_slug`

Recommended:

```text
referral_code=AGENT-RB-1643
```

### 3.3 Registration Origins

SATDWU tracks where a member originated:

- `Direct`
- `USSD`
- `Field Agent`

Cashit should pass a clear `source` value when registering members:

- `field_agent_dashboard`
- `ussd`
- `cashit_app`

## 4. Register Member

Creates a pending SATDWU member application.

The same registration service must support:

- Direct SATDWU registration.
- USSD-originated registration if required.
- Cashit Field Agent Dashboard registration.

For Field Agent Dashboard registrations, Cashit should pass `referral_code` where possible so SATDWU can link the member to the correct field agent.

```http
POST /api/register
Content-Type: application/json
```

Full URL:

```text
https://satdwu-membership-294346590999.africa-south1.run.app/api/register
```

### 4.1 Request Body

```json
{
  "full_name": "Driver Name",
  "mobile_number": "0820000000",
  "id_number": "9001015009087",
  "branch_id": "cape-town",
  "id_doc_data_url": "",
  "referral_code": "AGENT-RB-1643",
  "agent_slug": "roger-bezuidenhout",
  "source": "field_agent_dashboard"
}
```

### 4.2 Required Fields

- `full_name`
- `mobile_number`
- `id_number`
- `branch_id`

### 4.3 Optional Field-Agent Attribution Fields

Cashit can send one or more:

- `referral_code`
- `field_agent_id`
- `agent_slug`

Recommended:

- Send `referral_code`.

### 4.4 Optional KYC Field

- `id_doc_data_url`: base64/data URL for ID document image.

Current MVP accepts inline image data. For production, SATDWU and Cashit should agree whether KYC evidence is:

- Sent as base64.
- Sent as a file upload.
- Referenced using a Cashit KYC verification ID.
- Reused from Cashit KYC instead of uploaded to SATDWU.

### 4.5 Success Response

```json
{
  "ok": true,
  "member_id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
  "satdwu_member_number": "SATDWU-000777",
  "member_reference": "0820000000",
  "cashit_account_number": "0820000000",
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
  "member": {
    "id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
    "mobile": "0820000000",
    "memberNumber": "SATDWU-000777",
    "paymentReference": "0820000000",
    "status": {
      "key": "pending",
      "label": "Pending Approval",
      "tone": "orange"
    },
    "registrationOrigin": {
      "key": "field_agent",
      "label": "Field Agent"
    }
  },
  "field_agent_dashboard": {
    "attributed": true,
    "referral_code": "AGENT-RB-1643",
    "field_agent_id": "agent_roger_bezuidenhout",
    "report_url": "/api/field-agents/report?referral_code=AGENT-RB-1643"
  },
  "cashit_setup": {
    "required": true,
    "status": "pending_endpoint",
    "message": "SATDWU member created. Cashit wallet/mandate setup endpoint is still to be confirmed."
  }
}
```

### 4.6 Error Responses

Missing required fields:

```http
400 Bad Request
```

```json
{
  "error": "Missing required fields",
  "details": ["mobile_number"]
}
```

Duplicate mobile or ID number:

```http
409 Conflict
```

```json
{
  "error": "A member with that mobile or ID number already exists"
}
```

## 5. Renew / Check Renewal Amount

Returns payment instructions for a member.

This endpoint does not renew the member. Membership status changes only after SATDWU receives a confirmed successful Cashit payment webhook.

```http
POST /api/renew
Content-Type: application/json
```

Full URL:

```text
https://satdwu-membership-294346590999.africa-south1.run.app/api/renew
```

### 5.1 Request Body

Any of these lookup values can be sent:

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

### 5.2 Success Response

```json
{
  "ok": true,
  "payment_required": true,
  "member_id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
  "member_reference": "0820000000",
  "amount_due": 130,
  "grace_expiry_date": "2026-07-22T10:00:00.000Z",
  "status": {
    "key": "unpaid",
    "label": "Payment Due / Unpaid",
    "tone": "red"
  },
  "instructions": "Pay R130 via Cashit using cell number 0820000000. Membership status updates only after Cashit confirms payment."
}
```

### 5.3 Error Responses

Member not found:

```http
404 Not Found
```

```json
{
  "error": "Member not found"
}
```

Cancelled/suspended member:

```http
409 Conflict
```

```json
{
  "error": "Member is suspended and cannot be renewed without admin review"
}
```

## 6. Cashit Wallet / Account And Debit Mandate Setup

This is the next required Cashit integration.

After SATDWU creates a member, SATDWU must send Cashit:

- SATDWU member ID
- SATDWU member number
- Member name
- Member ID number
- Linked cell number that should be the Cashit account number
- Monthly amount
- Mandate description
- Referral code, if applicable

Cashit should then ask the member to approve the debit mandate through their preferred method:

- webpage
- USSD
- SMS
- OTP
- Cashit wallet menu

### 6.1 Proposed SATDWU-To-Cashit Request

Cashit to confirm endpoint.

```http
POST <cashit-mandate-setup-endpoint>
Content-Type: application/json
Authorization: <to be confirmed>
```

```json
{
  "satdwu_member_id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
  "satdwu_member_number": "SATDWU-000777",
  "full_name": "Driver Name",
  "id_number": "9001015009087",
  "mobile_number": "0820000000",
  "cashit_account_number": "0820000000",
  "monthly_amount": 130,
  "currency": "ZAR",
  "mandate_description": "SATDWU monthly membership fee",
  "referral_code": "AGENT-RB-1643"
}
```

### 6.2 Expected Cashit Response

Cashit to confirm exact response.

```json
{
  "success": true,
  "cashit_account_number": "0820000000",
  "wallet_status": "exists",
  "mandate_id": "mandate_123",
  "mandate_status": "pending",
  "approval_method": "USSD",
  "message": "Mandate approval request sent to member."
}
```

### 6.3 Cashit Mandate Status Callback

Cashit should send SATDWU the mandate result.

SATDWU endpoint:

```http
POST /api/cashit/mandate
Content-Type: application/json
X-SATDWU-MANDATE-TOKEN: <shared secret token>
```

Proposed payload:

```json
{
  "mandate_id": "mandate_123",
  "satdwu_member_id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
  "cashit_account_number": "0820000000",
  "mandate_status": "approved",
  "approved_at": "2026-06-22T10:00:00.000Z",
  "approval_method": "USSD"
}
```

Proposed mandate statuses:

- `pending`
- `approved`
- `declined`
- `cancelled`
- `expired`

Current implementation note: if `CASHIT_MANDATE_TOKEN` is configured on Cloud Run, SATDWU validates `X-SATDWU-MANDATE-TOKEN` or `X-CASHIT-MANDATE-TOKEN`. Before production, this token must be configured.

## 7. Get Member Status

Returns a member's current SATDWU status.

```http
GET /api/status/{member_id_or_mobile_or_reference}
```

Example:

```text
https://satdwu-membership-294346590999.africa-south1.run.app/api/status/0820000000
```

### 7.1 Success Response

```json
{
  "member_id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
  "mobile_number": "0820000000",
  "status": "active",
  "status_label": "Active / Paid-Up",
  "grace_expiry_date": "2026-07-22T10:00:00.000Z",
  "member_reference": "0820000000",
  "member": {
    "memberNumber": "SATDWU-000777",
    "branchName": "Cape Town",
    "registrationOrigin": {
      "key": "field_agent",
      "label": "Field Agent"
    }
  }
}
```

### 7.2 Status Values

Current status keys:

- `pending`
- `active`
- `unpaid`
- `suspended`
- `cancelled`

## 8. Month-End Billing List

At month-end, SATDWU sends Cashit the list of members to collect from.

Current meeting decision:

- SATDWU sends JSON billing list to Cashit.
- Later this can be optimized to send only additions/removals/changes.
- Cashit runs collections.
- Cashit returns success/failure/reversal results.

### 8.1 SATDWU Billing Export Endpoint

SATDWU exposes the current billing list here:

```http
GET /api/billing/cashit/monthly
Authorization: Bearer <admin-session-token>
```

Optional service-token mode:

```http
GET /api/billing/cashit/monthly
X-SATDWU-BILLING-TOKEN: <shared secret token>
```

`X-SATDWU-BILLING-TOKEN` only works once `BILLING_API_TOKEN` is configured on Cloud Run.

By default the endpoint includes only members with approved Cashit mandates. For testing, SATDWU admins can request:

```text
/api/billing/cashit/monthly?include_pending=1
```

### 8.2 Proposed Billing List Payload

Cashit to confirm final endpoint and required fields.

```http
POST <cashit-monthly-billing-endpoint>
Content-Type: application/json
Authorization: <to be confirmed>
```

```json
{
  "billing_run_id": "satdwu-2026-06",
  "union": "SATDWU",
  "collection_window": {
    "primary_date": "2026-06-30",
    "retry_dates": ["2026-07-01", "2026-07-02"]
  },
  "members": [
    {
      "satdwu_member_id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
      "satdwu_member_number": "SATDWU-000777",
      "full_name": "Driver Name",
      "mobile_number": "0820000000",
      "cashit_account_number": "0820000000",
      "mandate_id": "mandate_123",
      "amount": 130,
      "currency": "ZAR",
      "referral_code": "AGENT-RB-1643"
    }
  ]
}
```

### 8.3 Billing Eligibility Rules

SATDWU should only include members where:

- Member is not cancelled or suspended.
- Cashit account/cell number is linked.
- Cashit debit mandate is approved.
- Member is due for collection.

### 8.4 Expected Cashit Result Reasons

Cashit should return or webhook detailed outcomes:

- `success`
- `insufficient_funds`
- `mandate_not_approved`
- `mandate_cancelled`
- `wallet_not_found`
- `account_inactive`
- `reversed`
- `failed`

## 9. Cashit Payment Webhook

Cashit should call this endpoint when payment events occur.

```http
POST /api/cashit/webhook
Content-Type: application/json
```

Full URL:

```text
https://satdwu-membership-294346590999.africa-south1.run.app/api/cashit/webhook
```

### 9.1 Current MVP Request Body

```json
{
  "event_type": "success",
  "cashit_transaction_id": "cashit_123",
  "member_reference": "0820000000",
  "amount_paid": 130,
  "payment_date": "2026-06-22T10:00:00.000Z"
}
```

### 9.2 Supported Event Types

Current accepted values:

- `success`
- `paid`
- `failed`
- `reversal`
- `reversed`

### 9.3 Successful Payment Behavior

When `event_type` is `success` or `paid`:

- SATDWU matches the member using `member_reference`.
- SATDWU creates a transaction ledger record.
- SATDWU sets the member to `active`.
- SATDWU extends `graceExpiry` by the configured grace period.
- SATDWU clears fee reminders.
- If the member was referred, SATDWU creates first-payment commission event if not already earned.

### 9.4 Success Response - Matched Payment

```json
{
  "matched": true,
  "member": {
    "id": "7fb8c9e1-65d4-4eaa-b9a8-0c801f6f0d8b",
    "status": {
      "key": "active",
      "label": "Active / Paid-Up",
      "tone": "green"
    }
  },
  "transaction": {
    "id": "txn_5001",
    "cashitTransactionId": "cashit_123",
    "memberReference": "0820000000",
    "amountPaid": 130,
    "type": "success",
    "transactionType": "credit"
  },
  "commission": {
    "id": "comm_7001",
    "commissionType": "first_confirmed_payment",
    "status": "earned"
  }
}
```

### 9.5 Success Response - Unmatched Payment

If the payment reference does not match any SATDWU member:

```http
202 Accepted
```

```json
{
  "matched": false,
  "message": "Payment logged for finance reconciliation"
}
```

SATDWU stores the payment in the unmatched finance queue.

### 9.6 Failed Payment Response

```json
{
  "matched": true,
  "transaction": {
    "id": "txn_5002",
    "type": "failed",
    "transactionType": "debit",
    "failureReason": "Insufficient funds"
  }
}
```

### 9.7 Reversal Behavior

When `event_type` is `reversal` or `reversed`:

- SATDWU records a reversal transaction.
- SATDWU moves the member to `unpaid`.
- SATDWU expires the member grace period.
- SATDWU marks related earned commission as `reversed`.

### 9.8 Required Webhook Confirmation From Cashit

SATDWU needs the Cashit team to confirm the production webhook contract:

- Official event names.
- Required fields.
- Signature header and validation algorithm.
- Retry behavior.
- Idempotency key.
- Reversal and chargeback behavior.
- Whether `member_reference` should be cellphone, Cashit account ID, SATDWU member number, or another value.

## 10. Field Agent Reporting

Cashit Field Agent Dashboard can request reporting from SATDWU.

### 10.1 Query by Referral Code

```http
GET /api/field-agents/report?referral_code=AGENT-RB-1643
```

Alternative:

```http
GET /api/field-agents/report?ref=AGENT-RB-1643
```

Full URL:

```text
https://satdwu-membership-294346590999.africa-south1.run.app/api/field-agents/report?referral_code=AGENT-RB-1643
```

### 10.2 Query by Path Referral Code

```http
GET /api/referrals/AGENT-RB-1643/report
```

### 10.3 Query by Field Agent ID

```http
GET /api/field-agents/{field_agent_id}/report
```

### 10.4 Query Parameters

Accepted identifiers:

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

Recommended:

- Use `referral_code`.

### 10.5 Success Response

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

## 11. SATDWU-to-Cashit Field Agent Notifications

SATDWU can send a notification to the Cashit Field Agent Dashboard.

Cashit endpoint:

```http
POST https://cashit.africa/api/post_agent_notification.php
Content-Type: application/json
X-SADTWU-NOTIFICATION-TOKEN: <shared secret token>
```

### 11.1 Current SATDWU Trigger

SATDWU sends a notification when:

- A union admin clicks the fee reminder action.
- The member is linked to a referral code.
- `CASHIT_NOTIFICATION_TOKEN` is configured on SATDWU Cloud Run.

If the token is missing, SATDWU still creates the reminder and logs the Cashit notification as `skipped`.

### 11.2 Request Body Sent by SATDWU

For payment reminders:

```json
{
  "referral_code": "AGENT-RB-1643",
  "type": "PAYMENT_REMINDER",
  "title": "Membership payment due",
  "message": "Please follow up with Driver Name for their monthly SADTWU renewal.",
  "action_url": "membership.php"
}
```

### 11.3 Cashit Success Response

Expected:

```json
{
  "success": true,
  "notification_id": 123,
  "agent_id": 45
}
```

### 11.4 Cashit Error Responses

Expected:

- `401 Unauthorized`: token missing or wrong.
- `422`: missing required fields.
- `404`: field agent not found.
- `503`: token not configured on Cashit server.

### 11.5 Allowed Types

Cashit allows:

- `SYSTEM`
- `COMMISSION`
- `WITHDRAWAL`
- `SECURITY`
- `PROMOTIONAL`
- `PAYMENT_REMINDER`
- `MEMBERSHIP`

SATDWU currently uses:

- `PAYMENT_REMINDER` for fee reminders.

## 12. CORS

The SATDWU API currently supports browser clients.

Production recommendation:

- Cashit domains should be explicitly allowlisted using `ALLOWED_ORIGINS`.
- Do not leave public browser CORS unrestricted in production.

## 13. Branch IDs

Current demo branch IDs:

- `cape-town`
- `bellville`
- `durban`
- `johannesburg`
- `pretoria`

Cashit should request `/api/bootstrap` to load available branches if rendering a registration UI.

```http
GET /api/bootstrap
```

## 14. API Examples

### 14.1 Register From Cashit Field Agent Dashboard

```bash
curl -X POST "https://satdwu-membership-294346590999.africa-south1.run.app/api/register" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "Driver Name",
    "mobile_number": "0820000000",
    "id_number": "9001015009087",
    "branch_id": "cape-town",
    "referral_code": "AGENT-RB-1643",
    "agent_slug": "roger-bezuidenhout",
    "source": "field_agent_dashboard"
  }'
```

### 14.2 Check Member Status

```bash
curl "https://satdwu-membership-294346590999.africa-south1.run.app/api/status/0820000000"
```

### 14.3 Send Payment Webhook

```bash
curl -X POST "https://satdwu-membership-294346590999.africa-south1.run.app/api/cashit/webhook" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "success",
    "cashit_transaction_id": "cashit_123",
    "member_reference": "0820000000",
    "amount_paid": 130,
    "payment_date": "2026-06-22T10:00:00.000Z"
  }'
```

### 14.4 Read Field Agent Report

```bash
curl "https://satdwu-membership-294346590999.africa-south1.run.app/api/field-agents/report?referral_code=AGENT-RB-1643"
```

## 15. Open Decisions For Cashit And SATDWU

These need final agreement before production:

1. Confirm that linked member cell number should be the Cashit account number.
2. Confirm the endpoint for wallet/account lookup or creation.
3. Confirm the endpoint for debit mandate approval initiation.
4. Confirm the callback/webhook format for mandate approved/declined/cancelled.
5. Confirm the month-end billing list endpoint and required JSON format.
6. Confirm whether Cashit supports manual payment initiation from SATDWU.
7. Confirm whether SATDWU can initiate a USSD session or display a Cashit payment link.
8. Confirm whether SATDWU can reuse Cashit KYC verification.
9. Confirm the official Cashit payment webhook signature scheme.
10. Confirm the official Cashit idempotency key.
11. Confirm whether renewal notifications should use `MEMBERSHIP` or `PAYMENT_REMINDER`.
12. Confirm whether `action_url` should include member-specific context.
13. Confirm whether Cashit dashboard consumes SATDWU reports directly, or stores its own reporting copy.

## 16. Current Implementation Notes

Current live revision includes:

- Member registration.
- Referral attribution.
- Renewal amount check.
- Cashit webhook receiver.
- Field-agent reporting API.
- SATDWU-to-Cashit notification sender.
- Admin fee reminders.
- Finance unmatched payment queue.

Known MVP limitations:

- Public integration endpoints still need production authentication.
- Webhook signature validation is not implemented yet.
- Firestore storage is currently a lite MVP state document, not final normalized collections.
- Cashit notification token must still be configured on Cloud Run and Cashit cPanel.
