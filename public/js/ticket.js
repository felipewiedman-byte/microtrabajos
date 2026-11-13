document.getElementById('pr').onclick = () => window.print(); if (/[?&]auto=1/.test(location.search)) window.addEventListener('load', () => setTimeout(() => window.print(), 250));
