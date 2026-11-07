import {
	$,
	clamp,
	mix,
	smooth,
	text,
	line,
	box,
	dot,
	clear,
	height,
	hash,
	setup,
} from '../gdc-terrain-architecture/lab-runtime.js';
const c = $('#view').getContext('2d'),
	N = 96;
let tab = 'layers',
	t = 0,
	width = 6,
	sourceVersion = 1,
	built = { height: 1, masks: 1, points: 1, collision: 1, rvt: 1, svt: 1 },
	data = {},
	points = [],
	removed = 0;
const river = (x) => 0.64 + 0.09 * Math.sin(x * 5),
	road = (y) => 0.32 + 0.1 * Math.sin(y * 7),
	names = {
		height: 'Height',
		slope: 'Slope',
		curvature: 'Curvature',
		roughness: 'Roughness',
		flow: 'Flow Accum',
		wetness: 'Wetness',
		sun: 'Sun proxy',
		road: 'Road Mask',
		density: 'Density',
	};
function generate() {
	const base = [],
		macro = [],
		dcc = [],
		micro = [],
		roadM = [];
	for (let y = 0; y < N; y++)
		for (let x = 0; x < N; x++) {
			const u = x / (N - 1),
				v = y / (N - 1),
				h = height(u, v),
				m = 0.22 * Math.exp(-((u - 0.7) ** 2 + (v - 0.3) ** 2) * 30),
				r = Math.abs(u - road(v)),
				rm = 1 - smooth(width / 200, width / 200 + 0.035, r),
				riv = 1 - smooth(0.025, 0.07, Math.abs(v - river(u))),
				d = mix(h + m, 0.36, rm * 0.92) - riv * 0.13,
				mi = 0.025 * Math.exp(-((u - 0.17) ** 2 + (v - 0.66) ** 2) * 220);
			base.push(h);
			macro.push(h + m);
			dcc.push(d);
			micro.push(d + mi);
			roadM.push(rm);
		}
	data = { base, macro, dcc, micro, height: micro, road: roadM };
	for (const k of [
		'slope',
		'curvature',
		'roughness',
		'wetness',
		'sun',
		'density',
	])
		data[k] = [];
	const at = (x, y) => micro[clamp(y, 0, N - 1) * N + clamp(x, 0, N - 1)];
	for (let y = 0; y < N; y++)
		for (let x = 0; x < N; x++) {
			const i = y * N + x,
				dx = ((at(x + 1, y) - at(x - 1, y)) * N) / 2,
				dy = ((at(x, y + 1) - at(x, y - 1)) * N) / 2,
				lap =
					(at(x + 1, y) +
						at(x - 1, y) +
						at(x, y + 1) +
						at(x, y - 1) -
						4 * at(x, y)) *
					N;
			data.slope[i] = clamp(Math.hypot(dx, dy) / 3);
			data.curvature[i] = clamp(0.5 + lap * 2);
			data.roughness[i] = clamp(Math.abs(lap) * 6);
			const wet =
				1 - smooth(0.025, 0.19, Math.abs(y / (N - 1) - river(x / (N - 1))));
			data.wetness[i] = wet;
			data.sun[i] = clamp((0.8 - 0.3 * dx - 0.4 * dy) / Math.hypot(dx, dy, 1));
			data.density[i] = clamp(
				(1 - data.slope[i]) * (0.3 + 0.7 * wet) * (1 - roadM[i]),
			);
		}
	const accum = Array(N * N).fill(1),
		order = Array.from({ length: N * N }, (_, i) => i).sort(
			(a, b) => micro[b] - micro[a],
		);
	for (const i of order) {
		const x = i % N,
			y = Math.floor(i / N);
		let low = i;
		for (let yy = -1; yy <= 1; yy++)
			for (let xx = -1; xx <= 1; xx++) {
				const nx = x + xx,
					ny = y + yy;
				if (
					nx >= 0 &&
					ny >= 0 &&
					nx < N &&
					ny < N &&
					micro[ny * N + nx] < micro[low]
				)
					low = ny * N + nx;
			}
		if (low !== i) accum[low] += accum[i];
	}
	const max = Math.log1p(Math.max(...accum));
	data.flow = accum.map((v) => Math.log1p(v) / max);
	points = [];
	for (let i = 0; i < 550; i++) {
		const x = hash(i, 1),
			y = hash(i, 2),
			index = Math.min(N * N - 1, Math.floor(y * N) * N + Math.floor(x * N));
		if (hash(i, 3) < clamp((1 - data.slope[index]) * 0.7 + 0.15))
			points.push({
				x,
				y,
				index,
				road: data.road[index] > 0.08,
				river: data.wetness[index] > 0.87,
				rock: hash(Math.floor(x * 12), Math.floor(y * 12)) > 0.88,
			});
	}
}
function image(k) {
	const cv = document.createElement('canvas');
	cv.width = cv.height = N;
	const ctx = cv.getContext('2d'),
		im = ctx.createImageData(N, N),
		vals = data[k];
	for (let i = 0; i < N * N; i++) {
		const v = clamp(vals[i]);
		let rgb;
		if (k === 'curvature')
			rgb =
				v < 0.5
					? [50 + v * 120, 90 + v * 200, 170 + v * 130]
					: [110 + v * 145, 180 - v * 90, 85];
		else if (k === 'wetness' || k === 'flow')
			rgb = [20 + v * 50, 35 + v * 155, 50 + v * 205];
		else if (['height', 'base', 'macro', 'dcc', 'micro'].includes(k))
			rgb = [35 + v * 170, 60 + v * 160, 62 + v * 100];
		else rgb = [v * 255, v * 255, v * 255];
		im.data.set([...rgb.map((v) => Math.round(v)), 255], i * 4);
	}
	ctx.putImageData(im, 0, 0);
	return cv;
}
function map(k, x, y, s) {
	c.imageSmoothingEnabled = false;
	c.drawImage(image(k), x, y, s, s);
	c.imageSmoothingEnabled = true;
	c.strokeStyle = '#52667d';
	c.strokeRect(x, y, s, s);
}
function pathLine(fn, x0, y0, s, vertical = false, color = '#f5be6e', w = 3) {
	const ps = [];
	for (let i = 0; i <= 80; i++) {
		const a = i / 80;
		ps.push(
			vertical ? [x0 + fn(a) * s, y0 + a * s] : [x0 + a * s, y0 + fn(a) * s],
		);
	}
	line(c, ps, color, w);
}
function drawLayers() {
	clear(c);
	const stage = Math.min(3, Math.floor(t * 4)),
		keys = ['base', 'macro', 'dcc', 'micro'];
	for (let i = 0; i < 4; i++) {
		const x = 20 + (i % 2) * 200,
			y = 55 + Math.floor(i / 2) * 225;
		map(keys[i], x, y, 180);
		text(
			c,
			`${i + 1} ${['Base / World Machine', 'Macro / 大形手改', 'DCC / 道路与河床', 'Micro / 局部设计'][i]}`,
			x,
			y - 13,
			i === stage ? '#62d9c4' : '#9fb0c3',
			13,
		);
		if (i === stage) {
			c.strokeStyle = '#62d9c4';
			c.lineWidth = 3;
			c.strokeRect(x - 3, y - 3, 186, 186);
		}
	}
	text(c, '当前层剖面', 443, 45);
	const k = keys[stage],
		ps = [];
	for (let x = 0; x < N; x++)
		ps.push([445 + (x / (N - 1)) * 280, 390 - data[k][48 * N + x] * 310]);
	line(c, ps, '#62d9c4', 2);
	text(
		c,
		[
			'原始山体',
			'保留 Base，叠加大形',
			'加入 Terraform 结果',
			'加入局部设计改动',
		][stage],
		443,
		433,
		'#f5be6e',
		14,
	);
	text(c, '此 Micro 是编辑层', 443, 478, '#e3ecf4');
	text(c, '不是材质平铺 Height', 443, 506, '#e3ecf4');
	$('#stats').textContent =
		`当前层 ${stage + 1}/4 · 同一网格坐标 · 基础源数据始终保留`;
}
function drawMasks() {
	clear(c);
	const k = $('#mask').value;
	map(k, 24, 65, 390);
	text(c, `${names[k]} · 96×96 实际数组`, 24, 32, '#62d9c4', 18);
	for (const [i, key] of Object.keys(names).entries()) {
		const x = 455 + (i % 3) * 98,
			y = 60 + Math.floor(i / 3) * 150;
		map(key, x, y, 83);
		text(c, names[key], x, y + 104, k === key ? '#f5be6e' : '#9fb0c3', 12);
	}
	let vals = data[k],
		mn = Math.min(...vals),
		mx = Math.max(...vals);
	text(
		c,
		k === 'curvature'
			? '蓝 = 凸 / 黄 = 凹；符号由本公式定义'
			: '黑 / 深色 = 0；白 / 亮色 = 1',
		24,
		492,
		'#f5be6e',
	);
	text(c, '切换上方数据类型查看单张大图', 24, 531, '#9fb0c3');
	$('#stats').textContent =
		`${names[k]} · Min ${mn.toFixed(3)} / Max ${mx.toFixed(3)} · 非空样本 ${vals.filter((v) => v > 0.1).length}`;
}
function drawSpline() {
	clear(c);
	const stage = Math.min(3, Math.floor(t * 4)),
		s = 420,
		x0 = 25,
		y0 = 55;
	map(stage < 2 ? 'macro' : 'height', x0, y0, s);
	if (stage >= 0) pathLine(road, x0, y0, s, true, '#f5be6e', 4);
	if (stage >= 1) {
		c.globalAlpha = 0.3;
		pathLine(road, x0, y0, s, true, '#f5be6e', (width / 100) * s);
		c.globalAlpha = 1;
	}
	pathLine(river, x0, y0, s, false, '#72c6f0', 5);
	text(
		c,
		[
			'① 中心线 + 参数',
			'② 中心线距离 → 道路 Mask',
			'③ Mask 混到目标路面高度',
			'④ 输出材质 / 排除 / 轨迹',
		][stage],
		25,
		520,
		'#62d9c4',
		18,
	);
	for (let i = 0; i < 3; i++) {
		const k = ['road', 'wetness', 'height'][i];
		map(k, 500, 52 + i * 165, 135);
		text(c, names[k], 647, 120 + i * 165, '#9fb0c3', 12);
	}
	$('#stats').textContent =
		`道路全宽 ${width}m（示例世界边长 100m）· 中心线同时生成 Height、RoadMask 与实例排除`;
}
function drawPoints() {
	clear(c);
	const stage = Math.min(3, Math.floor(t * 4)),
		s = 490,
		x0 = 25,
		y0 = 50;
	map('height', x0, y0, s);
	pathLine(road, x0, y0, s, true, '#a98653', (width / 100) * s);
	pathLine(river, x0, y0, s, false, '#357c9e', 14);
	let alive = 0;
	removed = 0;
	for (const p of points) {
		const reject =
			(stage >= 1 && p.road) ||
			(stage >= 2 && p.river) ||
			(stage >= 3 && p.rock);
		if (reject) {
			removed++;
			if (stage < 3) {
				const x = x0 + p.x * s,
					y = y0 + p.y * s;
				line(
					c,
					[
						[x - 3, y - 3],
						[x + 3, y + 3],
					],
					'#e98787',
				);
				line(
					c,
					[
						[x - 3, y + 3],
						[x + 3, y - 3],
					],
					'#e98787',
				);
			}
		} else {
			alive++;
			dot(c, x0 + p.x * s, y0 + p.y * s, 2.5, '#87e1ab');
		}
	}
	text(
		c,
		['候选点缓存', '减去道路排除', '再减河流排除', '再做岩石组排除'][stage],
		550,
		75,
		'#62d9c4',
		15,
	);
	text(c, `候选 ${points.length}`, 550, 125);
	text(c, `保留 ${alive}`, 550, 165, '#62d9c4');
	text(c, `排除 ${removed}`, 550, 205, '#e98787');
	text(
		c,
		'相同 Seed：重复生成相同候选点，整合阶段再减去冲突',
		25,
		593,
		'#9fb0c3',
	);
	$('#stats').textContent =
		`阶段 ${stage + 1}/4 · 候选 ${points.length} → 保留 ${alive} · 顺序只移除点`;
}
const buildKeys = ['height', 'masks', 'points', 'collision', 'rvt', 'svt'];
const buildNames = [
	'Height 合成',
	'派生 Mask',
	'实例贴地 / 排除',
	'Collision 构建',
	'RVT 页面重绘',
	'SVT 离线重烘焙',
];
function drawBuild() {
	clear(c);
	text(c, `RoadSpline 源版本 v${sourceVersion}`, 25, 30, '#f5be6e', 19);
	for (let i = 0; i < 6; i++) {
		const k = buildKeys[i],
			valid = built[k] === sourceVersion,
			x = 25 + (i % 2) * 350,
			y = 65 + Math.floor(i / 2) * 175;
		box(
			c,
			x,
			y,
			325,
			130,
			valid ? '#224c48' : '#543c37',
			valid ? '#62d9c4' : '#e98787',
		);
		text(c, buildNames[i], x + 14, y + 30, valid ? '#62d9c4' : '#edb2a0', 18);
		text(
			c,
			`产物 v${built[k]} / 源 v${sourceVersion}`,
			x + 14,
			y + 66,
			'#e3ecf4',
			16,
		);
		text(
			c,
			valid ? '有效：输入版本匹配' : '陈旧：不能因为文件存在就复用',
			x + 14,
			y + 102,
			'#dfebf4',
			13,
		);
	}
	text(
		c,
		'“下一步”按依赖更新一个产物；RVT 与 SVT 分开完成',
		25,
		623,
		'#9fb0c3',
	);
	$('#stats').textContent =
		`有效 ${buildKeys.filter((k) => built[k] === sourceVersion).length}/6 · 待构建 ${buildKeys.filter((k) => built[k] !== sourceVersion).join(', ') || '无'}`;
}
function draw() {
	const infos = {
		layers: [
			'四层高度如何合成',
			'按生产责任保留 Base、Macro、DCC 和 Micro 编辑层。切换阶段，比较同一位置的二维高度和剖面。',
		],
		masks: [
			'Mask 不是一组任意 RGBA',
			'同一 Heightfield 导出不同数据：Slope 强调坡面，Curvature 强调凹凸，Flow 聚成细线。它们的数值范围、滤波和更新依赖不同。',
		],
		spline: [
			'道路输入如何变成多种输出',
			'中心线规定道路在哪里，宽度形成距离场，距离场决定高度混合与排除范围。蓝线为河道，用独立湿度范围影响岸边。',
		],
		points: [
			'Wildlands 的减法整合思路',
			'先独立生成候选点，再把道路、河流、岩石冲突逐步减掉。点缓存允许保持可玩，同时异步更新昂贵的分布。这里不复现商业工具的完整参数。',
		],
		build: [
			'缓存失效不能只更新近景',
			'修改源参数会让所有依赖产物版本落后。按下一步更新 Height，再到 Mask、实例、碰撞、近景 RVT、远景 SVT。旧文件存在不代表有效。',
		],
	};
	$('#topic').textContent = infos[tab][0];
	$('#explain').textContent = infos[tab][1];
	$('#maskControl').hidden = tab !== 'masks';
	$('#progress').value = t * 100;
	$('#progressValue').value = `${Math.min(4, Math.floor(t * 4) + 1)}/4`;
	if (tab === 'layers') drawLayers();
	if (tab === 'masks') drawMasks();
	if (tab === 'spline') drawSpline();
	if (tab === 'points') drawPoints();
	if (tab === 'build') drawBuild();
	const notes = {
		layers: '观察 DCC 层中的道路平整。擦掉这一层不需要丢掉原来的山体。',
		masks:
			'先选择 Curvature，再切到 Wetness。两个场有不同成因，不应把它们当成同一个 Mask。',
		spline: '调整宽度，观察道路带、周围地形与右侧 Road Mask 一起变化。',
		points: '红叉是刚被排除的候选；最后的绿点留下，候选 Seed 不随阶段变化。',
		build: '先点“修改道路并标脏”，然后逐步构建；最后一个绿色块应是远景 SVT。',
	};
	$('#observe').textContent = notes[tab];
	$('#caption').textContent = notes[tab];
	$('#formula').textContent =
		tab === 'masks'
			? 'Slope ∝ |∇H|；Curvature = ΔH（本例显示归一化）；Flow 沿最低邻居累计；湿度来自河道距离；Density 组合多个规则。'
			: '教学高度合成使用 Lerp 到目标高度；实际生产按层定义 Add / Replace / Min / Max。缓存版本协议是本文建议，不宣称是 Wildlands 原工程字段。';
}
function reset() {
	t = 0;
	width = 6;
	$('#roadWidth').value = 6;
	$('#widthValue').value = 6;
	sourceVersion = 1;
	built = Object.fromEntries(buildKeys.map((k) => [k, 1]));
	$('#log').textContent = '';
	generate();
}
function step() {
	if (tab === 'build') {
		const k = buildKeys.find((k) => built[k] !== sourceVersion);
		if (k) {
			built[k] = sourceVersion;
			$('#log').textContent =
				`已更新 ${k} 到 v${sourceVersion}\n` + $('#log').textContent;
		} else $('#log').textContent = '所有依赖版本一致。';
	} else t = t >= 1 ? 0 : Math.min(1, t + 0.25);
}
reset();
setup({
	tabs: [
		['layers', '① 分层高度'],
		['masks', '② Mask 图谱'],
		['spline', '③ 道路多输出'],
		['points', '④ 减法整合'],
		['build', '⑤ 增量重建'],
	],
	onTab: (id) => {
		tab = id;
		t = 0;
	},
	onStep: step,
	onReset: reset,
	draw,
	interval: 850,
});
$('#progress').oninput = (e) => {
	t = Number(e.target.value) / 100;
	draw();
};
$('#mask').onchange = draw;
$('#roadWidth').oninput = (e) => {
	width = Number(e.target.value);
	$('#widthValue').value = width;
	sourceVersion++;
	generate();
	draw();
};
$('#change').onclick = () => {
	sourceVersion++;
	width = width === 6 ? 12 : 6;
	$('#roadWidth').value = width;
	$('#widthValue').value = width;
	generate();
	$('#log').textContent =
		`道路 v${sourceVersion}：高度 / Mask / 实例 / 碰撞 / 近远景缓存全部标脏`;
	draw();
};
window.terrainLab = {
	snapshot: () => ({
		tab,
		t,
		sourceVersion,
		built: { ...built },
		pointCount: points.length,
		removed,
		range: Object.fromEntries(
			Object.keys(names).map((k) => [
				k,
				[Math.min(...data[k]), Math.max(...data[k])],
			]),
		),
	}),
	step: () => {
		step();
		draw();
	},
};
