// ===== ИМПОРТ FIREBASE =====
import { db } from './firebase-config.js';
import {
    collection,
    doc,
    getDocs,
    setDoc,
    deleteDoc,
    query,
    orderBy,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ===== ДАННЫЕ =====
let records = [];
let tariffs = [];
let currentFilter = 'all';
let isFirebaseConnected = false;
let currentInputType = 'electricity';

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', async () => {
    await initFirebase();
    loadData();
    initDates();
    populatePeriodSelectors();
    updateTariffList();
    updateHistory();
    updateAnalytics();
    setupTariffForm();
});

// ===== FIREBASE (modular SDK) =====
async function initFirebase() {
    try {
        await getDocs(collection(db, 'tariffs'));
        isFirebaseConnected = true;
        updateSyncStatus('connected');
        await syncFromFirebase();
    } catch (error) {
        console.error('Firebase error:', error);
        isFirebaseConnected = false;
        updateSyncStatus('error');
    }
}

function updateSyncStatus(status) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    
    el.className = 'sync-status ' + status;    
    if (status === 'connected') {
        el.innerHTML = '<ion-icon name="cloud-done-outline"></ion-icon><span>✓ Подключено к Firebase</span>';
    } else if (status === 'error') {
        el.innerHTML = '<ion-icon name="cloud-offline-outline"></ion-icon><span>⚠ Ошибка подключения</span>';
    } else {
        el.innerHTML = '<ion-icon name="phone-portrait-outline"></ion-icon><span>📱 Локальное хранение</span>';
    }
}

