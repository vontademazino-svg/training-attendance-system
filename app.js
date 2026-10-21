// =====================================================================
// Tzu Chi Mozambique — Information Management System (website code)
// Part 1 of 3: connection, language, helpers, login, roles, menu,
// shared lists (departments, locations, projects, staff).
//   activities.js – activities, approval workflow, attendance, files
//   ims.js        – dashboard, projects, setup, staff, audit log
//
// The website only knows the project URL and the anon (public) key
// (in config.js). Login and password reset are handled by Supabase Auth.
// All database work is done by Supabase Database Functions, called by
// name with .rpc(...). There is no SQL in these files.
// =====================================================================

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ---------- Page elements ----------

function byId(id) {
    return document.getElementById(id);
}

const userBar = byId("userBar");
const userName = byId("userName");
const userRole = byId("userRole");
const adminBadge = byId("adminBadge");
const signOutButton = byId("signOutButton");

const heroArea = byId("heroArea");
const authArea = byId("authArea");
const pendingArea = byId("pendingArea");
const mainNav = byId("mainNav");
const pageMessage = byId("pageMessage");

const signInTab = byId("signInTab");
const signUpTab = byId("signUpTab");
const signInForm = byId("signInForm");
const signUpForm = byId("signUpForm");
const signInMessage = byId("signInMessage");
const signUpMessage = byId("signUpMessage");
const checkAgainButton = byId("checkAgainButton");

const forgotLink = byId("forgotLink");
const forgotForm = byId("forgotForm");
const forgotMessage = byId("forgotMessage");
const backToSignIn = byId("backToSignIn");
const resetForm = byId("resetForm");
const resetMessage = byId("resetMessage");


// ---------- Who is signed in ----------

let currentProfile = null;     // { display_name, role, is_admin, department_id, ... }
let isAdmin = false;           // administrators can do everything
let recoveryMode = false;      // true after clicking the link in a reset email
let currentView = null;

// Shared lists used by every part of the system
const lookups = {
    departments: [],
    locations: [],
    projects: [],
    staff: []
};

// Other files register functions here:
//   languageHooks – redraw text when the language changes
//   lookupHooks   – refill dropdowns when the shared lists change
//   viewLoaders   – load a page of the menu when it is opened
//   signOutHooks  – forget data when the user signs out
const languageHooks = [];
const lookupHooks = [];
const viewLoaders = {};
const signOutHooks = [];


// =====================================================================
// ROLES — what each person may do. The DATABASE checks the same rules;
// these only decide which buttons to show.
// =====================================================================

function hasRole(roles) {
    return isAdmin || (currentProfile !== null && roles.indexOf(currentProfile.role) !== -1);
}

function can(action) {
    switch (action) {
        case "verify":   return hasRole(["department_head", "im_team"]);
        case "approve":  return hasRole(["leadership", "im_team"]);
        case "return":   return hasRole(["department_head", "leadership", "im_team"]);
        case "projects": return hasRole(["department_head", "leadership", "im_team"]);
        case "setup":    return hasRole(["im_team"]);
        case "audit":    return hasRole(["leadership", "im_team"]);
        case "staff":    return isAdmin;
        default:         return false;
    }
}


// =====================================================================
// LANGUAGE
// =====================================================================

let currentLanguage = "pt";

// Get a piece of text in the current language
function t(key) {
    return TRANSLATIONS[currentLanguage][key] || TRANSLATIONS.en[key] || key;
}

// Text with {placeholders} filled in, e.g. fill("uploading", { i: 1, n: 3 })
function fill(key, values) {
    let text = t(key);
    Object.keys(values).forEach(function(name) {
        text = text.split("{" + name + "}").join(values[name]);
    });
    return text;
}

// A department name in the current language (falls back to Portuguese).
// prefix "" for a department row, "department_" for joined rows.
function departmentName(row, prefix) {
    const p = prefix === undefined ? "name_" : prefix;
    if (!row) {
        return "";
    }
    return row[p + currentLanguage] || row[p + "pt"] || "";
}

