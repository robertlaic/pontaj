// La începutul fișierului src/main.js, adaugă XLSX require:
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const XLSX = require('xlsx'); // ADAUGĂ ACEASTĂ LINIE

// Export to Excel - handler pentru .xlsx cu formatare profesională
ipcMain.handle('export-report-to-excel', async (event, reportData) => {
    try {
        // Sugerează numele fișierului
        const { year, month } = reportData.metadata;
        const monthNames = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 
                           'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
        const defaultName = `Pontaj_${month + 1}_${year}.xlsx`;
        
        // Dialog pentru salvare
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
        
        // Generează Excel
        const workbook = generateProfessionalExcelWorkbook(reportData);
        
        // Salvează fișierul
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

// Funcție helper pentru generarea workbook-ului Excel profesional
function generateProfessionalExcelWorkbook(reportData) {
    const { employees, timeRecords, holidays, metadata } = reportData;
    const { year, month } = metadata;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthNames = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 
                       'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];

    // Creează workbook-ul
    const workbook = XLSX.utils.book_new();
    
    // Pregătește datele pentru worksheet
    const worksheetData = [];
    
    // HEADER PRINCIPAL - FOAIE COLECTIVĂ
    worksheetData.push(['']); // Rând gol pentru spațiu
    worksheetData.push(['FOAIE COLECTIVĂ DE PREZENȚĂ']);
    worksheetData.push([`Luna: ${monthNames[month]} ${year}`]);
    worksheetData.push(['ERGIO SRL']);
    worksheetData.push(['']); // Rând gol pentru separare

    // HEADER TABEL - Rândul cu zilele lunii
    const headerRow1 = ['Nr.', 'Nume și Prenume', 'Func.'];
    const headerRow2 = ['crt.', '', 'ția'];
    
    // Adaugă zilele lunii în header
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        const dateStr = date.toISOString().split('T')[0];
        
        // Verifică dacă este weekend sau sărbătoare
        let dayLabel = day.toString();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            dayLabel = `${day}*`; // Weekend marcat cu *
        }
        if (holidays && holidays.some(h => h.includes(dateStr))) {
            dayLabel = `${day}S`; // Sărbătoare marcată cu S
        }
        
        headerRow1.push(dayLabel);
        headerRow2.push(''); // Rând gol pentru al doilea rând de header
    }
    
    // Adaugă coloanele de sumar
    headerRow1.push('Total', 'Zile', 'Ore', 'CO', 'CM', 'Abs.', 'Del.', 'CFP');
    headerRow1.push('ore', 'lucr.', 'med.', '', '', 'nem.', '', '');
    headerRow2.push('', '', '', '', '', '', '', '');
    
    worksheetData.push(headerRow1);
    worksheetData.push(headerRow2);

    // DATELE ANGAJAȚILOR
    employees.forEach((employee, index) => {
        const row = [
            (index + 1).toString(), // Nr. crt.
            employee.name,
            'Operator' // Funcția
        ];
        
        let totalHours = 0;
        let workedDays = 0;
        let avgHours = 0;
        let sickDays = 0;
        let vacationDays = 0;
        let delegationDays = 0;
        let unpaidDays = 0;
        let absentDays = 0;
        
        // Procesează fiecare zi din lună
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const record = timeRecords.find(r => r.employee_id === employee.id && r.date === dateStr);
            
            let cellContent = '';
            
            if (record) {
                switch(record.status) {
                    case 'present':
                        const hours = parseFloat(record.worked_hours) || 0;
                        if (hours > 0) {
                            cellContent = hours.toString();
                            totalHours += hours;
                            workedDays++;
                        } else {
                            cellContent = 'P'; // Prezent fără ore
                        }
                        break;
                    case 'sick': 
                        cellContent = 'CM'; 
                        sickDays++; 
                        break;
                    case 'vacation': 
                        cellContent = 'CO'; 
                        vacationDays++; 
                        break;
                    case 'absent': 
                        cellContent = 'A'; 
                        absentDays++; 
                        break;
                    case 'delegation': 
                        cellContent = 'D'; 
                        delegationDays++; 
                        break;
                    case 'unpaid': 
                        cellContent = 'CFP'; 
                        unpaidDays++; 
                        break;
                    case 'liber':
                        cellContent = 'L';
                        break;
                    default:
                        cellContent = '';
                }
            } else {
                // Verifică dacă este weekend
                const date = new Date(year, month, day);
                const dayOfWeek = date.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    cellContent = 'R'; // Repaus (weekend)
                } else {
                    cellContent = ''; // Zi fără înregistrare
                }
            }
            
            row.push(cellContent);
        }
        
        // Calculează media orelor
        avgHours = workedDays > 0 ? totalHours / workedDays : 0;
        
        // Adaugă totalurile
        row.push(
            totalHours.toFixed(1),     // Total ore
            workedDays.toString(),     // Zile lucrate
            avgHours.toFixed(1),       // Ore medii
            vacationDays.toString(),   // CO (Concediu Odihnă)
            sickDays.toString(),       // CM (Concediu Medical)
            absentDays.toString(),     // Absențe nemotivate
            delegationDays.toString(), // Delegații
            unpaidDays.toString()      // CFP (Concediu Fără Plată)
        );
        
        worksheetData.push(row);
    });

    // FOOTER - Semnături și legendă
    worksheetData.push(['']); // Rând gol
    worksheetData.push(['Întocmit: ________________', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Verificat: ________________']);
    worksheetData.push(['']);
    worksheetData.push(['LEGENDA:']);
    worksheetData.push(['CO = Concediu de odihnă', 'CM = Concediu medical', 'A = Absent nemotivat']);
    worksheetData.push(['D = Delegație', 'CFP = Concediu fără plată', 'R = Repaus (weekend)']);
    worksheetData.push(['P = Prezent fără ore', '* = Weekend', 'S = Sărbătoare legală']);

    // Creează worksheet-ul
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    
    // SETĂRI DIMENSIUNI COLOANE
    const colWidths = [
        { wch: 4 },   // Nr. crt
        { wch: 25 },  // Nume și Prenume  
        { wch: 8 },   // Funcția
    ];
    
    // Lățimi pentru zilele din lună (mai înguste)
    for (let i = 0; i < daysInMonth; i++) {
        colWidths.push({ wch: 3 });
    }
    
    // Lățimi pentru coloanele de sumar
    colWidths.push({ wch: 6 }); // Total ore
    colWidths.push({ wch: 5 }); // Zile lucr.
    colWidths.push({ wch: 5 }); // Ore med.
    colWidths.push({ wch: 4 }); // CO
    colWidths.push({ wch: 4 }); // CM
    colWidths.push({ wch: 4 }); // Abs.
    colWidths.push({ wch: 4 }); // Del.
    colWidths.push({ wch: 4 }); // CFP
    
    worksheet['!cols'] = colWidths;
    
    // SETĂRI ÎNĂLȚIME RÂNDURI
    worksheet['!rows'] = [
        { hpt: 15 }, // Rând gol
        { hpt: 20 }, // Titlu principal
        { hpt: 16 }, // Luna
        { hpt: 16 }, // Compania
        { hpt: 15 }, // Rând gol
        { hpt: 30 }, // Header 1 (zilele)
        { hpt: 20 }, // Header 2
    ];

    // MERGE CELULE PENTRU TITLURI
    const merges = [
        // Titlul principal
        { s: { r: 1, c: 0 }, e: { r: 1, c: daysInMonth + 10 } },
        // Luna
        { s: { r: 2, c: 0 }, e: { r: 2, c: daysInMonth + 10 } },
        // Compania
        { s: { r: 3, c: 0 }, e: { r: 3, c: daysInMonth + 10 } },
        // Nr crt merge vertical
        { s: { r: 5, c: 0 }, e: { r: 6, c: 0 } },
        // Nume merge vertical
        { s: { r: 5, c: 1 }, e: { r: 6, c: 1 } },
        // Funcția merge vertical  
        { s: { r: 5, c: 2 }, e: { r: 6, c: 2 } },
    ];

    // Merge pentru coloanele de sumar
    const summaryStartCol = 3 + daysInMonth;
    merges.push(
        { s: { r: 5, c: summaryStartCol }, e: { r: 6, c: summaryStartCol } },     // Total ore
        { s: { r: 5, c: summaryStartCol + 1 }, e: { r: 6, c: summaryStartCol + 1 } }, // Zile lucr
        { s: { r: 5, c: summaryStartCol + 2 }, e: { r: 6, c: summaryStartCol + 2 } }, // Ore med
        { s: { r: 5, c: summaryStartCol + 3 }, e: { r: 6, c: summaryStartCol + 3 } }, // CO
        { s: { r: 5, c: summaryStartCol + 4 }, e: { r: 6, c: summaryStartCol + 4 } }, // CM
        { s: { r: 5, c: summaryStartCol + 5 }, e: { r: 6, c: summaryStartCol + 5 } }, // Abs
        { s: { r: 5, c: summaryStartCol + 6 }, e: { r: 6, c: summaryStartCol + 6 } }, // Del
        { s: { r: 5, c: summaryStartCol + 7 }, e: { r: 6, c: summaryStartCol + 7 } }  // CFP
    );

    worksheet['!merges'] = merges;

    // APLICARE STILURI
    
    // Stiluri pentru titlurile principale
    ['A2', 'A3', 'A4'].forEach(cell => {
        if (worksheet[cell]) {
            worksheet[cell].s = {
                font: { bold: true, sz: cell === 'A2' ? 16 : 12 },
                alignment: { horizontal: 'center', vertical: 'center' },
                fill: { fgColor: { rgb: 'FFFFFF' } }
            };
        }
    });

    // Stiluri pentru header-ul tabelului (rândurile 6 și 7)
    const headerRowIndices = [5, 6]; // rândurile 6 și 7 în Excel
    const totalCols = 3 + daysInMonth + 8; // Total coloane

    headerRowIndices.forEach(rowIndex => {
        for (let col = 0; col < totalCols; col++) {
            const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: col });
            if (!worksheet[cellRef]) {
                worksheet[cellRef] = { v: '' };
            }
            worksheet[cellRef].s = {
                font: { bold: true, sz: 9 },
                fill: { fgColor: { rgb: 'E6E6FA' } }, // Lavender light
                alignment: { horizontal: 'center', vertical: 'center' },
                border: {
                    top: { style: 'thin', color: { rgb: '000000' } },
                    bottom: { style: 'thin', color: { rgb: '000000' } },
                    left: { style: 'thin', color: { rgb: '000000' } },
                    right: { style: 'thin', color: { rgb: '000000' } }
                }
            };
        }
    });

    // Stiluri pentru datele angajaților
    employees.forEach((employee, empIndex) => {
        const rowIndex = empIndex + 7; // +7 pentru header și titluri
        
        for (let col = 0; col < totalCols; col++) {
            const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: col });
            if (worksheet[cellRef]) {
                worksheet[cellRef].s = {
                    font: { sz: 8 },
                    alignment: { 
                        horizontal: col <= 2 ? 'left' : 'center', 
                        vertical: 'center' 
                    },
                    border: {
                        top: { style: 'thin', color: { rgb: '000000' } },
                        bottom: { style: 'thin', color: { rgb: '000000' } },
                        left: { style: 'thin', color: { rgb: '000000' } },
                        right: { style: 'thin', color: { rgb: '000000' } }
                    }
                };

                // Evidențiere pentru weekend-uri și sărbători
                if (col >= 3 && col < 3 + daysInMonth) {
                    const day = col - 2;
                    const date = new Date(year, month, day);
                    const dayOfWeek = date.getDay();
                    const dateStr = date.toISOString().split('T')[0];
                    
                    if (dayOfWeek === 0 || dayOfWeek === 6) {
                        worksheet[cellRef].s.fill = { fgColor: { rgb: 'F0F8FF' } }; // Alice blue pentru weekend
                    }
                    
                    if (holidays && holidays.some(h => h.includes(dateStr))) {
                        worksheet[cellRef].s.fill = { fgColor: { rgb: 'FFE4E1' } }; // Misty rose pentru sărbători
                    }
                }

                // Evidențiere pentru coloanele de total
                if (col >= 3 + daysInMonth) {
                    worksheet[cellRef].s.fill = { fgColor: { rgb: 'F5F5F5' } }; // Light gray
                    if (col === 3 + daysInMonth) { // Total ore
                        worksheet[cellRef].s.font = { bold: true, sz: 8 };
                    }
                }
            }
        }
    });

    // Setează orientarea paginii pentru landscape
    worksheet['!pageSetup'] = {
        orientation: 'landscape',
        fitToWidth: 1,
        fitToHeight: 0
    };

    // Setează marginile pentru printare
    worksheet['!margins'] = {
        left: 0.5,
        right: 0.5,
        top: 0.75,
        bottom: 0.75,
        header: 0.3,
        footer: 0.3
    };

    // Adaugă worksheet-ul la workbook
    const sheetName = `Pontaj ${monthNames[month]} ${year}`;
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    return workbook;
}