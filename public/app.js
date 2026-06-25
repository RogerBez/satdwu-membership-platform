const state = {
  branches: [],
  settings: { monthlyFee: 130, graceDays: 30 },
  adminMembers: [],
  recruiters: [],
  recruiterReport: null,
  financeMembers: [],
  currentMember: null,
  token: localStorage.getItem("satdwu_token") || "",
  user: null,
  reporting: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function formatDate(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function money(value) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function statusPill(status) {
  return `<span class="pill ${status.tone}">${escapeHtml(status.label)}</span>`;
}

function showView(name) {
  $$(".tab:not(.hidden)").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === name));
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${name}-view`));
  if (name === "admin") loadAdmin();
  if (name === "finance") loadFinance();
}

function populateBranches() {
  const options = state.branches.map((branch) => `<option value="${branch.id}">${branch.name} / ${branch.province}</option>`);
  $("#admin-branch-filter").innerHTML = `<option value="all">All Branches</option>${options.join("")}`;
  $("#recruiter-branch").innerHTML = options.join("");
}

function renderMemberPortal(member) {
  state.currentMember = member;
  $("#member-status").className = `pill ${member.status.tone}`;
  $("#member-status").textContent = member.status.label;
  const unread = Number(member.unreadNotificationCount || 0);
  ["#member-notification-count", "#member-notification-mini"].forEach((selector) => {
    const badge = $(selector);
    badge.textContent = `${unread} New`;
    badge.classList.toggle("hidden", unread === 0);
  });

  const hub = $("#notification-hub");
  const notifications = member.notifications || [];
  if (notifications.length) {
    hub.classList.remove("hidden");
    hub.innerHTML = notifications
      .map(
        (notification) => `
          <div class="alert-card">
            <div class="alert-copy">
              <strong>${escapeHtml(notification.title || "Notification")}</strong>
              <p>${escapeHtml(notification.message)}</p>
              <span class="alert-meta">${escapeHtml(notification.source)} / ${escapeHtml(notification.channel)} / ${formatDate(notification.createdAt)}</span>
            </div>
            <button class="ghost" data-read-alert="${notification.id}">${notification.isUnread ? "Mark Read" : "Read"}</button>
          </div>
        `,
      )
      .join("");
  } else {
    hub.classList.add("hidden");
    hub.innerHTML = "";
  }

  const satdwuNumber = member.memberNumber || "Pending SATDWU number";
  const cashitAccountNumber = member.cashitSetup?.accountNumber || "Not issued by Cashit yet";
  const cashitFallback = member.cashitSetup?.fallbackAccountNumber || member.paymentReference || member.mobile;
  const recruiterBlock = member.recruiter
    ? `
      <div class="summary-item"><span>Recruiter Name</span><strong>${escapeHtml(member.recruiter.fullName)}</strong></div>
      <div class="summary-item"><span>Recruiter Code</span><strong>${escapeHtml(member.recruiter.recruiterCode || "Not set")}</strong></div>
      <div class="summary-item"><span>Recruiter Mobile</span><strong>${escapeHtml(member.recruiter.mobile || "Not set")}</strong></div>
      <div class="summary-item"><span>Recruiter Email</span><strong>${escapeHtml(member.recruiter.email || "Not set")}</strong></div>
    `
    : `
      <div class="summary-item"><span>Recruiter</span><strong>Not assigned</strong></div>
    `;

  $("#member-summary").innerHTML = `
    <section class="member-pay-card">
      <div>
        <span class="summary-label">SATDWU member number</span>
        <strong class="cashit-number">${escapeHtml(satdwuNumber)}</strong>
        <p>Your SATDWU number is your union identity. Cashit details below are used for eligibility, onboarding, mandate approval, and collections.</p>
      </div>
      <div class="pay-card-status">
        ${statusPill(member.status)}
        <span class="mandate-chip ${escapeHtml(member.kycStatus?.tone || "muted")}">${escapeHtml(member.kycStatus?.label || "Cashit KYC Not Started")}</span>
        <span class="mandate-chip ${escapeHtml(member.cashitWalletStatus?.tone || "muted")}">${escapeHtml(member.cashitWalletStatus?.label || "Cashit Eligibility Pending")}</span>
        <span class="mandate-chip ${escapeHtml(member.mandateStatus?.tone || "muted")}">${escapeHtml(member.mandateStatus?.label || "Mandate Not Requested")}</span>
        <span>Renewal updates only after Cashit confirms payment.</span>
      </div>
    </section>
    <div class="summary-grid member-facts">
      <div class="summary-item"><span>Name</span><strong>${escapeHtml(member.firstName)} ${escapeHtml(member.surname)}</strong></div>
      <div class="summary-item"><span>SATDWU Number</span><strong>${escapeHtml(satdwuNumber)}</strong></div>
      <div class="summary-item"><span>Branch</span><strong>${escapeHtml(member.branchName)}</strong></div>
      <div class="summary-item"><span>Cell Number</span><strong>${escapeHtml(member.mobile)}</strong></div>
      <div class="summary-item"><span>Cashit Account Number</span><strong>${escapeHtml(cashitAccountNumber)}</strong></div>
      <div class="summary-item"><span>Cashit Mobile / Payment Reference</span><strong>${escapeHtml(cashitFallback)}</strong></div>
      <div class="summary-item"><span>Cashit Onboarding</span><strong>${escapeHtml(member.cashitWalletStatus?.label || "Cashit Eligibility Pending")}</strong></div>
      <div class="summary-item"><span>Cashit KYC</span><strong>${escapeHtml(member.kycStatus?.label || "Cashit KYC Not Started")}</strong></div>
      <div class="summary-item"><span>Monthly Fee</span><strong>${money(member.monthlyFee)}</strong></div>
      <div class="summary-item"><span>Grace Expiry</span><strong>${formatDate(member.graceExpiry)}</strong></div>
      ${recruiterBlock}
    </div>
  `;

  const renewalComponent = $("#renewal-component");
  renewalComponent.setAttribute("member-id", member.id);
  renewalComponent.setAttribute("member-reference", member.paymentReference);
}

async function lookupMember(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  try {
    const params = new URLSearchParams({
      mobile: formData.get("mobile") || "",
      idNumber: formData.get("idNumber") || "",
    });
    const data = await request(`/api/members/lookup?${params}`);
    renderMemberPortal(data.member);
  } catch (error) {
    $("#member-summary").innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
  }
}

function renderMetrics(stats) {
  if (!$("#metric-row")) return;
  $("#metric-row").innerHTML = [
    ["Total Members", stats.totalMembers],
    ["Pending Approval", stats.pending],
    ["Active", stats.active],
    ["Unpaid", stats.unpaid ?? stats.overdue],
    ["Collected", money(stats.collected)],
  ]
    .map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderReporting(reporting) {
  state.reporting = reporting;
  $("#reporting-grid").innerHTML = [
    ["registered", "Registered Members", reporting.stats.totalMembers],
    ["paid", "Paid-Up Members", reporting.stats.active],
    ["due", "Payment Due", reporting.stats.unpaid],
    ["collections", "Collections", money(reporting.stats.collected)],
  ]
    .map(([key, label, value]) => `<div class="report-card report-card-${key}"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
  renderBarList("#status-chart", reporting.byStatus.filter((item) => item.count > 0), "label", "count");
  renderBarList("#collections-chart", reporting.collectionsByMonth, "label", "amount", money);
  renderBarList(
    "#agent-chart",
    (reporting.recruiterPerformance || []).map((recruiter) => ({
      fullName: recruiter.fullName,
      registrations: recruiter.stats?.registrations || 0,
    })),
    "fullName",
    "registrations",
  );
}

