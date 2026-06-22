import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const dataDir = join(root, "data");
const dbPath = join(dataDir, "db.json");
const port = Number(process.env.PORT || 8001);
const dataStore = process.env.DATA_STORE || (process.env.K_SERVICE ? "firestore" : "json");
const firestoreDocPath = process.env.FIRESTORE_DOC_PATH || "runtime/state";
const cashitNotificationEndpoint =
  process.env.CASHIT_NOTIFICATION_ENDPOINT || "https://cashit.africa/api/post_agent_notification.php";
const cashitNotificationToken = process.env.CASHIT_NOTIFICATION_TOKEN || "";
let firestoreClient;

const MONTHLY_FEE = 130;
const GRACE_DAYS = 30;
const DEMO_PASSWORD = "Password123!";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const branches = [
  { id: "cape-town", name: "Cape Town", province: "Western Cape", code: "CPT" },
  { id: "bellville", name: "Bellville", province: "Western Cape", code: "BELL" },
  { id: "durban", name: "Durban", province: "KwaZulu-Natal", code: "DBN" },
  { id: "johannesburg", name: "Johannesburg", province: "Gauteng", code: "JHB" },
  { id: "pretoria", name: "Pretoria", province: "Gauteng", code: "PTA" },
];

const seedFieldAgents = [
  {
    id: "agent_roger_bezuidenhout",
    referralCode: "AGENT-RB-1643",
    slug: "roger-bezuidenhout",
    fullName: "Roger Bezuidenhout",
    branchId: "cape-town",
    status: "active",
  },
  { id: "fa_cpt_001", referralCode: "FA-CPT-001", fullName: "Cape Town Field Agent", branchId: "cape-town", status: "active" },
  { id: "fa_dbn_001", referralCode: "FA-DBN-001", fullName: "Durban Field Agent", branchId: "durban", status: "active" },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function emptyDb() {
  return {
    counters: { member: 1000, transaction: 5000, alert: 2000, application: 3000, kyc: 4000, referral: 6000, commission: 7000, user: 8000 },
    members: [],
    applications: [],
    kycDocuments: [],
    memberLedger: [],
    cashitTransactions: [],
    paymentExceptions: [],
    fieldAgents: seedFieldAgents,
    memberReferrals: [],
    commissionEvents: [],
    agentNotifications: [],
    users: [],
    sessions: [],
    branches,
    settings: { monthlyFee: MONTHLY_FEE, graceDays: GRACE_DAYS, firstPaymentCommission: 0 },
  };
}

function firestore() {
  if (!firestoreClient) {
    if (!getApps().length) initializeApp();
    firestoreClient = getFirestore();
  }
  return firestoreClient;
}

function firestoreStateDoc() {
  return firestore().doc(firestoreDocPath);
}

async function ensureDb() {
  if (dataStore === "firestore") {
    const doc = await firestoreStateDoc().get();
    if (!doc.exists) await saveDb(emptyDb());
    return;
  }
  await mkdir(dataDir, { recursive: true });
  try {
    await stat(dbPath);
  } catch {
    await saveDb(emptyDb());
  }
}

async function loadDb() {
  await ensureDb();
  const db =
    dataStore === "firestore"
      ? (await firestoreStateDoc().get()).data()
      : JSON.parse(await readFile(dbPath, "utf8"));
  let changed = false;

  db.counters ||= {};
  for (const [key, value] of Object.entries({ member: 1000, transaction: 5000, alert: 2000, application: 3000, kyc: 4000, referral: 6000, commission: 7000, user: 8000 })) {
    if (!db.counters[key]) {
      db.counters[key] = value;
      changed = true;
    }
  }

  db.members ||= [];
  db.applications ||= [];
  db.kycDocuments ||= [];
  db.memberLedger ||= db.transactions || [];
  db.cashitTransactions ||= [];
  db.paymentExceptions ||= db.unmatchedTransactions || [];
  db.fieldAgents ||= seedFieldAgents;
  for (const seedAgent of seedFieldAgents) {
    const existingAgent = db.fieldAgents.find(
      (agent) =>
        agent.id === seedAgent.id ||
        agent.referralCode?.toLowerCase() === seedAgent.referralCode.toLowerCase() ||
        (seedAgent.slug && agent.slug?.toLowerCase() === seedAgent.slug.toLowerCase()),
    );
    if (existingAgent) {
      Object.assign(existingAgent, { ...seedAgent, ...existingAgent });
    } else {
      db.fieldAgents.push(seedAgent);
    }
    changed = true;
  }
  db.memberReferrals ||= [];
  db.commissionEvents ||= [];
  db.agentNotifications ||= [];
  db.users ||= [];
  db.sessions ||= [];
  db.branches ||= branches;
  db.settings ||= { monthlyFee: MONTHLY_FEE, graceDays: GRACE_DAYS, firstPaymentCommission: 0 };
  if (db.settings.firstPaymentCommission === undefined) {
    db.settings.firstPaymentCommission = 0;
    changed = true;
  }

  for (const member of db.members) {
    if (!member.status) {
      member.status = member.approvedAt ? "active" : "pending";
      changed = true;
    }
    if (!member.mobileNumber) {
      member.mobileNumber = member.mobile;
      changed = true;
    }
    if (!member.fullName) {
      member.fullName = `${member.firstName || ""} ${member.surname || ""}`.trim();
      changed = true;
    }
    const mobileReference = cashitReferenceForMobile(member.mobileNumber || member.mobile);
    if (mobileReference && member.paymentReference !== mobileReference) {
      member.legacyPaymentReference ||= member.paymentReference || "";
      member.paymentReference = mobileReference;
      changed = true;
    }
  }

  if (ensureDemoUsersAndData(db)) changed = true;
  if (applyStatusEngine(db)) changed = true;
  if (changed) await saveDb(db);
  return db;
}

async function saveDb(db) {
  if (dataStore === "firestore") {
    await firestoreStateDoc().set({ ...db, persistedAt: new Date().toISOString() });
    return;
  }
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");
}

function corsHeaders(req) {
  const requestOrigin = req.headers.origin || "";
  const allowOrigin = allowedOrigins.includes("*")
    ? "*"
    : allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0] || "";
  return {
    ...(allowOrigin ? { "access-control-allow-origin": allowOrigin } : {}),
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization,x-api-key,x-cashit-signature",
    "access-control-max-age": "86400",
  };
}

function sendJson(...args) {
  const [req, res, status, payload] =
    args.length === 4 ? args : [{ headers: {} }, args[0], args[1], args[2]];
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(req),
  });
  res.end(JSON.stringify(payload));
}

