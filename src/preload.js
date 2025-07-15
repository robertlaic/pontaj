const { contextBridge, ipcRenderer } = require('electron');

const API_CONFIG = {
    baseURL: process.env.API_BASE_URL || 'http://10.129.67.66:9000/api',
    healthURL: process.env.API_HEALTH_URL || 'http://10.129.67.66:9000/health',
    timeout: 30000
};

contextBridge.exposeInMainWorld('electronAPI', {
    getApiConfig: () => API_CONFIG,

    getEmployees: (filters) => ipcRenderer.invoke('get-employees', filters),
    addEmployee: (employee) => ipcRenderer.invoke('add-employee', employee),
    updateEmployee: (employee) => ipcRenderer.invoke('update-employee', employee),
    deleteEmployee: (employeeId) => ipcRenderer.invoke('delete-employee', employeeId),

    importPredefinedEmployees: () => ipcRenderer.invoke('import-predefined-employees'),
    importEmployeesFromCSV: () => ipcRenderer.invoke('import-employees-from-csv'),

    validateEmployeeId: async (id) => {
        if (!id || !/^[A-Z]{1,3}\d+$/.test(id)) {
            return { valid: false, error: 'Format invalid. Folosiți: cod departament + număr (ex: DC1, FA2)' };
        }
        return { valid: true };
    },

    checkEmployeeExists: async (id) => {
        try {
            const employees = await ipcRenderer.invoke('get-employees', { includeInactive: true });
            const exists = employees.some(emp => emp.id === id);
            return { exists, employee: exists ? employees.find(emp => emp.id === id) : null };
        } catch (error) {
            return { exists: false, error: error.message };
        }
    },

    getDepartments: () => ipcRenderer.invoke('get-departments'),
    getShiftPresets: () => ipcRenderer.invoke('get-shift-presets'),

    getTimeRecords: (params) => ipcRenderer.invoke('get-time-records', params),
    saveTimeRecord: (record) => ipcRenderer.invoke('save-time-record', record),
    applyShiftPreset: (data) => ipcRenderer.invoke('apply-shift-preset', data),

    calculateWorkedHours: (data) => ipcRenderer.invoke('calculate-worked-hours', data),

    generateCollectiveReport: (params) => ipcRenderer.invoke('generate-collective-report', params),
    exportReportToExcel: (reportData) => ipcRenderer.invoke('export-report-to-excel', reportData),

    showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),

    importLegalHolidays: (year) => ipcRenderer.invoke('import-legal-holidays', year),
    getLegalHolidays: (year) => ipcRenderer.invoke('get-legal-holidays', year),

    onMenuAction: (callback) => {
        const events = [
            'menu-export', 'menu-import', 'menu-import-predefined',
            'menu-import-csv', 'menu-set-shift', 'menu-add-employee',
            'menu-export-csv'
        ];
        events.forEach(event => ipcRenderer.removeAllListeners(event));
        events.forEach(event => ipcRenderer.on(event, (e, data) => callback({ type: event, data })));
    },

    showNotification: (title, body, options = {}) => {
        if (Notification.permission === 'granted') {
            new Notification(title, {
                body,
                icon: options.icon || '../assets/icon.png',
                silent: options.silent || false
            });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification(title, { body });
                }
            });
        }
    },

    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getAppInfo: () => ({
        version: '1.0.0',
        backend: API_CONFIG.baseURL,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.versions.node,
        electronVersion: process.versions.electron
    }),

    // 🔁 NOU: Verificare server prin ipcMain
    checkServerConnection: () => ipcRenderer.invoke('check-server'),

    clearApplicationCache: () => {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('pontaj_') || key.startsWith('app_cache_')) {
                    localStorage.removeItem(key);
                }
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
});
