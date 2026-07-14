const API = (() => {
  'use strict';

  async function getJSON(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    return resp.json();
  }

  async function putJSON(url, data) {
    const resp = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    return resp.json();
  }

  async function putText(url, text) {
    const resp = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: text
    });
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    return resp.json();
  }

  async function del(url) {
    const resp = await fetch(url, { method: 'DELETE' });
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    return resp.json();
  }

  async function postJSON(url, data) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    return resp.json();
  }

  return {
    // Layout
    getLayout: () => getJSON('/api/layout'),
    saveLayout: (layout) => putJSON('/api/layout', layout),

    // Appendix
    getAppendix: () => getJSON('/api/appendix'),
    saveAppendix: (data) => putJSON('/api/appendix', data),

    // Entries
    listEntries: () => getJSON('/api/entries'),
    getEntry: (id) => fetch('/api/entries/' + encodeURIComponent(id)).then(r => r.text()),
    saveEntry: (id, content) => putText('/api/entries/' + encodeURIComponent(id), content),
    deleteEntry: (id) => del('/api/entries/' + encodeURIComponent(id)),
    createEntry: (id, title) => postJSON('/api/entries', { id, title }),

    // Images
    listImages: () => getJSON('/api/images'),
    uploadImage: (file) => {
      const fd = new FormData();
      fd.append('image', file);
      return fetch('/api/images', { method: 'POST', body: fd }).then(r => r.json());
    },
    deleteImage: (filename) => del('/api/images/' + encodeURIComponent(filename))
  };
})();
