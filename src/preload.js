// ==================================================
// 📁 src/preload.js - Bridge Complet cu CRUD și Validări
// ==================================================
const { contextBridge, ipcRenderer } = require('electron');

// Expunere API-uri sigure către renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // ========================================
    // Operații angajați CRUD
    // ========================================
    getEmployees: (filters) => ipcRenderer.invoke('get-employees', filters),
    addEmployee: (employee) => ipcRenderer.invoke('add-employee', employee),
    updateEmployee: (employee) => ipcRenderer.invoke('update-employee', employee),
    deleteEmployee: (employeeId) => ipcRenderer.invoke('delete-employee', employeeId),

    // ========================================
    // Import/Export angajați
    // ========================================
    importPredefinedEmployees: () => ipcRenderer.invoke('import-predefined-employees'),
    importEmployeesFromCSV: () => ipcRenderer.invoke('import-employees-from-csv'),
    importEmployeesFromFile: () => ipcRenderer.invoke('import-employees-from-file'),

    // ========================================
    // Operații departamente și configurări
    // ========================================
    getDepartments: () => ipcRenderer.invoke('get-departments'),
    getShiftPresets: () => ipcRenderer.invoke('get-shift-presets'),
    
    // ========================================
    // Operații pontaj
    // ========================================
    getTimeRecords: (params) => ipcRenderer.invoke('get-time-records', params),
    saveTimeRecord: (record) => ipcRenderer.invoke('save-time-record', record),
    applyShiftPreset: (data) => ipcRenderer.invoke('apply-shift-preset', data),
    
    // ========================================
    // Calculatoare și utilități pontaj
    // ========================================
    calculateWorkedHours: (data) => ipcRenderer.invoke('calculate-worked-hours', data),
    getDashboardStats: (params) => ipcRenderer.invoke('get-dashboard-stats', params),

    // ========================================
    // Export/Import date complete
    // ========================================
    exportDatabase: () => ipcRenderer.invoke('export-database'),
    importDatabase: () => ipcRenderer.invoke('import-database'),
    exportCSV: (params) => ipcRenderer.invoke('export-csv', params),

    // ========================================
    // Event listeners pentru meniu
    // ========================================
    onMenuAction: (callback) => {
        // Cleanup previous listeners
        const events = [
            'menu-export', 'menu-import', 'menu-import-predefined', 
            'menu-import-csv', 'menu-set-shift', 'menu-add-employee',
            'menu-export-csv'
        ];
        
        events.forEach(event => {
            ipcRenderer.removeAllListeners(event);
        });

        // Set new listeners
        ipcRenderer.on('menu-export', () => callback({ type: 'menu-export' }));
        ipcRenderer.on('menu-import', () => callback({ type: 'menu-import' }));
        ipcRenderer.on('menu-import-predefined', () => callback({ type: 'menu-import-predefined' }));
        ipcRenderer.on('menu-import-csv', () => callback({ type: 'menu-import-csv' }));
        ipcRenderer.on('menu-set-shift', (event, shiftType) => callback({ type: 'menu-set-shift', data: shiftType }));
        ipcRenderer.on('menu-add-employee', () => callback({ type: 'menu-add-employee' }));
        ipcRenderer.on('menu-export-csv', () => callback({ type: 'menu-export-csv' }));
    },

    // ========================================
    // Notificări și sistem
    // ========================================
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

    // ========================================
    // Utilități aplicație
    // ========================================
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getAppInfo: () => ipcRenderer.invoke('get-app-info'),
    logToFile: (level, message, data) => ipcRenderer.invoke('log-to-file', level, message, data),
    
    // ========================================
    // Backup și restore
    // ========================================
    createBackup: () => ipcRenderer.invoke('create-backup'),
    restoreBackup: () => ipcRenderer.invoke('restore-backup'),
    
    // ========================================
    // Setări aplicație
    // ========================================
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    
    // ========================================
    // Validări server-side
    // ========================================
    validateEmployeeId: (id) => ipcRenderer.invoke('validate-employee-id', id),
    checkEmployeeExists: (id) => ipcRenderer.invoke('check-employee-exists', id),
    
    // ========================================
    // Rapoarte avansate
    // ========================================
    generateMonthlyReport: (params) => ipcRenderer.invoke('generate-monthly-report', params),
    generateDepartmentReport: (params) => ipcRenderer.invoke('generate-department-report', params),
    generateAttendanceReport: (params) => ipcRenderer.invoke('generate-attendance-report', params),
    generateCollectiveReport: (params) => ipcRenderer.invoke('generate-collective-report', params),
    exportReportToExcel: (reportData) => ipcRenderer.invoke('export-report-to-excel', reportData),

    // ========================================
    // Sărbători legale
    // ========================================
    importLegalHolidays: (year) => ipcRenderer.invoke('import-legal-holidays', year),
    getLegalHolidays: (year) => ipcRenderer.invoke('get-legal-holidays', year)
});

