// ==================================================
// 📁 main.js - Actualizat pentru Backend PostgreSQL
// ==================================================
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const XLSX = require('xlsx-style');

let mainWindow;

// Configurarea API-ului backend
const API_BASE_URL = process.env.API_BASE_URL || 'http://10.129.67.66:9000/api';
const API_HEALTH_URL = process.env.API_HEALTH_URL || 'http://10.129.67.66:9000/health';

// Configurare axios cu timeout și retry logic
const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Pontaj-Desktop-App/1.0.0'
    }
});

// Interceptor pentru retry logic
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const { config } = error;
        
        if (!config._retry && error.code === 'ECONNREFUSED') {
            config._retry = true;
            
            // Așteaptă 2 secunde și încearcă din nou
            await new Promise(resolve => setTimeout(resolve, 2000));
            return api(config);
        }
        
        return Promise.reject(error);
    }
);

// Helper function pentru API calls
async function apiCall(method, endpoint, data = null, params = null) {
    try {
        const config = {
            method,
            url: endpoint,
            ...(data && { data }),
            ...(params && { params })
        };
        
        const response = await api(config);
        return response.data;
    } catch (error) {
        console.error(`API Error [${method.toUpperCase()} ${endpoint}]:`, error.message);
        
        if (error.response) {
            throw new Error(error.response.data?.error || 'Eroare server');
        } else if (error.code === 'ECONNREFUSED') {
            throw new Error('Nu se poate conecta la server. Verificați dacă serverul rulează.');
        } else if (error.code === 'ENOTFOUND') {
            throw new Error('Server indisponibil. Verificați conexiunea la internet.');
        } else {
            throw new Error('Eroare de conexiune la server');
        }
    }
}

// Verificarea conexiunii la server la pornire
async function checkServerConnection() {
    try {
        const response = await axios.get(API_HEALTH_URL, { timeout: 5000 });
        console.log('✅ Conexiune la server verificată:', response.data);
        return true;
    } catch (error) {
        console.error('❌ Nu se poate conecta la server:', error.message);
        return false;
    }
}

// Departamentele companiei (fallback local)
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

// Funcții pentru parsare CSV (păstrate pentru import local)
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

function getDefaultShiftForDepartment(department) {
    switch (department) {
        case 'FA':
        case 'MO':
            return 'SCHIMB_I';
        case 'TE':
        case 'AM':
            return 'TESA1';
        default:
            return 'SCHIMB_I';
    }
}

