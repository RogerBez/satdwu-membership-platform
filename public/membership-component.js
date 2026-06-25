class SatdwuMembership extends HTMLElement {
  static get observedAttributes() {
    return ["mode", "api-base", "member-id", "member-reference", "referral-code", "field-agent-id", "agent-slug", "recruiter-code", "recruiter-id"];
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

  get recruiterCode() {
    const params = new URLSearchParams(window.location.search);
    return this.getAttribute("recruiter-code") || params.get("recruiter_code") || "";
  }

  get recruiterId() {
    const params = new URLSearchParams(window.location.search);
    return this.getAttribute("recruiter-id") || params.get("recruiter_id") || "";
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
    const branch = this.branches.find((item) => item.id === formData.get("branch_id"));
    const workCategories = [...form.querySelectorAll('input[name="work_categories"]:checked')].map((input) => input.value);
    const source = this.recruiterCode || this.recruiterId ? "satdwu_recruiter" : this.referralCode || this.fieldAgentId || this.agentSlug ? "field_agent_dashboard" : "direct";
    this.setMessage("Submitting...");
    try {
      const data = await this.request("/api/register", {
        full_name: formData.get("full_name"),
        first_name: formData.get("first_name"),
        surname: formData.get("surname"),
        preferred_name: formData.get("preferred_name"),
        mobile_number: formData.get("mobile_number"),
        id_number: formData.get("id_number"),
        passport_number: formData.get("passport_number"),
        date_of_birth: formData.get("date_of_birth"),
        gender: formData.get("gender"),
        disability: formData.get("disability"),
        disability_details: formData.get("disability_details"),
        emergency_contact_number: formData.get("emergency_contact_number"),
        email: formData.get("email"),
        residential_address: formData.get("residential_address"),
        province: branch?.province || "",
        local_branch_office: branch?.name || "",
        branch_id: formData.get("branch_id"),
        work_categories: workCategories,
        place_of_work: formData.get("place_of_work"),
        taxi_association: formData.get("taxi_association"),
        affiliation: formData.get("affiliation"),
        employer_name: formData.get("employer_name"),
        operator_cell_number: formData.get("operator_cell_number"),
        income_frequency: formData.get("income_frequency"),
        gross_monthly_income: formData.get("gross_monthly_income"),
        stop_order_accepted: formData.get("stop_order_accepted") === "on",
        declaration_accepted: formData.get("declaration_accepted") === "on",
        member_signature_name: formData.get("member_signature_name"),
        witness_name: formData.get("witness_name"),
        witness_signature_name: formData.get("witness_signature_name"),
        signed_at: formData.get("signed_at"),
        id_doc_data_url: await this.fileToDataUrl(formData.get("id_document")),
        recruiter_code: this.recruiterCode,
        recruiter_id: this.recruiterId,
        referral_code: this.referralCode,
        field_agent_id: this.fieldAgentId,
        agent_slug: this.agentSlug,
        source,
      });
      form.reset();
      this.setMessage(`Registered. SATDWU member number: ${data.satdwu_member_number}. Next step is Cashit eligibility and onboarding.`);
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
      this.setMessage(`Payment required: R${data.amount_due}. Use Cashit mobile / payment reference ${data.member_reference}.`);
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
      select,
      textarea {
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
      select:focus,
      textarea:focus {
        border-color: var(--sd-primary-color, #1383bb);
        outline: 3px solid color-mix(in srgb, var(--sd-primary-color, #1383bb) 16%, transparent);
      }

      textarea {
        min-height: 90px;
        resize: vertical;
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

      .referral,
      .context {
        margin: 0;
        padding: 9px 11px;
        color: #09618d;
        background: #e7f5fc;
        border: 1px solid #b7dff0;
        border-radius: var(--sd-border-radius, 8px);
        font-size: 13px;
        font-weight: 800;
      }

      .section {
        display: grid;
        gap: 12px;
        padding-top: 4px;
      }

      .section h3 {
        margin: 0;
      }

      .section-note {
        margin: -2px 0 0;
        color: #5f6872;
        font-size: 13px;
      }

      .checks {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 14px;
      }

      .check {
        display: flex;
        align-items: start;
        gap: 8px;
        padding: 10px 12px;
        background: #f7fafb;
        border: 1px solid #e3e9ee;
        border-radius: var(--sd-border-radius, 8px);
      }

      .check input {
        min-height: auto;
        width: 16px;
        height: 16px;
        margin-top: 2px;
        padding: 0;
      }

      .check span {
        color: #07090b;
        font-size: 13px;
        font-weight: 700;
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

        .checks {
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
    const workerOptions = [
      "Driver",
      "Cleaner",
      "Car Wash",
      "Vendor",
      "Marshall",
      "Rank Manager",
      "Taxi Patroller",
      "Security",
      "Admin",
      "Manager (Induna)",
      "E-Hailing",
      "Owner",
    ]
      .map((label) => `<label class="check"><input type="checkbox" name="work_categories" value="${label}" /><span>${label}</span></label>`)
      .join("");
    const renewalReference = this.getAttribute("member-reference") || "your Cashit mobile / payment reference";
    const referralLabel = this.referralCode || this.fieldAgentId || this.agentSlug;
    const referralMarkup = referralLabel ? `<p class="referral">Cashit Field Agent Referral: ${referralLabel}</p>` : "";
    const recruiterMarkup = this.recruiterCode || this.recruiterId ? `<p class="context">SATDWU Recruiter: ${this.recruiterCode || this.recruiterId}</p>` : "";
    const memberIdInput = this.getAttribute("member-id")
      ? ""
      : `<label class="wide"><span>Member ID / mobile / Cashit mobile reference</span><input name="member_id" required /></label>`;

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
                  Use ${renewalReference} at a Cashit terminal, Spaza partner, or USSD channel. Status changes only after Cashit confirms the payment.
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
                <h2>SATDWU Membership Application</h2>
                <span class="badge">Pending Approval</span>
              </div>
              <form data-registration-form>
                ${recruiterMarkup}
                ${referralMarkup}
                <section class="section">
                  <h3>Member Details</h3>
                  <div class="pair">
                    <label><span>Province</span><select name="branch_id" required>${branchOptions}</select></label>
                    <label><span>Preferred Name / Nickname</span><input name="preferred_name" /></label>
                  </div>
                  <div class="pair">
                    <label><span>Surname</span><input name="surname" required /></label>
                    <label><span>First Name</span><input name="first_name" required /></label>
                  </div>
                  <label><span>Full Names (as per ID / passport)</span><input name="full_name" autocomplete="name" required /></label>
                  <div class="pair">
                    <label><span>ID Number</span><input name="id_number" required /></label>
                    <label><span>Passport Number (if applicable)</span><input name="passport_number" /></label>
                  </div>
                  <div class="pair">
                    <label><span>Date of Birth</span><input name="date_of_birth" type="date" required /></label>
                    <label>
                      <span>Gender</span>
                      <select name="gender" required>
                        <option value="">Select gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </label>
                  </div>
                  <div class="pair">
                    <label>
                      <span>Disability</span>
                      <select name="disability">
                        <option value="N">No</option>
                        <option value="Y">Yes</option>
                      </select>
                    </label>
                    <label><span>If yes, specify</span><input name="disability_details" /></label>
                  </div>
                  <div class="pair">
                    <label><span>Cell / Contact Number</span><input name="mobile_number" inputmode="tel" autocomplete="tel" required /></label>
                    <label><span>Emergency Contact Number</span><input name="emergency_contact_number" inputmode="tel" /></label>
                  </div>
                  <div class="pair">
                    <label><span>Email Address</span><input name="email" type="email" autocomplete="email" /></label>
                    <label><span>ID Document Photo</span><input name="id_document" type="file" accept="image/*" capture="environment" /></label>
                  </div>
                  <label><span>Residential Address (for FICA / proof of address)</span><textarea name="residential_address" required></textarea></label>
                </section>

                <section class="section">
                  <h3>Employment / Work Details</h3>
                  <p class="section-note">Select the worker type(s) that best match the member.</p>
                  <div class="checks">${workerOptions}</div>
                  <div class="pair">
                    <label><span>Place of Work / Taxi Rank</span><input name="place_of_work" required /></label>
                    <label><span>Taxi Association</span><input name="taxi_association" /></label>
                  </div>
                  <div class="pair">
                    <label>
                      <span>Affiliation</span>
                      <select name="affiliation" required>
                        <option value="">Select affiliation</option>
                        <option value="SANTACO">SANTACO</option>
                        <option value="NTA">NTA</option>
                        <option value="Non-Affiliation">Non-Affiliation</option>
                      </select>
                    </label>
                    <label><span>Employer / Vehicle Owner Name</span><input name="employer_name" /></label>
                  </div>
                  <label><span>Operator Cell Number (if applicable)</span><input name="operator_cell_number" inputmode="tel" /></label>
                </section>

                <section class="section">
                  <h3>Income</h3>
                  <div class="pair">
                    <label>
                      <span>Income Frequency</span>
                      <select name="income_frequency" required>
                        <option value="">Select frequency</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Fortnightly">Fortnightly</option>
                        <option value="Monthly">Monthly</option>
                      </select>
                    </label>
                    <label><span>Gross Monthly Income / Salary</span><input name="gross_monthly_income" placeholder="R 0.00" required /></label>
                  </div>
                </section>

                <section class="section">
                  <h3>Authorization and Declaration</h3>
                  <div class="instruction">
                    <strong>Stop Order / Subscription Authorization</strong>
                    The member authorizes Cashit to deduct SATDWU subscriptions and levies, remit them to SATDWU, and share the required employment/account information for union administration.
                  </div>
                  <label class="check"><input type="checkbox" name="stop_order_accepted" /><span>I authorize the SATDWU stop order / Cashit subscription deduction process.</span></label>
                  <label class="check"><input type="checkbox" name="declaration_accepted" /><span>I confirm the information is true and I agree to the SATDWU constitution and personal information processing.</span></label>
                  <div class="pair">
                    <label><span>Member Signature Name</span><input name="member_signature_name" required /></label>
                    <label><span>Date Signed</span><input name="signed_at" type="date" required /></label>
                  </div>
                  <div class="pair">
                    <label><span>Witness Name</span><input name="witness_name" /></label>
                    <label><span>Witness Signature Name</span><input name="witness_signature_name" /></label>
                  </div>
                </section>
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
