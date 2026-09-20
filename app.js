(() => {
  const STORAGE = "type-mixer:v2";
  const USER_FONTS = "type-mixer:user-fonts";
  const catalog = Array.isArray(window.TYPE_MIXER_FONTS) ? window.TYPE_MIXER_FONTS : [];
  const sessionFonts = [];
  let userFonts = readJson(USER_FONTS, []);
  let activeFilter = "all";
  let selectedColor = "#d7c1c3";
  let highlights = [];
  let pendingSelection = null;
  let detectedPayload = null;
  let toastTimer;
  let fieldErrorId = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const els = {
    headingSelect: $("#heading-font"), bodySelect: $("#body-font"), swap: $("#swap-fonts"), randomize: $("#randomize"),
    headlineInput: $("#headline-input"), bodyInput: $("#body-input"), previewHeading: $("#preview-heading"), previewBody: $("#preview-body"),
    previewCard: $("#preview-card"), pairingLabel: $("#pairing-label"), highlightButton: $("#highlight-selection"), clearHighlights: $("#clear-highlights"),
    colorInput: $("#highlight-color"), highlightStatus: $("#highlight-status"), grid: $("#font-grid"), count: $("#library-count"), search: $("#font-search"),
    dialog: $("#add-dialog"), closeDialog: $("#close-dialog"), dialogStatus: $("#dialog-status"), toast: $("#toast"),
    googleForm: $("#google-font-form"), localForm: $("#local-font-form"), payload: $("#webpage-payload"), detected: $("#detected-fonts"),
    saveDetected: $("#save-detected"), suggestGithub: $("#suggest-github"), theme: $("#theme-toggle"), themeLabel: $(".theme-label"), finder: $("#font-finder"),
    copyFinder: $("#copy-finder-code")
  };

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }

  function slugify(value) {
    const normalized = value.toLowerCase().trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    const ascii = normalized.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (ascii && !/[^\x00-\x7F]/.test(normalized)) return ascii;
    let hash = 2166136261;
    for (const char of normalized) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
    return `${ascii || "font"}-${(hash >>> 0).toString(36)}`;
  }

  function fallbackForCategory(category) {
    if (category === "serif") return "serif";
    if (category === "mono") return "monospace";
    return "sans-serif";
  }

  function allFonts() { return [...catalog, ...userFonts, ...sessionFonts]; }
  function readyFonts() { return allFonts().filter(font => font.status === "ready"); }
  function fontById(id) { return allFonts().find(font => font.id === id) || readyFonts()[0]; }

  function removeUserFont(id) {
    const font = allFonts().find(item => item.id === id && item.userAdded);
    if (!font) return;
    userFonts = userFonts.filter(item => item.id !== id);
    const sessionIndex = sessionFonts.findIndex(item => item.id === id);
    if (sessionIndex >= 0) sessionFonts.splice(sessionIndex, 1);
    localStorage.setItem(USER_FONTS, JSON.stringify(userFonts));
    if (font.cssUrl && !allFonts().some(item => item.cssUrl === font.cssUrl)) $(`link[data-font-url="${CSS.escape(font.cssUrl)}"]`)?.remove();
    populateSelects({ heading: els.headingSelect.value, body: els.bodySelect.value });
    renderLibrary();
    renderPreview();
    showToast(`${font.name} removed`);
  }

  function loadStyles() {
    [...new Set(allFonts().map(font => font.cssUrl).filter(Boolean))].forEach(url => {
      if ($(`link[data-font-url="${CSS.escape(url)}"]`)) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.dataset.fontUrl = url;
      document.head.append(link);
    });
  }

  function populateSelects(preferred = {}) {
    const currentHeading = preferred.heading || els.headingSelect.value || "instrument-serif";
    const currentBody = preferred.body || els.bodySelect.value || "inter";
    [els.headingSelect, els.bodySelect].forEach(select => {
      select.innerHTML = "";
      const groups = { serif: "Serif", sans: "Sans serif", mono: "Monospace", display: "Display" };
      Object.entries(groups).forEach(([key, label]) => {
        const matches = readyFonts().filter(font => font.category === key);
        if (!matches.length) return;
        const group = document.createElement("optgroup");
        group.label = label;
        matches.forEach(font => group.append(new Option(font.name, font.id)));
        select.append(group);
      });
    });
    els.headingSelect.value = readyFonts().some(font => font.id === currentHeading) ? currentHeading : readyFonts()[0]?.id;
    els.bodySelect.value = readyFonts().some(font => font.id === currentBody) ? currentBody : readyFonts()[0]?.id;
    renderFontPickers();
  }

  function renderFontPickers() {
    const groups = { serif: "Serif", sans: "Sans serif", mono: "Monospace", display: "Display" };
    $$('[data-font-picker]').forEach(picker => {
      const select = document.getElementById(picker.dataset.select);
      const menu = $('.font-picker-menu', picker);
      menu.replaceChildren();
      Object.entries(groups).forEach(([category, label]) => {
        const fonts = readyFonts().filter(font => font.category === category);
        if (!fonts.length) return;
        const heading = document.createElement('div');
        heading.className = 'font-picker-group';
        heading.textContent = label;
        menu.append(heading);
        fonts.forEach(font => {
          const option = document.createElement('button');
          option.type = 'button';
          option.className = 'font-picker-option';
          option.dataset.value = font.id;
          option.setAttribute('role', 'option');
          option.style.fontFamily = font.cssFamily;
          option.textContent = font.name;
          option.addEventListener('click', () => {
            select.value = font.id;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            setAccordionOpen(picker, false);
            $('.t-acc-head', picker).focus();
          });
          menu.append(option);
        });
      });
    });
    syncFontPickers();
  }

  function syncFontPickers() {
    $$('[data-font-picker]').forEach(picker => {
      const select = document.getElementById(picker.dataset.select);
      const font = fontById(select.value);
      const value = $('.font-picker-value', picker);
      value.textContent = font?.name || 'Choose a font';
      value.style.fontFamily = font?.cssFamily || '';
      $('.t-acc-head', picker).setAttribute('aria-label', `${select.id === 'heading-font' ? 'Heading' : 'Body'} font: ${font?.name || 'not selected'}`);
      $$('.font-picker-option', picker).forEach(option => {
        const selected = option.dataset.value === select.value;
        option.setAttribute('aria-selected', String(selected));
        option.tabIndex = selected ? 0 : -1;
      });
    });
  }

  function pickerOptions(picker) {
    return $$('.font-picker-option, .choice-picker-option', picker);
  }

  function focusPickerOption(picker, position = 'selected') {
    const options = pickerOptions(picker);
    if (!options.length) return;
    const target = position === 'first' ? options[0]
      : position === 'last' ? options[options.length - 1]
      : options.find(option => option.getAttribute('aria-selected') === 'true') || options[0];
    target.tabIndex = 0;
    target.focus();
  }

  function setupPickerKeyboard(picker) {
    const trigger = $('.t-acc-head', picker);
    const menu = $('[role="listbox"]', picker);
    pickerOptions(picker).forEach(option => option.setAttribute('role', 'option'));
    trigger.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      setAccordionOpen(picker, true);
      const position = event.key === 'ArrowUp' || event.key === 'End' ? 'last' : event.key === 'Home' ? 'first' : 'selected';
      requestAnimationFrame(() => focusPickerOption(picker, position));
    });
    menu?.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const options = pickerOptions(picker);
      const current = options.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? options.length - 1
        : (Math.max(current, 0) + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      event.preventDefault();
      options.forEach((option, index) => { option.tabIndex = index === next ? 0 : -1; });
      options[next].focus();
    });
  }

  function setAccordionOpen(picker, open) {
    if (open) {
      $$('[data-font-picker], [data-choice-picker]').filter(other => other !== picker).forEach(other => setAccordionOpen(other, false));
    }
    picker.dataset.open = String(open);
    $('.t-acc-head', picker).setAttribute('aria-expanded', String(open));
    const panel = $('.t-acc-panel', picker);
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
  }

  function renderPreview(animate = false) {
    const heading = fontById(els.headingSelect.value);
    const body = fontById(els.bodySelect.value);
    els.previewHeading.textContent = els.headlineInput.value;
    els.previewHeading.style.fontFamily = heading.cssFamily;
    els.previewBody.style.fontFamily = body.cssFamily;
    els.pairingLabel.textContent = `${heading.name} × ${body.name}`;
    syncFontPickers();
    renderHighlightedBody();
    if (animate) {
      els.previewCard.classList.remove("refresh");
      requestAnimationFrame(() => els.previewCard.classList.add("refresh"));
    }
    saveState();
  }

  function renderHighlightedBody() {
    const text = els.bodyInput.value;
    const ranges = highlights
      .map(item => ({ ...item, start: Math.max(0, Math.min(item.start, text.length)), end: Math.max(0, Math.min(item.end, text.length)) }))
      .filter(item => item.end > item.start)
      .sort((a, b) => a.start - b.start);
    els.previewBody.replaceChildren();
    let cursor = 0;
    ranges.forEach(range => {
      if (range.start < cursor) return;
      els.previewBody.append(document.createTextNode(text.slice(cursor, range.start)));
      const mark = document.createElement("mark");
      mark.style.setProperty("--mark", range.color);
      mark.textContent = text.slice(range.start, range.end);
      els.previewBody.append(mark);
      cursor = range.end;
    });
    els.previewBody.append(document.createTextNode(text.slice(cursor)));
  }

  function saveState() {
    localStorage.setItem(STORAGE, JSON.stringify({
      heading: els.headingSelect.value, body: els.bodySelect.value, headline: els.headlineInput.value,
      copy: els.bodyInput.value, highlights, color: selectedColor, theme: document.documentElement.dataset.theme || "light"
    }));
  }

  function restoreState() {
    const state = readJson(STORAGE, {});
    if (Object.prototype.hasOwnProperty.call(state, "headline")) els.headlineInput.value = state.headline;
    if (Object.prototype.hasOwnProperty.call(state, "copy")) els.bodyInput.value = state.copy;
    if (Array.isArray(state.highlights)) highlights = state.highlights;
    if (state.theme === "dark") document.documentElement.dataset.theme = "dark";
    populateSelects(state);
    setColor(state.color || selectedColor, false);
    updateThemeLabel();
  }

  function setColor(color, persist = true) {
    selectedColor = color;
    els.colorInput.value = color;
    $$(".swatch").forEach(button => button.classList.toggle("active", button.dataset.color.toLowerCase() === color.toLowerCase()));
    if (persist) saveState();
  }

  function addHighlight() {
    const start = pendingSelection?.start ?? els.bodyInput.selectionStart;
    const end = pendingSelection?.end ?? els.bodyInput.selectionEnd;
    if (end <= start) {
      els.highlightStatus.textContent = "Select a phrase in the body copy first.";
      els.bodyInput.focus();
      return;
    }
    highlights = highlights.flatMap(item => {
      if (item.end <= start || item.start >= end) return [item];
      const pieces = [];
      if (item.start < start) pieces.push({ ...item, end: start });
      if (item.end > end) pieces.push({ ...item, start: end });
      return pieces;
    });
    highlights.push({ start, end, color: selectedColor });
    els.highlightStatus.textContent = `Highlighted “${els.bodyInput.value.slice(start, end)}”.`;
    pendingSelection = null;
    renderPreview();
  }

  function rememberBodySelection() {
    if (document.activeElement !== els.bodyInput) return;
    const start = els.bodyInput.selectionStart;
    const end = els.bodyInput.selectionEnd;
    if (end <= start) return;
    pendingSelection = { start, end };
    els.highlightStatus.textContent = `Ready to highlight “${els.bodyInput.value.slice(start, end)}”.`;
  }

  function renderLibrary() {
    const query = els.search.value.trim().toLowerCase();
    const visible = allFonts().filter(font => {
      const filterMatch = activeFilter === "all" || font.status === activeFilter || (activeFilter === "mine" && font.userAdded);
      return filterMatch && (!query || `${font.name} ${font.category}`.toLowerCase().includes(query));
    });
    els.grid.replaceChildren();
    els.count.textContent = `${visible.length} of ${allFonts().length} fonts`;
    if (!visible.length) {
      const empty = document.createElement("article"); empty.className = "font-card empty"; empty.textContent = "No fonts match that filter."; els.grid.append(empty); return;
    }
    visible.forEach((font, index) => {
      const card = document.createElement("article"); card.className = `font-card${font.status === "reference" ? " reference-card" : ""}`;
      const top = document.createElement("div"); top.className = "font-card-top";
      top.innerHTML = `<span>${String(index + 1).padStart(2, "0")} · ${font.category}</span><span class="badge ${font.status}">${font.status === "ready" ? "ready" : "reference"}</span>`;
      const specimen = document.createElement("p"); specimen.className = "specimen";
      if (font.status === "reference") {
        specimen.classList.add("reference-note");
        specimen.textContent = "Preview unavailable";
      } else {
        specimen.style.fontFamily = font.cssFamily;
        specimen.textContent = "Ideas that feel human.";
      }
      const foot = document.createElement("div"); foot.className = "font-card-foot";
      const name = document.createElement("strong"); name.textContent = font.name; foot.append(name);
      const links = document.createElement("span"); links.className = "font-card-links";
      if (font.sourceUrl) {
        const source = document.createElement("a"); source.href = font.sourceUrl; source.target = "_blank"; source.rel = "noreferrer";
        source.textContent = `${font.actionLabel || "source"} ↗`; links.append(source);
      }
      if (font.exampleUrl && font.exampleUrl !== font.sourceUrl) {
        const example = document.createElement("a"); example.href = font.exampleUrl; example.target = "_blank"; example.rel = "noreferrer";
        example.textContent = "example ↗"; links.append(example);
      }
      if (font.userAdded) {
        const remove = document.createElement("button"); remove.type = "button"; remove.className = "font-card-remove"; remove.dataset.removeFont = font.id; remove.setAttribute("aria-label", `Remove ${font.name}`); remove.textContent = "remove"; links.append(remove);
      }
      if (links.childElementCount) foot.append(links);
      card.append(top, specimen);
      if (font.status === "reference") {
        const note = document.createElement("p"); note.className = "reference-help"; note.textContent = "Add a licensed web or local file to try this font."; card.append(note);
      } else {
        const action = document.createElement("button"); action.type = "button"; action.className = "font-card-action"; action.dataset.useFont = font.id; action.textContent = "Try as heading →"; card.append(action);
      }
      card.append(foot); els.grid.append(card);
    });
  }

  function showToast(message) {
    clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2300);
  }

  function openDialog(mode = "google") {
    setDialogMode(mode); els.dialogStatus.textContent = ""; clearFormErrors(els.dialog); els.dialog.showModal();
    requestAnimationFrame(() => $('[data-mode-panel].active input, [data-mode-panel].active textarea, [data-mode-panel].active button', els.dialog)?.focus());
  }

  function setFieldError(input, message) {
    const row = input.closest('.form-row') || input.closest('label');
    if (!row) return;
    row.classList.add('field-error');
    input.setAttribute('aria-invalid', 'true');
    let helper = $('.field-message', row);
    if (!helper) { helper = document.createElement('p'); helper.className = 'field-message'; helper.id = `field-error-${++fieldErrorId}`; row.append(helper); }
    helper.textContent = message;
    input.setAttribute('aria-describedby', helper.id);
  }

  function clearFieldError(input) {
    const row = input.closest('.form-row') || input.closest('label');
    if (!row) return;
    row.classList.remove('field-error');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    $('.field-message', row)?.remove();
  }

  function clearFormErrors(root) { $$('input[aria-invalid="true"]', root).forEach(clearFieldError); }

  function setDialogMode(mode) {
    $$('[data-choice-picker]', els.dialog).forEach(picker => setAccordionOpen(picker, false));
    $$('[data-mode-tab]').forEach(button => { const active = button.dataset.modeTab === mode; button.classList.toggle("active", active); button.setAttribute("aria-selected", active); button.tabIndex = active ? 0 : -1; });
    $$('[data-mode-panel]').forEach(panel => { const active = panel.dataset.modePanel === mode; panel.classList.toggle("active", active); panel.hidden = !active; });
  }

  function addUserFont(font) {
    userFonts = [...userFonts.filter(item => item.id !== font.id), { ...font, userAdded: true }];
    localStorage.setItem(USER_FONTS, JSON.stringify(userFonts));
    loadStyles(); populateSelects(); renderLibrary(); renderPreview();
  }

  function parsePayload() {
    const value = els.payload.value.trim();
    if (!value) { detectedPayload = null; els.detected.replaceChildren(); return; }
    try {
      const data = JSON.parse(value);
      const fonts = [...new Set((data.fonts || []).map(String).map(name => name.trim()).filter(Boolean))];
      detectedPayload = { sourceUrl: data.sourceUrl || "", title: data.title || "", fonts };
      els.detected.replaceChildren();
      fonts.forEach((name, index) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = index < 5; checkbox.value = name;
        label.append(checkbox, document.createTextNode(name)); els.detected.append(label);
      });
      els.dialogStatus.textContent = fonts.length ? `${fonts.length} font names found. Choose what to keep.` : "No font names were found in that result.";
    } catch { detectedPayload = null; els.detected.replaceChildren(); els.dialogStatus.textContent = "That doesn’t look like a Font Finder result yet."; }
  }

  function selectedDetectedFonts() { return $$('input[type="checkbox"]:checked', els.detected).map(input => input.value); }

  function setupBookmarklet() {
    const code = `(()=>{const generic=new Set(['serif','sans-serif','monospace','cursive','fantasy','system-ui','ui-serif','ui-sans-serif','ui-monospace']);const clean=s=>s.trim().replace(/^['\"]|['\"]$/g,'');const fonts=[...new Set([...document.querySelectorAll('*')].flatMap(el=>getComputedStyle(el).fontFamily.split(',').map(clean)).filter(f=>f&&!generic.has(f.toLowerCase())))];prompt('Copy this result into Type Mixer:',JSON.stringify({sourceUrl:location.href,title:document.title,fonts},null,2));})()`;
    els.finder.href = `javascript:${code}`;
    els.finder.dataset.code = `javascript:${code}`;
    els.finder.title = "Drag to your bookmarks bar";
  }

  function syncChoicePicker(picker) {
    const select = $('select', picker);
    const option = select.options[select.selectedIndex];
    $('.choice-picker-value', picker).textContent = option.textContent;
    $('.t-acc-head', picker).setAttribute('aria-label', `Category: ${option.textContent}`);
    $$('.choice-picker-option', picker).forEach(button => {
      const selected = button.dataset.value === select.value;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  }

  function updateThemeLabel() {
    const dark = document.documentElement.dataset.theme === "dark";
    els.themeLabel.textContent = dark ? "Light mode" : "Dark mode";
    els.theme.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    els.theme.setAttribute("aria-pressed", String(dark));
  }

  function setupHookSidebar() {
    const nav = $('[data-hook-sidebar]');
    if (!nav) return;
    const items = $$('.hook-items > a, .hook-items > button', nav);
    const railHeight = item => {
      const navRect = nav.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      return Math.max(10, itemRect.top - navRect.top - 30 + itemRect.height / 2);
    };
    const setActive = item => {
      items.forEach(candidate => candidate.classList.toggle('active', candidate === item));
      nav.style.setProperty('--active-rail', `${railHeight(item)}px`);
    };
    const currentHash = location.hash;
    const initial = items.find(item => item.getAttribute('href') === currentHash) || $('.active', nav) || items[0];
    setActive(initial);
    items.forEach(item => {
      if (item.matches('a[href^="#"]')) item.addEventListener('click', () => setActive(item));
      item.addEventListener('mouseenter', () => { nav.style.setProperty('--hover-rail', `${railHeight(item)}px`); nav.classList.add('is-hovering'); });
      item.addEventListener('focus', () => { nav.style.setProperty('--hover-rail', `${railHeight(item)}px`); nav.classList.add('is-hovering'); });
    });
    nav.addEventListener('mouseleave', () => nav.classList.remove('is-hovering'));
    nav.addEventListener('focusout', event => { if (!nav.contains(event.relatedTarget)) nav.classList.remove('is-hovering'); });
    let scrollQueued = false;
    window.addEventListener('scroll', () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        const sectionLinks = items.filter(item => item.matches('a[href^="#"]'));
        const active = [...sectionLinks].reverse().find(item => {
          const section = document.querySelector(item.getAttribute('href'));
          return section && section.getBoundingClientRect().top <= 180;
        }) || sectionLinks[0];
        if (active) setActive(active);
        scrollQueued = false;
      });
    }, { passive: true });
    window.addEventListener('resize', () => setActive($('.active', nav) || items[0]));
  }

  els.headingSelect.addEventListener("change", () => renderPreview(true));
  els.bodySelect.addEventListener("change", () => renderPreview(true));
  els.headlineInput.addEventListener("input", () => renderPreview());
  els.bodyInput.addEventListener("input", () => { highlights = []; pendingSelection = null; els.highlightStatus.textContent = "Text changed—add a new highlight when ready."; renderPreview(); });
  els.bodyInput.addEventListener("select", rememberBodySelection);
  els.highlightButton.addEventListener("click", addHighlight);
  els.clearHighlights.addEventListener("click", () => { highlights = []; pendingSelection = null; renderPreview(); els.highlightStatus.textContent = "Highlights cleared."; });
  els.swap.addEventListener("click", () => { const old = els.headingSelect.value; els.headingSelect.value = els.bodySelect.value; els.bodySelect.value = old; renderPreview(true); });
  els.randomize.addEventListener("click", () => {
    const fonts = readyFonts(); if (fonts.length < 2) return;
    const currentPair = `${els.headingSelect.value}:${els.bodySelect.value}`;
    const pairs = fonts.flatMap(heading => fonts
      .filter(body => body.id !== heading.id)
      .map(body => ({ heading, body, key: `${heading.id}:${body.id}` })));
    const choices = pairs.filter(pair => pair.key !== currentPair);
    const { heading, body } = choices[Math.floor(Math.random() * choices.length)];
    els.headingSelect.value = heading.id; els.bodySelect.value = body.id; renderPreview(true); showToast(`${heading.name} × ${body.name}`);
  });
  $$(".swatch").forEach(button => button.addEventListener("click", () => setColor(button.dataset.color)));
  els.colorInput.addEventListener("input", () => setColor(els.colorInput.value));
  const filterButtons = $$("[data-filter]");
  filterButtons.forEach(button => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filterButtons.forEach(item => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", active);
      item.tabIndex = active ? 0 : -1;
    });
    renderLibrary();
  }));
  filterButtons.forEach((button, index) => { button.tabIndex = index === 0 ? 0 : -1; });
  $('.filter-pills').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const current = filterButtons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? filterButtons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + filterButtons.length) % filterButtons.length;
    event.preventDefault(); filterButtons[next].focus(); filterButtons[next].click();
  });
  els.search.addEventListener("input", renderLibrary);
  els.grid.addEventListener("click", event => {
    const remove = event.target.closest("[data-remove-font]");
    if (remove) { removeUserFont(remove.dataset.removeFont); return; }
    const action = event.target.closest("[data-use-font]");
    if (!action) return;
    els.headingSelect.value = action.dataset.useFont;
    renderPreview(true);
    document.querySelector("#mixer").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast(`${fontById(action.dataset.useFont).name} set as heading`);
  });
  $$('[data-open-add]').forEach(button => button.addEventListener("click", () => openDialog(button.dataset.mode || "google")));
  els.closeDialog.addEventListener("click", () => els.dialog.close());
  els.dialog.addEventListener("click", event => { if (event.target === els.dialog) els.dialog.close(); });
  $$('[data-mode-tab]').forEach(button => button.addEventListener("click", () => setDialogMode(button.dataset.modeTab)));
  $('.dialog-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = $$('[data-mode-tab]');
    const current = tabs.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault(); tabs[next].focus(); tabs[next].click();
  });
  els.finder.addEventListener("click", event => { event.preventDefault(); els.dialogStatus.textContent = "Drag Font Finder to your bookmarks bar, then use it on another webpage."; });
  els.theme.addEventListener("click", () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; updateThemeLabel(); saveState(); });
  $$('[data-font-picker], [data-choice-picker]').forEach(picker => {
    $('.t-acc-head', picker).addEventListener('click', () => setAccordionOpen(picker, picker.dataset.open !== 'true'));
    setAccordionOpen(picker, picker.dataset.open === 'true');
    setupPickerKeyboard(picker);
  });
  $$('[data-choice-picker]').forEach(picker => {
    const select = $('select', picker);
    $$('.choice-picker-option', picker).forEach(option => option.addEventListener('click', () => {
      select.value = option.dataset.value;
      syncChoicePicker(picker);
      setAccordionOpen(picker, false);
      $('.t-acc-head', picker).focus();
    }));
    syncChoicePicker(picker);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-font-picker], [data-choice-picker]')) $$('[data-open="true"]').forEach(picker => setAccordionOpen(picker, false));
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    $$('[data-open="true"]').forEach(picker => { setAccordionOpen(picker, false); $('.t-acc-head', picker).focus(); });
  });
  $$('form input').forEach(input => input.addEventListener('input', () => clearFieldError(input)));
  $$('input[type="file"]').forEach(input => input.addEventListener('change', () => {
    $('.file-name', input.closest('.file-field')).textContent = input.files[0]?.name || 'No file chosen';
    clearFieldError(input);
  }));
  [els.googleForm, els.localForm].forEach(form => form.addEventListener('reset', () => requestAnimationFrame(() => {
    $$('[data-choice-picker]', form).forEach(syncChoicePicker);
    const fileName = $('.file-name', form); if (fileName) fileName.textContent = 'No file chosen';
  })));
  els.copyFinder.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(els.finder.dataset.code);
      $('span', els.copyFinder).textContent = 'Copied'; els.copyFinder.classList.add('copied');
      setTimeout(() => { $('span', els.copyFinder).textContent = 'Copy'; els.copyFinder.classList.remove('copied'); }, 1800);
    } catch { showToast('Copy unavailable — drag the button below instead'); }
  });

  els.googleForm.addEventListener("submit", event => {
    event.preventDefault(); const data = new FormData(els.googleForm); const name = String(data.get("name")).trim(); const cssUrl = String(data.get("cssUrl")).trim();
    clearFormErrors(els.googleForm);
    const nameInput = els.googleForm.elements.name; const urlInput = els.googleForm.elements.cssUrl;
    if (!name) { setFieldError(nameInput, "Add the font’s display name."); nameInput.focus(); return; }
    if (!cssUrl) { setFieldError(urlInput, "Paste the font’s stylesheet URL."); urlInput.focus(); return; }
    try {
      const url = new URL(cssUrl);
      const approved = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.bunny.net" || (url.hostname === "cdn.jsdelivr.net" && url.pathname.includes("fontsource"));
      if (!approved || url.protocol !== "https:") throw new Error();
    } catch { setFieldError(urlInput, "Use an HTTPS stylesheet from Google Fonts, Bunny Fonts, or Fontsource."); urlInput.focus(); return; }
    addUserFont({ id: `user-${slugify(name)}`, name, category: data.get("category"), status: "ready", cssFamily: `"${name}", ${fallbackForCategory(data.get("category"))}`, cssUrl, sourceUrl: cssUrl, license: "user-provided" });
    els.dialogStatus.textContent = `${name} is ready to mix in this browser.`; showToast(`${name} added`); els.googleForm.reset();
  });

  els.localForm.addEventListener("submit", async event => {
    event.preventDefault(); const data = new FormData(els.localForm); const file = data.get("file"); const name = String(data.get("name")).trim();
    clearFormErrors(els.localForm);
    const nameInput = els.localForm.elements.name; const fileInput = els.localForm.elements.file;
    if (!name) { setFieldError(nameInput, "Add a name for this font."); nameInput.focus(); return; }
    if (!(file instanceof File) || !file.size) { setFieldError(fileInput, "Choose a WOFF2, WOFF, TTF, or OTF file."); fileInput.focus(); return; }
    try {
      const url = URL.createObjectURL(file);
      try { const face = new FontFace(name, `url(${url})`); await face.load(); document.fonts.add(face); }
      finally { URL.revokeObjectURL(url); }
      sessionFonts.push({ id: `session-${slugify(name)}-${Date.now()}`, name, category: data.get("category"), status: "ready", cssFamily: `"${name}", ${fallbackForCategory(data.get("category"))}`, userAdded: true, sessionOnly: true });
      populateSelects(); renderLibrary(); renderPreview(); els.dialogStatus.textContent = `${name} is available until this tab closes.`; showToast(`${name} loaded locally`); els.localForm.reset();
    } catch { els.dialogStatus.textContent = "That font file could not be loaded. Try WOFF2, WOFF, TTF, or OTF."; }
  });

  els.payload.addEventListener("input", parsePayload);
  els.saveDetected.addEventListener("click", () => {
    const names = selectedDetectedFonts(); if (!detectedPayload || !names.length) { els.dialogStatus.textContent = "Paste a result and select at least one font."; return; }
    names.forEach(name => addUserFont({ id: `reference-${slugify(name)}`, name, category: "unknown", status: "reference", cssFamily: "system-ui, sans-serif", exampleUrl: detectedPayload.sourceUrl, license: "unknown" }));
    els.dialogStatus.textContent = `${names.length} reference ${names.length === 1 ? "font" : "fonts"} saved.`; showToast("References saved");
  });
  els.suggestGithub.addEventListener("click", () => {
    const names = selectedDetectedFonts(); const source = detectedPayload?.sourceUrl || ""; const title = `Font suggestion: ${names.join(", ") || "new font"}`;
    if (!detectedPayload || !names.length) { els.dialogStatus.textContent = "Paste a result and select at least one font before suggesting it."; return; }
    const body = `## Font${names.length > 1 ? "s" : ""}\n${names.map(name => `- ${name}`).join("\n") || "- "}\n\n## Example webpage\n${source}\n\n## Official font source / license\n\n`;
    window.open(`https://github.com/audreytseng/type-mixer/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, "_blank", "noopener,noreferrer");
  });

  loadStyles(); restoreState(); setupBookmarklet(); setupHookSidebar(); renderPreview(); renderLibrary();
})();
