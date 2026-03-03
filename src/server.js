// ==================================================
// 📁 server.js - Backend API pentru Pontaj ERGIO cu PostgreSQL
// ==================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool, Client, types } = require('pg'); // Import Client as well
const winston = require('winston');

// ================================================
// Configurare pg-types pentru a preveni parsarea automată a datelor
// ================================================
// OID-ul pentru tipul de dată DATE în PostgreSQL este 1082
const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (val) => val);
const axios = require('axios');
const compression = require('compression');
const http = require('http'); // Required for socket.io
const { Server } = require("socket.io"); // Import Server from socket.io
require('dotenv').config();

const app = express();
const server = http.createServer(app); // Create HTTP server
const io = new Server(server, { // Attach socket.io to the server
    cors: {
        origin: "*", // Allow all origins for simplicity, can be configured more securely
        methods: ["GET", "POST"]
    }
});
const PORT = process.env.PORT || 9000;
const HOST = process.env.HOST || '0.0.0.0';

// ================================================
// Configurare logging
// ================================================
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'pontaj-backend' },
    transports: [
        new winston.transports.File({ 
            filename: './logs/error.log', 
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new winston.transports.File({ 
            filename: './logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 10
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// ================================================
// Configurare PostgreSQL
// ================================================
const pool = new Pool({
    user: process.env.DB_USER || 'pontaj_app',
    host: process.env.DB_HOST || '10.129.67.66', // Default to your server IP
    database: process.env.DB_NAME || 'pontaj_ergio',
    password: process.env.DB_PASSWORD || 'pontaj_secure_2024!',
    port: process.env.DB_PORT || 5432,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Event handlers pentru pool
pool.on('connect', () => {
    logger.info('🔗 Conectat la baza de date PostgreSQL');
});

pool.on('error', (err) => {
    logger.error('❌ Eroare conexiune PostgreSQL:', err);
});

// Test conexiune la pornire
pool.query('SELECT NOW()', (err, result) => {
    if (err) {
        logger.error('❌ Imposibil de conectat la PostgreSQL:', err);
        process.exit(1);
    } else {
        logger.info(`✅ PostgreSQL conectat la: ${result.rows[0].now}`);
    }
});

// ================================================
// Middleware-uri
// ================================================

// Securitate
app.use(helmet({
    contentSecurityPolicy: false, // Disabled pentru simplitate
    crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
    origin: '*', // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compresie
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minute
    max: parseInt(process.env.RATE_LIMIT_MAX) || 1000, // max requests per windowMs
    message: {
        error: 'Prea multe cereri din această IP, încercați din nou mai târziu.',
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.url}`, {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            status: res.statusCode,
            duration: `${duration}ms`
        });
    });
    next();
});

// ================================================
// Funcții utilitare pentru baza de date
// ================================================

// Funcția pentru calcularea orelor lucrate a fost eliminată
// deoarece această logică este acum gestionată de trigger-ul `auto_calculate_worked_hours` din baza de date.

async function executeQuery(text, params = []) {
    const client = await pool.connect();
    try {
        const start = Date.now();
        const result = await client.query(text, params);
        const duration = Date.now() - start;
        
        logger.debug('Query executed', {
            text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
            duration: `${duration}ms`,
            rows: result.rows.length
        });
        
        return result;
    } catch (error) {
        logger.error('Database query error:', {
            error: error.message,
            query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
            params: params
        });
        throw error;
    } finally {
        client.release();
    }
}

// ================================================
// Health Check și Info
// ================================================
app.get('/health', async (req, res) => {
    try {
        // Test quick database query
        await executeQuery('SELECT 1');
        
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            database: 'connected',
            uptime: process.uptime(),
            memory: process.memoryUsage()
        });
    } catch (error) {
        logger.error('Health check failed:', error);
        res.status(503).json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: 'Database connection failed'
        });
    }
});


app.get('/info', (req, res) => {
    res.json({
        name: 'Pontaj ERGIO Backend',
        version: '1.0.0',
        description: 'Backend API pentru sistemul de pontaj ERGIO',
        author: 'ERGIO',
        nodejs: process.version,
        platform: process.platform,
        arch: process.arch,
        endpoints: {
            health: '/health',
            api: '/api/*'
        }
    });
});

// ================================================
// API pentru Departamente
// ================================================
app.get('/api/departments', async (req, res) => {
    try {
        const result = await executeQuery(`
            SELECT code, name, description, created_at, updated_at 
            FROM departments 
            ORDER BY code
        `);
        
        // Transformă în formatul așteptat de frontend
        const departmentsObj = {};
        result.rows.forEach(dept => {
            departmentsObj[dept.code] = { 
                name: dept.name, 
                code: dept.code,
                description: dept.description
            };
        });
        
        res.json(departmentsObj);
    } catch (error) {
        logger.error('Error fetching departments:', error);
        res.status(500).json({ 
            error: 'Eroare la încărcarea departamentelor',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ================================================
// API pentru Presetări Schimburi
// ================================================
app.get('/api/shift-presets', async (req, res) => {
    try {
        const result = await executeQuery(`
            SELECT id, name, start_time, end_time, worked_hours, break_minutes, description, active
            FROM shift_presets 
            WHERE active = true 
            ORDER BY id
        `);
        
        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching shift presets:', error);
        res.status(500).json({ 
            error: 'Eroare la încărcarea presetărilor de schimb',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ================================================
// API pentru Angajați - CRUD Complet
// ================================================

// GET /api/employees - Obținere angajați cu filtrare
app.get('/api/employees', async (req, res) => {
    try {
        const { department, includeInactive, date, search } = req.query;
        
        let query = `
            SELECT e.*, d.name as department_name 
            FROM employees e 
            LEFT JOIN departments d ON e.department = d.code
            WHERE 1=1
        `;
        let params = [];

        // Filtru pentru angajați activi/inactivi
        if (!includeInactive) {
            const checkDate = date || new Date().toISOString().split('T')[0];
            query += ` AND e.active = true AND (e.inactive_date IS NULL OR e.inactive_date > $${params.length + 1})`;
            params.push(checkDate);
        }

        // Filtru departament
        if (department) {
            query += ` AND e.department = $${params.length + 1}`;
            params.push(department);
        }

        // Filtru căutare nume
        if (search) {
            query += ` AND (e.name ILIKE $${params.length + 1} OR e.id ILIKE $${params.length + 1})`;
            params.push(`%${search}%`);
        }

        query += ` ORDER BY e.department, e.name`;

        const result = await executeQuery(query, params);
        
        logger.info(`Retrieved ${result.rows.length} employees`, { department, includeInactive });
        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching employees:', error);
        res.status(500).json({ 
            error: 'Eroare la încărcarea angajaților',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// POST /api/employees - Adăugare angajat nou
app.post('/api/employees', async (req, res) => {
    try {
        const { id, name, department, position, shift_type, active, inactive_date, email, phone, notes, contract_type, contract_start_date, contract_end_date } = req.body;

        // Validări
        if (!id || !name || !department) {
            return res.status(400).json({
                error: 'ID, nume și departament sunt obligatorii',
                details: { required: ['id', 'name', 'department'] }
            });
        }

        if (!/^[A-Z]{1,3}\d+$/.test(id.toUpperCase())) {
            return res.status(400).json({
                error: 'ID-ul trebuie să aibă formatul: cod departament + număr (ex: DC1, FA2)',
                details: { format: 'Litere majuscule urmate de cifre' }
            });
        }

        // Verifică dacă ID-ul există deja
        const existingResult = await executeQuery('SELECT id FROM employees WHERE UPPER(id) = UPPER($1)', [id]);
        if (existingResult.rows.length > 0) {
            return res.status(409).json({
                error: `Angajatul cu ID-ul ${id.toUpperCase()} există deja`,
                details: { conflictId: id.toUpperCase() }
            });
        }

        // Verifică dacă departamentul există
        const deptExistsResult = await executeQuery('SELECT code FROM departments WHERE code = $1', [department]);
        if (deptExistsResult.rows.length === 0) {
            return res.status(400).json({
                error: `Departamentul ${department} nu există`,
                details: { invalidDepartment: department }
            });
        }

        // Inserare angajat
        const insertQuery = `
            INSERT INTO employees (id, name, department, position, shift_type, active, inactive_date, email, phone, notes, hire_date, contract_type, contract_start_date, contract_end_date)
            VALUES (UPPER($1), UPPER($2), $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_DATE, $11, $12, $13)
            RETURNING *
        `;

        const result = await executeQuery(insertQuery, [
            id, name, department, position || 'Operator',
            shift_type || 'SCHIMB_I', active !== false, inactive_date || null,
            email || null, phone || null, notes || null,
            contract_type || 'nedeterminata',
            contract_start_date || null,
            contract_end_date || null
        ]);

        logger.info(`Employee added: ${id} - ${name}`, { department, position });
        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error('Error adding employee:', error);
        res.status(500).json({ 
            error: 'Eroare la adăugarea angajatului',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// PUT /api/employees/:id - Actualizare angajat
app.put('/api/employees/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, department, position, shift_type, active, inactive_date, email, phone, notes, contract_type, contract_start_date, contract_end_date } = req.body;

        logger.info(`PUT /api/employees/${id} - Body received:`, {
            contract_type,
            contract_start_date,
            contract_end_date,
            body_keys: Object.keys(req.body)
        });

        // Verifică dacă angajatul există
        const existingResult = await executeQuery('SELECT id FROM employees WHERE UPPER(id) = UPPER($1)', [id]);
        if (existingResult.rows.length === 0) {
            return res.status(404).json({
                error: `Angajatul cu ID-ul ${id} nu există`,
                details: { notFoundId: id }
            });
        }

        // Verifică dacă departamentul există (dacă este furnizat)
        if (department) {
            const deptExistsResult = await executeQuery('SELECT code FROM departments WHERE code = $1', [department]);
            if (deptExistsResult.rows.length === 0) {
                return res.status(400).json({
                    error: `Departamentul ${department} nu există`,
                    details: { invalidDepartment: department }
                });
            }
        }

        // Actualizare angajat
        const updateQuery = `
            UPDATE employees
            SET name = COALESCE(UPPER($2), name),
                department = COALESCE($3, department),
                position = COALESCE($4, position),
                shift_type = COALESCE($5, shift_type),
                active = COALESCE($6, active),
                inactive_date = $7,
                email = $8,
                phone = $9,
                notes = $10,
                contract_type = $11,
                contract_start_date = $12,
                contract_end_date = $13,
                updated_at = CURRENT_TIMESTAMP
            WHERE UPPER(id) = UPPER($1)
            RETURNING *
        `;

        const result = await executeQuery(updateQuery, [
            id, name, department, position, shift_type, active,
            inactive_date, email, phone, notes,
            contract_type || 'nedeterminata', contract_start_date || null, contract_end_date || null
        ]);

        logger.info(`Employee updated: ${id}`, {
            contract_type_sent: contract_type,
            contract_type_param: contract_type || 'nedeterminata',
            contract_type_returned: result.rows[0]?.contract_type,
            rowCount: result.rowCount
        });
        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error updating employee:', error);
        res.status(500).json({ 
            error: 'Eroare la actualizarea angajatului',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// DELETE /api/employees/:id - Ștergere angajat
app.delete('/api/employees/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Verifică dacă angajatul are înregistrări de pontaj
        const recordsResult = await executeQuery(
            'SELECT COUNT(*) as count FROM time_records WHERE UPPER(employee_id) = UPPER($1)', 
            [id]
        );
        
        const hasRecords = parseInt(recordsResult.rows[0].count) > 0;

        if (hasRecords) {
            // Soft delete - dezactivare
            await executeQuery(`
                UPDATE employees 
                SET active = false, inactive_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP 
                WHERE UPPER(id) = UPPER($1)
            `, [id]);
            
            logger.info(`Employee deactivated (soft delete): ${id}`);
            res.json({ 
                type: 'soft_delete', 
                affected: 1,
                message: 'Angajat dezactivat (are înregistrări de pontaj)'
            });
        } else {
            // Hard delete - ștergere completă
            const result = await executeQuery('DELETE FROM employees WHERE UPPER(id) = UPPER($1)', [id]);
            
            if (result.rowCount === 0) {
                return res.status(404).json({ 
                    error: `Angajatul cu ID-ul ${id} nu există`,
                    details: { notFoundId: id }
                });
            }
            
            logger.info(`Employee deleted completely: ${id}`);
            res.json({ 
                type: 'hard_delete', 
                affected: 1,
                message: 'Angajat șters complet'
            });
        }
    } catch (error) {
        logger.error('Error deleting employee:', error);
        res.status(500).json({ 
            error: 'Eroare la ștergerea angajatului',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ================================================
// API pentru Pontaj - CORECTAT
// ================================================

// GET /api/time-records - Obținere înregistrări pontaj (CORECTARE COMPLETĂ)
app.get('/api/time-records', async (req, res) => {
    try {
        const { employeeId, department, date, startDate, endDate, limit } = req.query;

        let query = `SELECT * FROM time_records WHERE 1=1`;
        let params = [];

        // Filtru angajat specific
        if (employeeId) {
            query += ` AND UPPER(employee_id) = UPPER($${params.length + 1})`;
            params.push(employeeId);
        }

        if (department) {
            query += ` AND employee_id IN (SELECT id FROM employees WHERE department = $${params.length + 1})`;
            params.push(department);
        }

        // Filtru dată specifică (CORECTARE: date în loc de tr.date)
        if (date) {
            query += ` AND date = $${params.length + 1}`;
            params.push(date);
        }
        // Sau interval de date (CORECTARE: date în loc de tr.date)
        else if (startDate && endDate) {
            query += ` AND date BETWEEN $${params.length + 1} AND $${params.length + 2}`;
            params.push(startDate, endDate);
        }

        // Limitare rezultate dacă este specificat
        if (limit && !isNaN(limit)) {
            query += ` LIMIT $${params.length + 1}`;
            params.push(parseInt(limit));
        }

        const result = await executeQuery(query, params);
        
        // Procesează records pentru a asigura că worked_hours este un număr
        const processedRecords = result.rows.map(record => ({
            ...record,
            worked_hours: record.worked_hours ? parseFloat(record.worked_hours) : 0,
            break_minutes: record.break_minutes ? parseInt(record.break_minutes) : 0
        }));
        
        logger.info(`Retrieved ${processedRecords.length} time records`, { 
            employeeId, department, date, startDate, endDate 
        });
        res.json(processedRecords);
    } catch (error) {
        logger.error('Error fetching time records:', error);
        res.status(500).json({ 
            error: 'Eroare la încărcarea înregistrărilor de pontaj',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// POST /api/time-records - Salvare înregistrare pontaj
app.post('/api/time-records', async (req, res) => {
    try {
        // Se extrag datele din request. `worked_hours` este ignorat, deoarece trigger-ul îl va calcula.
        const { employee_id, date, start_time, end_time, shift_type, status, notes, break_minutes } = req.body;

        // Validări esențiale
        if (!employee_id || !date) {
            return res.status(400).json({ 
                error: 'ID angajat și data sunt obligatorii',
                details: { required: ['employee_id', 'date'] }
            });
        }

        // Verifică dacă angajatul există
        const empExistsResult = await executeQuery(
            'SELECT id FROM employees WHERE UPPER(id) = UPPER($1) AND active = true', 
            [employee_id]
        );
        if (empExistsResult.rows.length === 0) {
            return res.status(404).json({ 
                error: `Angajatul ${employee_id} nu există sau nu este activ`,
                details: { invalidEmployeeId: employee_id }
            });
        }

        // Validare format dată (opțional, dar recomandat)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return res.status(400).json({ 
                error: 'Format dată invalid. Se așteaptă YYYY-MM-DD',
                details: { invalidDate: date }
            });
        }

        // Logica de calcul a fost eliminată din aplicație.
        // Acum se bazează pe trigger-ul `auto_calculate_worked_hours` din baza de date.
        // Aplicația doar trimite datele primite de la client.

        // Inserare/actualizare înregistrare pontaj
        // `worked_hours` a fost eliminat din lista de câmpuri INSERT, deoarece este calculat de trigger.
        const insertQuery = `
            INSERT INTO time_records (employee_id, date, start_time, end_time, shift_type, status, notes, break_minutes)
            VALUES (UPPER($1), TO_DATE($2, 'YYYY-MM-DD'), $3, $4, $5, $6, $7, $8)
            ON CONFLICT (employee_id, date) 
            DO UPDATE SET 
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                shift_type = EXCLUDED.shift_type,
                status = EXCLUDED.status,
                notes = EXCLUDED.notes,
                break_minutes = EXCLUDED.break_minutes
            RETURNING *
        `;

        const result = await executeQuery(insertQuery, [
            employee_id, date, start_time || null, end_time || null,
            shift_type || null, status || 'present', notes || null, break_minutes || null
        ]);

        logger.info(`Time record saved: ${employee_id} - ${date}`, { 
            status: result.rows[0].status 
        });
        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error saving time record:', error);
        res.status(500).json({
            error: 'Eroare la salvarea înregistrării de pontaj: ' + error.message
        });
    }
});

// ================================================
// API pentru Presetări Schimburi
// ================================================

// POST /api/apply-shift-preset - Aplicare preset schimb pentru mai mulți angajați
app.post('/api/apply-shift-preset', async (req, res) => {
    try {
        const { employeeIds, date, shiftType } = req.body;

        // Validări
        if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
            return res.status(400).json({ 
                error: 'Lista de ID-uri angajați este obligatorie',
                details: { required: 'employeeIds (array)' }
            });
        }

        if (!date || !shiftType) {
            return res.status(400).json({ 
                error: 'Data și tipul de schimb sunt obligatorii',
                details: { required: ['date', 'shiftType'] }
            });
        }

        // Obține detaliile presetului
        const presetsResult = await executeQuery(
            'SELECT * FROM shift_presets WHERE id = $1 AND active = true', 
            [shiftType]
        );
        
        if (presetsResult.rows.length === 0) {
            return res.status(404).json({ 
                error: `Presetul de schimb '${shiftType}' nu există sau nu este activ`,
                details: { invalidShiftType: shiftType }
            });
        }

        const preset = presetsResult.rows[0];

        // Verifică că toți angajații există și sunt activi
        const employeesCheckResult = await executeQuery(`
            SELECT id FROM employees 
            WHERE UPPER(id) = ANY($1::text[]) AND active = true
        `, [employeeIds.map(id => id.toUpperCase())]);

        const foundIds = employeesCheckResult.rows.map(e => e.id);
        const missingIds = employeeIds.filter(id => 
            !foundIds.includes(id.toUpperCase())
        );

        if (missingIds.length > 0) {
            return res.status(400).json({
                error: 'Unii angajați nu există sau nu sunt activi',
                details: { missingEmployees: missingIds }
            });
        }

        // Aplică presetul pentru toți angajații în tranzacție
        const client = await pool.connect();
        let applied = 0;
        
        try {
            await client.query('BEGIN');

            for (const employeeId of employeeIds) {
                await client.query(`
                    INSERT INTO time_records (employee_id, date, start_time, end_time, worked_hours, break_minutes, shift_type, status)
                    VALUES (UPPER($1), TO_DATE($2, 'YYYY-MM-DD'), $3, $4, $5, $6, $7, 'present')
                    ON CONFLICT (employee_id, date) 
                    DO UPDATE SET 
                        start_time = EXCLUDED.start_time,
                        end_time = EXCLUDED.end_time,
                        worked_hours = EXCLUDED.worked_hours,
                        break_minutes = EXCLUDED.break_minutes,
                        shift_type = EXCLUDED.shift_type,
                        status = 'present',
                        updated_at = CURRENT_TIMESTAMP
                `, [employeeId, date, preset.start_time, preset.end_time, 
                    preset.worked_hours, preset.break_minutes, shiftType]);
                
                applied++;
            }

            await client.query('COMMIT');

            logger.info(`Shift preset ${shiftType} applied`, { 
                date, employeeCount: applied, preset: preset.name 
            });
            
            res.json({ 
                success: true, 
                applied,
                shiftType,
                presetName: preset.name,
                date,
                details: {
                    startTime: preset.start_time,
                    endTime: preset.end_time,
                    workedHours: preset.worked_hours
                }
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        logger.error('Error applying shift preset:', error);
        res.status(500).json({ 
            error: 'Eroare la aplicarea presetului de schimb',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ================================================
// API pentru Import Angajați
// ================================================

// POST /api/import-predefined-employees - Import angajați predefiniti
app.post('/api/import-predefined-employees', async (req, res) => {
    try {
        const predefinedEmployees = [
            { id: 'DC1', name: 'AMIHAESEI FANEL', department: 'DC' },
            { id: 'DC2', name: 'BOBEICA COSTEL-CLAUDEL', department: 'DC' },
            { id: 'DC3', name: 'CIOCAN MARIN', department: 'DC' },
            { id: 'DC4', name: 'TARANU CONSTANTIN', department: 'DC' },
            { id: 'FA1', name: 'APETRI DOINA', department: 'FA' },
            { id: 'FA2', name: 'AXENTE DRAGOS MIHAI', department: 'FA' },
            { id: 'FA3', name: 'BILIBOK MARIA', department: 'FA' },
            { id: 'FA4', name: 'BOCA MIRELA', department: 'FA' },
            { id: 'FA5', name: 'BOGASIU RADU', department: 'FA' },
            { id: 'FA6', name: 'BOGASIU ALINA', department: 'FA' },
            { id: 'FA7', name: 'BARBU CRISTIAN', department: 'FA' },
            { id: 'FA8', name: 'CAPSTRAMB GABRIELA', department: 'FA' },
            { id: 'FA9', name: 'DECENKO LUISA-TALIDA', department: 'FA' },
            { id: 'FA10', name: 'FULGA MIHAI CATALIN', department: 'FA' },
            { id: 'FA11', name: 'GABOR CRISTIAN', department: 'FA' },
            { id: 'FA12', name: 'JASWINDER PAL', department: 'FA' },
            { id: 'FA13', name: 'MANAILA CATALIN', department: 'FA' },
            { id: 'FA14', name: 'MITITEIU ANA', department: 'FA' },
            { id: 'FA15', name: 'NEGRU DANIEL', department: 'FA' },
            { id: 'FA16', name: 'NICA NICOLAIE', department: 'FA' },
            { id: 'FA20', name: 'TARANU DUMITRU', department: 'FA' },
            { id: 'FA21', name: 'TINTARU ANDREI IONUT', department: 'FA' },
            { id: 'MO1', name: 'ENCIU FLORIN', department: 'MO' },
            { id: 'MO2', name: 'JULEI VASILE-NICUSOR', department: 'MO' },
            { id: 'MO3', name: 'NASTASA VASILE', department: 'MO' },
            { id: 'MO4', name: 'NEAGU FLORIN', department: 'MO' },
            { id: 'AM1', name: 'POPESCU ION', department: 'AM' },
            { id: 'AM2', name: 'SHATRUDHAN MAHTO', department: 'AM' },
            { id: 'PC1', name: 'BRATESCU MIHAI SEBASTIAN', department: 'PC' },
            { id: 'DI1', name: 'ALBU NELA', department: 'DI' },
            { id: 'DI2', name: 'BULEAC NICOLA', department: 'DI' },
            { id: 'DI3', name: 'CONDREA VASILE', department: 'DI' },
            { id: 'DI4', name: 'MAHU GHEORGHE', department: 'DI' },
            { id: 'DI5', name: 'RADUCA LENUTA', department: 'DI' },
            { id: 'DI6', name: 'AGACHE VASILE', department: 'DI' },
            { id: 'MA1', name: 'BUCUR MIOARA', department: 'MA' },
            { id: 'MA2', name: 'COMANECI IONELA', department: 'MA' },
            { id: 'TE1', name: 'AVADANEI SIMONA', department: 'TE' },
            { id: 'TE2', name: 'DOUS CIPRIAN', department: 'TE' },
            { id: 'TE3', name: 'DANAILA FANEL', department: 'TE' },
            { id: 'TE4', name: 'ICHIM NICOLETA', department: 'TE' },
            { id: 'TE5', name: 'LEONTE LAURA', department: 'TE' },
            { id: 'TE6', name: 'MANOLACHE ANCA', department: 'TE' },
            { id: 'TE7', name: 'MICLOS MIHAELA', department: 'TE' },
            { id: 'TE8', name: 'MIHAI MIHAITA', department: 'TE' },
            { id: 'TE9', name: 'MIHAIES LARISA', department: 'TE' },
            { id: 'TE10', name: 'MOISA CONSTANTIN MARIAN', department: 'TE' },
            { id: 'TE11', name: 'PADURARU RALUCA ELENA', department: 'TE' },
            { id: 'TE12', name: 'PANA BOGDAN COSMIN', department: 'TE' },
            { id: 'TE13', name: 'PAPAGHIUC CRISTINA IRINA', department: 'TE' },
            { id: 'TE14', name: 'POPA ALEXANDRA MARIA', department: 'TE' },
            { id: 'TE15', name: 'POTOROACA OANA', department: 'TE' },
            { id: 'TE16', name: 'RUSU RALUCA ANDREEA', department: 'TE' },
            { id: 'TE17', name: 'SPIRIDON ROXANA ANDREEA', department: 'TE' },
            { id: 'TE18', name: 'VATAVU STEFANIA', department: 'TE' },
            { id: 'TE19', name: 'VIZITEU VALENTIN', department: 'TE' },
            { id: 'AU1', name: 'EMPLOYEE AUTO 1', department: 'AU' },
            { id: 'AU2', name: 'EMPLOYEE AUTO 2', department: 'AU' }
        ];

        let imported = 0;
        let updated = 0;
        let errors = [];

        // Funcție pentru determinarea schimbului implicit
        const getDefaultShift = (dept) => {
            switch (dept) {
                case 'FA':
                case 'MO':
                    return 'SCHIMB_I';
                case 'TE':
                case 'AM':
                    return 'TESA1';
                default:
                    return 'SCHIMB_I';
            }
        };

        // Import în tranzacție
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            for (const emp of predefinedEmployees) {
                try {
                    const shiftType = getDefaultShift(emp.department);
                    
                    const result = await client.query(`
                        INSERT INTO employees (id, name, department, position, shift_type, hire_date)
                        VALUES ($1, $2, $3, 'Operator', $4, CURRENT_DATE)
                        ON CONFLICT (id) 
                        DO UPDATE SET 
                            name = EXCLUDED.name,
                            department = EXCLUDED.department,
                            shift_type = EXCLUDED.shift_type,
                            updated_at = CURRENT_TIMESTAMP
                        RETURNING (xmax = 0) AS inserted
                    `, [emp.id, emp.name, emp.department, shiftType]);

                    if (result.rows[0].inserted) {
                        imported++;
                    } else {
                        updated++;
                    }
                } catch (error) {
                    logger.error(`Error importing employee ${emp.id}:`, error);
                    errors.push({ id: emp.id, error: error.message });
                }
            }

            await client.query('COMMIT');

            logger.info(`Predefined employees import completed`, { 
                imported, updated, errors: errors.length, total: predefinedEmployees.length 
            });

            res.json({ 
                success: true, 
                imported, 
                updated, 
                errors: errors.length > 0 ? errors : undefined,
                total: predefinedEmployees.length 
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        logger.error('Error importing predefined employees:', error);
        res.status(500).json({ 
            error: 'Eroare la importul angajaților predefiniti',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ================================================
// API pentru Rapoarte - COMPLET CORECTAT
// ================================================

// GET /api/reports/collective - Generare raport colectiv (COMPLET CORECTAT)
app.get('/api/reports/collective', async (req, res) => {
    try {
        const { year, month, department } = req.query;

        // Validări
        if (!year || month === undefined) {
            return res.status(400).json({ 
                error: 'Anul și luna sunt obligatorii',
                details: { required: ['year', 'month'] }
            });
        }

        const yearInt = parseInt(year);
        const monthInt = parseInt(month);

        if (isNaN(yearInt) || isNaN(monthInt) || monthInt < 0 || monthInt > 11) {
            return res.status(400).json({ 
                error: 'Anul și luna trebuie să fie numere valide',
                details: { year: 'format YYYY', month: '0-11 (Ianuarie=0, Decembrie=11)' }
            });
        }

        logger.info(`Generating collective report for ${yearInt}-${monthInt + 1} (month ${monthInt})`, { department });

        // Calculează datele pentru luna respectivă
        const startDate = new Date(yearInt, monthInt, 1);
        const endDate = new Date(yearInt, monthInt + 1, 0); // Ultima zi din lună

      const startDateStr = `${yearInt}-${String(monthInt + 1).padStart(2, '0')}-01`;
        const lastDay = new Date(yearInt, monthInt + 1, 0).getDate();
        const endDateStr = `${yearInt}-${String(monthInt + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;


        logger.info(`Date range: ${startDateStr} to ${endDateStr}`);

        // Obține angajații activi în perioada respectivă
        let employeesQuery = `
            SELECT e.*, d.name as department_name 
            FROM employees e 
            LEFT JOIN departments d ON e.department = d.code
            WHERE e.active = true 
            AND (e.inactive_date IS NULL OR e.inactive_date > $1)
        `;
        const employeesParams = [endDateStr];

        if (department) {
            employeesQuery += ' AND e.department = $2';
            employeesParams.push(department);
        }
        employeesQuery += ' ORDER BY e.department, e.name';
        
        const employeesResult = await executeQuery(employeesQuery, employeesParams);
        const employees = employeesResult.rows;
        logger.info(`Found ${employees.length} employees`);

        if (employees.length === 0) {
            logger.warn(`No employees found for report`, { year: yearInt, month: monthInt, department });
            return res.json({ 
                employees: [], 
                timeRecords: [], 
                holidays: [],
                metadata: {
                    year: yearInt,
                    month: monthInt,
                    department,
                    startDate: startDateStr,
                    endDate: endDateStr,
                    employeeCount: 0,
                    recordCount: 0
                }
            });
        }

        // Obține înregistrările de pontaj pentru perioada respectivă
      let timeRecordsQuery = `
                SELECT 
                    tr.employee_id,
                    tr.date::text as date,
                    tr.start_time,
                    tr.end_time,
                    CAST(tr.worked_hours AS NUMERIC) as worked_hours,
                    tr.break_minutes,
                    tr.shift_type,
                    tr.status,
                    tr.notes,
                    e.name as employee_name, 
                    e.department 
                FROM time_records tr
                JOIN employees e ON tr.employee_id = e.id
                WHERE tr.date >= $1::date AND tr.date <= $2::date
            `;
            const timeRecordsParams = [startDateStr, endDateStr];

            if (department) {
                timeRecordsQuery += ' AND e.department = $3';
                timeRecordsParams.push(department);
            }

            timeRecordsQuery += ' ORDER BY tr.date, e.department, e.name';
            const timeRecordsResult = await executeQuery(timeRecordsQuery, timeRecordsParams);
            const timeRecords = timeRecordsResult.rows;

        logger.info(`Found ${timeRecords.length} time records for date range ${startDateStr} to ${endDateStr}`);

        // Debug: log some sample records
        if (timeRecords.length > 0) {
            logger.info('Sample time records:', timeRecords.slice(0, 3).map(r => ({
                employee_id: r.employee_id,
                date: r.date,
                start_time: r.start_time,
                end_time: r.end_time,
                worked_hours: r.worked_hours,
                status: r.status
            })));
        }

        // Obține sărbătorile legale pentru anul respectiv
        const holidaysQuery = 'SELECT date FROM legal_holidays WHERE EXTRACT(YEAR FROM date) = $1';
        const holidaysResult = await executeQuery(holidaysQuery, [yearInt]);
        const holidays = holidaysResult.rows.map(r => r.date);

        // Procesează înregistrările pentru a asigura formatul corect
        const processedTimeRecords = timeRecords.map(record => {
            // Asigură-te că worked_hours este un număr valid
            let workedHours = 0;
            if (record.worked_hours !== null && record.worked_hours !== undefined) {
                workedHours = parseFloat(record.worked_hours);
                if (isNaN(workedHours)) {
                    workedHours = 0;
                }
            }

            return {
                employee_id: record.employee_id,
                date: record.date,
                start_time: record.start_time,
                end_time: record.end_time,
                worked_hours: workedHours,
                break_minutes: record.break_minutes ? parseInt(record.break_minutes) : 0,
                shift_type: record.shift_type,
                status: record.status || 'present',
                notes: record.notes,
                employee_name: record.employee_name,
                department: record.department
            };
        });

        logger.info(`Generated collective report successfully`, { 
            year: yearInt, 
            month: monthInt, 
            department, 
            employees: employees.length, 
            records: processedTimeRecords.length,
            holidays: holidays.length,
            dateRange: `${startDateStr} - ${endDateStr}`
        });

        // Log statistics despre ore lucrate
        const totalHours = processedTimeRecords.reduce((sum, r) => sum + (r.worked_hours || 0), 0);
        const recordsWithHours = processedTimeRecords.filter(r => r.worked_hours > 0).length;
        logger.info(`Hours statistics: ${totalHours.toFixed(1)} total hours, ${recordsWithHours} records with hours`);

        res.json({ 
            employees, 
            timeRecords: processedTimeRecords, 
            holidays,
            metadata: {
                year: yearInt,
                month: monthInt,
                department,
                startDate: startDateStr,
                endDate: endDateStr,
                employeeCount: employees.length,
                recordCount: processedTimeRecords.length,
                holidayCount: holidays.length,
                totalHours: totalHours,
                recordsWithHours: recordsWithHours
            }
        });
    } catch (error) {
        logger.error('Error generating collective report:', error);
        res.status(500).json({ 
            error: 'Eroare la generarea raportului colectiv',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Pentru debugging, adaugă și acest endpoint care îți arată ce date ai în baza de date:
app.get('/api/debug/time-records', async (req, res) => {
    try {
        const { month, year } = req.query;
        
        if (!month || !year) {
            return res.status(400).json({ error: 'Month and year required' });
        }
        
        const startDate = `${year}-${String(parseInt(month) + 1).padStart(2, '0')}-01`;
        const endDate = new Date(parseInt(year), parseInt(month) + 1, 0).toISOString().split('T')[0];
        
        const result = await executeQuery(`
            SELECT * FROM time_records 
            WHERE date >= $1 AND date <= $2 
            ORDER BY date, employee_id
            LIMIT 20
        `, [startDate, endDate]);
        
        res.json({
            dateRange: `${startDate} - ${endDate}`,
            sampleRecords: result.rows,
            totalCount: result.rows.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================================================
// API pentru Sărbători Legale
// ================================================

// POST /api/holidays/import/:year - Import sărbători legale pentru un an
app.post('/api/holidays/import/:year', async (req, res) => {
    try {
        const { year } = req.params;

        if (!year || year.length !== 4 || isNaN(parseInt(year))) {
            return res.status(400).json({ 
                error: 'Anul trebuie să aibă 4 cifre',
                details: { invalidYear: year, expectedFormat: 'YYYY' }
            });
        }

        logger.info(`Importing legal holidays for year ${year}`);

        // Încearcă să obțină sărbătorile de la API-ul public
        const response = await axios.get(
            `https://date.nager.at/api/v3/PublicHolidays/${year}/RO`,
            { timeout: 10000 }
        );
        
        const holidays = response.data;

        if (!Array.isArray(holidays)) {
            throw new Error('Invalid response format from holidays API');
        }

        let count = 0;
        const errors = [];

        // Import în tranzacție
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            for (const holiday of holidays) {
                try {
                    await client.query(`
                        INSERT INTO legal_holidays (date, name, type)
                        VALUES ($1, $2, 'national')
                        ON CONFLICT (date) DO UPDATE SET
                            name = EXCLUDED.name,
                            type = EXCLUDED.type
                    `, [holiday.date, holiday.localName]);
                    count++;
                } catch (error) {
                    logger.error(`Error inserting holiday ${holiday.date}:`, error);
                    errors.push({ date: holiday.date, error: error.message });
                }
            }

            await client.query('COMMIT');

            logger.info(`Imported ${count} legal holidays for year ${year}`, { errors: errors.length });
            
            res.json({ 
                success: true, 
                count,
                year: parseInt(year),
                errors: errors.length > 0 ? errors : undefined
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        logger.error('Error importing legal holidays:', error);
        
        if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            res.status(503).json({ 
                error: 'Nu se poate conecta la serviciul de sărbători legale',
                details: 'Verificați conexiunea la internet'
            });
        } else {
            res.status(500).json({ 
                error: 'Eroare la importul sărbătorilor legale',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
});

// GET /api/holidays/:year - Obținere sărbători legale pentru un an
app.get('/api/holidays/:year', async (req, res) => {
    try {
        const { year } = req.params;

        if (!year || year.length !== 4 || isNaN(parseInt(year))) {
            return res.status(400).json({ 
                error: 'Anul trebuie să aibă 4 cifre',
                details: { invalidYear: year, expectedFormat: 'YYYY' }
            });
        }

        const result = await executeQuery(`
            SELECT id, date, name, type, recurring, created_at
            FROM legal_holidays 
            WHERE EXTRACT(YEAR FROM date) = $1 
            ORDER BY date
        `, [parseInt(year)]);
        
        logger.info(`Retrieved ${result.rows.length} holidays for year ${year}`);
        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching legal holidays:', error);
        res.status(500).json({ 
            error: 'Eroare la încărcarea sărbătorilor legale',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ================================================
// API pentru contracte expirare
// ================================================

// GET /api/employees/expiring-contracts - Angajați cu contract determinat care expiră în 7 zile
app.get('/api/employees/expiring-contracts', async (req, res) => {
    try {
        const result = await executeQuery(`
            SELECT e.*, d.name as department_name
            FROM employees e
            LEFT JOIN departments d ON e.department = d.code
            WHERE e.active = true
              AND e.contract_type = 'determinata'
              AND e.contract_end_date IS NOT NULL
              AND e.contract_end_date <= CURRENT_DATE + INTERVAL '7 days'
              AND e.contract_end_date >= CURRENT_DATE
            ORDER BY e.contract_end_date ASC
        `);

        res.json(result.rows);
    } catch (error) {
        logger.error('Error fetching expiring contracts:', error);
        res.status(500).json({ error: 'Eroare la verificarea contractelor' });
    }
});

// PUT /api/employees/:id/contract-action - Acțiuni contract
app.put('/api/employees/:id/contract-action', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, new_end_date } = req.body;

        const existingResult = await executeQuery('SELECT * FROM employees WHERE UPPER(id) = UPPER($1)', [id]);
        if (existingResult.rows.length === 0) {
            return res.status(404).json({ error: `Angajatul cu ID-ul ${id} nu există` });
        }

        let result;
        switch (action) {
            case 'convert_nedeterminata':
                result = await executeQuery(`
                    UPDATE employees
                    SET contract_type = 'nedeterminata',
                        contract_end_date = NULL,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE UPPER(id) = UPPER($1)
                    RETURNING *
                `, [id]);
                break;

            case 'incheie_contract':
                result = await executeQuery(`
                    UPDATE employees
                    SET active = false,
                        inactive_date = COALESCE(contract_end_date, CURRENT_DATE),
                        contract_type = 'incheiat',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE UPPER(id) = UPPER($1)
                    RETURNING *
                `, [id]);
                break;

            case 'prelungeste_contract':
                if (!new_end_date) {
                    return res.status(400).json({ error: 'Data nouă de sfârșit este obligatorie' });
                }
                result = await executeQuery(`
                    UPDATE employees
                    SET contract_end_date = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE UPPER(id) = UPPER($1)
                    RETURNING *
                `, [id, new_end_date]);
                break;

            default:
                return res.status(400).json({ error: 'Acțiune invalidă' });
        }

        logger.info(`Contract action '${action}' for employee ${id}`);
        res.json(result.rows[0]);
    } catch (error) {
        logger.error('Error performing contract action:', error);
        res.status(500).json({ error: 'Eroare la executarea acțiunii pe contract' });
    }
});

// ================================================
// Error handling middleware
// ================================================
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
    });

    res.status(500).json({ 
        error: 'Eroare internă de server',
        timestamp: new Date().toISOString(),
        requestId: req.headers['x-request-id'] || 'unknown'
    });
});

// 404 handler
app.use((req, res) => {
    logger.warn(`404 - Route not found: ${req.method} ${req.url}`, { ip: req.ip });
    res.status(404).json({ 
        error: 'Ruta nu a fost găsită',
        method: req.method,
        url: req.url,
        availableEndpoints: {
            health: '/health',
            info: '/info',
            api: '/api/*'
        }
    });
});

// ================================================
// Configurare PostgreSQL Listener
// ================================================
function setupPostgresListener() {
    const listenerClient = new Client({
        user: process.env.DB_USER || 'pontaj_app',
        host: process.env.DB_HOST || '10.129.67.66', // Default to your server IP
        database: process.env.DB_NAME || 'pontaj_ergio',
        password: process.env.DB_PASSWORD || 'pontaj_secure_2024!',
        port: process.env.DB_PORT || 5432,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });

    listenerClient.connect(err => {
        if (err) {
            logger.error('❌ Could not connect to PostgreSQL for listening:', err);
            // Retry connection after a delay
            setTimeout(setupPostgresListener, 10000);
            return;
        }
        logger.info('🔗 Listener client connected to PostgreSQL');
        listenerClient.query('LISTEN data_changed');
        logger.info('📢 Listening for "data_changed" notifications...');
    });

    listenerClient.on('notification', (msg) => {
        logger.info(`🔔 Notification received on channel ${msg.channel}:`, { payload: msg.payload });
        // Emit a WebSocket event to all connected clients
        io.emit('database_changed', {
            table: msg.payload,
            timestamp: new Date().toISOString()
        });
    });

    listenerClient.on('end', () => {
        logger.warn('🔌 Listener client connection ended. Reconnecting...');
        setTimeout(setupPostgresListener, 5000);
    });
}


// ================================================
// Migrare bază de date - coloane contract CIM
// ================================================
async function migrateContractColumns() {
    try {
        // Verifică dacă coloana contract_type există deja
        const checkCol = await executeQuery(`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'employees' AND column_name = 'contract_type'
        `);

        if (checkCol.rows.length === 0) {
            logger.info('Migrare: Adăugare coloane contract CIM...');
            await executeQuery(`ALTER TABLE employees ADD COLUMN contract_type VARCHAR(20) DEFAULT 'nedeterminata'`);
            await executeQuery(`ALTER TABLE employees ADD COLUMN contract_start_date DATE`);
            await executeQuery(`ALTER TABLE employees ADD COLUMN contract_end_date DATE`);

            // Populează contract_start_date din hire_date pentru angajații existenți
            await executeQuery(`
                UPDATE employees
                SET contract_type = 'nedeterminata',
                    contract_start_date = hire_date
                WHERE contract_type IS NULL OR contract_start_date IS NULL
            `);

            logger.info('Migrare contract CIM completă.');
        } else {
            // Asigură-te că datele existente sunt populate
            await executeQuery(`
                UPDATE employees
                SET contract_type = 'nedeterminata'
                WHERE contract_type IS NULL
            `);
            await executeQuery(`
                UPDATE employees
                SET contract_start_date = hire_date
                WHERE contract_start_date IS NULL AND hire_date IS NOT NULL
            `);
        }
    } catch (error) {
        logger.error('Eroare la migrarea coloanelor contract:', error);
    }
}

// ================================================
// Migrare bază de date - adăugare status paid_leave
// ================================================
async function migratePaidLeaveStatus() {
    try {
        // Verifică dacă paid_leave este deja permis în CHECK constraint
        const checkConstraint = await executeQuery(`
            SELECT con.conname, pg_get_constraintdef(con.oid) as def
            FROM pg_constraint con
            JOIN pg_class rel ON rel.oid = con.conrelid
            WHERE rel.relname = 'time_records'
              AND con.contype = 'c'
              AND pg_get_constraintdef(con.oid) LIKE '%status%'
        `);

        if (checkConstraint.rows.length > 0) {
            const constraint = checkConstraint.rows[0];
            if (constraint.def.includes('paid_leave')) {
                logger.info('Status paid_leave deja existent în constraint.');
                return;
            }
            logger.warn(`⚠️ Constraint-ul "${constraint.conname}" NU conține paid_leave. Rulați manual cu user postgres:`);
            logger.warn(`ALTER TABLE time_records DROP CONSTRAINT ${constraint.conname}; ALTER TABLE time_records ADD CONSTRAINT ${constraint.conname} CHECK (status::text = ANY (ARRAY['present','absent','sick','vacation','delegation','unpaid','liber','paid_leave']::text[]));`);
        }
    } catch (error) {
        logger.error('Eroare la verificarea constraint paid_leave:', error);
    }
}

// ================================================
// Pornire server
// ================================================
async function startServer() {
    try {
        // Test conexiunea la baza de date
        await pool.query('SELECT NOW()');
        logger.info('✅ Conexiunea la baza de date PostgreSQL a fost verificată cu succes');

        // Rulează migrarea coloanelor contract
        await migrateContractColumns();

        // Rulează migrarea status paid_leave
        await migratePaidLeaveStatus();

        // Pornire server
        server.listen(PORT, HOST, () => { // Use server.listen instead of app.listen
            logger.info(`🚀 Server Pontaj ERGIO pornit pe http://${HOST}:${PORT}`);
            logger.info(`📊 Health check disponibil la: http://${HOST}:${PORT}/health`);
            logger.info(`🔗 API base URL: http://${HOST}:${PORT}/api`);
            logger.info(`📝 Info endpoint: http://${HOST}:${PORT}/info`);
            logger.info('⚡️ WebSocket server is running');

            // Log environment info
            logger.info('Server environment:', {
                nodeEnv: process.env.NODE_ENV || 'development',
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
                uptime: process.uptime()
            });

            // Start the PostgreSQL listener
            setupPostgresListener();
        });
        
        io.on('connection', (socket) => {
            logger.info(`🔌 New client connected: ${socket.id}`);

            socket.on('delete_records_by_date', async (data, callback) => {
                try {
                    const { date } = data;
                    const dateObj = new Date(date);
                    if (isNaN(dateObj.getTime())) {
                        return callback({ success: false, error: 'Format dată invalid' });
                    }

                    const deleteQuery = 'DELETE FROM time_records WHERE date = $1';
                    const result = await executeQuery(deleteQuery, [date]);

                    logger.info(`Time records deleted for date via WebSocket: ${date}`, { affectedRows: result.rowCount });
                    callback({ success: true, message: `Înregistrările pentru data de ${date} au fost șterse.`, affectedRows: result.rowCount });
                    
                    // Notify all clients about the change
                    io.emit('database_changed', { table: 'time_records', date });

                } catch (error) {
                    logger.error('Error deleting time records by date via WebSocket:', error);
                    callback({ success: false, error: 'Eroare la ștergerea înregistrărilor' });
                }
            });

            socket.on('disconnect', () => {
                logger.info(`🔌 Client disconnected: ${socket.id}`);
            });
        });

        // Handle server errors
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                logger.error(`❌ Portul ${PORT} este deja utilizat`);
                process.exit(1);
            } else {
                logger.error('❌ Eroare server:', error);
                process.exit(1);
            }
        });

        return server;
    } catch (error) {
        logger.error('❌ Eroare la pornirea serverului:', error);
        process.exit(1);
    }
}

// ================================================
// Graceful shutdown
// ================================================
process.on('SIGINT', async () => {
    logger.info('📴 Oprire server (SIGINT)...');
    await gracefulShutdown();
});

process.on('SIGTERM', async () => {
    logger.info('📴 Oprire server (SIGTERM)...');
    await gracefulShutdown();
});

process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught Exception:', error);
    gracefulShutdown().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown().then(() => process.exit(1));
});

async function gracefulShutdown() {
    try {
        logger.info('🔄 Closing database connections...');
        await pool.end();
        logger.info('✅ Database connections closed');
        
        logger.info('✅ Server shutdown complete');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

// ================================================
// Start the server
// ================================================
if (require.main === module) {
    startServer();
}

module.exports = app;