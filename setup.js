const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    user: 'postgres',
    password: '2026',
    database: 'mabuye_db',
    port: 5432,
});

async function resetAndSetupDatabase() {
    try {
        console.log("Dropping old tables and setting up fresh schema...");
        await pool.query(`
            DROP TABLE IF EXISTS student_marks CASCADE;
            DROP TABLE IF EXISTS mark_submissions CASCADE;
            DROP TABLE IF EXISTS marks CASCADE;
            DROP TABLE IF EXISTS students CASCADE;
            DROP TABLE IF EXISTS subjects CASCADE;
            DROP TABLE IF EXISTS teachers CASCADE;
            DROP TABLE IF EXISTS admins CASCADE;

            CREATE TABLE admins (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(50) NOT NULL
            );

            CREATE TABLE teachers (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(50) NOT NULL,
                name VARCHAR(100),
                role VARCHAR(100),
                assignment TEXT,
                status VARCHAR(20) DEFAULT 'active'
            );

            CREATE TABLE subjects (
                id SERIAL PRIMARY KEY,
                subject_code VARCHAR(20) UNIQUE NOT NULL,
                subject_name VARCHAR(100) NOT NULL
            );

            CREATE TABLE students (
                id SERIAL PRIMARY KEY,
                admission_no VARCHAR(50) UNIQUE NOT NULL,
                name VARCHAR(100) NOT NULL,
                grade VARCHAR(20) NOT NULL,
                gender VARCHAR(20) DEFAULT 'Boy'
            );

            CREATE TABLE mark_submissions (
                id SERIAL PRIMARY KEY,
                grade VARCHAR(20) NOT NULL,
                term VARCHAR(20) NOT NULL,
                exam_type VARCHAR(50) NOT NULL,
                subject_id INT REFERENCES subjects(id),
                teacher_id INT REFERENCES teachers(id),
                status VARCHAR(20) DEFAULT 'pending',
                is_open BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE student_marks (
                id SERIAL PRIMARY KEY,
                student_id INT REFERENCES students(id),
                subject_id INT REFERENCES subjects(id),
                term VARCHAR(20) NOT NULL,
                exam_type VARCHAR(50) NOT NULL,
                score NUMERIC(5,2) DEFAULT 0,
                rubric VARCHAR(10),
                points INT DEFAULT 0
            );
        `);

        // Seed default admins (Hassan, Aswani, Murabwa, Burudi)
        await pool.query(`
            INSERT INTO admins (username, password) VALUES 
            ('Hassan', 'Hassan'),
            ('Aswani', 'Aswani'),
            ('Murabwa', 'Murabwa'),
            ('Burudi', 'Burudi');
        `);

        console.log("Database reset, schema setup with 'gender' column, and seeding completed successfully!");
    } catch (err) {
        console.error("Error setting up database:", err.message);
    } finally {
        await pool.end();
    }
}

resetAndSetupDatabase();