function setLanguage(language) {

    currentLanguage = language;

    try {
        localStorage.setItem("language", language);
    } catch (e) {}

    document.documentElement.lang = LANGUAGE_CODES[language];
    document.title = t("docTitle");

    document.querySelectorAll("[data-i18n]").forEach(function(element) {
        element.textContent = t(element.dataset.i18n);
    });

    document.querySelectorAll("[data-lang]").forEach(function(button) {
        button.classList.toggle("active", button.dataset.lang === language);
    });

    document.querySelectorAll("[data-toggle]").forEach(function(button) {
        const input = byId(button.dataset.toggle);
        button.textContent = input.type === "password" ? t("show") : t("hide");
    });

    document.querySelectorAll(".message").forEach(function(message) {
        message.textContent = "";
    });

    if (currentProfile) {
        userRole.textContent = t("role_" + currentProfile.role);
    }

    lookupHooks.forEach(function(hook) { hook(); });
    languageHooks.forEach(function(hook) { hook(); });
}

document.querySelectorAll("[data-lang]").forEach(function(button) {
    button.addEventListener("click", function() {
        setLanguage(button.dataset.lang);
    });
});

function startingLanguage() {
    try {
        const saved = localStorage.getItem("language");
        if (saved && TRANSLATIONS[saved]) {
            return saved;
        }
    } catch (e) {}
    return "pt";
}


// =====================================================================
// SMALL HELPERS
// =====================================================================

function showMessage(element, text, type) {
    element.textContent = text;
    element.className = "message " + (type || "");
}

function showError(element, error) {
    showMessage(element, t("error") + ": " + error.message, "error");
}

function makeButton(text, onClick, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    if (className) {
        button.className = className;
    }
    button.addEventListener("click", onClick);
    return button;
}

function makeText(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
}

function emptyText(key) {
    return makeText("p", "empty", t(key));
}

function two(n) {
    return String(n).padStart(2, "0");
}

// 2026-10-21T08:47:00+00:00 → "2026-10-21 10:47" (viewer's time zone)
function formatTime(timestamp) {
    if (!timestamp) {
        return "";
    }
    const d = new Date(timestamp);
    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate()) +
        " " + two(d.getHours()) + ":" + two(d.getMinutes());
}

