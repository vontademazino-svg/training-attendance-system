const SUPABASE_URL = "https://dstzkaygqvxhzmefirdr.supabase.co";

const SUPABASE_KEY = "sb_publishable_Ej4MWxE33vHvwYpdIUxUUw_u4OZnr5a";

const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);const sessionForm = document.getElementById("sessionForm");
const sessionList = document.getElementById("sessionList");
const attendanceSession = document.getElementById("attendanceSession");
const attendanceForm = document.getElementById("attendanceForm");
const participantName = document.getElementById("participantName");
const attendanceStatus = document.getElementById("attendanceStatus");
const attendanceList = document.getElementById("attendanceList");

sessionForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const sessionName = document.getElementById("sessionName").value;
    const sessionDate = document.getElementById("sessionDate").value;
    const sessionLocation = document.getElementById("sessionLocation").value;
    const { error } = await supabaseClient
    .from("training_sessions")
    .insert([
        {
            session_name: sessionName,
            session_date: sessionDate,
            location: sessionLocation
        }
    ]);

if (error) {
    alert("Error saving session: " + error.message);
    return;
}

alert("Session saved to Supabase!");

    const sessionItem = document.createElement("p");

    sessionItem.textContent =
        sessionName + " | " +
        sessionDate + " | " +
        sessionLocation;

    sessionList.appendChild(sessionItem);

});async function loadSessions() {

    const { data, error } = await supabaseClient
        .from("training_sessions")
        .select("*");

    if (error) {
        alert("Error loading sessions: " + error.message);
        return;
    }
    sessionList.innerHTML = "";
    attendanceSession.innerHTML = '<option value="">Select a session</option>';

    data.forEach(function(session) {

        const sessionItem = document.createElement("p");

        sessionItem.textContent =
            session.session_name + " | " +
            session.session_date + " | " +
            session.location;

        sessionList.appendChild(sessionItem);
const option = document.createElement("option");

option.value = session.id;
option.textContent = session.session_name;

attendanceSession.appendChild(option);
    });
}

loadSessions();
attendanceForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const selectedSession = attendanceSession.value;
    const name = participantName.value;
    const status = attendanceStatus.value;
    const { error } = await supabaseClient
    .from("attendance_records")
    .insert([
        {
            training_session_id: selectedSession,
            participant_name: name,
            attendance_status: status
        }
    ]);

if (error) {
    alert("Error saving attendance: " + error.message);
    return;
}

alert("Attendance saved to Supabase!");
participantName.value = "";
attendanceStatus.value = "Present";
sessionForm.reset();
await loadSessions();
await loadAttendance(selectedSession);

    alert(
        "Session ID: " + selectedSession +
        "\nParticipant: " + name +
        "\nStatus: " + status
    );

});async function loadAttendance(sessionId) {

    const { data, error } = await supabaseClient
        .from("attendance_records")
        .select(`
    participant_name,
    attendance_status,
    training_sessions (
        session_name,
        session_date,
        location
    )
`)
.eq("training_session_id", sessionId);

    if (error) {
        alert("Error loading attendance: " + error.message);
        return;
    }

    attendanceList.innerHTML = "";

    data.forEach(function(record) {

        const item = document.createElement("p");

        item.textContent =
    record.training_sessions.session_name +
    " | " +
    record.participant_name +
    " | " +
    record.attendance_status;

        attendanceList.appendChild(item);

    });
}attendanceSession.addEventListener("change", function() {

    const selectedSessionId = attendanceSession.value;

    if (selectedSessionId) {
        loadAttendance(selectedSessionId);
    } else {
        attendanceList.innerHTML = "";
    }

});