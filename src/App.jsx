import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import SimplexNoise from 'simplex-noise';

const viewOptions = [
  { id: 'drone', icon: '◇', label: '无人机巡航' },
  { id: 'near', icon: '⌕', label: '近景细查' },
  { id: 'far', icon: '△', label: '远景全景' },
  { id: 'top', icon: '▣', label: '正俯视' },
  { id: 'free', icon: '↕', label: '自由操作' },
];

const initialDeviceDefs = [
  { name: '水位监测站 WL-01', z: -180, color: 0x37c0fc, kind: 'level' },
  { name: '流速传感器 FV-02', z: -60, color: 0x37c0fc, kind: 'flow' },
  { name: '雨量计 RG-03', z: 40, color: 0x9affc0, kind: 'rain' },
  { name: '视频监控 CAM-04', z: 150, color: 0xffd24a, kind: 'camera' },
];

function deviceReading(kind, state, elapsedTime = 0) {
  if (kind === 'level') return `${state.level.toFixed(2)} m`;
  if (kind === 'flow') return `${state.flow.toFixed(2)} m/s`;
  if (kind === 'rain') return `${(state.rain + Math.sin(elapsedTime * 0.3) * 2).toFixed(1)} mm/h`;
  return '1080P · 在线';
}

function getRiskInfo(state) {
  const score = state.level * 5.8 + state.flow * 12 + state.rain * 0.62;
  if (score >= 115) return { label: '红色预警', tone: 'danger', note: '山洪风险高' };
  if (score >= 88) return { label: '橙色预警', tone: 'warning', note: '需加强巡查' };
  if (score >= 64) return { label: '黄色关注', tone: 'watch', note: '水位持续观察' };
  return { label: '运行平稳', tone: 'normal', note: '设备状态正常' };
}

