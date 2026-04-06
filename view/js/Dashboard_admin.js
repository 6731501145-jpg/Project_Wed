async function fetchAndRenderDashboard() {
    let start = new Date(selectedDateContext);
    let end = new Date(selectedDateContext);

    if (currentFilterType === 'today') {
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
        const [summaryRes, topMenusRes, reviewsRes] = await Promise.all([
            fetch(`/api/admin/summary${queryParams}`),
            fetch(`/api/admin/top-menus${queryParams}`),
            fetch(`/api/admin/reviews${queryParams}`)
        ]);

        const summaryData = await summaryRes.json();
        const rankingArray = await topMenusRes.json();
        const recentReviews = await reviewsRes.json();

        document.getElementById('stat-customer-now').textContent = summaryData.customer_now;
        document.getElementById('stat-customers').textContent = summaryData.total_customers;
        document.getElementById('stat-revenue').textContent = Number(summaryData.total_revenue).toLocaleString();

        const dateText = document.getElementById('dropdown-label').textContent;
        document.getElementById('ranking-date-subtitle').textContent = `Data for: ${dateText}`;
        document.getElementById('review-date-subtitle').textContent = `Data for: ${dateText} (All Reviews)`;

        renderRankingPreview(rankingArray.slice(0, 3));

        recentReviews.forEach(r => r.date = new Date(r.date));
        renderReviewsPreview(recentReviews.slice(0, 3));

        currentRankingData = rankingArray;
        currentRankingPage = 1;
        renderRankingPage();
        renderReviewsHTML(recentReviews);

    } catch (error) {
        console.error("Error fetching admin dashboard data:", error);
    }
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let currentFilterType = 'today';
let selectedDateContext = new Date();
let selectedWeekObj = null;

const _today = new Date();
let monthYear = _today.getFullYear();
let weekViewMonth = _today.getMonth();
let weekViewYear = _today.getFullYear();

let currentRankingData = [];
let currentRankingPage = 1;
const RANKING_ITEMS_PER_PAGE = 10;

function closeAll() {
    ['main-menu', 'week-picker', 'month-picker'].forEach(id => document.getElementById(id).classList.remove('open'));
}

function toggleMain() {
    const menu = document.getElementById('main-menu');
    const wasOpen = menu.classList.contains('open');
    closeAll();
    if (!wasOpen) menu.classList.add('open');
}

function openSub(type) {
    closeAll();
    if (type === 'week') {
        renderWeekGrid();
        document.getElementById('week-picker').classList.add('open');
    } else if (type === 'month') {
        renderMonthGrid();
        document.getElementById('month-picker').classList.add('open');
    } else {
        document.getElementById('main-menu').classList.add('open');
    }
}

function selectToday() {
    const d = new Date();
    currentFilterType = 'today';
    selectedDateContext = d;

    document.getElementById('dropdown-label').textContent = `Today · ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    closeAll();
    fetchAndRenderDashboard();
}

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
    fetchAndRenderDashboard();
}

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
    fetchAndRenderDashboard();
}

function isDateMatch(dbDate) {
    const targetDate = new Date(dbDate);
    if (currentFilterType === 'today') {
        return targetDate.toDateString() === selectedDateContext.toDateString();
    } else if (currentFilterType === 'month') {
        return targetDate.getFullYear() === selectedDateContext.getFullYear() && targetDate.getMonth() === selectedDateContext.getMonth();
    } else if (currentFilterType === 'week') {
        const targetWeekInfo = getISOWeekData(targetDate);
        return targetWeekInfo.year === selectedWeekObj.year && targetWeekInfo.week === selectedWeekObj.week;
    }
    return false;
}

function renderRankingPreview(rankingData) {
    const container = document.getElementById('dashboard-ranking-preview');
    container.innerHTML = '';

    if (rankingData.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100 h-full flex items-center justify-center">No orders found.</div>`;
        return;
    }

    rankingData.forEach((item, index) => {
        let badgeClass = index === 0 ? 'bg-yellow-100 text-yellow-600 border-yellow-200' : index === 1 ? 'bg-gray-200 text-gray-600 border-gray-300' : 'bg-orange-100 text-orange-700 border-orange-200';
        const html = `
                            <div class="bg-white p-3 md:p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-gray-50">
                                <div class="w-10 h-10 rounded-full ${badgeClass} border flex items-center justify-center font-bold text-lg shrink-0">${index + 1}</div>
                                <div class="text-2xl">${item.image}</div>
                                <div class="flex-1 overflow-hidden">
                                    <h4 class="font-bold text-gray-800 text-sm md:text-base truncate">${item.name}</h4>
                                </div>
                                <div class="font-black text-cyan-500 text-lg md:text-xl shrink-0">${item.total_qty} <span class="text-xs text-gray-400 font-medium">items</span></div>
                            </div>`;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function renderReviewsPreview(reviewsData) {
    const container = document.getElementById('dashboard-review-preview');
    container.innerHTML = '';

    if (reviewsData.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100 h-full flex items-center justify-center">No reviews found.</div>`;
        return;
    }

    reviewsData.forEach(review => {
        let starsHTML = '';
        for (let i = 1; i <= 5; i++) {
            starsHTML += `<svg class="w-3.5 h-3.5 md:w-4 md:h-4 ${i <= review.rating ? 'text-yellow-400' : 'text-gray-200'}" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>`;
        }
        const html = `
                            <div class="bg-white p-3 md:p-4 rounded-2xl shadow-sm border border-gray-50 flex flex-col gap-1.5">
                                <div class="flex justify-between items-center">
                                    <div class="flex items-center gap-2">
                                        <div class="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-400 to-purple-400 text-white flex items-center justify-center font-bold text-xs shrink-0">${review.customer_name.charAt(0)}</div>
                                        <h4 class="font-bold text-xs md:text-sm text-gray-800 truncate max-w-[100px] md:max-w-[150px]">${review.customer_name}</h4>
                                    </div>
                                    <div class="flex">${starsHTML}</div>
                        </div>
                        <p class="text-xs md:text-sm text-gray-600 truncate italic">"${review.comment}"</p>
                    </div>`;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function renderRankingPage() {
    const container = document.getElementById('ranking-list');
    container.innerHTML = '';

    if (currentRankingData.length === 0) {
        container.innerHTML = `<div class="text-center py-20 text-gray-400">No orders found for this period.</div>`;
        document.getElementById('ranking-pagination').innerHTML = '';
        return;
    }

    const start = (currentRankingPage - 1) * RANKING_ITEMS_PER_PAGE;
    const end = start + RANKING_ITEMS_PER_PAGE;
    const pageData = currentRankingData.slice(start, end);

    pageData.forEach((item, index) => {
        const rank = start + index;
        let rankBadge = '';
        if (rank === 0) rankBadge = `<div class="w-10 h-10 md:w-14 md:h-14 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center font-bold text-xl md:text-2xl shadow-sm border border-yellow-200">1</div>`;
        else if (rank === 1) rankBadge = `<div class="w-10 h-10 md:w-14 md:h-14 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center font-bold text-xl md:text-2xl shadow-sm border border-gray-300">2</div>`;
        else if (rank === 2) rankBadge = `<div class="w-10 h-10 md:w-14 md:h-14 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xl md:text-2xl shadow-sm border border-orange-200">3</div>`;
        else rankBadge = `<div class="w-10 h-10 md:w-14 md:h-14 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center font-bold text-lg border border-gray-100">${rank + 1}</div>`;

        const html = `
                            <div class="bg-white p-4 md:p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 md:gap-6 hover:shadow-md transition-shadow">
                                ${rankBadge}
                                <div class="text-4xl md:text-5xl bg-gray-50 rounded-xl p-2 md:p-3">${item.image}</div>
                                <div class="flex-1">
                                    <h3 class="text-lg md:text-2xl font-bold text-gray-800">${item.name}</h3>
                                    <p class="text-gray-500 text-sm md:text-base mt-1">Total ordered</p>
                                </div>
                                <div class="text-right">
                                    <span class="text-3xl md:text-4xl font-black text-cyan-500">${item.total_qty}</span>
                                    <span class="text-gray-400 font-medium ml-1">items</span>
                                </div>
                            </div>
                        `;
        container.insertAdjacentHTML('beforeend', html);
    });

    renderRankingPagination();
}

function goToRankingPage(page) {
    currentRankingPage = page;
    renderRankingPage();
    document.querySelector('#ranking-modal .custom-scrollbar').scrollTop = 0;
}

function renderRankingPagination() {
    const paginationContainer = document.getElementById('ranking-pagination');
    paginationContainer.innerHTML = '';

    const totalPages = Math.ceil(currentRankingData.length / RANKING_ITEMS_PER_PAGE);
    if (totalPages <= 1) return;

    let html = '';

    html += `<button onclick="goToRankingPage(${currentRankingPage - 1})" ${currentRankingPage === 1 ? 'disabled' : ''} class="w-8 h-8 flex items-center justify-center rounded-full ${currentRankingPage === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-200 transition-colors'}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
            </button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === currentRankingPage) {
            html += `<button class="w-8 h-8 flex items-center justify-center rounded-full bg-cyan-500 text-white font-bold shadow-sm">${i}</button>`;
        } else {
            html += `<button onclick="goToRankingPage(${i})" class="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:bg-gray-200 transition-colors font-medium">${i}</button>`;
        }
    }

    html += `<button onclick="goToRankingPage(${currentRankingPage + 1})" ${currentRankingPage === totalPages ? 'disabled' : ''} class="w-8 h-8 flex items-center justify-center rounded-full ${currentRankingPage === totalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-200 transition-colors'}">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            </button>`;

    paginationContainer.innerHTML = html;
}

function renderReviewsHTML(reviewsData) {
    const container = document.getElementById('review-list');
    container.innerHTML = '';

    if (reviewsData.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-20 text-gray-400">No reviews found for this period.</div>`;
        return;
    }

    reviewsData.forEach(review => {
        let starsHTML = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= review.rating) {
                starsHTML += `<svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>`;
            } else {
                starsHTML += `<svg class="w-5 h-5 text-gray-200" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>`;
            }
        }

        const dateStr = review.date.toLocaleDateString('th-TH');

        const html = `
                            <div class="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
                                <div class="flex justify-between items-start mb-4">
                                    <div class="flex items-center gap-3">
                                        <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-400 to-purple-400 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                                            ${review.customer_name.charAt(0)}
                                        </div>
                                        <div>
                                            <h4 class="font-bold text-gray-800">${review.customer_name}</h4>
                                            <p class="text-xs text-gray-400">${dateStr}</p>
                                        </div>
                                    </div>
                                    <div class="flex bg-gray-50 px-2 py-1 rounded-lg">
                                        ${starsHTML}
                                    </div>
                                </div>
                                <p class="text-gray-600 leading-relaxed italic flex-1">"${review.comment}"</p>
                            </div>
                        `;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    const content = modal.querySelector('.modal-enter');

    content.classList.remove('modal-enter');
    content.classList.add('modal-leave');

    setTimeout(() => {
        modal.classList.add('hidden');
        content.classList.remove('modal-leave');
        content.classList.add('modal-enter');
        document.body.style.overflow = '';
    }, 190);
}

function closeModalOutside(e, modalId) {
    if (e.target.id === modalId) {
        closeModal(modalId);
    }
}

document.addEventListener('click', function (e) {
    if (!document.getElementById('dropdown-wrapper').contains(e.target)) closeAll();
});

document.addEventListener('DOMContentLoaded', () => {
    selectToday();
});