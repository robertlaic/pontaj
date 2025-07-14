// Creează un fișier test-xlsx.js în directorul principal pentru a testa instalarea

const XLSX = require('xlsx');

console.log('✅ XLSX loaded successfully!');
console.log('📦 XLSX version:', XLSX.version);

// Test basic functionality
const workbook = XLSX.utils.book_new();
const worksheetData = [
    ['Test', 'Data'],
    ['Hello', 'World']
];
const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
XLSX.utils.book_append_sheet(workbook, worksheet, 'Test');

console.log('🧪 Basic XLSX functionality works!');
console.log('📊 Workbook created with sheet:', workbook.SheetNames);

// Test pentru a verifica că este compatibil cu Electron
if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
    console.log('⚡ Running in Electron environment');
    console.log('🔧 Electron version:', process.versions.electron);
} else {
    console.log('🖥️ Running in Node.js environment');
}

console.log('✨ All tests passed! XLSX is ready for use.');cd 