function sendError(...args) {
  if (args.length >= 4 && typeof args[2] === "number") {
    const [req, res, status, message, details] = args;
    sendJson(req, res, status, { error: message, details });
    return;
  }
  const [res, status, message, details] = args;
  sendJson(res, status, { error: message, details });
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 12 * 1024 * 1024) throw new Error("Payload is too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function requiredFields(payload, fields) {
  return fields.filter((field) => !String(payload[field] || "").trim());
}

function addDays(dateInput, days) {
  const date = new Date(dateInput);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function branchById(db, id) {
  return db.branches.find((branch) => branch.id === id) || db.branches[0];
}

function findFieldAgent(db, payload = {}) {
  const referralCode = String(payload.referral_code || payload.referralCode || payload.ref || "").trim();
  const fieldAgentId = String(payload.field_agent_id || payload.fieldAgentId || payload.agent_id || payload.agentId || "").trim();
  const agentSlug = String(payload.agent_slug || payload.agentSlug || payload.agent || payload.slug || "").trim();
  if (!referralCode && !fieldAgentId && !agentSlug) return { agent: null, referralCode: "", fieldAgentId: "", agentSlug: "" };

  const agent = db.fieldAgents.find(
    (item) =>
      item.id.toLowerCase() === fieldAgentId.toLowerCase() ||
      item.referralCode.toLowerCase() === referralCode.toLowerCase() ||
      item.slug?.toLowerCase() === agentSlug.toLowerCase(),
  );

  return {
    agent: agent || null,
    referralCode: referralCode || agent?.referralCode || "",
    fieldAgentId: fieldAgentId || agent?.id || "",
    agentSlug: agentSlug || agent?.slug || "",
  };
}

function referralForMember(db, memberId) {
  return db.memberReferrals.find((referral) => referral.memberId === memberId) || null;
}

function registrationOrigin(member, referral) {
  const source = String(member.registrationSource || referral?.source || "").toLowerCase();
  if (source.includes("ussd")) return { key: "ussd", label: "USSD" };
  if (referral || source.includes("field_agent") || source.includes("agent")) return { key: "field_agent", label: "Field Agent" };
  if (source.includes("demo")) return { key: "direct", label: "Direct" };
  return { key: "direct", label: "Direct" };
}

function commissionAlreadyCreated(db, memberId, fieldAgentId, triggerTransactionId) {
  return db.commissionEvents.some(
    (event) =>
      event.memberId === memberId &&
      event.fieldAgentId === fieldAgentId &&
      event.triggerTransactionId === triggerTransactionId,
  );
}

function createFirstPaymentCommission(db, member, transaction) {
  const referral = referralForMember(db, member.id);
  if (!referral) return null;
  const alreadyEarned = db.commissionEvents.some(
    (event) => event.memberId === member.id && event.commissionType === "first_confirmed_payment",
  );
  if (alreadyEarned || commissionAlreadyCreated(db, member.id, referral.fieldAgentId, transaction.id)) return null;

  const now = new Date().toISOString();
  const commission = {
    id: nextId(db, "commission", "comm_"),
    fieldAgentId: referral.fieldAgentId,
    fieldAgentName: referral.fieldAgentName,
    referralCode: referral.referralCode,
    agentSlug: referral.agentSlug || "",
    memberId: member.id,
    memberReference: member.paymentReference,
    triggerTransactionId: transaction.id,
    commissionType: "first_confirmed_payment",
    commissionAmount: Number(db.settings.firstPaymentCommission || 0),
    status: "earned",
    createdAt: now,
  };
  db.commissionEvents.unshift(commission);
  referral.commissionStatus = "earned";
  referral.updatedAt = now;
  return commission;
}

async function notifyCashitFieldAgent(db, member, reminderType) {
  const referral = referralForMember(db, member.id);
  if (!referral?.referralCode) return null;

  const notification = {
    id: crypto.randomUUID(),
    memberId: member.id,
    referralCode: referral.referralCode,
    type: reminderType === "fee" ? "PAYMENT_REMINDER" : "MEMBERSHIP",
    title: reminderType === "fee" ? "Membership payment due" : "Membership follow-up required",
    message:
      reminderType === "fee"
        ? `Please follow up with ${member.fullName || "this member"} for their monthly SADTWU renewal.`
        : `Please follow up with ${member.fullName || "this member"} for their SADTWU membership.`,
    actionUrl: "membership.php",
    endpoint: cashitNotificationEndpoint,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  const body = {
    referral_code: referral.referralCode,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    action_url: notification.actionUrl,
  };

  if (!cashitNotificationToken) {
    notification.status = "skipped";
    notification.error = "CASHIT_NOTIFICATION_TOKEN is not configured";
    db.agentNotifications.unshift(notification);
    return notification;
  }

  try {
    const response = await fetch(cashitNotificationEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-SADTWU-NOTIFICATION-TOKEN": cashitNotificationToken,
      },
      body: JSON.stringify(body),
    });
    const responseBody = await response.json().catch(() => ({}));
    notification.httpStatus = response.status;
    notification.response = responseBody;
    notification.status = response.ok && responseBody.success !== false ? "sent" : "failed";
    if (!response.ok) notification.error = responseBody.error || response.statusText || "Cashit notification failed";
  } catch (error) {
    notification.status = "failed";
    notification.error = error.message || "Cashit notification failed";
  }

  db.agentNotifications.unshift(notification);
  return notification;
}

function nextMemberReference(db, branchId) {
  const branch = branchById(db, branchId);
  db.counters.member += 1;
  return `SATDWU-${branch.code}-${db.counters.member}`;
}

function cashitReferenceForMobile(mobile) {
  return normalizePhone(mobile);
}

function nextId(db, counterName, prefix) {
  db.counters[counterName] += 1;
  return `${prefix}${db.counters[counterName]}`;
}

function upsertUser(db, user) {
  const existing = db.users.find((item) => item.email.toLowerCase() === user.email.toLowerCase());
  if (existing) {
    const before = JSON.stringify(existing);
    Object.assign(existing, { ...user, id: existing.id, password: existing.password || user.password });
    return { user: existing, changed: before !== JSON.stringify(existing) };
  }
  const created = { id: nextId(db, "user", "user_"), ...user };
  db.users.push(created);
  return { user: created, changed: true };
}

function findMemberByEmailOrMobile(db, email, mobile) {
  const normalizedMobile = normalizePhone(mobile);
  return db.members.find(
    (member) =>
      member.email?.toLowerCase() === email.toLowerCase() ||
      normalizePhone(member.mobileNumber || member.mobile) === normalizedMobile,
  );
}

