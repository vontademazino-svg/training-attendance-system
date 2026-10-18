// =====================================================================
// Tzu Chi Mozambique — Training Attendance System (website code)
//
// The website only knows the project URL and the anon (public) key.
// Login is handled by Supabase Auth. All database work is done by
// Supabase Database Functions, called by name with .rpc(...).
// There is no SQL in this file. Page text lives in translations.js.
// =====================================================================

const SUPABASE_URL = "https://dstzkaygqvxhzmefirdr.supabase.co";

// Paste your anon / publishable key here (Supabase → Settings → API Keys).
// Never put a secret or service_role key in this file.
const SUPABASE_ANON_KEY = "sb_publishable_Ej4MWxE33vHvwYpdIUxUUw_u4OZnr5a";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// ---------- Page elements ----------

function byId(id) {
    return document.getElementById(id);
}

const userBar = byId("userBar");
const userName = byId("userName");
const signOutButton = byId("signOutButton");

const authArea = byId("authArea");
const pendingArea = byId("pendingArea");
const appArea = byId("appArea");
const recordsArea = byId("recordsArea");

const signInTab = byId("signInTab");
const signUpTab = byId("signUpTab");
const signInForm = byId("signInForm");
const signUpForm = byId("signUpForm");
const signInMessage = byId("signInMessage");
const signUpMessage = byId("signUpMessage");
const checkAgainButton = byId("checkAgainButton");

const sessionTab = byId("sessionTab");
const attendanceTab = byId("attendanceTab");

const sessionForm = byId("sessionForm");
const sessionFormTitle = byId("sessionFormTitle");
const sessionName = byId("sessionName");
const sessionDate = byId("sessionDate");
const sessionLocation = byId("sessionLocation");
const sessionSubmit = byId("sessionSubmit");
const sessionCancel = byId("sessionCancel");
const sessionMessage = byId("sessionMessage");

const attendanceForm = byId("attendanceForm");
const attendanceFormTitle = byId("attendanceFormTitle");
const attendanceSession = byId("attendanceSession");
const participantName = byId("participantName");
const attendanceStatus = byId("attendanceStatus");
const attendanceSubmit = byId("attendanceSubmit");
const attendanceCancel = byId("attendanceCancel");
const attendanceMessage = byId("attendanceMessage");

const sessionList = byId("sessionList");
const attendanceList = byId("attendanceList");
const attendanceHint = byId("attendanceHint");


// ---------- What the user is doing ----------

let editingSessionId = null;   // session being edited, or null when adding
let editingRecordId = null;    // attendance record being edited, or null
let selectedSessionId = null;  // session whose attendance is shown

let currentSessions = [];      // last data loaded, so we can redraw it
let currentAttendance = null;  // in another language without reloading


// =====================================================================
// LANGUAGE
// =====================================================================

let currentLanguage = "pt";

// Get a piece of text in the current language
function t(key) {
    return TRANSLATIONS[currentLanguage][key] || key;
}