// 2400000 → "2.3 MB"
function formatSize(bytes) {
    if (!bytes && bytes !== 0) {
        return "";
    }
    if (bytes < 1024) {
        return bytes + " B";
    }
    if (bytes < 1024 * 1024) {
        return Math.round(bytes / 1024) + " KB";
    }
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

// 150000 → "150 000 MZN"
function formatMoney(value) {
    if (value === null || value === undefined || value === "") {
        return "";
    }
    return Number(value).toLocaleString(LANGUAGE_CODES[currentLanguage],
        { maximumFractionDigits: 2 }) + " MZN";
}

// "Last edited by Maria · 2026-10-21 10:47"
function editedText(name, time) {
    if (!time) {
        return "";
    }
    return fill("editedBy", { name: name || "—", time: formatTime(time) });
}

// Fill a <select>. items: array; options.value / options.label: functions;
// options.empty: text for a first "nothing chosen" option. Keeps the
// current choice when it still exists.
function fillSelect(select, items, options) {
    const keep = select.value;
    select.innerHTML = "";

    if (options.empty !== undefined) {
        const first = document.createElement("option");
        first.value = "";
        first.textContent = options.empty;
        select.appendChild(first);
    }

    items.forEach(function(item) {
        const option = document.createElement("option");
        option.value = options.value(item);
        option.textContent = options.label(item);
        select.appendChild(option);
    });

    if (keep && Array.prototype.some.call(select.options, function(o) { return o.value === keep; })) {
        select.value = keep;
    }
}

// Select value → number or null
function numberOrNull(value) {
    return value === "" || value === null || value === undefined ? null : Number(value);
}

function textOrNull(value) {
    return value === "" ? null : value;
}

// Switch between two tabs and their panels
function switchTab(activeTab, otherTab, showPanel, hidePanel) {
    activeTab.classList.add("active");
    otherTab.classList.remove("active");
    showPanel.hidden = false;
    hidePanel.hidden = true;
}

// Show one of the three panels of the signed-out card
function showAuthPanel(panel) {
    signInForm.hidden = panel !== signInForm;
    signUpForm.hidden = panel !== signUpForm;
    forgotForm.hidden = panel !== forgotForm;
    signInTab.classList.toggle("active", panel !== signUpForm);
    signUpTab.classList.toggle("active", panel === signUpForm);
}

signInTab.addEventListener("click", function() { showAuthPanel(signInForm); });
signUpTab.addEventListener("click", function() { showAuthPanel(signUpForm); });
backToSignIn.addEventListener("click", function() { showAuthPanel(signInForm); });

forgotLink.addEventListener("click", function() {
    byId("forgotEmail").value = byId("signInEmail").value;
    forgotMessage.textContent = "";
    showAuthPanel(forgotForm);
});

// "Show password" buttons
document.querySelectorAll("[data-toggle]").forEach(function(button) {
    button.addEventListener("click", function() {
        const input = byId(button.dataset.toggle);
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        button.textContent = isHidden ? t("hide") : t("show");
    });
});


// =====================================================================
// MENU (views)
// =====================================================================

function showView(name) {

    // A page the user may not open falls back to the dashboard
    const button = mainNav.querySelector('[data-view="' + name + '"]');
    if (!button || button.hidden) {
        name = "dashboard";
    }

    currentView = name;
    try {
        localStorage.setItem("view", name);
    } catch (e) {}

    document.querySelectorAll(".view").forEach(function(view) {
        view.hidden = view.id !== "view-" + name;
    });
    mainNav.querySelectorAll("[data-view]").forEach(function(b) {
        b.classList.toggle("active", b.dataset.view === name);
    });

    pageMessage.textContent = "";

    if (viewLoaders[name]) {
        viewLoaders[name]();
    }
}

mainNav.querySelectorAll("[data-view]").forEach(function(button) {
    button.addEventListener("click", function() {
        showView(button.dataset.view);
    });
});

function hideSystem() {
    mainNav.hidden = true;
    document.querySelectorAll(".view").forEach(function(view) {
        view.hidden = true;
    });
}


// =====================================================================
// SHARED LISTS: departments, locations, projects, staff names
// =====================================================================

async function loadLookups() {

    const results = await Promise.all([
        supabaseClient.rpc("get_departments"),
        supabaseClient.rpc("get_locations"),
        supabaseClient.rpc("get_projects"),
        supabaseClient.rpc("get_staff_names")
    ]);

    const failed = results.find(function(r) { return r.error; });
    if (failed) {
        showError(pageMessage, failed.error);
        return;
    }

    lookups.departments = results[0].data;
    lookups.locations = results[1].data;
    lookups.projects = results[2].data;
    lookups.staff = results[3].data;

    lookupHooks.forEach(function(hook) { hook(); });
}

function activeDepartments() {
    return lookups.departments.filter(function(d) { return d.active; });
}

function activeLocations() {
    return lookups.locations.filter(function(l) { return l.active; });
}

// Options for location dropdowns: "Sofala", "Sofala › Beira", ...
function fillLocationSelect(select, emptyKey) {
    fillSelect(select, activeLocations(), {
        empty: t(emptyKey || "noneChosen"),
        value: function(l) { return l.id; },
        label: function(l) { return l.path; }
    });
}

function fillDepartmentSelect(select, emptyKey) {
    fillSelect(select, activeDepartments(), {
        empty: t(emptyKey || "noneChosen"),
        value: function(d) { return d.id; },
        label: function(d) { return departmentName(d); }
    });
}


// =====================================================================
// LOGIN
// =====================================================================

// Decide what to show: sign-in form, new password, "pending approval",
// or the system
async function showScreenFor(session) {

    pageMessage.textContent = "";

    if (!session) {
        recoveryMode = false;
        currentProfile = null;
        isAdmin = false;
        heroArea.hidden = false;
        authArea.hidden = false;
        resetForm.hidden = true;
        pendingArea.hidden = true;
        userBar.hidden = true;
        hideSystem();
        signOutHooks.forEach(function(hook) { hook(); });
        return;
    }

    // Came from the reset-password email: only ask for the new password
    if (recoveryMode) {
        heroArea.hidden = false;
        authArea.hidden = true;
        pendingArea.hidden = true;
        userBar.hidden = true;
        hideSystem();
        resetForm.hidden = false;
        byId("resetPassword").focus();
        return;
    }

    resetForm.hidden = true;

    // RPC: get_my_profile → name, approved, admin, role, department
    const { data, error } = await supabaseClient.rpc("get_my_profile");

    const profile = (data && data[0]) || { display_name: "", approved: false };

    userName.textContent = profile.display_name || session.user.email;
    userBar.hidden = false;
    authArea.hidden = true;

    if (error || !profile.approved) {
        currentProfile = null;
        isAdmin = false;
        heroArea.hidden = false;
        pendingArea.hidden = false;
        adminBadge.hidden = true;
        userRole.textContent = "";
        hideSystem();
        return;
    }

    currentProfile = profile;
    isAdmin = profile.is_admin === true;
    adminBadge.hidden = !isAdmin;
    userRole.textContent = t("role_" + profile.role);

    heroArea.hidden = true;
    pendingArea.hidden = true;
    mainNav.hidden = false;

    // Menu items depend on the role
    mainNav.querySelectorAll("[data-needs]").forEach(function(button) {
        button.hidden = !can(button.dataset.needs);
    });

    await loadLookups();

    let start = "dashboard";
    try {
        start = localStorage.getItem("view") || "dashboard";
    } catch (e) {}
    showView(currentView || start);
}

// Sign in with email + password
signInForm.addEventListener("submit", async function(event) {

    event.preventDefault();
    showMessage(signInMessage, t("signingIn"), "");

    const { error } = await supabaseClient.auth.signInWithPassword({
        email: byId("signInEmail").value.trim(),
        password: byId("signInPassword").value
    });

    if (error) {
        showError(signInMessage, error);
        return;
    }

    signInForm.reset();
    signInMessage.textContent = "";
});

// Create an account (Supabase sends a verification email)
signUpForm.addEventListener("submit", async function(event) {

    event.preventDefault();
    showMessage(signUpMessage, t("sending"), "");

    const { error } = await supabaseClient.auth.signUp({
        email: byId("signUpEmail").value.trim(),
        password: byId("signUpPassword").value,
        options: {
            data: { display_name: byId("signUpName").value.trim() },
            emailRedirectTo: window.location.origin + window.location.pathname
        }
    });

    if (error) {
        showError(signUpMessage, error);
        return;
    }

    signUpForm.reset();
    showMessage(signUpMessage, t("checkEmail"), "success");
});

// Forgot password: Supabase emails a link back to this page
forgotForm.addEventListener("submit", async function(event) {

    event.preventDefault();
    showMessage(forgotMessage, t("sending"), "");

    const { error } = await supabaseClient.auth.resetPasswordForEmail(
        byId("forgotEmail").value.trim(),
        { redirectTo: window.location.origin + window.location.pathname }
    );

    if (error) {
        showError(forgotMessage, error);
        return;
    }

    forgotForm.reset();
    showMessage(forgotMessage, t("resetSent"), "success");
});

// New password, after clicking the link in the email
resetForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const password = byId("resetPassword").value;

    if (password !== byId("resetPasswordAgain").value) {
        showMessage(resetMessage, t("passwordMismatch"), "error");
        return;
    }

    showMessage(resetMessage, t("sending"), "");

    const { error } = await supabaseClient.auth.updateUser({ password: password });

    if (error) {
        showError(resetMessage, error);
        return;
    }

    resetForm.reset();
    recoveryMode = false;
    resetMessage.textContent = "";

    const { data } = await supabaseClient.auth.getSession();
    await showScreenFor(data.session);
    showMessage(pageMessage, t("passwordUpdated"), "success");
});

signOutButton.addEventListener("click", async function() {
    currentView = null;
    await supabaseClient.auth.signOut();
});

checkAgainButton.addEventListener("click", async function() {
    const { data } = await supabaseClient.auth.getSession();
    showScreenFor(data.session);
});

// Runs on page load and whenever the user signs in or out.
// "PASSWORD_RECOVERY" means the page was opened from a reset email.
// Token refreshes are ignored so the page does not reload by itself.
supabaseClient.auth.onAuthStateChange(function(event, session) {
    if (event === "PASSWORD_RECOVERY") {
        recoveryMode = true;
    }
    if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        return;
    }
    setTimeout(function() {
        showScreenFor(session);
    }, 0);
});
