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
let tariffs = { electricity: [], gas: [] };
let payments = [];
let currentFilter = 'all';
let currentPaymentFilter = 'all';
let currentInputType = 'electricity';
let currentTariffType = 'electricity';
let isFirebaseConnected = false;

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', async () => {
    await initFirebase();
    loadData();
    initDates();
    populatePeriodSelectors();
    
    // Сначала обновляем все списки
    updateTariffList();
    updateHistory();
    updateAnalytics();
    updatePaymentsList();
    
    // Затем с небольшой задержкой обновляем балансы
    setTimeout(() => {
        updatePaymentSummary();
        updateBalanceDisplay();
    }, 1000);
    
    setupTariffForm();
});

// ===== FIREBASE =====
async function initFirebase() {
    try {
        await getDocs(collection(db, 'tariffs_electricity'));
        isFirebaseConnected = true;        updateSyncStatus('connected');
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
        const elecQuery = query(collection(db, 'tariffs_electricity'), orderBy('date', 'asc'));
        const elecSnap = await getDocs(elecQuery);
        const newElecTariffs = [];
        elecSnap.forEach(docSnap => newElecTariffs.push({ id: docSnap.id, ...docSnap.data() }));

        const gasQuery = query(collection(db, 'tariffs_gas'), orderBy('date', 'asc'));
        const gasSnap = await getDocs(gasQuery);
        const newGasTariffs = [];
        gasSnap.forEach(docSnap => newGasTariffs.push({ id: docSnap.id, ...docSnap.data() }));

        const recordsQuery = query(collection(db, 'records'));
        const recordsSnap = await getDocs(recordsQuery);
        const newRecords = [];
        recordsSnap.forEach(docSnap => newRecords.push({ id: docSnap.id, ...docSnap.data() }));

        const paymentsQuery = query(collection(db, 'payments'));
        const paymentsSnap = await getDocs(paymentsQuery);
        const newPayments = [];
        paymentsSnap.forEach(docSnap => newPayments.push({ id: docSnap.id, ...docSnap.data() }));

        if (newElecTariffs.length > 0 || newGasTariffs.length > 0) {
            tariffs = { electricity: newElecTariffs, gas: newGasTariffs };
        }
        if (newRecords.length > 0) records = newRecords;
        if (newPayments.length > 0) payments = newPayments;
        saveLocal();
        updateTariffList();
        updateHistory();
        updateAnalytics();
        updatePaymentsList();
        updatePaymentSummary();
        updateBalanceDisplay();

        console.log('✅ Синхронизация из Firebase:', records.length, 'записей,', payments.length, 'оплат');
    } catch (error) {
        console.error('Sync from Firebase error:', error);
    }
}

async function syncRecordToFirebase(record) {
    if (!isFirebaseConnected) return;
    try {
        await setDoc(doc(db, 'records', record.id), record);
    } catch (error) {
        console.error('Sync record error:', error);
    }
}

async function deleteRecordFromFirebase(id) {
    if (!isFirebaseConnected) return;
    try {
        await deleteDoc(doc(db, 'records', id));
    } catch (error) {
        console.error('Delete record error:', error);
    }
}

async function syncTariffToFirebase(tariff, type) {
    if (!isFirebaseConnected) return;
    try {
        const collectionName = type === 'electricity' ? 'tariffs_electricity' : 'tariffs_gas';
        await setDoc(doc(db, collectionName, tariff.id), tariff);
    } catch (error) {
        console.error('Sync tariff error:', error);
    }
}

async function deleteTariffFromFirebase(id, type) {
    if (!isFirebaseConnected) return;
    try {
        const collectionName = type === 'electricity' ? 'tariffs_electricity' : 'tariffs_gas';
        await deleteDoc(doc(db, collectionName, id));
    } catch (error) {
        console.error('Delete tariff error:', error);    }
}

async function syncPaymentToFirebase(payment) {
    if (!isFirebaseConnected) return;
    try {
        await setDoc(doc(db, 'payments', payment.id), payment);
    } catch (error) {
        console.error('Sync payment error:', error);
    }
}

async function deletePaymentFromFirebase(id) {
    if (!isFirebaseConnected) return;
    try {
        await deleteDoc(doc(db, 'payments', id));
    } catch (error) {
        console.error('Delete payment error:', error);
    }
}

// ===== ЛОКАЛЬНОЕ ХРАНЕНИЕ =====
function loadData() {
    console.log('📥 Загрузка данных...');
    const savedRecords = localStorage.getItem('dom_records');
    const savedTariffs = localStorage.getItem('dom_tariffs');
    const savedPayments = localStorage.getItem('dom_payments');

    if (savedRecords) records = JSON.parse(savedRecords);
    if (savedTariffs) {
        const parsed = JSON.parse(savedTariffs);
        if (parsed.electricity || parsed.gas) tariffs = parsed;
    }
    if (savedPayments) payments = JSON.parse(savedPayments);

    // Тарифы на электричество из PDF
    // Тарифы на электричество с повышенными ставками
if (!tariffs.electricity || tariffs.electricity.length === 0) {
    tariffs.electricity = [
        { 
            id: 'e1', 
            date: '2023-09-25', 
            t1: 3.71, 
            t2: 0,
            overT1: 3.71,  // пока без повышения
            overT2: 0
        },
        { 
            id: 'e2', 
            date: '2023-10-25', 
            t1: 3.71, 
            t2: 0,
            overT1: 3.71,
            overT2: 0
        },
        { 
            id: 'e3', 
            date: '2024-01-25', 
            t1: 3.71, 
            t2: 0,
            overT1: 3.71,
            overT2: 0
        },
        { 
            id: 'e4', 
            date: '2024-06-18', 
            t1: 3.71, 
            t2: 0,
            overT1: 3.71,
            overT2: 0
        },
        { 
            id: 'e5', 
            date: '2024-06-24', 
            t1: 3.89, 
            t2: 2.39,
            overT1: 3.89,
            overT2: 2.39
        },
        { 
            id: 'e6', 
            date: '2024-07-24', 
            t1: 4.48, 
            t2: 2.75,
            overT1: 4.49,  // повышенный тариф
            overT2: 2.76   // повышенный тариф
        },
        { 
            id: 'e7', 
            date: '2025-07-24', 
            t1: 5.15, 
            t2: 3.10,
            overT1: 5.16,  // повышенный тариф
            overT2: 3.11   // повышенный тариф
        }
    ];
}

    // Тарифы на газ из PDF
    if (!tariffs.gas || tariffs.gas.length === 0) {        tariffs.gas = [
            { id: 'g1', date: '2025-02-20', value: 6.46 },
            { id: 'g2', date: '2025-07-22', value: 7.23 },
            { id: 'g3', date: '2026-01-15', value: 7.35 }
        ];
    }

    // Записи по электричеству из PDF (ключевые)
    if (records.length === 0) {
        records = [
            { id: 'elec_1', type: 'electricity', date: '2023-10-25', t1: 20793, t2: 0, consumptionT1: 3084, consumptionT2: 0, total: 11441.64, tariff: { t1: 3.71, t2: 0 } },
            { id: 'elec_2', type: 'electricity', date: '2023-11-25', t1: 23917.9, t2: 0, consumptionT1: 3124.9, consumptionT2: 0, total: 11593.38, tariff: { t1: 3.71, t2: 0 } },
            { id: 'elec_3', type: 'electricity', date: '2023-12-25', t1: 29405.1, t2: 0, consumptionT1: 5487.2, consumptionT2: 0, total: 20357.51, tariff: { t1: 3.71, t2: 0 } },
            { id: 'elec_4', type: 'electricity', date: '2024-01-25', t1: 35742, t2: 0, consumptionT1: 6336.9, consumptionT2: 0, total: 23509.9, tariff: { t1: 3.71, t2: 0 } },
            { id: 'elec_5', type: 'electricity', date: '2024-06-24', t1: 4961, t2: 2113, consumptionT1: 93, consumptionT2: 15, total: 648.33, tariff: { t1: 3.89, t2: 2.39 } },
            { id: 'elec_6', type: 'electricity', date: '2024-07-24', t1: 5368, t2: 2185, consumptionT1: 333.33, consumptionT2: 58, total: 1652.83, tariff: { t1: 4.48, t2: 2.75 } },
            { id: 'elec_7', type: 'electricity', date: '2024-08-24', t1: 5920, t2: 2290, consumptionT1: 552, consumptionT2: 105, total: 2763.21, tariff: { t1: 4.48, t2: 2.75 } },
            { id: 'elec_8', type: 'electricity', date: '2024-09-24', t1: 6682, t2: 2487, consumptionT1: 762, consumptionT2: 197, total: 3955.51, tariff: { t1: 4.48, t2: 2.75 } },
            { id: 'elec_9', type: 'electricity', date: '2024-10-24', t1: 8526, t2: 3296, consumptionT1: 1844, consumptionT2: 809, total: 10485.87, tariff: { t1: 4.48, t2: 2.75 } },
            { id: 'elec_10', type: 'electricity', date: '2024-11-24', t1: 11327, t2: 4545, consumptionT1: 2801, consumptionT2: 1249, total: 15983.23, tariff: { t1: 4.48, t2: 2.75 } },
            { id: 'elec_11', type: 'electricity', date: '2024-12-24', t1: 14673, t2: 6173, consumptionT1: 3346, consumptionT2: 1628, total: 19467.08, tariff: { t1: 4.48, t2: 2.75 } },
            { id: 'elec_12', type: 'electricity', date: '2025-01-24', t1: 18409, t2: 7952, consumptionT1: 3736, consumptionT2: 1779, total: 21629.53, tariff: { t1: 4.48, t2: 2.75 } },
            { id: 'elec_13', type: 'electricity', date: '2025-02-23', t1: 21590, t2: 9483, consumptionT1: 3181, consumptionT2: 1531, total: 18461.13, tariff: { t1: 4.48, t2: 2.75 } },
            { id: 'elec_14', type: 'electricity', date: '2025-07-24', t1: 24700, t2: 10270, consumptionT1: 640, consumptionT2: 155, total: 3776.5, tariff: { t1: 5.15, t2: 3.10 } },
            // Газ из PDF
            { id: 'gas_1', type: 'gas', date: '2025-03-15', reading: 466, consumption: 466, total: 3010.36, tariff: { value: 6.46 } },
            { id: 'gas_2', type: 'gas', date: '2025-04-15', reading: 920, consumption: 454, total: 2932.84, tariff: { value: 6.46 } },
            { id: 'gas_3', type: 'gas', date: '2025-05-16', reading: 1302, consumption: 382, total: 2467.72, tariff: { value: 6.46 } },
            { id: 'gas_4', type: 'gas', date: '2025-07-22', reading: 1390, consumption: 30, total: 216.9, tariff: { value: 7.23 } },
            { id: 'gas_5', type: 'gas', date: '2025-10-15', reading: 2000, consumption: 400, total: 2892, tariff: { value: 7.23 } },
            { id: 'gas_6', type: 'gas', date: '2026-01-15', reading: 3900, consumption: 840, total: 6174, tariff: { value: 7.35 } }
        ];
    }

    // Оплаты из PDF
    if (payments.length === 0) {
        payments = [
            // Оплаты электричества
            { id: 'pay_elec_1', type: 'electricity', date: '2023-12-03', amount: 12000 },
            { id: 'pay_elec_2', type: 'electricity', date: '2023-12-11', amount: 11335.90 },
            { id: 'pay_elec_3', type: 'electricity', date: '2023-12-17', amount: 20405 },
            { id: 'pay_elec_4', type: 'electricity', date: '2023-12-18', amount: 25000 },
            { id: 'pay_elec_5', type: 'electricity', date: '2023-12-20', amount: 18500 },
            { id: 'pay_elec_6', type: 'electricity', date: '2023-12-23', amount: 16000 },
            { id: 'pay_elec_7', type: 'electricity', date: '2023-12-24', amount: 11000 },
            { id: 'pay_elec_8', type: 'electricity', date: '2023-12-25', amount: 9000 },
            { id: 'pay_elec_9', type: 'electricity', date: '2024-06-18', amount: 22000 },
            { id: 'pay_elec_10', type: 'electricity', date: '2024-07-24', amount: 3000 },
            { id: 'pay_elec_11', type: 'electricity', date: '2024-08-16', amount: 3000 },
            { id: 'pay_elec_12', type: 'electricity', date: '2024-09-24', amount: 4000 },            { id: 'pay_elec_13', type: 'electricity', date: '2024-10-25', amount: 10000 },
            { id: 'pay_elec_14', type: 'electricity', date: '2024-11-24', amount: 18000 },
            { id: 'pay_elec_15', type: 'electricity', date: '2024-12-24', amount: 18000 },
            { id: 'pay_elec_16', type: 'electricity', date: '2025-01-24', amount: 22000 },
            { id: 'pay_elec_17', type: 'electricity', date: '2025-02-23', amount: 16903.77 },
            { id: 'pay_elec_18', type: 'electricity', date: '2025-07-24', amount: 3776.50 },
            // Оплаты газа
            { id: 'pay_gas_1', type: 'gas', date: '2025-03-15', amount: 3010.36 },
            { id: 'pay_gas_2', type: 'gas', date: '2025-04-15', amount: 2932.84 },
            { id: 'pay_gas_3', type: 'gas', date: '2025-05-16', amount: 2467.72 },
            { id: 'pay_gas_4', type: 'gas', date: '2025-07-22', amount: 216.90 },
            { id: 'pay_gas_5', type: 'gas', date: '2025-10-15', amount: 2892 },
            { id: 'pay_gas_6', type: 'gas', date: '2026-01-15', amount: 6174 }
        ];
    }

    saveLocal();
    console.log('✅ Загружено:', records.length, 'записей,', payments.length, 'оплат');
}

