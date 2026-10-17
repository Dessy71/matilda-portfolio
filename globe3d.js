/* ============================================================
   GLOBE — Three.js dot-matrix earth
   Real land-mask points, great-circle shipment arcs, pins.
   Drag to spin · fully self-contained shading.
   ============================================================ */
(function () {
  if (!window.THREE || !window.LAND_DOTS) return;

  var host = document.getElementById('globeCanvas');
  if (!host) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var DEG = Math.PI / 180;
  var FRONT = -Math.PI / 2;   // longitude -0.0° faces the camera

  var renderer, scene, camera, globe, pins = [], arcDots = [];
  var drag = { active: false, x: 0, vel: 0 };
  var mouseTilt = { x: 0, y: 0 };
  var paused = false;
  var t0 = performance.now();

  var MARKERS = [
    { name: 'Kumasi, GH', lat: 6.69, lon: -1.62, major: true, side: 'right' },
    { name: 'München, DE', lat: 48.14, lon: 11.58, side: 'left', dy: 2 },
    { name: 'Berlin, DE', lat: 52.52, lon: 13.41, side: 'right', dy: 34 },
    { name: 'Espoo, FI', lat: 60.21, lon: 24.66, side: 'left', dy: 46 },
    { name: 'Hong Kong', lat: 22.32, lon: 114.17, side: 'right' },
    { name: 'Buffalo, US', lat: 42.89, lon: -78.88, side: 'left', dy: 14 }
  ];

  function latLonToVec(lat, lon, r) {
    var la = lat * DEG, lo = lon * DEG;
    return new THREE.Vector3(
      Math.cos(la) * Math.cos(lo) * r,
      Math.sin(la) * r,
      Math.cos(la) * Math.sin(lo) * r
    );
  }

  function landPoints() {
    var pts = window.LAND_DOTS;
    var pos = new Float32Array(pts.length * 3);
    for (var i = 0; i < pts.length; i++) {
      var v = latLonToVec(pts[i][1], pts[i][0], 1.002);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    var mat = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: 2.6 },
        uRatio: { value: renderer.getPixelRatio() },
        uColor: { value: new THREE.Color(0xC7F04B) }
      },
      vertexShader: [
        'uniform float uSize; uniform float uRatio;',
        'varying float vFace;',
        'void main(){',
        '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
        '  vec3 n = normalize(normalMatrix * normalize(position));',
        '  vFace = n.z;',
        '  gl_Position = projectionMatrix * mv;',
        '  gl_PointSize = uSize * uRatio * (1.9 / max(0.3, -mv.z));',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor;',
        'varying float vFace;',
        'void main(){',
        '  vec2 c = gl_PointCoord - 0.5;',
        '  float a = smoothstep(0.5, 0.18, length(c));',
        '  float face = smoothstep(-0.62, 0.25, vFace);',
        '  gl_FragColor = vec4(uColor, a * (0.22 + face * 0.86));',
        '}'
      ].join('\n'),
      transparent: true,
      depthWrite: false
    });
    return new THREE.Points(geo, mat);
  }

  function graticule() {
    var g = new THREE.Group();
    var mat = new THREE.LineBasicMaterial({ color: 0x63a191, transparent: true, opacity: 0.075 });
    var r = 1.004;
    for (var lat = -60; lat <= 60; lat += 30) {
      var p = [];
      for (var lon = -180; lon <= 180; lon += 4) p.push(latLonToVec(lat, lon, r));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), mat));
    }
    for (var ln = -180; ln < 180; ln += 30) {
      var q = [];
      for (var la = -90; la <= 90; la += 4) q.push(latLonToVec(la, ln, r));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(q), mat));
    }
    return g;
  }

  function rimGlow() {
    return new THREE.Mesh(
      new THREE.SphereGeometry(1.075, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0x9CD2C2) } },
        vertexShader: [
          'varying vec3 vN; varying vec3 vV;',
          'void main(){',
          '  vec4 mv = modelViewMatrix * vec4(position,1.0);',
          '  vN = normalize(normalMatrix * normal);',
          '  vV = normalize(-mv.xyz);',
          '  gl_Position = projectionMatrix * mv;',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 uColor; varying vec3 vN; varying vec3 vV;',
          'void main(){',
          '  float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
          '  float a = pow(clamp(f,0.0,1.0), 2.4) * 0.42;',
          '  gl_FragColor = vec4(uColor, a);',
          '}'
        ].join('\n'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.FrontSide
      })
    );
  }

  function greatCircle(a, b, lift) {
    var va = a.clone().normalize(), vb = b.clone().normalize();
    var pts = [], steps = 72;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var v = va.clone().multiplyScalar(1 - t).add(vb.clone().multiplyScalar(t));
      if (v.lengthSq() < 1e-6) v = va.clone();
      v.normalize().multiplyScalar(1 + Math.sin(t * Math.PI) * lift);
      pts.push(v);
    }
    return pts;
  }

  function addRoute(a, b, lift, opacity) {
    var pts = greatCircle(a, b, lift);
    globe.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xC7F04B, transparent: true, opacity: opacity })
    ));
    var dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0105, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xEAFFB0 })
    );
    dot.userData.curve = new THREE.CatmullRomCurve3(pts);
    dot.userData.offset = Math.random();
    dot.userData.speed = 0.075 + Math.random() * 0.05;
    globe.add(dot);
    arcDots.push(dot);
  }

  function buildPins() {
    for (var i = 0; i < MARKERS.length; i++) {
      var m = MARKERS[i];
      var el = document.createElement('div');
      el.className = 'gpin' + (m.major ? ' major' : '') + (m.side === 'left' ? ' left' : '');
      if (m.dy) el.style.marginTop = m.dy + 'px';
      el.innerHTML = '<span class="gpin-dot"></span><span class="gpin-label">' + m.name + '</span>';
      host.appendChild(el);

      var anchor = new THREE.Object3D();
      anchor.position.copy(latLonToVec(m.lat, m.lon, 1.008));
      globe.add(anchor);
      pins.push({ el: el, anchor: anchor });
    }
  }

  function init() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 0, 4.55);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    globe = new THREE.Group();
    globe.rotation.order = 'YXZ';
    globe.rotation.y = FRONT + 0.30;   // Ghana front, rest of Africa sweeping in
    globe.rotation.x = -0.34;
    globe.scale.setScalar(1.0);
    scene.add(globe);

    globe.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.995, 72, 56),
      new THREE.MeshBasicMaterial({ color: 0x061814 })
    ));
    globe.add(graticule());
    globe.add(landPoints());
    globe.add(rimGlow());

    var gh = latLonToVec(6.69, -1.62, 1);
    addRoute(gh, latLonToVec(48.14, 11.58, 1), 0.16, 0.38);
    addRoute(gh, latLonToVec(22.32, 114.17, 1), 0.20, 0.22);
    addRoute(gh, latLonToVec(42.89, -78.88, 1), 0.12, 0.18);
    addRoute(gh, latLonToVec(60.21, 24.66, 1), 0.18, 0.16);

    buildPins();
    resize();
    window.addEventListener('resize', resize);

    host.addEventListener('pointerdown', function (e) {
      drag.active = true;
      drag.x = e.clientX;
      drag.vel = 0;
      host.setPointerCapture && host.setPointerCapture(e.pointerId);
      host.classList.add('grabbing');
    });
    window.addEventListener('pointerup', function () {
      drag.active = false;
      host.classList.remove('grabbing');
    });
    window.addEventListener('pointermove', function (e) {
      var r = host.getBoundingClientRect();
      mouseTilt.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      mouseTilt.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (!drag.active) return;
      var dx = e.clientX - drag.x;
      drag.x = e.clientX;
      drag.vel = dx * 0.006;
      globe.rotation.y += drag.vel;
      globe.rotation.x = Math.max(-0.9, Math.min(0.9, globe.rotation.x + (e.movementY || 0) * 0.0032));
    }, { passive: true });

    document.addEventListener('visibilitychange', function () { paused = document.hidden; });

    if (reduce) {
      spin(0);
      renderer.render(scene, camera);
    } else {
      loop();
    }
  }

  function resize() {
    var r = host.getBoundingClientRect();
    var w = Math.max(1, r.width), h = Math.max(1, r.height);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (reduce) { spin(0); renderer.render(scene, camera); }
  }

  var _wp = new THREE.Vector3(), _cam = new THREE.Vector3();
  function place(el, world, w, h) {
    _cam.copy(camera.position);
    var toCam = _cam.sub(world).normalize();
    var facing = world.clone().normalize().dot(toCam);
    var s = world.clone().project(camera);
    var x = (s.x * 0.5 + 0.5) * w;
    var y = (-s.y * 0.5 + 0.5) * h;
    var vis = facing > 0.10 && s.z < 1;
    var op = Math.max(0, Math.min(1, (facing - 0.10) / 0.34));
    el.style.opacity = vis ? op.toFixed(2) : '0';
    el.style.transform = 'translate(-50%,-50%) translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
  }

  function spin(t) {
    var w = host.clientWidth, h = host.clientHeight;

    if (!drag.active) {
      globe.rotation.y += (reduce ? 0 : 0.0015) + drag.vel;
      drag.vel *= 0.94;
    }
    var targetX = -0.34 + mouseTilt.y * 0.12;
    globe.rotation.x += (targetX - globe.rotation.x) * 0.03;

    for (var i = 0; i < arcDots.length; i++) {
      var d = arcDots[i];
      var u = ((t * d.userData.speed) + d.userData.offset) % 1;
      d.position.copy(d.userData.curve.getPoint(u));
      d.scale.setScalar(0.5 + Math.sin(u * Math.PI) * 0.85);
    }

    globe.updateMatrixWorld(true);
    for (var j = 0; j < pins.length; j++) {
      pins[j].anchor.getWorldPosition(_wp);
      place(pins[j].el, _wp, w, h);
    }
  }

  function loop() {
    requestAnimationFrame(loop);
    if (paused) return;
    spin((performance.now() - t0) / 1000);
    renderer.render(scene, camera);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
