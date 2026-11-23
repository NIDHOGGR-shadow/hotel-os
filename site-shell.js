/* Hotel OS — guest navigation and appearance, independent of payment state. */
(() => {
  'use strict';
  if (window.__hotelGuestShellLoaded) return;
  window.__hotelGuestShellLoaded = true;
  const ready = () => {
    const header = document.querySelector('#publicView .site-header, .masthead');
    if (!header) return;
    const host = document.getElementById('publicView') || document.body;
    const nav = header.querySelector('.nav');
    if (!nav) return;
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/site-shell.css';
    document.head.append(stylesheet);

    const choices = [
      {key:'linen', title:'Linen', caption:'Warm and welcoming'},
      {key:'graphite', title:'Graphite', caption:'Contemporary and calm'},
      {key:'pearl', title:'Pearl', caption:'Light and minimal'}
    ];
    const storage = 'hotel-os-appearance';
    const stored = () => {try{return localStorage.getItem(storage)}catch{return null}};
    const setTheme = (value, save = true) => {
      const key = choices.some(c => c.key === value) ? value : 'linen';
      document.documentElement.dataset.hotelTheme = key;
      document.querySelectorAll('[data-hotel-theme]').forEach(b => {
        b.setAttribute('aria-pressed', String(b.dataset.hotelTheme === key));
      });
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', key === 'graphite' ? '#171a1f' : key === 'pearl' ? '#f4f6f7' : '#201b1a');
      if (save) try {localStorage.setItem(storage, key)} catch {}
    };
    setTheme(stored() || 'linen', false);

    const routes = [
      {url:'/', label:'Home', icon:'⌂'},
      {url:'/rooms.html', label:'Rooms', icon:'▣'},
      {url:'/book.html', label:'Book', icon:'▤'},
      {url:'/dining.html', label:'Dining', icon:'♨'},
      {url:'/experiences.html', label:'Experiences'},
      {url:'/events.html', label:'Events'},
      {url:'/services.html', label:'Guest services'},
      {url:'/gallery.html', label:'Gallery'},
      {url:'/contact.html', label:'Contact'}
    ];
    const currentPath = location.pathname === '/index.html' ? '/' : location.pathname;
    const anchor = (item, klass) => {
      const a = document.createElement('a');
      a.href = item.url;
      a.className = klass;
      const span = document.createElement('span');
      span.textContent = item.label;
      a.append(span);
      if (item.icon) {
        const symbol = document.createElement('span');
        symbol.className = 'hotel-route-icon';
        symbol.setAttribute('aria-hidden','true');
        symbol.textContent = item.icon;
        a.prepend(symbol);
      }
      if (currentPath === item.url) a.setAttribute('aria-current', 'page');
      return a;
    };
    const desktop = nav.querySelector('.nav-links, .navlinks');
    if (desktop && !desktop.querySelector('a[href="/"]')) desktop.prepend(anchor(routes[0], ''));

    // The existing hamburger and the bottom navigation's "More" control open one drawer.
    const veil = document.createElement('div');
    veil.className = 'hotel-mobile-veil';
    veil.hidden = true;
    const drawer = document.createElement('nav');
    drawer.className = 'hotel-mobile-drawer';
    drawer.setAttribute('aria-label','Guest menu');
    drawer.id = 'hotelMobileDrawer';
    drawer.hidden = true;
    const drawerHead = document.createElement('div');
    drawerHead.className = 'hotel-drawer-head';
    const drawerTitle = document.createElement('strong');
    drawerTitle.textContent = 'Explore the hotel';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'hotel-close';
    close.textContent = '×';
    close.setAttribute('aria-label','Close menu');
    drawerHead.append(drawerTitle, close);
    drawer.append(drawerHead);
    routes.forEach(item => drawer.append(anchor(item, 'hotel-drawer-link')));
    const mobile = document.createElement('nav');
    mobile.className = 'hotel-bottom-nav';
    mobile.setAttribute('aria-label','Quick guest navigation');
    routes.slice(0,4).forEach(item => mobile.append(anchor(item, 'hotel-bottom-link')));
    const more = document.createElement('button');
    more.className = 'hotel-bottom-link hotel-more';
    more.type = 'button';
    more.setAttribute('aria-controls', drawer.id);
    more.setAttribute('aria-expanded','false');
    const moreIcon = document.createElement('span');
    moreIcon.className = 'hotel-route-icon';
    moreIcon.setAttribute('aria-hidden','true');
    moreIcon.textContent = '☰';
    const moreText = document.createElement('span');
    moreText.textContent = 'More';
    more.append(moreIcon, moreText);
    mobile.append(more);
    host.append(veil, drawer, mobile);

    const hamburger = nav.querySelector('#mobileToggle, [data-menu]');
    if (hamburger) hamburger.setAttribute('aria-controls',drawer.id);
    let lastOpener=more;
    const openMenu = (trigger=more) => {
      lastOpener=trigger;
      drawer.hidden = false;
      veil.hidden = false;
      more.setAttribute('aria-expanded','true');
      if (hamburger) hamburger.setAttribute('aria-expanded','true');
      document.body.classList.add('hotel-drawer-open');
      close.focus();
    };
    const closeMenu = (restoreFocus=false) => {
      drawer.hidden = true;
      veil.hidden = true;
      more.setAttribute('aria-expanded','false');
      if (hamburger) hamburger.setAttribute('aria-expanded','false');
      document.body.classList.remove('hotel-drawer-open');
      if(restoreFocus && lastOpener && lastOpener.isConnected) lastOpener.focus();
    };
    more.addEventListener('click', () => drawer.hidden ? openMenu(more) : closeMenu(true));
    close.addEventListener('click', () => closeMenu(true));
    veil.addEventListener('click', () => closeMenu());
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !drawer.hidden) closeMenu(true);
    });
    // Capture prevents the legacy menu from opening on top of the new drawer.
    if (hamburger) hamburger.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      drawer.hidden ? openMenu(hamburger) : closeMenu(true);
    }, true);

    const picker = document.createElement('div');
    picker.className = 'hotel-theme-picker';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'hotel-theme-toggle';
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-controls','hotelThemePanel');
    toggle.setAttribute('aria-label','Change appearance');
    const dot = document.createElement('span');
    dot.className = 'hotel-theme-dot';
    dot.setAttribute('aria-hidden','true');
    const toggleLabel = document.createElement('span');
    toggleLabel.className = 'hotel-theme-label';
    toggleLabel.textContent = 'Appearance';
    toggle.append(dot, toggleLabel);
    const palette = document.createElement('section');
    palette.id = 'hotelThemePanel';
    palette.className = 'hotel-theme-panel';
    palette.hidden = true;
    palette.setAttribute('aria-label','Appearance choices');
    const heading = document.createElement('strong');
    heading.textContent = 'Choose your atmosphere';
    palette.append(heading);
    choices.forEach(choice => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hotel-theme-choice';
      b.dataset.hotelTheme = choice.key;
      const swatch = document.createElement('span');
      swatch.className = 'hotel-swatch hotel-swatch-' + choice.key;
      swatch.setAttribute('aria-hidden','true');
      const text = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = choice.title;
      const desc = document.createElement('small');
      desc.textContent = choice.caption;
      text.append(title, desc);
      b.append(swatch, text);
      b.addEventListener('click', () => {setTheme(choice.key);palette.hidden = true;toggle.setAttribute('aria-expanded','false')});
      palette.append(b);
    });
    picker.append(toggle, palette);
    const actions = nav.querySelector('.nav-actions');
    if (actions) actions.prepend(picker);
    else if (hamburger) hamburger.before(picker);
    else nav.append(picker);
    toggle.addEventListener('click', () => {
      palette.hidden = !palette.hidden;
      toggle.setAttribute('aria-expanded',String(!palette.hidden));
    });
    document.addEventListener('click', e => {
      if (!picker.contains(e.target) && !palette.hidden) {
        palette.hidden = true;
        toggle.setAttribute('aria-expanded','false');
      }
    });
    setTheme(document.documentElement.dataset.hotelTheme, false);
    const desktop = matchMedia('(min-width: 1101px)');
    const phone = matchMedia('(max-width: 600px)');
    const onBreakpointChange = () => closeMenu();
    if (desktop.addEventListener) desktop.addEventListener('change',onBreakpointChange);
    if (phone.addEventListener) phone.addEventListener('change',onBreakpointChange);
    if (desktop.matches) closeMenu();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',ready,{once:true});
  else ready();
})();
