document.addEventListener('DOMContentLoaded', () => {
    fetchOrderHistory();
});

async function fetchOrderHistory() {
    try {
        const response = await fetch('/api/admin/order/history');
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

function logout() {
    // วิ่งไปที่ Route logout โดยตรง Browser จะจัดการเปลี่ยนหน้าตาม res.redirect('/') เอง
    window.location.href = '/logout';
}