// ========================================
// Expunere funcții de utilitate pentru renderer
// ========================================
contextBridge.exposeInMainWorld('utils', {
    // ========================================
    // Date și timp - utilități extinse
    // ========================================
    formatDate: (date, format = 'ro-RO') => {
        if (!date) return '';
        try {
            return new Date(date).toLocaleDateString(format);
        } catch (e) {
            return '';
        }
    },
    
    formatDateTime: (date, format = 'ro-RO') => {
        if (!date) return '';
        try {
            return new Date(date).toLocaleString(format);
        } catch (e) {
            return '';
        }
    },
    
    formatTime: (time) => {
        if (!time) return '';
        // Ensure format is HH:MM (24-hour)
        if (time.includes(':')) {
            const [hours, minutes] = time.split(':');
            return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
        }
        return time;
    },
    
    addDays: (date, days) => {
        if (!date) return null;
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    },
    
    getDayOfWeek: (date) => {
        const days = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
        return days[new Date(date).getDay()];
    },
    
    isWeekend: (date) => {
        const day = new Date(date).getDay();
        return day === 0 || day === 6;
    },
    
    getWeekNumber: (date) => {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    },
    
    getMonthName: (monthIndex) => {
        const months = [
            'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
            'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
        ];
        return months[monthIndex] || '';
    },
    
    // ========================================
    // Calculatoare de timp și pontaj
    // ========================================
    calculateHoursBetween: (startTime, endTime) => {
        if (!startTime || !endTime) return 0;
        
        try {
            const start = new Date(`2000-01-01 ${startTime}`);
            let end = new Date(`2000-01-01 ${endTime}`);
            
            // Handle overnight shifts
            if (end <= start) {
                end.setDate(end.getDate() + 1);
            }
            
            const diffMs = end - start;
            return diffMs / (1000 * 60 * 60);
        } catch (e) {
            return 0;
        }
    },
    
    calculateWorkedHoursWithBreaks: (startTime, endTime, shiftType = 'SCHIMB_I') => {
        if (!startTime || !endTime) return { hours: 0, breaks: 0 };
        
        const totalHours = window.utils.calculateHoursBetween(startTime, endTime);
        let breakMinutes = 0;
        
        // Determine break based on shift type and total hours
        if (shiftType === 'TURA' || totalHours > 10) {
            breakMinutes = 60; // 1 hour for long shifts
        } else if (totalHours > 6) {
            breakMinutes = 30; // 30 minutes for regular shifts
        }
        
        const workedHours = Math.max(0, totalHours - (breakMinutes / 60));
        
        return {
            hours: Math.round(workedHours * 4) / 4, // Round to quarter hours
            breaks: breakMinutes,
            total: totalHours
        };
    },
    
    formatHours: (hours) => {
        if (!hours || hours === 0) return '';
        return `${hours.toFixed(1)}h`;
    },
    
    formatHoursDetailed: (hours, includeMinutes = false) => {
        if (!hours || hours === 0) return '0h';
        
        if (includeMinutes) {
            const h = Math.floor(hours);
            const m = Math.round((hours - h) * 60);
            return m > 0 ? `${h}h ${m}m` : `${h}h`;
        }
        
        return `${hours.toFixed(1)}h`;
    },
    
    // ========================================
    // Validatori extinși
    // ========================================
    isValidTime: (timeString) => {
        if (!timeString) return false;
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        return timeRegex.test(timeString);
    },
    
    isValidDate: (dateString) => {
        if (!dateString) return false;
        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date);
    },
    
    isValidEmployeeId: (id) => {
        if (!id) return false;
        // Format: 1-3 letters followed by 1 or more digits
        const idRegex = /^[A-Z]{1,3}\d+$/;
        return idRegex.test(id.toUpperCase());
    },
    
    isValidEmployeeName: (name) => {
        if (!name) return false;
        // At least 2 characters, letters, spaces, and some special characters
        const nameRegex = /^[A-ZĂÂÎȘȚ\s\-\.]{2,}$/i;
        return nameRegex.test(name);
    },
    
    validateTimeRange: (startTime, endTime) => {
        if (!window.utils.isValidTime(startTime) || !window.utils.isValidTime(endTime)) {
            return { valid: false, error: 'Format timp invalid' };
        }
        
        const hours = window.utils.calculateHoursBetween(startTime, endTime);
        if (hours <= 0) {
            return { valid: false, error: 'Ora de sfârșit trebuie să fie după ora de început' };
        }
        
        if (hours > 16) {
            return { valid: false, error: 'Intervalul de lucru nu poate depăși 16 ore' };
        }
        
        return { valid: true, hours };
    },
    
    // ========================================
    // String helpers
    // ========================================
    capitalizeWords: (str) => {
        if (!str) return '';
        return str.replace(/\w\S*/g, (txt) => 
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
    },
    
    normalizeEmployeeName: (name) => {
        if (!name) return '';
        return name.trim().toUpperCase().replace(/\s+/g, ' ');
    },
    
    extractDepartmentFromId: (employeeId) => {
        if (!employeeId) return '';
        const match = employeeId.match(/^([A-Z]+)/);
        return match ? match[1] : '';
    },
    
    sanitizeFilename: (filename) => {
        if (!filename) return '';
        return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
    },
    
    // ========================================
    // Array helpers
    // ========================================
    groupBy: (array, key) => {
        if (!Array.isArray(array)) return {};
        return array.reduce((result, item) => {
            const group = item[key];
            if (!result[group]) {
                result[group] = [];
            }
            result[group].push(item);
            return result;
        }, {});
    },
    
    sortBy: (array, key, direction = 'asc') => {
        if (!Array.isArray(array)) return [];
        return array.sort((a, b) => {
            const aVal = a[key];
            const bVal = b[key];
            
            if (direction === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });
    },
    
    filterBy: (array, filters) => {
        if (!Array.isArray(array) || !filters) return array;
        
        return array.filter(item => {
            return Object.keys(filters).every(key => {
                const filterValue = filters[key];
                if (!filterValue) return true; // Skip empty filters
                
                const itemValue = item[key];
                if (typeof filterValue === 'string') {
                    return itemValue?.toLowerCase().includes(filterValue.toLowerCase());
                }
                return itemValue === filterValue;
            });
        });
    },
    
    // ========================================
    // Statistici și calcule
    // ========================================
    calculateAttendanceStats: (timeRecords) => {
        if (!Array.isArray(timeRecords)) return {};
        
        const totalDays = timeRecords.length;
        const presentDays = timeRecords.filter(r => r.status === 'present' && r.worked_hours > 0).length;
        const totalHours = timeRecords.reduce((sum, r) => sum + (r.worked_hours || 0), 0);
        const avgHoursPerDay = presentDays > 0 ? totalHours / presentDays : 0;
        
        return {
            totalDays,
            presentDays,
            absentDays: totalDays - presentDays,
            totalHours,
            avgHoursPerDay,
            attendanceRate: totalDays > 0 ? (presentDays / totalDays) * 100 : 0
        };
    },
    
    // ========================================
    // Performance și optimizări
    // ========================================
    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    throttle: (func, wait) => {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, wait);
            }
        };
    },
    
    // ========================================
    // Error handling și logging
    // ========================================
    handleError: (error, context = '') => {
        console.error(`Error ${context}:`, error);
        
        // Send error to main process for logging
        if (window.electronAPI && window.electronAPI.logToFile) {
            window.electronAPI.logToFile('error', `${context}: ${error.message}`, {
                stack: error.stack,
                timestamp: new Date().toISOString()
            });
        }
        
        return {
            message: error.message || 'A apărut o eroare necunoscută',
            code: error.code || 'UNKNOWN_ERROR',
            context,
            timestamp: new Date().toISOString()
        };
    },
    
    logInfo: (message, data = {}) => {
        console.log(`INFO: ${message}`, data);
        if (window.electronAPI && window.electronAPI.logToFile) {
            window.electronAPI.logToFile('info', message, data);
        }
    },
    
    // ========================================
    // Local Storage helpers (pentru cache)
    // ========================================
    setCache: (key, value, expireMinutes = 60) => {
        try {
            const item = {
                value,
                timestamp: Date.now(),
                expire: Date.now() + (expireMinutes * 60 * 1000)
            };
            localStorage.setItem(`pontaj_cache_${key}`, JSON.stringify(item));
        } catch (e) {
            console.warn('Cache set failed:', e);
        }
    },
    
    getCache: (key) => {
        try {
            const item = localStorage.getItem(`pontaj_cache_${key}`);
            if (!item) return null;
            
            const parsed = JSON.parse(item);
            if (Date.now() > parsed.expire) {
                localStorage.removeItem(`pontaj_cache_${key}`);
                return null;
            }
            
            return parsed.value;
        } catch (e) {
            console.warn('Cache get failed:', e);
            return null;
        }
    },
    
    clearCache: (pattern = '') => {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith(`pontaj_cache_${pattern}`)) {
                    localStorage.removeItem(key);
                }
            });
        } catch (e) {
            console.warn('Cache clear failed:', e);
        }
    }
});