async function syncFromFirebase() {
    if (!isFirebaseConnected) return;
    
    try {
        const tariffsQuery = query(collection(db, 'tariffs'), orderBy('date', 'asc'));
        const tariffsSnap = await getDocs(tariffsQuery);
        const newTariffs = [];
        tariffsSnap.forEach(docSnap => {
            newTariffs.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        const recordsQuery = query(collection(db, 'records'));
        const recordsSnap = await getDocs(recordsQuery);
        const newRecords = [];
        recordsSnap.forEach(docSnap => {
            newRecords.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        if (newTariffs.length > 0) tariffs = newTariffs;
        if (newRecords.length > 0) records = newRecords;
        
        saveLocal();
        updateTariffList();
        updateHistory();
        updateAnalytics();
        
        console.log('✅ Синхронизация из Firebase:', records.length, 'записей,', tariffs.length, 'тарифов');
    } catch (error) {
        console.error('Sync from Firebase error:', error);
    }
}

async function syncRecordToFirebase(record) {
    if (!isFirebaseConnected) return;
    
    try {
        await setDoc(doc(db, 'records', record.id), record);
        console.log('✅ Запись сохранена в Firebase:', record.id);
    } catch (error) {
        console.error('Sync record error:', error);        updateSyncStatus('error');
    }
}

async function deleteRecordFromFirebase(id) {
    if (!isFirebaseConnected) return;
    
    try {
        await deleteDoc(doc(db, 'records', id));
        console.log('✅ Запись удалена из Firebase:', id);
    } catch (error) {
        console.error('Delete record error:', error);
    }
}

async function syncTariffToFirebase(tariff) {
    if (!isFirebaseConnected) return;
    
    try {
        await setDoc(doc(db, 'tariffs', tariff.id), tariff);
        console.log('✅ Тариф сохранен в Firebase:', tariff.id);
    } catch (error) {
        console.error('Sync tariff error:', error);
    }
}

async function deleteTariffFromFirebase(id) {
    if (!isFirebaseConnected) return;
    
    try {
        await deleteDoc(doc(db, 'tariffs', id));
        console.log('✅ Тариф удален из Firebase:', id);
    } catch (error) {
        console.error('Delete tariff error:', error);
    }
}

// ===== ЛОКАЛЬНОЕ ХРАНЕНИЕ =====
function loadData() {
    const savedRecords = localStorage.getItem('dom_records');
    const savedTariffs = localStorage.getItem('dom_tariffs');
    
    if (savedRecords) records = JSON.parse(savedRecords);
    if (savedTariffs) tariffs = JSON.parse(savedTariffs);
    
    // Тарифы по умолчанию из PDF
    if (tariffs.length === 0) {
        tariffs = [
            { id: 't1', date: '2023-09-25', t1: 3.72, t2: 0, gas: 0 },
            { id: 't2', date: '2023-10-25', t1: 3.71, t2: 0, gas: 0 },            { id: 't3', date: '2024-01-25', t1: 3.71, t2: 0, gas: 0 },
            { id: 't4', date: '2024-06-18', t1: 3.71, t2: 0, gas: 0 },
            { id: 't5', date: '2024-06-24', t1: 3.89, t2: 2.39, gas: 0 },
            { id: 't6', date: '2024-07-24', t1: 4.48, t2: 2.75, gas: 0 },
            { id: 't7', date: '2025-07-24', t1: 5.15, t2: 3.10, gas: 6.46 },
            { id: 't8', date: '2025-12-24', t1: 5.15, t2: 3.10, gas: 7.23 },
            { id: 't9', date: '2026-01-15', t1: 5.15, t2: 3.10, gas: 7.35 }
        ];
        saveLocal();
    }
}

function saveLocal() {
    localStorage.setItem('dom_records', JSON.stringify(records));
    localStorage.setItem('dom_tariffs', JSON.stringify(tariffs));
}

async function saveTariffs() {
    saveLocal();
    
    if (isFirebaseConnected) {
        try {
            const batch = writeBatch(db);
            tariffs.forEach(tariff => {
                const ref = doc(db, 'tariffs', tariff.id);
                batch.set(ref, tariff);
            });
            await batch.commit();
            console.log('✅ Тарифы сохранены в Firebase:', tariffs.length);
        } catch (error) {
            console.error('❌ Ошибка сохранения тарифов:', error);
        }
    }
}

function initDates() {
    const today = new Date().toISOString().split('T')[0];
    
    // Инициализируем только активную форму
    if (currentInputType === 'electricity') {
        const el = document.getElementById('elec-date');
        if (el) el.value = today;
    } else if (currentInputType === 'gas') {
        const el = document.getElementById('gas-date');
        if (el) el.value = today;
    } else if (currentInputType === 'salt') {
        const el = document.getElementById('salt-date');
        if (el) el.value = today;
    } else if (currentInputType === 'cartridge') {
        const el = document.getElementById('cartridge-date');
        if (el) el.value = today;
    }
}

function populatePeriodSelectors() {
    const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const monthSelect = document.getElementById('analytics-month');
    const yearSelect = document.getElementById('analytics-year');
    
    if (monthSelect && monthSelect.options.length <= 1) {        months.forEach((m, i) => {
            const option = document.createElement('option');
            option.value = (i + 1).toString();
            option.textContent = m;
            monthSelect.appendChild(option);
        });
    }
    
    if (yearSelect) {
        yearSelect.innerHTML = '<option value="">Все годы</option>';
        const years = new Set();
        records.forEach(r => {
            if (r.date) years.add(new Date(r.date).getFullYear());
        });
        years.add(new Date().getFullYear());
        
        Array.from(years).sort((a, b) => b - a).forEach(y => {
            const option = document.createElement('option');
            option.value = y.toString();
            option.textContent = y;
            yearSelect.appendChild(option);
        });
    }
}

// ===== НАВИГАЦИЯ =====
function switchTab(tabName, btn) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`tab-${tabName}`).classList.add('active');
    if (btn) btn.classList.add('active');
    
    if (tabName === 'analytics') updateAnalytics();
    if (tabName === 'history') updateHistory();
}

// ===== АВТОРАСЧЕТ ЭЛЕКТРИЧЕСТВА =====
function autoCalcElectric() {
    const t1 = parseFloat(document.getElementById('elec-t1').value) || 0;
    const t2 = parseFloat(document.getElementById('elec-t2').value) || 0;
    
    const lastRecord = getLastElectricRecord();
    const tariff = getCurrentTariff();
    
    if (lastRecord && tariff) {
        const consumptionT1 = Math.max(0, t1 - lastRecord.t1);
        const consumptionT2 = Math.max(0, t2 - lastRecord.t2);
        
        document.getElementById('elec-t1-consumption').textContent = `${consumptionT1.toFixed(2)} кВт·ч`;        document.getElementById('elec-t2-consumption').textContent = `${consumptionT2.toFixed(2)} кВт·ч`;
        
        const total = (consumptionT1 * tariff.t1) + (consumptionT2 * (tariff.t2 || 0));
        document.getElementById('elec-total').textContent = `${total.toFixed(2)} ₽`;
    } else {
        document.getElementById('elec-t1-consumption').textContent = '0 кВт·ч';
        document.getElementById('elec-t2-consumption').textContent = '0 кВт·ч';
        document.getElementById('elec-total').textContent = 'Нет данных';
    }
}

function getLastElectricRecord() {
    const elecRecords = records
        .filter(r => r.type === 'electricity')
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    return elecRecords[0] || null;
}

// ===== АВТОРАСЧЕТ ГАЗА =====
function autoCalcGas() {
    const reading = parseFloat(document.getElementById('gas-reading').value) || 0;
    const lastRecord = getLastGasRecord();
    const tariff = getCurrentTariff();
    
    if (lastRecord && tariff && tariff.gas) {
        const consumption = Math.max(0, reading - lastRecord.reading);
        document.getElementById('gas-consumption').textContent = `${consumption.toFixed(2)} м³`;
        document.getElementById('gas-total').textContent = `${(consumption * tariff.gas).toFixed(2)} ₽`;
    } else {
        document.getElementById('gas-consumption').textContent = '0 м³';
        document.getElementById('gas-total').textContent = 'Нет тарифа';
    }
}

function getLastGasRecord() {
    const gasRecords = records
        .filter(r => r.type === 'gas')
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    return gasRecords[0] || null;
}

// ===== ТАРИФЫ =====
function getCurrentTariff() {
    const today = new Date().toISOString().split('T')[0];
    const validTariffs = tariffs
        .filter(t => t.date <= today)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    return validTariffs[0] || null;
}
function getTariffForDate(date) {
    const validTariffs = tariffs
        .filter(t => t.date <= date)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    return validTariffs[0] || tariffs[0];
}

function setupTariffForm() {
    const form = document.getElementById('tariff-form');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const tariff = {
            id: 'tariff_' + Date.now(),
            date: document.getElementById('tariff-date').value,
            t1: parseFloat(document.getElementById('tariff-t1').value),
            t2: parseFloat(document.getElementById('tariff-t2').value) || 0,
            gas: parseFloat(document.getElementById('tariff-gas').value) || 0,
            createdAt: new Date().toISOString()
        };
        
        tariffs.push(tariff);
        tariffs.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        await saveTariffs();
        updateTariffList();
        
        form.reset();
        initDates();
        
        alert('✓ Тариф добавлен!');
    });
}