function saveLocal() {
    localStorage.setItem('dom_records', JSON.stringify(records));
    localStorage.setItem('dom_tariffs', JSON.stringify(tariffs));
    localStorage.setItem('dom_payments', JSON.stringify(payments));
}

function initDates() {
    const today = new Date().toISOString().split('T')[0];
    const dateFields = [
        'elec-date', 'gas-date', 'salt-date', 'cartridge-date',
        'pay-elec-date', 'pay-gas-date',
        'tariff-elec-date', 'tariff-gas-date'
    ];
    dateFields.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = today;
    });
}

function populatePeriodSelectors() {
    const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const monthSelect = document.getElementById('analytics-month');
    const yearSelect = document.getElementById('analytics-year');

    if (monthSelect && monthSelect.options.length <= 1) {
        months.forEach((m, i) => {
            const option = document.createElement('option');
            option.value = (i + 1).toString();
            option.textContent = m;
            monthSelect.appendChild(option);        });
    }

    if (yearSelect) {
        yearSelect.innerHTML = '<option value="">Все годы</option>';
        const years = new Set();
        records.forEach(r => { if (r.date) years.add(new Date(r.date).getFullYear()); });
        payments.forEach(p => { if (p.date) years.add(new Date(p.date).getFullYear()); });
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
    if (tabName === 'payments') {
        setTimeout(() => {
            updatePaymentsList();
            updatePaymentSummary();
        }, 100);
    }
}

// ===== ПЕРЕКЛЮЧЕНИЕ ТИПА ВВОДА =====
function showInputType(type, btn) {
    currentInputType = type;
    document.querySelectorAll('.input-form').forEach(form => form.classList.remove('active'));
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`input-${type}`).classList.add('active');
    if (btn) btn.classList.add('active');
    initDates();
    if (type === 'electricity') autoCalcElectric();
    if (type === 'gas') autoCalcGas();
}

