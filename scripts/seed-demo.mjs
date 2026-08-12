import { createClient } from "@supabase/supabase-js";

const DEMO_PASSWORD = "SignalDemo!2026";
const LOGO_SOURCE = "https://logoipsum.com/";
const SESSION_INTERVAL_MS = 9000;
let lastSessionAt = 0;

const startupSeeds = [
  { name: "Handrail", slug: "handrail", category: "SaaS", founderName: "Maya Haddad", slogan: "Keep the work moving after the meeting ends.", shortDescription: "Handrail turns scattered decisions into a visible trail of owners, dates, and next steps for teams that work across too many tools.", longDescription: "Most teams do not lose momentum because they lack another project board. They lose it in the quiet space after a meeting: a decision lives in a recording, an owner lives in a chat thread, and the deadline lives in someone's memory. Handrail captures the decision while it is still fresh, gives it one accountable owner, and keeps the next step visible until it is closed. The product is designed for small operating teams that want less ceremony and more follow-through.", votes: 168, comments: 32, interests: 8, views: 420 },
  { name: "Open Pantry", slug: "open-pantry", category: "Retail", founderName: "Rana Kamel", slogan: "Make everyday buying feel less wasteful.", shortDescription: "Open Pantry helps independent grocers move surplus stock through local, time-sensitive bundles instead of last-minute disposal.", longDescription: "Independent grocers often know exactly what will go unsold, but they do not have the time or demand signals to move it gracefully. Open Pantry lets a shop assemble honest, time-limited bundles from surplus inventory and offer them to nearby customers who already want a better deal. The focus is not another delivery marketplace; it is a calmer operating layer for the final hours of products that still have value.", votes: 142, comments: 28, interests: 8, views: 360 },
  { name: "Daymark", slug: "daymark", category: "Logistics", founderName: "Karim Nassar", slogan: "Give every handoff a place to land.", shortDescription: "Daymark gives small logistics teams a shared view of delayed handoffs, proof of delivery, and the people who need to act next.", longDescription: "A package can be physically close and operationally lost. Daymark is built for the small carriers, distributors, and field teams that still coordinate exceptions through phone calls and spreadsheets. It gathers the evidence around a handoff, makes the delay legible, and routes the next action to the person who can actually fix it. The product starts with visibility, then earns the right to automate only the parts that are predictable.", votes: 128, comments: 24, interests: 8, views: 310 },
  { name: "Quiet Hours", slug: "quiet-hours", category: "HealthTech", founderName: "Lina Youssef", slogan: "Care coordination that respects the day.", shortDescription: "Quiet Hours helps family caregivers coordinate appointments, medication questions, and updates without turning care into a second job.", longDescription: "Family care is full of tiny tasks that become expensive when nobody knows who owns them. Quiet Hours gives families a shared, low-noise place for appointment details, questions for clinicians, medication reminders, and updates that should not be buried in a group chat. It is intentionally built around clarity and consent: the right people see the right update, and the family can spend less energy remembering what happened last.", votes: 96, comments: 21, interests: 8, views: 270 },
  { name: "Side Door", slug: "side-door", category: "FinTech", founderName: "Nadine Fawzy", slogan: "Shorten the distance between work and getting paid.", shortDescription: "Side Door helps service businesses turn completed work into cleaner invoices, payment follow-up, and a clearer weekly cash picture.", longDescription: "For a small service business, cash flow rarely breaks in one dramatic moment. It leaks through late invoices, unclear approvals, and work that was finished but never properly closed. Side Door connects the job, the invoice, and the follow-up without asking the owner to become a finance operator. The first product is deliberately narrow: make completed work easier to bill and easier to understand.", votes: 84, comments: 18, interests: 7, views: 240 },
  { name: "Common Ground", slug: "common-ground", category: "AgriTech", founderName: "Yara Salim", slogan: "Make shared growing decisions easier.", shortDescription: "Common Ground gives small farms and buyers a shared record for planting commitments, quality notes, and seasonal changes.", longDescription: "Small growers and their buyers make important decisions before the season has revealed itself. Common Ground keeps those commitments in one place: what was planted, what quality was expected, what changed in the field, and what both sides agreed to do next. It is a coordination product for relationships that already exist, helping them survive weather, timing, and changing demand without replacing the trust that makes them work.", votes: 77, comments: 17, interests: 6, views: 220 },
  { name: "Borrowed Time", slug: "borrowed-time", category: "HealthTech", founderName: "Hassan Elmasry", slogan: "A better record for the moments between visits.", shortDescription: "Borrowed Time helps people keep a simple, shareable record of symptoms and questions between clinical appointments.", longDescription: "A ten-minute appointment can depend on weeks of scattered observations. Borrowed Time gives people a private place to record what changed, what helped, and what they want to ask next. The goal is not to diagnose from a distance; it is to help a person arrive with a clearer account and leave with a better next step.", votes: 70, comments: 15, interests: 6, views: 205 },
  { name: "Field Manual", slug: "field-manual", category: "SaaS", founderName: "Tarek Amin", slogan: "Turn the best way of working into the next person's start.", shortDescription: "Field Manual helps operational teams turn hard-won processes into usable, searchable playbooks that stay close to the work.", longDescription: "The most valuable process knowledge in a company is often stored in someone's judgment. Field Manual helps teams capture the decision, the context, and the exception instead of producing manuals nobody opens. Playbooks stay short, searchable, and connected to the moment where a new teammate needs them. It is built for operations that change often but still need a reliable baseline.", votes: 62, comments: 14, interests: 5, views: 190 },
  { name: "Long Table", slug: "long-table", category: "Retail", founderName: "Salma Atef", slogan: "Help local makers sell without losing their story.", shortDescription: "Long Table gives independent makers a shared storefront for limited collections, preorder windows, and customer notes.", longDescription: "Small makers are good at making things and often bad at maintaining a storefront across every channel. Long Table gives them a lightweight place to present a collection, collect preorders, and keep the story of the work attached to the sale. The product is designed around limited runs and real constraints, not endless catalogues and discount cycles.", votes: 56, comments: 12, interests: 5, views: 175 },
  { name: "Blue Hour", slug: "blue-hour", category: "Climate", founderName: "Omar Taha", slogan: "See the expensive energy before it becomes a bill.", shortDescription: "Blue Hour helps small buildings spot avoidable energy waste through simple routines, readings, and action lists.", longDescription: "Most small buildings do not need another climate dashboard. They need to know which habit, room, or piece of equipment is quietly costing them money this week. Blue Hour turns a few reliable readings into a short list of actions that a facilities team can actually complete, then makes the result visible enough to keep the routine alive.", votes: 49, comments: 11, interests: 4, views: 160 },
  { name: "Second Shift", slug: "second-shift", category: "EdTech", founderName: "Dalia Magdy", slogan: "Learning that fits around the life you already have.", shortDescription: "Second Shift helps working adults choose short learning paths tied to a concrete task, not a shelf of unfinished courses.", longDescription: "People do not usually stop learning because they stopped caring. They stop because the course asks for a life they do not have. Second Shift organizes practical learning into small paths built around a real task, a deadline, and a way to show the work. The product is for people who want progress they can use this week, not another badge they may never mention.", votes: 42, comments: 10, interests: 4, views: 145 },
  { name: "The Workshop", slug: "the-workshop", category: "EdTech", founderName: "Youssef Riad", slogan: "Make practice visible before the big opportunity.", shortDescription: "The Workshop gives early-career people a place to build small, reviewable work samples with feedback from practitioners.", longDescription: "Early-career talent is often asked to prove experience before anyone gives them a meaningful chance to build it. The Workshop makes the practice visible: a small brief, a real artifact, focused feedback, and a clearer record of what improved. It is not a course catalogue and it is not a job board. It is a place to make better evidence before the interview.", votes: 36, comments: 9, interests: 3, views: 130 },
  { name: "Tide Office", slug: "tide-office", category: "SaaS", founderName: "Mariam Zaki", slogan: "A calmer operating rhythm for small teams.", shortDescription: "Tide Office helps small teams see commitments, capacity, and the decisions that changed the plan without adding another noisy feed.", longDescription: "Small teams rarely need more notifications. They need a shared sense of what is committed, what is slipping, and what changed the plan. Tide Office brings those three questions together in a weekly operating view that is easy to update and hard to misread. The product is intentionally opinionated about focus: fewer streams, clearer decisions.", votes: 29, comments: 8, interests: 3, views: 115 },
  { name: "Paper Trail", slug: "paper-trail", category: "FinTech", founderName: "Ahmed Waleed", slogan: "Know which document is holding up the work.", shortDescription: "Paper Trail helps small businesses track missing documents, approvals, and renewal dates across the vendors they depend on.", longDescription: "A missing certificate or unsigned form can hold up a payment, a delivery, or an entire relationship. Paper Trail gives small teams one practical place to see what is missing, who owns the next step, and when a document needs attention again. It is a boring problem with an expensive habit: nobody should have to search five inboxes to find the one file that matters.", votes: 23, comments: 7, interests: 2, views: 95 },
  { name: "Good Weather", slug: "good-weather", category: "Climate", founderName: "Huda Farouk", slogan: "Plan outdoor work with more than a forecast.", shortDescription: "Good Weather helps outdoor operators combine local conditions, crew constraints, and customer commitments before the day starts.", longDescription: "A forecast is useful, but an outdoor business needs a decision. Good Weather helps crews compare local conditions with the work planned for the day, the equipment available, and the customers already booked. The result is a clearer call earlier in the morning, when a change is still possible and a wasted trip is not yet sunk cost.", votes: 17, comments: 6, interests: 2, views: 80 }
];