function createSeedMember(db, config) {
  const existing = findMemberByEmailOrMobile(db, config.email || "", config.mobile);
  if (existing) return existing;
  const now = config.createdAt || new Date().toISOString();
  db.counters.member += 1;
  const mobile = normalizePhone(config.mobile);
  const member = {
    id: crypto.randomUUID(),
    email: config.email || "",
    mobileNumber: mobile,
    mobile,
    fullName: config.fullName,
    firstName: config.fullName.split(" ")[0] || "",
    surname: config.fullName.split(" ").slice(1).join(" "),
    idNumber: config.idNumber,
    branchId: config.branchId,
    idPhotoDataUrl: "",
    paymentReference: cashitReferenceForMobile(mobile),
    memberNumber: config.memberNumber || "",
    status: config.status,
    referralCode: config.referralCode || "",
    fieldAgentId: config.fieldAgentId || "",
    agentSlug: config.agentSlug || "",
    registrationSource: config.registrationSource || (config.referralCode || config.fieldAgentId ? "field_agent_dashboard" : "direct"),
    approvedAt: config.approvedAt || "",
    graceExpiry: config.graceExpiry || "",
    alerts: config.alerts || [],
    createdAt: now,
    updatedAt: now,
  };
  db.members.push(member);
  db.applications.push({
    id: nextId(db, "application", "app_"),
    memberId: member.id,
    kycStatus: config.status === "pending" ? "submitted" : "approved",
    idDocPath: "",
    createdAt: now,
    updatedAt: now,
  });
  if (config.referralCode || config.fieldAgentId) {
    const agent = db.fieldAgents.find(
      (item) => item.id === config.fieldAgentId || item.referralCode === config.referralCode,
    );
    db.memberReferrals.push({
      id: nextId(db, "referral", "ref_"),
      memberId: member.id,
      fieldAgentId: agent?.id || config.fieldAgentId || config.referralCode,
      fieldAgentName: agent?.fullName || "",
      referralCode: config.referralCode || agent?.referralCode || "",
      agentSlug: config.agentSlug || agent?.slug || "",
      source: "demo_seed",
      status: agent ? "attributed" : "unverified",
      commissionStatus: config.status === "active" ? "earned" : "pending_payment",
      createdAt: now,
      updatedAt: now,
    });
  }
  if (config.status === "active") {
    const transaction = {
      id: nextId(db, "transaction", "txn_"),
      cashitTransactionId: `seed-${member.paymentReference}`,
      memberId: member.id,
      memberReference: member.paymentReference,
      amount: MONTHLY_FEE,
      amountPaid: MONTHLY_FEE,
      paymentDate: config.paymentDate || now,
      type: "success",
      transactionType: "credit",
      reference: member.paymentReference,
      failureReason: "",
      rawPayload: { seed: true },
      createdAt: config.paymentDate || now,
    };
    db.memberLedger.unshift(transaction);
    createFirstPaymentCommission(db, member, transaction);
  }
  return member;
}

function ensureDemoUsersAndData(db) {
  let changed = false;
  const memberEmail = "Rogerbez@gmail.com";
  const memberMobile = "0655499876";
  const now = new Date();
  const isoDaysAgo = (days) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return date.toISOString();
  };
  const isoDaysFromNow = (days) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    return date.toISOString();
  };

  const beforeMemberCount = db.members.length;
  const rogerMember = createSeedMember(db, {
    email: memberEmail,
    mobile: memberMobile,
    fullName: "Roger Bezuidenhout",
    idNumber: "DEMO-RB-0001",
    branchId: "cape-town",
    status: "active",
    memberNumber: "SATDWU-000777",
    approvedAt: isoDaysAgo(12),
    graceExpiry: isoDaysFromNow(18),
    paymentDate: isoDaysAgo(2),
    referralCode: "AGENT-RB-1643",
    fieldAgentId: "agent_roger_bezuidenhout",
    agentSlug: "roger-bezuidenhout",
    createdAt: isoDaysAgo(14),
  });

  const demoMembers = [
    ["Anele Mokoena", "0821001001", "DEMO-1001", "bellville", "active", -22, 8, "FA-CPT-001"],
    ["Thabo Nkosi", "0821001002", "DEMO-1002", "durban", "pending", -4, 0, "FA-DBN-001"],
    ["Lerato Dlamini", "0821001003", "DEMO-1003", "johannesburg", "unpaid", -48, -5, "AGENT-RB-1643"],
    ["Sipho Jacobs", "0821001004", "DEMO-1004", "pretoria", "active", -10, 20, "FA-CPT-001"],
    ["Nomsa Khumalo", "0821001005", "DEMO-1005", "cape-town", "pending", -2, 0, "AGENT-RB-1643"],
    ["Mandla Petersen", "0821001006", "DEMO-1006", "durban", "active", -35, 11, "FA-DBN-001"],
    ["Zanele Maseko", "0821001007", "DEMO-1007", "bellville", "unpaid", -70, -12, "FA-CPT-001"],
    ["Kabelo Sithole", "0821001008", "DEMO-1008", "johannesburg", "active", -6, 24, "AGENT-RB-1643"],
  ];

  for (const [fullName, mobile, idNumber, branchId, status, createdOffset, graceOffset, referralCode] of demoMembers) {
    const agent = db.fieldAgents.find((item) => item.referralCode === referralCode);
    createSeedMember(db, {
      email: "",
      mobile,
      fullName,
      idNumber,
      branchId,
      status,
      memberNumber: status === "pending" ? "" : `SATDWU-${String(db.counters.member + 1).padStart(6, "0")}`,
      approvedAt: status === "pending" ? "" : isoDaysAgo(Math.abs(createdOffset) - 1),
      graceExpiry: status === "pending" ? "" : isoDaysFromNow(graceOffset),
      paymentDate: status === "active" ? isoDaysAgo(Math.max(1, Math.abs(graceOffset - 30))) : "",
      referralCode,
      fieldAgentId: agent?.id || "",
      agentSlug: agent?.slug || "",
      createdAt: isoDaysAgo(Math.abs(createdOffset)),
      alerts: status === "unpaid" ? [{ id: nextId(db, "alert", "alert_"), type: "fee", message: "Your standard monthly SATDWU membership fee of R130 is due.", createdAt: isoDaysAgo(1), readAt: "" }] : [],
    });
  }
  if (db.members.length !== beforeMemberCount) changed = true;

  const adminUser = upsertUser(db, {
    email: "rogerbezuidenhout@live.co.za",
    password: DEMO_PASSWORD,
    role: "admin",
    fullName: "Roger Bezuidenhout",
    mobile: "",
    memberId: "",
  });
  const memberUser = upsertUser(db, {
    email: memberEmail,
    password: DEMO_PASSWORD,
    role: "member",
    fullName: "Roger Bezuidenhout",
    mobile: memberMobile,
    memberId: rogerMember.id,
  });
  if (adminUser.changed || memberUser.changed) changed = true;

  if (!db.paymentExceptions.some((item) => item.cashitTransactionId === "seed-unmatched-001")) {
    db.paymentExceptions.push({
      id: nextId(db, "transaction", "exception_"),
      cashitTransactionId: "seed-unmatched-001",
      cashitTxId: "seed-unmatched-001",
      memberReference: "SATDWU-BAD-REF",
      amountPaid: MONTHLY_FEE,
      paymentDate: isoDaysAgo(1),
      rawPayload: { seed: true },
      status: "unmatched",
      reason: "Demo unmatched reference",
      createdAt: isoDaysAgo(1),
    });
    changed = true;
  }

  return changed;
}