function App() {
  const sceneRef = useRef(null);
  const simRef = useRef(null);
  const [activeView, setActiveView] = useState('drone');
  const [loading, setLoading] = useState(true);
  const [tip, setTip] = useState(null);
  const [params, setParams] = useState({ levelRaw: 56, flowRaw: 35, waveRaw: 45, rainRaw: 24 });
  const [devices, setDevices] = useState(() =>
    initialDeviceDefs.map((device) => ({ ...device, on: true })),
  );

  const state = useMemo(
    () => ({
      level: 1.2 + (params.levelRaw / 100) * 10.5,
      flow: (params.flowRaw / 100) * 3.5,
      wave: (params.waveRaw / 100) * 2,
      rain: (params.rainRaw / 100) * 90,
    }),
    [params],
  );

  useEffect(() => {
    if (simRef.current) {
      simRef.current.state = state;
      simRef.current.waterUniforms.uLevel.value = state.level;
      simRef.current.waterUniforms.uFlow.value = Math.max(0.15, state.flow);
      simRef.current.waterUniforms.uWave.value = state.wave;
      simRef.current.rainMaterial.opacity = THREE.MathUtils.clamp(state.rain / 90, 0.04, 0.62);
      simRef.current.rain.visible = state.rain > 1;
    }
  }, [state]);

  useEffect(() => {
    if (!simRef.current) return;
    devices.forEach((device, index) => {
      const station = simRef.current.devices[index];
      station.userData.on = device.on;
      station.visible = device.on;
    });
  }, [devices]);

  useEffect(() => {
    if (!simRef.current) return;
    simRef.current.goView(activeView);
  }, [activeView]);

  useEffect(() => {
    const host = sceneRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x89a7b2, 0.0028);
    scene.background = new THREE.Color(0x54788f);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.position.set(120, 95, 150);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 25;
    controls.maxDistance = 600;
    controls.target.set(0, 6, 0);

    const sun = new THREE.DirectionalLight(0xfff0d2, 1.15);
    sun.position.set(-190, 190, 95);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 700;
    sun.shadow.camera.left = -260;
    sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260;
    sun.shadow.camera.bottom = -260;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xc6e5ff, 0x3c342b, 0.48));
    scene.add(new THREE.AmbientLight(0x34414b, 0.28));

    const skyGeo = new THREE.SphereGeometry(2000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTop: { value: new THREE.Color(0x4f86b0) },
        uBot: { value: new THREE.Color(0xbbd0cf) },
        uSun: { value: sun.position.clone().normalize() },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: `uniform vec3 uTop,uBot,uSun; varying vec3 vDir;
        void main(){ float h=clamp(vDir.y*0.5+0.5,0.0,1.0); vec3 c=mix(uBot,uTop,pow(h,0.7));
          float s=pow(max(dot(normalize(vDir),uSun),0.0),120.0); c+=vec3(1.0,0.95,0.8)*s*0.8;
          gl_FragColor=vec4(c,1.0);} `,
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    const size = 600;
    const seg = 240;
    const simplex = new SimplexNoise('hydro-seed');

    function ridge(x, z) {
      let n = 0;
      let amp = 1;
      let freq = 0.0025;
      let sum = 0;
      for (let o = 0; o < 5; o += 1) {
        n += amp * simplex.noise2D(x * freq, z * freq);
        sum += amp;
        amp *= 0.5;
        freq *= 2.05;
      }
      n /= sum;
      let h = (n * 0.5 + 0.5) ** 1.4 * 110;
      const meander = Math.sin(z * 0.012) * 46 + Math.sin(z * 0.031) * 18;
      const dist = Math.abs(x - meander);
      const valley = Math.max(0, 1 - dist / 70);
      h -= valley ** 1.8 * 56;
      h -= z * 0.02;
      return h;
    }

    const terrainGeo = new THREE.PlaneGeometry(size, size, seg, seg);
    terrainGeo.rotateX(-Math.PI / 2);
    const pos = terrainGeo.attributes.position;
    const colors = [];
    const cWetBank = new THREE.Color(0x5a6650);
    const cGrass = new THREE.Color(0x3f6338);
    const cMoss = new THREE.Color(0x5f7a44);
    const cAlpine = new THREE.Color(0x4f6142);
    const cRock = new THREE.Color(0x5e6159);
    const cDarkRock = new THREE.Color(0x3f423e);
    const cSnow = new THREE.Color(0xd8ddd8);
    const cGravel = new THREE.Color(0x78705d);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = ridge(x, z);
      pos.setY(i, h);
      const meander = Math.sin(z * 0.012) * 46 + Math.sin(z * 0.031) * 18;
      const riverDist = Math.abs(x - meander);
      const slope =
        (Math.abs(ridge(x + 3, z) - ridge(x - 3, z)) + Math.abs(ridge(x, z + 3) - ridge(x, z - 3))) / 26;
      const moisture = THREE.MathUtils.clamp(1 - riverDist / 120, 0, 1);
      const fineNoise = simplex.noise2D(x * 0.055 + 4.7, z * 0.055 - 8.1) * 0.5 + 0.5;
      const color = new THREE.Color();
      if (riverDist < 78) color.copy(cWetBank).lerp(cGravel, THREE.MathUtils.clamp((riverDist - 35) / 43, 0, 1));
      else if (h < 28) color.copy(cGrass).lerp(cMoss, moisture * 0.65);
      else if (h < 88) color.copy(cAlpine).lerp(cRock, THREE.MathUtils.clamp((h - 34) / 78 + slope * 0.28, 0, 0.82));
      else color.copy(cRock).lerp(cSnow, Math.min(1, (h - 94) / 34));
      color.lerp(cDarkRock, THREE.MathUtils.clamp(slope - 0.42, 0, 0.55));
      color.multiplyScalar(0.86 + fineNoise * 0.22);
      colors.push(color.r, color.g, color.b);
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();
    const terrain = new THREE.Mesh(
      terrainGeo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.0, flatShading: false }),
    );
    terrain.receiveShadow = true;
    scene.add(terrain);

    function seededRand(seed) {
      const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return value - Math.floor(value);
    }

    function riverCenter(z) {
      return Math.sin(z * 0.012) * 46 + Math.sin(z * 0.031) * 18;
    }

    function localSlope(x, z) {
      return (
        Math.abs(ridge(x + 3, z) - ridge(x - 3, z)) + Math.abs(ridge(x, z + 3) - ridge(x, z - 3))
      ) / 26;
    }

    const treeCount = 180;
    const trunkMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.42, 0.58, 6, 7),
      new THREE.MeshStandardMaterial({ color: 0x4a3324, roughness: 0.9 }),
      treeCount,
    );
    const crownMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(3.4, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x214a31, roughness: 0.88 }),
      treeCount,
    );
    const dummy = new THREE.Object3D();
    let placedTrees = 0;
    for (let i = 0; placedTrees < treeCount && i < treeCount * 7; i += 1) {
      const x = seededRand(i + 3) * size - size / 2;
      const z = seededRand(i + 47) * size - size / 2;
      const h = ridge(x, z);
      const riverDist = Math.abs(x - riverCenter(z));
      const slope = localSlope(x, z);
      if (riverDist < 96 || h < 4 || h > 72 || slope > 0.78) continue;
      const scale = 0.75 + Math.abs(seededRand(i + 91)) * 0.75;
      const lean = (seededRand(i + 123) - 0.5) * 0.13;
      dummy.position.set(x, h + 3 * scale, z);
      dummy.rotation.set(lean, seededRand(i + 142) * Math.PI * 2, -lean * 0.6);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(placedTrees, dummy.matrix);

      dummy.position.set(x, h + 8.7 * scale, z);
      dummy.rotation.set(lean * 0.8, seededRand(i + 177) * Math.PI * 2, -lean * 0.5);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      crownMesh.setMatrixAt(placedTrees, dummy.matrix);
      placedTrees += 1;
    }
    trunkMesh.castShadow = true;
    crownMesh.castShadow = true;
    trunkMesh.count = placedTrees;
    crownMesh.count = placedTrees;
    scene.add(trunkMesh, crownMesh);

    const rockCount = 95;
    const rockMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x5e5b52, roughness: 0.97 }),
      rockCount,
    );
    let placedRocks = 0;
    for (let i = 0; placedRocks < rockCount && i < rockCount * 6; i += 1) {
      const z = seededRand(i + 301) * size - size / 2;
      const side = seededRand(i + 302) > 0.5 ? 1 : -1;
      const x = riverCenter(z) + side * (78 + Math.abs(seededRand(i + 303)) * 48);
      const h = ridge(x, z);
      if (h < -10 || h > 88) continue;
      const scale = 0.8 + Math.abs(seededRand(i + 304)) * 3.2;
      dummy.position.set(x, h + scale * 0.45, z);
      dummy.rotation.set(
        seededRand(i + 305) * Math.PI,
        seededRand(i + 306) * Math.PI,
        seededRand(i + 307) * Math.PI,
      );
      dummy.scale.set(scale * 1.25, scale * 0.62, scale * (0.8 + Math.abs(seededRand(i + 308)) * 0.8));
      dummy.updateMatrix();
      rockMesh.setMatrixAt(placedRocks, dummy.matrix);
      placedRocks += 1;
    }
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    rockMesh.count = placedRocks;
    scene.add(rockMesh);

    const chanHalf = 70.0;
    const waterUniforms = {
      uTime: { value: 0 },
      uFlow: { value: Math.max(0.15, state.flow) },
      uWave: { value: state.wave },
      uLevel: { value: state.level },
      uShallow: { value: new THREE.Color(0x55a9aa) },
      uDeep: { value: new THREE.Color(0x082c3f) },
      uSky: { value: new THREE.Color(0x8fb0bf) },
      uSkyTop: { value: new THREE.Color(0x4f86b0) },
      uSun: { value: sun.position.clone().normalize() },
      uChanHalf: { value: chanHalf },
    };
    function riverBaseHeight(z) {
      const samples = [-12, -6, 0, 6, 12];
      let total = 0;
      samples.forEach((offset, index) => {
        const sampleZ = z + offset;
        const weight = index === 2 ? 2 : 1;
        total += ridge(riverCenter(sampleZ), sampleZ) * weight;
      });
      return total / 6 - 0.7;
    }

    function createRiverGeometry() {
      const xSeg = 72;
      const zSeg = 360;
      const halfWidth = 58;
      const positions = [];
      const uvs = [];
      const indices = [];

      for (let zi = 0; zi <= zSeg; zi += 1) {
        const z = -size / 2 + (zi / zSeg) * size;
        const width = halfWidth + Math.sin(z * 0.036) * 5 + simplex.noise2D(11.4, z * 0.018) * 4;
        const baseY = riverBaseHeight(z);
        for (let xi = 0; xi <= xSeg; xi += 1) {
          const u = xi / xSeg;
          const centered = u * 2 - 1;
          const edge = Math.abs(centered);
          const localX = centered * width;
          const bankDip = Math.pow(edge, 2.8) * 0.55;
          positions.push(localX, baseY - bankDip, z);
          uvs.push(u, zi / zSeg);
        }
      }

      for (let zi = 0; zi < zSeg; zi += 1) {
        for (let xi = 0; xi < xSeg; xi += 1) {
          const a = zi * (xSeg + 1) + xi;
          const b = a + 1;
          const c = a + (xSeg + 1);
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    }

    const waterGeo = createRiverGeometry();
    const waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: waterUniforms,
      vertexShader: `
        uniform float uTime,uFlow,uWave,uLevel;
        varying float vCrest; varying vec3 vWorld; varying vec3 vNormal; varying float vBank; varying float vEdge;
        float meander(float z){ return sin(z*0.012)*46.0 + sin(z*0.031)*18.0; }
        vec3 gerstner(vec2 d, float steep, float wl, float speed, vec2 xz, float t, inout vec3 nrm){
          float k = 6.2831853/wl;
          d = normalize(d);
          float f = k*(dot(d,xz)) + t*speed*k;
          float a = steep/k;
          float c = cos(f), s = sin(f);
          nrm.x -= d.x*k*a*c;
          nrm.z -= d.y*k*a*c;
          nrm.y -= steep*s*0.0;
          return vec3(d.x*a*c, a*s, d.y*a*c);
        }
        void main(){
          vec3 p = position;
          float localX = p.x;
          float edge = clamp(abs(localX)/64.0, 0.0, 1.0);
          p.x += meander(p.z);
          vec2 xz = vec2(p.x, p.z);
          float t = uTime;
          vec3 nrm = vec3(0.0,1.0,0.0);
          vec3 disp = vec3(0.0);
          float amp = uWave * 0.34 * smoothstep(1.0, 0.28, edge);
          disp += gerstner(vec2(0.08, 1.0), 0.24*amp, 42.0, 1.05*uFlow, xz, t, nrm);
          disp += gerstner(vec2(0.42, 1.0), 0.16*amp, 20.0, 1.45*uFlow, xz, t, nrm);
          disp += gerstner(vec2(-0.48,1.0), 0.10*amp, 12.0, 1.9*uFlow, xz, t, nrm);
          disp += gerstner(vec2(0.9, 0.18), 0.045*amp, 7.5, 2.2*uFlow, xz, t, nrm);
          p += disp;
          p.y += uLevel - smoothstep(0.76, 1.0, edge) * 1.9;
          vCrest = disp.y;
          vBank = edge;
          vEdge = edge;
          vec4 wp = modelMatrix*vec4(p,1.0);
          vWorld = wp.xyz;
          vNormal = normalize(nrm);
          gl_Position = projectionMatrix*viewMatrix*wp;
        }`,
      fragmentShader: `
        uniform vec3 uShallow,uDeep,uSky,uSkyTop,uSun; uniform float uTime,uFlow;
        varying float vCrest; varying vec3 vWorld; varying vec3 vNormal; varying float vBank; varying float vEdge;
        vec3 skyColor(vec3 r){
          float h = clamp(r.y*0.5+0.5, 0.0, 1.0);
          vec3 c = mix(uSky, uSkyTop, pow(h,0.7));
          float sun = pow(max(dot(normalize(r), uSun),0.0), 200.0);
          c += vec3(1.0,0.95,0.85)*sun*1.2;
          return c;
        }
        void main(){
          vec3 N = normalize(vNormal);
          vec3 V = normalize(cameraPosition - vWorld);
          vec3 R = reflect(-V, N);
          float fres = 0.02 + 0.98*pow(1.0 - max(dot(V,N),0.0), 5.0);
          vec3 body = mix(uDeep, uShallow, clamp(vCrest*0.6+0.5,0.0,1.0));
          vec3 refl = skyColor(R);
          vec3 col = mix(body, refl, fres*0.42);
          vec3 H = normalize(uSun + V);
          col += vec3(0.9,0.96,1.0)*pow(max(dot(N,H),0.0), 140.0)*0.34;
          float crestFoam = smoothstep(0.38, 0.72, vCrest);
          float stripe = sin(vWorld.z*0.42 - uTime*3.6*uFlow + vWorld.x*0.16)*0.5+0.5;
          float fine = sin(vWorld.z*1.25 - uTime*8.0*uFlow + vWorld.x*0.55)*0.5+0.5;
          float currentLine = sin(vWorld.x*0.12 + sin(vWorld.z*0.035)*2.6 - uTime*uFlow*1.8)*0.5+0.5;
          currentLine *= sin(vWorld.x*0.34 + vWorld.z*0.09 - uTime*uFlow*4.2)*0.5+0.5;
          float midChannel = 1.0 - smoothstep(0.35, 0.9, vBank);
          float streakFoam = smoothstep(0.84, 0.98, currentLine) * midChannel * 0.18;
          float bankFoam = smoothstep(0.78, 0.96, vBank) * (0.18+0.34*stripe*fine);
          float foam = clamp(crestFoam*0.12 + bankFoam + streakFoam, 0.0, 0.44);
          col = mix(col, vec3(0.82,0.9,0.9), foam);
          col += vec3(0.03,0.07,0.07) * streakFoam;
          col = mix(col, uDeep, smoothstep(0.94, 1.0, vEdge) * 0.55);
          float alpha = mix(0.82, 0.95, foam);
          alpha = mix(alpha, 1.0, fres*0.3);
          gl_FragColor = vec4(col, alpha);
        }`,
    });
    scene.add(new THREE.Mesh(waterGeo, waterMat));

    const fallZ = 90;
    const fallMX = Math.sin(fallZ * 0.012) * 46 + Math.sin(fallZ * 0.031) * 18;
    const fallGeo = new THREE.PlaneGeometry(40, 26, 20, 20);
    const fallMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 }, uFlow: waterUniforms.uFlow },
      vertexShader: 'varying vec2 vUv; uniform float uTime; void main(){ vUv=uv; vec3 p=position; p.x += sin(p.y*1.5+uTime*4.0)*0.4; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);} ',
      fragmentShader: `varying vec2 vUv; uniform float uTime,uFlow;
        void main(){ float v=fract(vUv.y*4.0 + uTime*3.0*uFlow);
          float streak = smoothstep(0.0,0.5,v)*smoothstep(1.0,0.5,v);
          float n = sin(vUv.x*60.0)*0.5+0.5;
          vec3 c = mix(vec3(0.55,0.78,0.9), vec3(0.97,0.99,1.0), streak*n);
          float a = 0.55 + streak*0.45;
          gl_FragColor=vec4(c, a*smoothstep(1.0,0.6,vUv.y));} `,
    });
    const waterfall = new THREE.Mesh(fallGeo, fallMat);
    waterfall.position.set(fallMX, ridge(fallMX, fallZ) + 10, fallZ);
    waterfall.rotation.x = -0.35;
    scene.add(waterfall);

    const mistN = 120;
    const mistPos = new Float32Array(mistN * 3);
    for (let i = 0; i < mistN; i += 1) {
      mistPos[i * 3] = fallMX + (Math.random() - 0.5) * 28;
      mistPos[i * 3 + 1] = ridge(fallMX, fallZ) + Math.random() * 11;
      mistPos[i * 3 + 2] = fallZ + (Math.random() - 0.5) * 12;
    }
    const mistGeo = new THREE.BufferGeometry();
    mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
    const mist = new THREE.Points(
      mistGeo,
      new THREE.PointsMaterial({ color: 0xdfeff2, size: 2.4, transparent: true, opacity: 0.18, depthWrite: false }),
    );
    scene.add(mist);

    const rainCount = 720;
    const rainPositions = new Float32Array(rainCount * 2 * 3);
    const rainGeo = new THREE.BufferGeometry();
    function resetRainDrop(index, high = false) {
      const x = seededRand(index * 3 + 601) * size - size / 2;
      const z = seededRand(index * 3 + 602) * size - size / 2;
      const y = (high ? 120 : 30) + seededRand(index * 3 + 603) * 170;
      const offset = index * 6;
      rainPositions[offset] = x;
      rainPositions[offset + 1] = y;
      rainPositions[offset + 2] = z;
      rainPositions[offset + 3] = x - 2.2;
      rainPositions[offset + 4] = y - 14;
      rainPositions[offset + 5] = z + 1.4;
    }
    for (let i = 0; i < rainCount; i += 1) resetRainDrop(i, true);
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMaterial = new THREE.LineBasicMaterial({
      color: 0xbfdbe6,
      transparent: true,
      opacity: THREE.MathUtils.clamp(state.rain / 90, 0.04, 0.62),
      depthWrite: false,
    });
    const rain = new THREE.LineSegments(rainGeo, rainMaterial);
    rain.visible = state.rain > 1;
    scene.add(rain);

    function makeStation(def) {
      const group = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.6, 16, 8),
        new THREE.MeshStandardMaterial({ color: 0xb8c4cc, metalness: 0.7, roughness: 0.4 }),
      );
      pole.position.y = 8;
      pole.castShadow = true;
      group.add(pole);

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(4, 3, 2.4),
        new THREE.MeshStandardMaterial({ color: 0x2b3a45, metalness: 0.5, roughness: 0.5 }),
      );
      box.position.y = 12;
      box.castShadow = true;
      group.add(box);

      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.3, 4),
        new THREE.MeshStandardMaterial({ color: 0x16314d, metalness: 0.4, roughness: 0.3, emissive: 0x0a1622 }),
      );
      panel.position.set(0, 17, 0);
      panel.rotation.z = 0.35;
      panel.castShadow = true;
      group.add(panel);

      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 16, 16),
        new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 2 }),
      );
      led.position.set(2.2, 13, 0);
      group.add(led);

      group.userData = { def, led, on: true };
      const mz = Math.sin(def.z * 0.012) * 46 + Math.sin(def.z * 0.031) * 18;
      const bankX = mz + 40;
      group.position.set(bankX, ridge(bankX, def.z), def.z);
      return group;
    }

    const stationObjects = initialDeviceDefs.map((def) => {
      const station = makeStation(def);
      scene.add(station);
      return station;
    });

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const clock = new THREE.Clock();
    const views = {
      drone: { pos: [120, 95, 150], tgt: [0, 6, 0] },
      near: { pos: [55, 28, -150], tgt: [0, 4, -180] },
      far: { pos: [260, 200, 300], tgt: [0, 10, 0] },
      top: { pos: [0, 420, 1], tgt: [0, 0, 0] },
      free: { pos: [120, 80, 150], tgt: [0, 6, 0] },
    };

    let frame = 0;
    let camAnim = null;
    let droneMode = true;
    let droneAngle = 0;
    let disposed = false;

    function goView(name) {
      const view = views[name];
      droneMode = name === 'drone';
      controls.enablePan = name === 'free';
      const fromP = camera.position.clone();
      const fromT = controls.target.clone();
      const toP = new THREE.Vector3(...view.pos);
      const toT = new THREE.Vector3(...view.tgt);
      let step = 0;
      camAnim = () => {
        step = Math.min(1, step + 0.025);
        const e = step < 0.5 ? 2 * step * step : 1 - ((-2 * step + 2) ** 2) / 2;
        camera.position.lerpVectors(fromP, toP, e);
        controls.target.lerpVectors(fromT, toT, e);
        if (step >= 1) camAnim = null;
      };
    }

    function onMouseMove(event) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(stationObjects.filter((device) => device.userData.on), true);
      if (!hits.length) {
        setTip(null);
        return;
      }
      let group = hits[0].object;
      while (group.parent && !group.userData.def) group = group.parent;
      if (!group.userData.def) {
        setTip(null);
        return;
      }
      const current = simRef.current?.state ?? state;
      setTip({
        x: event.clientX + 14,
        y: event.clientY + 14,
        name: group.userData.def.name,
        status: '● 正常',
        read: deviceReading(group.userData.def.kind, current, clock.elapsedTime),
      });
    }

    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
      if (disposed) return;
      frame = window.requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const t = clock.elapsedTime;
      waterUniforms.uTime.value = t;
      fallMat.uniforms.uTime.value = t;

      const mistPosition = mistGeo.attributes.position;
      for (let i = 0; i < mistN; i += 1) {
        let y = mistPosition.getY(i) + dt * (2 + Math.random() * 1.5) * waterUniforms.uFlow.value;
        if (y > ridge(fallMX, fallZ) + 16) y = ridge(fallMX, fallZ) + Math.random() * 3;
        mistPosition.setY(i, y);
      }
      mistPosition.needsUpdate = true;

      if (rain.visible) {
        const rainSpeed = 58 + (simRef.current?.state.rain ?? 0) * 1.35;
        const rainAttr = rainGeo.attributes.position;
        for (let i = 0; i < rainCount; i += 1) {
          const offset = i * 2;
          const topY = rainAttr.getY(offset) - dt * rainSpeed;
          const bottomY = rainAttr.getY(offset + 1) - dt * rainSpeed;
          if (bottomY < -8) {
            resetRainDrop(i, true);
          } else {
            rainAttr.setY(offset, topY);
            rainAttr.setY(offset + 1, bottomY);
          }
        }
        rainAttr.needsUpdate = true;
      }

      stationObjects.forEach((device) => {
        if (device.userData.on) {
          device.userData.led.material.emissiveIntensity = 1.5 + Math.sin(t * 3) * 0.7;
        }
      });

      if (droneMode && !camAnim) {
        droneAngle += dt * 0.12;
        const radius = 190;
        const height = 90 + Math.sin(t * 0.3) * 25;
        camera.position.set(Math.cos(droneAngle) * radius, height, Math.sin(droneAngle) * radius);
        controls.target.set(0, 8, Math.sin(t * 0.1) * 40);
      }

      if (camAnim) camAnim();
      controls.update();
      renderer.render(scene, camera);
    }

    simRef.current = { waterUniforms, devices: stationObjects, state, goView, rain, rainMaterial };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);
    goView('drone');
    animate();

    const loaderTimer = window.setTimeout(() => setLoading(false), 600);

    return () => {
      disposed = true;
      window.clearTimeout(loaderTimer);
      window.cancelAnimationFrame(frame);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
      simRef.current = null;
    };
  }, []);

  const onlineCount = devices.filter((device) => device.on).length;
  const waveText = params.waveRaw < 33 ? '低' : params.waveRaw < 66 ? '中' : '高';
  const rainText = state.rain < 8 ? '无雨' : state.rain < 28 ? '小雨' : state.rain < 55 ? '中雨' : '强降雨';
  const riskInfo = getRiskInfo(state);

  function updateParam(key, value) {
    setParams((current) => ({ ...current, [key]: Number(value) }));
  }

  function toggleDevice(index) {
    setDevices((current) =>
      current.map((device, i) => (i === index ? { ...device, on: !device.on } : device)),
    );
  }

  return (
    <div className="app">
      <div ref={sceneRef} className="scene" />

      <div className="topbar hud">
        <span className="dot" />
        <span className="title">山区水文监测站 · 三维态势</span>
        <span className="stat">
          水位 <b>{state.level.toFixed(2)} m</b>
        </span>
        <span className="stat">
          流速 <b>{state.flow.toFixed(2)} m/s</b>
        </span>
        <span className="stat">
          雨量 <b>{state.rain.toFixed(1)} mm/h</b>
        </span>
        <span className={`stat risk-stat ${riskInfo.tone}`}>
          风险 <b>{riskInfo.label}</b>
        </span>
        <span className="stat">
          在线设备 <b>{onlineCount} / {devices.length}</b>
        </span>
      </div>

      <div className="views hud">
        <div className="label">视角 VIEW</div>
        {viewOptions.map((view) => (
          <button
            key={view.id}
            className={`btn ${activeView === view.id ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveView(view.id)}
          >
            <span className="ico">{view.icon}</span>
            {view.label}
          </button>
        ))}
      </div>

      <div className="controls hud">
        <h3>水流参数</h3>
        <label className="ctl">
          <div className="row">
            <span>水位高度</span>
            <b>{state.level.toFixed(1)} m</b>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={params.levelRaw}
            onChange={(event) => updateParam('levelRaw', event.target.value)}
          />
        </label>
        <label className="ctl">
          <div className="row">
            <span>流速</span>
            <b>{state.flow.toFixed(1)} m/s</b>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={params.flowRaw}
            onChange={(event) => updateParam('flowRaw', event.target.value)}
          />
        </label>
        <label className="ctl">
          <div className="row">
            <span>浪高</span>
            <b>{waveText}</b>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={params.waveRaw}
            onChange={(event) => updateParam('waveRaw', event.target.value)}
          />
        </label>

        <h3 className="device-title">降雨情景</h3>
        <label className="ctl">
          <div className="row">
            <span>降雨强度</span>
            <b>{rainText}</b>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={params.rainRaw}
            onChange={(event) => updateParam('rainRaw', event.target.value)}
          />
        </label>
        <div className={`risk-card ${riskInfo.tone}`}>
          <div>
            <span>综合风险</span>
            <b>{riskInfo.label}</b>
          </div>
          <p>{riskInfo.note}</p>
        </div>

        <h3 className="device-title">仪器设备</h3>
        <div>
          {devices.map((device, index) => (
            <div className="switch" key={device.name}>
              <span>{device.name.split(' ')[0]}</span>
              <button
                type="button"
                aria-label={`${device.on ? '关闭' : '开启'}${device.name}`}
                className={`toggle ${device.on ? 'on' : ''}`}
                onClick={() => toggleDevice(index)}
              />
            </div>
          ))}
        </div>
      </div>

      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }}>
          <div className="t">{tip.name}</div>
          <div className="v">
            <span>状态</span>
            <span>{tip.status}</span>
          </div>
          <div className="v">
            <span>读数</span>
            <span>{tip.read}</span>
          </div>
        </div>
      )}

      <div className="hint">鼠标左键旋转 · 滚轮缩放 · 右键平移（自由视角下）</div>

      {loading && (
        <div className="loader">
          <div className="ring" />
          <div className="text">正在生成山体与水流...</div>
        </div>
      )}
    </div>
  );
}

export default App;
