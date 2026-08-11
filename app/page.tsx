"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bookmark,
  Bell,
  Check,
  ChevronDown,
  CircleUserRound,
  Copy,
  ExternalLink,
  Heart,
  Link2,
  LoaderCircle,
  LogOut,
  Mail,
  MailCheck,
  Menu,
  MessageCircle,
  Quote,
  ScanSearch,
  Search,
  Send,
  Share2,
  Sparkles,
  Target,
  Triangle,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  X
} from "lucide-react";
import { categories } from "@/lib/startup-categories";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { mapSignalStartupToUi } from "@/lib/signal-mappers";
import { calculateSignalScore } from "@/lib/signal-scoring";
import type { SignalStartup } from "@/lib/signal-types";
import type { Comment, Startup, UserRole } from "@/lib/ui-types";

type View = "discover" | "details" | "dashboard" | "profile" | "saved";
type AuthMode = "signin" | "signup";
type CurrentUser = { id: string; name: string; role: UserRole; email?: string };
type AiMatch = { startupId: string; matchScore: number; reasons: string[]; startup?: Startup };
type NotificationItem = { id: string; kind: "intro" | "vote"; startupId: string; startupName: string; title: string; body: string; createdAt: string; interestId?: string };
type FounderForm = { name: string; slogan: string; category: string; website: string; description: string; longDescription: string };

const aiSteps = ["Reading your criteria", "Comparing live signals", "Ranking the closest fits", "Preparing your shortlist"];
const roleLabels: Record<UserRole, string> = { public: "Explorer", investor: "Investor", founder: "Founder" };

function createEmptyStartup(id: string): Startup {
  return { id, name: "Loading launch", slogan: "Reading the live signal…", shortDescription: "", longDescription: "", category: "", stage: "", geography: "", website: "", accent: "#d9dbe5", logoLetter: "", votes: 0, interests: 0, engagement: "0%", tags: [], status: "launched" };
}

function readUserRole(value: unknown): UserRole | null {
  return value === "public" || value === "investor" || value === "founder" ? value : null;
}

function resolveUserRole(profileRole: unknown, metadataRole: unknown, fallback: UserRole = "public"): UserRole {
  const storedRole = readUserRole(profileRole);
  const signupRole = readUserRole(metadataRole);
  return storedRole === "public" && signupRole && signupRole !== "public" ? signupRole : storedRole ?? signupRole ?? fallback;
}

async function parseJsonResponse<T>(response: Response, requestName: string): Promise<T> {
  const responseText = await response.text();
  if (!responseText.trim()) throw new Error(`${requestName} returned an empty response (${response.status}).`);
  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(`${requestName} returned an invalid response (${response.status}).`);
  }
}