function memberStatus(member, now = new Date()) {
  if (member.status === "cancelled") {
    return { key: "cancelled", label: "Cancelled", tone: "red" };
  }
  if (member.status === "suspended") {
    return { key: "suspended", label: "Suspended", tone: "red" };
  }
  if (member.status === "unpaid") {
    return { key: "unpaid", label: "Payment Due / Unpaid", tone: "red" };
  }
  if (!member.approvedAt && member.status !== "active") {
    return { key: "pending", label: "Pending Approval", tone: "orange" };
  }
  if (member.graceExpiry && new Date(member.graceExpiry) >= now) {
    return { key: "active", label: "Active / Paid-Up", tone: "green" };
  }
  return { key: "unpaid", label: "Payment Due / Unpaid", tone: "red" };
}

function applyStatusEngine(db) {
  const now = new Date();
  let changed = false;
  for (const member of db.members) {
    const application = db.applications.find((item) => item.memberId === member.id);
    if (member.status === "pending" && application?.createdAt) {
      const pendingExpiry = addDays(application.createdAt, db.settings.graceDays);
      if (now > new Date(pendingExpiry)) {
        member.status = "cancelled";
        member.updatedAt = now.toISOString();
        changed = true;
        continue;
      }
    }

    if (!["pending", "cancelled", "suspended"].includes(member.status) && member.graceExpiry && now > new Date(member.graceExpiry)) {
      member.status = "unpaid";
      member.updatedAt = now.toISOString();
      changed = true;
    }
  }
  return changed;
}

function presentMember(db, member) {
  const branch = branchById(db, member.branchId);
  const status = memberStatus(member);
  const [firstName, ...surnameParts] = String(member.fullName || `${member.firstName || ""} ${member.surname || ""}`).trim().split(" ");
  const referral = referralForMember(db, member.id);
  const fieldAgent = referral ? db.fieldAgents.find((agent) => agent.id === referral.fieldAgentId) : null;
  return {
    ...member,
    firstName: member.firstName || firstName || "",
    surname: member.surname || surnameParts.join(" ") || "",
    mobile: member.mobile || member.mobileNumber,
    idNumber: member.idNumber || member.id_number,
    branchName: branch.name,
    province: branch.province,
    status,
    monthlyFee: db.settings.monthlyFee,
    registrationOrigin: registrationOrigin(member, referral),
    referral: referral
      ? {
          referralCode: referral.referralCode,
          fieldAgentId: referral.fieldAgentId,
          agentSlug: referral.agentSlug || fieldAgent?.slug || "",
          fieldAgentName: fieldAgent?.fullName || referral.fieldAgentName || "Unknown field agent",
          source: referral.source,
          status: referral.status,
          createdAt: referral.createdAt,
        }
      : null,
  };
}

function sortMembers(members) {
  return [...members].sort((a, b) => {
    const statusRank = { pending: 0, unpaid: 1, overdue: 1, suspended: 2, cancelled: 3, active: 4 };
    const aStatus = memberStatus(a).key;
    const bStatus = memberStatus(b).key;
    return statusRank[aStatus] - statusRank[bStatus] || b.createdAt.localeCompare(a.createdAt);
  });
}

function filterMembers(db, url) {
  const search = String(url.searchParams.get("search") || "").toLowerCase().trim();
  const branch = url.searchParams.get("branch") || "all";
  const status = url.searchParams.get("status") || "all";

  return sortMembers(db.members)
    .filter((member) => {
      const haystack = [
        member.firstName,
        member.surname,
        member.mobile,
        member.idNumber,
        member.memberNumber,
        member.paymentReference,
        member.legacyPaymentReference,
        branchById(db, member.branchId).name,
      ]
        .join(" ")
        .toLowerCase();
      return !search || haystack.includes(search);
    })
    .filter((member) => branch === "all" || member.branchId === branch)
    .filter((member) => {
      if (status === "all") return true;
      const key = memberStatus(member).key;
      return key === status || (status === "overdue" && key === "unpaid");
    })
    .map((member) => presentMember(db, member));
}

function stats(db) {
  const statusCounts = db.members.reduce(
    (acc, member) => {
      const key = memberStatus(member).key;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { pending: 0, active: 0, unpaid: 0, suspended: 0, cancelled: 0 },
  );
  const collected = db.memberLedger
    .filter((transaction) => transaction.transactionType === "credit" || transaction.type === "success")
    .reduce((sum, transaction) => sum + Number(transaction.amountPaid || 0), 0);

  return {
    totalMembers: db.members.length,
    ...statusCounts,
    overdue: statusCounts.unpaid,
    unmatched: db.paymentExceptions.filter((transaction) => transaction.status === "unmatched").length,
    collected,
  };
}

function reportingSummary(db) {
  const baseStats = stats(db);
  const byStatus = ["pending", "active", "unpaid", "suspended", "cancelled"].map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    count: db.members.filter((member) => memberStatus(member).key === key).length,
  }));
  const byBranch = db.branches.map((branch) => ({
    branchId: branch.id,
    branchName: branch.name,
    province: branch.province,
    count: db.members.filter((member) => member.branchId === branch.id).length,
    active: db.members.filter((member) => member.branchId === branch.id && memberStatus(member).key === "active").length,
  }));
  const monthNames = [];
  const now = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthNames.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleString("en-ZA", { month: "short" }),
      amount: 0,
      count: 0,
    });
  }
  for (const transaction of db.memberLedger) {
    if (!(transaction.transactionType === "credit" || transaction.type === "success")) continue;
    const date = new Date(transaction.paymentDate || transaction.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthNames.find((item) => item.key === key);
    if (bucket) {
      bucket.amount += Number(transaction.amountPaid || 0);
      bucket.count += 1;
    }
  }
  const referralPerformance = db.fieldAgents.map((agent) => fieldAgentReport(db, { field_agent_id: agent.id })).map((report) => ({
    fieldAgentId: report.agent.id,
    fullName: report.agent.fullName,
    referralCode: report.agent.referralCode,
    registrations: report.summary.registrations,
    paidConversions: report.summary.paidConversions,
    commissionEarned: report.summary.commissionEarned,
  }));
  return {
    stats: baseStats,
    byStatus,
    byBranch,
    collectionsByMonth: monthNames,
    referralPerformance,
    recentMembers: sortMembers(db.members).slice(0, 8).map((member) => presentMember(db, member)),
  };
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
    mobile: user.mobile || "",
    memberId: user.memberId || "",
  };
}

