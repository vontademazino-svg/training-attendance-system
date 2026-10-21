// =====================================================================
// Part 3 of 3: DASHBOARD, PROJECTS, SETUP (departments and locations),
// STAFF (roles and approval) and AUDIT LOG.
// =====================================================================

const PROJECT_STATUSES = ["planned", "active", "completed", "cancelled"];
const LOCATION_LEVELS = ["province", "district", "community"];
const ROLES = ["field_officer", "department_head", "finance", "leadership", "im_team"];
const AUDIT_TABLES = ["training_sessions", "attendance_records", "session_files",
                      "projects", "departments", "locations", "staff_profiles"];


// =====================================================================
// 1. DASHBOARD (RPC: get_dashboard)
// =====================================================================

const dashFrom = byId("dashFrom");
const dashTo = byId("dashTo");
const dashDepartment = byId("dashDepartment");
const dashTiles = byId("dashTiles");

let dashboardData = null;

lookupHooks.push(function() {
    fillDepartmentSelect(dashDepartment, "allDepartments");
});

[dashFrom, dashTo, dashDepartment].forEach(function(input) {
    input.addEventListener("change", loadDashboard);
});

async function loadDashboard() {

    const { data, error } = await supabaseClient.rpc("get_dashboard", {
        p_from: textOrNull(dashFrom.value),
        p_to: textOrNull(dashTo.value),
        p_department_id: numberOrNull(dashDepartment.value)
    });

    if (error) {
        showError(pageMessage, error);
        return;
    }

    dashboardData = data;
    drawDashboard();
}

function tile(label, value, note, tone) {
    const box = document.createElement("div");
    box.className = "tile" + (tone ? " tile-" + tone : "");
    box.appendChild(makeText("p", "tile-label", label));
    box.appendChild(makeText("p", "tile-value", String(value)));
    if (note) {
        box.appendChild(makeText("p", "tile-note", note));
    }
    return box;
}

// Horizontal bars: rows = [{ label, n }]
function drawBars(container, rows, emptyKey) {
    container.innerHTML = "";
    if (rows.length === 0) {
        container.appendChild(emptyText(emptyKey || "noData"));
        return;
    }
    const max = Math.max.apply(null, rows.map(function(r) { return r.n; })) || 1;
    rows.forEach(function(row) {
        const line = document.createElement("div");
        line.className = "bar-row";
        line.appendChild(makeText("span", "bar-label", row.label));
        const track = document.createElement("span");
        track.className = "bar-track";
        const fillBar = document.createElement("span");
        fillBar.className = "bar-fill" + (row.tone ? " wf-" + row.tone : "");
        fillBar.style.width = Math.max(2, Math.round(100 * row.n / max)) + "%";
        track.appendChild(fillBar);
        line.appendChild(track);
        line.appendChild(makeText("span", "bar-value", String(row.n)));
        container.appendChild(line);
    });
}

