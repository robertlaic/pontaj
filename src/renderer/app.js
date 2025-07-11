// ================================================
// 📁 src/renderer/app.js - Frontend Logic
// ================================================

class PontajApp {
    constructor() {
        this.employees = [];
        this.timeRecords = [];
        this.currentMonth = new Date().getMonth();
        this.currentYear = new Date().getFullYear();
        this.activeSection = 'overview';
        
        this.init();
    }

    async init() {
        try {
            // Initialize UI
            this.initializeUI();
            this.setupEventListeners();
            this.updateCurrentDate();
            
            // Load initial data
            await this.loadEmployees();
            await this.loadTimeRecords();
            await this.updateDashboard();
            
            console.log('🚀 Aplicația a fost inițializată cu succes');
            this.showToast('Aplicația a fost încărcată cu succes!', 'success');
        } catch (error) {
            console.error('❌ Eroare la inițializarea aplicației:', error);
            this.showToast('Eroare la încărcarea aplicației', 'error');
        }
    }

    initializeUI() {
        // Populate month selector
        const monthSelect = document.getElementById('month-select');
        const months = [
            'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
            'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
        ];
        
        months.forEach((month, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = month;
            option.selected = index === this.currentMonth;
            monthSelect.appendChild(option);
        });

        // Set current year
        document.getElementById('year-select').value = this.currentYear;
    }