// ===== ПЕРЕКЛЮЧЕНИЕ ТИПА ТАРИФА =====
function showTariffType(type, btn) {
    currentTariffType = type;
    document.querySelectorAll('.tariff-form-section').forEach(section => section.classList.remove('active'));    document.querySelectorAll('.tariff-type-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tariff-${type}`).classList.add('active');
    if (btn) btn.classList.add('active');
    initDates();
}

// ===== АВТОРАСЧЕТ ЭЛЕКТРИЧЕСТВА =====
function autoCalcElectric() {
    const t1 = parseFloat(document.getElementById('elec-t1').value) || 0;
    const t2 = parseFloat(document.getElementById('elec-t2').value) || 0;
    const date = document.getElementById('elec-date').value;
    
    const lastRecord = getLastElectricRecord(date, null);
    const tariff = getTariffForDate('electricity', date);

    console.log('📅 Дата:', date);
    console.log('📊 Предыдущая запись:', lastRecord);
    console.log('💰 Тариф:', tariff);

    if (lastRecord && tariff) {
        const consumptionT1 = Math.max(0, t1 - lastRecord.t1);
        const consumptionT2 = Math.max(0, t2 - lastRecord.t2);
        
        // Проверяем, существует ли функция calcElectricityCost
        if (typeof calcElectricityCost === 'function') {
            const calc = calcElectricityCost(consumptionT1, consumptionT2, tariff);
            
            const el1 = document.getElementById('elec-t1-consumption');
            const el2 = document.getElementById('elec-t2-consumption');
            const el3 = document.getElementById('elec-total');
            
            if (el1) el1.textContent = `${consumptionT1.toFixed(2)} кВт·ч`;
            if (el2) el2.textContent = `${consumptionT2.toFixed(2)} кВт·ч`;
            if (el3) el3.textContent = `${calc.total.toFixed(2)} ₽`;
            
            console.log('✅ Расчет:', calc);
        } else {
            // Если функции нет, используем простой расчет
            const total = (consumptionT1 * tariff.t1) + (consumptionT2 * tariff.t2);
            
            const el1 = document.getElementById('elec-t1-consumption');
            const el2 = document.getElementById('elec-t2-consumption');
            const el3 = document.getElementById('elec-total');
            
            if (el1) el1.textContent = `${consumptionT1.toFixed(2)} кВт·ч`;
            if (el2) el2.textContent = `${consumptionT2.toFixed(2)} кВт·ч`;
            if (el3) el3.textContent = `${total.toFixed(2)} ₽`;
        }
    } else {
        alert('⚠ Не найден тариф на выбранную дату или предыдущая запись!');
    }
}

function getLastElectricRecord(currentDate = null, currentId = null) {
    let filteredRecords = records.filter(r => r.type === 'electricity');
    
    // Если указана текущая дата (при создании/редактировании), исключаем:
    // 1. Записи с датой >= текущей
    // 2. Текущую редактируемую запись
    if (currentDate) {
        filteredRecords = filteredRecords.filter(r => {
            const isBeforeDate = r.date < currentDate;
            const isCurrentRecord = currentId && r.id === currentId;
            return isBeforeDate && !isCurrentRecord;
        });
    }
    
    // Сортируем по дате (новые сверху)
    return filteredRecords.sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
}

// ===== АВТОРАСЧЕТ ГАЗА =====
function autoCalcGas() {
    const reading = parseFloat(document.getElementById('gas-reading').value) || 0;
    const lastRecord = getLastGasRecord();
    const tariff = getCurrentTariff('gas');

    if (lastRecord && tariff) {
        const consumption = Math.max(0, reading - lastRecord.reading);
        const el1 = document.getElementById('gas-consumption');
        const el2 = document.getElementById('gas-total');
        if (el1) el1.textContent = `${consumption.toFixed(2)} м³`;
        if (el2) el2.textContent = `${(consumption * tariff.value).toFixed(2)} ₽`;
    }
}

function getLastGasRecord() {
    return records.filter(r => r.type === 'gas').sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
}

// ===== ФУНКЦИЯ РАСЧЕТА СТОИМОСТИ ЭЛЕКТРОЭНЕРГИИ С УЧЕТОМ ПОРОГА 3000 кВт·ч =====
function calcElectricityCost(consumptionT1, consumptionT2, tariff) {
    const totalConsumption = consumptionT1 + consumptionT2;
    const threshold = 3000; // Порог 3000 кВт·ч

    // Используем ?? вместо || чтобы 0 не заменялся
    // Округляем до 2 знаков для избежания ошибок плавающей точки
    const overT1Rate = (tariff.overT1 !== undefined && tariff.overT1 !== null) 
        ? parseFloat(tariff.overT1) 
        : Math.round((parseFloat(tariff.t1) + 0.01) * 100) / 100;
    const overT2Rate = (tariff.overT2 !== undefined && tariff.overT2 !== null) 
        ? parseFloat(tariff.overT2) 
        : Math.round((parseFloat(tariff.t2 || 0) + 0.01) * 100) / 100;

    if (totalConsumption <= threshold) {
        // Весь расход в пределах 3000 кВт·ч
        return {
            total: (consumptionT1 * tariff.t1) + (consumptionT2 * tariff.t2),
            normT1Used: consumptionT1, overT1: 0,
            normT2Used: consumptionT2, overT2: 0,
            overThreshold: 0
        };
    } else {
        // Расход больше 3000 кВт·ч
        const overThreshold = totalConsumption - threshold;
        
        // Считаем пропорции (как в квитанции)
        const ratioT1 = consumptionT1 / totalConsumption;
        const ratioT2 = consumptionT2 / totalConsumption;

        // Распределяем превышение (округляем до 4 знаков, как делает энергосбыт)
        const overT1 = Math.round(overThreshold * ratioT1 * 10000) / 10000;
        const overT2 = Math.round(overThreshold * ratioT2 * 10000) / 10000;

        const normT1Used = consumptionT1 - overT1;
        const normT2Used = consumptionT2 - overT2;

        // Считаем стоимость
        const normCost = (normT1Used * tariff.t1) + (normT2Used * tariff.t2);
        const overCost = (overT1 * overT1Rate) + (overT2 * overT2Rate);

        return {
            total: normCost + overCost,
            normT1Used: normT1Used, overT1: overT1,
            normT2Used: normT2Used, overT2: overT2,
            overThreshold: overThreshold
        };
    }
}

// ===== ТАРИФЫ =====
function getCurrentTariff(type) {
    const today = new Date().toISOString().split('T')[0];
    return getTariffForDate(type, today);
}

function getTariffForDate(type, date) {
    const tariffList = tariffs[type] || [];
    
    // Фильтруем тарифы, которые действовали на указанную дату
    const validTariffs = tariffList.filter(t => {
        // Сравниваем даты корректно
        return t.date <= date;
    });
    
    // Сортируем по дате (новые сверху) и берем первый
    const sorted = validTariffs.sort((a, b) => {
        // Преобразуем в Date для корректного сравнения
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB - dateA;
    });
    
    // Возвращаем последний действующий тариф или первый из списка
    const result = sorted[0] || tariffList[0];
    
    console.log(`getTariffForDate(${type}, ${date}):`, result);
    
    return result || {};
}

function setupTariffForm() {
    const elecForm = document.getElementById('tariff-form-electricity');
    if (elecForm) {
        elecForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const t1Value = parseFloat(document.getElementById('tariff-t1').value);
            const t2Value = parseFloat(document.getElementById('tariff-t2').value) || 0;
            const overT1Raw = document.getElementById('tariff-over-t1').value;
            const overT2Raw = document.getElementById('tariff-over-t2').value;
            
            // Используем isNaN вместо || чтобы 0 не заменялся
            const overT1Value = parseFloat(overT1Raw);
            const overT2Value = parseFloat(overT2Raw);
            
            const tariff = {
                id: 'elec_' + Date.now(),
                date: document.getElementById('tariff-elec-date').value,
                t1: t1Value,
                t2: t2Value,
                // Если поле пустое - берем обычное + 0.01 с округлением
                overT1: !isNaN(overT1Value) 
                    ? Math.round(overT1Value * 100) / 100 
                    : Math.round((t1Value + 0.01) * 100) / 100,
                overT2: !isNaN(overT2Value) 
                    ? Math.round(overT2Value * 100) / 100 
                    : Math.round((t2Value + 0.01) * 100) / 100,
                createdAt: new Date().toISOString()
            };
            
            tariffs.electricity.push(tariff);
            tariffs.electricity.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            saveLocal();
            await syncTariffToFirebase(tariff, 'electricity');
            updateTariffList();
            
            elecForm.reset();
            document.getElementById('tariff-elec-date').value = new Date().toISOString().split('T')[0];
            
            alert('✓ Тариф на электричество добавлен!');
        });
    }

    const gasForm = document.getElementById('tariff-form-gas');
    if (gasForm) {
        gasForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const tariff = {
                id: 'gas_' + Date.now(),
                date: document.getElementById('tariff-gas-date').value,
                value: parseFloat(document.getElementById('tariff-gas-value').value),
                createdAt: new Date().toISOString()
            };
            
            tariffs.gas.push(tariff);
            tariffs.gas.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            saveLocal();
            await syncTariffToFirebase(tariff, 'gas');
            updateTariffList();
            
            gasForm.reset();
            document.getElementById('tariff-gas-date').value = new Date().toISOString().split('T')[0];
            
            alert('✓ Тариф на газ добавлен!');
        });
    }
}

// Автозаполнение повышенных тарифов (+0.01) с округлением
// Автозаполнение повышенных тарифов (+0.01) с округлением
function autoFillOverTariffs() {
    const t1 = parseFloat(document.getElementById('tariff-t1').value) || 0;
    const t2 = parseFloat(document.getElementById('tariff-t2').value) || 0;
    
    if (t1 > 0) {
        // Округляем до 2 знаков
        const overT1 = Math.round((t1 + 0.01) * 100) / 100;
        document.getElementById('tariff-over-t1').value = overT1.toFixed(2);
    }
    if (t2 > 0) {
        // Округляем до 2 знаков
        const overT2 = Math.round((t2 + 0.01) * 100) / 100;
        document.getElementById('tariff-over-t2').value = overT2.toFixed(2);
    }
}

// Экспорт функции
window.autoFillOverTariffs = autoFillOverTariffs;

// Экспорт функции
window.autoFillOverTariffs = autoFillOverTariffs;

// Экспорт функции
window.autoFillOverTariffs = autoFillOverTariffs;

