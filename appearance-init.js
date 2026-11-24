// Apply the persisted guest theme before the first paint.
(()=>{let theme='linen';try{const saved=localStorage.getItem('hotel-os-appearance');if(['linen','graphite','pearl'].includes(saved))theme=saved}catch{}document.documentElement.dataset.hotelTheme=theme;})();