console.log('✅ Preload script complet încărcat cu toate funcționalitățile CRUD și validări');

// ========================================
// Initialize performance monitoring
// ========================================
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        const loadTime = Date.now() - window.performance.timing.navigationStart;
        console.log(`🚀 App loaded in ${loadTime}ms`);
        
        if (window.electronAPI && window.electronAPI.logToFile) {
            window.electronAPI.logToFile('info', 'App loaded', { 
                loadTime,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Track unload time for performance metrics
    window.addEventListener('beforeunload', () => {
        const sessionTime = Date.now() - window.performance.timing.navigationStart;
        if (window.electronAPI && window.electronAPI.logToFile) {
            window.electronAPI.logToFile('info', 'Session ended', { 
                sessionTime,
                timestamp: new Date().toISOString()
            });
        }
    });
}

// ========================================
// Global error handlers
// ========================================
window.addEventListener('error', (event) => {
    const error = {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
    };
    
    console.error('Uncaught error:', error);
    
    if (window.electronAPI && window.electronAPI.logToFile) {
        window.electronAPI.logToFile('error', 'Uncaught error', error);
    }
});

window.addEventListener('unhandledrejection', (event) => {
    const error = {
        reason: event.reason,
        promise: event.promise,
        stack: event.reason?.stack
    };
    
    console.error('Unhandled promise rejection:', error);
    
    if (window.electronAPI && window.electronAPI.logToFile) {
        window.electronAPI.logToFile('error', 'Unhandled promise rejection', error);
    }
});

// ========================================
// Notification permission request on load
// ========================================
if (typeof window !== 'undefined' && 'Notification' in window) {
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
}