function updateTariffList() {
    // Обновляем список тарифов на электричество
    const elecList = document.getElementById('tariffs-list-electricity');
    if (elecList) {
        const currentElecTariff = getCurrentTariff('electricity');
        const sortedElec = [...(tariffs.electricity || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (sortedElec.length === 0) {
            elecList.innerHTML = '<p class="hint-text">Нет сохраненных тарифов</p>';
        } else {
            elecList.innerHTML = sortedElec.map(t => {
                const isCurrent = currentElecTariff && t.id === currentElecTariff.id;
                
                // Используем ?? вместо || чтобы 0 отображался корректно
                // Округляем до 2 знаков
                const displayOverT1 = (t.overT1 !== undefined && t.overT1 !== null) 
                    ? t.overT1 
                    : Math.round((parseFloat(t.t1) + 0.01) * 100) / 100;
                const displayOverT2 = (t.overT2 !== undefined && t.overT2 !== null) 
                    ? t.overT2 
                    : Math.round((parseFloat(t.t2 || 0) + 0.01) * 100) / 100;
                
                return `
                    <div class="tariff-item ${isCurrent ? 'current' : ''}">
                        <div class="tariff-date">
                            <ion-icon name="calendar-outline"></ion-icon>
                            ${formatDate(t.date)}
                            ${isCurrent ? '<span style="color: var(--ios-success); font-weight: bold; margin-left: 8px;">(действует)</span>' : ''}
                        </div>
                        <div class="tariff-values">
                            <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid var(--ios-border);">
                                <div style="font-weight: 600; color: var(--ios-text-secondary); font-size: 13px; margin-bottom: 4px;">
                                    Обычные тарифы:
                                </div>
                                <div>
                                    <ion-icon name="sunny-outline" style="color: var(--ios-warning);"></ion-icon>
                                    Т1: ${parseFloat(t.t1).toFixed(2)} ₽/кВт·ч
                                </div>
                                <div>
                                    <ion-icon name="moon-outline" style="color: var(--ios-accent);"></ion-icon>
                                    Т2: ${parseFloat(t.t2 || 0).toFixed(2)} ₽/кВт·ч
                                </div>
                            </div>
                            <div>
                                <div style="font-weight: 600; color: var(--ios-danger); font-size: 13px; margin-bottom: 4px;">
                                    <ion-icon name="trending-up-outline"></ion-icon>
                                    Повышенные (сверх 3000 кВт·ч):
                                </div>
                                <div style="color: var(--ios-danger);">
                                    <ion-icon name="sunny-outline"></ion-icon>
                                    Т1: ${parseFloat(displayOverT1).toFixed(2)} ₽/кВт·ч
                                </div>
                                <div style="color: var(--ios-danger);">
                                    <ion-icon name="moon-outline"></ion-icon>
                                    Т2: ${parseFloat(displayOverT2).toFixed(2)} ₽/кВт·ч
                                </div>
                            </div>
                        </div>
                        <div class="tariff-actions">
                            <button class="btn btn-secondary" onclick="editTariff('electricity', '${t.id}')" style="margin-right: 8px;">
                                <ion-icon name="create-outline"></ion-icon>
                                Редактировать
                            </button>
                            <button class="btn btn-danger" onclick="deleteTariff('electricity', '${t.id}')">
                                <ion-icon name="trash-outline"></ion-icon>
                                Удалить
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
    
    // Обновляем список тарифов на газ
    const gasList = document.getElementById('tariffs-list-gas');
    if (gasList) {
        const currentGasTariff = getCurrentTariff('gas');
        const sortedGas = [...(tariffs.gas || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (sortedGas.length === 0) {
            gasList.innerHTML = '<p class="hint-text">Нет сохраненных тарифов</p>';
        } else {
            gasList.innerHTML = sortedGas.map(t => {
                const isCurrent = currentGasTariff && t.id === currentGasTariff.id;
                return `
                    <div class="tariff-item ${isCurrent ? 'current' : ''}">
                        <div class="tariff-date">
                            <ion-icon name="calendar-outline"></ion-icon>
                            ${formatDate(t.date)}
                            ${isCurrent ? '<span style="color: var(--ios-success); font-weight: bold; margin-left: 8px;">(действует)</span>' : ''}
                        </div>
                        <div class="tariff-values">
                            <div>
                                <ion-icon name="flame-outline" style="color: var(--ios-warning);"></ion-icon>
                                Газ: ${parseFloat(t.value).toFixed(2)} ₽/м³
                            </div>
                        </div>
                        <div class="tariff-actions">
                            <button class="btn btn-secondary" onclick="editTariff('gas', '${t.id}')" style="margin-right: 8px;">
                                <ion-icon name="create-outline"></ion-icon>
                                Редактировать
                            </button>
                            <button class="btn btn-danger" onclick="deleteTariff('gas', '${t.id}')">
                                <ion-icon name="trash-outline"></ion-icon>
                                Удалить
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

async function deleteTariff(type, id) {
    if (!confirm('Удалить этот тариф?')) return;
    tariffs[type] = tariffs[type].filter(t => t.id !== id);
    saveLocal();    await deleteTariffFromFirebase(id, type);
    updateTariffList();
}

// ===== РЕДАКТИРОВАНИЕ ТАРИФОВ =====
let editingTariffId = null;
let editingTariffType = null;

function editTariff(type, id) {
    const tariffList = tariffs[type];
    const tariff = tariffList.find(t => t.id === id);
    if (!tariff) return;
    
    editingTariffId = id;
    editingTariffType = type;
    
    const modal = document.getElementById('edit-tariff-modal');
    if (!modal) {
        alert('❌ Модальное окно не найдено!');
        return;
    }
    
    // Заголовок
    const title = document.getElementById('edit-tariff-title');
    if (title) {
        const titles = {
            'electricity': '⚡ Редактирование тарифа на электроэнергию',
            'gas': '🔥 Редактирование тарифа на газ'
        };
        title.innerHTML = `<ion-icon name="create-outline"></ion-icon> ${titles[type] || 'Редактирование тарифа'}`;
    }
    
    // Заполняем поля
    const dateInput = document.getElementById('edit-tariff-date');
    const t1Input = document.getElementById('edit-tariff-t1');
    const t2Input = document.getElementById('edit-tariff-t2');
    const overT1Input = document.getElementById('edit-tariff-over-t1');
    const overT2Input = document.getElementById('edit-tariff-over-t2');
    
    if (dateInput) dateInput.value = tariff.date;
    
    if (type === 'electricity') {
        if (t1Input) t1Input.value = tariff.t1;
        if (t2Input) t2Input.value = tariff.t2 || 0;
        if (overT1Input) overT1Input.value = tariff.overT1 || (tariff.t1 + 0.01);
        if (overT2Input) overT2Input.value = tariff.overT2 || ((tariff.t2 || 0) + 0.01);
        
        // Показываем поля для электричества
        if (t1Input) t1Input.closest('.form-group').style.display = 'block';
        if (t2Input) t2Input.closest('.form-group').style.display = 'block';
        if (overT1Input) overT1Input.closest('.form-group').style.display = 'block';
        if (overT2Input) overT2Input.closest('.form-group').style.display = 'block';
    } else if (type === 'gas') {
        // Для газа скрываем ненужные поля
        if (t1Input) t1Input.closest('.form-group').style.display = 'none';
        if (t2Input) t2Input.closest('.form-group').style.display = 'none';
        if (overT1Input) overT1Input.closest('.form-group').style.display = 'none';
        if (overT2Input) overT2Input.closest('.form-group').style.display = 'none';
    }
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeEditTariffModal() {
    const modal = document.getElementById('edit-tariff-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    document.body.style.overflow = '';
    editingTariffId = null;
    editingTariffType = null;
}

async function saveEditedTariff() {
    if (!editingTariffId || !editingTariffType) return;
    
    const tariffList = tariffs[editingTariffType];
    const tariffIndex = tariffList.findIndex(t => t.id === editingTariffId);
    if (tariffIndex === -1) {
        closeEditTariffModal();
        return;
    }
    
    const dateInput = document.getElementById('edit-tariff-date');
    const date = dateInput ? dateInput.value : '';
    
    if (!date) {
        alert('⚠ Заполните дату!');
        return;
    }
    
    if (editingTariffType === 'electricity') {
        const t1Input = document.getElementById('edit-tariff-t1');
        const t2Input = document.getElementById('edit-tariff-t2');
        const overT1Input = document.getElementById('edit-tariff-over-t1');
        const overT2Input = document.getElementById('edit-tariff-over-t2');
        
        const t1 = t1Input ? parseFloat(t1Input.value) : 0;
        const t2 = t2Input ? parseFloat(t2Input.value) || 0 : 0;
        const overT1 = overT1Input ? parseFloat(overT1Input.value) : NaN;
        const overT2 = overT2Input ? parseFloat(overT2Input.value) : NaN;
        
        if (isNaN(t1) || isNaN(t2)) {
            alert('⚠ Заполните все обязательные поля!');
            return;
        }
        
        // Округляем до 2 знаков
        tariffList[tariffIndex] = {
            ...tariffList[tariffIndex],
            date: date,
            t1: t1,
            t2: t2,
            overT1: !isNaN(overT1) ? Math.round((overT1) * 100) / 100 : Math.round((t1 + 0.01) * 100) / 100,
            overT2: !isNaN(overT2) ? Math.round((overT2) * 100) / 100 : Math.round((t2 + 0.01) * 100) / 100,
            updatedAt: new Date().toISOString()
        };
        
    } else if (editingTariffType === 'gas') {
        // Для газа можно добавить поле редактирования value
        const valueInput = document.getElementById('edit-tariff-t1'); // Используем t1 поле для значения газа
        const value = valueInput ? parseFloat(valueInput.value) : 0;
        
        if (isNaN(value)) {
            alert('⚠ Заполните тариф!');
            return;
        }
        
        tariffList[tariffIndex] = {
            ...tariffList[tariffIndex],
            date: date,
            value: value,
            updatedAt: new Date().toISOString()
        };
    }
    
    // Сортируем по дате
    tariffList.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    saveLocal();
    
    // Синхронизация с Firebase
    if (isFirebaseConnected) {
        const batch = writeBatch(db);
        const collectionName = editingTariffType === 'electricity' ? 'tariffs_electricity' : 'tariffs_gas';
        
        tariffList.forEach(t => {
            batch.set(doc(db, collectionName, t.id), t);
        });
        
        await batch.commit();
    }
    
    updateTariffList();
    closeEditTariffModal();
    alert('✓ Тариф обновлен!');
}

// Закрытие модального окна по клику на оверлей
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('edit-tariff-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeEditTariffModal();
            }
        });
    }
    
    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeEditTariffModal();
        }
    });
});

// ===== СОХРАНЕНИЕ ЗАПИСИ =====
async function saveRecord(type) {
    if (type === 'electricity') {
        const elecDate = document.getElementById('elec-date').value;
        const elecT1 = parseFloat(document.getElementById('elec-t1').value);
        const elecT2 = parseFloat(document.getElementById('elec-t2').value);
        
        // Проверяем ТОЛЬКО поля показаний, не оплаты!
        if (!elecDate || isNaN(elecT1) || isNaN(elecT2)) {
            alert('⚠ Заполните все обязательные поля (дата и показания)!');
            return;
        }
        
        const lastRecord = getLastElectricRecord(elecDate, null);
        const tariff = getTariffForDate('electricity', elecDate);
        const consumptionT1 = lastRecord ? Math.max(0, elecT1 - lastRecord.t1) : 0;
        const consumptionT2 = lastRecord ? Math.max(0, elecT2 - lastRecord.t2) : 0;
        
        // ИСПОЛЬЗУЕМ НОВУЮ ФУНКЦИЮ С ПОРОГОМ 3000 кВт·ч
        const calc = calcElectricityCost(consumptionT1, consumptionT2, tariff);
        
        const record = {
            id: 'elec_' + Date.now(),
            type: 'electricity',
            date: elecDate,
            t1: elecT1,
            t2: elecT2,
            consumptionT1: consumptionT1,
            consumptionT2: consumptionT2,
            total: calc.total,  // ✅ Используем calc.total
            normT1Used: calc.normT1Used,
            overT1: calc.overT1,
            normT2Used: calc.normT2Used,
            overT2: calc.overT2,
            tariff: { 
                t1: tariff.t1, 
                t2: tariff.t2 || 0,
                overT1: tariff.overT1,
                overT2: tariff.overT2
            },
            createdAt: new Date().toISOString()
        };
        
        records.push(record);
        await syncRecordToFirebase(record);
        
    } else if (type === 'gas') {
        const gasDate = document.getElementById('gas-date').value;
        const gasReading = parseFloat(document.getElementById('gas-reading').value);
        
        if (!gasDate || isNaN(gasReading)) {
            alert('⚠ Заполните все обязательные поля!');
            return;
        }
        
        const lastRecord = getLastGasRecord(gasDate, null);
        const tariff = getTariffForDate('gas', gasDate);
        const consumption = lastRecord ? Math.max(0, gasReading - lastRecord.reading) : 0;
        const total = consumption * (tariff.value || 0);
        
        const record = {
            id: 'gas_' + Date.now(),
            type: 'gas',
            date: gasDate,
            reading: gasReading,
            consumption: consumption,
            total: total,
            tariff: { value: tariff.value || 0 },
            createdAt: new Date().toISOString()
        };
        
        records.push(record);
        await syncRecordToFirebase(record);
        
    } else if (type === 'salt') {
        const saltDate = document.getElementById('salt-date').value;
        const saltKg = parseFloat(document.getElementById('salt-kg').value);
        
        if (!saltDate || isNaN(saltKg)) {
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
    }
    
    saveLocal();
    clearForm(type);
    populatePeriodSelectors();
    updateHistory();
    updateAnalytics();
    updatePaymentSummary();
    updateBalanceDisplay();
    
    alert(`✓ ${getTypeName(type)} сохранен(а)!`);
}

function getTypeName(type) {
    const names = { 'electricity': 'Электроэнергия', 'gas': 'Газ', 'salt': 'Засыпка соли', 'cartridge': 'Замена картриджа' };
    return names[type] || type;
}

function clearForm(type) {
    if (type === 'electricity') {
        const el1 = document.getElementById('elec-t1'); if (el1) el1.value = '';
        const el2 = document.getElementById('elec-t2'); if (el2) el2.value = '';
        const el3 = document.getElementById('elec-t1-consumption'); if (el3) el3.textContent = '0 кВт·ч';
        const el4 = document.getElementById('elec-t2-consumption'); if (el4) el4.textContent = '0 кВт·ч';
        const el5 = document.getElementById('elec-total'); if (el5) el5.textContent = '0 ₽';
        const el6 = document.getElementById('pay-elec-amount'); if (el6) el6.value = '';
    } else if (type === 'gas') {
        const el1 = document.getElementById('gas-reading'); if (el1) el1.value = '';
        const el2 = document.getElementById('gas-consumption'); if (el2) el2.textContent = '0 м³';
        const el3 = document.getElementById('gas-total'); if (el3) el3.textContent = '0 ₽';
        const el4 = document.getElementById('pay-gas-amount'); if (el4) el4.value = '';
    } else if (type === 'salt') {
        const el1 = document.getElementById('salt-kg'); if (el1) el1.value = '25';
    }
    initDates();
}

// ===== ОПЛАТЫ =====
async function savePayment(type) {
    const dateId = type === 'electricity' ? 'pay-elec-date' : `pay-${type}-date`;
    const amountId = type === 'electricity' ? 'pay-elec-amount' : `pay-${type}-amount`;

    const dateElement = document.getElementById(dateId);
    const amountElement = document.getElementById(amountId);

    if (!dateElement || !amountElement) {
        console.error('Элементы не найдены:', { dateId, amountId, type });
        alert('⚠ Ошибка: поля оплаты не найдены!');
        return;
    }

    const date = dateElement.value;
    const amount = parseFloat(amountElement.value);

    if (!date || !amount || isNaN(amount)) {
        alert('⚠ Заполните все поля оплаты!');
        return;
    }
    const payment = { id: `pay_${type}_${Date.now()}`, type: type, date: date, amount: amount, createdAt: new Date().toISOString() };
    payments.push(payment);
    await syncPaymentToFirebase(payment);
    saveLocal();

    dateElement.value = new Date().toISOString().split('T')[0];
    amountElement.value = '';

    updatePaymentSummary();
    updateBalanceDisplay();
    updatePaymentsList();

    alert(`✓ Оплата ${type === 'electricity' ? 'электроэнергии' : 'газа'} сохранена!`);
}

// ===== ГЛАВНАЯ ФУНКЦИЯ ОБНОВЛЕНИЯ БАЛАНСА =====
function updatePaymentSummary() {
    ['electricity', 'gas'].forEach(type => {
        // Считаем в копейках (целые числа)
        const chargedKopecks = records.filter(r => r.type === type)
            .reduce((sum, r) => sum + Math.round((parseFloat(r.total) || 0) * 100), 0);
        
        const paidKopecks = payments.filter(p => p.type === type)
            .reduce((sum, p) => sum + Math.round((parseFloat(p.amount) || 0) * 100), 0);
        
        const balanceKopecks = paidKopecks - chargedKopecks;
        
        // Переводим обратно в рубли
        const charged = chargedKopecks / 100;
        const paid = paidKopecks / 100;
        const balance = balanceKopecks / 100;
        
        // Обновляем DOM
        const shortType = type === 'electricity' ? 'elec' : 'gas';
        const chargedEl = document.getElementById(`summary-charged-${shortType}`);
        const paidEl = document.getElementById(`summary-paid-${shortType}`);
        const balanceEl = document.getElementById(`summary-balance-${shortType}`);
        
        if (chargedEl) chargedEl.textContent = `${charged.toFixed(2)} ₽`;
        if (paidEl) paidEl.textContent = `${paid.toFixed(2)} ₽`;
        
        if (balanceEl) {
            const balanceRow = balanceEl.closest('.balance-row');
            if (balanceRow) balanceRow.classList.remove('debt', 'overpayment');
            
            if (balance < 0) {
                balanceEl.textContent = `-${Math.abs(balance).toFixed(2)} ₽ (долг)`;
                if (balanceRow) balanceRow.classList.add('debt');
            } else if (balance > 0) {
                balanceEl.textContent = `+${balance.toFixed(2)} ₽ (переплата)`;
                if (balanceRow) balanceRow.classList.add('overpayment');
            } else {
                balanceEl.textContent = '0.00 ₽ (оплачено)';
            }
        }
    });
}

function updateBalanceDisplay() {
    const idMap = {
        'electricity': 'elec',
        'gas': 'gas'
    };
    
    ['electricity', 'gas'].forEach(type => {
        const shortType = idMap[type];
        
        const charged = records.filter(r => r.type === type).reduce((sum, r) => sum + (r.total || 0), 0);
        const paid = payments.filter(p => p.type === type).reduce((sum, p) => sum + p.amount, 0);
        const balance = paid - charged;

        const chargedEl = document.getElementById(`balance-charged-${shortType}`);
        const paidEl = document.getElementById(`balance-paid-${shortType}`);
        const balanceEl = document.getElementById(`balance-total-${shortType}`);

        if (chargedEl) chargedEl.textContent = `${charged.toFixed(2)} ₽`;
        if (paidEl) paidEl.textContent = `${paid.toFixed(2)} ₽`;

        if (balanceEl) {
            const balanceItem = balanceEl.closest('.balance-item');
            if (balanceItem) balanceItem.classList.remove('debt', 'overpayment');
            if (balance < 0) {
                balanceEl.textContent = `-${Math.abs(balance).toFixed(2)} ₽ (долг)`;
                if (balanceItem) balanceItem.classList.add('debt');
            } else if (balance > 0) {
                balanceEl.textContent = `+${balance.toFixed(2)} ₽ (переплата)`;
                if (balanceItem) balanceItem.classList.add('overpayment');
            } else {
                balanceEl.textContent = '0 ₽ (оплачено)';
            }
        }
    });
}

function filterPayments(type) {
    currentPaymentFilter = type;
    document.querySelectorAll('#tab-payments .filter-tab').forEach(tab => tab.classList.remove('active'));
    event.currentTarget.classList.add('active');    updatePaymentsList();
}

function updatePaymentsList() {
    const list = document.getElementById('payments-list');
    if (!list) return;
    let filtered = [...payments];
    if (currentPaymentFilter !== 'all') filtered = filtered.filter(p => p.type === currentPaymentFilter);
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filtered.length === 0) {
        list.innerHTML = '<p class="hint-text">Нет записей об оплатах</p>';
        return;
    }

    list.innerHTML = filtered.map(p => `
        <div class="payment-item ${p.type}">
            <div class="payment-header">
                <span class="payment-date"><ion-icon name="calendar-outline"></ion-icon>${formatDate(p.date)}</span>
                <span class="payment-type">${p.type === 'electricity' ? 'Электроэнергия' : 'Газ'}</span>
            </div>
            <div class="payment-amount">${p.amount.toFixed(2)} ₽</div>
            <div class="payment-actions">
                <button class="btn btn-danger" onclick="deletePayment('${p.id}')"><ion-icon name="trash-outline"></ion-icon>Удалить</button>
            </div>
        </div>
    `).join('');
}

async function deletePayment(id) {
    if (!confirm('Удалить эту оплату?')) return;
    payments = payments.filter(p => p.id !== id);
    saveLocal();
    await deletePaymentFromFirebase(id);
    updatePaymentsList();
    updatePaymentSummary();
    updateBalanceDisplay();
}

// ===== ИСТОРИЯ =====
function filterHistory(type) {
    currentFilter = type;
    document.querySelectorAll('#tab-history .filter-tab').forEach(tab => tab.classList.remove('active'));
    event.currentTarget.classList.add('active');
    updateHistory();
}

function updateHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;    let filtered = [...records];
    if (currentFilter !== 'all') filtered = filtered.filter(r => r.type === currentFilter);
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filtered.length === 0) {
        list.innerHTML = '<p class="hint-text">Нет записей</p>';
        return;
    }

    list.innerHTML = filtered.map(r => {
        let content = '';
        if (r.type === 'electricity') {
            content = `<div class="history-header"><span class="history-date"><ion-icon name="flash-outline" style="color: var(--ios-warning);"></ion-icon>${formatDate(r.date)}</span><span class="history-type">Электроэнергия</span></div>
                <div class="history-values"><div><ion-icon name="sunny-outline" style="color: var(--ios-warning);"></ion-icon>Т1: ${r.t1} кВт·ч</div><div><ion-icon name="moon-outline" style="color: var(--ios-accent);"></ion-icon>Т2: ${r.t2} кВт·ч</div><div>Расход Т1: ${r.consumptionT1.toFixed(2)} кВт·ч</div><div>Расход Т2: ${r.consumptionT2.toFixed(2)} кВт·ч</div></div>
                <div class="history-total">Итого: ${r.total.toFixed(2)} ₽</div>`;
        } else if (r.type === 'gas') {
            content = `<div class="history-header"><span class="history-date"><ion-icon name="flame-outline" style="color: var(--ios-warning);"></ion-icon>${formatDate(r.date)}</span><span class="history-type">Газ</span></div>
                <div class="history-values"><div><ion-icon name="speedometer-outline"></ion-icon>Показание: ${r.reading} м³</div><div>Расход: ${r.consumption.toFixed(2)} м³</div><div>Тариф: ${r.tariff.value} ₽/м³</div></div>
                <div class="history-total">Итого: ${r.total.toFixed(2)} ₽</div>`;
        } else if (r.type === 'salt') {
            content = `<div class="history-header"><span class="history-date"><ion-icon name="snow-outline" style="color: var(--ios-text-secondary);"></ion-icon>${formatDate(r.date)}</span><span class="history-type">Засыпка соли</span></div>
                <div class="history-values"><div><ion-icon name="scale-outline"></ion-icon>Количество: ${r.kg} кг</div></div>`;
        } else if (r.type === 'cartridge') {
            content = `<div class="history-header"><span class="history-date"><ion-icon name="filter-outline" style="color: var(--ios-success);"></ion-icon>${formatDate(r.date)}</span><span class="history-type">Замена картриджа</span></div>`;
        }
        return `<div class="history-item ${r.type}">${content}<div class="history-actions"><button class="btn btn-secondary" onclick="editRecord('${r.id}')"><ion-icon name="create-outline"></ion-icon>Редактировать</button><button class="btn btn-danger" onclick="deleteRecord('${r.id}')"><ion-icon name="trash-outline"></ion-icon>Удалить</button></div></div>`;
    }).join('');
}