function sessionFromRequest(db, req) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  return user ? { session, user } : null;
}

function requireRole(db, req, res, roles) {
  const auth = sessionFromRequest(db, req);
  if (!auth) {
    sendError(req, res, 401, "Login required");
    return null;
  }
  if (!roles.includes(auth.user.role)) {
    sendError(req, res, 403, "Not allowed for this login");
    return null;
  }
  return auth;
}

async function login(req, res) {
  const payload = await readBody(req);
  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const db = await loadDb();
  const user = db.users.find((item) => item.email.toLowerCase() === email && item.password === password);
  if (!user) return sendError(req, res, 401, "Invalid email or password");
  const token = crypto.randomUUID();
  db.sessions.unshift({
    id: crypto.randomUUID(),
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
  });
  db.sessions = db.sessions.slice(0, 50);
  await saveDb(db);
  sendJson(req, res, 200, { token, user: publicUser(user) });
}

async function logout(req, res) {
  const db = await loadDb();
  const authHeader = req.headers.authorization || "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  db.sessions = db.sessions.filter((item) => item.token !== token);
  await saveDb(db);
  sendJson(req, res, 200, { ok: true });
}

async function me(req, res) {
  const db = await loadDb();
  const auth = sessionFromRequest(db, req);
  if (!auth) return sendError(req, res, 401, "Login required");
  sendJson(req, res, 200, { user: publicUser(auth.user) });
}

async function memberMe(req, res) {
  const db = await loadDb();
  const auth = requireRole(db, req, res, ["member"]);
  if (!auth) return;
  const member = db.members.find((item) => item.id === auth.user.memberId || item.email?.toLowerCase() === auth.user.email.toLowerCase());
  if (!member) return sendError(req, res, 404, "Member profile not found");
  sendJson(req, res, 200, { member: presentMember(db, member) });
}

function fieldAgentReport(db, filters = {}) {
  const fieldAgentId = String(filters.field_agent_id || filters.fieldAgentId || filters.agent_id || filters.agentId || "").trim();
  const referralCode = String(filters.referral_code || filters.referralCode || filters.ref || "").trim();
  const agentSlug = String(filters.agent_slug || filters.agentSlug || filters.agent || filters.slug || "").trim();
  const agent = db.fieldAgents.find(
    (item) =>
      (fieldAgentId && item.id.toLowerCase() === fieldAgentId.toLowerCase()) ||
      (referralCode && item.referralCode.toLowerCase() === referralCode.toLowerCase()) ||
      (agentSlug && item.slug?.toLowerCase() === agentSlug.toLowerCase()),
  );
  const reportAgentId = agent?.id || fieldAgentId;
  const reportReferralCode = agent?.referralCode || referralCode;
  const reportAgentSlug = agent?.slug || agentSlug;
  const referrals = db.memberReferrals.filter((referral) => {
    if (reportAgentId && referral.fieldAgentId.toLowerCase() === reportAgentId.toLowerCase()) return true;
    if (reportReferralCode && referral.referralCode.toLowerCase() === reportReferralCode.toLowerCase()) return true;
    if (reportAgentSlug && referral.agentSlug?.toLowerCase() === reportAgentSlug.toLowerCase()) return true;
    return false;
  });
  const referralMemberIds = new Set(referrals.map((referral) => referral.memberId));
  const members = db.members
    .filter((member) => referralMemberIds.has(member.id))
    .map((member) => presentMember(db, member));
  const commissions = db.commissionEvents.filter((event) => {
    if (reportAgentId && event.fieldAgentId.toLowerCase() === reportAgentId.toLowerCase()) return true;
    if (reportReferralCode && event.referralCode.toLowerCase() === reportReferralCode.toLowerCase()) return true;
    if (reportAgentSlug && event.agentSlug?.toLowerCase() === reportAgentSlug.toLowerCase()) return true;
    return false;
  });
  const earnedCommissions = commissions.filter((event) => event.status === "earned");
  const reversedCommissions = commissions.filter((event) => event.status === "reversed");
  const summary = members.reduce(
    (acc, member) => {
      acc.registrations += 1;
      acc[member.status.key] = (acc[member.status.key] || 0) + 1;
      return acc;
    },
    { registrations: 0, pending: 0, active: 0, unpaid: 0, suspended: 0, cancelled: 0 },
  );

  return {
    agent: agent || {
      id: reportAgentId || "",
      referralCode: reportReferralCode || "",
      slug: reportAgentSlug || "",
      fullName: referrals[0]?.fieldAgentName || "Unverified field agent",
      status: "unverified",
    },
    summary: {
      ...summary,
      paidConversions: earnedCommissions.length,
      commissionEarned: earnedCommissions.reduce((sum, event) => sum + Number(event.commissionAmount || 0), 0),
      commissionReversed: reversedCommissions.reduce((sum, event) => sum + Number(event.commissionAmount || 0), 0),
    },
    referrals,
    members,
    commissionEvents: commissions,
  };
}

