// 서버 연결. 기본은 페이지를 준 서버의 /ws, ?server=wss://... 로 바꿀 수 있다.
export class Net {
  constructor(onMessage, onClose) {
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.ws = null;
  }

  get open() { return this.ws && this.ws.readyState === 1; }

  url() {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q;
    if (!/^https?:$/.test(location.protocol)) return null;
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = this.url();
      if (!url) { reject(new Error('no-server')); return; }
      let ws;
      try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
      this.ws = ws;
      let opened = false;
      const timer = setTimeout(() => { if (!opened) { ws.close(); reject(new Error('timeout')); } }, 70000);
      ws.onopen = () => { opened = true; clearTimeout(timer); resolve(); };
      ws.onmessage = e => { try { this.onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!opened) reject(new Error('closed'));
        else this.onClose();
      };
    });
  }

  send(m) { if (this.open) this.ws.send(JSON.stringify(m)); }

  close() { if (this.ws) { this.ws.onclose = null; this.ws.close(); this.ws = null; } }
}