function renderBarList(selector, rows, labelKey, valueKey, formatter = (value) => value) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey] || 0)));
  $(selector).innerHTML = rows.length
    ? rows
        .map((row) => {
          const value = Number(row[valueKey] || 0);
          const width = Math.max(4, Math.round((value / max) * 100));
          return `
            <div class="bar-row">
              <div class="bar-label">
                <span>${escapeHtml(row[labelKey])}</span>
                <strong>${escapeHtml(formatter(value))}</strong>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
            </div>
          `;
        })
        .join("")
    : `<p class="empty-state">No report data yet.</p>`;
}

async function loadAdmin() {
  const params = new URLSearchParams({
    search: $("#admin-search")?.value || "",
    branch: $("#admin-branch-filter")?.value || "all",
    status: $("#admin-status-filter")?.value || "all",
  });
  const [data, reporting, recruitersData] = await Promise.all([
    request(`/api/admin/members?${params}`),
    request("/api/admin/reporting"),
    request("/api/admin/recruiters"),
  ]);
  state.adminMembers = data.members;
  state.recruiters = recruitersData.recruiters;
  renderReporting(reporting);
  renderRecruiters();
  renderMetrics(data.stats);
  renderMemberTable();
}

function renderRecruiters() {
  const active = state.recruiters.filter((recruiter) => recruiter.status === "active").length;
  $("#recruiter-count").textContent = `${active} Active`;
  $("#recruiter-list").innerHTML = state.recruiters.length
    ? state.recruiters
        .map(
          (recruiter) => `
            <article class="recruiter-card">
              <div>
                <strong>${escapeHtml(recruiter.fullName)}</strong>
                <span>${escapeHtml(recruiter.recruiterCode)} / ${escapeHtml(recruiter.branchName)}</span>
              </div>
              <div class="recruiter-stats">
                <span><b>${recruiter.stats.registrations}</b> Members</span>
                <span><b>${recruiter.stats.active}</b> Active</span>
                <span><b>${money(recruiter.stats.collected)}</b> Collected</span>
              </div>
              <div class="actions">
                <button class="secondary" data-edit-recruiter="${recruiter.id}">Edit</button>
                <button class="ghost" data-view-recruiter="${recruiter.id}">Profile</button>
              </div>
            </article>
          `,
        )
        .join("")
    : `<p class="empty-state">No recruiters yet.</p>`;
}

