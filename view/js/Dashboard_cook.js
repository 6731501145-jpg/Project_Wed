// ==========================================
// FETCH DATA FROM BACKEND API
// ==========================================
async function fetchLiveDashboardData() {
    try {
        const [orderRes, topMenusRes, reviewRes] = await Promise.all([
            fetch('/api/cook/order/today'),
            fetch('/api/cook/top-menus/today'),
            fetch('/api/cook/review/today')
        ]);

        if (!orderRes.ok || !topMenusRes.ok || !reviewRes.ok) {
            throw new Error("One or more APIs returned an error status.");
        }

        const orderData = await orderRes.json();
        const rankingArray = await topMenusRes.json();
        const recentReviews = await reviewRes.json();

        document.getElementById('stat-orders-count').textContent = orderData.total_qty || 0;

        renderRankingPreview(rankingArray.slice(0, 3));
        renderRankingHTML(rankingArray);

        recentReviews.forEach(review => {
            review.date = new Date(review.date);
            review.rating = parseFloat(review.rating);
        });

        renderReviewsPreview(recentReviews.slice(0, 3));
        renderReviewsHTML(recentReviews);

    } catch (error) {
        console.error("Error fetching live data from APIs:", error);
    }
}

// ==========================================
// HELPER: render image or fallback emoji
// ==========================================
function renderMenuImage(imageUrl, sizeClass = 'w-10 h-10') {
    if (imageUrl) {
        return `<img src="${imageUrl}" alt="menu image"
                    class="${sizeClass} object-cover rounded-xl"
                    onerror="this.outerHTML='<span class=\\'text-2xl\\'>🍽️</span>'" />`;
    }
    return `<span class="text-2xl">🍽️</span>`;
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    fetchLiveDashboardData();
    setInterval(fetchLiveDashboardData, 10000);
});

// ==========================================
// UI RENDERING: DASHBOARD PREVIEWS
// ==========================================
function renderRankingPreview(rankingData) {
    const container = document.getElementById('dashboard-ranking-preview');
    container.innerHTML = '';

    if (rankingData.length === 0) {
        container.innerHTML = `<div class="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100 h-full flex items-center justify-center">No orders currently.</div>`;
        return;
    }

    rankingData.forEach((item, index) => {
        let badgeClass = index === 0 ? 'bg-yellow-100 text-yellow-600 border-yellow-200' : index === 1 ? 'bg-gray-200 text-gray-600 border-gray-300' : 'bg-orange-100 text-orange-700 border-orange-200';
        const html = `
            <div class="bg-white p-3 md:p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-gray-50">
                <div class="w-10 h-10 rounded-full ${badgeClass} border flex items-center justify-center font-bold text-lg shrink-0">${index + 1}</div>
                <div class="shrink-0">${renderMenuImage(item.image, 'w-10 h-10')}</div>
                <div class="flex-1 overflow-hidden">
                    <h4 class="font-bold text-gray-800 text-sm md:text-base capitalize truncate">${item.name}</h4>
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
        container.innerHTML = `<div class="text-center py-10 text-gray-400 bg-white rounded-2xl border border-gray-100 h-full flex items-center justify-center">No reviews available.</div>`;
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
                        <div class="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-400 to-purple-400 text-white flex items-center justify-center font-bold text-xs shrink-0">${review.customer_name.charAt(0).toUpperCase()}</div>
                        <h4 class="font-bold text-xs md:text-sm text-gray-800 truncate max-w-[100px] md:max-w-[150px]">${review.customer_name}</h4>
                    </div>
                    <div class="flex">${starsHTML}</div>
                </div>
                <p class="text-xs md:text-sm text-gray-600 truncate italic">"${review.comment}"</p>
            </div>`;
        container.insertAdjacentHTML('beforeend', html);
    });
}

// ==========================================
// UI RENDERING: MODALS
// ==========================================
function renderRankingHTML(rankingData) {
    const container = document.getElementById('ranking-list');
    container.innerHTML = '';

    if (rankingData.length === 0) {
        container.innerHTML = `<div class="text-center py-20 text-gray-400">No pending items.</div>`;
        return;
    }

    rankingData.forEach((item, index) => {
        let rankBadge = '';
        if (index === 0) rankBadge = `<div class="w-10 h-10 md:w-14 md:h-14 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center font-bold text-xl md:text-2xl shadow-sm border border-yellow-200">1</div>`;
        else if (index === 1) rankBadge = `<div class="w-10 h-10 md:w-14 md:h-14 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center font-bold text-xl md:text-2xl shadow-sm border border-gray-300">2</div>`;
        else if (index === 2) rankBadge = `<div class="w-10 h-10 md:w-14 md:h-14 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xl md:text-2xl shadow-sm border border-orange-200">3</div>`;
        else rankBadge = `<div class="w-10 h-10 md:w-14 md:h-14 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center font-bold text-lg border border-gray-100">${index + 1}</div>`;

        const html = `
            <div class="bg-white p-4 md:p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4 md:gap-6 hover:shadow-md transition-shadow">
                ${rankBadge}
                <div class="bg-gray-50 rounded-xl p-2 md:p-3 shrink-0">${renderMenuImage(item.image, 'w-10 h-10 md:w-12 md:h-12')}</div>
                <div class="flex-1">
                    <h3 class="text-lg md:text-2xl font-bold text-gray-800 capitalize">${item.name}</h3>
                    <p class="text-gray-500 text-sm md:text-base mt-1">Pending to cook</p>
                </div>
                <div class="text-right">
                    <span class="text-3xl md:text-4xl font-black text-cyan-500">${item.total_qty}</span>
                    <span class="text-gray-400 font-medium ml-1">items</span>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function renderReviewsHTML(reviewsData) {
    const container = document.getElementById('review-list');
    container.innerHTML = '';

    if (reviewsData.length === 0) {
        container.innerHTML = `<div class="col-span-full text-center py-20 text-gray-400">No reviews found.</div>`;
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
                            ${review.customer_name.charAt(0).toUpperCase()}
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

// ==========================================
// MODAL CONTROLS
// ==========================================
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
    if (e.target.id === modalId) closeModal(modalId);
}

function logout() {
    // วิ่งไปที่ Route logout โดยตรง Browser จะจัดการเปลี่ยนหน้าตาม res.redirect('/') เอง
    window.location.href = '/logout';
}
// ตรวจสอบ Session ทุกครั้งที่โหลดหน้า
async function checkAuth() {
    try {
        const res = await fetch('/user/info');
        if (!res.ok) {
            // ถ้า Status ไม่ใช่ 200 (เช่น 401) ให้ดีดไปหน้า login
            window.location.href = '/';
        }
    } catch (err) {
        window.location.href = '/';
    }
}

// เรียกใช้ทันทีที่เปิดหน้า
checkAuth();