export default function HomePage() {
  const [view, setView] = useState<View>("discover");
  const [selectedStartupId, setSelectedStartupId] = useState("");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authRole, setAuthRole] = useState<UserRole>("public");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [founderRequestId, setFounderRequestId] = useState("");
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [founderConversionOpen, setFounderConversionOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 1700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (currentUser?.role !== "founder") return;
    let active = true;
    async function loadNotifications() {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        const payload = await parseJsonResponse<{ notifications?: NotificationItem[] }>(response, "Notifications");
        if (active && response.ok) setNotifications(payload.notifications ?? []);
      } catch { /* notifications are supplementary; the workspace remains usable */ }
    }
    void loadNotifications();
    const interval = window.setInterval(() => void loadNotifications(), 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    function syncHistoryState() {
      const startupFromUrl = new URLSearchParams(window.location.search).get("startup");
      setSelectedStartupId(startupFromUrl ?? "");
      setView(startupFromUrl ? "details" : "discover");
    }
    window.addEventListener("popstate", syncHistoryState);
    return () => window.removeEventListener("popstate", syncHistoryState);
  }, []);

  useEffect(() => {
    const startupFromUrl = new URLSearchParams(window.location.search).get("startup");
    if (startupFromUrl) {
      window.setTimeout(() => {
        setSelectedStartupId(startupFromUrl);
        setView("details");
      }, 0);
    }
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    const browserClient = supabase;
    let active = true;
    async function loadSessionProfile() {
      const { data: userData, error: userError } = await browserClient.auth.getUser();
      if (!active) return;
      if (userError || !userData.user) {
        setCurrentUser(null);
        return;
      }
      const { data: profile } = await browserClient.from("profiles").select("full_name, role").eq("id", userData.user.id).maybeSingle();
      if (active) setCurrentUser({ id: userData.user.id, name: profile?.full_name ?? userData.user.email ?? "SIGNAL user", email: userData.user.email ?? "", role: resolveUserRole(profile?.role, userData.user.user_metadata?.role) });
    }
    void loadSessionProfile();
    const { data: authListener } = browserClient.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setCurrentUser(null);
      else window.setTimeout(() => void loadSessionProfile(), 0);
    });
    return () => { active = false; authListener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectedStartup = createEmptyStartup(selectedStartupId || "loading");

  function showToast(message: string) { setToast(message); }

  function openAuth(mode: AuthMode = "signin", role: UserRole = "public") {
    setAuthMode(mode);
    setAuthRole(role);
    setAuthOpen(true);
  }

  function navigate(nextView: View) {
    setView(nextView);
    if (nextView !== "dashboard") setFounderRequestId("");
    setMobileNavOpen(false);
    if (nextView !== "details") window.history.pushState({}, "", "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openFounderRequest(interestId: string) {
    setFounderRequestId(interestId);
    setView("dashboard");
    setMobileNavOpen(false);
    window.history.pushState({}, "", "/");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openDetails(startupId: string) {
    setSelectedStartupId(startupId);
    setView("details");
    setMobileNavOpen(false);
    window.history.pushState({}, "", `/?startup=${encodeURIComponent(startupId)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    if (supabase) await supabase.auth.signOut();
    setCurrentUser(null);
    navigate("discover");
    showToast("You are signed out");
  }

  async function becomeFounder() {
    if (!currentUser) { openAuth("signup", "founder"); return; }
    try {
      const response = await fetch("/api/profile/role", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "founder" }) });
      const payload = await parseJsonResponse<{ role?: UserRole; error?: string }>(response, "Role change");
      if (!response.ok || payload.role !== "founder") throw new Error(payload.error ?? "Founder access could not be enabled.");
      setCurrentUser({ ...currentUser, role: "founder" });
      showToast("Founder workspace is ready");
      navigate("dashboard");
    } catch (roleError) {
      showToast(roleError instanceof Error ? roleError.message : "Founder access could not be enabled.");
    }
  }

  function requestFounderMode() {
    if (!currentUser) { openAuth("signup", "founder"); return; }
    if (currentUser.role === "founder") { navigate("dashboard"); return; }
    setFounderConversionOpen(true);
  }

  return (
    <main className="signal-app">
      {isLoading && <InitialLoader />}
      <Header currentView={view} currentUser={currentUser} notifications={notifications} notificationsOpen={notificationsOpen} onToggleNotifications={() => setNotificationsOpen((open) => !open)} mobileNavOpen={mobileNavOpen} onToggleMobileNav={() => setMobileNavOpen((open) => !open)} onNavigate={navigate} onOpenDetails={openDetails} onOpenFounderRequest={openFounderRequest} onOpenAccountSettings={() => setAccountSettingsOpen(true)} onSignIn={() => openAuth()} onLaunch={requestFounderMode} onSignOut={signOut} />
      {view === "discover" && <DiscoverPage role={currentUser?.role ?? "public"} isAuthenticated={Boolean(currentUser)} onOpenDetails={openDetails} onToast={showToast} onRequireAuth={(mode = "signin", role = "public") => openAuth(mode, role)} onLaunch={requestFounderMode} />}
      {view === "details" && <DetailsPage startup={selectedStartup} role={currentUser?.role ?? "public"} currentUserId={currentUser?.id ?? ""} currentUserName={currentUser?.name ?? ""} isAuthenticated={Boolean(currentUser)} onBack={() => navigate("discover")} onToast={showToast} onOpenDetails={openDetails} onRequireAuth={(mode = "signin", role = "public") => openAuth(mode, role)} />}
      {view === "dashboard" && <FounderStudioPage initialRequestId={founderRequestId} onBack={() => navigate("discover")} onToast={showToast} onRequireAuth={becomeFounder} />}
      {view === "profile" && <InvestorProfilePage onBack={() => navigate("discover")} onToast={showToast} onBecomeFounder={requestFounderMode} />}
      {view === "saved" && <SavedPage onBack={() => navigate("discover")} onOpenDetails={openDetails} onToast={showToast} />}
      <Footer />
      {toast && <div className="toast" role="status"><Check size={15} />{toast}</div>}
      {authOpen && <AuthModal initialMode={authMode} initialRole={authRole} onClose={() => setAuthOpen(false)} onAuthenticated={(user) => { setCurrentUser(user); setAuthOpen(false); if (user.role === "founder") navigate("dashboard"); }} onToast={showToast} />}
      {accountSettingsOpen && currentUser && <AccountSettingsModal currentUser={currentUser} onClose={() => setAccountSettingsOpen(false)} onSaved={(name) => { setCurrentUser((user) => user ? { ...user, name } : user); setAccountSettingsOpen(false); }} onToast={showToast} />}
      {founderConversionOpen && currentUser && <FounderConversionModal currentRole={currentUser.role} onClose={() => setFounderConversionOpen(false)} onConfirm={() => { setFounderConversionOpen(false); void becomeFounder(); }} />}
    </main>
  );
}

function InitialLoader() {
  return <div className="initial-loader" aria-label="Loading SIGNAL"><svg className="ecg-loader" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path className="ecg-trace" d="M0 10H35 C37 10 38 8 40 5 C42 2 44 2 46 5 C48 8 49 17 51 17 C53 17 54 2 56 2 C58 2 59 8 61 10 C63 10 64 10 65 10 H100" /></svg></div>;
}

function Header({ currentView, currentUser, notifications, notificationsOpen, onToggleNotifications, mobileNavOpen, onToggleMobileNav, onNavigate, onOpenDetails, onOpenFounderRequest, onOpenAccountSettings, onSignIn, onLaunch, onSignOut }: { currentView: View; currentUser: CurrentUser | null; notifications: NotificationItem[]; notificationsOpen: boolean; onToggleNotifications: () => void; mobileNavOpen: boolean; onToggleMobileNav: () => void; onNavigate: (view: View) => void; onOpenDetails: (id: string) => void; onOpenFounderRequest: (interestId: string) => void; onOpenAccountSettings: () => void; onSignIn: () => void; onLaunch: () => void; onSignOut: () => void }) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const isInvestor = currentUser?.role === "investor";
  const isFounder = currentUser?.role === "founder";
  function navigateFromAccount(nextView: View) {
    setAccountMenuOpen(false);
    onNavigate(nextView);
  }
  return <header className="topbar">
    <div className="topbar-inner">
      <button className="brand" onClick={() => onNavigate("discover")} aria-label="Go to discover"><Image src="/logo.png" alt="" width={28} height={28} priority /><span>SIGNAL</span></button>
      <button className="mobile-menu" onClick={onToggleMobileNav} aria-label="Toggle navigation">{mobileNavOpen ? <X size={19} /> : <Menu size={19} />}</button>
      <nav className={mobileNavOpen ? "main-nav is-open" : "main-nav"} aria-label="Primary navigation">
        <button className={currentView === "discover" ? "nav-link active" : "nav-link"} onClick={() => onNavigate("discover")}>Discover</button>
        {currentUser && <button className={currentView === "saved" ? "nav-link active" : "nav-link"} onClick={() => onNavigate("saved")}>Saved</button>}
        {isInvestor && <button className={currentView === "profile" ? "nav-link active" : "nav-link"} onClick={() => onNavigate("profile")}>Profile</button>}
        {isFounder && <button className={currentView === "dashboard" ? "nav-link active" : "nav-link"} onClick={() => onNavigate("dashboard")}>Workspace</button>}
      </nav>
      <div className="topbar-actions">
        {!currentUser && <button className="plain-action" onClick={onSignIn}>Sign in</button>}
        {!currentUser && <button className="header-cta" onClick={onLaunch}>List a startup <ArrowUpRight size={14} /></button>}
        {isFounder && <div className="notification-wrap"><button className="notification-button" onClick={onToggleNotifications} aria-label={`Notifications${notifications.length ? `, ${notifications.length} new` : ""}`} aria-expanded={notificationsOpen}><Bell size={17} />{notifications.length > 0 && <span className="notification-count">{notifications.length > 9 ? "9+" : notifications.length}</span>}</button>{notificationsOpen && <div className="notification-popover" role="region" aria-label="Notifications"><div className="notification-heading"><strong>Notifications</strong><small>Intro requests and recent signals</small></div>{notifications.length ? notifications.map((notification) => <button className="notification-item" key={notification.id} onClick={() => { onToggleNotifications(); notification.kind === "intro" && notification.interestId ? onOpenFounderRequest(notification.interestId) : onOpenDetails(notification.startupId); }}><span className={`notification-icon ${notification.kind}`}><Bell size={13} /></span><span><strong>{notification.title}</strong><small>{notification.body}</small><em>{notification.startupName} · {formatShortDate(notification.createdAt)}</em></span><ArrowUpRight size={13} /></button>) : <p className="notification-empty">No new activity yet.</p>}</div>}</div>}
        {currentUser && <div className="account-menu-wrap">
          <button className="user-chip" onClick={() => setAccountMenuOpen((open) => !open)} aria-label="Open account menu" aria-expanded={accountMenuOpen} aria-haspopup="menu">
            <span className={`user-avatar ${currentUser.role}`}>{currentUser.name.slice(0, 1).toUpperCase()}</span>
            <span className="user-copy"><span className="user-name">{currentUser.name}</span><span className="user-role">{roleLabels[currentUser.role]}</span></span>
            <ChevronDown className={accountMenuOpen ? "account-chevron is-open" : "account-chevron"} size={14} />
          </button>
          {accountMenuOpen && <div className="account-menu" role="menu">
            <div className="account-menu-heading"><span>Signed in as</span><strong>{currentUser.name}</strong><small>{roleLabels[currentUser.role]}</small></div>
            <div className="account-menu-rule" />
            <button role="menuitem" onClick={() => navigateFromAccount("saved")}>Saved launches <ArrowUpRight size={14} /></button>
            {isInvestor && <button role="menuitem" onClick={() => navigateFromAccount("profile")}>Investor profile <ArrowUpRight size={14} /></button>}
            {isFounder && <button role="menuitem" onClick={() => navigateFromAccount("dashboard")}>Founder workspace <ArrowUpRight size={14} /></button>}
            <div className="account-menu-rule" />
            <button role="menuitem" onClick={() => { setAccountMenuOpen(false); onOpenAccountSettings(); }}><UserRound size={14} /> Account settings <ArrowUpRight size={14} /></button>
            <button className="account-menu-signout" role="menuitem" onClick={() => { setAccountMenuOpen(false); onSignOut(); }}><LogOut size={14} /> Sign out</button>
          </div>}
        </div>}
      </div>
    </div>
  </header>;
}

function DiscoverPage({ role, isAuthenticated, onOpenDetails, onToast, onRequireAuth, onLaunch }: { role: UserRole; isAuthenticated: boolean; onOpenDetails: (id: string) => void; onToast: (message: string) => void; onRequireAuth: (mode?: AuthMode, role?: UserRole) => void; onLaunch: () => void }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [sortMode, setSortMode] = useState("Top signals");
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [visibleStartups, setVisibleStartups] = useState<Startup[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");
  const [aiQuery, setAiQuery] = useState("Find B2B startups with strong user momentum");
  const [aiState, setAiState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [aiStep, setAiStep] = useState(0);
  const [aiMatches, setAiMatches] = useState<AiMatch[]>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [aiProvider, setAiProvider] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadLaunches() {
      setDataLoading(true);
      setDataError("");
      try {
        const sort = sortMode === "Newest" ? "new" : "top";
        const response = await fetch(`/api/startups?q=${encodeURIComponent(query)}&category=${encodeURIComponent(activeCategory)}&sort=${sort}`, { cache: "no-store", signal: controller.signal });
        const payload = await parseJsonResponse<{ startups?: SignalStartup[]; viewer?: { votedIds?: string[]; savedIds?: string[] }; error?: string }>(response, "Launches");
        if (!response.ok) throw new Error(payload.error ?? "Launches could not be loaded.");
        setVisibleStartups((payload.startups ?? []).map(mapSignalStartupToUi));
        setVotedIds(payload.viewer?.votedIds ?? []);
        setSavedIds(payload.viewer?.savedIds ?? []);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setDataError(error instanceof Error ? error.message : "Launches could not be loaded.");
      } finally {
        setDataLoading(false);
      }
    }
    void loadLaunches();
    return () => controller.abort();
  }, [activeCategory, query, sortMode, isAuthenticated]);

  const launchLabel = activeCategory === "All" ? "Live launches" : activeCategory;
  const totalSignals = visibleStartups.reduce((total, startup) => total + startup.votes, 0);
  const pulseHeights = [34, 21, 43, 28, 57, 35, 68, 31, 49, 25, 61, 38].map((height, index) => Math.max(12, Math.min(100, height + Math.min(22, totalSignals * 2) + (visibleStartups.length ? (index % Math.max(1, visibleStartups.length)) * 2 : 0))));

  async function runAiMatch() {
    setAiState("loading");
    setAiStep(0);
    setAiError("");
    const stepTimer = window.setInterval(() => setAiStep((step) => Math.min(step + 1, aiSteps.length - 1)), 500);
    try {
      const response = await fetch("/api/ai/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: aiQuery }) });
      const payload = await parseJsonResponse<{ source?: string; model?: string; summary?: string; matches?: Array<{ startupId: string; matchScore: number; reasons: string[] }>; error?: string }>(response, "Signal matching");
      if (!response.ok) throw new Error(payload.error ?? "The matching route is unavailable.");
      const matches = await Promise.all((payload.matches ?? []).map(async (match) => {
        const knownStartup = visibleStartups.find((startup) => startup.id === match.startupId);
        if (knownStartup) return { ...match, startup: knownStartup };
        const startupResponse = await fetch(`/api/startups/${match.startupId}`);
        if (!startupResponse.ok) return match;
        const startupPayload = await parseJsonResponse<{ startup?: SignalStartup }>(startupResponse, "Startup details");
        return { ...match, startup: startupPayload.startup ? mapSignalStartupToUi(startupPayload.startup) : undefined };
      }));
      setAiSummary(payload.summary ?? `I found ${matches.length} close matches.`);
      setAiProvider(payload.source ?? "unknown");
      setAiModel(payload.model ?? "");
      setAiMatches(matches);
      setAiState("success");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "The signal match could not be completed.");
      setAiState("error");
    } finally {
      window.clearInterval(stepTimer);
    }
  }

  async function toggleVote(startup: Startup) {
    if (!isAuthenticated) { onRequireAuth("signin", "public"); return; }
    const isVoted = votedIds.includes(startup.id);
    setVotedIds((ids) => isVoted ? ids.filter((id) => id !== startup.id) : [...new Set([...ids, startup.id])]);
    try {
      const response = await fetch(`/api/startups/${startup.id}/vote`, { method: isVoted ? "DELETE" : "POST" });
      const payload = await parseJsonResponse<{ voted?: boolean; votes?: number; changed?: boolean; error?: string }>(response, "Signal update");
      if (!response.ok) throw new Error(payload.error ?? "Your signal could not be updated.");
      setVotedIds((ids) => payload.voted ? [...new Set([...ids, startup.id])] : ids.filter((id) => id !== startup.id));
      setVisibleStartups((launches) => launches.map((launch) => launch.id === startup.id ? { ...launch, votes: payload.votes ?? launch.votes } : launch));
      onToast(payload.changed === false ? (payload.voted ? `Signal already added to ${startup.name}` : `Signal was already removed from ${startup.name}`) : payload.voted ? `Signal added to ${startup.name}` : `Signal removed from ${startup.name}`);
    } catch (signalError) {
      setVotedIds((ids) => isVoted ? [...new Set([...ids, startup.id])] : ids.filter((id) => id !== startup.id));
      setVisibleStartups((launches) => launches.map((launch) => launch.id === startup.id ? { ...launch, votes: startup.votes } : launch));
      onToast(signalError instanceof Error ? signalError.message : "Your signal could not be updated.");
    }
  }

  async function toggleSave(startup: Startup) {
    if (!isAuthenticated) { onRequireAuth("signin", "public"); return; }
    const isSaved = savedIds.includes(startup.id);
    try {
      const response = await fetch(`/api/startups/${startup.id}/save`, { method: isSaved ? "DELETE" : "POST" });
      const payload = await parseJsonResponse<{ saved?: boolean; error?: string }>(response, "Saved startup");
      if (!response.ok) throw new Error(payload.error ?? "Saved startup could not be updated.");
      setSavedIds((ids) => payload.saved ? [...new Set([...ids, startup.id])] : ids.filter((id) => id !== startup.id));
      onToast(payload.saved ? "Saved for later" : "Removed from saved");
    } catch (saveError) {
      onToast(saveError instanceof Error ? saveError.message : "Saved startup could not be updated.");
    }
  }

  return <div className="screen discover-screen">
    {!isAuthenticated && <section className="discover-intro reveal">
      <div className="intro-copy"><p className="eyebrow"><span className="signal-dot" />The open startup index</p><h1>See what is <em>moving.</em></h1><p className="intro-description">A calmer way to find early products with real traction, useful feedback, and a reason to keep watching.</p><div className="intro-actions"><button className="primary-button" onClick={onLaunch}>List a startup <ArrowUpRight size={15} /></button><span className="index-note"><span className="live-indicator" />Live signals, updated as they move</span></div></div>
      <div className="pulse-card"><div className="pulse-card-head"><span>Live index</span><span className="pulse-period">Real-time data</span></div><div className="pulse-visual" aria-label={`${totalSignals} public signals`} role="img">{pulseHeights.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><div className="pulse-foot"><strong>{visibleStartups.length}</strong><span>launches in view</span><strong>{totalSignals}</strong><span>public signals</span></div></div>
    </section>}

    <section className={isAuthenticated ? "index-shell signed-index-shell reveal" : "index-shell reveal reveal-delay-1"}>
      <div className="section-lead"><div><p className="eyebrow">Browse the index</p><h2>{launchLabel}</h2></div><p className="section-support">Ranked by the people paying attention.</p></div>
      <div className="index-toolbar"><label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, category, or signal" aria-label="Search startups" />{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={14} /></button>}</label><label className="sort-box"><span>Sort</span><select value={sortMode} onChange={(event) => setSortMode(event.target.value)} aria-label="Sort startups"><option>Top signals</option><option>Newest</option></select><ChevronDown size={14} /></label></div>
      <div className="filter-strip" aria-label="Startup categories">{categories.map((category) => <button key={category} className={activeCategory === category ? "filter-chip active" : "filter-chip"} onClick={() => setActiveCategory(category)}>{category === "Trending" && <TrendingUp size={13} />}{category}</button>)}</div>
      <div className={role === "investor" ? "index-layout investor-layout" : "index-layout"}>
        <div className="launch-column">
          {dataError && <div className="inline-error"><strong>Launches are taking a moment.</strong><span>{dataError}</span><button onClick={() => setQuery((value) => value)}>Retry</button></div>}
          {dataLoading ? <div className="launch-list">{[1, 2, 3, 4].map((item) => <LaunchSkeleton key={item} />)}</div> : visibleStartups.length ? <div className="launch-list">{visibleStartups.map((startup, index) => <LaunchRow key={startup.id} startup={startup} rank={index + 1} hasVoted={votedIds.includes(startup.id)} isSaved={savedIds.includes(startup.id)} onVote={() => toggleVote(startup)} onSave={() => toggleSave(startup)} onOpen={() => onOpenDetails(startup.id)} onToast={onToast} />)}</div> : <EmptyState title="Nothing is live here yet" body={query || activeCategory !== "All" ? "Try another search or clear the current filter." : "The public index is empty until a founder publishes a startup."} actionLabel={query || activeCategory !== "All" ? "Clear filters" : "List a startup"} onAction={query || activeCategory !== "All" ? () => { setQuery(""); setActiveCategory("All"); } : onLaunch} />}
        </div>
        {role === "investor" ? <InvestorLens aiQuery={aiQuery} setAiQuery={setAiQuery} aiState={aiState} aiStep={aiStep} aiMatches={aiMatches} aiSummary={aiSummary} aiProvider={aiProvider} aiModel={aiModel} aiError={aiError} runAiMatch={runAiMatch} onOpenDetails={onOpenDetails} /> : <PublicAside isAuthenticated={isAuthenticated} onLaunch={onLaunch} />}
      </div>
    </section>
  </div>;
}

function LaunchRow({ startup, rank, hasVoted, isSaved, onVote, onSave, onOpen, onToast, showSignal = true }: { startup: Startup; rank: number; hasVoted: boolean; isSaved: boolean; onVote: () => void; onSave: () => void; onOpen: () => void; onToast: (message: string) => void; showSignal?: boolean }) {
  return <article className={`launch-row ${rank <= 3 ? "ranked-launch" : ""}`}>
    <span className={rank <= 3 ? `rank-cell top-rank top-rank-${rank}` : "rank-cell"}>{String(rank).padStart(2, "0")}</span>
    <button className="startup-mark" style={startup.logoUrl ? undefined : { background: startup.accent }} onClick={onOpen} aria-label={`Open ${startup.name}`}>{startup.logoUrl ? <img src={startup.logoUrl} alt="" /> : startup.logoLetter}</button>
    <div className="launch-copy"><div className="launch-name-line"><button className="launch-name" onClick={onOpen}>{startup.name}</button><span className="category-label">{startup.category}</span>{startup.trending && <span className="trending-label"><TrendingUp size={12} />Trending</span>}</div><p className="launch-slogan">{startup.slogan}</p><p className="launch-description">{startup.shortDescription}</p><div className="tag-row">{startup.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div></div>
    <div className="launch-stats"><div><strong>{startup.votes}</strong><span>signals</span></div><div><strong>{startup.interests}</strong><span>watching</span></div></div>
    <div className="launch-actions">{showSignal && <button className={hasVoted ? "icon-action signal-icon active" : "icon-action signal-icon"} onClick={onVote} aria-label={hasVoted ? "Remove signal" : "Add signal"}><Triangle size={15} fill={hasVoted ? "currentColor" : "none"} /></button>}<button className={isSaved ? "icon-action active" : "icon-action"} onClick={onSave} aria-label={isSaved ? "Remove saved startup" : "Save startup"}><Bookmark size={16} fill={isSaved ? "currentColor" : "none"} /></button><ShareAction startup={startup} onToast={onToast} /></div>
  </article>;
}

function ShareAction({ startup, onToast }: { startup: Startup; onToast: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const shareUrl = typeof window === "undefined" ? startup.website : `${window.location.origin}/?startup=${encodeURIComponent(startup.id)}`;
  async function copyLink() {
    await navigator.clipboard?.writeText(shareUrl);
    setOpen(false);
    onToast("Link copied");
  }
  return <div className="share-action"><button className="icon-action" onClick={() => setOpen((value) => !value)} aria-label={`Share ${startup.name}`}><Share2 size={16} /></button>{open && <div className="share-popover"><span>Share this launch</span><a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">LinkedIn <ArrowUpRight size={13} /></a><a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">Facebook <ArrowUpRight size={13} /></a><a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(startup.name + " — " + startup.slogan)}`} target="_blank" rel="noreferrer">X / Twitter <ArrowUpRight size={13} /></a><button onClick={copyLink}>Copy link <Copy size={13} /></button></div>}</div>;
}

function PublicAside({ isAuthenticated, onLaunch }: { isAuthenticated: boolean; onLaunch: () => void }) {
  return <aside className="public-aside"><div className="aside-heading"><span className="aside-icon"><Target size={16} /></span><div><p className="eyebrow">How it works</p><h3>Signals, not noise.</h3></div></div><p className="aside-intro">Every launch gets clearer when people can see what is actually happening around it.</p><div className="signal-explainer"><div><span>01</span><div><strong>People notice</strong><p>Public votes show what catches attention.</p></div></div><div><span>02</span><div><strong>Founders listen</strong><p>Feedback turns a launch into a conversation.</p></div></div><div><span>03</span><div><strong>Momentum surfaces</strong><p>Recent activity gives the index a pulse.</p></div></div></div><div className="aside-rule" /><div className="aside-cta"><strong>{isAuthenticated ? "Have something worth watching?" : "Building something people should see?"}</strong><button onClick={onLaunch}>List your startup <ArrowUpRight size={14} /></button></div></aside>;
}

function InvestorLens({ aiQuery, setAiQuery, aiState, aiStep, aiMatches, aiSummary, aiProvider, aiModel, aiError, runAiMatch, onOpenDetails }: { aiQuery: string; setAiQuery: (value: string) => void; aiState: "idle" | "loading" | "success" | "error"; aiStep: number; aiMatches: AiMatch[]; aiSummary: string; aiProvider: string; aiModel: string; aiError: string; runAiMatch: () => void; onOpenDetails: (id: string) => void }) {
  return <aside className="investor-lens"><div className="lens-heading"><div><p className="eyebrow">Investor lens</p><h3>Find a closer fit.</h3></div><span className="lens-badge"><ScanSearch size={12} />{aiState === "success" ? "Gemini" : "Live"}</span></div><p className="lens-intro">Describe the kind of company you want to understand. SIGNAL will rank the closest live launches.</p><textarea value={aiQuery} onChange={(event) => setAiQuery(event.target.value)} aria-label="Describe what you are looking for" placeholder="Stage, category, momentum…" /><button className="lens-submit" onClick={runAiMatch} disabled={aiState === "loading"}>Run matching <ArrowUpRight size={14} /></button>{aiState === "idle" && <div className="lens-empty"><div className="lens-bars"><i /><i /><i /><i /></div><span>Match by stage, category, and momentum.</span></div>}{aiState === "loading" && <div className="lens-steps">{aiSteps.map((step, index) => <div className={index <= aiStep ? "lens-step active" : "lens-step"} key={step}><span>{index < aiStep ? <Check size={12} /> : index === aiStep ? <LoaderCircle className="spin" size={12} /> : index + 1}</span><p>{step}</p></div>)}</div>}{aiState === "success" && <div className="lens-results"><div className="result-summary"><div className="result-summary-top"><span>{aiMatches.length} matches</span><small><Sparkles size={11} /> {aiProvider} · {aiModel}</small></div><p>{aiSummary}</p></div>{aiMatches.length ? aiMatches.map((match) => match.startup && <button className="match-row" key={match.startupId} onClick={() => onOpenDetails(match.startupId)}><span className="match-score">{match.matchScore}</span><span><strong>{match.startup.name}</strong><small>{match.startup.category} · {match.reasons[0]}</small></span><ArrowUpRight size={14} /></button>) : <EmptyState title="No close matches" body="Try a wider category or stage." />}</div>}{aiState === "error" && <div className="lens-error"><strong>Couldn&apos;t finish the match.</strong><p>{aiError}</p><button onClick={runAiMatch}>Try again <ArrowUpRight size={13} /></button></div>}<p className="lens-footnote"><Sparkles size={13} />A research tool, not investment advice.</p></aside>;
}

function DetailsPage({ startup: initialStartup, role, currentUserId, currentUserName, isAuthenticated, onBack, onToast, onOpenDetails, onRequireAuth }: { startup: Startup; role: UserRole; currentUserId: string; currentUserName: string; isAuthenticated: boolean; onBack: () => void; onToast: (message: string) => void; onOpenDetails: (id: string) => void; onRequireAuth: (mode?: AuthMode, role?: UserRole) => void }) {
  const [startup, setStartup] = useState(initialStartup);
  const [voted, setVoted] = useState(false);
  const [saved, setSaved] = useState(false);
  const [interestSent, setInterestSent] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [relatedStartups, setRelatedStartups] = useState<Startup[]>([]);
  const [comment, setComment] = useState("");
  const [introMessage, setIntroMessage] = useState("");
  const [introComposerOpen, setIntroComposerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadStartupDetails() {
      setStartup((current) => current.id === initialStartup.id ? current : createEmptyStartup(initialStartup.id)); setComments([]); setRelatedStartups([]); setError(""); setLoading(true);
      try {
        const response = await fetch(`/api/startups/${initialStartup.id}`, { signal: controller.signal });
        const payload = await parseJsonResponse<{ startup?: SignalStartup; comments?: Comment[]; viewer?: { voted: boolean; saved: boolean; interested: boolean }; error?: string }>(response, "Startup details");
        if (!response.ok || !payload.startup) throw new Error(payload.error ?? "Startup details could not be loaded.");
        setStartup(mapSignalStartupToUi(payload.startup)); setComments(payload.comments ?? []); setVoted(payload.viewer?.voted ?? false); setSaved(payload.viewer?.saved ?? false); setInterestSent(payload.viewer?.interested ?? false);
        const relatedResponse = await fetch(`/api/startups?category=${encodeURIComponent(payload.startup.category)}&sort=top`, { signal: controller.signal });
        if (relatedResponse.ok) {
          const relatedPayload = await parseJsonResponse<{ startups?: SignalStartup[] }>(relatedResponse, "Related launches");
          setRelatedStartups((relatedPayload.startups ?? []).map(mapSignalStartupToUi).filter((launch) => launch.id !== payload.startup?.id).slice(0, 3));
        }
        if (isAuthenticated) void fetch(`/api/startups/${initialStartup.id}/view`, { method: "POST" });
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Startup details could not be loaded.");
      } finally { setLoading(false); }
    }
    void loadStartupDetails();
    return () => controller.abort();
  }, [initialStartup.id, isAuthenticated]);

  async function updateVote() {
    if (!isAuthenticated) { onRequireAuth("signin", "public"); return; }
    await updateStartupAction(`/api/startups/${startup.id}/vote`, voted ? "DELETE" : "POST", "Signal update", (payload) => { setVoted(Boolean(payload.voted)); setStartup((current) => ({ ...current, votes: Number(payload.votes ?? current.votes) })); }, voted ? `Signal removed from ${startup.name}` : `Signal added to ${startup.name}`);
  }

  async function updateSave() {
    if (!isAuthenticated) { onRequireAuth("signin", "public"); return; }
    await updateStartupAction(`/api/startups/${startup.id}/save`, saved ? "DELETE" : "POST", "Saved startup", (payload) => setSaved(Boolean(payload.saved)), saved ? "Removed from saved" : "Saved for later");
  }

  async function updateStartupAction(url: string, method: "POST" | "DELETE", requestName: string, applyResult: (payload: Record<string, unknown>) => void, successMessage: string) {
    setMutating(true);
    try {
      const response = await fetch(url, { method });
      const payload = await parseJsonResponse<Record<string, unknown>>(response, requestName);
      if (!response.ok) throw new Error(String(payload.error ?? "The update could not be saved."));
      applyResult(payload); onToast(successMessage);
    } catch (actionError) { onToast(actionError instanceof Error ? actionError.message : "The update could not be saved."); }
    finally { setMutating(false); }
  }

  async function sendIntroRequest() {
    if (!isAuthenticated) { onRequireAuth("signup", "investor"); return; }
    setMutating(true);
    try {
      const response = await fetch(`/api/startups/${startup.id}/interest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: introMessage }) });
      const payload = await parseJsonResponse<{ error?: string }>(response, "Intro request");
      if (!response.ok) throw new Error(payload.error ?? "The intro request could not be sent.");
      setInterestSent(true); setIntroComposerOpen(false); setIntroMessage(""); onToast("Intro request sent to the founder");
    } catch (introError) { onToast(introError instanceof Error ? introError.message : "The intro request could not be sent."); }
    finally { setMutating(false); }
  }

  async function withdrawInterest() {
    await updateStartupAction(`/api/startups/${startup.id}/interest`, "DELETE", "Intro request", () => setInterestSent(false), "Intro request withdrawn");
  }

  async function addComment() {
    if (!isAuthenticated) { onRequireAuth("signin", "public"); return; }
    const content = comment.trim(); if (!content) return;
    setMutating(true);
    try {
      const response = await fetch(`/api/startups/${startup.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
      const payload = await parseJsonResponse<{ comment?: Comment; error?: string }>(response, "Feedback");
      if (!response.ok || !payload.comment) throw new Error(payload.error ?? "Feedback could not be saved.");
      setComments((current) => [payload.comment!, ...current]); setComment(""); setStartup((current) => ({ ...current, feedback: (current.feedback ?? 0) + 1 })); onToast("Feedback added");
    } catch (commentError) { onToast(commentError instanceof Error ? commentError.message : "Feedback could not be saved."); }
    finally { setMutating(false); }
  }

  async function deleteComment(commentId: string) {
    if (!window.confirm("Delete this feedback permanently?")) return;
    setDeletingCommentId(commentId);
    try {
      const response = await fetch(`/api/startups/${startup.id}/comments/${commentId}`, { method: "DELETE" });
      const payload = await parseJsonResponse<{ error?: string }>(response, "Delete feedback");
      if (!response.ok) throw new Error(payload.error ?? "Feedback could not be deleted.");
      setComments((current) => current.filter((entry) => entry.id !== commentId)); setStartup((current) => ({ ...current, feedback: Math.max(0, (current.feedback ?? 0) - 1) })); onToast("Feedback deleted");
    } catch (deleteError) { onToast(deleteError instanceof Error ? deleteError.message : "Feedback could not be deleted."); }
    finally { setDeletingCommentId(""); }
  }

  return <div className="screen detail-screen"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back to discover</button>{error && <div className="inline-error"><strong>Couldn&apos;t load this launch.</strong><span>{error}</span><button onClick={onBack}>Back to index</button></div>}<section className="profile-hero reveal"><div className="profile-identity"><div className="profile-logo" style={startup.logoUrl ? undefined : { background: startup.accent }}>{startup.logoUrl ? <img src={startup.logoUrl} alt={`${startup.name} logo`} width={88} height={88} /> : startup.logoLetter}</div><div><div className="profile-meta"><span className="live-indicator" />Live launch <i /> {startup.category}</div><h1>{startup.name}</h1><p>{startup.slogan}</p>{startup.tags.length > 0 && <div className="tag-row profile-tags">{startup.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}</div></div><div className="profile-position"><span>Public index</span><strong>Live</strong><small>read by the SIGNAL community</small></div></section><div className="detail-actions reveal reveal-delay-1"><button className={voted ? "primary-button active" : "primary-button"} onClick={updateVote} disabled={mutating}><ArrowUpRight size={15} />{voted ? "Signal added" : "Add your signal"}</button><ShareAction startup={startup} onToast={onToast} /><button className={saved ? "secondary-button active" : "secondary-button"} onClick={updateSave} disabled={mutating}><Bookmark size={15} fill={saved ? "currentColor" : "none"} />{saved ? "Saved" : "Save"}</button>{role === "investor" && <button className={interestSent ? "secondary-button active" : "secondary-button"} onClick={() => interestSent ? void withdrawInterest() : setIntroComposerOpen(true)} disabled={mutating}><Link2 size={15} />{interestSent ? "Withdraw intro request" : "Request intro"}</button>}{startup.website ? <a className="website-button" href={startup.website} target="_blank" rel="noreferrer">Visit website <ExternalLink size={14} /></a> : <span className="website-unavailable">No website added</span>}</div>{role === "investor" && introComposerOpen && <section className="intro-request-card"><div><p className="eyebrow">Request an introduction</p><h2>Give the founder useful context.</h2><p>Your request will appear in the founder&apos;s workspace.</p></div><textarea value={introMessage} onChange={(event) => setIntroMessage(event.target.value)} maxLength={500} name="intro-message" autoComplete="off" placeholder="Why do you want to speak with this startup?" aria-label="Introduction request message" /><div><span>{introMessage.length}/500</span><button className="secondary-button" onClick={() => setIntroComposerOpen(false)}>Cancel</button><button className="primary-button" onClick={sendIntroRequest} disabled={mutating}>Send request <Send size={14} /></button></div></section>}<div className="detail-layout"><main className="detail-main"><article className="story-card reveal reveal-delay-2"><div className="card-label"><Quote size={15} />The story</div><h2>{startup.shortDescription}</h2><p>{startup.longDescription}</p></article><section className="feedback-card reveal reveal-delay-3"><div className="section-lead compact"><div><p className="eyebrow">Community feedback</p><h2>What people are saying</h2></div><span className="count-badge"><MessageCircle size={14} />{comments.length}</span></div><div className="comment-compose"><div className="comment-avatar">{currentUserName.slice(0, 1).toUpperCase() || "Y"}</div><div className="comment-editor"><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} name="feedback" autoComplete="off" placeholder="Add a useful observation…" aria-label="Leave feedback" /><div><span>{role === "investor" ? "Your note will appear as an investor signal." : "Keep it specific and useful."}</span><button className="text-action" onClick={addComment} disabled={mutating || !comment.trim()}>Post feedback <Send size={14} /></button></div></div></div><div className="comment-list">{comments.length ? comments.map((entry) => <CommentItem comment={entry} currentUserId={currentUserId} deleting={deletingCommentId === entry.id} onDelete={deleteComment} key={entry.id} />) : <EmptyState title="No feedback yet" body="Be the first person to add a useful signal." />}</div></section></main><aside className="detail-side"><SignalBoard startup={startup} loading={loading} /><div className="related-card"><div className="card-heading"><h3>Keep exploring</h3><button onClick={onBack}>View all <ArrowUpRight size={13} /></button></div>{relatedStartups.length ? relatedStartups.map((related) => <button className="related-row" key={related.id} onClick={() => onOpenDetails(related.id)}><span className="related-logo" style={related.logoUrl ? undefined : { background: related.accent }}>{related.logoUrl ? <img src={related.logoUrl} alt="" width={32} height={32} /> : related.logoLetter}</span><span><strong>{related.name}</strong><small>{related.category} · {related.votes} signals</small></span><ArrowUpRight size={14} /></button>) : <EmptyState title="Nothing else is live" body="New published startups will appear here as the index grows." />}</div></aside></div></div>;
}

function SignalBoard({ startup, loading }: { startup: Startup; loading: boolean }) {
  const score = startup.signalScore ?? Math.round(startup.votes / 5);
  return <section className="signal-board"><div className="board-heading"><div><p className="eyebrow">Signal readout</p><h3>Why it is moving</h3></div><span className="board-live"><span className="live-indicator" />Live</span></div>{loading ? <div className="board-skeleton" /> : <><div className="score-line"><strong>{score}</strong><span>/100<br />signal score</span></div><div className="score-track"><span style={{ width: `${Math.min(100, score)}%` }} /></div><p className="board-description">A transparent read of attention, conversation, and investor interest around this launch.</p><div className="metric-list"><div><span>Public signals</span><strong>{startup.votes}</strong></div><div><span>Investor interest</span><strong>{startup.interests}</strong></div><div><span>Feedback notes</span><strong>{startup.feedback ?? 0}</strong></div><div><span>Signed-in views</span><strong>{startup.views ?? 0}</strong></div></div></>}</section>;
}

function CommentItem({ comment, currentUserId, deleting, onDelete }: { comment: Comment; currentUserId: string; deleting: boolean; onDelete: (commentId: string) => void }) {
  return <article className="comment-item"><div className={`comment-avatar ${comment.role}`}>{comment.author.slice(0, 1)}</div><div className="comment-body"><div className="comment-meta"><strong>{comment.author}</strong><span className={`role-tag ${comment.role}`}>{comment.role}</span><time>{comment.date}</time></div><p>{comment.content}</p></div>{comment.userId === currentUserId && <button className="comment-delete" onClick={() => onDelete(comment.id)} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</button>}</article>;
}

function FounderStudioPage({ initialRequestId, onBack, onToast, onRequireAuth }: { initialRequestId: string; onBack: () => void; onToast: (message: string) => void; onRequireAuth: () => void }) {
  const [startupId, setStartupId] = useState("");
  const [status, setStatus] = useState<"draft" | "launched">("draft");
  const [studioView, setStudioView] = useState<"edit" | "insights">(initialRequestId ? "insights" : "edit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [form, setForm] = useState<FounderForm>({ name: "", slogan: "", category: "SaaS", website: "", description: "", longDescription: "" });
  const [logoPreview, setLogoPreview] = useState("");
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [metrics, setMetrics] = useState({ votes: 0, interests: 0, feedback: 0, views: 0, score: 0 });
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [investors, setInvestors] = useState<Array<{ id: string; name: string; bio: string; website: string; email: string; message: string; date: string; initials: string; contactedAt: string | null }>>([]);

  useEffect(() => {
    async function loadFounderStudio() {
      try {
        const response = await fetch("/api/founder/startup", { cache: "no-store" });
        if (response.status === 401 || response.status === 403) { setAccessBlocked(true); return; }
        const payload = await parseJsonResponse<{ startup?: Record<string, unknown> | null; interests?: Array<Record<string, unknown>>; error?: string }>(response, "Founder Studio");
        if (!response.ok) throw new Error(payload.error ?? "Founder studio could not be loaded.");
        if (payload.startup) {
          const startup = payload.startup;
          setStartupId(String(startup.id));
          setStatus(startup.status === "launched" ? "launched" : "draft");
          setForm({ name: String(startup.name ?? ""), slogan: String(startup.slogan ?? ""), category: String(startup.category ?? "SaaS"), website: String(startup.website_url ?? ""), description: String(startup.short_description ?? ""), longDescription: String(startup.long_description ?? "") });
          setLogoPreview(String(startup.logo_url ?? ""));
          const votes = Number(startup.votes_count ?? 0); const interests = Number(startup.investor_interest_count ?? 0); const feedback = Number(startup.feedback_count ?? 0); const views = Number(startup.view_count ?? 0);
          setMetrics({ votes, interests, feedback, views, score: Number(startup.signal_score ?? calculateSignalScore(votes, interests, feedback, views)) });
        }
        setInvestors((payload.interests ?? []).map((interest) => { const profileRows = interest.profiles as Record<string, unknown>[] | Record<string, unknown> | undefined; const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows; const name = String(profile?.full_name ?? "SIGNAL investor"); return { id: String(interest.id), name, bio: String(profile?.bio ?? "Investor profile"), website: String(profile?.website ?? ""), email: String(interest.contact_email ?? ""), message: String(interest.message ?? ""), date: formatShortDate(String(interest.created_at ?? "")), initials: name.slice(0, 2).toUpperCase(), contactedAt: typeof interest.contacted_at === "string" ? interest.contacted_at : null }; }));
        if (initialRequestId) setSelectedRequestId(initialRequestId);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Founder studio could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    void loadFounderStudio();
  }, [initialRequestId]);

  function changeField(field: keyof FounderForm, value: string) { setForm((current) => ({ ...current, [field]: value })); }

  async function markIntroContacted(interestId: string) {
    try {
      const response = await fetch(`/api/founder/startup/interests/${interestId}`, { method: "PATCH" });
      const payload = await parseJsonResponse<{ contactedAt?: string; error?: string }>(response, "Intro request");
      if (!response.ok || !payload.contactedAt) throw new Error(payload.error ?? "The intro request could not be updated.");
      setInvestors((current) => current.map((investor) => investor.id === interestId ? { ...investor, contactedAt: payload.contactedAt! } : investor));
      onToast("Intro request marked as contacted");
    } catch (contactError) {
      const message = contactError instanceof Error ? contactError.message : "The intro request could not be updated.";
      setError(message);
      onToast(message);
    }
  }

  async function saveStartup(nextStatus = status, logoFile: File | null = pendingLogo) {
    setSaving(true);
    setError("");
    const publishAfterLogoUpload = Boolean(logoFile && nextStatus === "launched" && !startupId);
    const saveStatus = publishAfterLogoUpload ? "draft" : nextStatus;
    try {
      const response = await fetch("/api/founder/startup", { method: startupId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: startupId || undefined, name: form.name, slogan: form.slogan, short_description: form.description, long_description: form.longDescription, website_url: form.website, category: form.category, status: saveStatus }) });
      const payload = await parseJsonResponse<{ startup?: Record<string, unknown>; error?: string }>(response, "Startup changes");
      if (!response.ok || !payload.startup) { setError(payload.error ?? "Startup changes could not be saved."); return; }
      const savedStartupId = String(payload.startup.id);
      setStartupId(savedStartupId);
      setStatus(saveStatus);
      if (!logoFile) setLogoPreview(String(payload.startup.logo_url ?? ""));
      if (logoFile) {
        try {
          await persistLogo(logoFile, savedStartupId, saveStatus);
        } catch (logoError) {
          setError(logoError instanceof Error ? logoError.message : "The startup was saved, but the logo could not be uploaded.");
          return;
        }
      }
      if (publishAfterLogoUpload) {
        const publishResponse = await fetch("/api/founder/startup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: savedStartupId, status: "launched" }) });
        const publishPayload = await parseJsonResponse<{ startup?: Record<string, unknown>; error?: string }>(publishResponse, "Startup publish");
        if (!publishResponse.ok || !publishPayload.startup) throw new Error(publishPayload.error ?? "The draft was saved, but it could not be published.");
        setStatus("launched");
      }
      onToast(nextStatus === "launched" ? "Startup is live" : nextStatus === "draft" && status === "launched" ? "Startup returned to draft" : "Changes saved");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Startup changes could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function selectLogo(file: File) {
    try {
      validateLogoFile(file);
      const localPreview = URL.createObjectURL(file);
      setLogoPreview(localPreview);
      if (!startupId) {
        setPendingLogo(file);
        return;
      }
      await persistLogo(file, startupId, status);
    } catch (logoError) {
      setError(logoError instanceof Error ? logoError.message : "The logo could not be uploaded.");
    }
  }

  async function persistLogo(file: File, targetStartupId: string, targetStatus: "draft" | "launched") {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) throw new Error("Supabase storage is not configured.");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Sign in again before uploading a logo.");
    const extension = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${userData.user.id}/${targetStartupId}/logo.${extension}`;
    const { error: uploadError } = await supabase.storage.from("startup-logos").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) throw new Error(uploadError.message);
    const { data: publicUrl } = supabase.storage.from("startup-logos").getPublicUrl(path);
    const logoUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;
    const response = await fetch("/api/founder/startup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: targetStartupId, logo_url: logoUrl, name: form.name, slogan: form.slogan, short_description: form.description, long_description: form.longDescription, website_url: form.website, category: form.category, status: targetStatus }) });
    const payload = await parseJsonResponse<{ startup?: Record<string, unknown>; error?: string }>(response, "Logo save");
    if (!response.ok || !payload.startup) throw new Error(payload.error ?? "The logo uploaded but could not be attached to the startup.");
    setLogoPreview(logoUrl);
    setPendingLogo(null);
    onToast("Logo uploaded");
  }

  function validateLogoFile(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) throw new Error("Use a PNG or JPG logo.");
    if (file.size > 5 * 1024 * 1024) throw new Error("The logo must be smaller than 5 MB.");
  }

  if (accessBlocked) return <div className="screen access-screen"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back to discover</button><div className="access-card"><span className="access-mark"><Users size={20} /></span><p className="eyebrow">Founder workspace</p><h1>A private place to shape your launch.</h1><p>Sign in or create a founder profile to edit your startup, launch it publicly, and review investor interest.</p><button className="primary-button" onClick={onRequireAuth}>Continue as a founder <ArrowUpRight size={15} /></button></div></div>;
  if (loading) return <div className="screen workspace-screen"><div className="workspace-loading"><div /><div /></div></div>;
  if (!startupId) return <FounderCreateFlow form={form} step={1} pendingLogo={pendingLogo} logoPreview={logoPreview} saving={saving} error={error} onBack={onBack} onChangeField={changeField} onSelectLogo={selectLogo} onSaveDraft={() => void saveStartup("draft")} onPublish={() => void saveStartup("launched")} onDismissError={() => setError("")} />;
  const previewStartup = createFounderPreview(startupId, form, status, logoPreview, metrics);
  return studioView === "insights" && status === "launched" ? <FounderInsightsPage status={status} metrics={metrics} investors={investors} selectedRequestId={selectedRequestId} onSelectRequest={setSelectedRequestId} onCloseRequest={() => setSelectedRequestId("")} onBack={onBack} onEdit={() => setStudioView("edit")} onMarkContacted={markIntroContacted} /> : <FounderEditWorkspace form={form} startup={previewStartup} status={status} pendingLogo={pendingLogo} logoPreview={logoPreview} saving={saving} error={error} onBack={onBack} onChangeField={changeField} onSelectLogo={selectLogo} onSave={() => void saveStartup()} onPublish={() => void saveStartup(status === "launched" ? "draft" : "launched")} onInsights={() => setStudioView("insights")} onDismissError={() => setError("")} />;
}

function formatShortDate(isoDate: string) {
  const parsedDate = new Date(isoDate);
  return Number.isNaN(parsedDate.getTime()) ? "Recently" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(parsedDate);
}

function createFounderPreview(startupId: string, form: FounderForm, status: "draft" | "launched", logoPreview: string, metrics: { votes: number; interests: number; feedback: number; views: number; score: number }): Startup {
  return { id: startupId, name: form.name || "Your startup", slogan: form.slogan || "Your one-line promise.", shortDescription: form.description || "A clear explanation of what makes your startup matter.", longDescription: form.longDescription, category: form.category, stage: "", geography: "", website: form.website, accent: "#f4f4f7", logoLetter: form.name.slice(0, 1).toUpperCase() || "S", votes: metrics.votes, interests: metrics.interests, feedback: metrics.feedback, views: metrics.views, signalScore: metrics.score, engagement: "0%", tags: form.category ? [form.category.toLowerCase()] : [], status, logoUrl: logoPreview || null };
}

function FounderCreateFlow({ form, step: initialStep, pendingLogo, logoPreview, saving, error, onBack, onChangeField, onSelectLogo, onSaveDraft, onPublish, onDismissError }: { form: FounderForm; step: number; pendingLogo: File | null; logoPreview: string; saving: boolean; error: string; onBack: () => void; onChangeField: (field: keyof FounderForm, value: string) => void; onSelectLogo: (file: File) => void; onSaveDraft: () => void; onPublish: () => void; onDismissError: () => void }) {
  const [step, setStep] = useState(initialStep);
  const preview = createFounderPreview("preview", form, "draft", logoPreview, { votes: 0, interests: 0, feedback: 0, views: 0, score: 0 });
  const basicsReady = Boolean(form.name.trim() && form.category.trim());
  const storyReady = Boolean(form.slogan.trim() && form.description.trim());
  return <div className="screen workspace-screen create-flow-screen"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back to discover</button><div className="create-flow-header"><div><p className="eyebrow">Create startup</p><h1>Put the right signal in the room.</h1><p>Build a private profile in three short steps. Nothing reaches Discover until you publish.</p></div><span className="status-pill new"><i />Private until published</span></div>{error && <div className="inline-error"><strong>Something needs your attention.</strong><span>{error}</span><button onClick={onDismissError}>Dismiss</button></div>}<div className="create-flow-layout"><aside className="create-stepper"><p className="eyebrow">Your setup</p>{[[1, "Basics", "Name and category"], [2, "Story", "Promise and context"], [3, "Brand", "Logo and preview"]].map(([number, title, description]) => <button key={number} className={step === number ? "create-step active" : step > Number(number) ? "create-step complete" : "create-step"} onClick={() => Number(number) < step && setStep(Number(number))}><span>{step > Number(number) ? <Check size={14} /> : number}</span><strong>{title}</strong><small>{description}</small></button>)}</aside><main className="create-form-card"><div className="create-form-heading"><span>0{step} / 03</span><h2>{step === 1 ? "Start with the shape." : step === 2 ? "Make the story clear." : "Give it a recognizable mark."}</h2></div>{step === 1 && <div className="create-step-fields"><label className="field"><span>Startup name</span><input value={form.name} onChange={(event) => onChangeField("name", event.target.value)} placeholder="NexaFlow" autoFocus /></label><label className="field"><span>Category</span><select value={form.category} onChange={(event) => onChangeField("category", event.target.value)}>{categories.slice(3).map((category) => <option key={category}>{category}</option>)}</select></label><div className="field-help"><strong>Keep the first signal simple.</strong><span>People should understand what they are looking at before they decide to watch.</span></div></div>}{step === 2 && <div className="create-step-fields"><label className="field"><span>One-line promise</span><input value={form.slogan} onChange={(event) => onChangeField("slogan", event.target.value)} placeholder="What should people remember?" autoFocus /></label><label className="field"><span>Short description</span><textarea value={form.description} onChange={(event) => onChangeField("description", event.target.value)} placeholder="What are you building, and who is it for?" /></label><label className="field"><span>Full story <small>Optional</small></span><textarea className="tall" value={form.longDescription} onChange={(event) => onChangeField("longDescription", event.target.value)} placeholder="Why now? What makes your approach different?" /></label><label className="field"><span>Website <small>Optional</small></span><input value={form.website} onChange={(event) => onChangeField("website", event.target.value)} placeholder="https://yourstartup.com" /></label></div>}{step === 3 && <div className="create-brand-step"><FounderLogoPicker logoPreview={logoPreview} pendingLogo={pendingLogo} onSelectLogo={onSelectLogo} /><StartupPreviewCard startup={preview} label="Private draft preview" /></div>}<div className="create-form-actions"><button className="secondary-button" onClick={() => step === 1 ? onBack() : setStep((current) => current - 1)}>{step === 1 ? "Cancel" : "Back"}</button>{step < 3 ? <button className="primary-button" onClick={() => setStep((current) => current + 1)} disabled={step === 1 ? !basicsReady : !storyReady}>Continue <ArrowUpRight size={15} /></button> : <><button className="secondary-button action-grow" onClick={onSaveDraft} disabled={saving}>{saving ? "Saving…" : "Save private draft"}</button><button className="primary-button action-grow" onClick={onPublish} disabled={saving || !basicsReady || !storyReady}>{saving ? "Publishing…" : "Publish startup"} <ArrowUpRight size={15} /></button></>}</div></main></div></div>;
}

function FounderEditWorkspace({ form, startup, status, pendingLogo, logoPreview, saving, error, onBack, onChangeField, onSelectLogo, onSave, onPublish, onInsights, onDismissError }: { form: FounderForm; startup: Startup; status: "draft" | "launched"; pendingLogo: File | null; logoPreview: string; saving: boolean; error: string; onBack: () => void; onChangeField: (field: keyof FounderForm, value: string) => void; onSelectLogo: (file: File) => void; onSave: () => void; onPublish: () => void; onInsights: () => void; onDismissError: () => void }) {
  return <div className="screen workspace-screen edit-flow-screen"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back to discover</button><div className="workspace-head edit-workspace-head"><div><p className="eyebrow">Founder workspace</p><h1>Edit your launch.</h1><p>{status === "launched" ? "Keep the public story sharp. Performance and investor activity live in Signal health." : "Build privately first. Signal health opens after you publish."}</p></div><div className="studio-nav"><button className="studio-tab active">Edit startup</button>{status === "launched" && <button className="studio-tab" onClick={onInsights}>Signal health <TrendingUp size={14} /></button>}</div></div>{error && <div className="inline-error"><strong>Something needs your attention.</strong><span>{error}</span><button onClick={onDismissError}>Dismiss</button></div>}<div className="edit-workspace-layout"><main className="edit-main-column"><section className="workspace-card edit-editor-card"><div className="card-heading"><div><p className="eyebrow">Private editor</p><h2>Startup profile</h2></div><StatusPill status={status} /></div><FounderLogoPicker logoPreview={logoPreview} pendingLogo={pendingLogo} onSelectLogo={onSelectLogo} /><FounderFormFields form={form} onChangeField={onChangeField} /></section><section className="workspace-card startup-preview-panel"><div className="card-heading"><div><p className="eyebrow">Preview</p><h2>What people will see</h2></div><span className={status === "launched" ? "preview-live" : "preview-private"}>{status === "launched" ? "Live" : "Private"}</span></div><StartupPreviewCard startup={startup} label={status === "launched" ? "Published card" : "Private draft preview"} /></section></main><aside className="edit-action-rail"><div className="workspace-card action-card"><p className="eyebrow">Next action</p><h2>{status === "launched" ? "Keep the signal current." : "Ready to go public?"}</h2><p>{status === "launched" ? "Save any edits, or return this launch to a private draft." : "Publish when the preview says exactly what you mean."}</p><div className="action-stack"><button className="primary-button action-full" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save changes"} <Check size={15} /></button><button className="secondary-button action-full" onClick={onPublish} disabled={saving}>{status === "launched" ? "Return to draft" : "Publish startup"} <ArrowUpRight size={15} /></button>{status === "launched" && <button className="quiet-link" onClick={onInsights}>Open Signal health <ArrowUpRight size={14} /></button>}</div></div></aside></div></div>;
}

function FounderInsightsPage({ status, metrics, investors, selectedRequestId, onSelectRequest, onCloseRequest, onBack, onEdit, onMarkContacted }: { status: "draft" | "launched"; metrics: { votes: number; interests: number; feedback: number; views: number; score: number }; investors: Array<{ id: string; name: string; bio: string; website: string; email: string; message: string; date: string; initials: string; contactedAt: string | null }>; selectedRequestId: string; onSelectRequest: (interestId: string) => void; onCloseRequest: () => void; onBack: () => void; onEdit: () => void; onMarkContacted: (interestId: string) => void }) {
  const selectedInvestor = investors.find((investor) => investor.id === selectedRequestId);
  return <div className="screen workspace-screen insights-screen"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back to discover</button><div className="workspace-head edit-workspace-head"><div><p className="eyebrow">Founder workspace</p><h1>Signal health.</h1><p>See how the market is responding while your launch is live.</p></div><div className="studio-nav"><button className="studio-tab" onClick={onEdit}>Edit startup</button><button className="studio-tab active">Signal health <TrendingUp size={14} /></button></div></div><div className="insights-layout"><main><section className="workspace-card score-card"><div className="card-heading"><div><p className="eyebrow">Your signal</p><h2>Attention, in one read.</h2></div><TrendingUp size={18} /></div><div className="insight-score"><strong>{metrics.score}</strong><span>/100<br />signal score</span></div><div className="insight-track"><span style={{ width: `${Math.min(100, metrics.score)}%` }} /></div><p className="insight-caption">Calculated from public signals, conversation, investor interest, and signed-in reach.</p></section><section className="workspace-card insights-metrics"><div className="card-heading"><div><p className="eyebrow">Live activity</p><h2>What is moving</h2></div><StatusPill status={status} /></div><div className="insight-metric-grid"><div><strong>{metrics.votes}</strong><span>Public signals</span></div><div><strong>{metrics.interests}</strong><span>Intro requests</span></div><div><strong>{metrics.feedback}</strong><span>Feedback notes</span></div><div><strong>{metrics.views}</strong><span>Signed-in views</span></div></div></section></main><aside className="workspace-card watcher-card"><div className="card-heading"><div><p className="eyebrow">Investor interest</p><h2>Intro requests</h2></div><Users size={17} /></div>{investors.length ? <div className="interest-list">{investors.map((investor) => <div className={selectedRequestId === investor.id ? "interest-row selected" : "interest-row"} key={investor.id} role="button" tabIndex={0} onClick={() => onSelectRequest(investor.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectRequest(investor.id); }}><div className="interest-row-main"><span className="user-avatar investor">{investor.initials}</span><div><strong>{investor.name}</strong><small>{investor.contactedAt ? "Contacted" : `Requested ${investor.date}`}</small></div></div><p className="interest-message">{investor.message || investor.bio || "No context added"}</p><div className="interest-row-footer">{investor.website && <a href={investor.website} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Open website <ArrowUpRight size={12} /></a>}<button className="text-action" onClick={(event) => { event.stopPropagation(); onSelectRequest(investor.id); }}>View request <ArrowUpRight size={12} /></button>{!investor.contactedAt && <button className="secondary-button" onClick={(event) => { event.stopPropagation(); onMarkContacted(investor.id); }}>Mark contacted</button>}</div></div>)}</div> : <EmptyState title="No intro requests yet" body="Investor requests will show here with their context and contact link." />}</aside></div>{selectedInvestor && <section className="request-drawer" aria-label="Intro request details"><div className="request-drawer-head"><div><p className="eyebrow">Intro request</p><h2>{selectedInvestor.name}</h2></div><button className="icon-action" onClick={onCloseRequest} aria-label="Close intro request"><X size={16} /></button></div><p className="request-drawer-message">{selectedInvestor.message || "This investor did not add a message. Review their profile before reaching out."}</p><div className="request-drawer-context"><span className="user-avatar investor">{selectedInvestor.initials}</span><div><strong>{selectedInvestor.contactedAt ? "Contact already noted" : `Requested ${selectedInvestor.date}`}</strong><small>{selectedInvestor.bio}</small></div></div>{selectedInvestor.website && <a className="secondary-button request-drawer-link" href={selectedInvestor.website} target="_blank" rel="noreferrer">Open investor profile <ExternalLink size={14} /></a>}{selectedInvestor.email ? <a className="primary-button request-drawer-email" href={`mailto:${selectedInvestor.email}?subject=${encodeURIComponent("Re: your intro request")}`}><Mail size={15} /> Reply by email <ArrowUpRight size={14} /></a> : <p className="request-drawer-missing">No email was captured for this request.</p>}{!selectedInvestor.contactedAt && <button className="text-action request-drawer-contacted" onClick={() => onMarkContacted(selectedInvestor.id)}>Mark contacted <Check size={14} /></button>}</section>}</div>;
}

function FounderLogoPicker({ logoPreview, pendingLogo, onSelectLogo }: { logoPreview: string; pendingLogo: File | null; onSelectLogo: (file: File) => void }) {
  return <div className="logo-picker"><div className="logo-picker-preview">{logoPreview ? <img src={logoPreview} alt="Startup logo preview" /> : <span>+</span>}</div><div className="logo-picker-copy"><strong>Startup logo</strong><p>{pendingLogo ? "Ready to upload with your next save." : "Use a square PNG or JPG, up to 5 MB."}</p><label className="upload-control"><Upload size={14} />{logoPreview ? "Replace logo" : "Choose logo"}<input type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) onSelectLogo(file); }} /></label></div></div>;
}

function FounderFormFields({ form, onChangeField }: { form: FounderForm; onChangeField: (field: keyof FounderForm, value: string) => void }) {
  return <div className="form-grid founder-form-fields"><label className="field"><span>Startup name</span><input value={form.name} onChange={(event) => onChangeField("name", event.target.value)} placeholder="NexaFlow" /></label><label className="field"><span>Category</span><select value={form.category} onChange={(event) => onChangeField("category", event.target.value)}>{categories.slice(3).map((category) => <option key={category}>{category}</option>)}</select></label><label className="field full"><span>One-line promise</span><input value={form.slogan} onChange={(event) => onChangeField("slogan", event.target.value)} placeholder="What should people remember?" /></label><label className="field full"><span>Short description</span><textarea value={form.description} onChange={(event) => onChangeField("description", event.target.value)} placeholder="What are you building, and who is it for?" /></label><label className="field full"><span>Full story <small>Optional</small></span><textarea className="tall" value={form.longDescription} onChange={(event) => onChangeField("longDescription", event.target.value)} placeholder="Why now? What makes your approach different?" /></label><label className="field full"><span>Website <small>Optional</small></span><input value={form.website} onChange={(event) => onChangeField("website", event.target.value)} placeholder="https://yourstartup.com" /></label></div>;
}

function StartupPreviewCard({ startup, label }: { startup: Startup; label: string }) {
  return <article className="startup-preview-card"><div className="startup-preview-top"><span className="preview-card-label">{label}</span><span className="preview-card-dot" /></div><div className="startup-preview-brand"><div className="startup-preview-logo">{startup.logoUrl ? <img src={startup.logoUrl} alt={`${startup.name} logo`} /> : <span>{startup.logoLetter}</span>}</div><div><span className="startup-preview-category">{startup.category || "Category"}</span></div></div><h3>{startup.name}</h3><p className="startup-preview-slogan">{startup.slogan}</p><p className="startup-preview-description">{startup.shortDescription}</p><div className="startup-preview-footer"><span><strong>{startup.votes}</strong> signals</span><span><strong>{startup.interests}</strong> watching</span><span>{startup.status === "launched" ? "Live on SIGNAL" : "Private draft"}</span></div></article>;
}

function StatusPill({ status }: { status: "draft" | "launched" }) { return <span className={status === "launched" ? "status-pill live" : "status-pill"}><i />{status === "launched" ? "Live on SIGNAL" : "Private draft"}</span>; }

function SavedPage({ onBack, onOpenDetails, onToast }: { onBack: () => void; onOpenDetails: (id: string) => void; onToast: (message: string) => void }) {
  const [savedStartups, setSavedStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    async function loadSavedStartups() {
      try {
        const response = await fetch("/api/saved");
        const payload = await parseJsonResponse<{ startups?: SignalStartup[]; error?: string }>(response, "Saved startups");
        if (!response.ok) throw new Error(payload.error ?? "Saved startups could not be loaded.");
        setSavedStartups((payload.startups ?? []).map(mapSignalStartupToUi));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Saved startups could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    void loadSavedStartups();
  }, []);
  async function removeSavedStartup(startup: Startup) {
    const response = await fetch(`/api/startups/${startup.id}/save`, { method: "DELETE" });
    const payload = await parseJsonResponse<{ error?: string }>(response, "Saved startup");
    if (!response.ok) { onToast(payload.error ?? "Saved startup could not be removed."); return; }
    setSavedStartups((items) => items.filter((item) => item.id !== startup.id));
    onToast(`${startup.name} removed from saved`);
  }
  return <div className="screen saved-screen"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back to discover</button><div className="page-heading"><div><p className="eyebrow">Your saved signals</p><h1>Keep the good ones close.</h1><p>Launches you saved for a second look.</p></div></div>{error && <div className="inline-error"><strong>Saved launches are unavailable.</strong><span>{error}</span></div>}{loading ? <div className="launch-list">{[1, 2].map((item) => <LaunchSkeleton key={item} />)}</div> : savedStartups.length ? <div className="launch-list">{savedStartups.map((startup, index) => <LaunchRow key={startup.id} startup={startup} rank={index + 1} hasVoted={false} isSaved onVote={() => undefined} onSave={() => void removeSavedStartup(startup)} onOpen={() => onOpenDetails(startup.id)} onToast={onToast} showSignal={false} />)}</div> : <EmptyState title="Your watchlist is empty" body="Save a startup from Discover and it will wait here for you." actionLabel="Discover launches" onAction={onBack} />}</div>;
}

function InvestorProfilePage({ onBack, onToast, onBecomeFounder }: { onBack: () => void; onToast: (message: string) => void; onBecomeFounder: () => void }) {
  const [profile, setProfile] = useState({ full_name: "", bio: "", website: "", interests: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    async function loadProfile() {
      try {
        const response = await fetch("/api/profile");
        const payload = await parseJsonResponse<{ profile?: { full_name?: string; bio?: string; website?: string; interests?: string[] }; error?: string }>(response, "Investor profile");
        if (!response.ok) throw new Error(payload.error ?? "Investor profile could not be loaded.");
        if (payload.profile) setProfile({ full_name: payload.profile.full_name ?? "", bio: payload.profile.bio ?? "", website: payload.profile.website ?? "", interests: (payload.profile.interests ?? []).join(", ") });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Investor profile could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    void loadProfile();
  }, []);
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...profile, interests: profile.interests.split(",").map((interest) => interest.trim()).filter(Boolean) }) });
    if (!response.ok) { onToast("Profile could not be saved"); return; }
    onToast("Investor profile saved");
  }
  return <div className="screen profile-screen"><button className="back-link" onClick={onBack}><ArrowLeft size={15} /> Back to discover</button><div className="page-heading"><div><p className="eyebrow">Investor profile</p><h1>Make your signal legible.</h1><p>Give founders enough context to understand who is paying attention.</p></div><button className="secondary-button profile-founder-action" onClick={onBecomeFounder}>Become a founder <ArrowUpRight size={14} /></button></div>{error && <div className="inline-error"><strong>Profile unavailable.</strong><span>{error}</span></div>}<div className="profile-layout"><form className="workspace-card profile-form" onSubmit={saveProfile}><div className="card-heading"><div><p className="eyebrow">Public profile</p><h2>About you</h2></div><UserRound size={17} /></div>{loading ? <div className="profile-loading" /> : <div className="form-grid"><label className="field full"><span>Name</span><input value={profile.full_name} onChange={(event) => setProfile((current) => ({ ...current, full_name: event.target.value }))} required /></label><label className="field full"><span>Short bio</span><textarea className="tall" value={profile.bio} onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))} /></label><label className="field full"><span>Website</span><input value={profile.website} onChange={(event) => setProfile((current) => ({ ...current, website: event.target.value }))} /></label><label className="field full"><span>Interests</span><input value={profile.interests} onChange={(event) => setProfile((current) => ({ ...current, interests: event.target.value }))} /><small>Separate interests with commas.</small></label><button className="primary-button" type="submit">Save profile <ArrowUpRight size={15} /></button></div>}</form><aside className="profile-preview workspace-card"><p className="eyebrow">Founder view</p><div className="large-avatar">{profile.full_name.slice(0, 2).toUpperCase() || "IN"}</div><h2>{profile.full_name || "Your name"}</h2><span className="role-tag investor">Investor</span><p>{profile.bio || "Your profile gives founders a little more context."}</p>{profile.website && <a href={profile.website.startsWith("http") ? profile.website : `https://${profile.website}`} target="_blank" rel="noreferrer">{profile.website} <ExternalLink size={13} /></a>}</aside></div></div>;
}

function AccountSettingsModal({ currentUser, onClose, onSaved, onToast }: { currentUser: CurrentUser; onClose: () => void; onSaved: (name: string) => void; onToast: (message: string) => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email ?? "");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    async function loadAccount() {
      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        const payload = await parseJsonResponse<{ profile?: { full_name?: string }; email?: string; error?: string }>(response, "Account settings");
        if (!response.ok) throw new Error(payload.error ?? "Account settings could not be loaded.");
        setName(payload.profile?.full_name ?? currentUser.name);
        setEmail(payload.email ?? currentUser.email ?? "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Account settings could not be loaded.");
      } finally {
        setLoading(false);
      }
    }
    void loadAccount();
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [currentUser.email, currentUser.name, onClose]);

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ full_name: name }) });
      const payload = await parseJsonResponse<{ profile?: { full_name?: string }; error?: string }>(response, "Account settings");
      if (!response.ok || !payload.profile) throw new Error(payload.error ?? "Name could not be updated.");
      onSaved(payload.profile.full_name ?? name.trim());
      onToast("Account name updated");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Name could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="account-settings-modal" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="account-settings-title"><div className="account-settings-heading"><div><p className="eyebrow">Account settings</p><h2 id="account-settings-title">Your account, clearly.</h2><p>Update your display name. Your sign-in email stays protected.</p></div><button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button></div>{loading ? <div className="account-settings-loading" /> : <form onSubmit={saveAccount}><label className="field"><span>Display name</span><input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required autoFocus /></label><label className="field"><span>Email address <small>Read only</small></span><input value={email || "Email unavailable"} readOnly aria-readonly="true" /></label><div className="account-settings-role"><span>Account type</span><strong>{roleLabels[currentUser.role]}</strong></div>{error && <div className="form-error">{error}</div>}<div className="account-settings-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Saving…" : "Save changes"} <Check size={15} /></button></div></form>}</section></div>;
}