function drawDashboard() {

    const d = dashboardData;
    if (!d) {
        return;
    }

    const status = d.by_status || {};
    const present = Number(d.present);
    const total = present + Number(d.absent);
    const projects = d.projects || {};

    dashTiles.innerHTML = "";
    dashTiles.appendChild(tile(t("tileActivities"), d.activities,
        fill("tileApprovedNote", { n: status.approved || 0 })));
    dashTiles.appendChild(tile(t("tileWaiting"),
        (status.submitted || 0) + (status.verified || 0),
        fill("tileWaitingNote", { s: status.submitted || 0, v: status.verified || 0 }),
        (status.submitted || status.verified) ? "warn" : ""));
    dashTiles.appendChild(tile(t("tileParticipants"), d.participants,
        fill("tileAttendanceNote", { p: present, t: total })));
    dashTiles.appendChild(tile(t("tileRate"),
        total ? Math.round(100 * present / total) + "%" : "—",
        d.planned_participants ? fill("tilePlannedNote", { n: d.planned_participants }) : ""));
    dashTiles.appendChild(tile(t("tileProjects"), projects.active || 0,
        formatMoney(d.active_budget)));
    dashTiles.appendChild(tile(t("tileFiles"), d.files, ""));

    // Activities per month (vertical bars)
    const months = byId("dashByMonth");
    months.innerHTML = "";
    if (d.by_month.length === 0) {
        months.appendChild(emptyText("noData"));
    } else {
        const max = Math.max.apply(null, d.by_month.map(function(m) { return m.n; })) || 1;
        d.by_month.slice(-12).forEach(function(m) {
            const col = document.createElement("div");
            col.className = "month-col";
            col.appendChild(makeText("span", "month-value", String(m.n)));
            const bar = document.createElement("span");
            bar.className = "month-bar";
            bar.style.height = Math.max(4, Math.round(120 * m.n / max)) + "px";
            col.appendChild(bar);
            col.appendChild(makeText("span", "month-label", m.month.slice(2)));
            months.appendChild(col);
        });
    }

    drawBars(byId("dashByStatus"), WORKFLOW.map(function(k) {
        return { label: t("wf_" + k), n: status[k] || 0, tone: k };
    }));

    drawBars(byId("dashByDepartment"), d.by_department.map(function(row) {
        return { label: row.name_pt ? departmentName(row) : t("noDepartment"), n: row.n };
    }));

    drawBars(byId("dashByProvince"), d.by_province.map(function(row) {
        return { label: row.name || t("noProvince"), n: row.n };
    }));

    drawBars(byId("dashByType"), d.by_type.map(function(row) {
        return { label: t("type_" + row.key), n: row.n };
    }));

    const pending = byId("dashPending");
    pending.innerHTML = "";
    if (d.pending.length === 0) {
        pending.appendChild(emptyText("noPending"));
    }
    d.pending.forEach(function(a) {
        const item = document.createElement("div");
        item.className = "item compact";
        const main = document.createElement("div");
        main.className = "item-main";
        const title = makeText("p", "item-title", a.name);
        title.appendChild(statusBadge(a.status));
        main.appendChild(title);
        main.appendChild(makeText("p", "item-sub", a.date));
        item.appendChild(main);
        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.appendChild(makeButton(t("view"), function() { openActivity(a.id); }));
        item.appendChild(actions);
        pending.appendChild(item);
    });
}

viewLoaders.dashboard = loadDashboard;
languageHooks.push(drawDashboard);


// =====================================================================
// 2. PROJECTS (RPC: get_projects, save_project)
// =====================================================================

const projectForm = byId("projectForm");
const projectFormTitle = byId("projectFormTitle");
const projectNoRights = byId("projectNoRights");
const projectName = byId("projectName");
const projectCode = byId("projectCode");
const projectStatus = byId("projectStatus");
const projectDepartment = byId("projectDepartment");
const projectLocation = byId("projectLocation");
const projectStart = byId("projectStart");
const projectEnd = byId("projectEnd");
const projectBudget = byId("projectBudget");
const projectResponsible = byId("projectResponsible");
const projectDescription = byId("projectDescription");
const projectSubmit = byId("projectSubmit");
const projectCancel = byId("projectCancel");
const projectMessage = byId("projectMessage");
const projectSearch = byId("projectSearch");
const projectFilterStatus = byId("projectFilterStatus");
const projectList = byId("projectList");

let editingProjectId = null;

lookupHooks.push(function() {
    fillSelect(projectStatus, PROJECT_STATUSES, {
        value: function(k) { return k; },
        label: function(k) { return t("pstatus_" + k); }
    });
    fillSelect(projectFilterStatus, PROJECT_STATUSES, {
        empty: t("all"),
        value: function(k) { return k; },
        label: function(k) { return t("pstatus_" + k); }
    });
    fillDepartmentSelect(projectDepartment);
    fillLocationSelect(projectLocation);
    fillSelect(projectResponsible, lookups.staff, {
        empty: t("noneChosen"),
        value: function(s) { return s.id; },
        label: function(s) { return s.display_name; }
    });
    drawProjects();
});

[projectSearch, projectFilterStatus].forEach(function(input) {
    input.addEventListener("input", drawProjects);
});