async function registerMember(req, res) {
  const payload = await readBody(req);
  const fullName = String(payload.full_name || payload.fullName || `${payload.firstName || ""} ${payload.surname || ""}`).trim();
  const mobile = normalizePhone(payload.mobile_number || payload.mobileNumber || payload.mobile);
  const idNumber = String(payload.id_number || payload.idNumber || "").trim();
  const branchId = String(payload.branch_id || payload.branchId || "").trim();
  const missing = [];
  if (!fullName) missing.push("full_name");
  if (!mobile) missing.push("mobile_number");
  if (!idNumber) missing.push("id_number");
  if (!branchId) missing.push("branch_id");
  if (missing.length) return sendError(res, 400, "Missing required fields", missing);

  const db = await loadDb();
  const duplicate = db.members.find(
    (member) => normalizePhone(member.mobileNumber || member.mobile) === mobile || (member.idNumber || member.id_number) === idNumber,
  );
  if (duplicate) return sendError(res, 409, "A member with that mobile or ID number already exists");

  const now = new Date().toISOString();
  const [firstName, ...surnameParts] = fullName.split(" ");
  const referralInput = findFieldAgent(db, payload);
  const member = {
    id: crypto.randomUUID(),
    mobileNumber: mobile,
    mobile,
    fullName,
    firstName: payload.firstName?.trim() || firstName || "",
    surname: payload.surname?.trim() || surnameParts.join(" ") || "",
    idNumber,
    branchId,
    idPhotoDataUrl: payload.id_doc_data_url || payload.idPhotoDataUrl || "",
    paymentReference: cashitReferenceForMobile(mobile),
    memberNumber: "",
    status: "pending",
    referralCode: referralInput.referralCode,
    fieldAgentId: referralInput.agent?.id || referralInput.fieldAgentId,
    agentSlug: referralInput.agent?.slug || referralInput.agentSlug,
    registrationSource: payload.source || (referralInput.referralCode || referralInput.fieldAgentId || referralInput.agentSlug ? "field_agent_dashboard" : "direct"),
    approvedAt: "",
    graceExpiry: "",
    alerts: [],
    createdAt: now,
    updatedAt: now,
  };
  const application = {
    id: nextId(db, "application", "app_"),
    memberId: member.id,
    kycStatus: member.idPhotoDataUrl ? "submitted" : "missing",
    idDocPath: member.idPhotoDataUrl ? `inline://${member.id}` : "",
    createdAt: now,
    updatedAt: now,
  };
  const kycDocument = member.idPhotoDataUrl
    ? {
        id: nextId(db, "kyc", "kyc_"),
        memberId: member.id,
        applicationId: application.id,
        documentType: "id_document",
        storagePath: application.idDocPath,
        dataUrl: member.idPhotoDataUrl,
        createdAt: now,
      }
    : null;

  db.members.push(member);
  db.applications.push(application);
  if (kycDocument) db.kycDocuments.push(kycDocument);
  if (referralInput.referralCode || referralInput.fieldAgentId || referralInput.agentSlug) {
    db.memberReferrals.push({
      id: nextId(db, "referral", "ref_"),
      memberId: member.id,
      fieldAgentId: referralInput.agent?.id || referralInput.fieldAgentId || referralInput.referralCode,
      fieldAgentName: referralInput.agent?.fullName || "",
      referralCode: referralInput.referralCode || referralInput.agent?.referralCode || "",
      agentSlug: referralInput.agent?.slug || referralInput.agentSlug || "",
      source: payload.source || "external_registration",
      status: referralInput.agent ? "attributed" : "unverified",
      commissionStatus: "pending_payment",
      createdAt: now,
      updatedAt: now,
    });
  }
  await saveDb(db);
  sendJson(res, 201, {
    ok: true,
    member_id: member.id,
    member_reference: member.paymentReference,
    application_id: application.id,
    referral: referralForMember(db, member.id),
    member: presentMember(db, member),
  });
}

async function approveMember(req, res, memberId) {
  const db = await loadDb();
  const member = db.members.find((item) => item.id === memberId);
  if (!member) return sendError(res, 404, "Member not found");

  const now = new Date().toISOString();
  member.approvedAt ||= now;
  member.memberNumber ||= `SATDWU-${String(db.members.filter((item) => item.memberNumber).length + 1).padStart(6, "0")}`;
  member.graceExpiry = addDays(now, db.settings.graceDays);
  member.status = "active";
  member.updatedAt = now;
  member.alerts = member.alerts.filter((alert) => alert.type !== "kyc");
  const application = db.applications.find((item) => item.memberId === member.id);
  if (application) {
    application.kycStatus = "approved";
    application.updatedAt = now;
  }

  await saveDb(db);
  sendJson(res, 200, { member: presentMember(db, member) });
}

async function renewMember(req, res) {
  const payload = await readBody(req);
  const db = await loadDb();
  const lookup = String(payload.member_id || payload.memberId || payload.mobile_number || payload.mobile || "").trim();
  const member = db.members.find(
    (item) =>
      item.id === lookup ||
      normalizePhone(item.mobileNumber || item.mobile) === normalizePhone(lookup) ||
      item.paymentReference?.toLowerCase() === lookup.toLowerCase() ||
      item.legacyPaymentReference?.toLowerCase() === lookup.toLowerCase(),
  );
  if (!member) return sendError(res, 404, "Member not found");
  if (["cancelled", "suspended"].includes(member.status)) {
    return sendError(res, 409, `Member is ${member.status} and cannot be renewed without admin review`);
  }

  const presented = presentMember(db, member);
  sendJson(res, 200, {
    ok: true,
    payment_required: true,
    member_id: member.id,
    member_reference: member.paymentReference,
    amount_due: db.settings.monthlyFee,
    grace_expiry_date: member.graceExpiry,
    status: presented.status,
    member: presented,
    instructions: `Pay R${db.settings.monthlyFee} via Cashit using cell number ${member.paymentReference}. Membership status updates only after Cashit confirms payment.`,
  });
}

async function pushReminder(req, res, memberId) {
  const payload = await readBody(req);
  const db = await loadDb();
  const member = db.members.find((item) => item.id === memberId);
  if (!member) return sendError(res, 404, "Member not found");

  const type = payload.type === "fee" ? "fee" : "kyc";
  const message =
    type === "fee"
      ? `Your standard monthly SATDWU membership fee of R${db.settings.monthlyFee} is due. Please process your payment at any Cashit terminal or via USSD using your Cashit account number: ${member.paymentReference}.`
      : "Please upload a clear scan/photo of your ID document to finalize your registration details.";

  member.alerts = member.alerts.filter((alert) => alert.type !== type);
  member.alerts.unshift({
    id: nextId(db, "alert", "alert_"),
    type,
    message,
    createdAt: new Date().toISOString(),
    readAt: "",
  });
  member.updatedAt = new Date().toISOString();
  const cashitNotification = type === "fee" ? await notifyCashitFieldAgent(db, member, type) : null;

  await saveDb(db);
  sendJson(res, 200, { member: presentMember(db, member), cashitNotification });
}

async function clearAlert(req, res, memberId, alertId) {
  const db = await loadDb();
  const member = db.members.find((item) => item.id === memberId);
  if (!member) return sendError(res, 404, "Member not found");
  member.alerts = member.alerts.filter((alert) => alert.id !== alertId);
  member.updatedAt = new Date().toISOString();
  await saveDb(db);
  sendJson(res, 200, { member: presentMember(db, member) });
}

