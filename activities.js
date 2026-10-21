// =====================================================================
// Part 2 of 3: ACTIVITIES
// An activity is a training, distribution, health campaign, ... It is
// stored in the table training_sessions and follows the approval
// workflow:  planned → submitted → verified → approved
// Each activity has attendance records (one-to-many) and photos and
// documents in Supabase Storage (one-to-many).
// =====================================================================

const FILE_BUCKET = "session-files";
const MAX_FILE_BYTES = 10 * 1024 * 1024;    // 10 MB, same limit as the bucket

const ACTIVITY_TYPES = ["training", "distribution", "health", "education", "relief",
                        "environment", "volunteer", "meeting", "other"];
const WORKFLOW = ["planned", "submitted", "verified", "approved"];


// ---------- Page elements ----------

const sessionTab = byId("sessionTab");
const attendanceTab = byId("attendanceTab");

const sessionForm = byId("sessionForm");
const sessionFormTitle = byId("sessionFormTitle");
const sessionName = byId("sessionName");
const activityType = byId("activityType");
const sessionDate = byId("sessionDate");
const activityDepartment = byId("activityDepartment");
const activityProject = byId("activityProject");
const activityLocation = byId("activityLocation");
const sessionLocation = byId("sessionLocation");
const plannedParticipants = byId("plannedParticipants");
const activityObjectives = byId("activityObjectives");
const activityResults = byId("activityResults");
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

const activitySearch = byId("activitySearch");
const activityFilterStatus = byId("activityFilterStatus");
const activityFilterDepartment = byId("activityFilterDepartment");
const sessionList = byId("sessionList");

const activityDetail = byId("activityDetail");
const detailKicker = byId("detailKicker");
const detailTitle = byId("detailTitle");
const detailMeta = byId("detailMeta");
const detailStatus = byId("detailStatus");
const detailFacts = byId("detailFacts");
const workflowSteps = byId("workflowSteps");
const workflowActions = byId("workflowActions");
const workflowMessage = byId("workflowMessage");
const returnNote = byId("returnNote");

const attendanceList = byId("attendanceList");
const attendanceHint = byId("attendanceHint");

const filesHint = byId("filesHint");
const filesContent = byId("filesContent");
const uploadForm = byId("uploadForm");
const fileInput = byId("fileInput");
const fileCaption = byId("fileCaption");
const chosenFiles = byId("chosenFiles");
const uploadButton = byId("uploadButton");
const uploadMessage = byId("uploadMessage");
const photoGrid = byId("photoGrid");
const documentList = byId("documentList");

const archiveArea = byId("archiveArea");
const archiveMessage = byId("archiveMessage");
const archivedSessionList = byId("archivedSessionList");
const archivedAttendanceList = byId("archivedAttendanceList");
const archivedFileList = byId("archivedFileList");


// ---------- What the user is doing ----------

let editingSessionId = null;   // activity being edited, or null when adding
let editingRecordId = null;    // attendance record being edited, or null
let selectedSessionId = null;  // activity shown in the detail panel

let currentSessions = [];
let currentAttendance = null;
let currentFiles = null;
let photoLinks = {};           // storage path → temporary link to show a photo
let archivedSessions = null;
let archivedAttendance = null;
let archivedFiles = null;


function selectedSession() {
    return currentSessions.find(function(s) { return s.id === selectedSessionId; }) || null;
}

// Can this activity still be edited? (only while planned; admins always)
function canEditActivity(session) {
    return session.workflow_status === "planned" || isAdmin;
}

// Can attendance still change? (not once approved; admins always)
function attendanceOpen(session) {
    return session.workflow_status !== "approved" || isAdmin;
}

function activityPlace(session) {
    return [session.location, session.location_path].filter(Boolean).join(" · ");
}


// =====================================================================
// DROPDOWNS
// =====================================================================