async function deleteRecord(id) {
    if (!confirm('Удалить эту запись?')) return;
    records = records.filter(r => r.id !== id);
    saveLocal();
    await deleteRecordFromFirebase(id);
    updateHistory();
    updateAnalytics();
    updatePaymentSummary();
    updateBalanceDisplay();
}

// ===== МОДАЛЬНОЕ ОКНО РЕДАКТИРОВАНИЯ =====
let editingRecordId = null;
let editingRecordType = null;

function editRecord(id) {
    const record = records.find(r => r.id === id);
    if (!record) return;
    
    editingRecordId = id;
    editingRecordType = record.type;
    
    const modal = document.getElementById('edit-modal');
    const modalBody = document.getElementById('modal-body');
    const modalTitle = document.getElementById('modal-title');
    
    if (!modal || !modalBody) return;
    
    // Заголовок в зависимости от типа
    const titles = {
        'electricity': '⚡ Редактирование электроэнергии',
        'gas': '🔥 Редактирование газа',
        'salt': '🧂 Редактирование засыпки соли',
        'cartridge': '💧 Редактирование замены картриджа'
    };
    modalTitle.innerHTML = `<ion-icon name="create-outline"></ion-icon> ${titles[record.type] || 'Редактирование'}`;
    
    // Генерируем форму в зависимости от типа
    let formHTML = '';
    
    if (record.type === 'electricity') {
        formHTML = `
            <div class="form-row">
                <div class="form-group">
                    <label>
                        <ion-icon name="calendar-outline" style="color: var(--ios-accent);"></ion-icon>
                        Дата *
                    </label>
                    <input type="date" id="edit-elec-date" value="${record.date}" required>
                </div>
            </div>
            <div class="form-row two-columns">
                <div class="form-group">
                    <label>
                        <ion-icon name="sunny-outline" style="color: var(--ios-warning);"></ion-icon>
                        Т1 (день) *
                    </label>
                    <input type="number" id="edit-elec-t1" step="0.01" min="0" value="${record.t1}" required oninput="recalcEditElectric()">
                </div>
                <div class="form-group">
                    <label>                        <ion-icon name="moon-outline" style="color: var(--ios-accent);"></ion-icon>
                        Т2 (ночь) *
                    </label>
                    <input type="number" id="edit-elec-t2" step="0.01" min="0" value="${record.t2}" required oninput="recalcEditElectric()">
                </div>
            </div>
            <div class="calc-results">
                <div class="calc-item">
                    <span>Расход Т1:</span>
                    <strong id="edit-elec-consumption-t1">${record.consumptionT1.toFixed(2)} кВт·ч</strong>
                </div>
                <div class="calc-item">
                    <span>Расход Т2:</span>
                    <strong id="edit-elec-consumption-t2">${record.consumptionT2.toFixed(2)} кВт·ч</strong>
                </div>
                <div class="calc-item total">
                    <span>Стоимость:</span>
                    <strong id="edit-elec-total">${record.total.toFixed(2)} ₽</strong>
                </div>
            </div>
        `;
    } else if (record.type === 'gas') {
        formHTML = `
            <div class="form-row">
                <div class="form-group">
                    <label>
                        <ion-icon name="calendar-outline" style="color: var(--ios-accent);"></ion-icon>
                        Дата *
                    </label>
                    <input type="date" id="edit-gas-date" value="${record.date}" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>
                        <ion-icon name="speedometer-outline" style="color: var(--ios-warning);"></ion-icon>
                        Показание (м³) *
                    </label>
                    <input type="number" id="edit-gas-reading" step="0.01" min="0" value="${record.reading}" required oninput="recalcEditGas()">
                </div>
            </div>
            <div class="calc-results">
                <div class="calc-item">
                    <span>Расход:</span>
                    <strong id="edit-gas-consumption">${record.consumption.toFixed(2)} м³</strong>
                </div>
                <div class="calc-item total">
                    <span>Стоимость:</span>
                    <strong id="edit-gas-total">${record.total.toFixed(2)} ₽</strong>
                </div>            </div>
        `;
    } else if (record.type === 'salt') {
        formHTML = `
            <div class="form-row">
                <div class="form-group">
                    <label>
                        <ion-icon name="calendar-outline" style="color: var(--ios-accent);"></ion-icon>
                        Дата *
                    </label>
                    <input type="date" id="edit-salt-date" value="${record.date}" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>
                        <ion-icon name="scale-outline" style="color: var(--ios-text-secondary);"></ion-icon>
                        Количество (кг) *
                    </label>
                    <input type="number" id="edit-salt-kg" step="0.1" min="0" value="${record.kg}" required>
                </div>
            </div>
        `;
    } else if (record.type === 'cartridge') {
        formHTML = `
            <div class="form-row">
                <div class="form-group">
                    <label>
                        <ion-icon name="calendar-outline" style="color: var(--ios-accent);"></ion-icon>
                        Дата *
                    </label>
                    <input type="date" id="edit-cartridge-date" value="${record.date}" required>
                </div>
            </div>
        `;
    }
    
    modalBody.innerHTML = formHTML;
    modal.classList.add('active');
    
    // Блокируем прокрутку body
    document.body.style.overflow = 'hidden';
}

