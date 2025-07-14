// ==================================================
// 📁 src/preload.js - Bridge Actualizat pentru Backend PostgreSQL
// ==================================================
const { contextBridge, ipcRenderer } = require('electron');

// Configurarea API-ului backend
const API_CONFIG = {
    baseURL: process.env.API_BASE_URL || 'http://10.129.67.66:9000/api',
    healthURL: process.env.API_HEALTH_URL || 'http://10.129.67.66:9000/health',
    timeout: 30000
};

// Expunere API-uri sigure către renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // ========================================
    // Configurări și informații sistem
    // ========================================
    getApiConfig: () => API_CONFIG,
    
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
    
    // Validări angajați (server-side prin API)
    validateEmployeeId: async (id) => {
        try {
            if (!id || !/^[A-Z]{1,3}\d+$/.test(id)) {
                return { valid: false, error: 'Format invalid. Folosiți: cod departament + număr (ex: DC1, FA2)' };
            }
            return { valid: true };
        } catch (error) {
            return { valid: false, error: 'Eroare la validarea ID-ului' };
        }
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
    
    // ========================================
    // Rapoarte și statistici
    // ========================================
    generateCollectiveReport: (params) => ipcRenderer.invoke('generate-collective-report', params),
    exportReportToExcel: (reportData) => ipcRenderer.invoke('export-report-to-excel', reportData),

    // ========================================
    // Sărbători legale
    // ========================================
    importLegalHolidays: (year) => ipcRenderer.invoke('import-legal-holidays', year),
    getLegalHolidays: (year) => ipcRenderer.invoke('get-legal-holidays', year),

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
    getAppInfo: () => {
        return {
            version: '1.0.0',
            backend: API_CONFIG.baseURL,
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.versions.node,
            electronVersion: process.versions.electron
        };
    },

    // ========================================
    // Funcții de conectivitate și health check
    // ========================================
    checkServerConnection: async () => {
        try {
            const response = await fetch(API_CONFIG.healthURL, {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                const data = await response.json();
                return { 
                    connected: true, 
                    status: data.status,
                    timestamp: data.timestamp,
                    version: data.version
                };
            } else {
                return { 
                    connected: false, 
                    error: `Server error: ${response.status}` 
                };
            }
        } catch (error) {
            return { 
                connected: false, 
                error: error.message || 'Conexiune eșuată'
            };
        }
    },

    // ========================================
    // Cache management pentru performanță
    // ========================================
    clearApplicationCache: () => {
        try {
            // Clear localStorage cache pentru aplicație
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

// ========================================
// Expunere funcții utilitare extinse
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
    // Validatori extinși pentru backend
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
    // Array helpers pentru procesarea datelor
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
    // Statistici și calcule pentru rapoarte
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
    
    calculateDepartmentStats: (employees, timeRecords) => {
        if (!Array.isArray(employees) || !Array.isArray(timeRecords)) return {};
        
        const departmentStats = {};
        
        employees.forEach(emp => {
            if (!departmentStats[emp.department]) {
                departmentStats[emp.department] = {
                    totalEmployees: 0,
                    totalHours: 0,
                    presentDays: 0,
                    avgHours: 0
                };
            }
            
            departmentStats[emp.department].totalEmployees++;
            
            const empRecords = timeRecords.filter(r => r.employee_id === emp.id);
            const empStats = window.utils.calculateAttendanceStats(empRecords);
            
            departmentStats[emp.department].totalHours += empStats.totalHours;
            departmentStats[emp.department].presentDays += empStats.presentDays;
        });
        
        // Calculate averages
        Object.keys(departmentStats).forEach(dept => {
            const stats = departmentStats[dept];
            stats.avgHours = stats.totalEmployees > 0 ? stats.totalHours / stats.totalEmployees : 0;
        });
        
        return departmentStats;
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
        
        const errorInfo = {
            message: error.message || 'A apărut o eroare necunoscută',
            code: error.code || 'UNKNOWN_ERROR',
            context,
            timestamp: new Date().toISOString(),
            stack: error.stack
        };
        
        // Store error info for potential reporting
        try {
            const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');
            errors.push(errorInfo);
            // Keep only last 50 errors
            if (errors.length > 50) {
                errors.splice(0, errors.length - 50);
            }
            localStorage.setItem('app_errors', JSON.stringify(errors));
        } catch (e) {
            console.warn('Could not store error info:', e);
        }
        
        return errorInfo;
    },
    
    logInfo: (message, data = {}) => {
        console.log(`INFO: ${message}`, data);
        
        try {
            const logs = JSON.parse(localStorage.getItem('app_logs') || '[]');
            logs.push({
                level: 'info',
                message,
                data,
                timestamp: new Date().toISOString()
            });
            // Keep only last 100 logs
            if (logs.length > 100) {
                logs.splice(0, logs.length - 100);
            }
            localStorage.setItem('app_logs', JSON.stringify(logs));
        } catch (e) {
            console.warn('Could not store log info:', e);
        }
    },
    
    // ========================================
    // Local Storage helpers pentru cache
    // ========================================
    setCache: (key, value, expireMinutes = 60) => {
        try {
            const item = {
                value,
                timestamp: Date.now(),
                expire: Date.now() + (expireMinutes * 60 * 1000)
            };
            localStorage.setItem(`pontaj_cache_${key}`, JSON.stringify(item));
            return true;
        } catch (e) {
            console.warn('Cache set failed:', e);
            return false;
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
            return true;
        } catch (e) {
            console.warn('Cache clear failed:', e);
            return false;
        }
    },
    
    // ========================================
    // Network helpers pentru status conexiune
    // ========================================
    isOnline: () => navigator.onLine,
    
    onNetworkChange: (callback) => {
        window.addEventListener('online', () => callback(true));
        window.addEventListener('offline', () => callback(false));
    },
    
    // ========================================
    // Date helpers specifice pentru pontaj
    // ========================================
    getCurrentShift: () => {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const currentTime = hour + (minute / 60);
        
        if (currentTime >= 7 && currentTime < 15.5) {
            return 'SCHIMB_I';
        } else if (currentTime >= 15.5 || currentTime < 7) {
            return 'SCHIMB_II';
        } else {
            return 'TURA';
        }
    },
    
    isWorkingDay: (date) => {
        const day = new Date(date).getDay();
        return day >= 1 && day <= 5; // Monday to Friday
    },
    
    getWorkingDaysInMonth: (year, month) => {
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0);
        let workingDays = 0;
        
        for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
            if (window.utils.isWorkingDay(d)) {
                workingDays++;
            }
        }
        
        return workingDays;
    }
});