function fillActivityDropdowns() {

    fillSelect(activityType, ACTIVITY_TYPES, {
        value: function(k) { return k; },
        label: function(k) { return t("type_" + k); }
    });

    fillDepartmentSelect(activityDepartment);
    fillLocationSelect(activityLocation);

    fillSelect(activityProject, lookups.projects.filter(function(p) {
        return p.status === "planned" || p.status === "active" || String(p.id) === activityProject.value;
    }), {
        empty: t("noneChosen"),
        value: function(p) { return p.id; },
        label: function(p) { return (p.code ? p.code + " · " : "") + p.name; }
    });

    fillSelect(activityFilterStatus, WORKFLOW, {
        empty: t("all"),
        value: function(k) { return k; },
        label: function(k) { return t("wf_" + k); }
    });

    fillDepartmentSelect(activityFilterDepartment, "all");
}

lookupHooks.push(fillActivityDropdowns);

// Choosing a project fills in its department and location
activityProject.addEventListener("change", function() {
    const project = lookups.projects.find(function(p) {
        return String(p.id) === activityProject.value;
    });
    if (project) {
        if (project.department_id && !activityDepartment.value) {
            activityDepartment.value = project.department_id;
        }
        if (project.location_id && !activityLocation.value) {
            activityLocation.value = project.location_id;
        }
    }
});

sessionTab.addEventListener("click", function() {
    switchTab(sessionTab, attendanceTab, sessionForm, attendanceForm);
});

attendanceTab.addEventListener("click", function() {
    switchTab(attendanceTab, sessionTab, attendanceForm, sessionForm);
});


// =====================================================================
// ACTIVITY LIST
// =====================================================================

// Read all activities (RPC: get_training_sessions)
async function loadSessions() {

    const { data, error } = await supabaseClient.rpc("get_training_sessions");

    if (error) {
        showError(sessionMessage, error);
        return;
    }

    currentSessions = data;
    drawSessions();

    if (selectedSessionId && !selectedSession()) {
        closeDetail();
    } else if (selectedSessionId) {
        drawDetail();
    }
}

function matchesFilters(session) {
    const search = activitySearch.value.trim().toLowerCase();
    if (activityFilterStatus.value && session.workflow_status !== activityFilterStatus.value) {
        return false;
    }
    if (activityFilterDepartment.value && String(session.department_id) !== activityFilterDepartment.value) {
        return false;
    }
    if (search) {
        const text = [session.session_name, session.location, session.location_path,
                      session.project_name, departmentName(session, "department_")]
            .join(" ").toLowerCase();
        if (text.indexOf(search) === -1) {
            return false;
        }
    }
    return true;
}

[activitySearch, activityFilterStatus, activityFilterDepartment].forEach(function(input) {
    input.addEventListener("input", drawSessions);
});

function statusBadge(status) {
    return makeText("span", "wf-badge wf-" + status, t("wf_" + status));
}

// Show the activities in the list and in the attendance dropdown
function drawSessions() {

    sessionList.innerHTML = "";

    // Attendance can only be added to open activities
    fillSelect(attendanceSession, currentSessions.filter(attendanceOpen), {
        empty: t("selectSession"),
        value: function(s) { return s.id; },
        label: function(s) { return s.session_name + " (" + s.session_date + ")"; }
    });
    if (selectedSessionId && !editingRecordId) {
        attendanceSession.value = selectedSessionId;
    }

    const shown = currentSessions.filter(matchesFilters);

    if (shown.length === 0) {
        sessionList.appendChild(emptyText("noSessions"));
    }

    shown.forEach(function(session) {

        const item = document.createElement("div");
        item.className = "item";
        if (session.id === selectedSessionId) {
            item.classList.add("selected");
        }

        const main = document.createElement("div");
        main.className = "item-main";

        const title = makeText("p", "item-title", session.session_name);
        title.appendChild(statusBadge(session.workflow_status));
        main.appendChild(title);

        let sub = t("type_" + session.activity_type) + " · " + session.session_date;
        const place = activityPlace(session);
        if (place) {
            sub += " · " + place;
        }
        main.appendChild(makeText("p", "item-sub", sub));

        const extra = [];
        if (session.department_id) {
            extra.push(departmentName(session, "department_"));
        }
        extra.push(fill("presentCount", { n: session.present_count }));
        if (session.file_count > 0) {
            extra.push(fill("filesCount", { n: session.file_count }));
        }
        main.appendChild(makeText("p", "item-sub", extra.join(" · ")));
        main.appendChild(makeText("p", "item-meta",
            editedText(session.last_edited_by, session.last_edited_at)));

        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.appendChild(makeButton(t("view"), function() {
            selectSession(session.id, true);
        }));
        if (canEditActivity(session)) {
            actions.appendChild(makeButton(t("edit"), function() {
                startEditSession(session);
            }));
        }
        if (isAdmin) {
            actions.appendChild(makeButton(t("archive"), function() {
                archiveSession(session);
            }, "muted-button"));
        }

        item.appendChild(main);
        item.appendChild(actions);
        sessionList.appendChild(item);
    });
}


