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
	height,
	setup,
} from '../gdc-terrain-architecture/lab-runtime.js';
const c = $('#view').getContext('2d');
let tab = 'instances',
	t = 0,
	lastStats = {};
const info = {
 routes: ['两套路线：顶点更密以后读取什么？','两条路径先使用同一教学基础高度。前进到第 3 步提高采样密度，第 4 步给 Wildlands 路径叠加材质微高度；三角洲仅画演讲明确的基础高度 VT 路径，未公开的材质位移保持未知。'],
	instances: [
		'一个 Grid，多个世界范围',
		'左侧是唯一的 8×8-cell 模板。右侧每个 Patch 使用相同 81 个 GridUV 和 128 个三角形，只改变 Origin 和 Size。播放时亮点沿同一模板顶点映射到多个实例。',
	],
	selection: [
		'CDLOD：距离决定选择哪一级',
		'相机沿白色轨迹移动。遍历四叉树，近处递归到子节点，远处保留父节点；叶块铺满世界。颜色是叶块层级。此处专门显示选择，边界过渡见下一页。',
	],
	morph: [
		'拼接：让细边退化成粗边',
		'上半部是相邻 2:1 网格，黄色奇数点向绿色偶数点收拢。下半部是同一条共享边的高度剖面；灰线是粗边，红色区域是当前的几何差。',
	],
	tessellation: [
		'裁掉旧区，再用更小实例补回',
		'左侧始终保留父 Patch，灰色部分代表被裁掉的区域。右侧只在橙框内请求更密网格。所有实例仍复用同一个 8×8-cell 模板；细分比例改变世界尺寸和实例选择。',
	],
	displacement: [
		'顶点密度与材质高度分开控制',
		'左侧基准只有平面；右侧使用同一组程序化材质高度。播放逐步增加位移。切换“只改着色法线”，光照仍有起伏，轮廓保持平面；再降低网格密度观察轮廓欠采样。',
	],
};
function meshGrid(x, y, s, n, color = '#62d9c4', diag = true) {
	grid(c, x, y, s, n, color);
	if (diag)
		for (let j = 0; j < n; j++)
			for (let i = 0; i < n; i++)
				line(
					c,
					[
						[x + (i * s) / n, y + (j * s) / n],
						[x + ((i + 1) * s) / n, y + ((j + 1) * s) / n],
					],
					color,
					0.55,
				);
}
function instances() {
	clear(c);
	text(c, '唯一模板 · GridUV ∈ [0,1]²', 22, 28);
	meshGrid(26, 62, 185, 8);
	const ix = 3,
		iy = 5;
	dot(c, 26 + (ix / 8) * 185, 62 + (iy / 8) * 185, 5, '#f5be6e');
	text(c, 'VB / IB 只保存一份', 22, 283, '#9fb0c3');
	text(c, '每个实例：Origin、Size、LOD', 260, 28);
	const ps = [
		[290, 65, 120],
		[440, 65, 240],
		[290, 335, 60],
		[380, 335, 120],
	];
	for (let i = 0; i < ps.length; i++) {
		const [x, y, s] = ps[i];
		meshGrid(x, y, s, 8, palette[i], false);
		const px = x + (ix / 8) * s,
			py = y + (iy / 8) * s;
		dot(c, px, py, 5, '#f5be6e');
		text(c, `P${i} · ${[32, 64, 16, 32][i]}m`, x, y + s + 24, palette[i], 13);
		const a = [26 + (ix / 8) * 185, 62 + (iy / 8) * 185];
		dot(c, mix(a[0], px, t), mix(a[1], py, t), 5, '#ffffff');
	}
	text(c, 'xy = Origin + GridUV × Size', 24, 548, '#f5be6e', 20);
	lastStats = {
		verticesPerInstance: 81,
		trianglesPerInstance: 128,
		instances: 4,
	};
	$('#stats').textContent =
		'一份 81 顶点模板 × 4 实例；每实例 128 个三角形。世界边长翻倍，顶点间距也翻倍。';
}
function selectTree() {
	const cam = [0.15 + 0.7 * t, 0.5 + 0.2 * Math.sin(t * Math.PI * 2)],
		patches = [];
	function visit(x, y, s, l) {
		const dx = Math.max(x - cam[0], 0, cam[0] - x - s),
			dy = Math.max(y - cam[1], 0, cam[1] - y - s),
			d = Math.hypot(dx, dy);
		if (l < 4 && d < s * 0.75) {
			for (let yy = 0; yy < 2; yy++)
				for (let xx = 0; xx < 2; xx++)
					visit(x + (xx * s) / 2, y + (yy * s) / 2, s / 2, l + 1);
		} else patches.push({ x, y, s, l });
	}
	visit(0, 0, 1, 0);
	return { cam, patches };
}
function selection() {
	clear(c);
	const { cam, patches } = selectTree(),
		s = 490,
		x0 = 35,
		y0 = 50;
	for (const p of patches) {
		box(
			c,
			x0 + p.x * s,
			y0 + p.y * s,
			p.s * s,
			p.s * s,
			['#35415c', '#33496c', '#3c507d', '#375f62', '#356d61'][p.l],
			palette[p.l],
		);
		if (p.s * s > 45)
			text(
				c,
				`L${4 - p.l}`,
				x0 + p.x * s + 5,
				y0 + p.y * s + 20,
				palette[p.l],
				12,
			);
	}
	dot(c, x0 + cam[0] * s, y0 + cam[1] * s, 8, '#ffffff');
	text(c, '白点 = 相机', 555, 84);
	for (let l = 0; l < 5; l++) {
		text(
			c,
			`L${4 - l}：${patches.filter((p) => p.l === l).length} 块`,
			555,
			132 + l * 45,
			palette[l],
		);
	}
	text(c, '俯视选择图 · 相同色块共享同一 LOD', 35, 582, '#9fb0c3');
	const area = patches.reduce((a, p) => a + p.s * p.s, 0);
	lastStats = { patches, area };
	$('#stats').textContent =
		`选中 ${patches.length} 个 Patch · 覆盖面积 ${area.toFixed(3)} · 模板依然只有一种`;
}
function edgeH(y) {
	return (
		0.4 + 0.15 * Math.sin(y * Math.PI * 2) + 0.12 * Math.sin(y * Math.PI * 6)
	);
}
function morph() {
	clear(c);
	text(c, '俯视：细网格（左）接粗网格（右）', 25, 28);
	const x0 = 100,
		y0 = 60,
		s = 240;
	for (let row = 0; row <= 8; row++)
		for (let col = 0; col <= 8; col++) {
			const x = x0 + (col * s) / 8,
				yy = row - (row % 2) * t * (col === 8 ? 1 : col === 7 ? 0.35 : 0),
				y = y0 + (yy * s) / 8;
			if (col < 8) {
				const yn =
					row - (row % 2) * t * (col + 1 === 8 ? 1 : col + 1 === 7 ? 0.35 : 0);
				line(
					c,
					[
						[x, y],
						[x0 + ((col + 1) * s) / 8, y0 + (yn * s) / 8],
					],
					'#457e79',
				);
			}
			if (row < 8) {
				const yn =
					row +
					1 -
					((row + 1) % 2) * t * (col === 8 ? 1 : col === 7 ? 0.35 : 0);
				line(
					c,
					[
						[x, y],
						[x, y0 + (yn * s) / 8],
					],
					'#457e79',
				);
			}
		}
	meshGrid(x0 + s, y0, s, 4, '#7394d1', false);
	for (let i = 0; i <= 8; i++) {
		const y = i - (i % 2) * t;
		dot(
			c,
			x0 + s,
			y0 + (y * s) / 8,
			i % 2 ? 4 : 5,
			i % 2 ? '#f5be6e' : '#62d9c4',
		);
	}
	text(c, '共享边剖面：横轴沿边位置，纵轴为高度', 25, 350);
	const X = 50,
		Y = 565,
		W = 650,
		S = 170;
	const coarse = Array.from({ length: 5 }, (_, i) => [
		X + (i / 4) * W,
		Y - edgeH(i / 4) * S,
	]);
	const fine = Array.from({ length: 9 }, (_, i) => {
		const y = (i - (i % 2) * t) / 8;
		return [X + y * W, Y - edgeH(y) * S];
	});
	c.beginPath();
	coarse.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
	[...fine].reverse().forEach((p) => c.lineTo(...p));
	c.closePath();
	c.fillStyle = '#ad4d4655';
	c.fill();
	line(c, coarse, '#9eacff', 3);
	line(c, fine, '#f5be6e', 2);
	fine.forEach((p, i) =>
		dot(c, ...p, i % 2 ? 4 : 5, i % 2 ? '#f5be6e' : '#62d9c4'),
	);
	let gap = 0;
	for (let i = 1; i < 8; i += 2) {
		const y = (i - t) / 8,
			h = edgeH(y),
			h0 = edgeH(Math.floor(i / 2) / 4),
			h1 = edgeH((Math.floor(i / 2) + 1) / 4),
			hc = mix(h0, h1, (y - Math.floor(i / 2) / 4) * 4);
		gap = Math.max(gap, Math.abs(h - hc));
	}
	lastStats = { maxGap: gap, morph: t };
	$('#stats').textContent =
		`Morph ${t.toFixed(2)} · 共享边最大高度差 ${gap.toFixed(5)}（教学高度单位）`;
}
function tess() {
	clear(c);
	const f = Number($('#factor').value),
		stage = Math.min(3, Math.floor(t * 4)),
		sx = 38,
		sy = 65,
		S = 310;
	const target = { x: 1 / f, y: 1 / f, s: 1 / f };
	text(c, `父模板 8×8 · 局部 ${f} 倍密度`, 25, 28);
	meshGrid(sx, sy, S, 8, '#5f7b97', true);
	const tx = sx + target.x * S,
		ty = sy + target.y * S,
		ts = S / f;
	if (stage >= 1) {
		box(c, tx, ty, ts, ts, '#152334', '#f5be6e');
		for (let i = 0; i < 5; i++)
			line(
				c,
				[
					[tx + (i * ts) / 4, ty],
					[tx, ty + (i * ts) / 4],
				],
				'#53606d',
			);
	}
	if (stage >= 2) meshGrid(tx, ty, ts, 8, '#62d9c4', true);
	text(
		c,
		stage === 0
			? '① 原始父 Patch'
			: stage === 1
				? '② 裁掉选区：旧三角形退化'
				: stage === 2
					? '③ 同一模板缩小后填入'
					: '④ 父级 + 子级，共两实例',
		25,
		420,
		palette[stage],
		16,
	);
	const x = 410,
		y = 65,
		s = 300;
	meshGrid(x, y, s, 8, '#62d9c4', true);
	text(c, '子模板放大查看', 410, 28);
	text(c, `世界尺寸 = 父尺寸 / ${f}`, 410, 400, '#f5be6e');
	text(c, `同样的 81 顶点 · 间距 / ${f}`, 410, 430);
	text(c, '密度增加，模板顶点数不变', 25, 498, '#9fb0c3');
	text(c, '实际引擎需再处理跳级边过渡和有效区裁切', 25, 530, '#9fb0c3');
	lastStats = {
		factor: f,
		stage,
		instances: stage >= 2 ? 2 : 1,
		verticesPerInstance: 81,
	};
	$('#stats').textContent =
		`阶段 ${stage + 1}/4 · 提交 ${stage >= 2 ? 2 : 1} 实例 · 每实例仍是 81 个模板顶点；单个子区仅覆盖 1/${f * f} 父面积。`;
}
function detail(x, y) {
	return (
		0.1 * Math.sin(x * 26) * Math.cos(y * 22) +
		0.16 * Math.exp(-((x - 0.58) ** 2 + (y - 0.4) ** 2) * 120) +
		0.055 * Math.sin(x * 45 + y * 19)
	);
}
function renderSurface(cx, cy, n, amp, normalOnly, wire, angle) {
	const yaw = -0.4 + angle * 0.9,
		co = Math.cos(yaw),
		si = Math.sin(yaw);
	function project(x, y, z) {
		const a = x - 0.5,
			b = y - 0.5;
		return [
			cx + (a * co - b * si) * 295,
			cy + (a * si + b * co) * 115 - z * 275,
		];
	}
	let vertices = [];
	for (let j = 0; j <= n; j++)
		for (let i = 0; i <= n; i++) {
			const x = i / n,
				y = j / n,
				z = normalOnly ? 0 : detail(x, y) * amp;
			vertices.push({ x, y, z, p: project(x, y, z) });
		}
	let tris = [];
	for (let j = 0; j < n; j++)
		for (let i = 0; i < n; i++) {
			const a = j * (n + 1) + i,
				b = a + 1,
				d = a + n + 1,
				e = d + 1;
			tris.push([a, b, e], [a, e, d]);
		}
	tris.sort(
		(a, b) =>
			a.reduce((s, i) => s + vertices[i].y + vertices[i].x * si, 0) -
			b.reduce((s, i) => s + vertices[i].y + vertices[i].x * si, 0),
	);
	for (const tri of tris) {
		const vs = tri.map((i) => vertices[i]);
		let x = vs.reduce((s, v) => s + v.x, 0) / 3,
			y = vs.reduce((s, v) => s + v.y, 0) / 3,
			e = 0.003;
		const dx = ((detail(x + e, y) - detail(x - e, y)) / (2 * e)) * amp,
			dy = ((detail(x, y + e) - detail(x, y - e)) / (2 * e)) * amp;
		const light = clamp(
			(1 - 0.2 * dx - 0.35 * dy) / Math.hypot(dx, dy, 1),
			0.12,
			1,
		);
		c.beginPath();
		vs.forEach((v, i) => (i ? c.lineTo(...v.p) : c.moveTo(...v.p)));
		c.closePath();
		c.fillStyle = `rgb(${70 + light * 95},${75 + light * 100},${56 + light * 78})`;
		c.fill();
		if (wire) {
			c.strokeStyle = '#11233088';
			c.lineWidth = 0.55;
			c.stroke();
		}
	}
	const boundary = [];
	for (let i = 0; i <= n; i++) boundary.push(vertices[i].p);
	for (let j = 1; j <= n; j++) boundary.push(vertices[j * (n + 1) + n].p);
	for (let i = n - 1; i >= 0; i--) boundary.push(vertices[n * (n + 1) + i].p);
	for (let j = n - 1; j >= 0; j--) boundary.push(vertices[j * (n + 1)].p);
	boundary.push(boundary[0]);
	line(c, boundary, '#f5be6e', 2);
	return { vertices, triangles: tris.length };
}
function displacement() {
	clear(c);
	const n = Number($('#density').value),
		amp = (Number($('#amplitude').value) / 100) * t,
		only = $('#normalOnly').checked,
		wire = $('#wire').checked,
		angle = Number($('#angle').value) / 100;
	text(c, '基准：无材质位移', 20, 30);
	text(
		c,
		only ? '右：只改法线，轮廓不动' : '右：材质 Height 推动顶点',
		392,
		30,
		'#62d9c4',
	);
	renderSurface(194, 216, 8, 0, false, wire, angle);
	const mesh = renderSurface(566, 216, n, amp, only, wire, angle);
	text(c, '侧面剖面：黄 = 可见表面；灰 = 基础碰撞面', 25, 377);
	line(
		c,
		[
			[35, 523],
			[725, 523],
		],
		'#8ba2b8',
		2,
	);
	const profile = [];
	for (let i = 0; i <= n; i++) {
		const x = i / n;
		profile.push([35 + x * 690, 523 - (only ? 0 : detail(x, 0.4) * amp) * 330]);
	}
	line(c, profile, '#f5be6e', 2);
	if (n <= 32) profile.forEach((p) => dot(c, ...p, 2, '#62d9c4'));
	text(c, '基础碰撞保持 z=0；视觉位移不会自动更新物理', 25, 582, '#9fb0c3');
	lastStats = {
		vertices: mesh.vertices.length,
		triangles: mesh.triangles,
		amplitude: amp,
		maxZ: Math.max(...mesh.vertices.map((v) => v.z)),
		minZ: Math.min(...mesh.vertices.map((v) => v.z)),
		normalOnly: only,
	};
	$('#stats').textContent =
		`右侧 ${mesh.vertices.length} 顶点 / ${mesh.triangles} 三角形 · 真实高度范围 [${lastStats.minZ.toFixed(3)}, ${lastStats.maxZ.toFixed(3)}]`;
}
function routes() {
 clear(c);
 const stage=Math.min(3,Math.floor(t*4));
 const paths=[['Wildlands',['基础 Height','四叉树 / 区域','Tessellation','材质 Height']],['Delta Force',['Height VT','CDLOD 实例','局部裁切','Soft Tess / VTF']]];
 for(let row=0;row<2;row++) {
  const y=48+row*112;text(c,paths[row][0],24,y-12,palette[row],18);
  for(let i=0;i<4;i++){box(c,24+i*181,y,163,54,i<=stage?'#28514c':'#203043');text(c,paths[row][1][i],32+i*181,y+32,i<=stage?palette[row]:'#9fb0c3',14);if(i<3)line(c,[[188+i*181,y+27],[202+i*181,y+27]],'#9fb0c3',2);}
 }
 const n=stage<2?8:32,micro=stage===3?clamp((t-.75)*4)*.65:0;
 const base=[],wild=[];let maxDifference=0;
 for(let i=0;i<=n;i++){const x=i/n,h=height(x,.42),d=detail(x,.42)*micro;base.push([35+x*690,514-h*190]);wild.push([35+x*690,514-(h+d)*190]);maxDifference=Math.max(maxDifference,Math.abs(d));}
 text(c,'同一教学基础高度：密度变化与材质位移分开观察',25,304,'#dfebf4',16);
 line(c,base,'#9eacff',3);line(c,wild,'#f5be6e',2);wild.forEach(p=>dot(c,...p,2,'#f5be6e'));
 text(c,'蓝：仅按基础高度采样的路径',25,555,'#9eacff',15);
 text(c,'黄：额外叠加材质微高度的路径',360,555,'#f5be6e',15);
 text(c,'三角洲材质 Micro Height 是否进入几何：原稿未确认',25,590,'#9fb0c3',14);
 lastStats={stage,samples:n+1,micro,maxDifference};
 $('#stats').textContent=`阶段 ${stage+1}/4 · 剖面 ${n+1} 个采样点 · 材质位移贡献最大 ${maxDifference.toFixed(3)}`;
}

