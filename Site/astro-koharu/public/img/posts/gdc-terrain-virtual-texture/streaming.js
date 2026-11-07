import {
	$,
	clamp,
	mix,
	palette,
	text,
	line,
	box,
	dot,
	clear,
	grid,
	setup,
} from '../gdc-terrain-architecture/lab-runtime.js';
const c = $('#view').getContext('2d');
let tab = 'pages',
	camera = 0.25,
	frame = 0,
	phase = 0,
	clock = 0,
	version = 0,
	desired = [],
	feedback = [],
	queue = [],
	batch = [],
	cache = [],
	events = [],
	clipX = 12,
	clipY = 12,
	clipOld = [null, null, null],
	clipUpdates = [],
	arrayPhase = 0,
	slots = [],
	targetIDs = [];
const key = (m, x, y) => `${m}:${x}:${y}`,
	parse = (k) => k.split(':').map(Number);
const stages = [
	'屏幕需求',
	'反馈去重',
	'读取 / 合成',
	'填充物理槽',
	'发布页表',
];
const descriptions = {
	pages: [
		'虚拟页 → 物理页',
		'四个小图是同一世界的不同 Mip，不是四张不同地图。黄色框是本轮需要的页；绿色是已发布页。槽 0 的 Mip4 常驻，其他槽按最久未使用淘汰。',
	],
	clipmap: [
		'移动窗口 → 环形纹理',
		'每级只保存 8×8 个纹素。L0 / L1 / L2 的纹素分别覆盖 1 / 2 / 4 个世界单位。右侧纹理不整张搬动，只有新条带写入，地址对 8 取模。',
	],
	array: [
		'全局材质 ID → 本地 Slice',
		'这里移动的是整套平铺 PBR 材质，不是地图页面。全局 ID 不变，本地 8 个 Slice 重用；先撤销旧映射，再写 Slice，完成后发布新映射。',
	],
	flow: [
		'一个世界位置的跨 LOD 查询',
		'同一位置先确定所需 Mip，再查页表。细页还在队列中时，向父 Mip 查询，不能采到空槽。PBR Array、ID Clipmap、最终 VT 是三份独立的驻留状态。',
	],
};
function reset() {
	frame = 0;
	phase = 0;
	clock = 0;
	version = 0;
	desired = [];
	feedback = [];
	queue = [];
	batch = [];
	events = [];
	cache = [{ k: key(4, 0, 0), slot: 0, last: 0, v: 0, published: true }];
	clipX = Math.floor(camera * 32);
	clipY = 12;
	clipOld = [null, null, null];
	clipUpdates = [];
	arrayPhase = 0;
	slots = Array.from({ length: 8 }, (_, i) => ({ id: i, valid: true }));
	targetIDs = [];
}
function demand() {
	const list = [];
	for (let m = 0; m < 4; m++) {
		const n = 16 >> m;
		const cx = Math.min(n - 2, Math.floor(camera * n)),
			cy = Math.min(n - 2, Math.floor(0.53 * n));
		for (let dy = 0; dy <= 1; dy++)
			for (let dx = 0; dx <= 1; dx++) {
				const x = cx + dx,
					y = cy + dy;
				if (x >= 0 && y >= 0 && x < n && y < n) list.push(key(m, x, y));
			}
	}
	return list;
}
function resolve(k) {
	let [m, x, y] = parse(k);
	while (m <= 4) {
		const p = cache.find((p) => p.published && p.k === key(m, x, y));
		if (p) {
			p.last = clock;
			return p;
		}
		m++;
		x = Math.floor(x / 2);
		y = Math.floor(y / 2);
	}
	throw Error('Pinned parent missing');
}
function log(s) {
	events.unshift(s);
	events = events.slice(0, 7);
}
function pageStep() {
	clock++;
	if (phase === 0) {
		desired = demand();
		feedback = desired.filter(
			(k) => !cache.some((p) => p.published && p.k === k),
		);
		log(`需求 ${desired.length} 页；缺页 ${feedback.length} 页`);
	}
	if (phase === 1) {
		for (const k of feedback)
			if (!queue.includes(k) && !batch.some((p) => p.k === k)) queue.push(k);
		queue.sort((a, b) => parse(b)[0] - parse(a)[0]);
		log(`反馈去重后队列 ${queue.length} 页，先准备较粗父级`);
	}
	if (phase === 2) {
		const count = Number($('#budget').value);
		batch = queue
			.splice(0, count)
			.map((k) => ({
				k,
				v: version,
				source:
					$('#producer').value === 'hybrid'
						? parse(k)[0] >= 2
							? 'svt'
							: 'rvt'
						: $('#producer').value,
			}));
		log(
			batch
				.map(
					(p) =>
						`${p.k} → ${p.source === 'svt' ? 'SVT 读盘' : 'RVT: ID/Array→合成'}`,
				)
				.join(' · ') || '无新任务',
		);
	}
	if (phase === 3) {
		for (const p of batch) {
			let slot =
				cache.length < 20
					? Array.from({ length: 20 }, (_, i) => i).find(
							(i) => !cache.some((q) => q.slot === i),
						)
					: null;
			if (slot === null) {
				const victim = cache
					.filter((q) => q.slot !== 0)
					.sort((a, b) => a.last - b.last)[0];
				slot = victim.slot;
				cache = cache.filter((q) => q !== victim);
				log(`先删除旧映射 ${victim.k}，回收槽 ${slot}`);
			}
			p.slot = slot;
			cache.push({ ...p, last: clock, published: false });
		}
		log(`写入 ${batch.length} 个槽；页表尚未发布`);
	}
	if (phase === 4) {
		for (const p of batch) {
			const q = cache.find((q) => q.k === p.k && q.slot === p.slot);
			if (q) q.published = true;
		}
		log(`发布 ${batch.length} 个页表项；一轮完成`);
		batch = [];
		frame++;
	}
	phase = (phase + 1) % 5;
}
function clipStep() {
	clipX++;
	clipY = 12 + Math.floor(clipX / 13);
	clipUpdates = [];
	for (let l = 0; l < 3; l++) {
		const scale = 2 ** l;
		const origin = [
			Math.floor(clipX / scale) - 4,
			Math.floor(clipY / scale) - 4,
		];
		const old = clipOld[l];
		let changed = [];
		for (let y = 0; y < 8; y++)
			for (let x = 0; x < 8; x++) {
				const wx = origin[0] + x,
					wy = origin[1] + y;
				if (
					!old ||
					wx < old[0] ||
					wx >= old[0] + 8 ||
					wy < old[1] ||
					wy >= old[1] + 8
				)
					changed.push([wx, wy]);
			}
		clipUpdates.push({ origin, old, changed });
		clipOld[l] = origin;
		log(`L${l} 原点(${origin})：写 ${changed.length}/64 纹素`);
	}
	camera = clamp(clipX / 48);
	$('#camera').value = camera * 100;
	frame++;
}
function arrayStep() {
	const start = Math.floor(camera * 24);
	targetIDs = Array.from({ length: 6 }, (_, i) => (start + i) % 32);
	if (arrayPhase === 0) {
		slots.forEach((s) => {
			if (!targetIDs.includes(s.id)) s.valid = false;
		});
		log('撤销不再使用的 ID→Slice；依赖它们的缓存应先失效');
	}
	if (arrayPhase === 1) {
		for (const id of targetIDs)
			if (!slots.some((s) => s.id === id && s.valid)) {
				const hole = slots.find((s) => !s.valid && !s.loading);
				if (hole) {
					hole.id = id;
					hole.loading = true;
				}
			}
		log('向空 Slice 写入新材质；loading 槽仍不可采样');
	}
	if (arrayPhase === 2) {
		slots.forEach((s) => {
			if (s.loading) {
				s.loading = false;
				s.valid = true;
			}
		});
		log('写入完成，发布 ID→Slice 映射');
	}
	arrayPhase = (arrayPhase + 1) % 3;
	frame++;
}
function setStages(names, active) {
	$('#stages').replaceChildren(
		...names.map((n, i) => {
			const e = document.createElement('span');
			e.textContent = `${i + 1} ${n}`;
			e.className = i === active ? 'active' : '';
			return e;
		}),
	);
}
function drawPages(flow = false) {
	clear(c);
	text(c, '逻辑世界：L0 最细，L3 最粗（同一 XY）', 18, 24);
	for (let m = 0; m < 4; m++) {
		const x = 20 + (m % 2) * 212,
			y = 48 + Math.floor(m / 2) * 245,
			s = 185,
			n = 16 >> m;
		text(c, `Mip ${m} · ${n}×${n}`, x, y + 14, palette[m]);
		box(c, x, y + 28, s, s, '#111d2b');
		for (let yy = 0; yy < n; yy++)
			for (let xx = 0; xx < n; xx++) {
				const k = key(m, xx, yy),
					p = cache.find((p) => p.k === k && p.published),
					req = desired.includes(k),
					q = queue.includes(k) || feedback.includes(k);
				box(
					c,
					x + (xx * s) / n,
					y + 28 + (yy * s) / n,
					s / n,
					s / n,
					p ? '#255e56' : q ? '#695032' : '#1b2c3d',
					req ? '#f5be6e' : '#34485f',
				);
			}
		dot(c, x + camera * s, y + 28 + 0.53 * s, 5, '#f8f4dd');
	}
	text(c, '物理缓存 · 20 槽', 456, 24);
	for (let i = 0; i < 20; i++) {
		const x = 456 + (i % 4) * 68,
			y = 48 + Math.floor(i / 4) * 85,
			p = cache.find((p) => p.slot === i);
		box(c, x, y, 63, 75, p ? (p.published ? '#255e56' : '#695032') : '#1b2c3d');
		text(c, `槽 ${i}`, x + 5, y + 19, '#9fb0c3', 12);
		text(c, p ? p.k : '空', x + 5, y + 43, '#e3ecf4', 12);
		if (p?.source)
			text(c, p.source.toUpperCase(), x + 5, y + 63, '#9fb0c3', 11);
	}
	const wanted = key(0, Math.min(15, Math.floor(camera * 16)), 8),
		p = resolve(wanted);
	text(c, `当前采样 ${wanted} → ${p.k} → 槽 ${p.slot}`, 20, 578, '#62d9c4', 17);
	text(
		c,
		p.k === wanted
			? '细页命中：使用请求的分辨率'
			: '细页未到：坐标右移一位，继续查询父 Mip',
		20,
		608,
		'#f5be6e',
	);
	if (flow) {
		text(c, '下方路径只在完成写入后切换到更细页', 456, 500, '#9fb0c3', 12);
		for (let m = 0; m < 5; m++) {
			const found = parse(p.k)[0] === m;
			box(c, 467, 518 + m * 19, 248, 17, found ? '#255e56' : '#1b2c3d');
			text(
				c,
				`Mip${m} ${found ? '命中 → 读取槽 ' + p.slot : '查找 / 继续父级'}`,
				474,
				532 + m * 19,
				found ? '#62d9c4' : '#9fb0c3',
				12,
			);
		}
	}
	$('#stats').textContent =
		`轮次 ${frame} · 队列 ${queue.length} · 已发布 ${cache.filter((p) => p.published).length}/20 · 当前回退 Mip ${parse(p.k)[0]}`;
	$('#formula').textContent =
		'PageKey=(Mip,X,Y)。父页=(Mip+1,floor(X/2),floor(Y/2))。先写物理页，再发布映射；槽复用前撤销旧映射。';
	setStages(stages, phase);
}
function drawClip() {
	clear(c);
	text(c, '世界空间窗口：每级容量相同，覆盖翻倍', 20, 28);
	const s = 320,
		x0 = 20,
		y0 = 60;
	grid(c, x0, y0, s, 16);
	for (let l = 2; l >= 0; l--) {
		const o = clipUpdates[l]?.origin || [
			Math.floor(clipX / 2 ** l) - 4,
			Math.floor(clipY / 2 ** l) - 4,
		];
		const scale = 2 ** l;
		const x = x0 + (o[0] * scale * s) / 64,
			y = y0 + (o[1] * scale * s) / 64;
		line(
			c,
			[
				[x, y],
				[x + (8 * scale * s) / 64, y],
				[x + (8 * scale * s) / 64, y + (8 * scale * s) / 64],
				[x, y + (8 * scale * s) / 64],
				[x, y],
			],
			palette[l],
			3,
		);
	}
	dot(c, x0 + (clipX * s) / 64, y0 + (clipY * s) / 64, 6, 'white');
	text(c, `相机 (${clipX}, ${clipY})`, 20, 416);
	text(c, '右侧黄色：本步新写条带', 20, 450, '#f5be6e');
	text(c, '相同物理格保留既有数据', 20, 477, '#9fb0c3');
	for (let l = 0; l < 3; l++) {
		const x = 418,
			y = 30 + l * 197,
			o = clipUpdates[l]?.origin || [
				Math.floor(clipX / 2 ** l) - 4,
				Math.floor(clipY / 2 ** l) - 4,
			],
			changed = clipUpdates[l]?.changed || [];
		text(c, `L${l} · ${2 ** l}m/texel · 原点 ${o}`, x, y + 16, palette[l]);
		for (let yy = 0; yy < 8; yy++)
			for (let xx = 0; xx < 8; xx++) {
				const wx = o[0] + xx,
					wy = o[1] + yy,
					px = ((wx % 8) + 8) % 8,
					py = ((wy % 8) + 8) % 8,
					newly = changed.some((p) => p[0] === wx && p[1] === wy);
				box(
					c,
					x + px * 25,
					y + 28 + py * 18,
					25,
					18,
					newly ? '#a2702b' : `hsl(${(wx * 13 + wy * 8) % 360} 30% 28%)`,
				);
				text(
					c,
					String(wx),
					x + px * 25 + 3,
					y + 41 + py * 18,
					newly ? '#fff0b9' : '#d6e5ec',
					10,
				);
			}
		text(c, `本步 ${changed.length} / 64`, x + 213, y + 86, palette[l], 13);
	}
	$('#stats').textContent =
		clipUpdates.map((u, l) => `L${l}: ${u.changed.length} 纹素`).join(' · ') ||
		'初始窗口，点击下一步写入';
	$('#formula').textContent =
		'物理地址=((worldCell % N)+N)%N。移动 dx,dy 后写入 N|dx|+N|dy|−|dx·dy| 个纹素（小于窗口尺寸时），大跳跃重填整级。';
	setStages(
		[
			'移动相机',
			'按各级 texel 对齐',
			'取新旧窗口差集',
			'写环形行列',
			'保留重叠数据',
		],
		frame % 5,
	);
}
function drawArray() {
	clear(c);
	text(c, '全局材质库 · 32 种逻辑 ID', 20, 30);
	for (let id = 0; id < 32; id++) {
		const x = 20 + (id % 8) * 66,
			y = 55 + Math.floor(id / 8) * 65;
		box(c, x, y, 57, 52, targetIDs.includes(id) ? '#695032' : '#243749');
		text(
			c,
			String(id),
			x + 18,
			y + 33,
			targetIDs.includes(id) ? '#f5be6e' : '#cfdfed',
			18,
		);
	}
	text(c, '本地高精度 Texture Array · 8 个 Slice', 20, 365);
	for (let i = 0; i < 8; i++) {
		const s = slots[i],
			x = 20 + (i % 4) * 170,
			y = 390 + Math.floor(i / 4) * 85;
		box(
			c,
			x,
			y,
			155,
			70,
			s.valid ? '#255e56' : s.loading ? '#695032' : '#243749',
		);
		text(c, `Slice ${i} ← ID ${s.id}`, x + 8, y + 26, '#e3ecf4', 15);
		text(
			c,
			s.valid ? '映射有效' : s.loading ? '写入中 / 不可采样' : '映射已撤销',
			x + 8,
			y + 52,
			s.valid ? '#62d9c4' : '#f5be6e',
			12,
		);
	}
	text(c, '全局 ID 始终指同一种材料；本地 Slice 会换内容', 20, 603, '#9fb0c3');
	$('#stats').textContent =
		`有效映射 ${slots.filter((s) => s.valid).length}/8 · 目标 ID [${targetIDs.join(',')}]`;
	$('#formula').textContent =
		'离散 MaterialID → Indirection[ID] → Array Slice。不能直接以 GlobalID 作为动态 Array 的层索引。这里仅展示高精度活动集，真实系统还需保留低 Mip 材质及 VT 源依赖。';
	setStages(['撤销旧映射', '写入新 Slice', '发布新映射'], arrayPhase);
}
function draw() {
	const [title, explain] = descriptions[tab];
	$('#topic').textContent = title;
	$('#explain').textContent = explain;
	$('#pageControls').hidden = tab === 'clipmap' || tab === 'array';
	$('#cameraValue').value = Math.round(camera * 100);
	if (tab === 'clipmap') drawClip();
	else if (tab === 'array') drawArray();
	else drawPages(tab === 'flow');
	$('#caption').textContent =
		tab === 'clipmap'
			? '每级的条带来自真实的新旧窗口差集。可暂停检查环绕地址。'
			: tab === 'array'
				? 'Slice 的颜色表示可采样状态；先撤销，再写入，最后发布。'
				: '可重复按下一步：细页缺失 → 粗页回退 → 填页 → 发布 → 细节恢复。';
	$('#log').textContent = events.join('\n');
}
reset();
setup({
	tabs: [
		['pages', 'VT / SVT / RVT'],
		['clipmap', 'Clipmap 条带'],
		['array', '动态材质 Array'],
		['flow', 'LOD 查询链'],
	],
	onTab: (id) => {
		tab = id;
	},
	onStep: () =>
		tab === 'clipmap' ? clipStep() : tab === 'array' ? arrayStep() : pageStep(),
	onReset: reset,
	draw,
});
$('#camera').oninput = (e) => {
	camera = Number(e.target.value) / 100;
	clipX = Math.floor(camera * 48);
	desired = demand();
	draw();
};
$('#budget').oninput = (e) => {
	$('#budgetValue').value = e.target.value;
};
$('#producer').onchange = () => {
	reset();
	draw();
};
$('#jump').onclick = () => {
	camera = camera < 0.5 ? 0.84 : 0.18;
	$('#camera').value = camera * 100;
	clipX = Math.floor(camera * 48);
	desired = demand();
	log('相机跳跃：已有页仍在，新的细页会进入队列');
	draw();
};
$('#edit').onclick = () => {
	version++;
	const old = cache.length;
	cache = cache.filter((p) => p.slot === 0);
	queue = [];
	batch = [];
	phase = 0;
	log(
		`道路版本 ${version}：撤销 ${old - cache.length} 个依赖页；SVT 离线产物另需重建`,
	);
	draw();
};
reset();
draw();
window.terrainLab = {
	snapshot: () => ({
		tab,
		phase,
		frame,
		queue: [...queue],
		cache: cache.map((p) => ({ ...p })),
		clipUpdates,
		slots: slots.map((s) => ({ ...s })),
		version,
	}),
	step: () => {
		tab === 'clipmap' ? clipStep() : tab === 'array' ? arrayStep() : pageStep();
		draw();
	},
};