function FounderConversionModal({ currentRole, onClose, onConfirm }: { currentRole: UserRole; onClose: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="founder-conversion-modal" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="founder-conversion-title"><button className="conversion-close" onClick={onClose} aria-label="Close"><X size={17} /></button><div className="conversion-icon"><Upload size={18} /></div><p className="eyebrow">Switch account type</p><h2 id="founder-conversion-title">Move into founder mode?</h2><p className="conversion-copy">You&apos;re currently an {roleLabels[currentRole]}. To launch a startup, SIGNAL needs to switch this account to Founder.</p><div className="conversion-note"><strong>What changes</strong><span>Your account stays the same, but your workspace will open with the founder setup flow so you can create and publish a startup.</span></div><div className="conversion-actions"><button className="secondary-button" onClick={onClose}>Keep my account</button><button className="primary-button" onClick={onConfirm}>Continue as founder <ArrowUpRight size={14} /></button></div></section></div>;
}

function AuthModal({ initialMode, initialRole, onClose, onAuthenticated, onToast }: { initialMode: AuthMode; initialRole: UserRole; onClose: () => void; onAuthenticated: (user: CurrentUser) => void; onToast: (message: string) => void }) {
  const dialogRef = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [authRole, setAuthRole] = useState<UserRole>(initialRole);
  const [authError, setAuthError] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [busy, setBusy] = useState(false);
  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setAuthError("");
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));
    const name = String(formData.get("name") ?? "SIGNAL user");
    const supabase = createSupabaseBrowserClient();
    if (!supabase) { setAuthError("SIGNAL auth is not configured on this deployment."); setBusy(false); return; }
    let authenticatedId = "";
    let authenticatedName = name;
    let authenticatedRole = authRole;
    {
      const response = mode === "signin" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password, options: { data: { name, role: authRole }, emailRedirectTo: window.location.origin } });
      if (response.error) { setAuthError(response.error.message); setBusy(false); return; }
      authenticatedId = response.data.user?.id ?? authenticatedId;
      if (mode === "signup" && !response.data.session) {
        setConfirmationEmail(email);
        setBusy(false);
        onToast("Check your email to activate your SIGNAL account");
        return;
      }
      if (response.data.user) {
        const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", response.data.user.id).maybeSingle();
        authenticatedName = profile?.full_name ?? response.data.user.email ?? name;
        authenticatedRole = resolveUserRole(profile?.role, response.data.user.user_metadata?.role, authRole);
      }
    }
    onAuthenticated({ id: authenticatedId, name: authenticatedName, email, role: authenticatedRole });
    onToast(mode === "signin" ? "Welcome back to SIGNAL" : "Your SIGNAL account is ready");
  }
  useEffect(() => {
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}><section className="auth-sheet" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="auth-title"><button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button><div className="auth-aside"><div className="auth-mark"><Image src="/logo.png" alt="" width={30} height={30} /><span>SIGNAL</span></div><div><p className="eyebrow">{mode === "signin" ? "Welcome back" : "Join the index"}</p><h2 id="auth-title">{mode === "signin" ? "Keep an eye on what is moving." : "Put your signal out there."}</h2><p>{mode === "signin" ? "Sign in to vote, save launches, and leave useful feedback." : "Create a focused profile for discovering, investing, or launching what comes next."}</p></div><div className="auth-quote"><Quote size={15} /><span>Useful products deserve a clearer first impression.</span></div></div><div className="auth-form-side">{confirmationEmail ? <div className="confirmation-state"><span className="confirmation-icon"><MailCheck size={22} /></span><p className="eyebrow">One last step</p><h2>Check your inbox.</h2><p>We sent an activation link to <strong>{confirmationEmail}</strong>. Activate your account, then come back and sign in to open your founder workspace.</p><button className="secondary-button" onClick={() => { setConfirmationEmail(""); setMode("signin"); }}>Back to sign in <ArrowUpRight size={14} /></button></div> : <><div className="auth-tabs"><button className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setAuthError(""); }}>Sign in</button><button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setAuthError(""); }}>Create account</button></div><form onSubmit={submitAuth}>{mode === "signup" && <label className="field"><span>Your name</span><input name="name" autoComplete="name" required placeholder="Alex Morgan" /></label>}<label className="field"><span>Email address</span><input name="email" type="email" autoComplete="email" required placeholder="you@company.com" /></label><label className="field"><span>Password</span><input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} required placeholder="At least 6 characters" minLength={6} /></label>{mode === "signup" && <div className="role-picker"><span>I am joining as</span><div>{(["public", "investor", "founder"] as UserRole[]).map((option) => <button type="button" key={option} className={authRole === option ? "selected" : ""} onClick={() => setAuthRole(option)}><strong>{roleLabels[option]}</strong><small>{option === "public" ? "Explore and give feedback" : option === "investor" ? "Find companies worth watching" : "Launch and build presence"}</small></button>)}</div></div>}{authError && <div className="form-error">{authError}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy ? "Connecting…" : mode === "signin" ? "Sign in" : "Create account"}<ArrowUpRight size={15} /></button></form><p className="auth-switch">{mode === "signin" ? "New here?" : "Already have an account?"} <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setAuthError(""); }}>{mode === "signin" ? "Create an account" : "Sign in"}</button></p></>}</div></section></div>;
}

function LaunchSkeleton() { return <div className="launch-skeleton"><span /><span /><div><i /><i /><i /></div><b /><em /></div>; }

function EmptyState({ title, body, actionLabel, onAction }: { title: string; body: string; actionLabel?: string; onAction?: () => void }) { return <div className="empty-state"><span className="empty-signal"><i /><i /><i /></span><h3>{title}</h3><p>{body}</p>{actionLabel && <button className="secondary-button" onClick={onAction}>{actionLabel} <ArrowUpRight size={14} /></button>}</div>; }

function Footer() { return <footer className="site-footer"><div className="footer-brand"><Image src="/logo.png" alt="" width={23} height={23} /><strong>SIGNAL</strong><span>market signals, made visible.</span></div><div className="footer-meta"><span>© 2026 SIGNAL</span><span>Built for thoughtful discovery</span></div></footer>; }