function updateTariffList() {
    const list = document.getElementById('tariffs-list');
    if (!list) return;
    
    const currentTariff = getCurrentTariff();
    const sorted = [...tariffs].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (sorted.length === 0) {
        list.innerHTML = '<p class="hint-text">Нет сохраненных тарифов</p>';
        return;
    }
    
    list.innerHTML = sorted.map(t => {
        const isCurrent = currentTariff && t.id === currentTariff.id;        return `
            <div class="tariff-item ${isCurrent ? 'current' : ''}">
                <div class="tariff-date">
                    <ion-icon name="calendar-outline"></ion-icon>
                    ${formatDate(t.date)}
                    ${isCurrent ? '<span style="color: var(--ios-success); font-weight: bold; margin-left: 8px;">(действует)</span>' : ''}
                </div>
                <div class="tariff-values">
                    <div>
                        <ion-icon name="sunny-outline" style="color: var(--ios-warning);"></ion-icon>
                        Т1: ${t.t1} ₽/кВт·ч
                    </div>
                    <div>
                        <ion-icon name="moon-outline" style="color: var(--ios-accent);"></ion-icon>
                        Т2: ${t.t2 || 0} ₽/кВт·ч
                    </div>
                    <div>
                        <ion-icon name="flame-outline" style="color: var(--ios-warning);"></ion-icon>
                        Газ: ${t.gas || 0} ₽/м³
                    </div>
                </div>
                <div class="tariff-actions">
                    <button class="btn btn-danger" onclick="deleteTariff('${t.id}')">
                        <ion-icon name="trash-outline"></ion-icon>
                        Удалить
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function deleteTariff(id) {
    if (!confirm('Удалить этот тариф?')) return;
    
    tariffs = tariffs.filter(t => t.id !== id);
    saveLocal();
    await deleteTariffFromFirebase(id);
    updateTariffList();
}



// ===== ИСТОРИЯ =====
function filterHistory(type) {
    currentFilter = type;
    document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
    event.currentTarget.classList.add('active');
    updateHistory();
}

function updateHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    
    let filtered = [...records];
    if (currentFilter !== 'all') {
        filtered = filtered.filter(r => r.type === currentFilter);
    }
    
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (filtered.length === 0) {
        list.innerHTML = '<p class="hint-text">Нет записей</p>';
        return;
    }
    
    list.innerHTML = filtered.map(r => {
        let content = '';
        
        if (r.type === 'electricity') {
            content = `
                <div class="history-header">
                    <span class="history-date">
                        <ion-icon name="flash-outline" style="color: var(--ios-warning);"></ion-icon>
                        ${formatDate(r.date)}
                    </span>
                    <span class="history-type">Электроэнергия</span>
                </div>                <div class="history-values">
                    <div><ion-icon name="sunny-outline" style="color: var(--ios-warning);"></ion-icon> Т1: ${r.t1} кВт·ч</div>
                    <div><ion-icon name="moon-outline" style="color: var(--ios-accent);"></ion-icon> Т2: ${r.t2} кВт·ч</div>
                    <div>Расход Т1: ${r.consumptionT1.toFixed(2)} кВт·ч</div>
                    <div>Расход Т2: ${r.consumptionT2.toFixed(2)} кВт·ч</div>
                </div>
                <div class="history-total">Итого: ${r.total.toFixed(2)} ₽</div>
            `;
        } else if (r.type === 'gas') {
            content = `
                <div class="history-header">
                    <span class="history-date">
                        <ion-icon name="flame-outline" style="color: var(--ios-warning);"></ion-icon>
                        ${formatDate(r.date)}
                    </span>
                    <span class="history-type">Газ</span>
                </div>
                <div class="history-values">
                    <div><ion-icon name="speedometer-outline"></ion-icon> Показание: ${r.reading} м³</div>
                    <div>Расход: ${r.consumption.toFixed(2)} м³</div>
                    <div>Тариф: ${r.tariff.gas} ₽/м³</div>
                </div>
                <div class="history-total">Итого: ${r.total.toFixed(2)} ₽</div>
            `;
        } else if (r.type === 'salt') {
            content = `
                <div class="history-header">
                    <span class="history-date">
                        <ion-icon name="snow-outline" style="color: var(--ios-text-secondary);"></ion-icon>
                        ${formatDate(r.date)}
                    </span>
                    <span class="history-type">Засыпка соли</span>
                </div>
                <div class="history-values">
                    <div><ion-icon name="scale-outline"></ion-icon> Количество: ${r.kg} кг</div>
                </div>
            `;
        } else if (r.type === 'cartridge') {
            content = `
                <div class="history-header">
                    <span class="history-date">
                        <ion-icon name="filter-outline" style="color: var(--ios-success);"></ion-icon>
                        ${formatDate(r.date)}
                    </span>
                    <span class="history-type">Замена картриджа</span>
                </div>
            `;
        }
        
        return `            <div class="history-item ${r.type}">
                ${content}
                <div class="history-actions">
                    <button class="btn btn-secondary" onclick="editRecord('${r.id}')">
                        <ion-icon name="create-outline"></ion-icon>
                        Редактировать
                    </button>
                    <button class="btn btn-danger" onclick="deleteRecord('${r.id}')">
                        <ion-icon name="trash-outline"></ion-icon>
                        Удалить
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function deleteRecord(id) {
    if (!confirm('Удалить эту запись?')) return;
    
    records = records.filter(r => r.id !== id);
    saveLocal();
    await deleteRecordFromFirebase(id);
    updateHistory();
    updateAnalytics();
}

function editRecord(id) {
    const record = records.find(r => r.id === id);
    if (!record) return;
    
    if (record.type === 'electricity') {
        document.getElementById('elec-date').value = record.date;
        document.getElementById('elec-t1').value = record.t1;
        document.getElementById('elec-t2').value = record.t2;
        autoCalcElectric();
    } else if (record.type === 'gas') {
        document.getElementById('gas-date').value = record.date;
        document.getElementById('gas-reading').value = record.reading;
        autoCalcGas();
    } else if (record.type === 'salt') {
        document.getElementById('salt-date').value = record.date;
        document.getElementById('salt-kg').value = record.kg;
    } else if (record.type === 'cartridge') {
        document.getElementById('cartridge-date').value = record.date;
    }
    
    records = records.filter(r => r.id !== id);
    saveLocal();
    deleteRecordFromFirebase(id);    
    switchTab('input', document.querySelector('.nav-btn'));
    updateHistory();
}

// ===== АНАЛИТИКА =====
function updateAnalytics() {
    const month = document.getElementById('analytics-month')?.value;
    const year = document.getElementById('analytics-year')?.value;
    
    let filtered = [...records];
    
    if (month) {
        filtered = filtered.filter(r => {
            const d = new Date(r.date);
            return (d.getMonth() + 1).toString() === month;
        });
    }
    
    if (year) {
        filtered = filtered.filter(r => {
            const d = new Date(r.date);
            return d.getFullYear().toString() === year;
        });
    }
    
    const stats = {
        electricity: filtered.filter(r => r.type === 'electricity').reduce((sum, r) => sum + (r.total || 0), 0),
        gas: filtered.filter(r => r.type === 'gas').reduce((sum, r) => sum + (r.total || 0), 0),
        salt: filtered.filter(r => r.type === 'salt').length,
        cartridge: filtered.filter(r => r.type === 'cartridge').length,
        total: filtered.filter(r => ['electricity', 'gas'].includes(r.type)).reduce((sum, r) => sum + (r.total || 0), 0)
    };
    
    const statsGrid = document.getElementById('analytics-stats');
    if (statsGrid) {
        statsGrid.innerHTML = `
            <div class="stat-card">
                <h3>Электроэнергия</h3>
                <div class="stat-value">${stats.electricity.toFixed(2)} ₽</div>
            </div>
            <div class="stat-card">
                <h3>Газ</h3>
                <div class="stat-value">${stats.gas.toFixed(2)} ₽</div>
            </div>
            <div class="stat-card">
                <h3>Засыпки соли</h3>
                <div class="stat-value">${stats.salt} раз</div>
            </div>
            <div class="stat-card">                <h3>Замены картриджа</h3>
                <div class="stat-value">${stats.cartridge} раз</div>
            </div>
            <div class="stat-card total">
                <h3>Итого расходов</h3>
                <div class="stat-value">${stats.total.toFixed(2)} ₽</div>
            </div>
        `;
    }
}

// ===== УТИЛИТЫ =====
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ===== ЭКСПОРТ/ИМПОРТ =====
function exportData() {
    const data = {
        records: records,
        tariffs: tariffs,
        exportDate: new Date().toISOString(),
        version: '2.0'
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dom-uchet-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!confirm(`Импортировать ${data.records?.length || 0} записей и ${data.tariffs?.length || 0} тарифов?\nТекущие данные будут заменены.`)) {
                return;
            }
            
            if (data.records) records = data.records;            if (data.tariffs) tariffs = data.tariffs;
            
            saveLocal();
            
            if (isFirebaseConnected) {
                const batch = writeBatch(db);
                records.forEach(r => {
                    batch.set(doc(db, 'records', r.id), r);
                });
                tariffs.forEach(t => {
                    batch.set(doc(db, 'tariffs', t.id), t);
                });
                await batch.commit();
            }
            
            populatePeriodSelectors();
            updateTariffList();
            updateHistory();
            updateAnalytics();
            
            alert('✓ Данные импортированы!');
        } catch (err) {
            alert('❌ Ошибка импорта: ' + err.message);
        }
    };
    reader.readAsText(file);
}

async function resetAllData() {
    if (!confirm('⚠ ВНИМАНИЕ! Все локальные данные будут удалены.\nДанные в Firebase останутся.\n\nПродолжить?')) return;
    if (!confirm('Вы уверены? Это действие нельзя отменить.')) return;
    
    records = [];
    tariffs = [];
    localStorage.removeItem('dom_records');
    localStorage.removeItem('dom_tariffs');
    
    populatePeriodSelectors();
    updateTariffList();
    updateHistory();
    updateAnalytics();
    
    alert('✓ Все локальные данные удалены.');
}

async function recalculateAll() {
    if (!confirm('Пересчитать все записи по актуальным тарифам?')) return;
    
    records.forEach(r => {
        if (r.type === 'electricity') {            const tariff = getTariffForDate(r.date);
            r.total = (r.consumptionT1 * tariff.t1) + (r.consumptionT2 * (tariff.t2 || 0));
            r.tariff = { t1: tariff.t1, t2: tariff.t2 || 0 };
        } else if (r.type === 'gas') {
            const tariff = getTariffForDate(r.date);
            r.total = r.consumption * (tariff.gas || 0);
            r.tariff = { gas: tariff.gas || 0 };
        }
    });
    
    saveLocal();
    
    if (isFirebaseConnected) {
        const batch = writeBatch(db);
        records.filter(r => ['electricity', 'gas'].includes(r.type)).forEach(r => {
            batch.set(doc(db, 'records', r.id), r);
        });
        await batch.commit();
    }
    
    updateHistory();
    updateAnalytics();
    alert('✓ Все записи пересчитаны!');
}

// ===== ПЕРЕКЛЮЧЕНИЕ ТИПА ВВОДА =====
function showInputType(type, btn) {
    currentInputType = type;
    
    // Скрываем все формы
    document.querySelectorAll('.input-form').forEach(form => {
        form.classList.remove('active');
    });
    
    // Убираем активность с кнопок
    document.querySelectorAll('.type-btn').forEach(b => {
        b.classList.remove('active');
    });
    
    // Показываем нужную форму
    document.getElementById(`input-${type}`).classList.add('active');
    
    // Активируем кнопку
    if (btn) btn.classList.add('active');
    
    // Инициализируем даты
    initDates();
}

// Обновленная функция сохранения
async function saveRecord(type) {
    let savedCount = 0;
    
    if (type === 'electricity') {
        const elecDate = document.getElementById('elec-date').value;
        const elecT1 = parseFloat(document.getElementById('elec-t1').value);
        const elecT2 = parseFloat(document.getElementById('elec-t2').value);
        
        if (!elecDate || !elecT1 || !elecT2) {
            alert('⚠ Заполните все обязательные поля!');
            return;
        }
        
        const lastRecord = getLastElectricRecord();
        const tariff = getTariffForDate(elecDate);
        
        const consumptionT1 = lastRecord ? Math.max(0, elecT1 - lastRecord.t1) : 0;
        const consumptionT2 = lastRecord ? Math.max(0, elecT2 - lastRecord.t2) : 0;
        const total = (consumptionT1 * tariff.t1) + (consumptionT2 * (tariff.t2 || 0));
        
        const record = {
            id: 'elec_' + Date.now(),
            type: 'electricity',
            date: elecDate,
            t1: elecT1,            t2: elecT2,
            consumptionT1: consumptionT1,
            consumptionT2: consumptionT2,
            total: total,
            tariff: { t1: tariff.t1, t2: tariff.t2 || 0 },
            createdAt: new Date().toISOString()
        };
        
        records.push(record);
        await syncRecordToFirebase(record);
        savedCount++;
        
    } else if (type === 'gas') {
        const gasDate = document.getElementById('gas-date').value;
        const gasReading = parseFloat(document.getElementById('gas-reading').value);
        
        if (!gasDate || !gasReading) {
            alert('⚠ Заполните все обязательные поля!');
            return;
        }
        
        const lastRecord = getLastGasRecord();
        const tariff = getTariffForDate(gasDate);
        
        const consumption = lastRecord ? Math.max(0, gasReading - lastRecord.reading) : 0;
        const total = consumption * (tariff.gas || 0);
        
        const record = {
            id: 'gas_' + Date.now(),
            type: 'gas',
            date: gasDate,
            reading: gasReading,
            consumption: consumption,
            total: total,
            tariff: { gas: tariff.gas || 0 },
            createdAt: new Date().toISOString()
        };
        
        records.push(record);
        await syncRecordToFirebase(record);
        savedCount++;
        
    } else if (type === 'salt') {
        const saltDate = document.getElementById('salt-date').value;
        const saltKg = parseFloat(document.getElementById('salt-kg').value);
        
        if (!saltDate || !saltKg) {
            alert('⚠ Заполните все обязательные поля!');
            return;
        }        
        const record = {
            id: 'salt_' + Date.now(),
            type: 'salt',
            date: saltDate,
            kg: saltKg,
            createdAt: new Date().toISOString()
        };
        
        records.push(record);
        await syncRecordToFirebase(record);
        savedCount++;
        
    } else if (type === 'cartridge') {
        const cartridgeDate = document.getElementById('cartridge-date').value;
        
        if (!cartridgeDate) {
            alert('⚠ Заполните все обязательные поля!');
            return;
        }
        
        const record = {
            id: 'cart_' + Date.now(),
            type: 'cartridge',
            date: cartridgeDate,
            createdAt: new Date().toISOString()
        };
        
        records.push(record);
        await syncRecordToFirebase(record);
        savedCount++;
    }
    
    saveLocal();
    clearForm(type);
    populatePeriodSelectors();
    updateHistory();
    updateAnalytics();
    
    alert(`✓ ${getTypeName(type)} сохранен(а)!`);
}

function getTypeName(type) {
    const names = {
        'electricity': 'Электроэнергия',
        'gas': 'Газ',
        'salt': 'Засыпка соли',
        'cartridge': 'Замена картриджа'
    };
    return names[type] || type;}

// Обновленная функция очистки
function clearForm(type) {
    if (type === 'electricity' || !type || type === 'all') {
        document.getElementById('elec-t1').value = '';
        document.getElementById('elec-t2').value = '';
        document.getElementById('elec-t1-consumption').textContent = '0 кВт·ч';
        document.getElementById('elec-t2-consumption').textContent = '0 кВт·ч';
        document.getElementById('elec-total').textContent = '0 ₽';
    }
    
    if (type === 'gas' || !type || type === 'all') {
        document.getElementById('gas-reading').value = '';
        document.getElementById('gas-consumption').textContent = '0 м³';
        document.getElementById('gas-total').textContent = '0 ₽';
    }
    
    if (type === 'salt' || !type || type === 'all') {
        document.getElementById('salt-kg').value = '25';
    }
    
    if (type === 'cartridge' || !type || type === 'all') {
        // Дата картриджа не очищается
    }
    
    initDates();
}

// ===== ЭКСПОРТ ФУНКЦИЙ В ГЛОБАЛЬНУЮ ОБЛАСТЬ =====
window.switchTab = switchTab;
window.autoCalcElectric = autoCalcElectric;
window.autoCalcGas = autoCalcGas;
window.saveRecord = saveRecord;
window.clearForm = clearForm;
window.filterHistory = filterHistory;
window.deleteRecord = deleteRecord;
window.editRecord = editRecord;
window.deleteTariff = deleteTariff;
window.updateAnalytics = updateAnalytics;
window.exportData = exportData;
window.importData = importData;
window.resetAllData = resetAllData;
window.recalculateAll = recalculateAll;
window.showInputType = showInputType;