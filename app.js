// =====================================================================
// Tzu Chi Mozambique — Training Attendance System (website code)
//
// The website only knows the project URL and the anon (public) key.
// Login and password reset are handled by Supabase Auth. All database
// work is done by Supabase Database Functions, called by name with
// .rpc(...). Photos and documents are kept in Supabase Storage
// (private bucket "session-files").
// There is no SQL in this file. Page text lives in translations.js,
// and the Supabase URL + anon key live in config.js.
// =====================================================================

// The project URL and anon key are in config.js (loaded before this file).
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const FILE_BUCKET = "session-files";
const MAX_FILE_BYTES = 10 * 1024 * 1024;    // 10 MB, same limit as the bucket


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

const forgotLink = byId("forgotLink");
const forgotForm = byId("forgotForm");
const forgotMessage = byId("forgotMessage");
const backToSignIn = byId("backToSignIn");
const resetForm = byId("resetForm");
const resetMessage = byId("resetMessage");

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

const filesArea = byId("filesArea");
const filesHint = byId("filesHint");
const filesContent = byId("filesContent");
const filesSessionName = byId("filesSessionName");
const uploadForm = byId("uploadForm");
const fileInput = byId("fileInput");
const fileCaption = byId("fileCaption");
const chosenFiles = byId("chosenFiles");
const uploadButton = byId("uploadButton");
const uploadMessage = byId("uploadMessage");
const photoGrid = byId("photoGrid");
const documentList = byId("documentList");

const adminBadge = byId("adminBadge");
const archiveArea = byId("archiveArea");
const archiveMessage = byId("archiveMessage");
const archivedSessionList = byId("archivedSessionList");
const archivedAttendanceList = byId("archivedAttendanceList");
const archivedFileList = byId("archivedFileList");


// ---------- What the user is doing ----------

let editingSessionId = null;   // session being edited, or null when adding
let editingRecordId = null;    // attendance record being edited, or null
let selectedSessionId = null;  // session whose attendance and files are shown

let currentSessions = [];      // last data loaded, so we can redraw it
let currentAttendance = null;  // in another language without reloading
let currentFiles = null;
let photoLinks = {};           // storage path → temporary link to show a photo
let archivedSessions = null;
let archivedAttendance = null;
let archivedFiles = null;

let isAdmin = false;           // administrators can archive, restore, delete
let recoveryMode = false;      // true after clicking the link in a reset email


// =====================================================================
// LANGUAGE
// =====================================================================

let currentLanguage = "pt";

// Get a piece of text in the current language
function t(key) {
    return TRANSLATIONS[currentLanguage][key] || key;
}

