# Cashit Integration Questions

This document tracks open questions that need answers from the Cashit team before the SATDWU membership platform can safely automate payments, renewals, KYC reuse, USSD actions, and field-agent notifications.

## 1. Cashit Account Number

Current assumption:

- The member's Cashit account number is their cell number.

Questions:

- Is the Cashit account number always the member's cell number?
- Can one cell number have multiple Cashit-linked accounts?
- What format should SATDWU store: local format `065...`, international `+2765...`, or digits-only?
- Does Cashit require a separate merchant/customer/account ID?
- Can Cashit validate whether a cell number exists before SATDWU shows it as a payment account?

## 2. Renewal / Payment Initiation

Current SATDWU behavior:

- The member clicks renewal/check amount.
- SATDWU shows the amount and Cashit payment instructions.
- SATDWU waits for a Cashit webhook before changing the member to paid-up.

Questions:

- Does Cashit have an API to initiate a payment request?
- Can SATDWU request a USSD session for the member?
- Can Cashit return a payment link?
- Can Cashit return a payment intent ID that SATDWU can track?
- Can Cashit tell SATDWU that a payment is pending before it is completed?
- What statuses can a payment have?
- How long does a payment intent/session remain valid?

## 3. Webhook Confirmation

Current webhook assumption:

```json
{
  "event_type": "success",
  "cashit_transaction_id": "cashit_123",
  "member_reference": "0655499876",
  "amount_paid": 130,
  "payment_date": "2026-06-22T10:00:00.000Z"
}
```

Questions:

- What is the official Cashit webhook payload?
- What event names does Cashit send?
- How does Cashit sign webhooks?
- What header should SATDWU validate?
- Does Cashit retry failed webhook deliveries?
- How should SATDWU acknowledge a webhook?
- Can a webhook be delivered more than once?
- What is the unique idempotency key?
- Can Cashit send reversals or chargebacks?
- Can Cashit send failed payment events?

## 4. Amounts and Fees

Questions:

- Can Cashit enforce the required SATDWU amount?
- Can a member underpay or overpay?
- If the member pays a partial amount, what does Cashit send?
- Who pays Cashit transaction fees?
- Does the webhook include gross amount, net amount, and fee amount?
- Does Cashit support recurring monthly payments or only once-off payments?

## 5. USSD

Questions:

- Can SATDWU trigger a Cashit USSD session for a member?
- If yes, what API endpoint is used?
- What fields are required?
- Does the member receive a push/USSD prompt automatically?
- Can Cashit return a USSD string/code for SATDWU to display?
- Can SATDWU deep-link into a Cashit USSD flow?
- What happens if the member abandons the USSD session?

## 6. SMS and Payment Links

Questions:

- Can Cashit send payment SMS messages on SATDWU's behalf?
- Can SATDWU send its own SMS with a Cashit payment link?
- Does Cashit provide short links?
- Does Cashit require consent/opt-in before payment SMS messages are sent?
- Can the SMS include the SATDWU member number and Cashit cell-number account?

## 7. KYC

Core question:

- Can SATDWU reuse Cashit's KYC process rather than duplicating KYC?

Questions:

- Does Cashit verify member identity/KYC?
- Can Cashit expose KYC status to SATDWU?
- Can Cashit expose KYC evidence or only a verification result?
- What consent is required for SATDWU to use Cashit KYC?
- What fields are verified?
- Does Cashit verify ID number, name, mobile, and photo?
- How often does KYC need to be refreshed?
- What happens if Cashit KYC fails?

Recommended SATDWU position:

- Use Cashit KYC where it is verified and legally shareable.
- Store SATDWU's own KYC status and Cashit verification reference.
- Keep manual SATDWU KYC fallback for members not verified through Cashit.

## 8. Field Agent Dashboard Notifications

Received API contract:

```http
POST https://cashit.africa/api/post_agent_notification.php
Content-Type: application/json
X-SADTWU-NOTIFICATION-TOKEN: <shared secret token>
```

Example body:

```json
{
  "referral_code": "AGENT-RB-1643",
  "type": "MEMBERSHIP",
  "title": "Membership renewal due",
  "message": "Please follow up with this member for their monthly SADTWU renewal.",
  "action_url": "membership.php"
}
```

Allowed types:

- `SYSTEM`
- `COMMISSION`
- `WITHDRAWAL`
- `SECURITY`
- `PROMOTIONAL`
- `PAYMENT_REMINDER`
- `MEMBERSHIP`

Identification options:

- `agent_id`
- `referral_code`
- `mobile`

Current SATDWU implementation decision:

- Use `referral_code` when available.
- Use `PAYMENT_REMINDER` for fee reminder actions.
- Keep SATDWU reminder creation successful even if the Cashit notification fails.
- Log notification result in the SATDWU datastore.

Configuration still required:

- Set `CASHIT_NOTIFICATION_TOKEN` on SATDWU Cloud Run.
- Set the same token as `CASHIT_NOTIFICATION_TOKEN` on the Cashit cPanel side.

Remaining questions:

- Can SATDWU notify Cashit when a referred member pays?
- Can SATDWU notify Cashit when a commission is earned or reversed?
- Can the Cashit dashboard call SATDWU reporting endpoints directly?
- Should `MEMBERSHIP` or `PAYMENT_REMINDER` be preferred for monthly renewal reminders?
- Should `action_url` stay `membership.php`, or should it include a member/referral context query string?

## 9. Commissions

Current SATDWU assumption:

- A field agent earns commission only after the member's first confirmed Cashit payment.

Questions:

- Who calculates commission: SATDWU or Cashit?
- Does Cashit need to receive commission events from SATDWU?
- Can Cashit pay commission automatically?
- What happens if the first payment is reversed?
- Is commission earned once-off or monthly?
- Are union-appointed agents and Cashit field agents paid differently?

## 10. Security

Questions:

- How should SATDWU authenticate to Cashit APIs?
- How should Cashit authenticate to SATDWU webhooks?
- Are API keys enough, or does Cashit require OAuth/client credentials?
- Should SATDWU whitelist Cashit IP addresses?
- Does Cashit support separate sandbox and production environments?
- Who rotates credentials?

## 11. Reporting

Questions:

- What reporting does Cashit need from SATDWU?
- What reporting should SATDWU consume from Cashit?
- Should Cashit Field Agent Dashboard own its own reporting UI?
- Should SATDWU only expose API data for Cashit field-agent reporting?
- What date ranges, statuses, and commission fields are required?

## 12. Production Readiness

Questions:

- Is there a Cashit sandbox?
- Are test accounts available?
- Are test field agents available?
- Are test payment events available?
- What are the API rate limits?
- What are the expected webhook delivery times?
- Who is the Cashit technical contact for integration sign-off?
