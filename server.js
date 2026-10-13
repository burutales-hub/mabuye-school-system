console.log("SERVER SCRIPT IS STARTING...");

const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');

const app = express();
const port = 3000;

const pool = new Pool({
    host: 'localhost',
    user: 'postgres',
    password: '2026', 
    database: 'mabuye_db',
    port: 5432,
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Admin & Teacher Login Route with Session-like Identification
app.post('/api/login', async (req, res) => {
    const { role, username, password } = req.body;
    try {
        if (role === 'admin') {
            const result = await pool.query(
                'SELECT * FROM admins WHERE username = $1 AND password = $2',
                [username, password]
            );
            if (result.rows.length > 0) return res.redirect('/admin-dashboard.html');
            return res.status(401).send(`<h2>Invalid Admin Credentials</h2><a href="/login.html">Try Again</a>`);
        } else if (role === 'teacher') {
            const result = await pool.query(
                'SELECT * FROM teachers WHERE username = $1 AND password = $2',
                [username, password]
            );
            if (result.rows.length > 0) {
                const teacher = result.rows[0];
                if (teacher.status === 'suspended') {
                    return res.status(403).send(`<h2>Account Suspended</h2><p>Your account has been suspended by the administrator.</p><a href="/login.html">Back to Login</a>`);
                }
                // Redirect to teacher dashboard with teacher ID
                return res.redirect(`/teacher-dashboard.html?id=${teacher.id}`);
            }
            return res.status(401).send(`<h2>Invalid Teacher Credentials</h2><a href="/login.html">Try Again</a>`);
        }
        res.status(400).send('Invalid role selected.');
    } catch (err) {
        console.error("LOGIN ERROR:", err);
        res.status(500).send("Server Error");
    }
});

// --- STATISTICS API FOR DASHBOARDS ---
app.get('/api/stats', async (req, res) => {
    try {
        const studentsCount = await pool.query('SELECT COUNT(*) FROM students');
        const teachersCount = await pool.query('SELECT COUNT(*) FROM teachers');
        const subjectsCount = await pool.query('SELECT COUNT(*) FROM subjects');
        const totalSubmissions = await pool.query('SELECT COUNT(*) FROM mark_submissions');
        const completedSubmissions = await pool.query("SELECT COUNT(*) FROM mark_submissions WHERE status = 'approved' OR status = 'submitted'");

        res.json({
            students: studentsCount.rows[0].count,
            teachers: teachersCount.rows[0].count,
            subjects: subjectsCount.rows[0].count,
            totalTasks: totalSubmissions.rows[0].count,
            completedTasks: completedSubmissions.rows[0].count
        });
    } catch (err) {
        res.status(500).send("Server Error");
    }
});

// --- TEACHER SPECIFIC STATS ---
app.get('/api/teacher/:id', async (req, res) => {
    try {
        const teacherRes = await pool.query('SELECT id, name, role, assignment, username FROM teachers WHERE id = $1', [req.params.id]);
        if (teacherRes.rows.length === 0) return res.status(404).send("Teacher not found");

        const tasksRes = await pool.query('SELECT * FROM mark_submissions WHERE teacher_id = $1 ORDER BY id DESC', [req.params.id]);
        const completedCount = tasksRes.rows.filter(t => t.status === 'approved' || t.status === 'submitted').length;

        res.json({
            teacher: teacherRes.rows[0],
            tasks: tasksRes.rows,
            totalAssigned: tasksRes.rows.length,
            completedTasks: completedCount
        });
    } catch (err) {
        res.status(500).send("Server Error");
    }
});

// --- STUDENTS, SUBJECTS, TEACHERS, MARKSHEETS, REPORT CARDS & ANALYSIS ---
app.get('/api/students', async (req, res) => {
    const result = await pool.query('SELECT * FROM students ORDER BY id DESC');
    res.json(result.rows);
});

app.get('/api/subjects', async (req, res) => {
    const result = await pool.query('SELECT * FROM subjects ORDER BY id DESC');
    res.json(result.rows);
});

app.get('/api/teachers', async (req, res) => {
    const result = await pool.query('SELECT id, username, name, role, assignment, status FROM teachers ORDER BY id DESC');
    res.json(result.rows);
});

function calculateRubricAndPoints(score) {
    if (score <= 10) return { rubric: 'BE2', points: 1 };
    if (score <= 20) return { rubric: 'BE1', points: 2 };
    if (score <= 30) return { rubric: 'AE2', points: 3 };
    if (score <= 40) return { rubric: 'AE1', points: 4 };
    if (score <= 57) return { rubric: 'ME2', points: 5 };
    if (score <= 74) return { rubric: 'ME1', points: 6 };
    if (score <= 89) return { rubric: 'EE2', points: 7 };
    return { rubric: 'EE1', points: 8 };
}

app.post('/api/admin/open-activity', async (req, res) => {
    const { grade, term, exam_type, subject_id, teacher_id } = req.body;
    await pool.query(`
        INSERT INTO mark_submissions (grade, term, exam_type, subject_id, teacher_id, status, is_open)
        VALUES ($1, $2, $3, $4, $5, 'pending', true)
    `, [grade, term, exam_type, subject_id, teacher_id]);
    res.status(200).send("Activity opened successfully.");
});

app.get('/api/admin/submissions', async (req, res) => {
    const result = await pool.query(`
        SELECT ms.id, ms.grade, ms.term, ms.exam_type, s.subject_name, t.name as teacher_name, ms.status, ms.is_open
        FROM mark_submissions ms
        JOIN subjects s ON ms.subject_id = s.id
        JOIN teachers t ON ms.teacher_id = t.id
        ORDER BY ms.id DESC
    `);
    res.json(result.rows);
});

app.put('/api/admin/approve-marks/:id', async (req, res) => {
    await pool.query(`UPDATE mark_submissions SET status = 'approved', is_open = false WHERE id = $1`, [req.params.id]);
    res.status(200).send("Approved");
});

app.get('/api/admin/marksheet', async (req, res) => {
    const { grade, term, exam_type } = req.query;
    const studentsRes = await pool.query('SELECT * FROM students WHERE grade = $1 ORDER BY name', [grade]);
    const subjectsRes = await pool.query('SELECT * FROM subjects ORDER BY id');
    const marksRes = await pool.query(`
        SELECT sm.student_id, sm.subject_id, sm.score, sm.rubric, sm.points
        FROM student_marks sm
        JOIN students s ON sm.student_id = s.id
        WHERE s.grade = $1 AND sm.term = $2 AND sm.exam_type = $3
    `, [grade, term, exam_type]);

    res.json({ students: studentsRes.rows, subjects: subjectsRes.rows, marks: marksRes.rows });
});

app.get('/api/marks/open-activities', async (req, res) => {
    const result = await pool.query(`
        SELECT ms.id, ms.grade, ms.term, ms.exam_type, s.id as subject_id, s.subject_name, t.name as teacher_name, ms.status
        FROM mark_submissions ms
        JOIN subjects s ON ms.subject_id = s.id
        JOIN teachers t ON ms.teacher_id = t.id
        WHERE ms.is_open = true AND ms.status = 'pending'
        ORDER BY ms.id DESC
    `);
    res.json(result.rows);
});

app.post('/api/marks/submit-scores', async (req, res) => {
    const { submission_id, subject_id, term, exam_type, scoresData } = req.body;
    for (let s of scoresData) {
        const score = Number(s.score);
        const { rubric, points } = calculateRubricAndPoints(score);
        await pool.query(`
            INSERT INTO student_marks (student_id, subject_id, term, exam_type, score, rubric, points)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [s.student_id, subject_id, term, exam_type, score, rubric, points]);
    }
    await pool.query(`UPDATE mark_submissions SET status = 'submitted', is_open = false WHERE id = $1`, [submission_id]);
    res.status(200).send("Submitted");
});

app.get('/api/student/report-card/:student_id', async (req, res) => {
    const term = req.query.term || 'Term 1';
    try {
        const studentRes = await pool.query('SELECT * FROM students WHERE id = $1', [req.params.student_id]);
        if (studentRes.rows.length === 0) return res.status(404).send("Student not found");

        const subjectsRes = await pool.query('SELECT * FROM subjects ORDER BY id');
        const marksRes = await pool.query(`
            SELECT sm.*, s.subject_name, s.subject_code 
            FROM student_marks sm
            JOIN subjects s ON sm.subject_id = s.id
            WHERE sm.student_id = $1 AND sm.term = $2
        `, [req.params.student_id, term]);

        const reportData = subjectsRes.rows.map(sub => {
            const subMarks = marksRes.rows.filter(m => m.subject_id === sub.id);
            const opener = subMarks.find(m => m.exam_type === 'Opener')?.score || '-';
            const midterm = subMarks.find(m => m.exam_type === 'Midterm')?.score || '-';
            const endterm = subMarks.find(m => m.exam_type === 'Endterm')?.score || '-';

            const numericScores = [opener, midterm, endterm].map(Number).filter(n => !isNaN(n));
            let average = '-';
            let rubric = '-';
            let points = '-';

            if (numericScores.length > 0) {
                const sum = numericScores.reduce((a, b) => a + b, 0);
                average = Number((sum / numericScores.length).toFixed(1));
                const calc = calculateRubricAndPoints(average);
                rubric = calc.rubric;
                points = calc.points;
            }

            return { subject_name: sub.subject_name, opener, midterm, endterm, average, rubric, points };
        });

        res.json({
            school: { name: "MABUYE JUNIOR SCHOOL", address: "P.O. BOX 1628 - 50205, WEBUYE" },
            student: studentRes.rows[0],
            term: term,
            reports: reportData
        });
    } catch (err) {
        console.error("Error generating report card:", err);
        res.status(500).send("Server Error");
    }
});

app.get('/api/admin/analysis', async (req, res) => {
    const term = req.query.term || 'Term 1';
    const grade = req.query.grade || 'All';

    try {
        let studentQuery = 'SELECT * FROM students';
        let queryParams = [];
        if (grade !== 'All') {
            studentQuery += ' WHERE grade = $1';
            queryParams.push(grade);
        }

        const studentsRes = await pool.query(studentQuery, queryParams);
        const students = studentsRes.rows;

        const marksRes = await pool.query(`
            SELECT sm.*, s.gender, s.name, s.grade 
            FROM student_marks sm
            JOIN students s ON sm.student_id = s.id
            WHERE sm.term = $1
        `, [term]);

        const studentPerformance = students.map(st => {
            const stMarks = marksRes.rows.filter(m => m.student_id === st.id);
            const totalPoints = stMarks.reduce((sum, m) => sum + Number(m.points || 0), 0);
            const avgScore = stMarks.length > 0 
                ? (stMarks.reduce((sum, m) => sum + Number(m.score || 0), 0) / stMarks.length).toFixed(2) 
                : 0;

            return {
                id: st.id,
                name: st.name,
                admission_no: st.admission_no,
                grade: st.grade,
                gender: st.gender || 'Not Specified',
                totalPoints,
                avgScore: Number(avgScore)
            };
        });

        studentPerformance.sort((a, b) => b.totalPoints - a.totalPoints || b.avgScore - a.avgScore);

        const boys = studentPerformance.filter(s => s.gender.toLowerCase() === 'boy' || s.gender.toLowerCase() === 'male');
        const girls = studentPerformance.filter(s => s.gender.toLowerCase() === 'girl' || s.gender.toLowerCase() === 'female');

        const bestBoy = boys.length > 0 ? boys[0] : null;
        const bestGirl = girls.length > 0 ? girls[0] : null;

        const totalScoreSum = studentPerformance.reduce((sum, s) => sum + s.avgScore, 0);
        const totalPointSum = studentPerformance.reduce((sum, s) => sum + s.totalPoints, 0);
        const schoolMeanScore = studentPerformance.length > 0 ? (totalScoreSum / studentPerformance.length).toFixed(2) : 0;
        const schoolMeanPoints = studentPerformance.length > 0 ? (totalPointSum / studentPerformance.length).toFixed(2) : 0;

        res.json({
            grade,
            term,
            totalStudents: students.length,
            schoolMeanScore,
            schoolMeanPoints,
            bestBoy,
            bestGirl,
            rankings: studentPerformance
        });
    } catch (err) {
        console.error("Error generating analysis:", err);
        res.status(500).send("Server Error");
    }
});

// Bind to 0.0.0.0 so other computers on the LAN/Wi-Fi can connect
app.listen(port, '0.0.0.0', () => {
    // Get local IP address for easy sharing
    const nets = os.networkInterfaces();
    let localIp = 'localhost';
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIp = net.address;
            }
        }
    }
    console.log(`\n============================================================`);
    console.log(`Mabuye Junior School System is running successfully!`);
    console.log(`- Local Access: http://localhost:${port}/login.html`);
    console.log(`- Network Access (for other teachers): http://${localIp}:${port}/login.html`);
    console.log(`============================================================\n`);
});