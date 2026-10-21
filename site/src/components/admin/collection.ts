// Browser logic for ItemList.astro: reorder, taken toggle, edit, upload and delete.
// Edits update the list in place; a new upload reloads the page so the server renders its images.
import { announce, api, checkPhoto, formatSize, reloadWith } from './ui';

const FIELDS = { featured: ['title', 'placement'], gallery: ['title', 'placement'], flash: ['name', 'price'] } as const;
type Kind = keyof typeof FIELDS;

export function init() {
  const found = document.querySelector<HTMLElement>('[data-collection]');
  if (!found) return;
  const root: HTMLElement = found;
  const kind = root.dataset.collection as Kind;
  const noun = root.dataset.noun!;
  const [fa, fb] = FIELDS[kind];
  const base = `/api/admin/${kind}`;
  const $ = <T extends Element = HTMLElement>(sel: string, el: Pick<Document, 'querySelector'> = root) => el.querySelector<T>(sel)!;

  const list = $<HTMLOListElement>('[data-list]');
  const items = () => [...list.children] as HTMLLIElement[];
  const nameOf = (li: HTMLElement) => li.dataset.a || `Untitled ${noun}`;
  const btn = (li: HTMLElement, act: string) => $<HTMLButtonElement>(`[data-act="${act}"]`, li);

  function relabel(li: HTMLElement) {
    const n = nameOf(li);
    $('[data-a-text]', li).textContent = n;
    $('[data-b-text]', li).textContent = li.dataset.b ?? '';
    btn(li, 'edit').setAttribute('aria-label', `Edit ${n}`);
    btn(li, 'up').setAttribute('aria-label', `Move ${n} up`);
    btn(li, 'down').setAttribute('aria-label', `Move ${n} down`);
    btn(li, 'delete').setAttribute('aria-label', `Delete ${n}`);
    li.querySelector('.a-seg')?.setAttribute('aria-label', `Status of ${n}`);
  }

  function setTaken(li: HTMLElement, taken: boolean) {
    li.classList.toggle('is-taken', taken);
    for (const b of li.querySelectorAll<HTMLButtonElement>('[data-act="taken"]')) {
      b.setAttribute('aria-pressed', String((b.dataset.value === '1') === taken));
    }
  }

  function updateEdges() {
    const all = items();
    all.forEach((li, i) => {
      btn(li, 'up').disabled = i === 0;
      btn(li, 'down').disabled = i === all.length - 1;
    });
    root.querySelector('[data-empty]')?.toggleAttribute('hidden', all.length > 0);
    const count = document.querySelector('[data-count]');
    if (count) count.textContent = `${all.length} ${noun}${all.length === 1 ? '' : 's'}`;
  }

  // ---- List actions ---------------------------------------------------------

  list.addEventListener('click', async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-act]');
    const li = b?.closest<HTMLLIElement>('li');
    if (!b || !li) return;
    const id = li.dataset.id;
    const act = b.dataset.act;

    if (act === 'edit') return openForm(li);
    if (act === 'delete') return openDelete(li);

    if (act === 'up' || act === 'down') {
      b.disabled = true;
      try {
        const r = await api<{ moved: boolean; items: { id: number }[] }>(`${base}/${id}/move`, { method: 'POST', json: { dir: act } });
        const byId = new Map(items().map((x) => [x.dataset.id, x]));
        for (const { id } of r.items) {
          const x = byId.get(String(id));
          if (x) list.appendChild(x);
        }
        updateEdges();
        // Re-appending the item drops focus; put it back, or on the other arrow once at an end.
        (b.disabled ? btn(li, act === 'up' ? 'down' : 'up') : b).focus();
        const pos = items().indexOf(li) + 1;
        announce(`Moved ${nameOf(li)} ${act}. It’s now ${pos} of ${items().length}.`);
      } catch (err) {
        updateEdges();
        announce((err as Error).message, 'error');
      }
      return;
    }

    if (act === 'taken') {
      const taken = b.dataset.value === '1';
      if (b.getAttribute('aria-pressed') === 'true') return;
      setTaken(li, taken);
      try {
        await api(`${base}/${id}`, { method: 'PATCH', json: { taken } });
        announce(`${nameOf(li)} is marked ${taken ? 'taken' : 'available'}.`);
      } catch (err) {
        setTaken(li, !taken);
        announce((err as Error).message, 'error');
      }
    }
  });

  // ---- Upload / edit sheet ---------------------------------------------------

  const formDialog = $<HTMLDialogElement>('[data-form-dialog]');
  const form = $<HTMLFormElement>('[data-form]', formDialog);
  const photo = $('[data-photo]', form);
  const fileInput = $<HTMLInputElement>('input[type=file]', form);
  const fileBox = $('[data-filebox]', form);
  const preview = $<HTMLImageElement>('[data-preview]', form);
  const fileError = $('[data-ferror]', form);
  const fileLabel = $('[data-flabel]', form);
  const formError = $('[data-form-error]', form);
  const submit = $<HTMLButtonElement>('[data-submit]', form);
  const heading = $('#form-h', form);
  const status = form.querySelector<HTMLElement>('[data-status]');
  const inputA = form.elements.namedItem('a') as HTMLInputElement;
  const inputB = form.elements.namedItem('b') as HTMLInputElement;
  let editing: HTMLLIElement | null = null;
  let file: File | null = null;
  let previewUrl = '';

  const statusTaken = () => status?.querySelector('[aria-pressed="true"]')?.getAttribute('data-value') === '1';
  const setStatus = (taken: boolean) =>
    status?.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.value === '1') === taken)));
  status?.addEventListener('click', (e) => {
    const b = (e.target as Element).closest('button');
    if (b) setStatus(b.dataset.value === '1');
  });

  function setFile(f: File | null) {
    file = f;
    const problem = f && checkPhoto(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = f && !problem ? URL.createObjectURL(f) : '';
    fileBox.hidden = !f;
    fileBox.classList.toggle('is-error', !!problem);
    if (previewUrl) preview.src = previewUrl;
    else preview.removeAttribute('src');
    $('[data-fname]', fileBox).textContent = f?.name ?? '';
    $('[data-fsize]', fileBox).textContent = f ? formatSize(f.size) : '';
    fileError.textContent = problem || '';
    fileLabel.textContent = f ? 'Choose another photo' : 'Take or choose a photo';
    submit.disabled = !editing && (!f || !!problem);
  }
  // Browsers that can't draw HEIC show an empty square rather than a broken image.
  preview.addEventListener('error', () => preview.removeAttribute('src'));
  fileInput.addEventListener('change', () => setFile(fileInput.files?.[0] ?? null));

  function openForm(li: HTMLLIElement | null) {
    editing = li;
    form.reset();
    formError.textContent = '';
    photo.hidden = !!li;
    heading.textContent = heading.dataset[li ? 'headingEdit' : 'headingAdd']!;
    submit.textContent = submit.dataset[li ? 'labelEdit' : 'labelAdd']!;
    inputA.value = li?.dataset.a ?? '';
    inputB.value = li?.dataset.b ?? '';
    setStatus(!!li?.classList.contains('is-taken'));
    setFile(null);
    formDialog.showModal();
    if (li) inputA.focus();
  }

  $('[data-act="add"]').addEventListener('click', () => openForm(null));
  $('[data-close]', formDialog).addEventListener('click', () => formDialog.close());
  // A tap on the dimmed backdrop closes the sheet, like the ✕ button.
  formDialog.addEventListener('click', (e) => e.target === formDialog && formDialog.close());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.textContent = '';
    const a = inputA.value.trim();
    if (!a) {
      formError.textContent = `Give the ${noun} a ${kind === 'flash' ? 'name' : 'title'}.`;
      return inputA.focus();
    }
    if (!editing && (!file || checkPhoto(file))) return;
    const b = inputB.value.trim();
    const label = submit.textContent;
    submit.disabled = true;
    submit.textContent = editing ? 'Saving…' : 'Uploading…';
    try {
      if (editing) {
        const li = editing;
        const json: Record<string, unknown> = { [fa]: a, [fb]: b };
        if (status) json.taken = statusTaken();
        await api(`${base}/${li.dataset.id}`, { method: 'PATCH', json });
        li.dataset.a = a;
        li.dataset.b = b;
        relabel(li);
        if (status) setTaken(li, statusTaken());
        formDialog.close();
        announce(`Saved ${nameOf(li)}.`);
      } else {
        const body = new FormData();
        body.append('photo', file!);
        body.append(fa, a);
        body.append(fb, b);
        if (status) body.append('taken', statusTaken() ? '1' : '0');
        await api(base, { method: 'POST', body });
        reloadWith(`Added ${a}. It’s on the site now.`);
        return;
      }
    } catch (err) {
      formError.textContent = (err as Error).message;
    }
    submit.disabled = false;
    submit.textContent = label;
  });

  // ---- Delete confirmation ---------------------------------------------------

  const delDialog = $<HTMLDialogElement>('[data-delete-dialog]');
  const delYes = $<HTMLButtonElement>('[data-del-yes]', delDialog);
  const delError = $('[data-del-error]', delDialog);
  let deleting: HTMLLIElement | null = null;

  function openDelete(li: HTMLLIElement) {
    deleting = li;
    $('[data-del-name]', delDialog).textContent = nameOf(li);
    $('[data-del-thumb]', delDialog).replaceChildren(...[...$('[data-thumb]', li).childNodes].map((n) => n.cloneNode(true)));
    delError.textContent = '';
    delYes.disabled = false;
    delDialog.showModal();
  }

  $('[data-del-no]', delDialog).addEventListener('click', () => delDialog.close());
  delYes.addEventListener('click', async () => {
    const li = deleting!;
    delYes.disabled = true;
    try {
      await api(`${base}/${li.dataset.id}`, { method: 'DELETE' });
      const next = (li.nextElementSibling ?? li.previousElementSibling) as HTMLElement | null;
      delDialog.close();
      li.remove();
      updateEdges();
      (next ? btn(next, 'edit') : $<HTMLButtonElement>('[data-act="add"]')).focus();
      announce(`Deleted ${nameOf(li)}. It’s off the site.`);
    } catch (err) {
      delError.textContent = (err as Error).message;
      delYes.disabled = false;
    }
  });
}