function closeEditModal() {
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.classList.remove('active');
    }
    document.body.style.overflow = '';    editingRecordId = null;
    editingRecordType = null;
}

function recalcEditElectric() {
    const t1 = parseFloat(document.getElementById('edit-elec-t1').value) || 0;
    const t2 = parseFloat(document.getElementById('edit-elec-t2').value) || 0;
    const date = document.getElementById('edit-elec-date').value;
    
    // Находим предыдущую запись (исключая текущую редактируемую)
    const otherRecords = records
        .filter(r => r.type === 'electricity' && r.id !== editingRecordId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Находим запись, которая была ДО редактируемой по дате
    let prevRecord = null;
    for (const r of otherRecords) {
        if (r.date <= date) {
            prevRecord = r;
            break;
        }
    }
    
    const tariff = getTariffForDate('electricity', date);
    
    if (prevRecord && tariff) {
        const consumptionT1 = Math.max(0, t1 - prevRecord.t1);
        const consumptionT2 = Math.max(0, t2 - prevRecord.t2);
        
        const el1 = document.getElementById('edit-elec-consumption-t1');
        const el2 = document.getElementById('edit-elec-consumption-t2');
        const el3 = document.getElementById('edit-elec-total');
        
        if (el1) el1.textContent = `${consumptionT1.toFixed(2)} кВт·ч`;
        if (el2) el2.textContent = `${consumptionT2.toFixed(2)} кВт·ч`;
        if (el3) el3.textContent = `${((consumptionT1 * tariff.t1) + (consumptionT2 * (tariff.t2 || 0))).toFixed(2)} ₽`;
    }
}

function recalcEditGas() {
    const reading = parseFloat(document.getElementById('edit-gas-reading').value) || 0;
    const date = document.getElementById('edit-gas-date').value;
    
    const otherRecords = records
        .filter(r => r.type === 'gas' && r.id !== editingRecordId)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    let prevRecord = null;
    for (const r of otherRecords) {
        if (r.date <= date) {            prevRecord = r;
            break;
        }
    }
    
    const tariff = getTariffForDate('gas', date);
    
    if (prevRecord && tariff) {
        const consumption = Math.max(0, reading - prevRecord.reading);
        
        const el1 = document.getElementById('edit-gas-consumption');
        const el2 = document.getElementById('edit-gas-total');
        
        if (el1) el1.textContent = `${consumption.toFixed(2)} м³`;
        if (el2) el2.textContent = `${(consumption * tariff.value).toFixed(2)} ₽`;
    }
}

async function saveEditedRecord() {
    if (!editingRecordId || !editingRecordType) return;
    
    const recordIndex = records.findIndex(r => r.id === editingRecordId);
    if (recordIndex === -1) {
        closeEditModal();
        return;
    }
    
    let updatedRecord = { ...records[recordIndex] };
    
    if (editingRecordType === 'electricity') {
        const date = document.getElementById('edit-elec-date').value;
        const t1 = parseFloat(document.getElementById('edit-elec-t1').value);
        const t2 = parseFloat(document.getElementById('edit-elec-t2').value);
        
        if (!date || !t1 || !t2) {
            alert('⚠ Заполните все поля!');
            return;
        }
        
        const otherRecords = records
            .filter(r => r.type === 'electricity' && r.id !== editingRecordId)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        let prevRecord = null;
        for (const r of otherRecords) {
            if (r.date <= date) {
                prevRecord = r;
                break;
            }
        }        
        const tariff = getTariffForDate('electricity', date);
        const consumptionT1 = prevRecord ? Math.max(0, t1 - prevRecord.t1) : 0;
        const consumptionT2 = prevRecord ? Math.max(0, t2 - prevRecord.t2) : 0;
        const total = (consumptionT1 * tariff.t1) + (consumptionT2 * (tariff.t2 || 0));
        
        updatedRecord = {
            ...updatedRecord,
            date: date,
            t1: t1,
            t2: t2,
            consumptionT1: consumptionT1,
            consumptionT2: consumptionT2,
            total: total,
            tariff: { t1: tariff.t1, t2: tariff.t2 || 0 },
            updatedAt: new Date().toISOString()
        };
        
    } else if (editingRecordType === 'gas') {
        const date = document.getElementById('edit-gas-date').value;
        const reading = parseFloat(document.getElementById('edit-gas-reading').value);
        
        if (!date || !reading) {
            alert('⚠ Заполните все поля!');
            return;
        }
        
        const otherRecords = records
            .filter(r => r.type === 'gas' && r.id !== editingRecordId)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        let prevRecord = null;
        for (const r of otherRecords) {
            if (r.date <= date) {
                prevRecord = r;
                break;
            }
        }
        
        const tariff = getTariffForDate('gas', date);
        const consumption = prevRecord ? Math.max(0, reading - prevRecord.reading) : 0;
        const total = consumption * (tariff.value || 0);
        
        updatedRecord = {
            ...updatedRecord,
            date: date,
            reading: reading,
            consumption: consumption,
            total: total,
            tariff: { value: tariff.value || 0 },            updatedAt: new Date().toISOString()
        };
        
    } else if (editingRecordType === 'salt') {
        const date = document.getElementById('edit-salt-date').value;
        const kg = parseFloat(document.getElementById('edit-salt-kg').value);
        
        if (!date || !kg) {
            alert('⚠ Заполните все поля!');
            return;
        }
        
        updatedRecord = {
            ...updatedRecord,
            date: date,
            kg: kg,
            updatedAt: new Date().toISOString()
        };
        
    } else if (editingRecordType === 'cartridge') {
        const date = document.getElementById('edit-cartridge-date').value;
        
        if (!date) {
            alert('⚠ Заполните все поля!');
            return;
        }
        
        updatedRecord = {
            ...updatedRecord,
            date: date,
            updatedAt: new Date().toISOString()
        };
    }
    
    // Сохраняем в массив
    records[recordIndex] = updatedRecord;
    saveLocal();
    
    // Синхронизируем с Firebase
    await syncRecordToFirebase(updatedRecord);
    
    // Обновляем все отображения
    updateHistory();
    updateAnalytics();
    updatePaymentSummary();
    updateBalanceDisplay();
    
    closeEditModal();
    alert('✓ Запись обновлена!');
}
// Закрытие модального окна по клику на оверлей
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('edit-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeEditModal();
            }
        });
    }
    
    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeEditModal();
        }
    });
});