function renderRecruiterDashboard(report) {
  state.recruiterReport = report;
  const stats = report.recruiter.stats;
  $("#recruiter-dashboard-title").textContent = report.recruiter.fullName;
  $("#recruiter-dashboard-subtitle").textContent = `${report.recruiter.recruiterCode} / ${report.recruiter.branchName}`;
  $("#recruiter-registration-panel").innerHTML = `
    <satdwu-membership
      mode="registration"
      api-base=""
      recruiter-code="${escapeHtml(report.recruiter.recruiterCode)}"
      recruiter-id="${escapeHtml(report.recruiter.id)}"></satdwu-membership>
  `;
  $("#recruiter-reporting-grid").innerHTML = [
    ["members", "Recruited Members", stats.registrations],
    ["paid", "Active Members", stats.active],
    ["due", "Payment Due", stats.unpaid],
    ["registered", "Cashit Ready", stats.cashitAccounts],
    ["registered", "KYC Complete", stats.kycComplete],
    ["collections", "Collections", money(stats.collected)],
  ]
    .map(([key, label, value]) => `<div class="report-card report-card-${key}"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

  $("#recruiter-member-table").innerHTML = report.members.length
    ? report.members
        .map(
          (member) => `
            <tr>
              <td>
                <div class="member-name">
                  <strong>${escapeHtml(member.firstName)} ${escapeHtml(member.surname)}</strong>
                  <span>${escapeHtml(member.memberNumber || "Pending number")} / ${escapeHtml(member.mobile)}</span>
                </div>
              </td>
              <td>${escapeHtml(member.branchName)}</td>
              <td>${statusPill(member.status)}</td>
              <td><span class="mandate-chip ${escapeHtml(member.mandateStatus?.tone || "muted")}">${escapeHtml(member.mandateStatus?.label || "Mandate Not Requested")}</span></td>
              <td><span class="mandate-chip ${escapeHtml(member.cashitWalletStatus?.tone || "muted")}">${escapeHtml(member.cashitWalletStatus?.label || "Cashit Eligibility Pending")}</span></td>
              <td><span class="mandate-chip ${escapeHtml(member.kycStatus?.tone || "muted")}">${escapeHtml(member.kycStatus?.label || "Cashit KYC Not Started")}</span></td>
              <td>${escapeHtml(member.cashitSetup?.accountNumber || member.cashitSetup?.fallbackAccountNumber || "Not issued")}</td>
              <td>${formatDate(member.graceExpiry)}</td>
              <td>
                <div class="actions">
                  <button class="secondary" data-recruiter-view-member="${member.id}">Review</button>
                  <button class="ghost" data-recruiter-message-member="${member.id}">Message</button>
                </div>
              </td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="7"><p class="empty-state">No members linked to your recruiter profile yet.</p></td></tr>`;
}

async function loadRecruiterHome() {
  const report = await request("/api/recruiter/me");
  renderRecruiterDashboard(report);
}

function recruiterMemberAction(event) {
  const memberId = event.target.dataset.recruiterViewMember;
  const messageMemberId = event.target.dataset.recruiterMessageMember;
  if (messageMemberId && state.recruiterReport) {
    const member = state.recruiterReport.members.find((item) => item.id === messageMemberId);
    if (!member) return;
    $("#dialog-title").textContent = `Message ${member.firstName} ${member.surname}`;
    $("#dialog-body").innerHTML = `
      <form id="recruiter-message-form" class="field-grid" data-member-id="${member.id}">
        <label class="wide">
          <span>Member</span>
          <input value="${escapeHtml(member.firstName)} ${escapeHtml(member.surname)} / ${escapeHtml(member.memberNumber || "Pending number")}" disabled />
        </label>
        <label>
          <span>Channel</span>
          <select name="channel">
            <option value="in_app">In App</option>
            <option value="sms">SMS</option>
          </select>
        </label>
        <label class="wide">
          <span>Message</span>
          <input name="message" placeholder="Type your message to this member" required />
        </label>
        <button class="primary wide" type="submit">Send Message</button>
      </form>
    `;
    $("#member-dialog").showModal();
    return;
  }
  if (!memberId || !state.recruiterReport) return;
  const member = state.recruiterReport.members.find((item) => item.id === memberId);
  if (!member) return;
  $("#dialog-title").textContent = `${member.firstName} ${member.surname}`;
  $("#dialog-body").innerHTML = `
    <div class="summary-grid">
      <div class="summary-item"><span>Member Number</span><strong>${escapeHtml(member.memberNumber || "Pending approval")}</strong></div>
      <div class="summary-item"><span>Status</span><strong>${escapeHtml(member.status.label)}</strong></div>
      <div class="summary-item"><span>Mandate</span><strong>${escapeHtml(member.mandateStatus?.label || "Mandate Not Requested")}</strong></div>
      <div class="summary-item"><span>Cashit Account</span><strong>${escapeHtml(member.cashitSetup?.accountNumber || "Not issued by Cashit yet")}</strong></div>
      <div class="summary-item"><span>Cashit Onboarding</span><strong>${escapeHtml(member.cashitWalletStatus?.label || "Cashit Eligibility Pending")}</strong></div>
      <div class="summary-item"><span>Mobile</span><strong>${escapeHtml(member.mobile)}</strong></div>
      <div class="summary-item"><span>Branch</span><strong>${escapeHtml(member.branchName)}</strong></div>
      <div class="summary-item"><span>Cashit KYC</span><strong>${escapeHtml(member.kycStatus?.label || "Cashit KYC Not Started")}</strong></div>
      <div class="summary-item"><span>Grace Expiry</span><strong>${formatDate(member.graceExpiry)}</strong></div>
    </div>
  `;
  $("#member-dialog").showModal();
}

async function sendRecruiterMessage(event) {
  if (event.target.id !== "recruiter-message-form") return;
  event.preventDefault();
  const form = event.target;
  const payload = Object.fromEntries(new FormData(form).entries());
  const data = await request(`/api/recruiter/members/${form.dataset.memberId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  $("#member-dialog").close();
  if (data.note) window.alert(data.note);
  await loadRecruiterHome();
}

function renderMemberTable() {
  const tbody = $("#member-table");
  if (!state.adminMembers.length) {
    tbody.innerHTML = `<tr><td colspan="9"><p class="empty-state">No matching members.</p></td></tr>`;
    return;
  }
  tbody.innerHTML = state.adminMembers
    .map(
      (member) => `
        <tr>
          <td>
            <div class="member-name">
              <strong>${escapeHtml(member.firstName)} ${escapeHtml(member.surname)}</strong>
              <span>${escapeHtml(member.mobile)} / ${escapeHtml(member.idNumber)}</span>
            </div>
          </td>
          <td><span class="origin-pill ${escapeHtml(member.registrationOrigin?.key || "direct")}">${escapeHtml(member.registrationOrigin?.label || "Direct")}</span></td>
          <td>${escapeHtml(member.branchName)}</td>
          <td>${statusPill(member.status)}</td>
          <td><span class="mandate-chip ${escapeHtml(member.mandateStatus?.tone || "muted")}">${escapeHtml(member.mandateStatus?.label || "Mandate Not Requested")}</span></td>
          <td>${member.recruiter ? `${escapeHtml(member.recruiter.fullName)}<br><span class="muted-text">${escapeHtml(member.recruiter.recruiterCode)}</span>` : `<span class="muted-text">Not assigned</span>`}</td>
          <td>${escapeHtml(member.paymentReference)}</td>
          <td>${formatDate(member.graceExpiry)}</td>
          <td>
            <div class="actions">
              <button class="secondary" data-view-member="${member.id}">Review</button>
              <button class="action-btn" data-approve="${member.id}">Approve</button>
              <button class="ghost" data-reminder="kyc" data-member="${member.id}">KYC</button>
              <button class="danger" data-reminder="fee" data-member="${member.id}">Fee</button>
            </div>
          </td>
        </tr>
      `,
    )
    .join("");
}

function openMemberDialog(member) {
  $("#dialog-title").textContent = `${member.firstName} ${member.surname}`;
  const recruiterOptions = [`<option value="">No recruiter</option>`]
    .concat(state.recruiters.map((recruiter) => `<option value="${recruiter.id}" ${member.recruiter?.id === recruiter.id ? "selected" : ""}>${escapeHtml(recruiter.fullName)} / ${escapeHtml(recruiter.recruiterCode)}</option>`))
    .join("");
  const branchOptions = state.branches
    .map((branch) => `<option value="${branch.id}" ${member.branchId === branch.id ? "selected" : ""}>${escapeHtml(branch.name)} / ${escapeHtml(branch.province)}</option>`)
    .join("");
  $("#dialog-body").innerHTML = `
    <div class="profile-layout">
      <form id="member-edit-form" class="summary-grid" data-member-id="${member.id}">
        <div class="summary-item"><span>Status</span><strong>${member.status.label}</strong></div>
        <div class="summary-item"><span>Mandate</span><strong>${escapeHtml(member.mandateStatus?.label || "Mandate Not Requested")}</strong></div>
        <div class="summary-item"><span>Member Number</span><strong>${escapeHtml(member.memberNumber || "Pending approval")}</strong></div>
        <div class="summary-item"><span>Cashit Account Number</span><strong>${escapeHtml(member.cashitSetup?.accountNumber || "Not issued by Cashit yet")}</strong></div>
        <div class="summary-item"><span>Cashit Mobile / Payment Reference</span><strong>${escapeHtml(member.cashitSetup?.fallbackAccountNumber || member.paymentReference)}</strong></div>
        <div class="summary-item"><span>Cashit Onboarding</span><strong>${escapeHtml(member.cashitWalletStatus?.label || "Cashit Eligibility Pending")}</strong></div>
        <label><span>Full Name</span><input name="full_name" value="${escapeHtml(`${member.firstName} ${member.surname}`.trim())}" required /></label>
        <label><span>Mobile</span><input name="mobile_number" value="${escapeHtml(member.mobile)}" required /></label>
        <label><span>ID Number</span><input name="id_number" value="${escapeHtml(member.idNumber)}" required /></label>
        <label><span>Branch</span><select name="branch_id">${branchOptions}</select></label>
        <label><span>Status</span><select name="status">
          ${["pending", "active", "unpaid", "suspended", "cancelled"].map((status) => `<option value="${status}" ${member.status.key === status ? "selected" : ""}>${status}</option>`).join("")}
        </select></label>
        <label><span>SATDWU Recruiter</span><select name="recruiter_id">${recruiterOptions}</select></label>
        <div class="summary-item"><span>Cashit KYC</span><strong>${escapeHtml(member.kycStatus?.label || "Cashit KYC Not Started")}</strong></div>
        <div class="summary-item"><span>Grace Expiry</span><strong>${formatDate(member.graceExpiry)}</strong></div>
        <button class="primary wide" type="submit">Save Member Profile</button>
      </form>
      ${
        member.idPhotoDataUrl
          ? `<img class="id-preview" src="${member.idPhotoDataUrl}" alt="Uploaded ID document" />`
          : `<div class="id-preview empty-state">SATDWU stores the application form here. Cashit KYC is completed during Cashit onboarding.</div>`
      }
    </div>
  `;
  $("#member-dialog").showModal();
}

async function adminAction(event) {
  const approveId = event.target.dataset.approve;
  const reminder = event.target.dataset.reminder;
  const reminderMemberId = event.target.dataset.member;
  const viewMemberId = event.target.dataset.viewMember;

  if (viewMemberId) {
    const member = state.adminMembers.find((item) => item.id === viewMemberId);
    if (member) openMemberDialog(member);
  }

  if (approveId) {
    await request(`/api/admin/members/${approveId}/approve`, { method: "POST", body: "{}" });
    await loadAdmin();
  }

  if (reminder && reminderMemberId) {
    await request(`/api/admin/members/${reminderMemberId}/reminders`, {
      method: "POST",
      body: JSON.stringify({ type: reminder }),
    });
    await loadAdmin();
  }
}

function fillRecruiterForm(recruiter) {
  const form = $("#recruiter-form");
  form.elements.id.value = recruiter?.id || "";
  form.elements.full_name.value = recruiter?.fullName || "";
  form.elements.recruiter_code.value = recruiter?.recruiterCode || "";
  form.elements.mobile.value = recruiter?.mobile || "";
  form.elements.email.value = recruiter?.email || "";
  form.elements.branch_id.value = recruiter?.branchId || state.branches[0]?.id || "";
  form.elements.status.value = recruiter?.status || "active";
  form.elements.notes.value = recruiter?.notes || "";
}

async function saveRecruiter(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form).entries());
  const id = payload.id;
  delete payload.id;
  await request(id ? `/api/admin/recruiters/${id}` : "/api/admin/recruiters", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  });
  fillRecruiterForm(null);
  await loadAdmin();
}