// Crearea ferestrei principale
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: process.platform === 'darwin' ? 
            path.join(__dirname, 'assets', 'pontaj.icns') : 
            path.join(__dirname, 'assets', 'pontaj.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'src', 'preload.js'),
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
                    label: 'Verificare Conexiune Server',
                    click: async () => {
                        const connected = await checkServerConnection();
                        dialog.showMessageBox(mainWindow, {
                            type: connected ? 'info' : 'error',
                            title: 'Status Conexiune',
                            message: connected ? 
                                'Conexiunea la server este funcțională!' : 
                                'Nu se poate conecta la server. Verificați configurarea.',
                            detail: connected ? 
                                `Server: ${API_BASE_URL}` : 
                                'Asigurați-vă că serverul backend rulează pe portul 9000.'
                        });
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
                    label: 'Setează Tură (7:00-19:00, 11h lucrate)',
                    click: () => {
                        mainWindow.webContents.send('menu-set-shift', 'TURA');
                    }
                }
            ]
        },
        {
            label: 'Ajutor',
            submenu: [
                {
                    label: 'Despre',
                    click: () => {
                        dialog.showMessageBox(mainWindow, {
                            type: 'info',
                            title: 'Despre Pontaj ERGIO',
                            message: 'Sistem de Pontaj ERGIO',
                            detail: `Versiune: 1.0.0\nServer: ${API_BASE_URL}\nDezvoltare: 2024`
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Event listeners pentru app
app.whenReady().then(async () => {
    // Verifică conexiunea la server înainte de a deschide fereastra
    const connected = await checkServerConnection();
    
    if (!connected) {
        const result = await dialog.showMessageBox({
            type: 'warning',
            buttons: ['Continuă oricum', 'Ieșire'],
            defaultId: 1,
            title: 'Conexiune Server',
            message: 'Nu se poate conecta la serverul de pontaj!',
            detail: `Server configurat: ${API_BASE_URL}\n\nDoriți să continuați? Aplicația va funcționa în modul offline limitat.`
        });

        if (result.response === 1) {
            app.quit();
            return;
        }
    }

    createMainWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ==================================================
// IPC Handlers - Actualizate pentru Backend API
// ==================================================

// Obținere departamente
ipcMain.handle('get-departments', async () => {
    try {
        return await apiCall('get', '/departments');
    } catch (error) {
        console.warn('Folosind departamente locale:', error.message);
        return DEPARTMENTS; // fallback la departamentele locale
    }
});

// Obținere presetări schimburi
ipcMain.handle('get-shift-presets', async () => {
    try {
        return await apiCall('get', '/shift-presets');
    } catch (error) {
        console.error('Error fetching shift presets:', error);
        throw error;
    }
});

// ================================================
// Operații Angajați - CRUD prin API
// ================================================

// Obținere angajați
ipcMain.handle('get-employees', async (event, filters) => {
    try {
        return await apiCall('get', '/employees', null, filters);
    } catch (error) {
        console.error('Error fetching employees:', error);
        throw error;
    }
});

// Adăugare angajat
ipcMain.handle('add-employee', async (event, employee) => {
    try {
        return await apiCall('post', '/employees', employee);
    } catch (error) {
        console.error('Error adding employee:', error);
        throw error;
    }
});

// Actualizare angajat
ipcMain.handle('update-employee', async (event, employee) => {
    try {
        return await apiCall('put', `/employees/${employee.id}`, employee);
    } catch (error) {
        console.error('Error updating employee:', error);
        throw error;
    }
});

// Ștergere angajat
ipcMain.handle('delete-employee', async (event, employeeId) => {
    try {
        return await apiCall('delete', `/employees/${employeeId}`);
    } catch (error) {
        console.error('Error deleting employee:', error);
        throw error;
    }
});

// ================================================
// Import Angajați
// ================================================

// Import angajați predefiniti
ipcMain.handle('import-predefined-employees', async () => {
    try {
        return await apiCall('post', '/import-predefined-employees');
    } catch (error) {
        console.error('Error importing predefined employees:', error);
        throw error;
    }
});

// Import angajați din CSV
ipcMain.handle('import-employees-from-csv', async () => {
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
            let errors = [];

            for (const emp of employees) {
                try {
                    // Încearcă să adauge angajatul
                    try {
                        await apiCall('post', '/employees', emp);
                        imported++;
                    } catch (addError) {
                        if (addError.message.includes('există deja')) {
                            // Dacă există, încearcă actualizarea
                            await apiCall('put', `/employees/${emp.id}`, emp);
                            updated++;
                        } else {
                            throw addError;
                        }
                    }
                } catch (error) {
                    console.error(`Eroare la ${emp.id}:`, error.message);
                    errors.push(`${emp.id}: ${error.message}`);
                }
            }

            const result = { success: true, imported, updated, total: employees.length };
            
            if (errors.length > 0) {
                result.errors = errors;
                result.warning = `${errors.length} angajați nu au putut fi importați`;
            }

            return result;
        } else {
            return { cancelled: true };
        }
    } catch (error) {
        console.error('Error in CSV import:', error);
        throw error;
    }
});

// ================================================
// Operații Pontaj
// ================================================

// Obținere înregistrări pontaj
ipcMain.handle('get-time-records', async (event, params) => {
    try {
        return await apiCall('get', '/time-records', null, params);
    } catch (error) {
        console.error('Error fetching time records:', error);
        throw error;
    }
});

// Salvare înregistrare pontaj
ipcMain.handle('save-time-record', async (event, record) => {
    try {
        return await apiCall('post', '/time-records', record);
    } catch (error) {
        console.error('Error saving time record:', error);
        throw error;
    }
});

// Aplicare preset schimb
ipcMain.handle('apply-shift-preset', async (event, data) => {
    try {
        return await apiCall('post', '/apply-shift-preset', data);
    } catch (error) {
        console.error('Error applying shift preset:', error);
        throw error;
    }
});

// ================================================
// Rapoarte
// ================================================

// Generare raport colectiv
ipcMain.handle('generate-collective-report', async (event, params) => {
    try {
        return await apiCall('get', '/reports/collective', null, params);
    } catch (error) {
        console.error('Error generating collective report:', error);
        throw error;
    }
});

// Export raport în Excel
ipcMain.handle('export-report-to-excel', async (event, reportData) => {
    try {
        const monthName = new Date(reportData.year, reportData.month).toLocaleString('ro-RO', { month: 'long' });
        const fileName = `Pontaj ${monthName.toUpperCase()} ${reportData.year}.xlsx`;

        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Exportă Raport Excel',
            defaultPath: fileName,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });

        if (filePath) {
            const ws = {};
            const daysInMonth = new Date(reportData.year, parseInt(reportData.month) + 1, 0).getDate();
            
            // Title
            const startDate = new Date(reportData.year, reportData.month, 1);
            const endDate = new Date(reportData.year, reportData.month, daysInMonth);
            const title = `FOAIE COLECTIVA DE PREZENTA SI PONTAJ - DE LA ${startDate.toLocaleDateString('ro-RO')} LA ${endDate.toLocaleDateString('ro-RO')}`;
            ws[XLSX.utils.encode_cell({c: 0, r: 0})] = { 
                v: title, 
                t: 's', 
                s: { 
                    font: { bold: true, sz: 16 }, 
                    alignment: { horizontal: "center" } 
                } 
            };

            const header = ['Angajat', 'Departament'];
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(reportData.year, reportData.month, day);
                header.push(date.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }).replace('.', ''));
            }
            header.push('Total Ore', 'Zile Lucrate', 'Zile Libere', 'Delegație', 'Zile CFP', 'CM', 'Nemotivate', 'Zile CO');

            // Header
            header.forEach((h, i) => {
                const cellRef = XLSX.utils.encode_cell({c: i, r: 1});
                ws[cellRef] = { 
                    v: h, 
                    t: 's', 
                    s: { 
                        font: { bold: true }, 
                        alignment: { horizontal: "center", vertical: "center" }, 
                        border: { 
                            top: { style: "thin" }, 
                            bottom: { style: "thin" }, 
                            left: { style: "thin" }, 
                            right: { style: "thin" } 
                        } 
                    } 
                };
            });

            // Data
            reportData.employees.sort((a, b) => {
                if (a.department < b.department) return -1;
                if (a.department > b.department) return 1;
                if (a.name < b.name) return -1;
                if (a.name > b.name) return 1;
                return 0;
            }).forEach((employee, r) => {
                const row = r + 2;
                let totalHours = 0;
                let workedDays = 0;
                let sickDays = 0;
                let vacationDays = 0;
                let delegationDays = 0;
                let unpaidDays = 0;
                let absentDays = 0;
                let freeDays = 0;

                ws[XLSX.utils.encode_cell({c: 0, r: row})] = { v: employee.name, t: 's', s: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
                ws[XLSX.utils.encode_cell({c: 1, r: row})] = { v: employee.department, t: 's', s: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };

                for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${reportData.year}-${String(parseInt(reportData.month) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const record = reportData.timeRecords.find(rec => rec.employee_id === employee.id && rec.date === dateStr);
                    let cellContent = '';
                    let cellStyle = { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }, alignment: { wrapText: true, vertical: 'center', horizontal: 'center' } };
                    
                    if (record) {
                        switch(record.status) {
                            case 'present':
                                cellContent = `${record.start_time || ''}-${record.end_time || ''} \n${record.worked_hours || 0}h`;
                                totalHours += record.worked_hours || 0;
                                workedDays++;
                                break;
                            case 'sick': cellContent = 'CM'; sickDays++; cellStyle = { ...cellStyle, fill: { fgColor: { rgb: "D1ECF1" } } }; break;
                            case 'vacation': cellContent = 'CO'; vacationDays++; cellStyle = { ...cellStyle, fill: { fgColor: { rgb: "FFF3CD" } } }; break;
                            case 'absent': cellContent = 'A'; absentDays++; cellStyle = { ...cellStyle, fill: { fgColor: { rgb: "F5C6CB" } } }; break;
                            case 'delegation': cellContent = 'D'; delegationDays++; cellStyle = { ...cellStyle, fill: { fgColor: { rgb: "D4EDDA" } } }; break;
                            case 'unpaid': cellContent = 'CFP'; unpaidDays++; cellStyle = { ...cellStyle, fill: { fgColor: { rgb: "E2E3E5" } } }; break;
                            case 'liber': cellContent = 'L'; freeDays++; cellStyle = { ...cellStyle, fill: { fgColor: { rgb: "E2E3E5" } } }; break;
                        }
                    }
                    
                    const date = new Date(reportData.year, reportData.month, day);
                    const dayOfWeek = date.getDay();
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                        cellStyle = { ...cellStyle, fill: { fgColor: { rgb: "FFFF00" } } };
                    }
                    if (reportData.holidays.includes(date.toISOString().split('T')[0])) {
                        cellStyle = { ...cellStyle, fill: { fgColor: { rgb: "FF0000" } } };
                    }

                    ws[XLSX.utils.encode_cell({c: day + 1, r: row})] = { v: cellContent, t: 's', s: cellStyle };
                }
                
                ws[XLSX.utils.encode_cell({c: daysInMonth + 2, r: row})] = { v: totalHours.toFixed(1), t: 'n', s: { font: { bold: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 3, r: row})] = { v: workedDays, t: 'n', s: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 4, r: row})] = { v: freeDays, t: 'n', s: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 5, r: row})] = { v: delegationDays, t: 'n', s: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 6, r: row})] = { v: unpaidDays, t: 'n', s: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 7, r: row})] = { v: sickDays, t: 'n', s: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 8, r: row})] = { v: absentDays, t: 'n', s: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 9, r: row})] = { v: vacationDays, t: 'n', s: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
            });

            const range = { s: { c: 0, r: 0 }, e: { c: header.length - 1, r: reportData.employees.length + 10 } };
            ws['!ref'] = XLSX.utils.encode_range(range);

            const wb = {
                Sheets: { 'Foaie de Pontaj': ws },
                SheetNames: ['Foaie de Pontaj']
            };

            XLSX.writeFile(wb, filePath);

            return { success: true, filePath };
        } else {
            return { cancelled: true };
        }
    } catch (error) {
        console.error('Eroare la exportul Excel:', error);
        return { success: false, error: error.message };
    }
});

