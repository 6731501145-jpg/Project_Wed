document.addEventListener('DOMContentLoaded', () => {
    fetchOrderNow();
});

async function fetchOrderNow() {
    try {
        const response = await fetch('/api/admin/order/now');
        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`);
        }
        const orders = await response.json();
        renderOrderNow(orders);
    } catch (error) {
        console.error('Error fetching order now:', error);
        document.getElementById('order-now-list').innerHTML = `
                    <tr><td colspan="4" class="py-8 text-red-500 text-lg">❌ Failed to load data. Please try again.</td></tr>
                `;
    }
}

function renderOrderNow(orders) {
    const tbody = document.getElementById('order-now-list');
    tbody.innerHTML = '';

    if (!orders || orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-10 text-gray-400 text-lg">No orders at the moment.</td></tr>`;
        return;
    }

    orders.forEach(order => {
        const dateObj = new Date(order.time);
        const timeStr = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        let statusText = order.status;
        let statusClass = "text-gray-700";

        if (order.status === 'serving' || order.status === 'paid') {
            statusText = 'Done';
            statusClass = 'font-bold text-gray-800';
        } else if (order.status === 'cooking') {
            statusText = 'Cooking';
            statusClass = 'text-gray-700';
        } else {
            statusText = 'Pending';
            statusClass = 'text-orange-500';
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 transition-colors';
        tr.innerHTML = `
                    <td class="py-5 px-4 text-base md:text-xl font-medium max-w-[200px] truncate" title="${order.menu_names}">
                        ${order.menu_names || '-'}
                    </td>
                    <td class="py-5 px-4 text-base md:text-xl font-medium">${timeStr}</td>
                    <td class="py-5 px-4 text-base md:text-xl font-medium">${order.table_num || '-'}</td>
                    <td class="py-5 px-4 text-base md:text-xl ${statusClass}">${statusText}</td>
                `;
        tbody.appendChild(tr);
    });
}

function logout() {
    // วิ่งไปที่ Route logout โดยตรง Browser จะจัดการเปลี่ยนหน้าตาม res.redirect('/') เอง
    window.location.href = '/logout';
}