// Text with {placeholders} filled in, e.g. fill("uploading", { i: 1, n: 3 })
function fill(key, values) {
    let text = t(key);
    Object.keys(values).forEach(function(name) {
        text = text.split("{" + name + "}").join(values[name]);
    });
    return text;
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
    updateChosenFiles();

    document.querySelectorAll("[data-toggle]").forEach(function(button) {
        const input = byId(button.dataset.toggle);
        button.textContent = input.type === "password" ? t("show") : t("hide");
    });

    [signInMessage, signUpMessage, forgotMessage, resetMessage, sessionMessage,
     attendanceMessage, uploadMessage, archiveMessage].forEach(function(message) {
        message.textContent = "";
    });

    // Redraw lists in the new language
    drawSessions();
    if (currentAttendance) {
        drawAttendance();
    }
    if (currentFiles) {
        drawFiles();
    }
    if (archivedSessions) {
        drawArchive();
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

function makeText(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    return element;
}

// 2026-10-21T08:47:00+00:00 → "2026-10-21 10:47" (in the viewer's own time zone)
function formatTime(timestamp) {
    if (!timestamp) {
        return "";
    }
    const d = new Date(timestamp);
    function two(n) { return String(n).padStart(2, "0"); }
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

// "Last edited by Maria · 2026-10-21 10:47"
function editedText(name, time) {
    if (!time) {
        return "";
    }
    return fill("editedBy", { name: name || "—", time: formatTime(time) });
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

signInTab.addEventListener("click", function() {
    showAuthPanel(signInForm);
});

signUpTab.addEventListener("click", function() {
    showAuthPanel(signUpForm);
});

forgotLink.addEventListener("click", function() {
    byId("forgotEmail").value = byId("signInEmail").value;
    forgotMessage.textContent = "";
    showAuthPanel(forgotForm);
});

backToSignIn.addEventListener("click", function() {
    showAuthPanel(signInForm);
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

function hideDataAreas() {
    appArea.hidden = true;
    recordsArea.hidden = true;
    filesArea.hidden = true;
    archiveArea.hidden = true;
}

// Decide what to show: sign-in form, new password, "pending approval",
// or the system
async function showScreenFor(session) {

    if (!session) {
        recoveryMode = false;
        authArea.hidden = false;
        resetForm.hidden = true;
        pendingArea.hidden = true;
        hideDataAreas();
        userBar.hidden = true;
        isAdmin = false;
        selectedSessionId = null;
        currentAttendance = null;
        archivedSessions = null;
        archivedAttendance = null;
        archivedFiles = null;
        attendanceList.innerHTML = "";
        attendanceHint.hidden = false;
        clearFiles();
        return;
    }

    // Came from the reset-password email: only ask for the new password
    if (recoveryMode) {
        authArea.hidden = true;
        pendingArea.hidden = true;
        hideDataAreas();
        userBar.hidden = true;
        resetForm.hidden = false;
        byId("resetPassword").focus();
        return;
    }

    resetForm.hidden = true;

    // RPC: get_my_profile → name and whether the account is approved
    const { data, error } = await supabaseClient.rpc("get_my_profile");

    const profile = (data && data[0]) || { display_name: "", approved: false };

    userName.textContent = profile.display_name || session.user.email;
    userBar.hidden = false;
    authArea.hidden = true;

    if (error || !profile.approved) {
        pendingArea.hidden = false;
        hideDataAreas();
        adminBadge.hidden = true;
        return;
    }

    isAdmin = profile.is_admin === true;
    adminBadge.hidden = !isAdmin;

    pendingArea.hidden = true;
    appArea.hidden = false;
    recordsArea.hidden = false;
    filesArea.hidden = false;
    archiveArea.hidden = !isAdmin;

    loadSessions();
    if (isAdmin) {
        loadArchive();
    }
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
    showMessage(resetMessage, "", "");

    const { data } = await supabaseClient.auth.getSession();
    await showScreenFor(data.session);
    showMessage(sessionMessage, t("passwordUpdated"), "success");
});

signOutButton.addEventListener("click", async function() {
    await supabaseClient.auth.signOut();
});

checkAgainButton.addEventListener("click", async function() {
    const { data } = await supabaseClient.auth.getSession();
    showScreenFor(data.session);
});

// Runs on page load and whenever the user signs in or out.
// "PASSWORD_RECOVERY" means the page was opened from a reset email.
// setTimeout lets Supabase finish its own work before we call it again.
supabaseClient.auth.onAuthStateChange(function(event, session) {
    if (event === "PASSWORD_RECOVERY") {
        recoveryMode = true;
    }
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
        sessionList.appendChild(makeText("p", "empty", t("noSessions")));
    }

    currentSessions.forEach(function(session) {

        const item = document.createElement("div");
        item.className = "item";
        if (session.id === selectedSessionId) {
            item.classList.add("selected");
        }

        const main = document.createElement("div");
        main.className = "item-main";

        let subText = session.session_date + " · " + session.location;
        if (session.file_count > 0) {
            subText += " · " + fill("filesCount", { n: session.file_count });
        }

        main.appendChild(makeText("p", "item-title", session.session_name));
        main.appendChild(makeText("p", "item-sub", subText));
        main.appendChild(makeText("p", "item-meta",
            editedText(session.last_edited_by, session.last_edited_at)));

        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.appendChild(makeButton(t("view"), function() {
            selectSession(session.id);
        }));
        actions.appendChild(makeButton(t("edit"), function() {
            startEditSession(session);
        }));
        if (isAdmin) {
            const archiveButton = makeButton(t("archive"), function() {
                archiveSession(session);
            });
            archiveButton.className = "muted-button";
            actions.appendChild(archiveButton);
        }

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

    updateFilesHeading();
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

    const changed = selectedSessionId !== Number(sessionId);

    selectedSessionId = Number(sessionId);
    attendanceSession.value = selectedSessionId;

    drawSessions();
    await loadAttendance(selectedSessionId);

    if (changed || !currentFiles) {
        uploadMessage.textContent = "";
        await loadFiles(selectedSessionId);
    }
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
        attendanceList.appendChild(makeText("p", "empty", t("noAttendance")));
        return;
    }

    currentAttendance.forEach(function(record) {

        const item = document.createElement("div");
        item.className = "item";

        const main = document.createElement("div");
        main.className = "item-main";

        const title = makeText("p", "item-title", record.participant_name);

        const status = document.createElement("span");
        status.className = "status " + record.attendance_status;
        status.textContent = record.attendance_status === "Present" ? t("present") : t("absent");
        title.appendChild(status);

        main.appendChild(title);

        // This line comes from the OTHER table (training_sessions)
        main.appendChild(makeText("p", "item-sub",
            record.session_name + " · " + record.session_date + " · " + record.location));

        main.appendChild(makeText("p", "item-meta",
            editedText(record.last_edited_by, record.last_edited_at)));

        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.appendChild(makeButton(t("edit"), function() {
            startEditRecord(record);
        }));
        if (isAdmin) {
            const archiveButton = makeButton(t("archive"), function() {
                archiveRecord(record);
            });
            archiveButton.className = "muted-button";
            actions.appendChild(archiveButton);
        }

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


// =====================================================================
// PHOTOS AND DOCUMENTS (Supabase Storage)
// 1. The file is uploaded to the private bucket "session-files",
//    in the folder of its session: session-<id>/...
// 2. RPC add_session_file records it in the table session_files.
// Photos are shown, and files downloaded, through temporary signed
// links that only work for signed-in approved staff and expire.
// =====================================================================

// File types the bucket accepts. Some computers do not tell the browser
// the type of a file, so it is also worked out from the file name.
const TYPE_BY_EXTENSION = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    webp: "image/webp", gif: "image/gif",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv"
};

function extensionOf(fileName) {
    const parts = fileName.toLowerCase().split(".");
    return parts.length > 1 ? parts.pop() : "";
}

function fileTypeOf(file) {
    const fromName = TYPE_BY_EXTENSION[extensionOf(file.name)];
    const allowed = Object.values(TYPE_BY_EXTENSION);
    if (file.type && allowed.indexOf(file.type) !== -1) {
        return file.type;
    }
    return fromName || null;
}

function isPhoto(file) {
    return (file.mime_type || "").indexOf("image/") === 0;
}

// Phone photos are often 4–8 MB. Make big photos smaller (max 1920 px,
// JPEG) before uploading: faster on mobile data, still good quality.
function shrinkPhoto(file, type) {

    const canShrink = ["image/jpeg", "image/png", "image/webp"].indexOf(type) !== -1;

    if (!canShrink || file.size < 1.5 * 1024 * 1024) {
        return Promise.resolve({ blob: file, name: file.name, type: type });
    }

    return new Promise(function(resolve) {

        const image = new Image();
        const url = URL.createObjectURL(file);

        image.onload = function() {
            const scale = Math.min(1, 1920 / Math.max(image.width, image.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(image.width * scale);
            canvas.height = Math.round(image.height * scale);
            canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);

            canvas.toBlob(function(blob) {
                if (!blob || blob.size >= file.size) {
                    resolve({ blob: file, name: file.name, type: type });
                    return;
                }
                const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
                resolve({ blob: blob, name: newName, type: "image/jpeg" });
            }, "image/jpeg", 0.85);
        };

        image.onerror = function() {
            URL.revokeObjectURL(url);
            resolve({ blob: file, name: file.name, type: type });
        };

        image.src = url;
    });
}

function updateChosenFiles() {
    const count = fileInput.files ? fileInput.files.length : 0;
    chosenFiles.textContent = count > 0 ? fill("chosenCount", { n: count }) : "";
}

fileInput.addEventListener("change", function() {
    updateChosenFiles();
    uploadMessage.textContent = "";
});

function updateFilesHeading() {
    const session = currentSessions.find(function(s) {
        return s.id === selectedSessionId;
    });
    filesSessionName.textContent = session ? " — " + session.session_name : "";
}

function clearFiles() {
    currentFiles = null;
    photoLinks = {};
    photoGrid.innerHTML = "";
    documentList.innerHTML = "";
    filesSessionName.textContent = "";
    filesContent.hidden = true;
    filesHint.hidden = false;
    uploadForm.reset();
    updateChosenFiles();
}

// Read the files of one session (RPC: get_session_files),
// then ask Storage for temporary links to show the photos
async function loadFiles(sessionId) {

    const { data, error } = await supabaseClient.rpc("get_session_files", {
        p_training_session_id: sessionId
    });

    if (error) {
        showError(uploadMessage, error);
        return;
    }

    photoLinks = {};
    const photoPaths = data.filter(isPhoto).map(function(file) {
        return file.storage_path;
    });

    if (photoPaths.length > 0) {
        const links = await supabaseClient.storage
            .from(FILE_BUCKET)
            .createSignedUrls(photoPaths, 60 * 60);   // valid for 1 hour

        if (links.data) {
            links.data.forEach(function(link) {
                if (link.signedUrl) {
                    photoLinks[link.path] = link.signedUrl;
                }
            });
        }
    }

    currentFiles = data;
    drawFiles();
}

function drawFiles() {

    filesHint.hidden = true;
    filesContent.hidden = false;
    updateFilesHeading();

    photoGrid.innerHTML = "";
    documentList.innerHTML = "";

    const photos = currentFiles.filter(isPhoto);
    const documents = currentFiles.filter(function(file) { return !isPhoto(file); });

    if (photos.length === 0) {
        photoGrid.appendChild(makeText("p", "empty", t("noPhotos")));
    }

    photos.forEach(function(file) {

        const card = document.createElement("figure");
        card.className = "photo";

        const link = document.createElement("a");
        link.href = photoLinks[file.storage_path] || "#";
        link.target = "_blank";
        link.rel = "noopener";
        link.title = t("openPhoto");

        const image = document.createElement("img");
        image.src = photoLinks[file.storage_path] || "";
        image.alt = file.caption || file.file_name;
        image.loading = "lazy";
        link.appendChild(image);
        card.appendChild(link);

        const text = document.createElement("figcaption");
        if (file.caption) {
            text.appendChild(makeText("p", "item-title", file.caption));
        }
        text.appendChild(makeText("p", "item-meta",
            fill("uploadedBy", { name: file.uploaded_by || "—", time: formatTime(file.uploaded_at) })));

        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.appendChild(makeButton(t("download"), function() {
            downloadFile(file, uploadMessage);
        }));
        if (isAdmin) {
            const archiveButton = makeButton(t("archive"), function() {
                archiveFile(file);
            });
            archiveButton.className = "muted-button";
            actions.appendChild(archiveButton);
        }
        text.appendChild(actions);

        card.appendChild(text);
        photoGrid.appendChild(card);
    });

    if (documents.length === 0) {
        documentList.appendChild(makeText("p", "empty", t("noDocuments")));
    }

    documents.forEach(function(file) {

        const item = document.createElement("div");
        item.className = "item";

        const main = document.createElement("div");
        main.className = "item-main doc-main";

        const icon = makeText("span", "doc-icon", extensionOf(file.file_name).toUpperCase() || "FILE");
        main.appendChild(icon);

        const words = document.createElement("div");
        words.className = "doc-words";
        words.appendChild(makeText("p", "item-title", file.file_name));

        let sub = formatSize(file.size_bytes);
        if (file.caption) {
            sub = file.caption + " · " + sub;
        }
        words.appendChild(makeText("p", "item-sub", sub));
        words.appendChild(makeText("p", "item-meta",
            fill("uploadedBy", { name: file.uploaded_by || "—", time: formatTime(file.uploaded_at) })));
        main.appendChild(words);

        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.appendChild(makeButton(t("download"), function() {
            downloadFile(file, uploadMessage);
        }));
        if (isAdmin) {
            const archiveButton = makeButton(t("archive"), function() {
                archiveFile(file);
            });
            archiveButton.className = "muted-button";
            actions.appendChild(archiveButton);
        }

        item.appendChild(main);
        item.appendChild(actions);
        documentList.appendChild(item);
    });
}

// Download: Storage gives a link that works for 60 seconds and saves
// the file under its original name
async function downloadFile(file, messageElement) {

    const { data, error } = await supabaseClient.storage
        .from(FILE_BUCKET)
        .createSignedUrl(file.storage_path, 60, { download: file.file_name });

    if (error) {
        showError(messageElement, error);
        return;
    }

    const link = document.createElement("a");
    link.href = data.signedUrl;
    link.download = file.file_name;
    document.body.appendChild(link);
    link.click();
    link.remove();
}

// Upload the chosen files one by one
uploadForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const sessionId = selectedSessionId;
    const files = Array.from(fileInput.files || []);
    const caption = fileCaption.value.trim();

    if (!sessionId) {
        return;
    }

    if (files.length === 0) {
        showMessage(uploadMessage, t("noFilesChosen"), "error");
        return;
    }

    uploadButton.disabled = true;
    const problems = [];
    let uploaded = 0;

    for (let i = 0; i < files.length; i++) {

        const file = files[i];
        showMessage(uploadMessage, fill("uploading", { i: i + 1, n: files.length }), "");

        const type = fileTypeOf(file);
        if (!type) {
            problems.push(fill("fileTypeNotAllowed", { name: file.name }));
            continue;
        }

        const ready = await shrinkPhoto(file, type);

        if (ready.blob.size > MAX_FILE_BYTES) {
            problems.push(fill("fileTooBig", { name: file.name }));
            continue;
        }

        // A unique, safe name for storage; the real name goes in the table
        const path = "session-" + sessionId + "/" + Date.now() + "-" +
            Math.random().toString(36).slice(2, 8) + "." + (extensionOf(ready.name) || "bin");

        const stored = await supabaseClient.storage
            .from(FILE_BUCKET)
            .upload(path, ready.blob, { contentType: ready.type, upsert: false });

        if (stored.error) {
            problems.push(file.name + ": " + stored.error.message);
            continue;
        }

        // RPC: add_session_file → INSERT into session_files
        const recorded = await supabaseClient.rpc("add_session_file", {
            p_training_session_id: sessionId,
            p_storage_path: path,
            p_file_name: ready.name,
            p_mime_type: ready.type,
            p_size_bytes: ready.blob.size,
            p_caption: caption
        });

        if (recorded.error) {
            problems.push(file.name + ": " + recorded.error.message);
            continue;
        }

        uploaded++;
    }

    uploadButton.disabled = false;
    uploadForm.reset();
    updateChosenFiles();

    if (selectedSessionId === sessionId) {
        await loadFiles(sessionId);
    }
    await loadSessions();

    let text = uploaded > 0 ? fill("uploadDone", { n: uploaded }) : "";
    if (problems.length > 0) {
        text += (text ? " " : "") + t("error") + ": " + problems.join(" · ");
    }
    showMessage(uploadMessage, text, problems.length > 0 ? "error" : "success");
});


// =====================================================================
// ARCHIVE — administrators only
// The database also checks is_admin(), so these buttons are not the
// only protection: a normal staff member would get an error.
// =====================================================================

// Archive a session (RPC: archive_training_session)
async function archiveSession(session) {

    archiveMessage.textContent = "";

    const { error } = await supabaseClient.rpc("archive_training_session", {
        p_id: session.id
    });

    if (error) {
        showError(sessionMessage, error);
        return;
    }

    if (editingSessionId === session.id) {
        stopEditSession();
    }

    // If its attendance and files were on screen, clear them
    if (selectedSessionId === session.id) {
        selectedSessionId = null;
        currentAttendance = null;
        attendanceList.innerHTML = "";
        attendanceHint.hidden = false;
        stopEditRecord();
        clearFiles();
    }

    await loadSessions();
    await loadArchive();
    showMessage(sessionMessage, t("archivedMsg"), "success");
}

// Archive one attendance record (RPC: archive_attendance_record)
async function archiveRecord(record) {

    archiveMessage.textContent = "";

    const { error } = await supabaseClient.rpc("archive_attendance_record", {
        p_id: record.id
    });

    if (error) {
        showError(attendanceMessage, error);
        return;
    }

    if (editingRecordId === record.id) {
        stopEditRecord();
    }

    await loadAttendance(selectedSessionId);
    await loadArchive();
    showMessage(attendanceMessage, t("archivedMsg"), "success");
}

// Archive one photo or document (RPC: archive_session_file)
async function archiveFile(file) {

    archiveMessage.textContent = "";

    const { error } = await supabaseClient.rpc("archive_session_file", {
        p_id: file.id
    });

    if (error) {
        showError(uploadMessage, error);
        return;
    }

    if (selectedSessionId) {
        await loadFiles(selectedSessionId);
    }
    await loadSessions();
    await loadArchive();
    showMessage(uploadMessage, t("archivedMsg"), "success");
}

// Read the three archive lists
// (RPC: get_archived_sessions, get_archived_attendance, get_archived_files)
async function loadArchive() {

    const sessionsResult = await supabaseClient.rpc("get_archived_sessions");
    const attendanceResult = await supabaseClient.rpc("get_archived_attendance");
    const filesResult = await supabaseClient.rpc("get_archived_files");

    const error = sessionsResult.error || attendanceResult.error || filesResult.error;
    if (error) {
        showError(archiveMessage, error);
        return;
    }

    archivedSessions = sessionsResult.data;
    archivedAttendance = attendanceResult.data;
    archivedFiles = filesResult.data;
    drawArchive();
}

function archiveItem(titleText, subText, onRestore, onDelete, onDownload) {

    const item = document.createElement("div");
    item.className = "item";

    const main = document.createElement("div");
    main.className = "item-main";
    main.appendChild(makeText("p", "item-title", titleText));
    main.appendChild(makeText("p", "item-sub", subText));

    const actions = document.createElement("div");
    actions.className = "item-actions";
    if (onDownload) {
        actions.appendChild(makeButton(t("download"), onDownload));
    }
    actions.appendChild(makeButton(t("restore"), onRestore));

    const deleteButton = makeButton(t("delete"), onDelete);
    deleteButton.className = "danger";
    actions.appendChild(deleteButton);

    item.appendChild(main);
    item.appendChild(actions);
    return item;
}

function emptyMessage() {
    return makeText("p", "empty", t("noArchived"));
}

function drawArchive() {

    archivedSessionList.innerHTML = "";
    archivedAttendanceList.innerHTML = "";
    archivedFileList.innerHTML = "";

    if (archivedSessions.length === 0) {
        archivedSessionList.appendChild(emptyMessage());
    }

    archivedSessions.forEach(function(session) {
        const sub =
            session.session_date + " · " + session.location + " · " +
            fill("recordsCount", { n: session.attendance_count }) + " · " +
            fill("filesCount", { n: session.file_count }) + " · " +
            t("archivedOn") + " " + session.archived_at.slice(0, 10);

        archivedSessionList.appendChild(archiveItem(
            session.session_name,
            sub,
            function() { restoreSession(session); },
            function() { deleteSession(session); }
        ));
    });

    if (archivedAttendance.length === 0) {
        archivedAttendanceList.appendChild(emptyMessage());
    }

    archivedAttendance.forEach(function(record) {
        const status = record.attendance_status === "Present" ? t("present") : t("absent");
        const sub =
            record.session_name + " · " + record.session_date + " · " + status + " · " +
            t("archivedOn") + " " + record.archived_at.slice(0, 10);

        archivedAttendanceList.appendChild(archiveItem(
            record.participant_name,
            sub,
            function() { restoreRecord(record); },
            function() { deleteRecord(record); }
        ));
    });

    if (archivedFiles.length === 0) {
        archivedFileList.appendChild(emptyMessage());
    }

    archivedFiles.forEach(function(file) {
        const sub =
            file.session_name + " · " + file.session_date + " · " + formatSize(file.size_bytes) + " · " +
            t("archivedOn") + " " + file.archived_at.slice(0, 10);

        archivedFileList.appendChild(archiveItem(
            file.file_name,
            sub,
            function() { restoreFile(file); },
            function() { deleteFile(file); },
            function() { downloadFile(file, archiveMessage); }
        ));
    });
}

// Restore (RPC: restore_training_session / restore_attendance_record /
// restore_session_file)
async function restoreSession(session) {

    const { error } = await supabaseClient.rpc("restore_training_session", {
        p_id: session.id
    });

    if (error) {
        showError(archiveMessage, error);
        return;
    }

    await loadSessions();
    await loadArchive();
    showMessage(archiveMessage, t("restoredMsg"), "success");
}

async function restoreRecord(record) {

    const { error } = await supabaseClient.rpc("restore_attendance_record", {
        p_id: record.id
    });

    if (error) {
        showError(archiveMessage, error);
        return;
    }

    if (selectedSessionId) {
        await loadAttendance(selectedSessionId);
    }
    await loadArchive();
    showMessage(archiveMessage, t("restoredMsg"), "success");
}

async function restoreFile(file) {

    const { error } = await supabaseClient.rpc("restore_session_file", {
        p_id: file.id
    });

    if (error) {
        showError(archiveMessage, error);
        return;
    }

    if (selectedSessionId) {
        await loadFiles(selectedSessionId);
    }
    await loadSessions();
    await loadArchive();
    showMessage(archiveMessage, t("restoredMsg"), "success");
}

// Remove files from the Storage bucket (administrators only)
async function removeStoredFiles(paths) {
    if (!paths || paths.length === 0) {
        return null;
    }
    const { error } = await supabaseClient.storage.from(FILE_BUCKET).remove(paths);
    return error;
}

// Delete for good, after confirmation
// (RPC: delete_training_session / delete_attendance_record /
// delete_session_file — then the files are removed from Storage)
async function deleteSession(session) {

    const question = fill("confirmDeleteSession", {
        name: session.session_name,
        n: session.attendance_count,
        f: session.file_count
    });

    if (!window.confirm(question)) {
        return;
    }

    const { data, error } = await supabaseClient.rpc("delete_training_session", {
        p_id: session.id
    });

    if (error) {
        showError(archiveMessage, error);
        return;
    }

    const storageError = await removeStoredFiles(data);

    await loadArchive();

    if (storageError) {
        showError(archiveMessage, storageError);
        return;
    }
    showMessage(archiveMessage, t("deletedMsg"), "success");
}

async function deleteRecord(record) {

    const question = fill("confirmDeleteRecord", { name: record.participant_name });

    if (!window.confirm(question)) {
        return;
    }

    const { error } = await supabaseClient.rpc("delete_attendance_record", {
        p_id: record.id
    });

    if (error) {
        showError(archiveMessage, error);
        return;
    }

    await loadArchive();
    showMessage(archiveMessage, t("deletedMsg"), "success");
}

async function deleteFile(file) {

    const question = fill("confirmDeleteFile", { name: file.file_name });

    if (!window.confirm(question)) {
        return;
    }

    const { data, error } = await supabaseClient.rpc("delete_session_file", {
        p_id: file.id
    });

    if (error) {
        showError(archiveMessage, error);
        return;
    }

    const storageError = await removeStoredFiles([data]);

    await loadArchive();

    if (storageError) {
        showError(archiveMessage, storageError);
        return;
    }
    showMessage(archiveMessage, t("deletedMsg"), "success");
}


// ---------- Start ----------
setLanguage(startingLanguage());
