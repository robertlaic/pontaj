// ==================================================
// 📁 src/main.js - Cu CRUD Complet și Calculul Corect al Orelor
// ==================================================
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const Store = require('electron-store');
const fs = require('fs');

// Configurare store pentru setări
const store = new Store();

let mainWindow;
let db;

// Departamentele companiei
const DEPARTMENTS = {
    'DC': { name: 'Depozit Cherestea', code: 'DC' },
    'FA': { name: 'Fabrica', code: 'FA' },
    'MO': { name: 'Echipa Montaj', code: 'MO' },
    'AM': { name: 'Atelier Mecanic', code: 'AM' },
    'PC': { name: 'Paza cazan', code: 'PC' },
    'DI': { name: 'Diversi', code: 'DI' },
    'AU': { name: 'Auto', code: 'AU' },
    'MA': { name: 'Magazia', code: 'MA' },
    'TE': { name: 'TESA', code: 'TE' }
};

// Presetări schimburi (cu pauze deduse)
const SHIFT_PRESETS = {
    'SCHIMB_I': { name: 'Schimb I', start: '07:00', end: '15:30', hours: 8.0, break_minutes: 30 },
    'SCHIMB_II': { name: 'Schimb II', start: '15:30', end: '00:00', hours: 8.0, break_minutes: 30 },
    'TURA': { name: 'Tură', start: '07:00', end: '20:00', hours: 12.0, break_minutes: 60 }
};

// Calea către baza de date
const dbPath = path.join(app.getPath('userData'), 'pontaj.db');

// Helper function pentru calculul orelor lucrate cu pauze
function calculateWorkedHours(startTime, endTime, breakMinutes = 0) {
    if (!startTime || !endTime) return 0;
    
    const start = new Date(`2000-01-01 ${startTime}`);
    let end = new Date(`2000-01-01 ${endTime}`);
    
    // Handle overnight shifts
    if (end <= start) {
        end.setDate(end.getDate() + 1);
    }
    
    const diffMs = end - start;
    const totalHours = diffMs / (1000 * 60 * 60);
    const workedHours = totalHours - (breakMinutes / 60);
    
    return Math.max(0, Math.round(workedHours * 4) / 4); // Round to quarter hours
}

function getDefaultShiftForDepartment(department) {
    switch (department) {
        case 'FA':
        case 'MO':
            return 'SCHIMB_I';
        case 'TE':
        case 'AM':
            return 'TURA';
        default:
            return 'SCHIMB_I';
    }
}

// Funcții de parsare CSV
function parseCSVEmployees(csvContent) {
    const lines = csvContent.split('\n');
    const employees = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const columns = line.split(',').map(col => col.replace(/"/g, '').trim());
            if (columns.length >= 2) {
                const id = columns[0];
                const name = columns[1];
                if (id && name) {
                    const department = id.match(/^([A-Z]+)/)?.[1] || 'DI';
                    
                    employees.push({
                        id: id.toUpperCase(),
                        name: name.toUpperCase(),
                        department: department,
                        position: 'Operator',
                        shift_type: getDefaultShiftForDepartment(department)
                    });
                }
            }
        }
    }
    
    return employees;
}

// Lista predefinită de angajați din imagini
function loadPredefinedEmployees() {
    return [
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
        { id: 'TE19', name: 'VIZITEU VALENTIN', department: 'TE' }
    ].map(emp => ({
        ...emp,
        position: 'Operator',
        shift_type: getDefaultShiftForDepartment(emp.department)
    }));
}

