Hi Denje,

Thank you, this discussion helped clarify the flow.

My understanding now is that the first Cashit API call does not create the member's Cashit account. It is an eligibility check to confirm that the cellphone number and person are valid to proceed, for example that the member has a valid RSA ID and has not had a recent SIM swap.

From the SATDWU side, that means we should not treat the first verification response as "Cashit account created" or "KYC complete". It tells us the member is eligible to continue, but not yet fully onboarded into Cashit.

The current understanding of the operational flow is:

1. The member registers on SATDWU.
2. SATDWU creates the SATDWU member record and SATDWU member number.
3. SATDWU checks the member's eligibility with Cashit.
4. The member then continues the Cashit process to open or activate their Cashit account.
5. When the member tops up or funds that account, KYC is completed as part of the Cashit journey.
6. Once that has happened, SATDWU needs confirmation back from Cashit so we know the member is ready for collections.

So from a SATDWU platform point of view, the stages should be separated as follows:

- Registered with SATDWU
- Eligible for Cashit
- Cashit account opened
- Cashit account funded / topped up
- Cashit KYC completed
- Mandate approved
- Ready for collection

This is important because SATDWU is the source of truth for membership, while Cashit is the source of truth for wallet/account, KYC, and payment readiness.

The key integration gap we still need to define clearly is how Cashit confirms these status changes back to SATDWU. In particular, we need to know how SATDWU will be told when:

- the Cashit account has been created
- the account has been funded or topped up
- KYC is complete
- the member is ready for debit / collection

If there is already an API, webhook, or status lookup for these milestones, that would help us design the SATDWU workflow correctly.

From our side, we want to avoid overstating the status in the SATDWU platform. So instead of one generic "KYC done" flag, we will likely show these as separate stages unless Cashit gives us a single definitive readiness status we can rely on.

Please let us know if this understanding is correct, and especially what the best mechanism is for SATDWU to receive the account creation, KYC, and payment-readiness updates from Cashit.

Thanks,
Roger