console.log('✅ Preload script actualizat pentru backend PostgreSQL');
console.log(`🌐 API Backend: ${API_CONFIG.baseURL}`);

// ========================================
// Initialize performance monitoring
// ========================================
if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
        const loadTime = Date.now() - window.performance.timing.navigationStart;
        console.log(`🚀 App loaded in ${loadTime}ms`);
        
        // Log performance info
        window.utils.logInfo('App loaded', { 
            loadTime,
            userAgent: navigator.userAgent,
            apiBackend: API_CONFIG.baseURL
        });
    });
    
    // Track unload time for performance metrics
    window.addEventListener('beforeunload', () => {
        const sessionTime = Date.now() - window.performance.timing.navigationStart;
        window.utils.logInfo('Session ended', { 
            sessionTime,
            timestamp: new Date().toISOString()
        });
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
    window.utils.handleError(new Error(error.message), 'Uncaught error');
});

window.addEventListener('unhandledrejection', (event) => {
    const error = {
        reason: event.reason,
        promise: event.promise,
        stack: event.reason?.stack
    };
    
    console.error('Unhandled promise rejection:', error);
    window.utils.handleError(new Error(error.reason), 'Unhandled promise rejection');
});

// ========================================
// Network status monitoring
// ========================================
window.utils.onNetworkChange((isOnline) => {
    console.log(`Network status: ${isOnline ? 'Online' : 'Offline'}`);
    window.utils.logInfo('Network status changed', { isOnline });
    
    // Show notification for network changes
    if (window.electronAPI && window.electronAPI.showNotification) {
        window.electronAPI.showNotification(
            'Status Conexiune',
            isOnline ? 'Conexiune restabilită' : 'Conexiune pierdută',
            { silent: false }
        );
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