function updateProjectFormText() {
    const editing = editingProjectId !== null;
    projectFormTitle.textContent = editing ? t("projectEditTitle") : t("projectAddTitle");
    projectSubmit.textContent = editing ? t("update") : t("save");
    projectCancel.hidden = !editing;
}

function drawProjects() {

    const allowed = can("projects");
    projectForm.hidden = !allowed;
    projectNoRights.hidden = allowed;
    updateProjectFormText();

    projectList.innerHTML = "";

    const search = projectSearch.value.trim().toLowerCase();
    const shown = lookups.projects.filter(function(p) {
        if (projectFilterStatus.value && p.status !== projectFilterStatus.value) {
            return false;
        }
        if (search) {
            const text = [p.code, p.name, p.description, p.location_path,
                          departmentName(p, "department_")].join(" ").toLowerCase();
            return text.indexOf(search) !== -1;
        }
        return true;
    });

    if (shown.length === 0) {
        projectList.appendChild(emptyText("noProjects"));
    }

    shown.forEach(function(p) {

        const item = document.createElement("div");
        item.className = "item";

        const main = document.createElement("div");
        main.className = "item-main";

        const title = makeText("p", "item-title", (p.code ? p.code + " · " : "") + p.name);
        title.appendChild(makeText("span", "wf-badge ps-" + p.status, t("pstatus_" + p.status)));
        main.appendChild(title);

        const dates = [p.start_date, p.end_date].filter(Boolean).join(" → ");
        main.appendChild(makeText("p", "item-sub",
            [departmentName(p, "department_"), p.location_path, dates].filter(Boolean).join(" · ")));

        main.appendChild(makeText("p", "item-sub",
            [p.budget !== null ? t("budget") + ": " + formatMoney(p.budget) : "",
             p.responsible_name ? t("responsible") + ": " + p.responsible_name : "",
             fill("projectActivities", { n: p.activity_count, a: p.approved_count })]
                .filter(Boolean).join(" · ")));

        if (p.description) {
            main.appendChild(makeText("p", "item-desc", p.description));
        }
        main.appendChild(makeText("p", "item-meta", editedText(p.last_edited_by, p.last_edited_at)));

        const actions = document.createElement("div");
        actions.className = "item-actions";
        if (can("projects")) {
            actions.appendChild(makeButton(t("edit"), function() { startEditProject(p); }));
        }

        item.appendChild(main);
        item.appendChild(actions);
        projectList.appendChild(item);
    });
}

function startEditProject(p) {
    editingProjectId = p.id;
    projectName.value = p.name;
    projectCode.value = p.code || "";
    projectStatus.value = p.status;
    projectDepartment.value = p.department_id || "";
    projectLocation.value = p.location_id || "";
    projectStart.value = p.start_date || "";
    projectEnd.value = p.end_date || "";
    projectBudget.value = p.budget === null ? "" : p.budget;
    projectResponsible.value = p.responsible_id || "";
    projectDescription.value = p.description || "";
    updateProjectFormText();
    projectMessage.textContent = "";
    projectForm.scrollIntoView({ behavior: "smooth", block: "start" });
    projectName.focus();
}

function stopEditProject() {
    editingProjectId = null;
    projectForm.reset();
    updateProjectFormText();
}

projectCancel.addEventListener("click", function() {
    stopEditProject();
    projectMessage.textContent = "";
});

projectForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const { error } = await supabaseClient.rpc("save_project", {
        p_id: editingProjectId,
        p_code: projectCode.value,
        p_name: projectName.value,
        p_department_id: numberOrNull(projectDepartment.value),
        p_location_id: numberOrNull(projectLocation.value),
        p_start_date: textOrNull(projectStart.value),
        p_end_date: textOrNull(projectEnd.value),
        p_budget: numberOrNull(projectBudget.value),
        p_status: projectStatus.value,
        p_responsible_id: textOrNull(projectResponsible.value),
        p_description: projectDescription.value
    });

    if (error) {
        showError(projectMessage, error);
        return;
    }

    const wasEditing = editingProjectId !== null;
    stopEditProject();
    await loadLookups();
    showMessage(projectMessage, wasEditing ? t("updated") : t("saved"), "success");
});