// Funcții pentru operații bază de date
function checkEmployeeExists(employeeId) {
    return new Promise((resolve, reject) => {
        db.get("SELECT id FROM employees WHERE id = ?", [employeeId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function insertEmployee(employee) {
    return new Promise((resolve, reject) => {
        const { id, name, department, position, shift_type } = employee;
        db.run(
            "INSERT INTO employees (id, name, department, position, shift_type) VALUES (?, ?, ?, ?, ?)",
            [id, name, department, position, shift_type],
            function(err) {
                if (err) reject(err);
                else resolve({ ...employee, created_at: new Date().toISOString(), active: 1 });
            }
        );
    });
}

function updateEmployeeInDB(employee) {
    return new Promise((resolve, reject) => {
        const { id, name, department, position, shift_type, active, inactive_date } = employee;
        db.run(
            "UPDATE employees SET name = ?, department = ?, position = ?, shift_type = ?, active = ?, inactive_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [name, department, position, shift_type, active, inactive_date, id],
            function(err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

function deleteEmployeeFromDB(employeeId) {
    return new Promise((resolve, reject) => {
        // Check if employee has time records
        db.get("SELECT COUNT(*) as count FROM time_records WHERE employee_id = ?", [employeeId], (err, row) => {
            if (err) {
                reject(err);
                return;
            }

            if (row.count > 0) {
                // Soft delete - just deactivate
                db.run("UPDATE employees SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [employeeId], function(err) {
                    if (err) reject(err);
                    else resolve({ type: 'soft_delete', affected: this.changes });
                });
            } else {
                // Hard delete - completely remove
                db.run("DELETE FROM employees WHERE id = ?", [employeeId], function(err) {
                    if (err) reject(err);
                    else resolve({ type: 'hard_delete', affected: this.changes });
                });
            }
        });
    });
}

// Verifică și migrează structura bazei de date
function checkAndMigrateDatabase() {
    return new Promise((resolve, reject) => {
        console.log('Verificănd structura bazei de date...');
        
        // Verifică dacă există coloana department
        db.all("PRAGMA table_info(employees)", (err, columns) => {
            if (err) {
                reject(err);
                return;
            }

            const hasDepartment = columns.some(col => col.name === 'department');
            const hasInactiveDate = columns.some(col => col.name === 'inactive_date');

            const migrations = [];

            if (!hasDepartment) {
                migrations.push(new Promise((res, rej) => {
                    console.log('Coloana department lipsește. Migrând baza de date...');
                    const hasSection = columns.some(col => col.name === 'section');
                    if (hasSection) {
                        db.run("ALTER TABLE employees RENAME COLUMN section TO department", (err) => {
                            if (err) {
                                db.run("ALTER TABLE employees ADD COLUMN department TEXT DEFAULT 'DI'", (err2) => {
                                    if (err2) rej(err2);
                                    else migrateDepartmentData(res, rej);
                                });
                            } else {
                                res();
                            }
                        });
                    } else {
                        db.run("ALTER TABLE employees ADD COLUMN department TEXT DEFAULT 'DI'", (err) => {
                            if (err) rej(err);
                            else migrateDepartmentData(res, rej);
                        });
                    }
                }));
            }

            if (!hasInactiveDate) {
                migrations.push(new Promise((res, rej) => {
                    console.log('Adăugând coloana inactive_date...');
                    db.run("ALTER TABLE employees ADD COLUMN inactive_date DATE", (err) => {
                        if (err) rej(err);
                        else {
                            console.log('Coloana inactive_date adăugată cu succes');
                            res();
                        }
                    });
                }));
            }

            if (migrations.length > 0) {
                Promise.all(migrations).then(() => resolve()).catch(reject);
            } else {
                console.log('Structura bazei de date este OK');
                resolve();
            }
        });
    });
}

// Migrează datele departamentului pe baza ID-ului
function migrateDepartmentData(resolve, reject) {
    console.log('Migrând datele departamentului...');
    
    db.all("SELECT id FROM employees WHERE department IS NULL OR department = ''", (err, rows) => {
        if (err) {
            reject(err);
            return;
        }
        
        if (rows.length === 0) {
            resolve();
            return;
        }
        
        const stmt = db.prepare("UPDATE employees SET department = ? WHERE id = ?");
        
        rows.forEach(row => {
            const department = row.id.match(/^([A-Z]+)/)?.[1] || 'DI';
            stmt.run([department, row.id]);
        });
        
        stmt.finalize((err) => {
            if (err) {
                reject(err);
            } else {
                console.log(`Migrat departamentul pentru ${rows.length} angajați`);
                resolve();
            }
        });
    });
}

// Verifică și adaugă coloanele lipsă în time_records
function checkTimeRecordsTable() {
    return new Promise((resolve, reject) => {
        db.all("PRAGMA table_info(time_records)", (err, columns) => {
            if (err) {
                reject(err);
                return;
            }
            
            const hasBreakMinutes = columns.some(col => col.name === 'break_minutes');
            
            if (!hasBreakMinutes) {
                console.log('Adăugând coloana break_minutes...');
                db.run("ALTER TABLE time_records ADD COLUMN break_minutes INTEGER DEFAULT 0", (err) => {
                    if (err) {
                        console.error('Eroare la adăugarea coloanei break_minutes:', err);
                        reject(err);
                    } else {
                        console.log('Coloana break_minutes adăugată cu succes');
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    });
}

// Inițializare baza de date
async function initializeDatabase() {
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Eroare la deschiderea bazei de date:', err);
            return;
        }
        console.log('Conectat la baza de date SQLite:', dbPath);
    });

    try {
        // Activare foreign keys
        await new Promise((resolve, reject) => {
            db.run("PRAGMA foreign_keys = ON", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Crearea tabelelor de bază
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                // Tabelul angajați
                db.run(`CREATE TABLE IF NOT EXISTS employees (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    department TEXT DEFAULT 'DI',
                    position TEXT DEFAULT 'Operator',
                    shift_type TEXT DEFAULT 'SCHIMB_I',
                    active BOOLEAN DEFAULT 1,
                    inactive_date DATE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`);

                // Tabelul înregistrări pontaj
                db.run(`CREATE TABLE IF NOT EXISTS time_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    employee_id TEXT NOT NULL,
                    date DATE NOT NULL,
                    start_time TIME,
                    end_time TIME,
                    worked_hours DECIMAL(4,2) DEFAULT 0,
                    break_minutes INTEGER DEFAULT 0,
                    shift_type TEXT,
                    status TEXT DEFAULT 'present',
                    notes TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (employee_id) REFERENCES employees(id),
                    UNIQUE(employee_id, date)
                )`);

                // Tabelul pentru presetări schimburi
                db.run(`CREATE TABLE IF NOT EXISTS shift_presets (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    start_time TIME NOT NULL,
                    end_time TIME NOT NULL,
                    worked_hours DECIMAL(4,2) NOT NULL,
                    break_minutes INTEGER DEFAULT 30,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`, resolve);
            });
        });

        // Verifică și migrează structura
        await checkAndMigrateDatabase();
        await checkTimeRecordsTable();

        // Inserare presetări schimburi
        await new Promise((resolve, reject) => {
            db.get("SELECT COUNT(*) as count FROM shift_presets", (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (row.count === 0) {
                    const stmt = db.prepare("INSERT INTO shift_presets (id, name, start_time, end_time, worked_hours, break_minutes) VALUES (?, ?, ?, ?, ?, ?)");
                    Object.keys(SHIFT_PRESETS).forEach(key => {
                        const preset = SHIFT_PRESETS[key];
                        stmt.run([key, preset.name, preset.start, preset.end, preset.hours, preset.break_minutes]);
                    });
                    stmt.finalize((err) => {
                        if (err) reject(err);
                        else {
                            console.log('Presetări schimburi create cu succes cu pauze incluse');
                            resolve();
                        }
                    });
                } else {
                    resolve();
                }
            });
        });

        console.log('Inițializarea bazei de date completă cu succes');

    } catch (error) {
        console.error('Eroare la inițializarea bazei de date:', error);
    }
}

// Crearea ferestrei principale
function createMainWindow() {
    mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    nodeIntegration: false,
    contextIsolation: true,
    additionalArguments: ['--lang=ro']
  }
});


    mainWindow.loadFile('src/renderer/index.html');

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        
        if (process.env.NODE_ENV === 'development') {
            mainWindow.webContents.openDevTools();
        }
    });

    createMenu();
}

// Enhanced Menu cu import
function createMenu() {
    const template = [
        {
            label: 'Fișier',
            submenu: [
                {
                    label: 'Import Angajați Predefiniti',
                    click: () => {
                        mainWindow.webContents.send('menu-import-predefined');
                    }
                },
                {
                    label: 'Import din CSV',
                    accelerator: 'CmdOrCtrl+Shift+I',
                    click: () => {
                        mainWindow.webContents.send('menu-import-csv');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Reset Bază de Date',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'warning',
                            buttons: ['Anulează', 'Reset'],
                            defaultId: 0,
                            title: 'Reset Bază de Date',
                            message: 'Sigur doriți să resetați baza de date?',
                            detail: 'Toate datele vor fi șterse și baza de date va fi recreată cu angajații predefiniti.'
                        }).then((result) => {
                            if (result.response === 1) {
                                resetDatabase();
                            }
                        });
                    }
                },
                { type: 'separator' },
                {
                    label: 'Export Date',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => {
                        mainWindow.webContents.send('menu-export');
                    }
                },
                { type: 'separator' },
                {
                    label: 'Ieșire',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Pontaj',
            submenu: [
                {
                    label: 'Setează Schimb I (7:00-15:30, 8h lucrate)',
                    click: () => {
                        mainWindow.webContents.send('menu-set-shift', 'SCHIMB_I');
                    }
                },
                {
                    label: 'Setează Schimb II (15:30-00:00, 8h lucrate)',
                    click: () => {
                        mainWindow.webContents.send('menu-set-shift', 'SCHIMB_II');
                    }
                },
                {
                    label: 'Setează Tură (7:00-20:00, 12h lucrate)',
                    click: () => {
                        mainWindow.webContents.send('menu-set-shift', 'TURA');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Reset baza de date
function resetDatabase() {
    if (db) {
        db.close();
    }
    
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
        console.log('Baza de date ștearsă');
    }
    
    // Reinițializează
    setTimeout(() => {
        initializeDatabase();
        mainWindow.reload();
    }, 1000);
}

// Event listeners pentru app
app.whenReady().then(() => {
    initializeDatabase().then(() => {
        createMainWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    if (db) {
        db.close();
    }
});

// ==================================================
// IPC Handlers - CRUD Complet
// ==================================================

// Adăugare angajat
ipcMain.handle('add-employee', async (event, employee) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Verifică dacă ID-ul există deja
            const existingEmployee = await checkEmployeeExists(employee.id);
            if (existingEmployee) {
                reject(new Error(`Angajatul cu ID-ul ${employee.id} există deja`));
                return;
            }

            const savedEmployee = await insertEmployee(employee);
            resolve(savedEmployee);
        } catch (error) {
            reject(error);
        }
    });
});

// Actualizare angajat
ipcMain.handle('update-employee', async (event, employee) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Verifică dacă angajatul există
            const existingEmployee = await checkEmployeeExists(employee.id);
            if (!existingEmployee) {
                reject(new Error(`Angajatul cu ID-ul ${employee.id} nu există`));
                return;
            }

            await updateEmployeeInDB(employee);
            resolve({ success: true });
        } catch (error) {
            reject(error);
        }
    });
});

// Ștergere angajat
ipcMain.handle('delete-employee', async (event, employeeId) => {
    return new Promise(async (resolve, reject) => {
        try {
            const result = await deleteEmployeeFromDB(employeeId);
            resolve(result);
        } catch (error) {
            reject(error);
        }
    });
});

// Import angajați predefiniti
ipcMain.handle('import-predefined-employees', async () => {
    return new Promise(async (resolve, reject) => {
        try {
            const employees = loadPredefinedEmployees();
            let imported = 0;
            let updated = 0;

            for (const emp of employees) {
                try {
                    const existingEmployee = await checkEmployeeExists(emp.id);
                    
                    if (existingEmployee) {
                        await updateEmployeeInDB(emp);
                        updated++;
                    } else {
                        await insertEmployee(emp);
                        imported++;
                    }
                } catch (error) {
                    console.error(`Eroare la ${emp.id}:`, error.message);
                }
            }

            resolve({ success: true, imported, updated, total: employees.length });
        } catch (error) {
            reject(error);
        }
    });
});

// Import angajați din CSV
ipcMain.handle('import-employees-from-csv', async () => {
    return new Promise(async (resolve, reject) => {
        try {
            const { filePaths } = await dialog.showOpenDialog(mainWindow, {
                title: 'Import Angajați din CSV',
                filters: [
                    { name: 'CSV Files', extensions: ['csv'] },
                    { name: 'Text Files', extensions: ['txt'] }
                ],
                properties: ['openFile']
            });

            if (filePaths && filePaths.length > 0) {
                const filePath = filePaths[0];
                const csvContent = fs.readFileSync(filePath, 'utf8');
                const employees = parseCSVEmployees(csvContent);

                let imported = 0;
                let updated = 0;

                for (const emp of employees) {
                    try {
                        const existingEmployee = await checkEmployeeExists(emp.id);
                        
                        if (existingEmployee) {
                            await updateEmployeeInDB(emp);
                            updated++;
                        } else {
                            await insertEmployee(emp);
                            imported++;
                        }
                    } catch (error) {
                        console.error(`Eroare la ${emp.id}:`, error.message);
                    }
                }

                resolve({ success: true, imported, updated, total: employees.length });
            } else {
                resolve({ cancelled: true });
            }
        } catch (error) {
            reject(error);
        }
    });
});

// Obținere angajați cu filtrare pe departament
ipcMain.handle('get-employees', async (event, filters) => {
    return new Promise((resolve, reject) => {
        let query = "SELECT * FROM employees";
        let params = [];
        const whereClauses = [];

        if (filters && filters.includeInactive) {
            // No status filter, get all
        } else {
            const date = filters?.date || new Date().toISOString().split('T')[0];
            whereClauses.push("(active = 1 AND (inactive_date IS NULL OR inactive_date > ?))");
            params.push(date);
        }

        if (filters && filters.department) {
            whereClauses.push("department = ?");
            params.push(filters.department);
        }
        
        if (whereClauses.length > 0) {
            query += " WHERE " + whereClauses.join(" AND ");
        }

        query += " ORDER BY department, name";

        db.all(query, params, (err, rows) => {
            if (err) {
                console.error('Eroare la obținerea angajaților:', err);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
});

// Obținere departamente
ipcMain.handle('get-departments', async () => {
    return Promise.resolve(DEPARTMENTS);
});

// Obținere presetări schimburi
ipcMain.handle('get-shift-presets', async () => {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM shift_presets ORDER BY id", (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
});

// Aplicare preset schimb
ipcMain.handle('apply-shift-preset', async (event, data) => {
    return new Promise((resolve, reject) => {
        const { employeeIds, date, shiftType } = data;
        
        db.get("SELECT * FROM shift_presets WHERE id = ?", [shiftType], (err, preset) => {
            if (err) {
                reject(err);
                return;
            }

            if (!preset) {
                reject(new Error('Preset schimb nu există'));
                return;
            }

            const promises = employeeIds.map(employeeId => {
                return new Promise((res, rej) => {
                    db.run(
                        "INSERT OR REPLACE INTO time_records (employee_id, date, start_time, end_time, worked_hours, break_minutes, shift_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        [employeeId, date, preset.start_time, preset.end_time, preset.worked_hours, preset.break_minutes, shiftType, 'present'],
                        function(err) {
                            if (err) rej(err);
                            else res();
                        }
                    );
                });
            });

            Promise.all(promises)
                .then(() => resolve({ success: true, applied: employeeIds.length }))
                .catch(reject);
        });
    });
});

// Obținere înregistrări pontaj
ipcMain.handle('get-time-records', async (event, params) => {
    return new Promise((resolve, reject) => {
        let query = `
            SELECT tr.*, e.name as employee_name, e.department 
            FROM time_records tr 
            JOIN employees e ON tr.employee_id = e.id 
            WHERE 1=1
        `;
        let queryParams = [];

        if (params.employeeId) {
            query += " AND tr.employee_id = ?";
            queryParams.push(params.employeeId);
        }

        if (params.department) {
            query += " AND e.department = ?";
            queryParams.push(params.department);
        }

        if (params.date) {
            query += " AND tr.date = ?";
            queryParams.push(params.date);
        }

        query += " ORDER BY tr.date DESC, e.department, e.name";

        db.all(query, queryParams, (err, rows) => {
            if (err) {
                console.error('Eroare la obținerea înregistrărilor pontaj:', err);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
});

// Salvare înregistrare pontaj cu calculul corect al orelor
ipcMain.handle('save-time-record', async (event, record) => {
    return new Promise((resolve, reject) => {
        const { employee_id, date, start_time, end_time, shift_type, status, notes } = record;
        
        // Calculul automat al orelor lucrate cu pauze
        let worked_hours = 0;
        let break_minutes = 0;
        
        if (start_time && end_time) {
            // Determină pauza pe baza tipului de schimb sau a timpului total
            const totalHours = calculateWorkedHours(start_time, end_time, 0); // fără pauze
            
            if (shift_type === 'TURA' || totalHours > 10) {
                break_minutes = 60; // 60 minute pauză pentru ture lungi
            } else {
                break_minutes = 30; // 30 minute pauză pentru schimburi normale
            }
            
            worked_hours = calculateWorkedHours(start_time, end_time, break_minutes);
        }

        db.run(
            "INSERT OR REPLACE INTO time_records (employee_id, date, start_time, end_time, worked_hours, break_minutes, shift_type, status, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)",
            [employee_id, date, start_time, end_time, worked_hours, break_minutes, shift_type, status, notes],
            function(err) {
                if (err) {
                    console.error('Eroare la salvarea pontajului:', err);
                    reject(err);
                } else {
                    resolve({ id: this.lastID, ...record, worked_hours, break_minutes });
                }
            }
        );
    });
});

// Calculul orelor lucrate (helper pentru renderer)
ipcMain.handle('calculate-worked-hours', async (event, data) => {
    const { start_time, end_time, shift_type } = data;
    
    let break_minutes = 0;
    const totalHours = calculateWorkedHours(start_time, end_time, 0); // fără pauze
    
    if (shift_type === 'TURA' || totalHours > 10) {
        break_minutes = 60; // 60 minute pentru ture lungi
    } else {
        break_minutes = 30; // 30 minute pentru schimburi normale
    }
    
    const worked_hours = calculateWorkedHours(start_time, end_time, break_minutes);
    
    return {
        worked_hours,
        break_minutes,
        total_interval: totalHours // fără pauze
    };
});

// Export baza de date
ipcMain.handle('export-database', async () => {
    return new Promise(async (resolve, reject) => {
        try {
            const { filePath } = await dialog.showSaveDialog(mainWindow, {
                title: 'Export Bază de Date',
                defaultPath: `pontaj_export_${new Date().toISOString().split('T')[0]}.json`,
                filters: [
                    { name: 'JSON Files', extensions: ['json'] }
                ]
            });

            if (filePath) {
                // Export employees and time records
                const employees = await new Promise((res, rej) => {
                    db.all("SELECT * FROM employees", (err, rows) => {
                        if (err) rej(err);
                        else res(rows);
                    });
                });

                const timeRecords = await new Promise((res, rej) => {
                    db.all("SELECT * FROM time_records", (err, rows) => {
                        if (err) rej(err);
                        else res(rows);
                    });
                });

                const exportData = {
                    exportDate: new Date().toISOString(),
                    version: '1.0',
                    employees,
                    timeRecords
                };

                fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));
                resolve({ success: true, filePath });
            } else {
                resolve({ cancelled: true });
            }
        } catch (error) {
            reject(error);
        }
    });
});

console.log('✅ Main process enhanced cu CRUD complet și calculul corect al orelor');