// =====================================================================
// ACTIVITY FORM: add (INSERT) or edit (UPDATE)
// =====================================================================

function updateSessionFormText() {
    const editing = editingSessionId !== null;
    sessionFormTitle.textContent = editing ? t("sessionEditTitle") : t("sessionAddTitle");
    sessionSubmit.textContent = editing ? t("update") : t("save");
    sessionCancel.hidden = !editing;
}

function startEditSession(session) {

    editingSessionId = session.id;

    sessionName.value = session.session_name;
    activityType.value = session.activity_type;
    sessionDate.value = session.session_date;
    activityDepartment.value = session.department_id || "";
    activityProject.value = session.project_id || "";
    activityLocation.value = session.location_id || "";
    sessionLocation.value = session.location || "";
    plannedParticipants.value = session.planned_participants === null ? "" : session.planned_participants;
    activityObjectives.value = session.objectives || "";
    activityResults.value = session.results || "";

    updateSessionFormText();
    sessionMessage.textContent = "";

    switchTab(sessionTab, attendanceTab, sessionForm, attendanceForm);
    sessionForm.scrollIntoView({ behavior: "smooth", block: "start" });
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

sessionForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    if (!activityLocation.value && !sessionLocation.value.trim()) {
        showMessage(sessionMessage, t("needPlace"), "error");
        return;
    }

    const values = {
        p_session_name: sessionName.value,
        p_session_date: sessionDate.value,
        p_location: sessionLocation.value,
        p_activity_type: activityType.value,
        p_department_id: numberOrNull(activityDepartment.value),
        p_project_id: numberOrNull(activityProject.value),
        p_location_id: numberOrNull(activityLocation.value),
        p_planned_participants: numberOrNull(plannedParticipants.value),
        p_objectives: activityObjectives.value,
        p_results: activityResults.value
    };

    let result;
    const wasEditing = editingSessionId !== null;

    if (!wasEditing) {
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

    stopEditSession();
    await loadSessions();

    // A new activity is opened straight away, ready for attendance and files
    if (!wasEditing && result.data) {
        await selectSession(result.data, false);
    }

    showMessage(sessionMessage, wasEditing ? t("updated") : t("saved"), "success");
});


// =====================================================================
// SELECTED ACTIVITY: details and approval workflow
// =====================================================================