viewLoaders.projects = loadLookups;
languageHooks.push(drawProjects);


// =====================================================================
// 3. SETUP: departments and locations (IM team, administrators)
// =====================================================================

const departmentForm = byId("departmentForm");
const departmentFormTitle = byId("departmentFormTitle");
const deptCode = byId("deptCode");
const deptActive = byId("deptActive");
const deptNamePt = byId("deptNamePt");
const deptNameEn = byId("deptNameEn");
const deptNameZh = byId("deptNameZh");
const deptSubmit = byId("deptSubmit");
const deptCancel = byId("deptCancel");
const deptMessage = byId("deptMessage");
const departmentList = byId("departmentList");

const locationForm = byId("locationForm");
const locationFormTitle = byId("locationFormTitle");
const locName = byId("locName");
const locLevel = byId("locLevel");
const locActive = byId("locActive");
const locParent = byId("locParent");
const locSubmit = byId("locSubmit");
const locCancel = byId("locCancel");
const locMessage = byId("locMessage");
const locationList = byId("locationList");

let editingDepartmentId = null;
let editingLocationId = null;

function updateSetupFormText() {
    departmentFormTitle.textContent = editingDepartmentId ? t("deptEditTitle") : t("deptAddTitle");
    deptSubmit.textContent = editingDepartmentId ? t("update") : t("save");
    deptCancel.hidden = !editingDepartmentId;
    locationFormTitle.textContent = editingLocationId ? t("locEditTitle") : t("locAddTitle");
    locSubmit.textContent = editingLocationId ? t("update") : t("save");
    locCancel.hidden = !editingLocationId;
}

// The "belongs to" list shows only possible parents for the chosen level
function fillParentSelect() {
    const parentLevel = { district: "province", community: "district" }[locLevel.value];
    fillSelect(locParent, parentLevel ? lookups.locations.filter(function(l) {
        return l.level === parentLevel && l.id !== editingLocationId;
    }) : [], {
        empty: parentLevel ? t("chooseParent") : t("noParent"),
        value: function(l) { return l.id; },
        label: function(l) { return l.path; }
    });
    locParent.disabled = !parentLevel;
    locParent.required = !!parentLevel;
}

locLevel.addEventListener("change", fillParentSelect);

function drawSetup() {

    fillSelect(locLevel, LOCATION_LEVELS, {
        value: function(k) { return k; },
        label: function(k) { return t("level_" + k); }
    });
    fillParentSelect();
    updateSetupFormText();

    departmentList.innerHTML = "";
    lookups.departments.forEach(function(d) {
        const item = document.createElement("div");
        item.className = "item compact" + (d.active ? "" : " inactive");
        const main = document.createElement("div");
        main.className = "item-main";
        main.appendChild(makeText("p", "item-title", (d.code ? d.code + " · " : "") + departmentName(d)));
        main.appendChild(makeText("p", "item-sub",
            [d.name_pt, d.name_en, d.name_zh].filter(Boolean).join(" / ") +
            " · " + fill("activitiesCount", { n: d.activity_count }) +
            (d.active ? "" : " · " + t("inactive"))));
        item.appendChild(main);
        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.appendChild(makeButton(t("edit"), function() {
            editingDepartmentId = d.id;
            deptCode.value = d.code || "";
            deptActive.checked = d.active;
            deptNamePt.value = d.name_pt || "";
            deptNameEn.value = d.name_en || "";
            deptNameZh.value = d.name_zh || "";
            updateSetupFormText();
            departmentForm.scrollIntoView({ behavior: "smooth", block: "start" });
        }));
        item.appendChild(actions);
        departmentList.appendChild(item);
    });

    locationList.innerHTML = "";
    lookups.locations.forEach(function(l) {
        const item = document.createElement("div");
        item.className = "item compact level-" + l.level + (l.active ? "" : " inactive");
        const main = document.createElement("div");
        main.className = "item-main";
        main.appendChild(makeText("p", "item-title", l.name));
        main.appendChild(makeText("p", "item-sub",
            t("level_" + l.level) + (l.parent_id ? " · " + l.path : "") +
            (l.active ? "" : " · " + t("inactive"))));
        item.appendChild(main);
        const actions = document.createElement("div");
        actions.className = "item-actions";
        actions.appendChild(makeButton(t("edit"), function() {
            editingLocationId = l.id;
            locName.value = l.name;
            locLevel.value = l.level;
            locActive.checked = l.active;
            fillParentSelect();
            locParent.value = l.parent_id || "";
            updateSetupFormText();
            locationForm.scrollIntoView({ behavior: "smooth", block: "start" });
        }));
        item.appendChild(actions);
        locationList.appendChild(item);
    });
}