function transactionFromPayload(db, payload, member, type) {
  const isCredit = type === "success";
  const isReversal = type === "reversal";
  const amount = Number(payload.amount_paid || payload.amountPaid || 0);
  return {
    id: nextId(db, "transaction", "txn_"),
    cashitTransactionId: payload.cashit_transaction_id || payload.cashitTransactionId || crypto.randomUUID(),
    memberId: member?.id || "",
    memberReference: payload.member_reference || payload.memberReference || "",
    amount,
    amountPaid: amount,
    paymentDate: payload.payment_date || payload.paymentDate || new Date().toISOString(),
    type,
    transactionType: isCredit ? "credit" : isReversal ? "reversal" : "debit",
    reference: payload.member_reference || payload.memberReference || "",
    failureReason: payload.failure_reason || payload.failureReason || "",
    rawPayload: payload,
    createdAt: new Date().toISOString(),
  };
}

async function cashitWebhook(req, res) {
  const payload = await readBody(req);
  const db = await loadDb();
  const eventType = String(payload.event_type || payload.eventType || payload.status || "success").toLowerCase();
  const memberReference = String(payload.member_reference || payload.memberReference || "").trim();
  const member = db.members.find(
    (item) =>
      item.paymentReference.toLowerCase() === memberReference.toLowerCase() ||
      item.legacyPaymentReference?.toLowerCase() === memberReference.toLowerCase(),
  );
  const cashitLog = {
    id: nextId(db, "transaction", "cashit_"),
    cashitTxId: payload.cashit_transaction_id || payload.cashitTransactionId || crypto.randomUUID(),
    memberReference,
    amountPaid: Number(payload.amount_paid || payload.amountPaid || 0),
    status: eventType.includes("success") || eventType === "paid" ? "success" : eventType.includes("fail") ? "failed" : "reversal",
    rawPayload: payload,
    createdAt: new Date().toISOString(),
  };
  db.cashitTransactions.unshift(cashitLog);

  if (eventType.includes("success") || eventType === "paid") {
    if (!member) {
      db.paymentExceptions.unshift({
        id: nextId(db, "transaction", "exception_"),
        cashitTransactionId: cashitLog.cashitTxId,
        cashitTxId: cashitLog.cashitTxId,
        memberReference,
        amountPaid: cashitLog.amountPaid,
        paymentDate: payload.payment_date || payload.paymentDate || new Date().toISOString(),
        rawPayload: payload,
        status: "unmatched",
        reason: "No member matched the incoming Cashit reference",
        createdAt: new Date().toISOString(),
      });
      await saveDb(db);
      return sendJson(res, 202, { matched: false, message: "Payment logged for finance reconciliation" });
    }

    const transaction = transactionFromPayload(db, payload, member, "success");
    db.memberLedger.unshift(transaction);
    member.graceExpiry = addDays(transaction.paymentDate, db.settings.graceDays);
    member.status = "active";
    member.updatedAt = new Date().toISOString();
    member.alerts = member.alerts.filter((alert) => alert.type !== "fee");
    const commission = createFirstPaymentCommission(db, member, transaction);
    await saveDb(db);
    return sendJson(res, 200, { matched: true, member: presentMember(db, member), transaction, commission });
  }

  if (eventType.includes("fail")) {
    const transaction = transactionFromPayload(db, payload, member, "failed");
    db.memberLedger.unshift(transaction);
    if (!member) {
      db.paymentExceptions.unshift({
        id: nextId(db, "transaction", "exception_"),
        cashitTransactionId: cashitLog.cashitTxId,
        cashitTxId: cashitLog.cashitTxId,
        memberReference,
        amountPaid: cashitLog.amountPaid,
        paymentDate: payload.payment_date || payload.paymentDate || new Date().toISOString(),
        rawPayload: payload,
        status: "failed",
        reason: payload.failure_reason || payload.failureReason || "Cashit payment failed",
        createdAt: new Date().toISOString(),
      });
    }
    await saveDb(db);
    return sendJson(res, 200, { matched: Boolean(member), transaction });
  }

  if (eventType.includes("reversal") || eventType.includes("reversed")) {
    const transaction = transactionFromPayload(db, payload, member, "reversal");
    transaction.amountPaid = -Math.abs(transaction.amountPaid);
    transaction.amount = transaction.amountPaid;
    db.memberLedger.unshift(transaction);
    if (member) {
      member.graceExpiry = addDays(new Date().toISOString(), -1);
      member.status = "unpaid";
      member.updatedAt = new Date().toISOString();
      const referral = referralForMember(db, member.id);
      const earnedCommission = referral
        ? db.commissionEvents.find(
            (event) =>
              event.memberId === member.id &&
              event.fieldAgentId === referral.fieldAgentId &&
              event.status === "earned",
          )
        : null;
      if (earnedCommission) {
        earnedCommission.status = "reversed";
        earnedCommission.reversedByTransactionId = transaction.id;
        earnedCommission.reversedAt = new Date().toISOString();
        referral.commissionStatus = "reversed";
        referral.updatedAt = new Date().toISOString();
      }
    }
    await saveDb(db);
    return sendJson(res, 200, { matched: Boolean(member), member: member ? presentMember(db, member) : null, transaction });
  }

  sendError(res, 400, "Unsupported Cashit event type");
}

async function linkUnmatched(req, res, unmatchedId) {
  const payload = await readBody(req);
  const db = await loadDb();
  const unmatched = db.paymentExceptions.find((item) => item.id === unmatchedId);
  const member = db.members.find((item) => item.id === payload.memberId);
  if (!unmatched) return sendError(res, 404, "Unmatched transaction not found");
  if (!member) return sendError(res, 404, "Member not found");
  if (unmatched.status !== "unmatched") return sendError(res, 409, "Transaction is already linked");

  unmatched.status = "linked";
  unmatched.linkedMemberId = member.id;
  unmatched.linkedAt = new Date().toISOString();
  const transaction = transactionFromPayload(
    db,
    {
      ...unmatched.rawPayload,
      cashit_transaction_id: unmatched.cashitTransactionId,
      member_reference: member.paymentReference,
      amount_paid: unmatched.amountPaid,
      payment_date: unmatched.paymentDate,
    },
    member,
    "success",
  );
  db.memberLedger.unshift(transaction);
  member.graceExpiry = addDays(unmatched.paymentDate, db.settings.graceDays);
  member.status = "active";
  member.updatedAt = new Date().toISOString();
  member.alerts = member.alerts.filter((alert) => alert.type !== "fee");
  const commission = createFirstPaymentCommission(db, member, transaction);

  await saveDb(db);
  sendJson(res, 200, { member: presentMember(db, member), transaction, unmatched, commission });
}