// ================================================
// Sărbători Legale
// ================================================

// Import sărbători legale
ipcMain.handle('import-legal-holidays', async (event, year) => {
    try {
        return await apiCall('post', `/holidays/import/${year}`);
    } catch (error) {
        console.error('Error importing legal holidays:', error);
        throw error;
    }
});

// Obținere sărbători legale
ipcMain.handle('get-legal-holidays', async (event, year) => {
    try {
        return await apiCall('get', `/holidays/${year}`);
    } catch (error) {
        console.error('Error fetching legal holidays:', error);
        throw error;
    }
});

// ================================================
// Funcții utilitare
// ================================================

// Calculul orelor lucrate (pentru compatibilitate cu frontend)
ipcMain.handle('calculate-worked-hours', async (event, data) => {
    const { start_time, end_time } = data;
    
    if (!start_time || !end_time) {
        return { worked_hours: 0, break_minutes: 0, total_interval: 0 };
    }
    
    // Calculul local pentru feedback imediat în UI
    const start = new Date(`2000-01-01 ${start_time}`);
    let end = new Date(`2000-01-01 ${end_time}`);
    
    if (end <= start) {
        end.setDate(end.getDate() + 1);
    }
    
    const diffMs = end - start;
    const totalHours = diffMs / (1000 * 60 * 60);
    
    let breakMinutes = 0;
    if (totalHours > 10) {
        breakMinutes = 60;
    } else if (totalHours > 5) {
        breakMinutes = 30;
    }
    
    const workedHours = Math.max(0, totalHours - (breakMinutes / 60));
    
    return {
        worked_hours: Math.round(workedHours * 4) / 4,
        break_minutes: breakMinutes,
        total_interval: totalHours
    };
});

console.log('✅ Main process actualizat pentru backend PostgreSQL');
console.log(`🌐 API URL: ${API_BASE_URL}`);
console.log(`❤️ Health check URL: ${API_HEALTH_URL}`);