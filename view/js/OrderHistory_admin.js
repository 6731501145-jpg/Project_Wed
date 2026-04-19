// ==========================================
// Date Picker State & Constants
// ==========================================
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

let currentFilterType = 'today';
let selectedDateContext = new Date();
let selectedWeekObj = null;

const _today = new Date();
let monthYear = _today.getFullYear();
let weekViewMonth = _today.getMonth();
let weekViewYear = _today.getFullYear();
let dayViewMonth = _today.getMonth();
let dayViewYear = _today.getFullYear();

// ==========================================
// Fetch & Render Order History
// ==========================================
async function fetchOrderHistory() {
    let start = new Date(selectedDateContext);
    let end = new Date(selectedDateContext);

    if (currentFilterType === 'today' || currentFilterType === 'day') {
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
    } else if (currentFilterType === 'month') {
        start = new Date(selectedDateContext.getFullYear(), selectedDateContext.getMonth(), 1, 0, 0, 0);
        end = new Date(selectedDateContext.getFullYear(), selectedDateContext.getMonth() + 1, 0, 23, 59, 59);
    } else if (currentFilterType === 'week') {
        const d = new Date(selectedWeekObj.year, 0, 4);
        const dayNum = d.getDay() || 7;
        d.setDate(d.getDate() - dayNum + 1);
        d.setDate(d.getDate() + (selectedWeekObj.week - 1) * 7);
        start = new Date(d);
        start.setHours(0, 0, 0, 0);
        end = new Date(start);
        end.setDate(end.getDate() + 6);
        end.setHours(23, 59, 59, 999);
    }

    const formatDBDate = (d) => {
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const queryParams = `?start=${formatDBDate(start)}&end=${formatDBDate(end)}`;

    try {
        const response = await fetch(`/api/admin/order/history${queryParams}`);
        const orders = await response.json();
        renderOrderHistory(orders);
    } catch (error) {
        console.error('Error fetching order history:', error);
        document.getElementById('order-history-list').innerHTML = `<tr><td colspan="4" class="py-5 text-red-500">Failed to load data</td></tr>`;
    }
}

function renderOrderHistory(orders) {
    const tbody = document.getElementById('order-history-list');
    tbody.innerHTML = '';

    if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-10 text-gray-400 text-lg">No order history available.</td></tr>`;
        return;
    }

    orders.forEach(order => {
        const dateObj = new Date(order.date);
        const day = String(dateObj.getDate()).padStart(2, '0');
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const year = String(dateObj.getFullYear()).slice(-2);
        const dateStr = `${day}/${month}/${year}`;

        let statusText = order.status;
        let statusClass = "text-gray-700";

        if (statusText === 'serving' || statusText === 'paid') {
            statusText = 'Success';
            statusClass = 'text-green-500 font-bold';
        } else {
            statusText = statusText.charAt(0).toUpperCase() + statusText.slice(1);
            statusClass = 'text-orange-500 font-medium';
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition-colors';
        tr.innerHTML = `
                    <td class="py-5 px-4 text-base md:text-xl font-medium max-w-[200px] truncate" title="${order.menu_names}">
                        ${order.menu_names}
                    </td>
                    <td class="py-5 px-4 text-base md:text-xl font-medium">${dateStr}</td>
                    <td class="py-5 px-4 text-base md:text-xl font-medium">${Number(order.amount).toLocaleString()}</td>
                    <td class="py-5 px-4 text-base md:text-xl ${statusClass}">${statusText}</td>
                `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// Dropdown Menu Controls
// ==========================================
function closeAll() {
    ['main-menu', 'day-picker', 'week-picker', 'month-picker'].forEach(id => document.getElementById(id).classList.remove('open'));
}

function toggleMain() {
    const menu = document.getElementById('main-menu');
    const wasOpen = menu.classList.contains('open');
    closeAll();
    if (!wasOpen) menu.classList.add('open');
}

function openSub(type) {
    closeAll();
    if (type === 'day') {
        renderDayGrid();
        document.getElementById('day-picker').classList.add('open');
    } else if (type === 'week') {
        renderWeekGrid();
        document.getElementById('week-picker').classList.add('open');
    } else if (type === 'month') {
        renderMonthGrid();
        document.getElementById('month-picker').classList.add('open');
    } else {
        document.getElementById('main-menu').classList.add('open');
    }
}

// ==========================================
// Today Selection
// ==========================================
function selectToday() {
    const d = new Date();
    currentFilterType = 'today';
    selectedDateContext = d;
    document.getElementById('dropdown-label').textContent = `Today · ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    closeAll();
    fetchOrderHistory();
}

// ==========================================
// Day Picker (Calendar)
// ==========================================
function changeDayView(delta) {
    dayViewMonth += delta;
    if (dayViewMonth < 0) { dayViewMonth = 11; dayViewYear--; }
    else if (dayViewMonth > 11) { dayViewMonth = 0; dayViewYear++; }
    renderDayGrid();
}

function changeDayYearView(delta) {
    dayViewYear += delta;
    renderDayGrid();
}

function renderDayGrid() {
    document.getElementById('day-view-label').textContent = `${MONTH_NAMES[dayViewMonth]} ${dayViewYear}`;
    const grid = document.getElementById('day-grid');
    grid.innerHTML = '';

    // Day headers (Mon-Sun)
    DAY_NAMES.forEach(name => {
        const header = document.createElement('div');
        header.className = 'day-header';
        header.textContent = name;
        grid.appendChild(header);
    });

    // First day of month
    const firstDay = new Date(dayViewYear, dayViewMonth, 1);
    let startDay = firstDay.getDay(); // 0=Sun, 1=Mon...
    startDay = startDay === 0 ? 6 : startDay - 1; // Convert to Mon=0

    // Days in month
    const daysInMonth = new Date(dayViewYear, dayViewMonth + 1, 0).getDate();

    // Today reference
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

    // Empty cells before first day
    for (let i = 0; i < startDay; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell empty';
        grid.appendChild(cell);
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell';
        cell.textContent = d;

        const cellDateStr = `${dayViewYear}-${dayViewMonth}-${d}`;

        // Highlight today
        if (cellDateStr === todayStr) {
            cell.classList.add('today');
        }

        // Highlight selected day
        if (currentFilterType === 'day' &&
            selectedDateContext.getFullYear() === dayViewYear &&
            selectedDateContext.getMonth() === dayViewMonth &&
            selectedDateContext.getDate() === d) {
            cell.classList.add('selected');
        }

        cell.onclick = () => selectDay(dayViewYear, dayViewMonth, d);
        grid.appendChild(cell);
    }
}

function selectDay(year, month, day) {
    currentFilterType = 'day';
    selectedDateContext = new Date(year, month, day);
    const d = selectedDateContext;
    document.getElementById('dropdown-label').textContent = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    closeAll();
    fetchOrderHistory();
}

// ==========================================
// Week Picker
// ==========================================
function getISOWeekData(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayNum = d.getDay() || 7;
    d.setDate(d.getDate() + 4 - dayNum);
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return { year: d.getFullYear(), week: week };
}

function getWeekDateRangeLocal(year, week) {
    const d = new Date(year, 0, 4);
    const dayNum = d.getDay() || 7;
    d.setDate(d.getDate() - dayNum + 1);
    d.setDate(d.getDate() + (week - 1) * 7);
    const start = new Date(d);
    const end = new Date(d);
    end.setDate(end.getDate() + 6);
    const fmt = date => `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
    return `${fmt(start)} - ${fmt(end)}`;
}

function getWeeksInMonth(year, month) {
    const weeks = [];
    let current = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    while (current <= lastDay) {
        const weekData = getISOWeekData(current);
        if (!weeks.some(w => w.year === weekData.year && w.week === weekData.week)) weeks.push(weekData);
        current.setDate(current.getDate() + 1);
    }
    return weeks;
}

function changeWeekView(deltaMonths) {
    weekViewMonth += deltaMonths;
    if (weekViewMonth < 0) { weekViewMonth = 11; weekViewYear--; }
    else if (weekViewMonth > 11) { weekViewMonth = 0; weekViewYear++; }
    renderWeekGrid();
}

function changeWeekYearView(deltaYears) {
    weekViewYear += deltaYears;
    renderWeekGrid();
}

function renderWeekGrid() {
    document.getElementById('week-view-label').textContent = `${MONTH_NAMES[weekViewMonth]} ${weekViewYear}`;
    const list = document.getElementById('week-list');
    list.innerHTML = '';
    const weeks = getWeeksInMonth(weekViewYear, weekViewMonth);

    weeks.forEach(wData => {
        const isSel = currentFilterType === 'week' && selectedWeekObj && selectedWeekObj.year === wData.year && selectedWeekObj.week === wData.week;
        const rangeStr = getWeekDateRangeLocal(wData.year, wData.week);
        const btn = document.createElement('button');
        btn.className = `w-full text-left px-4 py-2.5 rounded-xl transition-all border ${isSel ? 'bg-cyan-50 border-cyan-400 text-cyan-700 shadow-sm' : 'bg-white border-gray-100 hover:border-cyan-200 hover:bg-cyan-50/50 text-gray-700'}`;
        btn.innerHTML = `<div class="flex justify-between items-center"><span class="font-semibold text-sm">Week ${wData.week}</span>${isSel ? `<svg class="w-4 h-4 text-cyan-500" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>` : ''}</div><div class="text-xs ${isSel ? 'text-cyan-600' : 'text-gray-400'} mt-0.5">${rangeStr}</div>`;
        btn.onclick = () => selectWeek(wData.year, wData.week);
        list.appendChild(btn);
    });
}

function selectWeek(year, week) {
    currentFilterType = 'week';
    selectedWeekObj = { year, week };
    document.getElementById('dropdown-label').textContent = `Week ${week} (${year})`;
    closeAll();
    fetchOrderHistory();
}

// ==========================================
// Month Picker
// ==========================================
function changeMonthYear(delta) { monthYear += delta; renderMonthGrid(); }

function renderMonthGrid() {
    document.getElementById('month-year-label').textContent = monthYear;
    const grid = document.getElementById('month-grid');
    grid.innerHTML = '';
    MONTH_NAMES.forEach((name, i) => {
        const isSel = currentFilterType === 'month' && selectedDateContext.getFullYear() === monthYear && selectedDateContext.getMonth() === i;
        const btn = document.createElement('button');
        btn.className = `month-cell text-center py-2.5 rounded-lg transition-colors font-medium ${isSel ? 'selected' : 'text-gray-700'}`;
        btn.textContent = name;
        btn.onclick = () => selectMonth(monthYear, i);
        grid.appendChild(btn);
    });
}

function selectMonth(year, month) {
    currentFilterType = 'month';
    selectedDateContext = new Date(year, month, 1);
    document.getElementById('dropdown-label').textContent = `${MONTH_NAMES[month]} ${year}`;
    closeAll();
    fetchOrderHistory();
}

// ==========================================
// Close dropdown when clicking outside
// ==========================================
document.addEventListener('click', function (e) {
    if (!document.getElementById('dropdown-wrapper').contains(e.target)) closeAll();
});

// ==========================================
// Init
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    selectToday();
});

function logout() {
    // วิ่งไปที่ Route logout โดยตรง Browser จะจัดการเปลี่ยนหน้าตาม res.redirect('/') เอง
    window.location.href = '/logout';
}