async function recruiterAction(event) {
  const editId = event.target.dataset.editRecruiter;
  const viewId = event.target.dataset.viewRecruiter;
  if (editId) {
    const recruiter = state.recruiters.find((item) => item.id === editId);
    if (recruiter) fillRecruiterForm(recruiter);
  }
  if (viewId) {
    const report = await request(`/api/admin/recruiters/${viewId}/report`);
    $("#dialog-title").textContent = report.recruiter.fullName;
    $("#dialog-body").innerHTML = `
      <div class="summary-grid">
        <div class="summary-item"><span>Recruiter Code</span><strong>${escapeHtml(report.recruiter.recruiterCode)}</strong></div>
        <div class="summary-item"><span>Status</span><strong>${escapeHtml(report.recruiter.status)}</strong></div>
        <div class="summary-item"><span>Members</span><strong>${report.recruiter.stats.registrations}</strong></div>
        <div class="summary-item"><span>Active</span><strong>${report.recruiter.stats.active}</strong></div>
        <div class="summary-item"><span>Payment Due</span><strong>${report.recruiter.stats.unpaid}</strong></div>
        <div class="summary-item"><span>Collections</span><strong>${money(report.recruiter.stats.collected)}</strong></div>
      </div>
      <div class="stack-list dialog-stack">
        ${
          report.members.length
            ? report.members
                .map(
                  (member) => `
                    <div class="stack-item">
                      <div class="stack-item-row">
                        <strong>${escapeHtml(member.firstName)} ${escapeHtml(member.surname)}</strong>
                        ${statusPill(member.status)}
                      </div>
                      <p>${escapeHtml(member.memberNumber || "No member number")} / ${escapeHtml(member.mobile)} / ${escapeHtml(member.branchName)}</p>
                    </div>
                  `,
                )
                .join("")
            : `<p class="empty-state">No members linked to this recruiter yet.</p>`
        }
      </div>
    `;
    $("#member-dialog").showModal();
  }
}