// ===== АНАЛИТИКА =====
function updateAnalytics() {
    const month = document.getElementById('analytics-month')?.value;
    const year = document.getElementById('analytics-year')?.value;
    let filtered = [...records];
    if (month) filtered = filtered.filter(r => (new Date(r.date).getMonth() + 1).toString() === month);
    if (year) filtered = filtered.filter(r => new Date(r.date).getFullYear().toString() === year);

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
            <div class="stat-card"><h3>Электроэнергия</h3><div class="stat-value">${stats.electricity.toFixed(2)} ₽</div></div>
            <div class="stat-card"><h3>Газ</h3><div class="stat-value">${stats.gas.toFixed(2)} ₽</div></div>
            <div class="stat-card"><h3>Засыпки соли</h3><div class="stat-value">${stats.salt} раз</div></div>
            <div class="stat-card"><h3>Замены картриджа</h3><div class="stat-value">${stats.cartridge} раз</div></div>
            <div class="stat-card total"><h3>Итого расходов</h3><div class="stat-value">${stats.total.toFixed(2)} ₽</div></div>
        `;
    }
}

// ===== УТИЛИТЫ =====
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ===== ЭКСПОРТ/ИМПОРТ =====
function exportData() {
    const data = { records, tariffs, payments, exportDate: new Date().toISOString(), version: '3.0' };
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
            
            // Преобразуем объекты в массивы если нужно
            let recordsArray = [];
            let paymentsArray = [];
            let tariffsData = { electricity: [], gas: [] };
            
            // Обработка записей (может быть объектом или массивом)
            if (data.records) {
                if (Array.isArray(data.records)) {
                    recordsArray = data.records;
                } else if (typeof data.records === 'object') {
                    recordsArray = Object.values(data.records);
                }
            }
            
            // Обработка оплат (может быть объектом или массивом)
            if (data.payments) {
                if (Array.isArray(data.payments)) {
                    paymentsArray = data.payments;
                } else if (typeof data.payments === 'object') {
                    paymentsArray = Object.values(data.payments);
                }
            }
            
            // Обработка тарифов
            if (data.tariffs) {
                if (Array.isArray(data.tariffs)) {
                    tariffsData = data.tariffs;
                } else if (typeof data.tariffs === 'object') {
                    if (data.tariffs.electricity) {
                        tariffsData.electricity = Array.isArray(data.tariffs.electricity) 
                            ? data.tariffs.electricity 
                            : Object.values(data.tariffs.electricity);
                    }
                    if (data.tariffs.gas) {
                        tariffsData.gas = Array.isArray(data.tariffs.gas) 
                            ? data.tariffs.gas 
                            : Object.values(data.tariffs.gas);
                    }
                }
            }
                        // Отдельная обработка для Firebase формата (tariffs_electricity и tariffs_gas)
            if (data.tariffs_electricity) {
                tariffsData.electricity = Array.isArray(data.tariffs_electricity) 
                    ? data.tariffs_electricity 
                    : Object.values(data.tariffs_electricity);
            }
            if (data.tariffs_gas) {
                tariffsData.gas = Array.isArray(data.tariffs_gas) 
                    ? data.tariffs_gas 
                    : Object.values(data.tariffs_gas);
            }
            
            const recordsCount = recordsArray.length;
            const paymentsCount = paymentsArray.length;
            const tariffsCount = (tariffsData.electricity?.length || 0) + (tariffsData.gas?.length || 0);
            
            if (!confirm(`Импортировать:\n- ${recordsCount} записей\n- ${paymentsCount} оплат\n- ${tariffsCount} тарифов\n\nТекущие данные будут заменены.`)) {
                return;
            }
            
            // Применяем данные
            records = recordsArray;
            payments = paymentsArray;
            tariffs = tariffsData;
            
            saveLocal();
            
            // Синхронизация с Firebase
            if (isFirebaseConnected) {
                const batch = writeBatch(db);
                
                // Записи
                recordsArray.forEach(r => {
                    batch.set(doc(db, 'records', r.id), r);
                });
                
                // Тарифы на электричество
                if (tariffsData.electricity) {
                    tariffsData.electricity.forEach(t => {
                        batch.set(doc(db, 'tariffs_electricity', t.id), t);
                    });
                }
                
                // Тарифы на газ
                if (tariffsData.gas) {
                    tariffsData.gas.forEach(t => {
                        batch.set(doc(db, 'tariffs_gas', t.id), t);
                    });
                }
                                // Оплаты
                paymentsArray.forEach(p => {
                    batch.set(doc(db, 'payments', p.id), p);
                });
                
                await batch.commit();
            }
            
            populatePeriodSelectors();
            updateTariffList();
            updateHistory();
            updateAnalytics();
            updatePaymentsList();
            updatePaymentSummary();
            updateBalanceDisplay();
            
            alert(`✓ Данные успешно импортированы!\n- Записей: ${recordsCount}\n- Оплат: ${paymentsCount}\n- Тарифов: ${tariffsCount}`);
        } catch (err) {
            console.error('Import error:', err);
            alert('❌ Ошибка импорта: ' + err.message);
        }
    };
    reader.readAsText(file);
}
async function resetAllData() {
    if (!confirm('⚠ ВНИМАНИЕ! Все локальные данные будут удалены. Продолжить?')) return;
    if (!confirm('Вы уверены?')) return;
    records = [];
    tariffs = { electricity: [], gas: [] };
    payments = [];
    localStorage.removeItem('dom_records');
    localStorage.removeItem('dom_tariffs');
    localStorage.removeItem('dom_payments');
    populatePeriodSelectors();
    updateTariffList();
    updateHistory();
    updateAnalytics();
    updatePaymentsList();
    updatePaymentSummary();
    updateBalanceDisplay();
    alert('✓ Все локальные данные удалены.');
}

async function recalculateAll() {
    if (!confirm('Пересчитать все записи с учетом порога 3000 кВт·ч и повышенных тарифов?')) return;
    
    records.forEach(r => {
        if (r.type === 'electricity') {
            const tariff = getTariffForDate('electricity', r.date);
            
            // ИСПОЛЬЗУЕМ НОВУЮ ФУНКЦИЮ С ПОРОГОМ 3000 кВт·ч
            const calc = calcElectricityCost(r.consumptionT1, r.consumptionT2, tariff);
            
            r.total = calc.total;
            r.normT1Used = calc.normT1Used;
            r.overT1 = calc.overT1;
            r.normT2Used = calc.normT2Used;
            r.overT2 = calc.overT2;
            r.tariff = { 
                t1: tariff.t1, 
                t2: tariff.t2 || 0,
                overT1: tariff.overT1,
                overT2: tariff.overT2
            };
            
        } else if (r.type === 'gas') {
            const tariff = getTariffForDate('gas', r.date);
            r.total = r.consumption * (tariff.value || 0);
            r.tariff = { value: tariff.value || 0 };
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
    updatePaymentSummary();
    updateBalanceDisplay();
    alert('✓ Все записи пересчитаны с учетом порога 3000 кВт·ч!');
}

// ===== ПЛАВАЮЩЕЕ ПЕРЕТАСКИВАЕМОЕ МЕНЮ =====
function initDraggableNav() {
    const nav = document.querySelector('.floating-nav');
    if (!nav) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;
    let currentX = 0;
    let currentY = 0;
    let dragStartTime = 0;
    let hasMoved = false;

    // Загружаем сохраненную позицию
    const savedPos = localStorage.getItem('nav_position');
    if (savedPos) {
        const pos = JSON.parse(savedPos);
        nav.style.left = pos.x + 'px';
        nav.style.top = pos.y + 'px';
        nav.style.bottom = 'auto';
        nav.style.transform = 'none';
        currentX = pos.x;
        currentY = pos.y;
    }

    // ===== МЫШЬ =====
    nav.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);

    // ===== ТАЧ (мобильные) =====
    nav.addEventListener('touchstart', dragStart, { passive: false });
    document.addEventListener('touchmove', dragMove, { passive: false });
    document.addEventListener('touchend', dragEnd);

    function dragStart(e) {
        // Если кликнули по кнопке - не начинаем перетаскивание
        if (e.target.closest('.nav-btn')) {
            // Проверяем, было ли это короткое нажатие (клик)
            dragStartTime = Date.now();
            hasMoved = false;
            return;
        }

        isDragging = true;
        dragStartTime = Date.now();
        hasMoved = false;
        if (e.type === 'touchstart') {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        } else {
            startX = e.clientX;
            startY = e.clientY;
        }

        // Получаем текущую позицию
        const rect = nav.getBoundingClientRect();
        initialX = rect.left;
        initialY = rect.top;

        nav.classList.add('dragging');
    }

    function dragMove(e) {
        if (!isDragging) return;

        e.preventDefault();

        let clientX, clientY;

        if (e.type === 'touchmove') {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const deltaX = clientX - startX;
        const deltaY = clientY - startY;

        // Если движение больше 5px - считаем это перетаскиванием
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
            hasMoved = true;
        }

        currentX = initialX + deltaX;
        currentY = initialY + deltaY;

        // Ограничиваем в пределах экрана
        const navWidth = nav.offsetWidth;
        const navHeight = nav.offsetHeight;
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        currentX = Math.max(10, Math.min(currentX, screenWidth - navWidth - 10));
        currentY = Math.max(10, Math.min(currentY, screenHeight - navHeight - 10));
        nav.style.left = currentX + 'px';
        nav.style.top = currentY + 'px';
        nav.style.bottom = 'auto';
        nav.style.transform = 'none';
    }

    function dragEnd(e) {
        if (!isDragging) return;

        isDragging = false;
        nav.classList.remove('dragging');

        // Сохраняем позицию
        localStorage.setItem('nav_position', JSON.stringify({
            x: currentX,
            y: currentY
        }));

        // Если это был клик (не перетаскивание) - обрабатываем кнопку
        if (!hasMoved && e.target.closest('.nav-btn')) {
            const btn = e.target.closest('.nav-btn');
            const tabName = btn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
            if (tabName) {
                switchTab(tabName, btn);
            }
        }
    }

    // Двойной клик - вернуть меню в центр внизу
    nav.addEventListener('dblclick', (e) => {
        if (e.target.closest('.nav-btn')) return;
        
        nav.style.transition = 'all 0.5s ease';
        nav.style.left = '50%';
        nav.style.bottom = '20px';
        nav.style.top = 'auto';
        nav.style.transform = 'translateX(-50%)';
        
        localStorage.removeItem('nav_position');
        
        setTimeout(() => {
            nav.style.transition = '';
        }, 500);
    });
}

// Запускаем после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initDraggableNav, 100);});

// ===== ЭКСПОРТ ФУНКЦИЙ =====
window.switchTab = switchTab;
window.showInputType = showInputType;
window.showTariffType = showTariffType;
window.autoCalcElectric = autoCalcElectric;
window.autoCalcGas = autoCalcGas;
window.saveRecord = saveRecord;
window.savePayment = savePayment;
window.clearForm = clearForm;
window.filterHistory = filterHistory;
window.filterPayments = filterPayments;
window.deleteRecord = deleteRecord;
window.deletePayment = deletePayment;
window.editRecord = editRecord;
window.closeEditModal = closeEditModal;
window.saveEditedRecord = saveEditedRecord;
window.recalcEditElectric = recalcEditElectric;
window.recalcEditGas = recalcEditGas;
window.deleteTariff = deleteTariff;
window.updateAnalytics = updateAnalytics;
window.exportData = exportData;
window.importData = importData;
window.resetAllData = resetAllData;
window.recalculateAll = recalculateAll;
// Экспорт функций редактирования тарифов
window.editTariff = editTariff;
window.closeEditTariffModal = closeEditTariffModal;
window.saveEditedTariff = saveEditedTariff;