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
  if (kind === 'rain') return `${(12 + Math.sin(elapsedTime * 0.3) * 4).toFixed(1)} mm`;
  return '1080P · 在线';
}

function App() {
  const sceneRef = useRef(null);
  const simRef = useRef(null);
  const [activeView, setActiveView] = useState('drone');
  const [loading, setLoading] = useState(true);
  const [tip, setTip] = useState(null);
  const [params, setParams] = useState({ levelRaw: 42, flowRaw: 35, waveRaw: 45 });
  const [devices, setDevices] = useState(() =>
    initialDeviceDefs.map((device) => ({ ...device, on: true })),
  );

  const state = useMemo(
    () => ({
      level: (params.levelRaw / 100) * 8,
      flow: (params.flowRaw / 100) * 3.5,
      wave: (params.waveRaw / 100) * 2,
    }),
    [params],
  );

  useEffect(() => {
    if (simRef.current) {
      simRef.current.state = state;
      simRef.current.waterUniforms.uLevel.value = state.level;
      simRef.current.waterUniforms.uFlow.value = Math.max(0.15, state.flow);
      simRef.current.waterUniforms.uWave.value = state.wave;
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
    scene.fog = new THREE.FogExp2(0x8fb0bf, 0.0034);
    scene.background = new THREE.Color(0x506f86);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.position.set(120, 95, 150);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 25;
    controls.maxDistance = 600;
    controls.target.set(0, 6, 0);

    const sun = new THREE.DirectionalLight(0xfff2d8, 1.5);
    sun.position.set(-160, 220, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 700;
    sun.shadow.camera.left = -260;
    sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260;
    sun.shadow.camera.bottom = -260;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x4a3b2e, 0.7));
    scene.add(new THREE.AmbientLight(0x405060, 0.4));

    const skyGeo = new THREE.SphereGeometry(2000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTop: { value: new THREE.Color(0x2a6fb0) },
        uBot: { value: new THREE.Color(0xcfe6f2) },
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
    const cLow = new THREE.Color(0x3a5a32);
    const cRock = new THREE.Color(0x6b6256);
    const cSnow = new THREE.Color(0xe8eef2);
    const cSand = new THREE.Color(0x8a7a55);
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = ridge(x, z);
      pos.setY(i, h);
      const color = new THREE.Color();
      if (h < 2) color.copy(cSand);
      else if (h < 28) color.copy(cLow).lerp(cSand, Math.max(0, (8 - h) / 8 > 0 ? (8 - h) / 8 : 0));
      else if (h < 70) color.copy(cLow).lerp(cRock, (h - 28) / 42);
      else color.copy(cRock).lerp(cSnow, Math.min(1, (h - 70) / 35));
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

    const chanHalf = 70.0;
    const waterUniforms = {
      uTime: { value: 0 },
      uFlow: { value: Math.max(0.15, state.flow) },
      uWave: { value: state.wave },
      uLevel: { value: state.level },
      uShallow: { value: new THREE.Color(0x4fc6d8) },
      uDeep: { value: new THREE.Color(0x07304b) },
      uSky: { value: new THREE.Color(0x9fc4dd) },
      uSkyTop: { value: new THREE.Color(0x3a7fc0) },
      uSun: { value: sun.position.clone().normalize() },
      uChanHalf: { value: chanHalf },
    };
    const waterGeo = new THREE.PlaneGeometry(170, size, 220, 340);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: waterUniforms,
      vertexShader: `
        uniform float uTime,uFlow,uWave,uLevel;
        varying float vCrest; varying vec3 vWorld; varying vec3 vNormal; varying float vBank;
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
          p.x += meander(p.z);
          vec2 xz = vec2(p.x, p.z);
          float t = uTime;
          vec3 nrm = vec3(0.0,1.0,0.0);
          vec3 disp = vec3(0.0);
          float amp = uWave;
          disp += gerstner(vec2(0.1, 1.0), 0.55*amp, 36.0, 1.2*uFlow, xz, t, nrm);
          disp += gerstner(vec2(0.6, 1.0), 0.32*amp, 18.0, 1.6*uFlow, xz, t, nrm);
          disp += gerstner(vec2(-0.7,1.0), 0.22*amp, 11.0, 2.0*uFlow, xz, t, nrm);
          disp += gerstner(vec2(1.0, 0.2), 0.14*amp,  6.5, 2.6*uFlow, xz, t, nrm);
          p += disp;
          p.y += uLevel;
          vCrest = disp.y;
          vBank = clamp(abs(localX)/85.0, 0.0, 1.0);
          vec4 wp = modelMatrix*vec4(p,1.0);
          vWorld = wp.xyz;
          vNormal = normalize(nrm);
          gl_Position = projectionMatrix*viewMatrix*wp;
        }`,
      fragmentShader: `
        uniform vec3 uShallow,uDeep,uSky,uSkyTop,uSun; uniform float uTime,uFlow;
        varying float vCrest; varying vec3 vWorld; varying vec3 vNormal; varying float vBank;
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
          vec3 col = mix(body, refl, fres*0.85);
          vec3 H = normalize(uSun + V);
          col += vec3(1.0)*pow(max(dot(N,H),0.0), 200.0)*1.4;
          float crestFoam = smoothstep(0.45, 0.9, vCrest);
          float stripe = sin(vWorld.z*0.6 - uTime*5.0*uFlow + vWorld.x*0.2)*0.5+0.5;
          float bankFoam = smoothstep(0.72, 1.0, vBank) * (0.5+0.5*stripe);
          float foam = clamp(crestFoam*0.6 + bankFoam, 0.0, 1.0);
          col = mix(col, vec3(0.95,0.98,1.0), foam);
          float alpha = mix(0.86, 1.0, foam);
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
      mistPos[i * 3] = fallMX + (Math.random() - 0.5) * 38;
      mistPos[i * 3 + 1] = ridge(fallMX, fallZ) + Math.random() * 14;
      mistPos[i * 3 + 2] = fallZ + (Math.random() - 0.5) * 16;
    }
    const mistGeo = new THREE.BufferGeometry();
    mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
    const mist = new THREE.Points(
      mistGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 3.5, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    scene.add(mist);

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

    simRef.current = { waterUniforms, devices: stationObjects, state, goView };
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