async function selectSession(sessionId, scroll) {

    const changed = selectedSessionId !== Number(sessionId);

    selectedSessionId = Number(sessionId);

    drawSessions();
    drawDetail();

    if (scroll) {
        activityDetail.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    await loadAttendance(selectedSessionId);

    if (changed || !currentFiles) {
        uploadMessage.textContent = "";
        await loadFiles(selectedSessionId);
    }
}

function closeDetail() {
    selectedSessionId = null;
    currentAttendance = null;
    activityDetail.hidden = true;
    attendanceList.innerHTML = "";
    attendanceHint.hidden = false;
    stopEditRecord();
    clearFiles();
}

function addFact(label, value) {
    if (value === null || value === undefined || value === "") {
        return;
    }
    detailFacts.appendChild(makeText("dt", "", label));
    detailFacts.appendChild(makeText("dd", "", String(value)));
}

function drawDetail() {

    const s = selectedSession();
    if (!s) {
        return;
    }

    activityDetail.hidden = false;

    detailKicker.textContent = t("type_" + s.activity_type).toUpperCase() +
        (s.department_id ? " · " + departmentName(s, "department_").toUpperCase() : "");
    detailTitle.textContent = s.session_name;
    detailMeta.textContent = [s.session_date, activityPlace(s)].filter(Boolean).join(" · ");
    detailStatus.className = "wf-badge big wf-" + s.workflow_status;
    detailStatus.textContent = t("wf_" + s.workflow_status);

    // Facts
    detailFacts.innerHTML = "";
    addFact(t("project"), s.project_name);
    addFact(t("province"), s.province);
    addFact(t("plannedParticipants"), s.planned_participants);
    const total = Number(s.present_count) + Number(s.absent_count);
    addFact(t("present"), s.present_count + (total ? " / " + total : ""));
    if (s.planned_participants) {
        addFact(t("reach"), Math.round(100 * s.present_count / s.planned_participants) + "%");
    }
    addFact(t("objectives"), s.objectives);
    addFact(t("results"), s.results);

    // Workflow steps: who did each step, and when
    workflowSteps.innerHTML = "";
    const reached = WORKFLOW.indexOf(s.workflow_status);
    const people = {
        planned: [s.last_edited_by, null],
        submitted: [s.submitted_by, s.submitted_at],
        verified: [s.verified_by, s.verified_at],
        approved: [s.approved_by, s.approved_at]
    };
    WORKFLOW.forEach(function(step, index) {
        const li = document.createElement("li");
        li.className = index < reached ? "done" : (index === reached ? "current" : "");
        li.appendChild(makeText("span", "step-name", t("wf_" + step)));
        if (index <= reached && index > 0 && people[step][1]) {
            li.appendChild(makeText("span", "step-who",
                (people[step][0] || "—") + " · " + formatTime(people[step][1])));
        }
        workflowSteps.appendChild(li);
    });

    returnNote.hidden = !s.return_note || s.workflow_status !== "planned";
    returnNote.textContent = s.return_note ? t("returnNote") + ": " + s.return_note : "";

    // Buttons for the next step, depending on status and role
    workflowActions.innerHTML = "";

    if (s.workflow_status === "planned") {
        workflowActions.appendChild(makeButton(t("submitAction"), function() {
            workflowStep("submit_activity", s, t("submittedMsg"));
        }, "strong"));
    }
    if (s.workflow_status === "submitted" && can("verify")) {
        workflowActions.appendChild(makeButton(t("verifyAction"), function() {
            workflowStep("verify_activity", s, t("verifiedMsg"));
        }, "strong"));
    }
    if (s.workflow_status === "verified" && can("approve")) {
        workflowActions.appendChild(makeButton(t("approveAction"), function() {
            workflowStep("approve_activity", s, t("approvedMsg"));
        }, "strong"));
    }
    if ((s.workflow_status === "submitted" || s.workflow_status === "verified") && can("return")) {
        workflowActions.appendChild(makeButton(t("returnAction"), function() {
            const note = window.prompt(t("returnPrompt"));
            if (note && note.trim()) {
                workflowStep("return_activity", s, t("returnedMsg"), { p_note: note.trim() });
            }
        }, "danger"));
    }
    if (s.workflow_status === "approved" && isAdmin) {
        workflowActions.appendChild(makeButton(t("reopenAction"), function() {
            const note = window.prompt(t("reopenPrompt"));
            if (note && note.trim()) {
                workflowStep("reopen_activity", s, t("reopenedMsg"), { p_note: note.trim() });
            }
        }, "muted-button"));
    }
    if (canEditActivity(s)) {
        workflowActions.appendChild(makeButton(t("edit"), function() {
            startEditSession(s);
        }));
    }
}

// One step of the workflow (RPC: submit / verify / approve / return / reopen)
async function workflowStep(functionName, session, doneText, extra) {

    const args = Object.assign({ p_id: session.id }, extra || {});
    const { error } = await supabaseClient.rpc(functionName, args);

    if (error) {
        showError(workflowMessage, error);
        return;
    }

    await loadSessions();
    showMessage(workflowMessage, doneText, "success");
}


// =====================================================================
// ATTENDANCE RECORDS
// =====================================================================

// Attendance + activity details together (RPC: get_session_attendance)
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

    const session = selectedSession();
    const open = session ? attendanceOpen(session) : false;

    if (currentAttendance.length === 0) {
        attendanceList.appendChild(emptyText("noAttendance"));
        return;
    }

    currentAttendance.forEach(function(record) {

        const item = document.createElement("div");
        item.className = "item";

        const main = document.createElement("div");
        main.className = "item-main";

        const title = makeText("p", "item-title", record.participant_name);
        const status = makeText("span", "status " + record.attendance_status,
            record.attendance_status === "Present" ? t("present") : t("absent"));
        title.appendChild(status);
        main.appendChild(title);

        // This line comes from the OTHER table (training_sessions)
        main.appendChild(makeText("p", "item-sub",
            record.session_name + " · " + record.session_date +
            (record.location ? " · " + record.location : "")));

        main.appendChild(makeText("p", "item-meta",
            editedText(record.last_edited_by, record.last_edited_at)));

        const actions = document.createElement("div");
        actions.className = "item-actions";
        if (open) {
            actions.appendChild(makeButton(t("edit"), function() {
                startEditRecord(record);
            }));
        }
        if (isAdmin) {
            actions.appendChild(makeButton(t("archive"), function() {
                archiveRecord(record);
            }, "muted-button"));
        }

        item.appendChild(main);
        item.appendChild(actions);
        attendanceList.appendChild(item);
    });
}