async function saveMemberProfile(event) {
  if (event.target.id !== "member-edit-form") return;
  event.preventDefault();
  const form = event.target;
  const payload = Object.fromEntries(new FormData(form).entries());
  const data = await request(`/api/admin/members/${form.dataset.memberId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  await loadAdmin();
  openMemberDialog(data.member);
}

async function loadFinance() {
  const [unmatchedData, ledgerData] = await Promise.all([
    request("/api/finance/unmatched"),
    request("/api/finance/transactions"),
  ]);
  state.financeMembers = unmatchedData.members;
  renderUnmatched(unmatchedData.unmatched);
  renderLedger(ledgerData.transactions);
}

function renderUnmatched(unmatched) {
  const open = unmatched.filter((item) => item.status === "unmatched");
  $("#unmatched-count").textContent = `${open.length} Open`;
  $("#unmatched-list").innerHTML = open.length
    ? open
        .map(
          (item) => `
            <div class="stack-item">
              <div class="stack-item-row">
                <strong>${escapeHtml(item.memberReference || "No reference")}</strong>
                <span>${money(item.amountPaid)}</span>
              </div>
              <p>${escapeHtml(item.cashitTransactionId)} / ${formatDate(item.paymentDate)}</p>
              <select data-link-select="${item.id}">
                <option value="">Select member</option>
                ${state.financeMembers
                  .map(
                    (member) =>
                      `<option value="${member.id}">${escapeHtml(member.firstName)} ${escapeHtml(member.surname)} / ${escapeHtml(member.mobile)} / ${escapeHtml(member.paymentReference)}</option>`,
                  )
                  .join("")}
              </select>
              <button class="secondary" data-link-unmatched="${item.id}">Link Transaction</button>
            </div>
          `,
        )
        .join("")
    : `<p class="empty-state">No unmatched successful payments.</p>`;
}

function renderLedger(transactions) {
  $("#ledger-count").textContent = `${transactions.length} Rows`;
  $("#ledger-list").innerHTML = transactions.length
    ? transactions
        .map(
          (transaction) => `
            <div class="stack-item">
              <div class="stack-item-row">
                <strong>${escapeHtml(transaction.type || transaction.transactionType)}</strong>
                <span>${money(transaction.amountPaid)}</span>
              </div>
              <p>${escapeHtml(transaction.memberReference)} / ${formatDate(transaction.paymentDate)}</p>
              <p>${transaction.member ? `${escapeHtml(transaction.member.firstName)} ${escapeHtml(transaction.member.surname)}` : "No linked member"}</p>
            </div>
          `,
        )
        .join("")
    : `<p class="empty-state">No ledger entries yet.</p>`;
}

async function financeAction(event) {
  const unmatchedId = event.target.dataset.linkUnmatched;
  if (!unmatchedId) return;
  const select = $(`[data-link-select="${unmatchedId}"]`);
  if (!select.value) return;
  await request(`/api/finance/unmatched/${unmatchedId}/link`, {
    method: "POST",
    body: JSON.stringify({ memberId: select.value }),
  });
  await loadFinance();
  await loadAdmin();
}

async function sendWebhook(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());
  if (!payload.cashit_transaction_id) payload.cashit_transaction_id = `cashit_${Date.now()}`;
  payload.payment_date = new Date().toISOString();
  try {
    const data = await request("/api/cashit/webhook", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    $("#webhook-result").textContent = JSON.stringify(data, null, 2);
    await loadAdmin();
    await loadFinance();
  } catch (error) {
    $("#webhook-result").textContent = error.message;
  }
}

async function clearAlert(event) {
  const alertId = event.target.dataset.readAlert;
  if (!alertId || !state.currentMember) return;
  const data = await request(`/api/members/${state.currentMember.id}/notifications/${alertId}/read`, {
    method: "PATCH",
    body: "{}",
  });
  renderMemberPortal(data.member);
}

function setAuthUi() {
  const loggedIn = Boolean(state.user);
  $("#login-view").classList.toggle("hidden", loggedIn);
  $("#app-main").classList.toggle("hidden", !loggedIn);
  $("#role-tabs").classList.toggle("hidden", !loggedIn);
  $("#session-chip").classList.toggle("hidden", !loggedIn);
  if (!loggedIn) return;

  const roleLabel = state.user.role === "admin" ? "Union Admin" : state.user.role === "recruiter" ? "SATDWU Recruiter" : "Member";
  $("#session-label").textContent = `${state.user.fullName} / ${roleLabel}`;
  $$("[data-role-tab]").forEach((tab) => {
    tab.classList.toggle("hidden", tab.dataset.roleTab !== state.user.role);
  });

  if (state.user.role === "member") {
    $("#registration-panel").classList.add("hidden");
    $("#member-lookup-form").classList.add("hidden");
    showView("member");
  } else if (state.user.role === "recruiter") {
    showView("recruiter");
  } else {
    $("#registration-panel").classList.add("hidden");
    showView("admin");
  }
}

async function loadMemberHome() {
  const data = await request("/api/member/me");
  renderMemberPortal(data.member);
}

async function login(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const data = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email: formData.get("email"),
      password: formData.get("password"),
    }),
  });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem("satdwu_token", state.token);
  setAuthUi();
  if (state.user.role === "member") await loadMemberHome();
  if (state.user.role === "recruiter") await loadRecruiterHome();
  if (state.user.role === "admin") await loadAdmin();
}

async function logout() {
  try {
    await request("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {
    // Local logout should succeed even if the session expired server-side.
  }
  state.token = "";
  state.user = null;
  state.currentMember = null;
  localStorage.removeItem("satdwu_token");
  $("#member-summary").innerHTML = `<p class="empty-state">Login to view your member profile.</p>`;
  $("#member-status").className = "pill muted";
  $("#member-status").textContent = "Not Loaded";
  setAuthUi();
}

async function restoreSession() {
  if (!state.token) {
    setAuthUi();
    return;
  }
  try {
    const data = await request("/api/auth/me");
    state.user = data.user;
    setAuthUi();
    if (state.user.role === "member") await loadMemberHome();
    if (state.user.role === "recruiter") await loadRecruiterHome();
    if (state.user.role === "admin") await loadAdmin();
  } catch {
    state.token = "";
    localStorage.removeItem("satdwu_token");
    setAuthUi();
  }
}

async function init() {
  const data = await request("/api/bootstrap");
  state.branches = data.branches;
  state.settings = data.settings;
  populateBranches();
  renderMetrics(data.stats);

  $$(".login-card").forEach((form) => form.addEventListener("submit", login));
  $("#public-register-button")?.addEventListener("click", () => {
    $("#public-registration-form")?.classList.remove("hidden");
    $("#public-register-button")?.classList.add("hidden");
    $("#public-registration-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#logout-button").addEventListener("click", logout);
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
  document.addEventListener("membership:updated", async (event) => {
    if (event.detail?.member) renderMemberPortal(event.detail.member);
    await loadAdmin();
    if (state.user?.role === "recruiter") await loadRecruiterHome();
    if ($("#finance-view").classList.contains("active")) await loadFinance();
  });
  $("#member-lookup-form").addEventListener("submit", lookupMember);
  $("#notification-hub").addEventListener("click", clearAlert);
  $("#member-table").addEventListener("click", adminAction);
  $("#recruiter-member-table").addEventListener("click", recruiterMemberAction);
  $("#recruiter-form").addEventListener("submit", saveRecruiter);
  $("#recruiter-list").addEventListener("click", recruiterAction);
  $("#dialog-body").addEventListener("submit", saveMemberProfile);
  $("#dialog-body").addEventListener("submit", sendRecruiterMessage);
  $("#unmatched-list").addEventListener("click", financeAction);
  $("#webhook-form").addEventListener("submit", sendWebhook);
  $("#dialog-close").addEventListener("click", () => $("#member-dialog").close());
  ["#admin-search", "#admin-branch-filter", "#admin-status-filter"].forEach((selector) => {
    $(selector).addEventListener("input", loadAdmin);
  });

  await restoreSession();
}

init().catch((error) => {
  document.body.innerHTML = `<main><p class="empty-state">${escapeHtml(error.message)}</p></main>`;
});