function draw() {
	const [title, ex] = info[tab];
	$('#topic').textContent = title;
	$('#explain').textContent = ex;
	$('#progressValue').value = `${Math.round(t * 100)}%`;
	$('#progress').value = t * 100;
	for (const id of ['density', 'amp', 'normal', 'wire', 'angle'])
		$(`#${id}Control`).hidden = tab !== 'displacement';
	$('#factorControl').hidden = tab !== 'tessellation';
	if (tab === 'instances') instances();
	if (tab === 'selection') selection();
	if (tab === 'morph') morph();
	if (tab === 'tessellation') tess();
	if (tab === 'displacement') displacement();
 if (tab === 'routes') routes();
	const notes = {
 routes: ['先观察采样点增加，再看黄色剖面何时偏离蓝线。数据来源不同于细分算法。','图示只比较公开的数据关系，不是声称三角洲绝无其他位移实现，也不是完整复刻两个引擎。'],
		instances: [
			'观察白点从唯一模板映射到不同大小的世界 Patch。',
			'WorldXY = Origin + GridUV × Size。H = Heightfield(WorldXY)。',
		],
		selection: [
			'移动相机后，近处出现小块，远处合成大块；选区总面积应一直等于 1。',
			'递归选择：近距离访问子节点；远距离保留父节点。完整 CDLOD 还限制过渡范围。',
		],
		morph: [
			'拖到 100%：黄色奇数点与绿色偶数点重合，红色几何差消失。',
			'y′ = y − (y mod 2) × morph。先 Morph XY，再从同一高度数据读取 H(XY)。',
		],
		tessellation: [
			'比较 2×2、4×4、8×8。子块覆盖范围变小，顶点间距变细，不是给所有父块更换一份更密 VB。',
			'父范围 S；子范围 S/r；模板 n 不变 → 子顶点间距 S/(r·n)。裁切为示意，精确 GPU 退化方式见正文。',
		],
		displacement: [
			'先拖到 100%，再切换“只改法线”。看黄轮廓和下方剖面，而不只看表面明暗。',
			'教学高度：z = amplitude × Dmaterial(x,y)。这里沿世界 Z 位移；沿表面法线的版本在正文说明。',
		],
	};
	$('#observe').textContent = notes[tab][0];
	$('#formula').textContent = notes[tab][1];
	$('#caption').textContent = notes[tab][0];
}
setup({
	tabs: [
		['instances', '① 实例复用'],
		['selection', '② CDLOD 选块'],
		['morph', '③ 接缝 Morph'],
		['tessellation', '④ 裁切与软细分'],
		['displacement', '⑤ 材质位移'],
 ['routes','⑥ 两套路线'],
	],
	onTab: (id) => {
		tab = id;
		t = id === 'displacement' ? 1 : 0;
	},
	onStep: () => {
		t = t >= 1 ? 0 : Math.min(1, t + 0.05);
	},
	onReset: () => {
		t = tab === 'displacement' ? 1 : 0;
	},
	draw,
	interval: 180,
});
$('#progress').oninput = (e) => {
	t = Number(e.target.value) / 100;
	draw();
};
for (const id of [
	'factor',
	'density',
	'amplitude',
	'normalOnly',
	'wire',
	'angle',
])
	$('#' + id).oninput = draw;
window.terrainLab = {
	snapshot: () => ({ tab, t, ...lastStats }),
	step: () => {
		t = Math.min(1, t + 0.05);
		draw();
	},
};
