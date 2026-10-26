/*!
 * MJ Lernförderung – Google Ads Conversion Tracking
 * ---------------------------------------------------------------------------
 * Zweck:
 *   1. Google-Tag (gtag.js) laden – ERST nach Einwilligung (Opt-in).
 *      Ohne Einwilligung geht kein einziger Request an Google-Server.
 *   2. Consent-Banner (Opt-in) für Marketing-Cookies anzeigen und verwalten.
 *   3. Jede Anfrage als Google-Ads-Conversion melden:
 *        • Klick auf einen tel:-Link          → Conversion "Anruf-Klick"
 *        • Klick auf einen WhatsApp-Button    → Conversion "WhatsApp-Anfrage"
 *        • Absenden des Kontaktformulars      → Conversion "Formular-Anfrage"
 *
 * Einbindung: EIN Script-Tag im <head> jeder Seite:
 *   <script src="/js/tracking.js" defer></script>
 *
 * Die Datei ist idempotent: Mehrfache Einbindung lädt das Tag nicht doppelt.
 * Es werden keine externen Bibliotheken benötigt (nur gtag.js von Google).
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════
   * KONFIGURATION
   * ═══════════════════════════════════════════════════════════════════════ */

  /** true = Diagnose-Ausgaben in der Browser-Konsole (nur zum Testen!). */
  var DEBUG = false;

  /** Google Ads Tag-ID (aus dem Google-Ads-Konto – nicht ändern). */
  var ADS_ID = 'AW-18245035082';

  /** Conversion-Aktion "Anruf-Klick" (aus dem Google-Ads-Konto – nicht ändern). */
  var CALL_CONVERSION_SEND_TO = 'AW-18245035082/6IkDCIz2ltwcEMrI9PtD';

  /** Conversion-Aktion "WhatsApp-Anfrage" (Kategorie Kontakt – nicht ändern). */
  var WHATSAPP_CONVERSION_SEND_TO = 'AW-18245035082/r913CNCXwuYcEMrI9PtD';

  /** Conversion-Aktion "Formular-Anfrage" (Kategorie Lead-Formular – nicht ändern). */
  var FORM_CONVERSION_SEND_TO = 'AW-18245035082/tjZhCNOXwuYcEMrI9PtD';

  /** Selektor des Kontaktformulars. */
  var FORM_SELECTOR = '#kontakt-form';

  /** URL der gtag.js-Bibliothek. */
  var GTAG_SRC = 'https://www.googletagmanager.com/gtag/js?id=' + ADS_ID;

  /** localStorage-Schlüssel für die Consent-Entscheidung ('granted' | 'denied'). */
  var CONSENT_KEY = 'mj-consent-marketing';

  /** Sperrzeit pro Telefonnummer, um Doppelzählung bei Mehrfachklick zu verhindern. */
  var CLICK_GUARD_MS = 1000;

  /**
   * Sperrzeit pro Anfrage-Kanal (Standard: 30 Minuten, gilt pro Browser-Tab).
   * Verhindert, dass ein Besucher, der nacheinander mehrere WhatsApp-Buttons
   * antippt, in Google Ads als mehrere Anfragen gezählt wird.
   */
  var LEAD_GUARD_MS = 30 * 60 * 1000;

  /** Link zur Datenschutzerklärung im Consent-Banner. */
  var PRIVACY_URL = '/datenschutz/';

  /** Cookies, die Google Ads auf der eigenen Domain setzt (werden beim Widerruf gelöscht). */
  var GOOGLE_COOKIE_PATTERN = /^(_gcl_|_gac_)/;

  /** Elemente mit diesem Attribut öffnen die Cookie-Einstellungen (z.B. Footer-Link). */
  var SETTINGS_TRIGGER_SELECTOR = '[data-cookie-settings]';

  /* ═══════════════════════════════════════════════════════════════════════
   * IDEMPOTENZ – bricht ab, falls die Datei bereits einmal ausgeführt wurde
   * ═══════════════════════════════════════════════════════════════════════ */

  if (window.mjTracking) {
    log('bereits initialisiert – Abbruch (kein doppeltes Tag)');
    return;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * HILFSFUNKTIONEN
   * ═══════════════════════════════════════════════════════════════════════ */

  function log() {
    if (!DEBUG || !window.console) return;
    var args = Array.prototype.slice.call(arguments);
    console.log.apply(console, ['[MJ Tracking]'].concat(args));
  }

  /**
   * Liest die gespeicherte Consent-Entscheidung.
   * @returns {'granted'|'denied'|null} null = noch keine Entscheidung getroffen.
   */
  function readStoredConsent() {
    try {
      var value = window.localStorage.getItem(CONSENT_KEY);
      return value === 'granted' || value === 'denied' ? value : null;
    } catch (e) {
      // localStorage kann blockiert sein (Private Mode, strenge Browser-Einstellungen).
      log('localStorage nicht lesbar:', e && e.message);
      return null;
    }
  }

  /**
   * Speichert die Consent-Entscheidung dauerhaft.
   * @param {'granted'|'denied'} value
   */
  function storeConsent(value) {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch (e) {
      // Nicht kritisch: Ohne Speicher wird beim nächsten Besuch erneut gefragt.
      log('localStorage nicht schreibbar:', e && e.message);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * 1) GOOGLE-TAG BOOTSTRAP + CONSENT MODE V2
   * ═══════════════════════════════════════════════════════════════════════ */

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  // gtag global verfügbar machen (z.B. für weitere Conversions oder Debugging).
  if (typeof window.gtag !== 'function') {
    window.gtag = gtag;
  }

  // Rein lokale Warteschlange: Solange gtag.js nicht geladen ist, landen alle
  // Befehle nur im dataLayer dieses Tabs – es verlässt nichts den Browser.
  // Zusätzlich gilt Consent Mode v2: Standard ist ALLES verweigert.
  gtag('consent', 'default', {
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'wait_for_update': 500
  });

  /** true, sobald gtag.js in diesem Seitenaufruf aktiviert wurde. */
  var googleTagActive = false;

  // Früher erteilte Zustimmung wiederherstellen und NUR DANN gtag.js laden.
  // Ohne gespeichertes 'granted' wird gtag.js erst in grantMarketingConsent() geladen.
  var storedConsent = readStoredConsent();
  if (storedConsent === 'granted') {
    pushConsentUpdate('granted');
    activateGoogleTag();
  }

  /**
   * Konfiguriert das Google-Tag und lädt gtag.js – darf nur mit Einwilligung
   * aufgerufen werden. Mehrfachaufrufe sind wirkungslos.
   */
  function activateGoogleTag() {
    if (googleTagActive) return;
    googleTagActive = true;
    gtag('js', new Date());
    gtag('config', ADS_ID);
    loadGtagScript();
  }

  /**
   * Bindet die gtag.js-Bibliothek asynchron ein (nur einmal pro Seite).
   */
  function loadGtagScript() {
    var existing = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
    if (existing) {
      log('gtag.js bereits im Dokument – kein zweites Tag eingebunden');
      return;
    }
    var script = document.createElement('script');
    script.async = true;
    script.src = GTAG_SRC;
    document.head.appendChild(script);
    log('gtag.js eingebunden:', GTAG_SRC);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * 2) CONSENT-VERWALTUNG
   * ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Sendet ein consent-update an Google. Erzeugt bei jedem Aufruf ein neues
   * Objekt (keine Mutation eines gemeinsamen Zustands).
   * @param {'granted'|'denied'} state
   */
  function pushConsentUpdate(state) {
    gtag('consent', 'update', {
      'ad_storage': state,
      'ad_user_data': state,
      'ad_personalization': state,
      'analytics_storage': state
    });
    log('consent update →', state);
  }

  /**
   * Zustimmung zu Marketing-Cookies erteilen.
   *
   * ÖFFENTLICHE API – muss von jedem Cookie-Banner / CMP aufgerufen werden,
   * sobald die Nutzerin oder der Nutzer Marketing-Cookies akzeptiert:
   *
   *     window.grantMarketingConsent();
   *
   * Das mitgelieferte Banner (siehe unten) ruft die Funktion bereits auf.
   * Wird später eine externe CMP (z.B. Cookiebot, Usercentrics, Borlabs)
   * eingebaut, muss diese Funktion in deren "Marketing akzeptiert"-Callback
   * aufgerufen werden – dann kann das eingebaute Banner entfernt werden
   * (Konstante SHOW_BUILTIN_BANNER auf false setzen).
   */
  function grantMarketingConsent() {
    storeConsent('granted');
    pushConsentUpdate('granted');
    activateGoogleTag();
    hideBanner();
  }

  /**
   * Zustimmung ablehnen bzw. widerrufen (Art. 7 Abs. 3 DSGVO).
   * ÖFFENTLICHE API: window.denyMarketingConsent();
   *
   * Bei einem Widerruf (gtag.js lief bereits in diesem Tab) werden die
   * Google-Cookies gelöscht und die Seite neu geladen, damit gtag.js
   * vollständig aus dem Speicher verschwindet.
   */
  function denyMarketingConsent() {
    storeConsent('denied');
    pushConsentUpdate('denied');
    deleteGoogleCookies();
    hideBanner();
    if (googleTagActive) {
      log('Widerruf – Seite wird neu geladen, um gtag.js zu entfernen');
      window.location.reload();
    }
  }

  /**
   * Liefert alle Domains, unter denen ein Cookie für diesen Host gesetzt sein
   * kann (z.B. www.example.de → www.example.de, example.de).
   * @returns {string[]}
   */
  function cookieDomainCandidates() {
    var parts = window.location.hostname.split('.');
    var domains = [];
    for (var i = 0; i < parts.length - 1; i++) {
      domains.push(parts.slice(i).join('.'));
    }
    return domains;
  }

  /** Löscht _gcl_*- und _gac_*-Cookies der eigenen Domain. */
  function deleteGoogleCookies() {
    var expired = '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    var domains = cookieDomainCandidates();
    document.cookie.split(';').forEach(function (entry) {
      var name = entry.split('=')[0].trim();
      if (!GOOGLE_COOKIE_PATTERN.test(name)) return;
      document.cookie = name + expired;
      domains.forEach(function (domain) {
        document.cookie = name + expired + '; domain=.' + domain;
      });
      log('Cookie gelöscht:', name);
    });
  }

  /**
   * @returns {boolean} true, wenn Marketing-Consent aktuell erteilt ist.
   */
  function hasMarketingConsent() {
    return readStoredConsent() === 'granted';
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * 3) CONSENT-BANNER (einfache, eigene Lösung – keine externe Library)
   * ═══════════════════════════════════════════════════════════════════════ */

  /** Auf false setzen, sobald eine externe CMP das Banner übernimmt. */
  var SHOW_BUILTIN_BANNER = true;

  var bannerEl = null;

  /**
   * Baut das Banner und zeigt es an, solange noch keine Entscheidung vorliegt.
   * Nutzt die bestehenden CSS-Klassen aus style.css.
   * @param {boolean} [force] true = auch bei bestehender Entscheidung anzeigen
   *                          (Aufruf über "Cookie-Einstellungen").
   */
  function renderBanner(force) {
    if (!SHOW_BUILTIN_BANNER) return;
    if (!force && readStoredConsent() !== null) return; // Entscheidung liegt bereits vor
    if (document.getElementById('cookie-banner')) return; // schon vorhanden

    var banner = document.createElement('div');
    banner.className = 'cookie-banner';
    banner.id = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie-Einstellungen');

    var inner = document.createElement('div');
    inner.className = 'cookie-inner';

    var text = document.createElement('p');
    text.innerHTML =
      '🍪 Wir verwenden technisch notwendige Cookies sowie – nur mit Ihrer ' +
      'Einwilligung – Cookies von Google Ads, um die Wirksamkeit unserer ' +
      'Werbeanzeigen zu messen. Ihre Auswahl können Sie jederzeit über ' +
      '„Cookie-Einstellungen“ unten auf der Seite ändern. ' +
      'Mehr dazu in unserer <a href="' + PRIVACY_URL + '">Datenschutzerklärung</a>.';

    var actions = document.createElement('div');
    actions.className = 'cookie-actions';

    var declineBtn = document.createElement('button');
    declineBtn.type = 'button';
    declineBtn.className = 'cookie-decline';
    declineBtn.id = 'cookie-decline';
    declineBtn.textContent = 'Nur notwendige';
    declineBtn.addEventListener('click', denyMarketingConsent);

    var acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.className = 'cookie-accept';
    acceptBtn.id = 'cookie-accept';
    acceptBtn.textContent = 'Alle akzeptieren';
    acceptBtn.addEventListener('click', grantMarketingConsent);

    actions.appendChild(declineBtn);
    actions.appendChild(acceptBtn);
    inner.appendChild(text);
    inner.appendChild(actions);
    banner.appendChild(inner);
    document.body.appendChild(banner);
    banner.classList.add('show');
    // Blendet den schwebenden WhatsApp-Button aus (siehe style.css),
    // damit er die Buttons des Banners auf dem Handy nicht überdeckt.
    document.body.classList.add('consent-banner-open');

    bannerEl = banner;
    // Bei bewusstem Öffnen (Footer-Link) Tastaturfokus ins Banner setzen.
    if (force) declineBtn.focus();
    log('Consent-Banner angezeigt');
  }

  function hideBanner() {
    var banner = bannerEl || document.getElementById('cookie-banner');
    if (banner) banner.classList.remove('show');
    document.body.classList.remove('consent-banner-open');
  }

  /**
   * Blendet das Banner erneut ein, damit die Entscheidung geändert werden kann.
   * Die bisherige Entscheidung bleibt gültig, bis eine neue getroffen wird –
   * nur so lässt sich ein Wechsel granted → denied als Widerruf erkennen.
   * ÖFFENTLICHE API (z.B. für einen Link "Cookie-Einstellungen" im Footer):
   *     window.mjTracking.showConsentBanner();
   */
  function showConsentBanner() {
    var existing = document.getElementById('cookie-banner');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    bannerEl = null;
    renderBanner(true);
  }

  /**
   * Delegierter Listener für alle "Cookie-Einstellungen"-Auslöser – greift
   * auch beim Footer, der erst nachträglich per Partial ins DOM kommt.
   */
  function handleSettingsClick(event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (!target.closest(SETTINGS_TRIGGER_SELECTOR)) return;
    event.preventDefault();
    showConsentBanner();
  }

  document.addEventListener('click', handleSettingsClick);

  /* ═══════════════════════════════════════════════════════════════════════
   * 4) CONVERSION-TRACKING FÜR ANFRAGEN (Anruf, WhatsApp, Formular)
   * ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Merkt sich pro Telefonnummer den Zeitpunkt der letzten gemeldeten Conversion.
   * @type {Object<string, number>}
   */
  var lastFiredAt = {};

  /**
   * Prüft die Sperrzeit und aktualisiert den Zeitstempel.
   * @param {string} href z.B. "tel:+4915256352575"
   * @returns {boolean} true = darf gefeuert werden.
   */
  function passesClickGuard(href) {
    var now = Date.now();
    var previous = lastFiredAt[href] || 0;
    if (now - previous < CLICK_GUARD_MS) return false;

    // Neues Objekt statt In-Place-Mutation der bestehenden Map.
    var next = {};
    for (var key in lastFiredAt) {
      if (Object.prototype.hasOwnProperty.call(lastFiredAt, key)) {
        next[key] = lastFiredAt[key];
      }
    }
    next[href] = now;
    lastFiredAt = next;
    return true;
  }

  /**
   * Sperrzeit pro Anfrage-Kanal. Nutzt sessionStorage, damit die Zählung auch
   * über einen Seitenwechsel hinweg greift; fällt bei blockiertem Speicher
   * (Private Mode) auf einen In-Memory-Speicher zurück.
   * @param {string} channel 'whatsapp' | 'formular'
   * @returns {boolean} true = darf gefeuert werden.
   */
  var leadGuardMemory = {};

  function passesLeadGuard(channel) {
    var storageKey = 'mj-conv-' + channel;
    var now = Date.now();
    var previous;

    try {
      previous = parseInt(window.sessionStorage.getItem(storageKey), 10);
    } catch (e) {
      previous = leadGuardMemory[storageKey];
    }

    if (previous && now - previous < LEAD_GUARD_MS) return false;

    try {
      window.sessionStorage.setItem(storageKey, String(now));
    } catch (e) {
      leadGuardMemory[storageKey] = now;
    }
    return true;
  }

  /** Noch nicht eingetragene Labels dürfen nichts senden. */
  function isConfigured(sendTo) {
    return typeof sendTo === 'string' && sendTo.indexOf('HIER_LABEL') === -1;
  }

  /**
   * Meldet eine Conversion an Google Ads.
   * @param {string} sendTo  send_to-Wert der Conversion-Aktion
   * @param {string} channel Kanalname für Log und Sperrzeit
   */
  function fireConversion(sendTo, channel) {
    if (!isConfigured(sendTo)) {
      log(channel, '– Label noch nicht eingetragen, nichts gesendet');
      return;
    }
    gtag('event', 'conversion', { 'send_to': sendTo });
    log(channel, '– Conversion gesendet');
  }

  /** Erkennt WhatsApp-Links (wa.me, api./web.whatsapp.com, whatsapp://). */
  var WHATSAPP_PATTERN = /wa\.me\/|whatsapp\.com\/(?:send|message)|^whatsapp:/i;

  /**
   * Ein einziger delegierter Listener auf document – erfasst dadurch auch
   * Links, die erst später ins DOM kommen (z.B. Header-/Footer-Partials).
   * Es wird bewusst KEIN preventDefault() aufgerufen, damit Anruf bzw.
   * WhatsApp normal starten.
   */
  function handleDocumentClick(event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;

    var link = target.closest('a[href]');
    if (!link) return;

    var href = link.getAttribute('href') || '';
    var isCall = href.indexOf('tel:') === 0;
    var isWhatsApp = WHATSAPP_PATTERN.test(href);
    if (!isCall && !isWhatsApp) return;

    if (!hasMarketingConsent()) {
      log('Klick auf', href, '– keine Conversion (keine Einwilligung)');
      return;
    }

    if (isCall) {
      if (!passesClickGuard(href)) {
        log('Klick auf', href, '– unterdrückt (Sperrzeit', CLICK_GUARD_MS + 'ms)');
        return;
      }
      fireConversion(CALL_CONVERSION_SEND_TO, 'anruf');
      return;
    }

    if (!passesLeadGuard('whatsapp')) {
      log('Klick auf', href, '– unterdrückt (Sperrzeit', LEAD_GUARD_MS + 'ms)');
      return;
    }
    fireConversion(WHATSAPP_CONVERSION_SEND_TO, 'whatsapp');
  }

  // capture: true → wird auch dann ausgelöst, wenn ein anderer Handler
  // die Weitergabe des Events stoppt.
  document.addEventListener('click', handleDocumentClick, true);

  /**
   * Meldet eine Formular-Anfrage. Wird von main.js aufgerufen, sobald
   * Formspree eine erfolgreiche Antwort geliefert hat:
   *
   *     window.mjTracking.formLead();
   *
   * Zusätzlich hängt sich unten ein Fallback an das submit-Event, falls
   * main.js den Aufruf (noch) nicht enthält. Die Sperrzeit verhindert, dass
   * beide Wege zusammen doppelt zählen.
   */
  function formLead() {
    if (!hasMarketingConsent()) {
      log('Formular – keine Conversion (keine Einwilligung)');
      return;
    }
    if (!passesLeadGuard('formular')) {
      log('Formular – unterdrückt (Sperrzeit)');
      return;
    }
    fireConversion(FORM_CONVERSION_SEND_TO, 'formular');
  }

  var formObserver = null;

  function bindForm() {
    var form = document.querySelector(FORM_SELECTOR);
    if (!form || form.getAttribute('data-mj-conv-bound') === '1') return;
    form.setAttribute('data-mj-conv-bound', '1');
    form.addEventListener('submit', formLead);
    if (formObserver) formObserver.disconnect();
    log('Formular gebunden:', FORM_SELECTOR);
  }

  // Das Formular kann – wie Header und Footer – per Partial nachgeladen werden.
  if (typeof MutationObserver === 'function') {
    formObserver = new MutationObserver(bindForm);
    formObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * INITIALISIERUNG + ÖFFENTLICHE API
   * ═══════════════════════════════════════════════════════════════════════ */

  function init() {
    renderBanner();
    bindForm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.grantMarketingConsent = grantMarketingConsent;
  window.denyMarketingConsent = denyMarketingConsent;
  window.mjTracking = {
    grantMarketingConsent: grantMarketingConsent,
    denyMarketingConsent: denyMarketingConsent,
    hasMarketingConsent: hasMarketingConsent,
    showConsentBanner: showConsentBanner,
    formLead: formLead,
    /** Sperrzeiten zurücksetzen – nur zum Testen. */
    resetLeadGuards: function () {
      ['whatsapp', 'formular'].forEach(function (channel) {
        try { window.sessionStorage.removeItem('mj-conv-' + channel); } catch (e) {}
        delete leadGuardMemory['mj-conv-' + channel];
      });
    }
  };

  log('initialisiert – Consent:', storedConsent === null ? 'offen' : storedConsent);
})();
