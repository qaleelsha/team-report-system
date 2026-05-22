const express = require('express');
const { Pool } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const app = express();
app.use(express.json());

// 1. Database Connection Configuration (Password-less IAM Auth)
const pool = new Pool({
    host: 'report-db.czkkk844wlrj.eu-north-1.rds.amazonaws.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres'
});

// 2. AWS S3 Client Configuration (Uses the attached EC2 IAM Role automatically)
const s3 = new S3Client({ region: 'eu-north-1' });
const BUCKET_NAME = 'team-report-storage-qsb';

// ==========================================
// EMPLOYEE APIs [cite: 78]
// ==========================================

// POST /employees - Create an employee [cite: 79]
app.post('/employees', async (req, res) => {
    const { name, email } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO employees (name, email) VALUES ($1, $2) RETURNING *',
            [name, email]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /employees - Get all employees [cite: 80]
app.get('/employees', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM employees');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// TEAM APIs [cite: 81]
// ==========================================

// POST /teams - Create a team [cite: 82]
app.post('/teams', async (req, res) => {
    const { team_name } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO teams (team_name) VALUES ($1) RETURNING *',
            [team_name]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /teams - Get all teams [cite: 83]
app.get('/teams', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM teams');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// EMPLOYEE-TEAM MAPPING APIs (Junction Table) [cite: 84, 85]
// ==========================================

// POST /teams/:teamId/employees/:employeeId - Map employee to team [cite: 86]
app.post('/teams/:teamId/employees/:employeeId', async (req, res) => {
    const { teamId, employeeId } = req.params;
    try {
        const result = await pool.query(
            'INSERT INTO employee_teams (employee_id, team_id) VALUES ($1, $2) RETURNING *',
            [employeeId, teamId]
        );
        res.status(201).json({ message: "Employee assigned to team successfully", data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /teams/:teamId/employees - Mandatory JOIN Query [cite: 87, 89, 116, 117]
app.get('/teams/:teamId/employees', async (req, res) => {
    const { teamId } = req.params;
    try {
        const query = `
            SELECT e.id, e.name, e.email, t.team_name 
            FROM employees e
            JOIN employee_teams et ON e.id = et.employee_id
            JOIN teams t ON t.id = et.team_id
            WHERE t.id = $1;
        `;
        const result = await pool.query(query, [teamId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /employees/:employeeId/teams - Mandatory Reverse JOIN Query [cite: 88, 89, 125, 126]
app.get('/employees/:employeeId/teams', async (req, res) => {
    const { employeeId } = req.params;
    try {
        const query = `
            SELECT t.id, t.team_name, et.assigned_at
            FROM teams t
            JOIN employee_teams et ON t.id = et.team_id
            JOIN employees e ON e.id = et.employee_id
            WHERE e.id = $1;
        `;
        const result = await pool.query(query, [employeeId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// REPORT APIs [cite: 90]
// ==========================================

// POST /upload-report - Upload metadata to RDS and dummy string file content to S3 pending folder [cite: 14, 15, 71, 73, 91]
app.post('/upload-report', async (req, res) => {
    const { team_id, uploaded_by, file_name, file_content } = req.body;
    
    // Structure required S3 Key layout [cite: 71, 73]
    const s3Key = `team-${team_id}/pending/${Date.now()}-${file_name}`;

    try {
        // 1. Upload simulated raw data content to S3 folder structure [cite: 14]
        await s3.send(new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key,
            Body: file_content || "Sample report content data line 1\nSample line 2"
        }));

        // 2. Save metadata reference details into RDS relational table [cite: 15]
        const query = `
            INSERT INTO reports (team_id, uploaded_by, file_name, s3_key, status, uploaded_at)
            VALUES ($1, $2, $3, $4, 'pending', CURRENT_TIMESTAMP) RETURNING *;
        `;
        const result = await pool.query(query, [team_id, uploaded_by, file_name, s3Key]);
        
        res.status(201).json({ message: "Report uploaded successfully", database_record: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /reports - Find number of reports uploaded per team (Mandatory Aggregation Query) [cite: 92, 127, 128, 129]
app.get('/reports', async (req, res) => {
    try {
        const query = `
            SELECT t.id as team_id, t.team_name, COUNT(r.id) AS total_reports_uploaded
            FROM teams t
            LEFT JOIN reports r ON t.id = r.team_id
            GROUP BY t.id, t.team_name;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /teams/:teamId/reports - Get reports for a specific team [cite: 93]
app.get('/teams/:teamId/reports', async (req, res) => {
    const { teamId } = req.params;
    try {
        const result = await pool.query('SELECT * FROM reports WHERE team_id = $1', [teamId]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Start application listener server on web standard Port 80
app.listen(80, () => {
    console.log('Production Backend System running smoothly on Port 80');
});