function setLanguage(language) {

    currentLanguage = language;

    // Remember the choice in this browser (not essential, so errors are ignored)
    try {
        localStorage.setItem("language", language);
    } catch (e) {}

    document.documentElement.lang = LANGUAGE_CODES[language];
    document.title = t("docTitle");

    // Every element with data-i18n="key" gets the text for that key
    document.querySelectorAll("[data-i18n]").forEach(function(element) {
        element.textContent = t(element.dataset.i18n);
    });

    document.querySelectorAll("[data-lang]").forEach(function(button) {
        button.classList.toggle("active", button.dataset.lang === language);
    });

    // Text that depends on what the user is doing
    updateSessionFormText();
    updateAttendanceFormText();

    document.querySelectorAll("[data-toggle]").forEach(function(button) {
        const input = byId(button.dataset.toggle);
        button.textContent = input.type === "password" ? t("show") : t("hide");
    });

    [signInMessage, signUpMessage, sessionMessage, attendanceMessage].forEach(function(message) {
        message.textContent = "";
    });

    // Redraw lists in the new language
    drawSessions();
    if (currentAttendance) {
        drawAttendance();
    }
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


// ---------- Small helpers ----------

function showMessage(element, text, type) {
    element.textContent = text;
    element.className = "message " + type;
}

function showError(element, error) {
    showMessage(element, t("error") + ": " + error.message, "error");
}

function makeButton(text, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
}

// Switch between two tabs and their panels
function switchTab(activeTab, otherTab, showPanel, hidePanel) {
    activeTab.classList.add("active");
    otherTab.classList.remove("active");
    showPanel.hidden = false;
    hidePanel.hidden = true;
}

signInTab.addEventListener("click", function() {
    switchTab(signInTab, signUpTab, signInForm, signUpForm);
});

signUpTab.addEventListener("click", function() {
    switchTab(signUpTab, signInTab, signUpForm, signInForm);
});

sessionTab.addEventListener("click", function() {
    switchTab(sessionTab, attendanceTab, sessionForm, attendanceForm);
});

attendanceTab.addEventListener("click", function() {
    switchTab(attendanceTab, sessionTab, attendanceForm, sessionForm);
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
// LOGIN
// =====================================================================

// Decide what to show: sign-in form, "pending approval", or the system
async function showScreenFor(session) {

    if (!session) {
        authArea.hidden = false;
        pendingArea.hidden = true;
        appArea.hidden = true;
        recordsArea.hidden = true;
        userBar.hidden = true;
        return;
    }

    // RPC: get_my_profile → name and whether the account is approved
    const { data, error } = await supabaseClient.rpc("get_my_profile");

    const profile = (data && data[0]) || { display_name: "", approved: false };

    userName.textContent = profile.display_name || session.user.email;
    userBar.hidden = false;
    authArea.hidden = true;

    if (error || !profile.approved) {
        pendingArea.hidden = false;
        appArea.hidden = true;
        recordsArea.hidden = true;
        return;
    }

    pendingArea.hidden = true;
    appArea.hidden = false;
    recordsArea.hidden = false;
    loadSessions();
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

signOutButton.addEventListener("click", async function() {
    await supabaseClient.auth.signOut();
});

checkAgainButton.addEventListener("click", async function() {
    const { data } = await supabaseClient.auth.getSession();
    showScreenFor(data.session);
});

// Runs on page load and whenever the user signs in or out.
// setTimeout lets Supabase finish its own work before we call it again.
supabaseClient.auth.onAuthStateChange(function(event, session) {
    setTimeout(function() {
        showScreenFor(session);
    }, 0);
});


// =====================================================================
// TRAINING SESSIONS
// =====================================================================

// Read all sessions (RPC: get_training_sessions)
async function loadSessions() {

    const { data, error } = await supabaseClient.rpc("get_training_sessions");

    if (error) {
        showError(sessionMessage, error);
        return;
    }

    currentSessions = data;
    drawSessions();
}

// Show the sessions in the list and in the dropdown
function drawSessions() {

    sessionList.innerHTML = "";

    attendanceSession.innerHTML = "";
    const firstOption = document.createElement("option");
    firstOption.value = "";
    firstOption.textContent = t("selectSession");
    attendanceSession.appendChild(firstOption);

    if (currentSessions.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = t("noSessions");
        sessionList.appendChild(empty);
    }

    currentSessions.forEach(function(session) {

        const item = document.createElement("div");
        item.className = "item";
        if (session.id === selectedSessionId) {
            item.classList.add("selected");
        }

        const main = document.createElement("div");
        main.className = "item-main";

        const title = document.createElement("p");
        title.className = "item-title";
        title.textContent = session.session_name;

        const sub = document.createElement("p");
        sub.className = "item-sub";
        sub.textContent = session.session_date + " · " + session.location;

        main.appendChild(title);
        main.appendChild(sub);

        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.appendChild(makeButton(t("view"), function() {
            selectSession(session.id);
        }));
        actions.appendChild(makeButton(t("edit"), function() {
            startEditSession(session);
        }));

        item.appendChild(main);
        item.appendChild(actions);
        sessionList.appendChild(item);

        const option = document.createElement("option");
        option.value = session.id;
        option.textContent = session.session_name + " (" + session.session_date + ")";
        attendanceSession.appendChild(option);
    });

    if (selectedSessionId) {
        attendanceSession.value = selectedSessionId;
    }
}

function updateSessionFormText() {
    const editing = editingSessionId !== null;
    sessionFormTitle.textContent = editing ? t("sessionEditTitle") : t("sessionAddTitle");
    sessionSubmit.textContent = editing ? t("update") : t("save");
    sessionCancel.hidden = !editing;
}

function startEditSession(session) {

    editingSessionId = session.id;

    sessionName.value = session.session_name;
    sessionDate.value = session.session_date;
    sessionLocation.value = session.location;

    updateSessionFormText();
    sessionMessage.textContent = "";

    switchTab(sessionTab, attendanceTab, sessionForm, attendanceForm);
    sessionName.focus();
}

function stopEditSession() {
    editingSessionId = null;
    sessionForm.reset();
    updateSessionFormText();
}

sessionCancel.addEventListener("click", function() {
    stopEditSession();
    sessionMessage.textContent = "";
});

// Save the session form: add (INSERT) or edit (UPDATE)
sessionForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const values = {
        p_session_name: sessionName.value,
        p_session_date: sessionDate.value,
        p_location: sessionLocation.value
    };

    let result;

    if (editingSessionId === null) {
        // RPC: add_training_session → INSERT
        result = await supabaseClient.rpc("add_training_session", values);
    } else {
        // RPC: update_training_session → UPDATE
        values.p_id = editingSessionId;
        result = await supabaseClient.rpc("update_training_session", values);
    }

    if (result.error) {
        showError(sessionMessage, result.error);
        return;
    }

    const wasEditing = editingSessionId !== null;

    stopEditSession();
    await loadSessions();

    if (selectedSessionId) {
        await loadAttendance(selectedSessionId);
    }

    showMessage(sessionMessage, wasEditing ? t("updated") : t("saved"), "success");
});


// =====================================================================
// ATTENDANCE RECORDS
// =====================================================================

async function selectSession(sessionId) {

    selectedSessionId = Number(sessionId);
    attendanceSession.value = selectedSessionId;

    drawSessions();
    await loadAttendance(selectedSessionId);
}

// Attendance + session details together (RPC: get_session_attendance)
async function loadAttendance(sessionId) {

    const { data, error } = await supabaseClient.rpc("get_session_attendance", {
        p_training_session_id: sessionId
    });

    if (error) {
        showError(attendanceMessage, error);
        return;
    }

    currentAttendance = data;
    drawAttendance();
}

function drawAttendance() {

    attendanceList.innerHTML = "";
    attendanceHint.hidden = true;

    if (currentAttendance.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = t("noAttendance");
        attendanceList.appendChild(empty);
        return;
    }

    currentAttendance.forEach(function(record) {

        const item = document.createElement("div");
        item.className = "item";

        const main = document.createElement("div");
        main.className = "item-main";

        const title = document.createElement("p");
        title.className = "item-title";
        title.textContent = record.participant_name;

        const status = document.createElement("span");
        status.className = "status " + record.attendance_status;
        status.textContent = record.attendance_status === "Present" ? t("present") : t("absent");
        title.appendChild(status);

        // This line comes from the OTHER table (training_sessions)
        const sub = document.createElement("p");
        sub.className = "item-sub";
        sub.textContent = record.session_name + " · " + record.session_date + " · " + record.location;

        main.appendChild(title);
        main.appendChild(sub);

        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.appendChild(makeButton(t("edit"), function() {
            startEditRecord(record);
        }));

        item.appendChild(main);
        item.appendChild(actions);
        attendanceList.appendChild(item);
    });
}

attendanceSession.addEventListener("change", function() {
    if (attendanceSession.value) {
        selectSession(attendanceSession.value);
    }
});

function updateAttendanceFormText() {
    const editing = editingRecordId !== null;
    attendanceFormTitle.textContent = editing ? t("attendanceEditTitle") : t("attendanceAddTitle");
    attendanceSubmit.textContent = editing ? t("update") : t("save");
    attendanceCancel.hidden = !editing;
}

function startEditRecord(record) {

    editingRecordId = record.id;

    participantName.value = record.participant_name;
    attendanceStatus.value = record.attendance_status;
    attendanceSession.disabled = true;   // a record stays in its own session

    updateAttendanceFormText();
    attendanceMessage.textContent = "";

    switchTab(attendanceTab, sessionTab, attendanceForm, sessionForm);
    participantName.focus();
}

function stopEditRecord() {
    editingRecordId = null;
    participantName.value = "";
    attendanceStatus.value = "Present";
    attendanceSession.disabled = false;
    updateAttendanceFormText();
}

attendanceCancel.addEventListener("click", function() {
    stopEditRecord();
    attendanceMessage.textContent = "";
});

// Save the attendance form: add (INSERT) or edit (UPDATE)
attendanceForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    let result;

    if (editingRecordId === null) {
        // RPC: add_attendance_record → INSERT
        result = await supabaseClient.rpc("add_attendance_record", {
            p_training_session_id: Number(attendanceSession.value),
            p_participant_name: participantName.value,
            p_attendance_status: attendanceStatus.value
        });
    } else {
        // RPC: update_attendance_record → UPDATE
        result = await supabaseClient.rpc("update_attendance_record", {
            p_id: editingRecordId,
            p_participant_name: participantName.value,
            p_attendance_status: attendanceStatus.value
        });
    }

    if (result.error) {
        showError(attendanceMessage, result.error);
        return;
    }

    const wasEditing = editingRecordId !== null;

    stopEditRecord();
    await selectSession(attendanceSession.value);

    showMessage(attendanceMessage, wasEditing ? t("updated") : t("saved"), "success");
});


// ---------- Start ----------
setLanguage(startingLanguage());
