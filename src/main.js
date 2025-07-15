const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const XLSX = require('xlsx');

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

// Export to Excel
ipcMain.handle('export-report-to-excel', async (event, reportData) => {
    try {
        const { year, month } = reportData.metadata;
        const monthNames = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
        const defaultName = `Pontaj_${month + 1}_${year}.xlsx`;

        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Exportă Foaie Colectivă de Prezență',
            defaultPath: defaultName,
            filters: [
                { name: 'Excel Files', extensions: ['xlsx'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled) {
            return { success: false, message: 'Export anulat' };
        }

        const workbook = generateProfessionalExcelWorkbook(reportData);
        XLSX.writeFile(workbook, result.filePath);

        return {
            success: true,
            filePath: result.filePath,
            message: 'Foaia colectivă a fost exportată cu succes!'
        };

    } catch (error) {
        console.error('Error exporting to Excel:', error);
        throw new Error(`Eroare la exportul Excel: ${error.message}`);
    }
});

ipcMain.handle('show-item-in-folder', (event, filePath) => {
    const { shell } = require('electron');
    shell.showItemInFolder(filePath);
});

// Exportă raportul în Excel
ipcMain.handle('export-report-to-excel', async (event, reportData) => {
    try {
        const { filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Exportă Raport Excel',
            defaultPath: `Foaie_Colectiva_Prezenta_${reportData.year}_${reportData.month}.xlsx`,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });

        if (filePath) {
            const ws = {};
            const daysInMonth = new Date(reportData.year, parseInt(reportData.month) + 1, 0).getDate();
            
            // Title
            const startDate = new Date(reportData.year, reportData.month, 1);
            const endDate = new Date(reportData.year, reportData.month, daysInMonth);
            const title = `FOAIE COLECTIVA DE PREZENTA SI PONTAJ - DE LA ${startDate.toLocaleDateString('ro-RO')} LA ${endDate.toLocaleDateString('ro-RO')}`;
            ws[XLSX.utils.encode_cell({c: 0, r: 0})] = { v: title, t: 's', s: { font: { bold: true, sz: 16 }, alignment: { horizontal: "center" } } };

            const header = ['Angajat', 'Departament'];
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(reportData.year, reportData.month, day);
                header.push(date.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short' }).replace('.', ''));
            }
            header.push('Total Ore', 'Zile Lucrate', 'Zile Libere', 'Delegație', 'Zile CFP', 'CM', 'Nemotivate', 'Zile CO');

            // Header
            header.forEach((h, i) => {
                const cellRef = XLSX.utils.encode_cell({c: i, r: 1});
                ws[cellRef] = { v: h, t: 's', s: { font: { bold: true }, alignment: { horizontal: "center", vertical: "center" }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
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
                        cellStyle = { ...cellStyle, fill: { fgColor: { rgb: "FFFF00" } } }; // Yellow
                    }
                    if (reportData.holidays.includes(date.toISOString().split('T')[0])) {
                        cellStyle = { ...cellStyle, fill: { fgColor: { rgb: "FF0000" } } }; // Red
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

            ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }];

            // Horizontal summary
            const summaryRow = reportData.employees.length + 2;
            ws[XLSX.utils.encode_cell({c: 0, r: summaryRow})] = { v: 'Total Ore', t: 's', s: { font: { bold: true }, fill: { fgColor: { rgb: "ADD8E6" } }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
            for (let day = 1; day <= daysInMonth; day++) {
                let dailyTotal = 0;
                reportData.employees.forEach(employee => {
                    const dateStr = `${reportData.year}-${String(parseInt(reportData.month) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const record = reportData.timeRecords.find(rec => rec.employee_id === employee.id && rec.date === dateStr);
                    if (record && record.status === 'present') {
                        dailyTotal += record.worked_hours || 0;
                    }
                });
                ws[XLSX.utils.encode_cell({c: day + 1, r: summaryRow})] = { v: dailyTotal.toFixed(1), t: 'n', s: { font: { bold: true }, fill: { fgColor: { rgb: "ADD8E6" } }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
            }

            const summaryColumns = ['Total Ore', 'Zile Lucrate', 'Zile Libere', 'Delegație', 'Zile CFP', 'CM', 'Nemotivate', 'Zile CO'];
            summaryColumns.forEach((col, i) => {
                let total = 0;
                for (let r = 2; r < summaryRow; r++) {
                    const cellRef = XLSX.utils.encode_cell({c: daysInMonth + 2 + i, r: r});
                    if (ws[cellRef]) {
                        total += parseFloat(ws[cellRef].v);
                    }
                }
                ws[XLSX.utils.encode_cell({c: daysInMonth + 2 + i, r: summaryRow})] = { v: total.toFixed(1), t: 'n', s: { font: { bold: true }, fill: { fgColor: { rgb: "ADD8E6" } }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
            });

            // Department summary
            let departmentSummaryRow = summaryRow + 2;
            ws[XLSX.utils.encode_cell({c: 0, r: departmentSummaryRow})] = { v: 'Departament', t: 's', s: { font: { bold: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
            ws[XLSX.utils.encode_cell({c: 1, r: departmentSummaryRow})] = { v: 'Indicativ Departament', t: 's', s: { font: { bold: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
            ws[XLSX.utils.encode_cell({c: 2, r: departmentSummaryRow})] = { v: 'Numar Ore Lucrate', t: 's', s: { font: { bold: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };

            const departmentHours = {};
            reportData.employees.forEach(employee => {
                if (!departmentHours[employee.department]) {
                    departmentHours[employee.department] = 0;
                }
                for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${reportData.year}-${String(parseInt(reportData.month) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const record = reportData.timeRecords.find(rec => rec.employee_id === employee.id && rec.date === dateStr);
                    if (record && record.status === 'present') {
                        departmentHours[employee.department] += record.worked_hours || 0;
                    }
                }
            });

            Object.keys(departmentHours).forEach(dept => {
                departmentSummaryRow++;
                ws[XLSX.utils.encode_cell({c: 1, r: departmentSummaryRow})] = { v: dept, t: 's', s: { font: { bold: true }, border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
                ws[XLSX.utils.encode_cell({c: 0, r: departmentSummaryRow})] = { v: DEPARTMENTS[dept]?.name || '', t: 's', s: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
                ws[XLSX.utils.encode_cell({c: 2, r: departmentSummaryRow})] = { v: departmentHours[dept].toFixed(1), t: 'n', s: { border: { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } } } };
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
            ws[XLSX.utils.encode_cell({c: 0, r: directIndirectRow})] = { v: 'Total ore direct productivi', t: 's', s: { font: { bold: true } } };
            ws[XLSX.utils.encode_cell({c: 1, r: directIndirectRow})] = { v: directHours.toFixed(1), t: 'n', s: { font: { bold: true } } };
            directIndirectRow++;
            ws[XLSX.utils.encode_cell({c: 0, r: directIndirectRow})] = { v: 'Total ore indirecti', t: 's', s: { font: { bold: true } } };
            ws[XLSX.utils.encode_cell({c: 1, r: directIndirectRow})] = { v: indirectHours.toFixed(1), t: 'n', s: { font: { bold: true } } };
            directIndirectRow++;
            ws[XLSX.utils.encode_cell({c: 0, r: directIndirectRow})] = { v: 'Total ore lucrate in firma', t: 's', s: { font: { bold: true } } };
            ws[XLSX.utils.encode_cell({c: 1, r: directIndirectRow})] = { v: (directHours + indirectHours).toFixed(1), t: 'n', s: { font: { bold: true } } };


            const range = { s: { c: 0, r: 0 }, e: { c: header.length - 1, r: directIndirectRow } };
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