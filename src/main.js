const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const XLSX = require('xlsx-style');

const API_CONFIG = {
    baseURL: process.env.API_BASE_URL || 'http://10.129.67.66:9000/api',
    healthURL: process.env.API_HEALTH_URL || 'http://10.129.67.66:9000/health',
    timeout: 30000
};

let mainWindow;

function createWindow () {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('src/renderer/index.html');
}

app.whenReady().then(() => {
    createWindow();

    const menuTemplate = [
        {
            label: 'File',
            submenu: [
                { role: 'quit' }
            ]
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About',
                    click: async () => {
                        const { name, version, author, license } = require('../package.json');
                        await dialog.showMessageBox({
                            type: 'info',
                            title: 'About',
                            message: `${name}\nVersion: ${version}\nAuthor: ${author}\nLicense: ${license}`
                        });
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// API Handlers
ipcMain.handle('get-departments', async () => {
    const response = await axios.get(`${API_CONFIG.baseURL}/departments`);
    return response.data;
});

ipcMain.handle('get-shift-presets', async () => {
    const response = await axios.get(`${API_CONFIG.baseURL}/shift-presets`);
    return response.data;
});

ipcMain.handle('get-employees', async (event, filters) => {
    const response = await axios.get(`${API_CONFIG.baseURL}/employees`, { params: filters });
    return response.data;
});

ipcMain.handle('add-employee', async (event, employee) => {
    const response = await axios.post(`${API_CONFIG.baseURL}/employees`, employee);
    return response.data;
});

ipcMain.handle('update-employee', async (event, employee) => {
    const response = await axios.put(`${API_CONFIG.baseURL}/employees/${employee.id}`, employee);
    return response.data;
});

ipcMain.handle('delete-employee', async (event, employeeId) => {
    const response = await axios.delete(`${API_CONFIG.baseURL}/employees/${employeeId}`);
    return response.data;
});

ipcMain.handle('get-time-records', async (event, params) => {
    const response = await axios.get(`${API_CONFIG.baseURL}/time-records`, { params });
    return response.data;
});

ipcMain.handle('save-time-record', async (event, record) => {
    const response = await axios.post(`${API_CONFIG.baseURL}/time-records`, record);
    return response.data;
});

ipcMain.handle('delete-time-record', async (event, recordId) => {
    const response = await axios.delete(`${API_CONFIG.baseURL}/time-records/${recordId}`);
    return response.data;
});

ipcMain.handle('delete-time-records-by-date', async (event, date) => {
    const response = await axios.delete(`${API_CONFIG.baseURL}/time-records/by-date/${date}`);
    return response.data;
});

ipcMain.handle('apply-shift-preset', async (event, data) => {
    const response = await axios.post(`${API_CONFIG.baseURL}/apply-shift-preset`, data);
    return response.data;
});

ipcMain.handle('generate-collective-report', async (event, params) => {
    const response = await axios.get(`${API_CONFIG.baseURL}/reports/collective`, { params });
    return response.data;
});

ipcMain.handle('import-legal-holidays', async (event, year) => {
    const response = await axios.post(`${API_CONFIG.baseURL}/holidays/import/${year}`);
    return response.data;
});

ipcMain.handle('get-legal-holidays', async (event, year) => {
    const response = await axios.get(`${API_CONFIG.baseURL}/holidays/${year}`);
    return response.data;
});

ipcMain.handle('check-server', async () => {
    try {
        await axios.get(API_CONFIG.healthURL, { timeout: 5000 });
        return true;
    } catch (error) {
        return false;
    }
});

ipcMain.handle('import-predefined-employees', async () => {
    const response = await axios.post(`${API_CONFIG.baseURL}/import-predefined-employees`);
    return response.data;
});


ipcMain.handle('show-item-in-folder', (event, filePath) => {
    const { shell } = require('electron');
    shell.showItemInFolder(filePath);
});

// Exportă raportul în Excel
ipcMain.handle('export-report-to-excel', async (event, reportData, month, year) => {
    try {
        console.log('Început export Excel. Date primite:', reportData);

        const monthNames = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie", "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];
        const monthIndex = parseInt(month, 10);

        if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
            console.error('Luna invalidă:', month);
            return { success: false, error: 'Luna furnizată este invalidă.' };
        }

        const monthName = monthNames[monthIndex];
        console.log(`Luna validată: ${monthName}`);

        const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
            title: 'Exportă Raport Excel',
            defaultPath: `Pontaj_${year}_${monthName}.xlsx`,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });

        if (canceled) {
            console.log('Export anulat de utilizator.');
            return { cancelled: true };
        }

        if (filePath) {
            console.log('Fișier selectat pentru salvare:', filePath);
            const ws = {};
            const daysInMonth = new Date(year, parseInt(month, 10) + 1, 0).getDate();
            
            // Styles
            const border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
            const titleStyle = { font: { bold: true, sz: 16 }, alignment: { horizontal: "center", vertical: "center" } };
            const headerStyle = { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" }, border };
            const weekendStyle = { fill: { fgColor: { rgb: "FFFF00" } } };
            const holidayStyle = { fill: { fgColor: { rgb: "FFC0CB" } } };
            const dataStyle = { border, alignment: { wrapText: true, vertical: 'center', horizontal: 'center' } };
            const totalStyle = { font: { bold: true }, border, alignment: { horizontal: "center", vertical: "center" }, fill: { fgColor: { rgb: "D4EDDA" } } };
            const summaryStyle = { font: { bold: true }, fill: { fgColor: { rgb: "ADD8E6" } }, border };


            // Title
            const title = `FOAIE COLECTIVA DE PREZENTA SI PONTAJ - LUNA ${monthName.toUpperCase()} ANUL ${year}`;
            ws[XLSX.utils.encode_cell({c: 0, r: 0})] = { v: title, t: 's', s: titleStyle };

            const header = ['Angajat', 'Departament'];
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                header.push(date.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }).replace('.', ''));
            }
            header.push('Total Ore', 'Zile Lucrate', 'Zile Libere', 'Delegație', 'Zile CFP', 'CM', 'Nemotivate', 'Zile CO');

            // Header
            header.forEach((h, i) => {
                const cellRef = XLSX.utils.encode_cell({c: i, r: 1});
                let style = {...headerStyle};
                if(i > 1 && i < daysInMonth + 2) {
                    const date = new Date(year, month, i - 1);
                    const dayOfWeek = date.getDay();
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                        style = {...style, ...weekendStyle};
                    }
                    if (reportData.holidays.includes(date.toISOString().split('T')[0])) {
                        style = {...style, ...holidayStyle};
                    }
                }
                ws[cellRef] = { v: h, t: 's', s: style };
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

                ws[XLSX.utils.encode_cell({c: 0, r: row})] = { v: employee.name, t: 's', s: dataStyle };
                ws[XLSX.utils.encode_cell({c: 1, r: row})] = { v: employee.department, t: 's', s: dataStyle };

                for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${year}-${String(parseInt(month, 10) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const record = reportData.timeRecords.find(rec => rec.employee_id === employee.id && rec.date.startsWith(dateStr));
                    let cellContent = '';
                    let cellStyle = {...dataStyle};
                    
                    const date = new Date(year, month, day);
                    const dayOfWeek = date.getDay();
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                        cellStyle.fill = { fgColor: { rgb: "FFFF00" } }; // Yellow
                    }
                    if (reportData.holidays.includes(date.toISOString().split('T')[0])) {
                        cellStyle.fill = { fgColor: { rgb: "FFC0CB" } }; // Pink
                    }

                    if (record) {
                        switch(record.status) {
                            case 'present':
                                if (record.worked_hours && record.worked_hours > 0) {
                                    const startTime = record.start_time ? record.start_time.substring(0, 5) : '';
                                    const endTime = record.end_time ? record.end_time.substring(0, 5) : '';
                                    cellContent = `${startTime}-${endTime}\n${record.worked_hours}h`;
                                    totalHours += record.worked_hours;
                                    workedDays++;
                                }
                                break;
                            case 'sick': cellContent = 'CM'; sickDays++; cellStyle.fill = { fgColor: { rgb: "D1ECF1" } }; break;
                            case 'vacation': cellContent = 'CO'; vacationDays++; cellStyle.fill = { fgColor: { rgb: "FFF3CD" } }; break;
                            case 'absent': cellContent = 'A'; absentDays++; cellStyle.fill = { fgColor: { rgb: "F5C6CB" } }; break;
                            case 'delegation': cellContent = 'D'; delegationDays++; cellStyle.fill = { fgColor: { rgb: "D4EDDA" } }; break;
                            case 'unpaid': cellContent = 'CFP'; unpaidDays++; cellStyle.fill = { fgColor: { rgb: "E2E3E5" } }; break;
                            case 'liber': cellContent = 'L'; freeDays++; cellStyle.fill = { fgColor: { rgb: "E2E3E5" } }; break;
                        }
                    }

                    ws[XLSX.utils.encode_cell({c: day + 1, r: row})] = { v: cellContent, t: 's', s: cellStyle };
                }
                ws[XLSX.utils.encode_cell({c: daysInMonth + 2, r: row})] = { v: totalHours.toFixed(1), t: 'n', s: totalStyle };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 3, r: row})] = { v: workedDays, t: 'n', s: totalStyle };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 4, r: row})] = { v: freeDays, t: 'n', s: totalStyle };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 5, r: row})] = { v: delegationDays, t: 'n', s: totalStyle };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 6, r: row})] = { v: unpaidDays, t: 'n', s: totalStyle };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 7, r: row})] = { v: sickDays, t: 'n', s: totalStyle };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 8, r: row})] = { v: absentDays, t: 'n', s: totalStyle };
                ws[XLSX.utils.encode_cell({c: daysInMonth + 9, r: row})] = { v: vacationDays, t: 'n', s: totalStyle };
            });
            
            ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }];
            
            // Horizontal summary
            const summaryRow = reportData.employees.length + 2;
            ws[XLSX.utils.encode_cell({c: 0, r: summaryRow})] = { v: 'Total Ore', t: 's', s: summaryStyle };
            for (let day = 1; day <= daysInMonth; day++) {
                let dailyTotal = 0;
                reportData.employees.forEach(employee => {
                    const dateStr = `${year}-${String(parseInt(month, 10) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const record = reportData.timeRecords.find(rec => rec.employee_id === employee.id && rec.date.startsWith(dateStr));
                    if (record && record.status === 'present') {
                        dailyTotal += record.worked_hours || 0;
                    }
                });
                ws[XLSX.utils.encode_cell({c: day + 1, r: summaryRow})] = { v: dailyTotal.toFixed(1), t: 'n', s: summaryStyle };
            }
            
            const summaryColumns = ['Total Ore', 'Zile Lucrate', 'Zile Libere', 'Delegație', 'Zile CFP', 'CM', 'Nemotivate', 'Zile CO'];
            summaryColumns.forEach((col, i) => {
                let total = 0;
                for (let r = 2; r < summaryRow; r++) {
                    const cellRef = XLSX.utils.encode_cell({c: daysInMonth + 2 + i, r: r});
                    if (ws[cellRef] && ws[cellRef].v) {
                        total += parseFloat(ws[cellRef].v);
                    }
                }
                ws[XLSX.utils.encode_cell({c: daysInMonth + 2 + i, r: summaryRow})] = { v: total.toFixed(1), t: 'n', s: summaryStyle };
            });

            // Department summary
            let departmentSummaryRow = summaryRow + 2;
            ws[XLSX.utils.encode_cell({c: 0, r: departmentSummaryRow})] = { v: 'Departament', t: 's', s: headerStyle };
            ws[XLSX.utils.encode_cell({c: 1, r: departmentSummaryRow})] = { v: 'Indicativ Departament', t: 's', s: headerStyle };
            ws[XLSX.utils.encode_cell({c: 2, r: departmentSummaryRow})] = { v: 'Numar Ore Lucrate', t: 's', s: headerStyle };

            const departmentHours = {};
            reportData.employees.forEach(employee => {
                if (!departmentHours[employee.department]) {
                    departmentHours[employee.department] = 0;
                }
                for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${year}-${String(parseInt(month, 10) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const record = reportData.timeRecords.find(rec => rec.employee_id === employee.id && rec.date.startsWith(dateStr));
                    if (record && record.status === 'present') {
                        departmentHours[employee.department] += record.worked_hours || 0;
                    }
                }
            });

            Object.keys(departmentHours).forEach(dept => {
                departmentSummaryRow++;
                ws[XLSX.utils.encode_cell({c: 1, r: departmentSummaryRow})] = { v: dept, t: 's', s: dataStyle };
                ws[XLSX.utils.encode_cell({c: 0, r: departmentSummaryRow})] = { v: dept, t: 's', s: dataStyle };
                ws[XLSX.utils.encode_cell({c: 2, r: departmentSummaryRow})] = { v: departmentHours[dept].toFixed(1), t: 'n', s: dataStyle };
            });
            
            // Direct/Indirect summary
            let directIndirectRow = departmentSummaryRow + 2;
            let directHours = 0;
            let indirectHours = 0;
            Object.keys(departmentHours).forEach(dept => {
                if (dept === 'DC' || dept === 'FA') {
                    directHours += departmentHours[dept];
                } else {
                    indirectHours += departmentHours[dept];
                }
            });
            ws[XLSX.utils.encode_cell({c: 0, r: directIndirectRow})] = { v: 'Total ore direct productivi', t: 's', s: totalStyle };
            ws[XLSX.utils.encode_cell({c: 1, r: directIndirectRow})] = { v: directHours.toFixed(1), t: 'n', s: totalStyle };
            directIndirectRow++;
            ws[XLSX.utils.encode_cell({c: 0, r: directIndirectRow})] = { v: 'Total ore indirecti', t: 's', s: totalStyle };
            ws[XLSX.utils.encode_cell({c: 1, r: directIndirectRow})] = { v: indirectHours.toFixed(1), t: 'n', s: totalStyle };
            directIndirectRow++;
            ws[XLSX.utils.encode_cell({c: 0, r: directIndirectRow})] = { v: 'Total ore lucrate in firma', t: 's', s: totalStyle };
            ws[XLSX.utils.encode_cell({c: 1, r: directIndirectRow})] = { v: (directHours + indirectHours).toFixed(1), t: 'n', s: totalStyle };


            const range = { s: { c: 0, r: 0 }, e: { c: header.length - 1, r: directIndirectRow } };
            ws['!ref'] = XLSX.utils.encode_range(range);

            const wb = {
                Sheets: { 'Foaie de Pontaj': ws },
                SheetNames: ['Foaie de Pontaj']
            };

            XLSX.writeFile(wb, filePath, { cellStyles: true });

            return { success: true, filePath };
        } else {
            return { cancelled: true };
        }
    } catch (error) {
        console.error('Eroare la exportul Excel:', error);
        return { success: false, error: error.message };
    }
});