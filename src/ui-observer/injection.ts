/** No positional selectors. Each candidate is checked for uniqueness in its root. */
export function installRecorder(options: { controlOrigin: string; afterActionMs: number; html?: boolean; screenshots?: boolean }): void {
  const win = window as any;
  if (!['http:', 'https:'].includes(location.protocol) || location.origin === options.controlOrigin || win.__uiObserveInstalled) return;
  win.__uiObserveInstalled = true;
  const emit = (event: any) => { void win.__uiObserve(event).catch(() => {}); };
  const html = () => '<!doctype html>\n' + (document.documentElement?.outerHTML || '');
  const quoted = (text: string) => JSON.stringify(text);
  function candidates(element: Element): { recorder: (string | string[])[]; locators: any[] } {
    const root = element.getRootNode() as Document | ShadowRoot;
    const recorder: (string | string[])[] = [];
    const locators: any[] = [];
    const css = (selector: string, strategy: string) => {
      try {
        const matches = root.querySelectorAll(selector);
        if (matches.length === 1 && matches[0] === element) {
          recorder.push(selector); locators.push({ strategy, selector, uniqueInRoot: true });
        }
      } catch {}
    };
    for (const attribute of ['data-testid', 'data-test', 'data-cy']) {
      const value = element.getAttribute(attribute);
      if (value) css('[' + attribute + '=' + quoted(value) + ']', attribute);
    }
    const tag = element.tagName.toLowerCase();
    const inputType = element.getAttribute('type');
    const role = element.getAttribute('role') || ({ button: 'button', a: element.hasAttribute('href') ? 'link' : undefined,
      select: 'combobox', textarea: 'textbox', input: inputType === 'checkbox' ? 'checkbox' : inputType === 'radio' ? 'radio' : ['submit', 'button'].includes(inputType || '') ? 'button' : 'textbox' } as Record<string, string | undefined>)[tag];
    // Approximate DOM-accessible name; retain evidence, never claim a full AX name.
    const labelledby = element.getAttribute('aria-labelledby');
    const name = element.getAttribute('aria-label') || (labelledby ? labelledby.split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() : '')
      || (element as HTMLInputElement).labels?.[0]?.textContent?.trim()
      || (['button', 'a'].includes(tag) ? element.textContent?.trim() : '')
      || (['submit', 'button'].includes(inputType || '') ? (element as HTMLInputElement).value : '');
    if (name && role) locators.push({ strategy: 'role', role, name, exact: true, verification: 'verify_accessibility_name_and_uniqueness' });
    if ((element as HTMLInputElement).labels?.length) locators.push({ strategy: 'label', label: (element as HTMLInputElement).labels![0].textContent?.trim(), exact: true, verification: 'verify_uniqueness' });
    if (element.hasAttribute('aria-label')) css(tag + '[aria-label=' + quoted(element.getAttribute('aria-label')!) + ']', 'aria-label');
    const id = element.id;
    // Avoid common generated UUID/hash/numeric IDs. Dynamic IDs are not stable evidence.
    if (id && !/\d|:|^[a-f]{12,}$/i.test(id)) css('#' + CSS.escape(id), 'stable-id-candidate');
    for (const attribute of ['name', 'placeholder', 'alt', 'title']) {
      const value = element.getAttribute(attribute);
      if (value) css(tag + '[' + attribute + '=' + quoted(value) + ']', attribute);
    }
    if (tag === 'a') {
      const href = element.getAttribute('href');
      if (href && !href.includes('?') && !href.includes('#')) css('a[href=' + quoted(href) + ']', 'href');
    }
    // Stable ancestor scoping, never indexes or class chains.
    let parent = element.parentElement;
    while (parent && recorder.length === 0) {
      const attribute = ['data-testid', 'data-test', 'data-cy'].find(key => parent!.hasAttribute(key));
      if (attribute) {
        const prefix = '[' + attribute + '=' + quoted(parent.getAttribute(attribute)!) + '] ';
        for (const key of ['name', 'aria-label']) {
          const value = element.getAttribute(key);
          if (value) css(prefix + tag + '[' + key + '=' + quoted(value) + ']', 'scoped-' + key);
        }
        css(prefix + tag, 'scoped-tag');
      }
      parent = parent.parentElement;
    }
    // Qualify open-shadow-root selectors with a stable, unique host chain.
    if (root instanceof ShadowRoot) {
      const host = candidates(root.host);
      if (!host.recorder.length) return { recorder: [], locators: [...locators, { strategy: 'shadow', status: 'stable_host_missing' }] };
      const prefix = host.recorder[0];
      return { recorder: recorder.map(selector => [...(Array.isArray(prefix) ? prefix : [prefix]), ...(Array.isArray(selector) ? selector : [selector])]), locators };
    }
    return { recorder, locators };
  }
  const make = (type: string, element?: Element, extra = {}) => {
    const isTextEntry = element ? isTextEntryElement(element) : false;
    const baseElement = element ? {
      tag: element.tagName.toLowerCase(),
      value: (element as HTMLInputElement).value,
      inputType: element.getAttribute('type'),
      checked: (element as HTMLInputElement).checked,
      ...(options.html === false || (isTextEntry && ['input', 'change'].includes(type)) ? {} : { outerHTML: element.outerHTML }),
      ...(!isTextEntry || !['input', 'change'].includes(type) ? candidates(element) : {}),
    } : undefined;
    return { type, browserTimestamp: new Date().toISOString(), url: location.href, title: document.title, ...extra, ...(baseElement ? { element: baseElement } : {}) };
  };
  const initial = () => emit({ ...make('navigation'), ...(options.html !== false ? { afterHTML: html() } : {}), snapshot: options.screenshots !== false });
  const isTextEntryElement = (element: Element): boolean => {
    if (element instanceof HTMLInputElement) return !['checkbox', 'radio', 'file', 'submit', 'button', 'range', 'color'].includes((element.type || '').toLowerCase());
    return element instanceof HTMLTextAreaElement;
  };
  const lastTextInput = new WeakMap<Element, number>();
  const debounceMs = 80;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initial, { once: true });
  else initial();
  for (const type of ['click', 'input', 'change', 'submit', 'keydown', 'keyup']) {
    document.addEventListener(type, event => {
      const source = event.composedPath()[0];
      if (!(source instanceof Element)) return;
      // Text typing is represented by input/change; shortcut/control keys remain explicit.
      if (event instanceof KeyboardEvent && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) return;
      const element = type === 'click' ? source.closest('button,a,input,select,textarea,[role=button],[role=link],[role=checkbox],[role=tab]') || source : source;
      const isTextEntry = isTextEntryElement(element);
      if (isTextEntry && ['input', 'change'].includes(type)) {
        const now = Date.now();
        const previous = lastTextInput.get(element);
        if (previous && now - previous < debounceMs) return;
        lastTextInput.set(element, now);
      }
      const snapshotHTML = !(isTextEntry && ['input', 'change'].includes(type));
      const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
      const rect = element.getBoundingClientRect();
      const extra = event instanceof KeyboardEvent ? { key: event.key, code: event.code } : event instanceof MouseEvent ? { offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, button: event.button } : {};
      emit({ ...make(type, element, extra), actionId: id, phase: 'before', ...(snapshotHTML && options.html !== false ? { beforeHTML: html() } : {}) });
      if (options.html === false && options.screenshots === false) return;
      setTimeout(() => emit({ ...make(type), actionId: id, phase: 'after', ...(snapshotHTML && options.html !== false ? { afterHTML: html() } : {}), snapshot: snapshotHTML && options.screenshots !== false }), options.afterActionMs);
    }, true);
  }
  const navigate = () => emit({ ...make('navigation'), ...(options.html !== false ? { afterHTML: html() } : {}), snapshot: options.screenshots !== false });
  window.addEventListener('popstate', navigate);
  window.addEventListener('hashchange', navigate);
  // Do not patch app history; poll only the URL for pushState/replaceState.
  let lastURL = location.href;
  setInterval(() => { if (lastURL !== location.href) { lastURL = location.href; navigate(); } }, options.afterActionMs);
}