    setupEventListeners() {
        // Navigation tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const section = e.target.dataset.section;
                this.switchSection(section);
            });
        });

        // Month/Year selectors
        document.getElementById('month-select').addEventListener('change', (e) => {
            this.currentMonth = parseInt(e.target.value);
            this.updatePontajView();
            this.updateDashboard();
        });

        document.getElementById('year-select').addEventListener('change', (e) => {
            this.currentYear = parseInt(e.target.value);
            this.updatePontajView();
            this.updateDashboard();
        });

        // Buttons
        document.getElementById('export-btn').addEventListener('click', () => this.exportData());
        document.getElementById('import-btn').addEventListener('click', () => this.importData());
        document.getElementById('export-csv-btn').addEventListener('click', () => this.exportCSV());
        document.getElementById('add-employee-btn').addEventListener('click', () => this.showAddEmployeeModal());
        document.getElementById('generate-report-btn').addEventListener('click', () => this.generateReport());

        // Modal controls
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeModals());
        });

        // Add employee form
        document.getElementById('add-employee-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addEmployee();
        });

        // Menu actions from main process
        if (window.electronAPI) {
            window.electronAPI.onMenuAction(() => {
                // Handle menu actions
            });
        }

        // Click outside modal to close
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModals();
            }
        });
    }

    updateCurrentDate() {
        const now = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            timeZone: 'Europe/Bucharest'
        };
        document.getElementById('current-date').textContent = now.toLocaleDateString('ro-RO', options);
    }

    async loadEmployees() {
        try {
            this.employees = await window.electronAPI.getEmployees();
            this.updateEmployeesTable();
            this.updateSectionsOverview();
            console.log(`📊 Încărcați ${this.employees.length} angajați`);
        } catch (error) {
            console.error('❌ Eroare la încărcarea angajaților:', error);
            this.showToast('Eroare la încărcarea angajaților', 'error');
        }
    }

    async loadTimeRecords() {
        try {
            const startDate = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-01`;
            const endDate = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-31`;
            
            this.timeRecords = await window.electronAPI.getTimeRecords({
                startDate,
                endDate
            });
            
            this.updatePontajView();
            console.log(`📈 Încărcate ${this.timeRecords.length} înregistrări pontaj`);
        } catch (error) {
            console.error('❌ Eroare la încărcarea pontajului:', error);
            this.showToast('Eroare la încărcarea pontajului', 'error');
        }
    }

    async updateDashboard() {
        try {
            const stats = await window.electronAPI.getDashboardStats({
                month: this.currentMonth,
                year: this.currentYear
            });

            this.renderStats(stats);
        } catch (error) {
            console.error('❌ Eroare la actualizarea dashboard-ului:', error);
        }
    }

    renderStats(stats) {
        const statsGrid = document.getElementById('stats-grid');
        const averageHours = stats.totalEmployees > 0 ? stats.totalHours / stats.totalEmployees : 0;

        statsGrid.innerHTML = `
            <div class="stat-card blue">
                <div class="stat-header">
                    <div class="stat-label">Total Angajați</div>
                    <div class="stat-icon blue">👥</div>
                </div>
                <div class="stat-value">${stats.totalEmployees}</div>
            </div>
            
            <div class="stat-card green">
                <div class="stat-header">
                    <div class="stat-label">Ore Lucrate</div>
                    <div class="stat-icon green">🕐</div>
                </div>
                <div class="stat-value">${stats.totalHours.toFixed(1)}</div>
            </div>
            
            <div class="stat-card purple">
                <div class="stat-header">
                    <div class="stat-label">Prezențe</div>
                    <div class="stat-icon purple">📈</div>
                </div>
                <div class="stat-value">${stats.totalPresent}</div>
            </div>
            
            <div class="stat-card orange">
                <div class="stat-header">
                    <div class="stat-label">Medie Ore/Angajat</div>
                    <div class="stat-icon orange">⚡</div>
                </div>
                <div class="stat-value">${averageHours.toFixed(1)}</div>
            </div>
        `;
    }

    updateSectionsOverview() {
        const sectionsOverview = document.getElementById('sections-overview');
        const dcEmployees = this.employees.filter(emp => emp.section === 'DC');
        const faEmployees = this.employees.filter(emp => emp.section === 'FA');

        sectionsOverview.innerHTML = `
            <div class="mb-4">
                <h4 class="font-bold mb-2">Secția DC (${dcEmployees.length})</h4>
                <div class="grid gap-2">
                    ${dcEmployees.map(emp => `
                        <div class="flex justify-between items-center">
                            <span class="text-sm">${emp.name}</span>
                            <span class="badge badge-blue">${emp.position}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div>
                <h4 class="font-bold mb-2">Secția FA (${faEmployees.length})</h4>
                <div class="grid gap-2">
                    ${faEmployees.map(emp => `
                        <div class="flex justify-between items-center">
                            <span class="text-sm">${emp.name}</span>
                            <span class="badge badge-green">${emp.position}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    updatePontajView() {
        const pontajTable = document.getElementById('pontaj-table');
        const pontajLoading = document.getElementById('pontaj-loading');
        
        pontajLoading.style.display = 'block';
        pontajTable.style.display = 'none';

        setTimeout(() => {
            this.renderPontajTable();
            pontajLoading.style.display = 'none';
            pontajTable.style.display = 'block';
        }, 500);
    }

    renderPontajTable() {
        const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
        const days = Array.from({ length: Math.min(daysInMonth, 15) }, (_, i) => i + 1);

        let tableHTML = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Angajat</th>
                        <th>Tip</th>
                        ${days.map(day => `<th class="text-center">${day}</th>`).join('')}
                        <th class="text-center">Total</th>
                    </tr>
                </thead>
                <tbody>
        `;

        this.employees.forEach(employee => {
            const employeeRecords = this.timeRecords.filter(r => r.employee_id === employee.id);
            const totalHours = employeeRecords.reduce((sum, r) => sum + (r.worked_hours || 0), 0);

            // Start time row
            tableHTML += `
                <tr>
                    <td>
                        <div class="font-bold">${employee.name}</div>
                        <div class="text-xs text-gray-500">${employee.id}</div>
                    </td>
                    <td class="text-sm">Începere</td>
                    ${days.map(day => {
                        const date = this.formatDate(day, this.currentMonth, this.currentYear);
                        const record = employeeRecords.find(r => r.date === date);
                        return `
                            <td>
                                <input 
                                    type="time" 
                                    value="${record?.start_time || ''}"
                                    onchange="app.updateTimeRecord('${employee.id}', '${date}', 'start_time', this.value)"
                                    style="width: 80px; font-size: 12px;"
                                >
                            </td>
                        `;
                    }).join('')}
                    <td class="text-center font-bold">${totalHours.toFixed(1)}h</td>
                </tr>
            `;

            // End time row
            tableHTML += `
                <tr style="background-color: #f8f9fa;">
                    <td></td>
                    <td class="text-sm">Închidere</td>
                    ${days.map(day => {
                        const date = this.formatDate(day, this.currentMonth, this.currentYear);
                        const record = employeeRecords.find(r => r.date === date);
                        return `
                            <td>
                                <input 
                                    type="time" 
                                    value="${record?.end_time || ''}"
                                    onchange="app.updateTimeRecord('${employee.id}', '${date}', 'end_time', this.value)"
                                    style="width: 80px; font-size: 12px;"
                                >
                            </td>
                        `;
                    }).join('')}
                    <td></td>
                </tr>
            `;

            // Worked hours row
            tableHTML += `
                <tr style="background-color: #f0f9ff; border-bottom: 2px solid #e5e7eb;">
                    <td></td>
                    <td class="text-sm font-bold">Ore lucrate</td>
                    ${days.map(day => {
                        const date = this.formatDate(day, this.currentMonth, this.currentYear);
                        const record = employeeRecords.find(r => r.date === date);
                        const hours = record?.status === 'CO' ? 'CO' : (record?.worked_hours || 0).toFixed(1);
                        return `
                            <td class="text-center">
                                <span class="text-sm font-bold text-blue-900">${hours}</span>
                            </td>
                        `;
                    }).join('')}
                    <td></td>
                </tr>
            `;
        });

        tableHTML += '</tbody></table>';
        document.getElementById('pontaj-table').innerHTML = tableHTML;
    }

    async updateTimeRecord(employeeId, date, field, value) {
        try {
            // Find existing record or create new one
            let record = this.timeRecords.find(r => r.employee_id === employeeId && r.date === date);
            
            if (!record) {
                record = {
                    employee_id: employeeId,
                    date: date,
                    start_time: '',
                    end_time: '',
                    worked_hours: 0,
                    status: 'present'
                };
                this.timeRecords.push(record);
            }

            record[field] = value;

            // Calculate worked hours if both start and end times are set
            if (field === 'start_time' || field === 'end_time') {
                if (record.start_time && record.end_time) {
                    const start = new Date(`2000-01-01 ${record.start_time}`);
                    const end = new Date(`2000-01-01 ${record.end_time}`);
                    const diff = (end - start) / (1000 * 60 * 60);
                    record.worked_hours = Math.max(0, diff);
                }
            }

            // Save to database
            await window.electronAPI.saveTimeRecord(record);
            
            // Update UI
            this.renderPontajTable();
            this.updateDashboard();
            
            console.log(`✅ Actualizat pontaj: ${employeeId} - ${date} - ${field}: ${value}`);
        } catch (error) {
            console.error('❌ Eroare la actualizarea pontajului:', error);
            this.showToast('Eroare la salvarea pontajului', 'error');
        }
    }

    updateEmployeesTable() {
        const tableBody = document.querySelector('#employees-table tbody');
        
        tableBody.innerHTML = this.employees.map(employee => `
            <tr>
                <td class="font-bold">${employee.id}</td>
                <td>${employee.name}</td>
                <td>
                    <span class="badge ${employee.section === 'DC' ? 'badge-blue' : 'badge-green'}">
                        ${employee.section}
                    </span>
                </td>
                <td>${employee.position}</td>
                <td class="text-sm">${new Date(employee.created_at).toLocaleDateString('ro-RO')}</td>
                <td class="text-right">
                    <button 
                        class="btn btn-danger text-sm" 
                        onclick="app.deleteEmployee('${employee.id}')"
                        style="padding: 4px 8px;"
                    >
                        🗑️ Șterge
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async addEmployee() {
        try {
            const name = document.getElementById('employee-name').value.trim().toUpperCase();
            const section = document.getElementById('employee-section').value;
            const position = document.getElementById('employee-position').value.trim();

            if (!name || !position) {
                this.showToast('Completați toate câmpurile', 'error');
                return;
            }

            // Generate ID
            const existingInSection = this.employees.filter(emp => emp.section === section).length;
            const id = `${section}${existingInSection + 1}`;

            const employee = {
                id,
                name,
                section,
                position
            };

            // Save to database
            const savedEmployee = await window.electronAPI.addEmployee(employee);
            
            // Update local data
            this.employees.push(savedEmployee);
            
            // Update UI
            this.updateEmployeesTable();
            this.updateSectionsOverview();
            this.updateDashboard();
            
            // Close modal and reset form
            this.closeModals();
            document.getElementById('add-employee-form').reset();
            
            this.showToast(`Angajat ${name} adăugat cu succes!`, 'success');
            console.log(`✅ Angajat adăugat: ${id} - ${name}`);
        } catch (error) {
            console.error('❌ Eroare la adăugarea angajatului:', error);
            this.showToast('Eroare la adăugarea angajatului', 'error');
        }
    }

    async deleteEmployee(employeeId) {
        try {
            const employee = this.employees.find(emp => emp.id === employeeId);
            
            if (!confirm(`Sigur doriți să ștergeți angajatul ${employee.name}?`)) {
                return;
            }

            // Delete from database (soft delete)
            await window.electronAPI.deleteEmployee(employeeId);
            
            // Update local data
            this.employees = this.employees.filter(emp => emp.id !== employeeId);
            
            // Update UI
            this.updateEmployeesTable();
            this.updateSectionsOverview();
            this.updateDashboard();
            
            this.showToast(`Angajat ${employee.name} șters cu succes!`, 'success');
            console.log(`✅ Angajat șters: ${employeeId}`);
        } catch (error) {
            console.error('❌ Eroare la ștergerea angajatului:', error);
            this.showToast('Eroare la ștergerea angajatului', 'error');
        }
    }

    async exportData() {
        try {
            const result = await window.electronAPI.exportDatabase();
            
            if (result.success) {
                this.showToast('Date exportate cu succes!', 'success');
                console.log(`✅ Date exportate în: ${result.filePath}`);
            } else if (result.cancelled) {
                console.log('Export anulat de utilizator');
            }
        } catch (error) {
            console.error('❌ Eroare la export:', error);
            this.showToast('Eroare la exportul datelor', 'error');
        }
    }

    async importData() {
        try {
            const result = await window.electronAPI.importDatabase();
            
            if (result.success) {
                // Reload all data
                await this.loadEmployees();
                await this.loadTimeRecords();
                await this.updateDashboard();
                
                this.showToast(`Import reușit! ${result.imported.employees} angajați și ${result.imported.records} înregistrări`, 'success');
                console.log(`✅ Date importate:`, result.imported);
            } else if (result.cancelled) {
                console.log('Import anulat de utilizator');
            }
        } catch (error) {
            console.error('❌ Eroare la import:', error);
            this.showToast('Eroare la importul datelor', 'error');
        }
    }

    exportCSV() {
        try {
            const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
            const months = [
                'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
                'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
            ];

            let csvContent = 'Angajat,Sectia,';
            for (let day = 1; day <= daysInMonth; day++) {
                csvContent += `${day}_Start,${day}_End,${day}_Ore,`;
            }
            csvContent += 'Total_Ore\n';

            this.employees.forEach(employee => {
                let row = `${employee.name},${employee.section},`;
                let totalHours = 0;

                for (let day = 1; day <= daysInMonth; day++) {
                    const date = this.formatDate(day, this.currentMonth, this.currentYear);
                    const record = this.timeRecords.find(r => r.employee_id === employee.id && r.date === date);

                    if (record) {
                        row += `${record.start_time || ''},${record.end_time || ''},${record.worked_hours || 0},`;
                        totalHours += record.worked_hours || 0;
                    } else {
                        row += ',,,';
                    }
                }

                row += `${totalHours.toFixed(1)}\n`;
                csvContent += row;
            });

            // Download CSV
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pontaj_${months[this.currentMonth]}_${this.currentYear}.csv`;
            a.click();
            URL.revokeObjectURL(url);

            this.showToast('CSV exportat cu succes!', 'success');
            console.log(`✅ CSV exportat pentru ${months[this.currentMonth]} ${this.currentYear}`);
        } catch (error) {
            console.error('❌ Eroare la exportul CSV:', error);
            this.showToast('Eroare la exportul CSV', 'error');
        }
    }

    generateReport() {
        const reportsContent = document.getElementById('reports-content');
        const months = [
            'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
            'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
        ];

        // Calculate report data
        const reportData = this.employees.map(employee => {
            const employeeRecords = this.timeRecords.filter(r => r.employee_id === employee.id);
            const totalHours = employeeRecords.reduce((sum, r) => sum + (r.worked_hours || 0), 0);
            const workDays = employeeRecords.filter(r => r.status === 'present' && r.worked_hours > 0).length;
            const absenceDays = employeeRecords.filter(r => r.status === 'CO').length;

            return {
                ...employee,
                totalHours,
                workDays,
                absenceDays,
                averageHours: workDays > 0 ? totalHours / workDays : 0
            };
        });

        const totalHours = reportData.reduce((sum, emp) => sum + emp.totalHours, 0);
        const averageHoursPerEmployee = reportData.length > 0 ? totalHours / reportData.length : 0;
        const totalWorkDays = reportData.reduce((sum, emp) => sum + emp.workDays, 0);

        reportsContent.innerHTML = `
            <div class="mb-6">
                <h4 class="font-bold text-lg mb-4">Raport ${months[this.currentMonth]} ${this.currentYear}</h4>
                
                <div class="grid grid-cols-3 gap-4 mb-6">
                    <div class="stat-card blue">
                        <div class="stat-label">Total Ore Lucrate</div>
                        <div class="stat-value">${totalHours.toFixed(1)}</div>
                    </div>
                    
                    <div class="stat-card green">
                        <div class="stat-label">Medie Ore/Angajat</div>
                        <div class="stat-value">${averageHoursPerEmployee.toFixed(1)}</div>
                    </div>
                    
                    <div class="stat-card purple">
                        <div class="stat-label">Total Zile Lucrate</div>
                        <div class="stat-value">${totalWorkDays}</div>
                    </div>
                </div>
            </div>

            <div class="table-container">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Angajat</th>
                            <th>Secția</th>
                            <th class="text-center">Total Ore</th>
                            <th class="text-center">Zile Lucrate</th>
                            <th class="text-center">Zile Absență</th>
                            <th class="text-center">Medie Ore/Zi</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reportData.map(employee => `
                            <tr>
                                <td class="font-bold">${employee.name}</td>
                                <td>
                                    <span class="badge ${employee.section === 'DC' ? 'badge-blue' : 'badge-green'}">
                                        ${employee.section}
                                    </span>
                                </td>
                                <td class="text-center font-bold">${employee.totalHours.toFixed(1)}</td>
                                <td class="text-center">${employee.workDays}</td>
                                <td class="text-center">${employee.absenceDays}</td>
                                <td class="text-center">${employee.averageHours.toFixed(1)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        this.showToast('Raport generat cu succes!', 'success');
    }

    // UI Helper Methods
    switchSection(sectionName) {
        // Update nav tabs
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');

        // Update sections
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionName).classList.add('active');

        this.activeSection = sectionName;

        // Load section-specific data
        if (sectionName === 'pontaj') {
            this.updatePontajView();
        } else if (sectionName === 'overview') {
            this.updateDashboard();
        }
    }

    showAddEmployeeModal() {
        document.getElementById('add-employee-modal').classList.add('show');
    }

    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('show');
        });
    }

    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        const toastMessage = toast.querySelector('.toast-message');
        const toastIcon = toast.querySelector('.toast-icon');

        toastMessage.textContent = message;
        
        if (type === 'error') {
            toast.classList.add('error');
            toastIcon.textContent = '❌';
        } else {
            toast.classList.remove('error');
            toastIcon.textContent = '✅';
        }

        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    formatDate(day, month, year) {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
}

// Global app instance
let app;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inițializare aplicație Pontaj Fabrică...');
    app = new PontajApp();
});

// Make app available globally for HTML event handlers
window.app = app;