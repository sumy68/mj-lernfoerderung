/*!
 * MJ Lernförderung – Google Ads Conversion Tracking
 * ---------------------------------------------------------------------------
 * Zweck:
 *   1. Google-Tag (gtag.js) laden – DSGVO-konform mit Consent Mode v2.
 *   2. Consent-Banner (Opt-in) für Marketing-Cookies anzeigen und verwalten.
 *   3. Jeden Klick auf einen tel:-Link als Google-Ads-Conversion melden.
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

  /** URL der gtag.js-Bibliothek. */
  var GTAG_SRC = 'https://www.googletagmanager.com/gtag/js?id=' + ADS_ID;

  /** localStorage-Schlüssel für die Consent-Entscheidung ('granted' | 'denied'). */
  var CONSENT_KEY = 'mj-consent-marketing';

  /** Sperrzeit pro Telefonnummer, um Doppelzählung bei Mehrfachklick zu verhindern. */
  var CLICK_GUARD_MS = 1000;

  /** Link zur Datenschutzerklärung im Consent-Banner. */
  var PRIVACY_URL = '/datenschutz/';

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

  // DSGVO: Vor jeder Zustimmung ist ALLES verweigert. Google setzt in diesem
  // Zustand keine Werbe-Cookies und überträgt keine personenbezogenen Ad-Daten.
  gtag('consent', 'default', {
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'wait_for_update': 500
  });

  // Früher erteilte Zustimmung sofort wiederherstellen – noch bevor gtag.js lädt,
  // damit innerhalb des wait_for_update-Fensters bereits der korrekte Status steht.
  var storedConsent = readStoredConsent();
  if (storedConsent === 'granted') {
    pushConsentUpdate('granted');
  }

  gtag('js', new Date());
  gtag('config', ADS_ID);

  // gtag.js nachladen – nur, wenn das Tag nicht bereits im Dokument steht.
  loadGtagScript();

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
    hideBanner();
  }

  /**
   * Zustimmung ablehnen bzw. widerrufen (Art. 7 Abs. 3 DSGVO).
   * ÖFFENTLICHE API: window.denyMarketingConsent();
   */
  function denyMarketingConsent() {
    storeConsent('denied');
    pushConsentUpdate('denied');
    hideBanner();
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
   */
  function renderBanner() {
    if (!SHOW_BUILTIN_BANNER) return;
    if (readStoredConsent() !== null) return;      // Entscheidung liegt bereits vor
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
      'Werbeanzeigen zu messen. Sie können Ihre Auswahl jederzeit ändern. ' +
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
    log('Consent-Banner angezeigt');
  }

  function hideBanner() {
    var banner = bannerEl || document.getElementById('cookie-banner');
    if (banner) banner.classList.remove('show');
    document.body.classList.remove('consent-banner-open');
  }

  /**
   * Blendet das Banner erneut ein, damit die Entscheidung geändert werden kann.
   * ÖFFENTLICHE API (z.B. für einen Link "Cookie-Einstellungen" im Footer):
   *     window.mjTracking.showConsentBanner();
   */
  function showConsentBanner() {
    try {
      window.localStorage.removeItem(CONSENT_KEY);
    } catch (e) {
      log('localStorage nicht löschbar:', e && e.message);
    }
    var existing = document.getElementById('cookie-banner');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    bannerEl = null;
    renderBanner();
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * 4) CONVERSION-TRACKING FÜR TELEFON-KLICKS
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
   * Meldet den Anruf-Klick als Conversion an Google Ads.
   */
  function fireCallConversion() {
    gtag('event', 'conversion', { 'send_to': CALL_CONVERSION_SEND_TO });
    if (DEBUG) console.log('MJ call conversion fired');
  }

  /**
   * Ein einziger delegierter Listener auf document – erfasst dadurch auch
   * tel:-Links, die erst später ins DOM kommen (z.B. Header-/Footer-Partials).
   * Es wird bewusst KEIN preventDefault() aufgerufen, damit der Anruf startet.
   */
  function handleDocumentClick(event) {
    var target = event.target;
    if (!target || typeof target.closest !== 'function') return;

    var link = target.closest('a[href^="tel:"]');
    if (!link) return;

    var href = link.getAttribute('href') || '';

    if (!hasMarketingConsent()) {
      log('Klick auf', href, '– keine Conversion (keine Einwilligung)');
      return;
    }
    if (!passesClickGuard(href)) {
      log('Klick auf', href, '– unterdrückt (Sperrzeit', CLICK_GUARD_MS + 'ms)');
      return;
    }

    fireCallConversion();
  }

  // capture: true → wird auch dann ausgelöst, wenn ein anderer Handler
  // die Weitergabe des Events stoppt.
  document.addEventListener('click', handleDocumentClick, true);

  /* ═══════════════════════════════════════════════════════════════════════
   * INITIALISIERUNG + ÖFFENTLICHE API
   * ═══════════════════════════════════════════════════════════════════════ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderBanner);
  } else {
    renderBanner();
  }

  window.grantMarketingConsent = grantMarketingConsent;
  window.denyMarketingConsent = denyMarketingConsent;
  window.mjTracking = {
    grantMarketingConsent: grantMarketingConsent,
    denyMarketingConsent: denyMarketingConsent,
    hasMarketingConsent: hasMarketingConsent,
    showConsentBanner: showConsentBanner
  };

  log('initialisiert – Consent:', storedConsent === null ? 'offen' : storedConsent);
})();
