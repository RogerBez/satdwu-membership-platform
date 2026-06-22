const state = {
  branches: [],
  settings: { monthlyFee: 130, graceDays: 30 },
  adminMembers: [],
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
}

function renderMemberPortal(member) {
  state.currentMember = member;
  $("#member-status").className = `pill ${member.status.tone}`;
  $("#member-status").textContent = member.status.label;

  const hub = $("#notification-hub");
  if (member.alerts.length) {
    hub.classList.remove("hidden");
    hub.innerHTML = member.alerts
      .map(
        (alert) => `
          <div class="alert-card">
            <strong>${escapeHtml(alert.message)}</strong>
            <button class="ghost" data-clear-alert="${alert.id}">Clear</button>
          </div>
        `,
      )
      .join("");
  } else {
    hub.classList.add("hidden");
    hub.innerHTML = "";
  }

  $("#member-summary").innerHTML = `
    <section class="member-pay-card">
      <div>
        <span class="summary-label">Cashit account / cell number</span>
        <strong class="cashit-number">${escapeHtml(member.paymentReference)}</strong>
        <p>Pay ${money(member.monthlyFee)} via Cashit USSD, a Cashit terminal, or a Cashit Spaza partner using this cell number.</p>
      </div>
      <div class="pay-card-status">
        ${statusPill(member.status)}
        <span>Renewal updates only after Cashit confirms payment.</span>
      </div>
    </section>
    <div class="summary-grid member-facts">
      <div class="summary-item"><span>Name</span><strong>${escapeHtml(member.firstName)} ${escapeHtml(member.surname)}</strong></div>
      <div class="summary-item"><span>Member Number</span><strong>${escapeHtml(member.memberNumber || "Pending approval")}</strong></div>
      <div class="summary-item"><span>Branch</span><strong>${escapeHtml(member.branchName)}</strong></div>
      <div class="summary-item"><span>Mobile</span><strong>${escapeHtml(member.mobile)}</strong></div>
      <div class="summary-item"><span>Monthly Fee</span><strong>${money(member.monthlyFee)}</strong></div>
      <div class="summary-item"><span>Grace Expiry</span><strong>${formatDate(member.graceExpiry)}</strong></div>
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
  renderBarList("#agent-chart", reporting.referralPerformance, "fullName", "paidConversions");
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
  const [data, reporting] = await Promise.all([
    request(`/api/admin/members?${params}`),
    request("/api/admin/reporting"),
  ]);
  state.adminMembers = data.members;
  renderReporting(reporting);
  renderMetrics(data.stats);
  renderMemberTable();
}

function renderMemberTable() {
  const tbody = $("#member-table");
  if (!state.adminMembers.length) {
    tbody.innerHTML = `<tr><td colspan="7"><p class="empty-state">No matching members.</p></td></tr>`;
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
  $("#dialog-body").innerHTML = `
    <div class="profile-layout">
      <div class="summary-grid">
        <div class="summary-item"><span>Status</span><strong>${member.status.label}</strong></div>
        <div class="summary-item"><span>Member Number</span><strong>${escapeHtml(member.memberNumber || "Pending approval")}</strong></div>
        <div class="summary-item"><span>Cashit Account / Cell Number</span><strong>${escapeHtml(member.paymentReference)}</strong></div>
        <div class="summary-item"><span>Branch</span><strong>${escapeHtml(member.branchName)}</strong></div>
        <div class="summary-item"><span>Created</span><strong>${formatDate(member.createdAt)}</strong></div>
        <div class="summary-item"><span>Grace Expiry</span><strong>${formatDate(member.graceExpiry)}</strong></div>
      </div>
      ${
        member.idPhotoDataUrl
          ? `<img class="id-preview" src="${member.idPhotoDataUrl}" alt="Uploaded ID document" />`
          : `<div class="id-preview empty-state">No ID image uploaded.</div>`
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
  const alertId = event.target.dataset.clearAlert;
  if (!alertId || !state.currentMember) return;
  const data = await request(`/api/members/${state.currentMember.id}/alerts/${alertId}`, {
    method: "DELETE",
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

  $("#session-label").textContent = `${state.user.fullName} / ${state.user.role === "admin" ? "Union Admin" : "Member"}`;
  $$("[data-role-tab]").forEach((tab) => {
    tab.classList.toggle("hidden", tab.dataset.roleTab !== state.user.role);
  });

  if (state.user.role === "member") {
    $("#registration-panel").classList.add("hidden");
    $("#member-lookup-form").classList.add("hidden");
    showView("member");
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
  $("#logout-button").addEventListener("click", logout);
  $$(".tab").forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.view)));
  document.addEventListener("membership:updated", async (event) => {
    if (event.detail?.member) renderMemberPortal(event.detail.member);
    await loadAdmin();
    if ($("#finance-view").classList.contains("active")) await loadFinance();
  });
  $("#member-lookup-form").addEventListener("submit", lookupMember);
  $("#notification-hub").addEventListener("click", clearAlert);
  $("#member-table").addEventListener("click", adminAction);
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
