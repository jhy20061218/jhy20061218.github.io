// =========================================================
// Three.js 3D 空间
// 会“呼吸”的流体球 + 轨道环 + 卫星 + 星尘粒子
// 跟随鼠标 / 滚动 / 页面切换，带弹簧动画；点击空白处泛起波动
// =========================================================
import * as THREE from './vendor/three.module.min.js';

const canvas = document.getElementById('scene');
const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
// 与 layout.css 中首页“上下布局”的断点保持一致
const narrowMQ = matchMedia('(max-aspect-ratio: 1/1), (max-width: 760px)');

let renderer = null;
if (canvas) {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    canvas.remove(); // 不支持 WebGL：保留 CSS 渐变网格背景即可
  }
}
// 3D 正常时才显示“与 3D 互动”的提示（脚本没加载或不支持 WebGL 时保持隐藏）
if (renderer) root.classList.add('has-webgl');
if (renderer) init();

function init() {
  const lowPower = coarse || innerWidth < 760;
  renderer.setPixelRatio(Math.min(devicePixelRatio, lowPower ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  // ---------- 配色（随深浅色切换） ----------
  const palettes = {
    light: { c1: '#5b5bf0', c2: '#a855f7', c3: '#f472b6', rim: '#ffffff', rimK: 0.75, ring: '#7c6cf2', ringO: 0.32, dust: '#6366f1', dustO: 0.55 },
    dark:  { c1: '#4338ca', c2: '#9333ea', c3: '#ec4899', rim: '#c7d2fe', rimK: 0.9,  ring: '#a5b4fc', ringO: 0.28, dust: '#c7d2fe', dustO: 0.75 },
  };

  // ---------- 噪声 & 流体球着色器 ----------
  const noise = /* glsl */`
    vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
    vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
    float snoise(vec3 v){
      const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
      vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
      vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g;
      vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
      vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
      i=mod289(i);
      vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
      float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
      vec4 j=p-49.0*floor(p*ns.z*ns.z);
      vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
      vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
      vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
      vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
      vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
      vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
      vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
      p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
      vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
      return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
    }`;

  const vertexShader = /* glsl */`
    uniform float uTime; uniform float uAmp; uniform float uFreq;
    varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vD;
    ${noise}
    float field(vec3 n){
      return snoise(n*uFreq + vec3(0.0, uTime*0.22, uTime*0.12)) + 0.18*snoise(n*uFreq*2.0 - uTime*0.18);
    }
    vec3 displace(vec3 p){ vec3 n = normalize(p); return n * (length(p) + field(n) * uAmp); }
    void main(){
      vec3 n0 = normalize(position);
      float f0 = field(n0);
      vec3 p = n0 * (length(position) + f0 * uAmp);
      // 用邻近点重新计算法线，让起伏有真实的明暗
      vec3 t = normalize(abs(n0.y) < 0.99 ? cross(n0, vec3(0.0,1.0,0.0)) : cross(n0, vec3(1.0,0.0,0.0)));
      vec3 b = normalize(cross(n0, t));
      float e = 0.015;
      vec3 nrm = normalize(cross(displace(position + t*e) - p, displace(position + b*e) - p));
      if (dot(nrm, n0) < 0.0) nrm = -nrm;
      vD = f0; vP = n0;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vV = normalize(-mv.xyz);
      vN = normalize(normalMatrix * nrm);
      gl_Position = projectionMatrix * mv;
    }`;

  const fragmentShader = /* glsl */`
    uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uRim;
    uniform float uRimK; uniform float uTime;
    varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vD;
    void main(){
      vec3 n = normalize(vN); vec3 v = normalize(vV);
      float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.2);
      float t = clamp(0.5 + 0.5*vP.y + 0.3*vD + 0.12*sin(uTime*0.4 + vP.x*2.0), 0.0, 1.0);
      vec3 base = mix(uC1, uC2, smoothstep(0.0, 0.55, t));
      base = mix(base, uC3, smoothstep(0.55, 1.0, t));
      vec3 L = normalize(vec3(-0.4, 0.75, 0.6));
      float diff = clamp(dot(n, L), 0.0, 1.0);
      float spec = pow(clamp(dot(n, normalize(L + v)), 0.0, 1.0), 48.0);
      vec3 col = base * (0.42 + 0.78*diff);
      col += uRim * fres * uRimK;
      col += spec * 0.45;
      col += 0.12 * fres * (0.5 + 0.5*cos(6.2831*(fres*1.2 + vec3(0.0, 0.33, 0.67)) + uTime*0.5));
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`;

  const makeBlobMaterial = (amp, freq) => new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uTime: { value: 0 }, uAmp: { value: amp }, uFreq: { value: freq },
      uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() },
      uRim: { value: new THREE.Color() }, uRimK: { value: 0.8 },
    },
  });

  // ---------- 场景物体 ----------
  const rig = new THREE.Group();          // 整体位置 / 缩放由弹簧驱动
  const spinner = new THREE.Group();      // 跟随鼠标转动
  rig.add(spinner); scene.add(rig);

  const blobMat = makeBlobMaterial(0.17, 0.75);
  const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, lowPower ? 24 : 48), blobMat);
  spinner.add(blob);

  const ringMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.009, 8, 256), ringMat);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.006, 8, 256), ringMat.clone());
  const orbit1 = new THREE.Group(); orbit1.rotation.set(1.18, 0.28, 0);
  const orbit2 = new THREE.Group(); orbit2.rotation.set(1.92, -0.42, 0.3);
  orbit1.add(ring1); orbit2.add(ring2); spinner.add(orbit1, orbit2);

  // 卫星小球（沿轨道运行）
  const satMats = [];
  const sats = [[orbit1, 2.15, 0.13, 0], [orbit1, 2.15, 0.08, Math.PI * 0.9], [orbit2, 2.7, 0.1, Math.PI * 0.4]].map(([orbit, r, size, phase]) => {
    const m = makeBlobMaterial(size * 0.06, 0.8); satMats.push(m);
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 8), m);
    orbit.add(s);
    return { mesh: s, r, phase, speed: 0.35 / r * 2 };
  });

  // 星尘粒子
  const N = lowPower ? 600 : 1500;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 3.2 + Math.pow(Math.random(), 0.7) * 10;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
    pos[i * 3 + 2] = r * Math.cos(ph) - 3;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dustTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const dustMat = new THREE.PointsMaterial({ size: 0.06, map: dustTex, transparent: true, depthWrite: false, sizeAttenuation: true });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  // ---------- 主题 ----------
  function isDark() {
    const t = root.getAttribute('data-theme');
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function applyPalette() {
    const p = palettes[isDark() ? 'dark' : 'light'];
    [blobMat, ...satMats].forEach((m) => {
      m.uniforms.uC1.value.set(p.c1); m.uniforms.uC2.value.set(p.c2); m.uniforms.uC3.value.set(p.c3);
      m.uniforms.uRim.value.set(p.rim); m.uniforms.uRimK.value = p.rimK;
    });
    ring1.material.color.set(p.ring); ring1.material.opacity = p.ringO;
    ring2.material.color.set(p.ring); ring2.material.opacity = p.ringO * 0.6;
    dustMat.color.set(p.dust); dustMat.opacity = p.dustO;
    if (reduceMotion) renderOnce();
  }
  new MutationObserver(applyPalette).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyPalette);
  applyPalette();

  // ---------- 布局：根据页面和屏幕决定球的位置（弹簧过渡） ----------
  const state = { x: 0, y: 0, s: 0.2 }, vel = { x: 0, y: 0, s: 0 }, target = { x: 0, y: 0, s: 1 };
  function visible() {
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    return { w: h * camera.aspect, h };
  }
  function computeTarget() {
    const { w, h } = visible();
    const narrow = narrowMQ.matches;
    const view = root.getAttribute('data-view') || 'home';
    if (view === 'home') {
      if (narrow) { target.x = 0; target.y = h * 0.2; target.s = Math.min(1, w / 4.6) * 0.95; }
      else { target.x = w * 0.22; target.y = 0; target.s = Math.min(1.1, w / 9); }
    } else {
      target.x = w * (narrow ? 0.34 : 0.38); target.y = h * 0.3; target.s = narrow ? 0.42 : 0.6;
    }
  }
  function springStep(dt) {
    const k = 70, c = 2 * Math.sqrt(k) * 0.5; // 欠阻尼 → 带一点回弹
    for (const key of ['x', 'y', 's']) {
      vel[key] += (k * (target[key] - state[key]) - c * vel[key]) * dt;
      state[key] += vel[key] * dt;
    }
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    computeTarget();
    if (reduceMotion) renderOnce();
  }
  addEventListener('resize', resize);
  addEventListener('viewchange', () => { computeTarget(); pulse = Math.max(pulse, 0.45); if (reduceMotion) renderOnce(); });
  resize();

  // ---------- 交互输入 ----------
  const pointer = { x: 0, y: 0, sx: 0, sy: 0, active: false };
  addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / innerHeight) * 2 + 1;
    pointer.active = true;
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer.active = false; });

  let pulse = 0, spinBoost = 0;
  addEventListener('pointerdown', (e) => {
    if ((root.getAttribute('data-view') || 'home') !== 'home') return;
    if (e.target.closest && e.target.closest('a, button, .glass, input, textarea')) return;
    pulse = 1; spinBoost = 2.4;
  });

  let scrollY = 0;
  addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

  // ---------- 渲染循环 ----------
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  let time = 0, rotY = 0, raf = 0, hover = 0, scrollRot = 0;

  function frame() {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    time += dt;
    springStep(dt);

    // 呼吸：缩放与起伏幅度缓慢起落
    const breath = Math.sin(time * 1.1);
    rig.position.set(state.x, state.y, 0);
    rig.scale.setScalar(Math.max(0.01, state.s * (1 + breath * 0.022)));

    // 鼠标靠近球体 → 更“活跃”
    tmp.setFromMatrixPosition(blob.matrixWorld).project(camera);
    const dx = (pointer.x - tmp.x) * camera.aspect, dy = pointer.y - tmp.y;
    const near = pointer.active ? 1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dy), 0.25, 0.9) : 0;
    hover += (near - hover) * Math.min(1, dt * 4);
    pulse *= Math.exp(-dt * 1.6);
    spinBoost *= Math.exp(-dt * 1.8);

    blobMat.uniforms.uTime.value = time;
    blobMat.uniforms.uAmp.value = 0.17 + breath * 0.025 + hover * 0.09 + pulse * 0.2;
    blobMat.uniforms.uFreq.value = 0.75 + pulse * 0.45;
    satMats.forEach((m) => { m.uniforms.uTime.value = time * 1.5; });

    // 跟随鼠标的倾斜 + 自转
    pointer.sx += (pointer.x - pointer.sx) * Math.min(1, dt * 3);
    pointer.sy += (pointer.y - pointer.sy) * Math.min(1, dt * 3);
    rotY += dt * (0.12 + spinBoost);
    scrollRot += (scrollY * 0.0025 - scrollRot) * Math.min(1, dt * 5);
    spinner.rotation.set(-pointer.sy * 0.35 + scrollRot * 0.4, rotY + pointer.sx * 0.6, 0);
    blob.rotation.y = -time * 0.05;
    orbit1.rotation.z = time * 0.08; orbit2.rotation.z = -time * 0.06;
    sats.forEach((s) => {
      const a = s.phase + time * s.speed;
      s.mesh.position.set(Math.cos(a) * s.r, Math.sin(a) * s.r, 0);
    });

    // 星尘：缓慢旋转 + 视差 + 滚动
    dust.rotation.y = time * 0.012 + pointer.sx * 0.08;
    dust.rotation.x = pointer.sy * 0.05;
    dust.position.y = scrollY * 0.0018;

    camera.position.x = pointer.sx * 0.25;
    camera.position.y = pointer.sy * 0.18;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }

  function renderOnce() {
    Object.assign(state, target);
    rig.position.set(state.x, state.y, 0);
    rig.scale.setScalar(state.s);
    blobMat.uniforms.uTime.value = 3.0;
    renderer.render(scene, camera);
  }

  function start() { if (!raf && !reduceMotion) { clock.getDelta(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  if (reduceMotion) renderOnce(); else start();
  requestAnimationFrame(() => canvas.classList.add('is-ready'));
}
