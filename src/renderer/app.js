// ================================================
// 📁 src/renderer/app.js - Frontend Logic (MODIFICAT CU CULOARE STATUS)
// ================================================

class PontajApp {
renderStatusLegend() {
    const toggleButton = document.createElement('button');
    toggleButton.textContent = 'ℹ️ Legendă statusuri';
    toggleButton.style = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 6px 12px;
        font-size: 13px;
        cursor: pointer;
        z-index: 1001;
    `;
    document.body.appendChild(toggleButton);

    const legendContainer = document.createElement('div');
    legendContainer.id = 'status-legend';
    legendContainer.style = `
        position: fixed;
        top: 60px;
        right: 20px;
        background-color: #ffffff;
        border: 1px solid #dee2e6;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        padding: 10px 15px;
        border-radius: 8px;
        font-size: 13px;
        z-index: 1000;
        display: none;
    `;
    legendContainer.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <strong>Legendă statusuri:</strong>
            <button id="close-legend" style="background: none; border: none; font-size: 16px; cursor: pointer;">×</button>
        </div>
        <div style="display: flex; gap: 10px; align-items: center; margin-top: 5px;">
            <span style="background-color: #fff3cd; padding: 4px 8px; border-radius: 4px;">CO</span>
            <span style="background-color: #d1ecf1; padding: 4px 8px; border-radius: 4px;">medical</span>
            <span style="background-color: #f8d7da; padding: 4px 8px; border-radius: 4px;">lipsă</span>
        </div>
    `;
    document.body.appendChild(legendContainer);

    toggleButton.addEventListener('click', () => {
        legendContainer.style.display = legendContainer.style.display === 'none' ? 'block' : 'none';
    });

    const closeBtn = legendContainer.querySelector('#close-legend');
    closeBtn.addEventListener('click', () => {
        legendContainer.style.display = 'none';
    });
}


       
    constructor() {
        this.employees = [];
        this.timeRecords = [];
        this.currentMonth = new Date().getMonth();
        this.currentYear = new Date().getFullYear();
        this.activeSection = 'overview';

        this.init();
        this.renderStatusLegend();
    }

    async init() {
        try {
            this.initializeUI();
            this.setupEventListeners();
            this.updateCurrentDate();
            await this.loadEmployees();
            await this.loadTimeRecords();
            await this.updateDashboard();
            this.showToast('Aplicația a fost încărcată cu succes!', 'success');
        } catch (error) {
            console.error('❌ Eroare la inițializarea aplicației:', error);
            this.showToast('Eroare la încărcarea aplicației', 'error');
        }
    }

