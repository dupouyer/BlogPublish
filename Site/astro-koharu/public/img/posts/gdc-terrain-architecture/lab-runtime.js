// Shared drawing and playback only. Each article owns its algorithm and state.
export const $ = (s) => document.querySelector(s);
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
	const t = clamp((x - a) / (b - a));
	return t * t * (3 - 2 * t);
};
export const palette = ['#62d9c4', '#f5be6e', '#9eacff', '#df8fbf', '#6fbeee'];
export function text(c, s, x, y, color = '#dfebf4', size = 14) {
	c.fillStyle = color;
	c.font = `${size}px "寒蝉全圆体",system-ui,sans-serif`;
	c.textAlign = 'left';
	c.fillText(s, x, y);
}
export function line(c, pts, color = '#8ba2b8', width = 1) {
	c.beginPath();
	pts.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
	c.strokeStyle = color;
	c.lineWidth = width;
	c.stroke();
}
export function box(c, x, y, w, h, fill, stroke = '#34485f') {
	c.fillStyle = fill;
	c.fillRect(x, y, w, h);
	c.strokeStyle = stroke;
	c.lineWidth = 1;
	c.strokeRect(x, y, w, h);
}
export function dot(c, x, y, r, color) {
	c.beginPath();
	c.arc(x, y, r, 0, Math.PI * 2);
	c.fillStyle = color;
	c.fill();
}
export function clear(c) {
	c.fillStyle = '#152334';
	c.fillRect(0, 0, c.canvas.width, c.canvas.height);
}
export function grid(c, x, y, s, n, color = '#34485f') {
	for (let i = 0; i <= n; i++) {
		line(
			c,
			[
				[x + (s * i) / n, y],
				[x + (s * i) / n, y + s],
			],
			color,
		);
		line(
			c,
			[
				[x, y + (s * i) / n],
				[x + s, y + (s * i) / n],
			],
			color,
		);
	}
}
export const hash = (x, y = 0) => {
	const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
	return n - Math.floor(n);
};
export const height = (x, y) =>
	0.25 +
	0.22 * Math.sin(x * 6.8) * Math.cos(y * 5.3) +
	0.13 * Math.sin(x * 13 + y * 7);
export function setup({ tabs, onTab, onStep, onReset, draw, interval = 750 }) {
	const canvas = $('canvas');
	if (canvas) {
		const figure = canvas.parentElement,
			viewport = document.createElement('div'),
			zoom = document.createElement('button');
		viewport.className = 'canvas-viewport';
		canvas.before(viewport);
		viewport.append(canvas);
		zoom.textContent = '放大图形';
		zoom.setAttribute('aria-pressed', 'false');
		zoom.onclick = () => {
			const large = viewport.classList.toggle('zoomed');
			zoom.textContent = large ? '缩小图形' : '放大图形';
			zoom.setAttribute('aria-pressed', String(large));
			draw();
		};
		figure.prepend(zoom);
		const help = document.createElement('p');
		help.className = 'muted zoom-help';
		help.textContent = '标签较小时可放大，再横向滑动查看。';
		zoom.after(help);
	}
	let active = new URLSearchParams(location.search).get('tab') || tabs[0][0];
	if (!tabs.some((t) => t[0] === active)) active = tabs[0][0];
	let running = false,
		last = 0,
		raf = 0,
		visible = true;
	const nav = $('nav');
	tabs.forEach(([id, title]) => {
		const b = document.createElement('button');
		b.textContent = title;
		b.dataset.tab = id;
		b.onclick = () => {
			active = id;
			onTab(id);
			updateNav();
			draw();
		};
		nav.append(b);
	});
	function updateNav() {
		nav
			.querySelectorAll('button')
			.forEach((b) =>
				b.setAttribute('aria-pressed', String(b.dataset.tab === active)),
			);
	}
	const play = $('#play');
	function setRun(v) {
		running = v;
		play.textContent = v ? '暂停' : '播放';
		play.setAttribute('aria-pressed', String(v));
		last = 0;
		if (v && !raf) raf = requestAnimationFrame(loop);
	}
	function loop(now) {
		raf = 0;
		if (!running) return;
		if (!document.hidden && visible) {
			if (!last) last = now;
			if (now - last >= interval) {
				onStep(active);
				draw();
				last = now;
			}
		} else last = 0;
		raf = requestAnimationFrame(loop);
	}
	play.onclick = () => setRun(!running);
	$('#step').onclick = () => {
		setRun(false);
		onStep(active);
		draw();
	};
	$('#reset').onclick = () => {
		setRun(false);
		onReset(active);
		draw();
	};
	const io = new IntersectionObserver((e) => {
		visible = e[0].isIntersecting;
	});
	io.observe(document.body);
	window.addEventListener(
		'pagehide',
		() => {
			setRun(false);
			cancelAnimationFrame(raf);
			io.disconnect();
			ro.disconnect();
		},
		{ once: true },
	);
	const ro = new ResizeObserver(() => {
		if (parent !== window)
			parent.postMessage(
				{ type: 'article-lab-size', height: document.body.scrollHeight + 24 },
				location.origin,
			);
	});
	ro.observe(document.body);
	updateNav();
	onTab(active);
	draw();
	document.fonts.ready.then(draw);
	// Motion starts only on an explicit Play action, including reduced-motion users.
	return { draw, tab: () => active, stop: () => setRun(false) };
}