async function api(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/auth/login") return login(req, res);
  if (req.method === "POST" && url.pathname === "/api/auth/logout") return logout(req, res);
  if (req.method === "GET" && url.pathname === "/api/auth/me") return me(req, res);
  if (req.method === "GET" && url.pathname === "/api/member/me") return memberMe(req, res);

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const db = await loadDb();
    return sendJson(res, 200, { branches: db.branches, settings: db.settings, stats: stats(db) });
  }

  if (req.method === "POST" && (url.pathname === "/api/members" || url.pathname === "/api/register")) return registerMember(req, res);
  if (req.method === "POST" && url.pathname === "/api/renew") return renewMember(req, res);

  if (req.method === "GET" && url.pathname === "/api/members/lookup") {
    const db = await loadDb();
    const mobile = normalizePhone(url.searchParams.get("mobile"));
    const idNumber = String(url.searchParams.get("idNumber") || "").trim();
    const member = db.members.find((item) => normalizePhone(item.mobileNumber || item.mobile) === mobile || item.idNumber === idNumber);
    return member ? sendJson(res, 200, { member: presentMember(db, member) }) : sendError(res, 404, "Member not found");
  }

  const statusMatch = url.pathname.match(/^\/api\/status\/([^/]+)$/);
  if (req.method === "GET" && statusMatch) {
    const db = await loadDb();
    const lookup = decodeURIComponent(statusMatch[1]);
    const member = db.members.find(
      (item) =>
        item.id === lookup ||
      normalizePhone(item.mobileNumber || item.mobile) === normalizePhone(lookup) ||
      item.paymentReference?.toLowerCase() === lookup.toLowerCase() ||
      item.legacyPaymentReference?.toLowerCase() === lookup.toLowerCase(),
    );
    if (!member) return sendError(res, 404, "Member not found");
    const presented = presentMember(db, member);
    return sendJson(res, 200, {
      member_id: member.id,
      mobile_number: member.mobileNumber || member.mobile,
      status: presented.status.key,
      status_label: presented.status.label,
      grace_expiry_date: member.graceExpiry,
      member_reference: member.paymentReference,
      member: presented,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/field-agents/report") {
    const db = await loadDb();
    const filters = Object.fromEntries(url.searchParams.entries());
    if (!filters.field_agent_id && !filters.fieldAgentId && !filters.agent_id && !filters.agentId && !filters.agent_slug && !filters.agentSlug && !filters.agent && !filters.slug && !filters.referral_code && !filters.referralCode && !filters.ref) {
      return sendError(res, 400, "Missing field_agent_id, agent, or referral_code");
    }
    return sendJson(res, 200, fieldAgentReport(db, filters));
  }

  const fieldAgentReportMatch = url.pathname.match(/^\/api\/field-agents\/([^/]+)\/report$/);
  if (req.method === "GET" && fieldAgentReportMatch) {
    const db = await loadDb();
    return sendJson(res, 200, fieldAgentReport(db, { field_agent_id: decodeURIComponent(fieldAgentReportMatch[1]) }));
  }

  const referralReportMatch = url.pathname.match(/^\/api\/referrals\/([^/]+)\/report$/);
  if (req.method === "GET" && referralReportMatch) {
    const db = await loadDb();
    return sendJson(res, 200, fieldAgentReport(db, { referral_code: decodeURIComponent(referralReportMatch[1]) }));
  }

  if (req.method === "GET" && url.pathname === "/api/admin/members") {
    const db = await loadDb();
    if (!requireRole(db, req, res, ["admin"])) return;
    return sendJson(res, 200, { members: filterMembers(db, url), stats: stats(db) });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/reporting") {
    const db = await loadDb();
    if (!requireRole(db, req, res, ["admin"])) return;
    return sendJson(res, 200, reportingSummary(db));
  }

  const approveMatch = url.pathname.match(/^\/api\/admin\/members\/([^/]+)\/approve$/);
  if (req.method === "POST" && approveMatch) {
    const db = await loadDb();
    if (!requireRole(db, req, res, ["admin"])) return;
    return approveMember(req, res, approveMatch[1]);
  }

  const reminderMatch = url.pathname.match(/^\/api\/admin\/members\/([^/]+)\/reminders$/);
  if (req.method === "POST" && reminderMatch) {
    const db = await loadDb();
    if (!requireRole(db, req, res, ["admin"])) return;
    return pushReminder(req, res, reminderMatch[1]);
  }

  const alertMatch = url.pathname.match(/^\/api\/members\/([^/]+)\/alerts\/([^/]+)$/);
  if (req.method === "DELETE" && alertMatch) return clearAlert(req, res, alertMatch[1], alertMatch[2]);

  if (req.method === "POST" && url.pathname === "/api/cashit/webhook") return cashitWebhook(req, res);

  if (req.method === "GET" && url.pathname === "/api/finance/unmatched") {
    const db = await loadDb();
    if (!requireRole(db, req, res, ["admin"])) return;
    return sendJson(res, 200, {
      unmatched: db.paymentExceptions,
      members: sortMembers(db.members).map((member) => presentMember(db, member)),
    });
  }

  const linkMatch = url.pathname.match(/^\/api\/finance\/unmatched\/([^/]+)\/link$/);
  if (req.method === "POST" && linkMatch) {
    const db = await loadDb();
    if (!requireRole(db, req, res, ["admin"])) return;
    return linkUnmatched(req, res, linkMatch[1]);
  }

  if (req.method === "GET" && url.pathname === "/api/finance/transactions") {
    const db = await loadDb();
    if (!requireRole(db, req, res, ["admin"])) return;
    return sendJson(res, 200, {
      transactions: db.memberLedger.map((transaction) => ({
        ...transaction,
        member: db.members.find((member) => member.id === transaction.memberId) || null,
      })),
    });
  }

  sendError(res, 404, "Endpoint not found");
}

async function staticFile(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) return sendError(res, 403, "Forbidden");

  try {
    await stat(filePath);
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(302, { location: "/" });
    res.end();
  }
}

const server = createServer(async (req, res) => {
  try {
    for (const [header, value] of Object.entries(corsHeaders(req))) {
      res.setHeader(header, value);
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return await staticFile(req, res, url);
  } catch (error) {
    console.error(error);
    sendError(res, 500, error.message || "Server error");
  }
});

server.listen(port, () => {
  console.log(`SATDWU Membership System running on http://localhost:${port}`);
});