    formatDate(day, month, year) {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    getStatusColorClass(status) {
        switch (status) {
            case 'CO': return 'background-color: #fff3cd'; // galben deschis
            case 'medical': return 'background-color: #d1ecf1'; // albastru deschis
            case 'lipsa': return 'background-color: #f8d7da'; // roșu deschis
            default: return '';
        }
    }

    renderPontajTable() {
        const legendHTML = `
        <div style="margin-bottom: 10px; font-size: 13px;">
            <strong>Legendă statusuri:</strong>
            <span style="background-color: #fff3cd; padding: 4px 8px; margin-left: 10px; border-radius: 4px;">CO</span>
            <span style="background-color: #d1ecf1; padding: 4px 8px; margin-left: 10px; border-radius: 4px;">medical</span>
            <span style="background-color: #f8d7da; padding: 4px 8px; margin-left: 10px; border-radius: 4px;">lipsă</span>
        </div>`;
                const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
        const days = Array.from({ length: Math.min(daysInMonth, 15) }, (_, i) => i + 1);

        let tableHTML = `<table class="table">
            <thead>
                <tr>
                    <th>Angajat</th>
                    <th>Tip</th>
                    ${days.map(day => `<th class="text-center">${day}</th>`).join('')}
                    <th class="text-center">Total</th>
                </tr>
            </thead>
            <tbody>`;

        this.employees.forEach(employee => {
            const employeeRecords = this.timeRecords.filter(r => r.employee_id === employee.id);
            const totalHours = employeeRecords.reduce((sum, r) => sum + (r.worked_hours || 0), 0);
            const hasPontaj = employeeRecords.length > 0;
            const rowClass = hasPontaj ? 'employee-row has-time' : 'employee-row';

            // Start time row
            tableHTML += `
                <tr class="${rowClass}">
                    <td>
                        <div class="font-bold">${employee.name}</div>
                        <div class="text-xs text-gray-500">${employee.id}</div>
                    </td>
                    <td class="text-sm">Începere</td>
                    ${days.map(day => {
                        const date = this.formatDate(day, this.currentMonth, this.currentYear);
                        const record = employeeRecords.find(r => r.date === date);
                        const style = this.getStatusColorClass(record?.status);
                        const showValue = record?.status && record.status !== 'prezent' ? '' : (record?.start_time || '');
                        return `<td style="${style}">
                            <input type="time" value="${showValue}" onchange="app.updateTimeRecord('${employee.id}', '${date}', 'start_time', this.value)">
                        </td>`;
                    }).join('')}
                    <td class="text-center font-bold">${totalHours.toFixed(1)}h</td>
                </tr>`;

            // End time row
            tableHTML += `
                <tr class="${rowClass}" style="background-color: #f8f9fa;">
                    <td></td>
                    <td class="text-sm">Închidere</td>
                    ${days.map(day => {
                        const date = this.formatDate(day, this.currentMonth, this.currentYear);
                        const record = employeeRecords.find(r => r.date === date);
                        const style = this.getStatusColorClass(record?.status);
                        const showValue = record?.status && record.status !== 'prezent' ? '' : (record?.end_time || '');
                        return `<td style="${style}">
                            <input type="time" value="${showValue}" onchange="app.updateTimeRecord('${employee.id}', '${date}', 'end_time', this.value)">
                        </td>`;
                    }).join('')}
                    <td></td>
                </tr>`;

            // Status row
            tableHTML += `
                <tr class="${rowClass}" style="background-color: #f0f9ff;">
                    <td></td>
                    <td class="text-sm">Status</td>
                    ${days.map(day => {
                        const date = this.formatDate(day, this.currentMonth, this.currentYear);
                        const record = employeeRecords.find(r => r.date === date) || {};
                        const style = this.getStatusColorClass(record?.status);
                        return `<td style="${style}">
                            <select onchange="app.updateTimeRecord('${employee.id}', '${date}', 'status', this.value)">
                                <option value="prezent" ${record.status === 'prezent' ? 'selected' : ''}>prezent</option>
                                <option value="CO" ${record.status === 'CO' ? 'selected' : ''}>CO</option>
                                <option value="medical" ${record.status === 'medical' ? 'selected' : ''}>medical</option>
                                <option value="lipsa" ${record.status === 'lipsa' ? 'selected' : ''}>lipsă</option>
                            </select>
                        </td>`;
                    }).join('')}
                    <td></td>
                </tr>`;
        });

        tableHTML += '</tbody></table>';
        document.getElementById('pontaj-table').innerHTML = tableHTML;
    }

    async updateTimeRecord(employeeId, date, field, value) {
        try {
            let record = this.timeRecords.find(r => r.employee_id === employeeId && r.date === date);
            if (!record) {
                record = { employee_id: employeeId, date: date, start_time: '', end_time: '', worked_hours: 0, status: 'prezent' };
                this.timeRecords.push(record);
            }
            record[field] = value;

            if (record.status === 'prezent') {
                if (record.start_time && record.end_time) {
                    const start = new Date(`2000-01-01T${record.start_time}`);
                    const end = new Date(`2000-01-01T${record.end_time}`);
                    if (end <= start) end.setDate(end.getDate() + 1);
                    const diff = (end - start) / (1000 * 60 * 60);
                    record.worked_hours = Math.max(0, diff);
                } else {
                    record.worked_hours = 0;
                }
            } else {
                record.worked_hours = 0;
            }

            await window.electronAPI.saveTimeRecord(record);
            this.renderPontajTable();
            this.updateDashboard();
        } catch (error) {
            console.error('❌ Eroare la actualizarea pontajului:', error);
            this.showToast('Eroare la salvarea pontajului', 'error');
        }
    }
}

const app = new PontajApp();