const commentTemplates = [
  "The problem is easy to recognize; the narrower first workflow makes the idea credible.",
  "I would want to see how this behaves when the team has an exception, not just the happy path.",
  "The strongest part is the clear handoff between people, not another dashboard.",
  "This feels specific enough to test with a small group of real users.",
  "The promise is clear. I would keep the first version focused on one repeated moment."
];

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function createAdminClient() {
  const url = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function createPublicClient() {
  const url = requireEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function createUserClient(account) {
  const wait = Math.max(0, SESSION_INTERVAL_MS - (Date.now() - lastSessionAt));
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  lastSessionAt = Date.now();
  const adminClient = createAdminClient();
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({ type: "magiclink", email: account.email });
  if (linkError || !linkData?.properties?.action_link) throw new Error(`Could not create a session for ${account.email}: ${linkError?.message ?? "No action link returned."}`);
  const response = await fetch(linkData.properties.action_link, { redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  const fragment = location.includes("#") ? new URLSearchParams(location.split("#")[1]) : null;
  const accessToken = fragment?.get("access_token");
  if (!accessToken) throw new Error(`Could not establish a session for ${account.email}.`);
  return createClient(requireEnvironment("NEXT_PUBLIC_SUPABASE_URL"), requireEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { autoRefreshToken: false, persistSession: false } });
}

function makeSeedEmail(prefix, index) {
  return `seed.${prefix}.${String(index).padStart(3, "0")}@signal-demo.example.com`;
}

function activityDate(startupIndex, activityIndex, spanDays = 45) {
  const offsetDays = (startupIndex * 3 + activityIndex * 2) % spanDays;
  const offsetHours = (startupIndex + activityIndex) % 18;
  return new Date(Date.now() - offsetDays * 86400000 - offsetHours * 3600000).toISOString();
}

async function listAuthUsers(supabase) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function ensureAuthUser(supabase, existingByEmail, account) {
  const existing = existingByEmail.get(account.email);
  if (existing) return existing;
  const { data, error } = await supabase.auth.admin.createUser({ email: account.email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: { name: account.name, role: account.role } });
  if (error) throw new Error(`Could not create ${account.email}: ${error.message}`);
  return data.user;
}

async function ensureAccounts(supabase, accounts) {
  const existingUsers = await listAuthUsers(supabase);
  const existingByEmail = new Map(existingUsers.filter((user) => user.email).map((user) => [user.email, user]));
  const users = [];
  for (const account of accounts) users.push(await ensureAuthUser(supabase, existingByEmail, account));
  return users.map((user, index) => ({ ...user, seedAccount: accounts[index] }));
}

async function resetDevData(supabase) {
  if (process.env.SEED_ALLOW_RESET !== "true") throw new Error("Set SEED_ALLOW_RESET=true to delete the current dev startups.");
  const users = await listAuthUsers(supabase);
  for (const user of users) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`Dev user reset failed: ${error.message}`);
  }
  console.log(`Removed ${users.length} existing users; their startups and activity rows cascade-delete from the schema.`);
}

async function collectLogoSvgs() {
  const sources = [LOGO_SOURCE, "https://logoipsum.com/artwork/251", "https://logoipsum.com/artwork/226", "https://logoipsum.com/artwork/220"];
  const candidates = [];
  for (const source of sources) {
    const response = await fetch(source, { headers: { "User-Agent": "SIGNAL demo seed" } });
    if (!response.ok) throw new Error(`Logo source returned ${response.status}.`);
    const html = await response.text();
    candidates.push(...(html.match(/<svg[\s\S]*?<\/svg>/gi)?.filter((svg) => svg.length > 1000 && !/class=["']w-/i.test(svg)) ?? []));
    if (candidates.length >= startupSeeds.length) break;
  }
  const unique = [...new Map(candidates.map((svg) => [svg.replace(/\s+/g, ""), svg])).values()];
  if (unique.length < startupSeeds.length) throw new Error(`Logo source returned only ${unique.length} usable marks.`);
  return unique.slice(0, startupSeeds.length);
}

async function uploadLogoForFounder(client, founder, startupId, seed, logoSvg) {
  const path = `${founder.id}/${startupId}/logo.svg`;
  const { error: uploadError } = await client.storage.from("startup-logos").upload(path, new Blob([logoSvg], { type: "image/svg+xml" }), { contentType: "image/svg+xml", upsert: true });
  if (uploadError) throw new Error(`Logo upload failed for ${seed.name}: ${uploadError.message}`);
  const logoUrl = client.storage.from("startup-logos").getPublicUrl(path).data.publicUrl;
  const { error: updateError } = await client.from("startups").update({ logo_url: logoUrl }).eq("id", startupId);
  if (updateError) throw new Error(`Logo link failed for ${seed.name}: ${updateError.message}`);
  return logoUrl;
}

async function seedStartups(founders, logoSvgs) {
  const startups = [];
  for (let index = 0; index < startupSeeds.length; index += 1) {
    const seed = startupSeeds[index];
    const founderClient = await createUserClient(founders[index].seedAccount);
    const row = { founder_id: founders[index].id, name: seed.name, slug: seed.slug, slogan: seed.slogan, short_description: seed.shortDescription, long_description: seed.longDescription, website_url: null, category: seed.category, status: "launched", votes_count: seed.votes, view_count: seed.views, created_at: new Date(Date.now() - (index + 4) * 86400000).toISOString(), launched_at: new Date(Date.now() - (index + 3) * 86400000).toISOString() };
    const { data, error } = await founderClient.from("startups").insert(row).select("id, name, slug").single();
    if (error) throw new Error(`Startup seed failed for ${seed.name}: ${error.message}`);
    await uploadLogoForFounder(founderClient, founders[index], data.id, seed, logoSvgs[index]);
    startups.push(data);
  }
  return startups;
}

async function seedUserRecords(client, table, records) {
  if (!records.length) return;
  const { error } = await client.from(table).insert(records);
  if (error) throw new Error(`${table} user seed failed: ${error.message}`);
}

async function seedPublicActivity(startups, publicUsers) {
  for (let userIndex = 0; userIndex < publicUsers.length; userIndex += 1) {
    const account = publicUsers[userIndex];
    const client = await createUserClient(account.seedAccount);
    const votes = startups.map((startup, startupIndex) => ({ startup_id: startup.id, user_id: account.id, created_at: activityDate(startupIndex, userIndex) }));
    const comments = startups.flatMap((startup, startupIndex) => Array.from({ length: startupSeeds[startupIndex].comments }, (_, commentIndex) => commentIndex % publicUsers.length === userIndex ? ({ startup_id: startup.id, user_id: account.id, content: commentTemplates[(startupIndex + commentIndex) % commentTemplates.length], created_at: activityDate(startupIndex, commentIndex + 7) }) : null).filter(Boolean));
    const saves = startups.filter((_, startupIndex) => (startupIndex + userIndex) % 2 === 0).map((startup, startupIndex) => ({ startup_id: startup.id, user_id: account.id, created_at: activityDate(startupIndex, userIndex + 11) }));
    await seedUserRecords(client, "votes", votes);
    await seedUserRecords(client, "comments", comments);
    await seedUserRecords(client, "saves", saves);
  }
}

async function seedInvestorActivity(startups, investors) {
  for (let userIndex = 0; userIndex < investors.length; userIndex += 1) {
    const account = investors[userIndex];
    const client = await createUserClient(account.seedAccount);
    const interests = startups.filter((_, startupIndex) => userIndex < startupSeeds[startupIndex].interests).map((startup, startupIndex) => ({ startup_id: startup.id, investor_id: account.id, status: "interested", message: `I am looking at ${startupSeeds[startupIndex].name} because the problem is close to the markets I follow. I would like to understand what you have learned from early users.`, contact_email: account.email, created_at: activityDate(startupIndex, userIndex + 3) }));
    await seedUserRecords(client, "investor_interests", interests);
  }
}

async function seedActivity(startups, publicUsers, investors) {
  await seedPublicActivity(startups, publicUsers);
  await seedInvestorActivity(startups, investors);
}

async function restoreDemoSignalCounters(startups, founders) {
  for (let index = 0; index < startups.length; index += 1) {
    const client = await createUserClient(founders[index].seedAccount);
    const { error } = await client.from("startups").update({ votes_count: startupSeeds[index].votes }).eq("id", startups[index].id).eq("founder_id", founders[index].id);
    if (error) throw new Error(`Demo signal counter restore failed for ${startupSeeds[index].name}: ${error.message}`);
  }
}

async function verifySeed() {
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("startups").select("name, status, votes_count, investor_interest_count, feedback_count, view_count").order("votes_count", { ascending: false });
  if (error) throw new Error(`Seed verification failed: ${error.message}`);
  if (data.length !== startupSeeds.length || data.some((startup) => startup.status !== "launched")) throw new Error("Seed verification found an unexpected startup set.");
  if ((data[0]?.votes_count ?? 0) < 100 || (data[1]?.votes_count ?? 0) < 100 || (data[2]?.votes_count ?? 0) < 100) throw new Error("Seed verification found fewer than 100 signals on one of the first three startups.");
  console.table(data);
}

function makeAccounts() {
  const founders = startupSeeds.map((seed, index) => ({ email: makeSeedEmail("founder", index + 1), name: seed.founderName, role: "founder" }));
  const investors = Array.from({ length: 8 }, (_, index) => ({ email: index === 0 ? "demo.investor@signal-demo.example.com" : makeSeedEmail("investor", index), name: index === 0 ? "Omar Fathy" : `Seed Investor ${index}`, role: "investor", bio: "Looks for practical products with clear user evidence.", interests: ["SaaS", "FinTech", "HealthTech"] }));
  const publicAccounts = Array.from({ length: 6 }, (_, index) => ({ email: index === 0 ? "demo.explorer@signal-demo.example.com" : makeSeedEmail("explorer", index), name: index === 0 ? "Nour Adel" : `Seed Explorer ${index}`, role: "public" }));
  return { founders, investors, publicAccounts };
}

async function main() {
  const adminClient = createAdminClient();
  const accounts = makeAccounts();
  await resetDevData(adminClient);
  const [founders, investors, publicUsers] = await Promise.all([ensureAccounts(adminClient, accounts.founders), ensureAccounts(adminClient, accounts.investors), ensureAccounts(adminClient, accounts.publicAccounts)]);
  const logos = await collectLogoSvgs();
  const startups = await seedStartups(founders, logos);
  await seedActivity(startups, publicUsers, investors);
  await restoreDemoSignalCounters(startups, founders);
  await verifySeed();
  console.log("Demo accounts:");
  console.log("Explorer: demo.explorer@signal-demo.example.com");
  console.log("Investor: demo.investor@signal-demo.example.com");
  console.log("Password for demo accounts: SignalDemo!2026");
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