attendanceSession.addEventListener("change", function() {
    if (attendanceSession.value) {
        selectSession(attendanceSession.value, false);
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
    attendanceSession.disabled = true;   // a record stays in its own activity

    updateAttendanceFormText();
    attendanceMessage.textContent = "";

    switchTab(attendanceTab, sessionTab, attendanceForm, sessionForm);
    attendanceForm.scrollIntoView({ behavior: "smooth", block: "start" });
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

attendanceForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const sessionId = editingRecordId === null ? Number(attendanceSession.value) : selectedSessionId;
    let result;

    if (editingRecordId === null) {
        // RPC: add_attendance_record → INSERT
        result = await supabaseClient.rpc("add_attendance_record", {
            p_training_session_id: sessionId,
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
    await loadSessions();             // updates the present/absent counts
    await selectSession(sessionId, false);
    participantName.focus();

    showMessage(attendanceMessage, wasEditing ? t("updated") : t("saved"), "success");
});


// =====================================================================
// PHOTOS AND DOCUMENTS (Supabase Storage)
// 1. The file is uploaded to the private bucket "session-files",
//    in the folder of its activity: session-<id>/...
// 2. RPC add_session_file records it in the table session_files.
// Photos are shown, and files downloaded, through temporary signed
// links that only work for signed-in approved staff and expire.
// =====================================================================

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

function clearFiles() {
    currentFiles = null;
    photoLinks = {};
    photoGrid.innerHTML = "";
    documentList.innerHTML = "";
    filesContent.hidden = true;
    filesHint.hidden = false;
    uploadForm.reset();
    updateChosenFiles();
}

// Read the files of one activity (RPC: get_session_files),
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

function fileActions(file) {
    const actions = document.createElement("div");
    actions.className = "item-actions";
    actions.appendChild(makeButton(t("download"), function() {
        downloadFile(file, uploadMessage);
    }));
    if (isAdmin) {
        actions.appendChild(makeButton(t("archive"), function() {
            archiveFile(file);
        }, "muted-button"));
    }
    return actions;
}

function drawFiles() {

    filesHint.hidden = true;
    filesContent.hidden = false;

    photoGrid.innerHTML = "";
    documentList.innerHTML = "";

    const photos = currentFiles.filter(isPhoto);
    const documents = currentFiles.filter(function(file) { return !isPhoto(file); });

    if (photos.length === 0) {
        photoGrid.appendChild(emptyText("noPhotos"));
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
        text.appendChild(fileActions(file));

        card.appendChild(text);
        photoGrid.appendChild(card);
    });

    if (documents.length === 0) {
        documentList.appendChild(emptyText("noDocuments"));
    }

    documents.forEach(function(file) {

        const item = document.createElement("div");
        item.className = "item";

        const main = document.createElement("div");
        main.className = "item-main doc-main";
        main.appendChild(makeText("span", "doc-icon", extensionOf(file.file_name).toUpperCase() || "FILE"));

        const words = document.createElement("div");
        words.className = "doc-words";
        words.appendChild(makeText("p", "item-title", file.file_name));
        words.appendChild(makeText("p", "item-sub",
            (file.caption ? file.caption + " · " : "") + formatSize(file.size_bytes)));
        words.appendChild(makeText("p", "item-meta",
            fill("uploadedBy", { name: file.uploaded_by || "—", time: formatTime(file.uploaded_at) })));
        main.appendChild(words);

        item.appendChild(main);
        item.appendChild(fileActions(file));
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

async function archiveSession(session) {

    archiveMessage.textContent = "";

    const { error } = await supabaseClient.rpc("archive_training_session", { p_id: session.id });

    if (error) {
        showError(sessionMessage, error);
        return;
    }

    if (editingSessionId === session.id) {
        stopEditSession();
    }
    if (selectedSessionId === session.id) {
        closeDetail();
    }

    await loadSessions();
    await loadArchive();
    showMessage(sessionMessage, t("archivedMsg"), "success");
}

async function archiveRecord(record) {

    archiveMessage.textContent = "";

    const { error } = await supabaseClient.rpc("archive_attendance_record", { p_id: record.id });

    if (error) {
        showError(attendanceMessage, error);
        return;
    }

    if (editingRecordId === record.id) {
        stopEditRecord();
    }

    await loadSessions();
    await loadAttendance(selectedSessionId);
    await loadArchive();
    showMessage(attendanceMessage, t("archivedMsg"), "success");
}

async function archiveFile(file) {

    archiveMessage.textContent = "";

    const { error } = await supabaseClient.rpc("archive_session_file", { p_id: file.id });

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

async function loadArchive() {

    const results = await Promise.all([
        supabaseClient.rpc("get_archived_sessions"),
        supabaseClient.rpc("get_archived_attendance"),
        supabaseClient.rpc("get_archived_files")
    ]);

    const failed = results.find(function(r) { return r.error; });
    if (failed) {
        showError(archiveMessage, failed.error);
        return;
    }

    archivedSessions = results[0].data;
    archivedAttendance = results[1].data;
    archivedFiles = results[2].data;
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
    actions.appendChild(makeButton(t("delete"), onDelete, "danger"));

    item.appendChild(main);
    item.appendChild(actions);
    return item;
}

function drawArchive() {

    archivedSessionList.innerHTML = "";
    archivedAttendanceList.innerHTML = "";
    archivedFileList.innerHTML = "";

    if (archivedSessions.length === 0) {
        archivedSessionList.appendChild(emptyText("noArchived"));
    }

    archivedSessions.forEach(function(session) {
        const sub =
            session.session_date + " · " + (session.location || "") + " · " +
            fill("recordsCount", { n: session.attendance_count }) + " · " +
            fill("filesCount", { n: session.file_count }) + " · " +
            t("archivedOn") + " " + session.archived_at.slice(0, 10);

        archivedSessionList.appendChild(archiveItem(
            session.session_name, sub,
            function() { restoreSession(session); },
            function() { deleteSession(session); }
        ));
    });

    if (archivedAttendance.length === 0) {
        archivedAttendanceList.appendChild(emptyText("noArchived"));
    }

    archivedAttendance.forEach(function(record) {
        const status = record.attendance_status === "Present" ? t("present") : t("absent");
        const sub =
            record.session_name + " · " + record.session_date + " · " + status + " · " +
            t("archivedOn") + " " + record.archived_at.slice(0, 10);

        archivedAttendanceList.appendChild(archiveItem(
            record.participant_name, sub,
            function() { restoreRecord(record); },
            function() { deleteRecord(record); }
        ));
    });

    if (archivedFiles.length === 0) {
        archivedFileList.appendChild(emptyText("noArchived"));
    }

    archivedFiles.forEach(function(file) {
        const sub =
            file.session_name + " · " + file.session_date + " · " + formatSize(file.size_bytes) + " · " +
            t("archivedOn") + " " + file.archived_at.slice(0, 10);

        archivedFileList.appendChild(archiveItem(
            file.file_name, sub,
            function() { restoreFile(file); },
            function() { deleteFile(file); },
            function() { downloadFile(file, archiveMessage); }
        ));
    });
}

async function restoreItem(functionName, id) {

    const { error } = await supabaseClient.rpc(functionName, { p_id: id });

    if (error) {
        showError(archiveMessage, error);
        return false;
    }

    await loadSessions();
    if (selectedSessionId) {
        await loadAttendance(selectedSessionId);
        await loadFiles(selectedSessionId);
    }
    await loadArchive();
    showMessage(archiveMessage, t("restoredMsg"), "success");
    return true;
}

function restoreSession(session) { return restoreItem("restore_training_session", session.id); }
function restoreRecord(record) { return restoreItem("restore_attendance_record", record.id); }
function restoreFile(file) { return restoreItem("restore_session_file", file.id); }

// Remove files from the Storage bucket (administrators only)
async function removeStoredFiles(paths) {
    if (!paths || paths.length === 0) {
        return null;
    }
    const { error } = await supabaseClient.storage.from(FILE_BUCKET).remove(paths);
    return error;
}

async function deleteSession(session) {

    const question = fill("confirmDeleteSession", {
        name: session.session_name, n: session.attendance_count, f: session.file_count
    });
    if (!window.confirm(question)) {
        return;
    }

    const { data, error } = await supabaseClient.rpc("delete_training_session", { p_id: session.id });
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

    if (!window.confirm(fill("confirmDeleteRecord", { name: record.participant_name }))) {
        return;
    }

    const { error } = await supabaseClient.rpc("delete_attendance_record", { p_id: record.id });
    if (error) {
        showError(archiveMessage, error);
        return;
    }

    await loadArchive();
    showMessage(archiveMessage, t("deletedMsg"), "success");
}

async function deleteFile(file) {

    if (!window.confirm(fill("confirmDeleteFile", { name: file.file_name }))) {
        return;
    }

    const { data, error } = await supabaseClient.rpc("delete_session_file", { p_id: file.id });
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


// =====================================================================
// Opening the Activities page, language changes, sign-out
// =====================================================================

viewLoaders.activities = function() {
    archiveArea.hidden = !isAdmin;
    loadSessions();
    if (isAdmin) {
        loadArchive();
    }
};

// Open one activity from another page (e.g. the dashboard)
function openActivity(id) {
    showView("activities");
    selectSession(id, true);
}

languageHooks.push(function() {
    updateSessionFormText();
    updateAttendanceFormText();
    updateChosenFiles();
    drawSessions();
    drawDetail();
    if (currentAttendance) {
        drawAttendance();
    }
    if (currentFiles) {
        drawFiles();
    }
    if (archivedSessions) {
        drawArchive();
    }
});

signOutHooks.push(function() {
    currentSessions = [];
    archivedSessions = null;
    archivedAttendance = null;
    archivedFiles = null;
    stopEditSession();
    closeDetail();
    sessionList.innerHTML = "";
});
