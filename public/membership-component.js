class SatdwuMembership extends HTMLElement {
  static get observedAttributes() {
    return ["mode", "api-base", "member-id", "member-reference", "referral-code", "field-agent-id", "agent-slug"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.branches = [];
  }

  connectedCallback() {
    this.render();
    this.loadBranches();
  }

  attributeChangedCallback() {
    if (this.shadowRoot?.innerHTML) this.render();
  }

  get mode() {
    return this.getAttribute("mode") || "registration";
  }

  get apiBase() {
    return this.getAttribute("api-base") || "";
  }

  get referralCode() {
    const params = new URLSearchParams(window.location.search);
    return this.getAttribute("referral-code") || params.get("referral_code") || params.get("ref") || "";
  }

  get fieldAgentId() {
    const params = new URLSearchParams(window.location.search);
    return this.getAttribute("field-agent-id") || params.get("field_agent_id") || params.get("agent_id") || "";
  }

  get agentSlug() {
    const params = new URLSearchParams(window.location.search);
    return this.getAttribute("agent-slug") || params.get("agent_slug") || params.get("agent") || "";
  }

  async loadBranches() {
    if (this.mode !== "registration") return;
    try {
      const response = await fetch(`${this.apiBase}/api/bootstrap`);
      const data = await response.json();
      this.branches = data.branches || [];
      this.render();
    } catch {
      this.setMessage("Could not load branches.");
    }
  }

  async request(path, payload) {
    const response = await fetch(`${this.apiBase}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  fileToDataUrl(file) {
    if (!file) return Promise.resolve("");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  setMessage(message) {
    const target = this.shadowRoot.querySelector("[data-message]");
    if (target) target.textContent = message;
  }

  async submitRegistration(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    this.setMessage("Submitting...");
    try {
      const data = await this.request("/api/register", {
        full_name: formData.get("full_name"),
        mobile_number: formData.get("mobile_number"),
        id_number: formData.get("id_number"),
        branch_id: formData.get("branch_id"),
        id_doc_data_url: await this.fileToDataUrl(formData.get("id_document")),
        referral_code: this.referralCode,
        field_agent_id: this.fieldAgentId,
        agent_slug: this.agentSlug,
        source: this.referralCode || this.fieldAgentId || this.agentSlug ? "field_agent_dashboard" : "public_portal",
      });
      form.reset();
      this.setMessage(`Registered. Cashit account: ${data.member_reference}`);
      this.dispatchEvent(new CustomEvent("membership:updated", { bubbles: true, detail: data }));
    } catch (error) {
      this.setMessage(error.message);
    }
  }

  async submitRenewal(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const memberId = this.getAttribute("member-id") || formData.get("member_id");
    this.setMessage("Opening renewal...");
    try {
      const data = await this.request("/api/renew", { member_id: memberId });
      this.setMessage(`Payment required: R${data.amount_due}. Use Cashit account ${data.member_reference}.`);
      this.dispatchEvent(new CustomEvent("membership:updated", { bubbles: true, detail: data }));
    } catch (error) {
      this.setMessage(error.message);
    }
  }

  styles() {
    return `
      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      :host {
        display: block;
        min-width: 0;
        font-family: var(--sd-font-family, Aptos, "Segoe UI", sans-serif);
      }

      .panel {
        padding: 18px;
        color: #07090b;
        background: #fff;
        border: 1px solid #d9e2e5;
        border-radius: var(--sd-border-radius, 8px);
        box-shadow: 0 16px 42px rgba(3, 5, 6, 0.08);
      }

      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 16px;
      }

      h2 {
        margin: 0;
        font-size: 18px;
        line-height: 1.2;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        color: #996100;
        background: #fff4dc;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 900;
        white-space: nowrap;
      }

      form {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .pair {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      label {
        display: grid;
        gap: 6px;
      }

      span {
        color: #5f6872;
        font-size: 12px;
        font-weight: 800;
      }

      input,
      select {
        min-width: 0;
        min-height: 42px;
        width: 100%;
        padding: 9px 11px;
        background: var(--sd-input-bg, #fbfcfd);
        border: 1px solid #cfd8dc;
        border-radius: calc(var(--sd-border-radius, 8px) - 2px);
        font: inherit;
      }

      input:focus,
      select:focus {
        border-color: var(--sd-primary-color, #1383bb);
        outline: 3px solid color-mix(in srgb, var(--sd-primary-color, #1383bb) 16%, transparent);
      }

      button {
        min-height: 42px;
        color: #fff;
        background: var(--sd-primary-color, #1383bb);
        border: 0;
        border-radius: calc(var(--sd-border-radius, 8px) - 2px);
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }

      .message {
        min-height: 20px;
        margin: 0;
        color: #5f6872;
        font-weight: 700;
      }

      .instruction {
        padding: 12px;
        background: #e7f5fc;
        border: 1px solid #b7dff0;
        border-radius: var(--sd-border-radius, 8px);
      }

      .referral {
        margin: 0;
        padding: 9px 11px;
        color: #09618d;
        background: #e7f5fc;
        border: 1px solid #b7dff0;
        border-radius: var(--sd-border-radius, 8px);
        font-size: 13px;
        font-weight: 800;
      }

      .instruction strong {
        display: block;
        margin-bottom: 4px;
      }

      @media (max-width: 700px) {
        .panel {
          padding: 14px;
        }

        .head,
        form {
          display: flex;
        }

        .pair {
          grid-template-columns: 1fr;
        }

        .head {
          align-items: start;
          flex-direction: column;
        }
      }
    `;
  }

  render() {
    const branchOptions = this.branches
      .map((branch) => `<option value="${branch.id}">${branch.name} / ${branch.province}</option>`)
      .join("");
    const renewalReference = this.getAttribute("member-reference") || "your Cashit account cell number";
    const referralLabel = this.referralCode || this.fieldAgentId || this.agentSlug;
    const referralMarkup = referralLabel ? `<p class="referral">Field Agent Referral: ${referralLabel}</p>` : "";
    const memberIdInput = this.getAttribute("member-id")
      ? ""
      : `<label class="wide"><span>Member ID / mobile / Cashit account cell number</span><input name="member_id" required /></label>`;

    this.shadowRoot.innerHTML = `
      <style>${this.styles()}</style>
      ${
        this.mode === "renewal"
          ? `
            <section class="panel">
              <div class="head">
                <h2>Membership Renewal</h2>
                <span class="badge">Renewal</span>
              </div>
              <form data-renewal-form>
                <div class="instruction">
                  <strong>Pay via Cashit</strong>
                  Use cell number ${renewalReference} at a Cashit terminal, Spaza partner, or USSD channel. Status changes after Cashit confirms the payment.
                </div>
                ${memberIdInput}
                <button type="submit">Check Renewal Amount</button>
                <p class="message" data-message></p>
              </form>
            </section>
          `
          : `
            <section class="panel">
              <div class="head">
                <h2>Mobile Registration</h2>
                <span class="badge">Pending Approval</span>
              </div>
              <form data-registration-form>
                <label><span>Full Name</span><input name="full_name" autocomplete="name" required /></label>
                <div class="pair">
                  <label><span>Mobile Number</span><input name="mobile_number" inputmode="tel" autocomplete="tel" required /></label>
                  <label><span>ID / Passport Number</span><input name="id_number" required /></label>
                </div>
                <label><span>Branch</span><select name="branch_id" required>${branchOptions}</select></label>
                <label><span>ID Document Photo</span><input name="id_document" type="file" accept="image/*" capture="environment" /></label>
                ${referralMarkup}
                <button type="submit">Submit Registration</button>
                <p class="message" data-message></p>
              </form>
            </section>
          `
      }
    `;

    this.shadowRoot.querySelector("[data-registration-form]")?.addEventListener("submit", (event) => this.submitRegistration(event));
    this.shadowRoot.querySelector("[data-renewal-form]")?.addEventListener("submit", (event) => this.submitRenewal(event));
  }
}

customElements.define("satdwu-membership", SatdwuMembership);