deptCancel.addEventListener("click", function() {
    editingDepartmentId = null;
    departmentForm.reset();
    updateSetupFormText();
});

locCancel.addEventListener("click", function() {
    editingLocationId = null;
    locationForm.reset();
    fillParentSelect();
    updateSetupFormText();
});

departmentForm.addEventListener("submit", async function(event) {
    event.preventDefault();
    const { error } = await supabaseClient.rpc("save_department", {
        p_id: editingDepartmentId,
        p_code: deptCode.value,
        p_name_pt: deptNamePt.value,
        p_name_en: deptNameEn.value,
        p_name_zh: deptNameZh.value,
        p_active: deptActive.checked
    });
    if (error) {
        showError(deptMessage, error);
        return;
    }
    const wasEditing = editingDepartmentId !== null;
    editingDepartmentId = null;
    departmentForm.reset();
    await loadLookups();
    showMessage(deptMessage, wasEditing ? t("updated") : t("saved"), "success");
});

locationForm.addEventListener("submit", async function(event) {
    event.preventDefault();
    const level = locLevel.value;
    const { error } = await supabaseClient.rpc("save_location", {
        p_id: editingLocationId,
        p_name: locName.value,
        p_level: level,
        p_parent_id: numberOrNull(locParent.value),
        p_active: locActive.checked
    });
    if (error) {
        showError(locMessage, error);
        return;
    }
    const wasEditing = editingLocationId !== null;
    editingLocationId = null;
    locationForm.reset();
    locLevel.value = level;          // keep the level, to add several in a row
    await loadLookups();
    showMessage(locMessage, wasEditing ? t("updated") : t("saved"), "success");
});

lookupHooks.push(drawSetup);
viewLoaders.setup = loadLookups;


// =====================================================================
// 4. STAFF: approval, role, department, administrator (admins only)
//    (RPC: get_staff_admin, save_staff_profile)
// =====================================================================

const staffList = byId("staffList");
const staffMessage = byId("staffMessage");
const roleHelp = byId("roleHelp");

let staffRows = [];

async function loadStaff() {
    const { data, error } = await supabaseClient.rpc("get_staff_admin");
    if (error) {
        showError(staffMessage, error);
        return;
    }
    staffRows = data;
    drawStaff();
}

function drawStaff() {

    staffList.innerHTML = "";

    roleHelp.innerHTML = "";
    ROLES.forEach(function(role) {
        roleHelp.appendChild(makeText("dt", "", t("role_" + role)));
        roleHelp.appendChild(makeText("dd", "", t("roleHelp_" + role)));
    });

    staffRows.forEach(function(s) {

        const item = document.createElement("div");
        item.className = "item staff-row" + (s.approved ? "" : " waiting");

        const main = document.createElement("div");
        main.className = "item-main";
        const title = makeText("p", "item-title", s.display_name || s.email);
        if (!s.approved) {
            title.appendChild(makeText("span", "wf-badge wf-submitted", t("waitingApproval")));
        }
        main.appendChild(title);
        main.appendChild(makeText("p", "item-sub", s.email + " · " + formatTime(s.created_at)));
        item.appendChild(main);

        const controls = document.createElement("div");
        controls.className = "staff-controls";

        function check(labelKey, value) {
            const label = document.createElement("label");
            label.className = "check";
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = value;
            label.appendChild(box);
            label.appendChild(makeText("span", "", " " + t(labelKey)));
            controls.appendChild(label);
            return box;
        }

        const approvedBox = check("approvedLabel", s.approved);

        const roleSelect = document.createElement("select");
        fillSelect(roleSelect, ROLES, {
            value: function(k) { return k; },
            label: function(k) { return t("role_" + k); }
        });
        roleSelect.value = s.role;
        roleSelect.setAttribute("aria-label", t("roleLabel"));
        controls.appendChild(roleSelect);

        const deptSelect = document.createElement("select");
        fillDepartmentSelect(deptSelect);
        deptSelect.value = s.department_id || "";
        deptSelect.setAttribute("aria-label", t("department"));
        controls.appendChild(deptSelect);

        const adminBox = check("adminBadge", s.is_admin);

        controls.appendChild(makeButton(t("save"), async function() {
            const { error } = await supabaseClient.rpc("save_staff_profile", {
                p_id: s.id,
                p_approved: approvedBox.checked,
                p_role: roleSelect.value,
                p_department_id: numberOrNull(deptSelect.value),
                p_is_admin: adminBox.checked
            });
            if (error) {
                showError(staffMessage, error);
                return;
            }
            await loadStaff();
            await loadLookups();
            showMessage(staffMessage, fill("staffSaved", { name: s.display_name || s.email }), "success");
        }, "strong"));

        item.appendChild(controls);
        staffList.appendChild(item);
    });
}

viewLoaders.staff = loadStaff;
languageHooks.push(function() {
    if (staffRows.length) {
        drawStaff();
    }
});


// =====================================================================
// 5. AUDIT LOG (RPC: get_audit_log) — leadership, IM team, admins
// =====================================================================

const auditTable = byId("auditTable");
const auditList = byId("auditList");
const auditMessage = byId("auditMessage");

let auditRows = [];

lookupHooks.push(function() {
    fillSelect(auditTable, AUDIT_TABLES, {
        empty: t("all"),
        value: function(k) { return k; },
        label: function(k) { return t("tbl_" + k); }
    });
});

auditTable.addEventListener("change", loadAudit);

async function loadAudit() {
    const { data, error } = await supabaseClient.rpc("get_audit_log", {
        p_table: textOrNull(auditTable.value),
        p_record_id: null,
        p_limit: 300
    });
    if (error) {
        showError(auditMessage, error);
        return;
    }
    auditRows = data;
    drawAudit();
}

function shortValue(value) {
    if (value === null || value === undefined) {
        return "—";
    }
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return text.length > 60 ? text.slice(0, 57) + "…" : text;
}

function drawAudit() {

    auditList.innerHTML = "";

    if (auditRows.length === 0) {
        auditList.appendChild(emptyText("noData"));
    }

    auditRows.forEach(function(row) {
        const item = document.createElement("div");
        item.className = "item compact audit-" + row.action;

        const main = document.createElement("div");
        main.className = "item-main";
        main.appendChild(makeText("p", "item-title",
            t("act_" + row.action) + " · " + t("tbl_" + row.table_name) +
            (row.label ? " · " + row.label : "")));
        main.appendChild(makeText("p", "item-sub",
            formatTime(row.at) + " · " + row.user_name + " · #" + row.record_id));

        if (row.changes) {
            const list = document.createElement("ul");
            list.className = "changes";
            Object.keys(row.changes).forEach(function(key) {
                const c = row.changes[key];
                list.appendChild(makeText("li", "",
                    key + ": " + shortValue(c.old) + " → " + shortValue(c.new)));
            });
            main.appendChild(list);
        }

        item.appendChild(main);
        auditList.appendChild(item);
    });
}

viewLoaders.audit = loadAudit;
languageHooks.push(function() {
    if (auditRows.length) {
        drawAudit();
    }
});


// ---------- Forget everything on sign-out ----------
signOutHooks.push(function() {
    dashboardData = null;
    staffRows = [];
    auditRows = [];
    lookups.departments = [];
    lookups.locations = [];
    lookups.projects = [];
    lookups.staff = [];
});


// ---------- Start ----------
setLanguage(startingLanguage());
