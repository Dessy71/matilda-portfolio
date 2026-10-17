/* ============================================================
   HERO — Three.js cargo yard
   Isometric container stacks drifting in depth, lime-edge
   wireframes, route arcs and a perspective grid.
   ============================================================ */
(function () {
  if (!window.THREE) return;
  var host = document.getElementById('heroCanvas');
  if (!host) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  var scene, camera, renderer, group, grids, arcDots = [], clock;
  var aim = { x: 4.15, y: -1.15, scale: 1.14 };
  var yardW = 5, yardCY = 0.8;
  var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  var scrollN = 0;
  var running = true;

  var EDGE = 0x9FE05C;

  var smallScreen = window.innerWidth <= 1180;

  function container(w, h, d, color) {
    var g = new THREE.Group();

    var geo = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
    var mat = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.42,
      metalness: 0.55,
      emissive: new THREE.Color(smallScreen ? 0x0d332a : 0x061a15),
      emissiveIntensity: smallScreen ? 0.95 : 0.5
    });
    g.add(new THREE.Mesh(geo, mat));

    // outer frame edges
    var edgeGeo = new THREE.EdgesGeometry(geo);
    g.add(new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({
      color: EDGE, transparent: true, opacity: smallScreen ? 0.86 : 0.55
    })));

    // corrugated ribs along the long faces
    var pos = [];
    var step = 0.075;
    var inset = 0.022;
    for (var x = -w / 2 + step; x < w / 2 - 0.01; x += step) {
      pos.push(x, -h / 2 + inset, d / 2, x, h / 2 - inset, d / 2);
      pos.push(x, -h / 2 + inset, -d / 2, x, h / 2 - inset, -d / 2);
    }
    var ribGeo = new THREE.BufferGeometry();
    ribGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.add(new THREE.LineSegments(ribGeo, new THREE.LineBasicMaterial({
      color: 0x89BE5F, transparent: true, opacity: 0.34
    })));

    return g;
  }

  function buildStack() {
    var g = new THREE.Group();
    var L = 1.55, H = 0.62, D = 0.66, gap = 0.085;
    var palette = smallScreen
      ? [0x1B5A49, 0x154C3E, 0x206651, 0x184F42]
      : [0x0E332C, 0x0A2A24, 0x123E34, 0x0C2E28];

    function put(x, y, z, rotY, color, scale) {
      var c = container(L, H, D, color);
      c.position.set(x, y, z);
      c.rotation.y = rotY || 0;
      if (scale) c.scale.setScalar(scale);
      g.add(c);
      return c;
    }

    // bottom tier — three containers end to end
    put(0, 0, 0, 0, palette[0]);
    put(0, 0, D + gap, 0, palette[1]);
    put(0, 0, -(D + gap), 0, palette[2]);

    // middle tier — cross-stacked (rotated 90°) for that yard look
    put(-0.34, H + gap * 0.7, 0, Math.PI / 2, palette[3], 0.94);
    put(0.42, H + gap * 0.7, D + gap, 0, palette[0], 0.94);

    // top tier
    put(0.05, (H + gap * 0.7) * 2, D * 0.5, 0, palette[1], 0.9);

    // strays around the yard
    put(-3.1, 0, -1.5, 0.35, palette[2], 0.86);
    put(3.4, 0.3, -1.1, -0.5, palette[0], 0.9);
    put(2.6, 1.55, 1.5, 0.18, palette[3], 0.8);

    return g;
  }

  // an arc in the air with a travelling dot — the "shipment in motion"
  // average position of every container in the yard
  function centroidOf(root) {
    root.updateMatrixWorld(true);
    var sum = new THREE.Vector3(), n = 0;
    root.traverse(function (o) {
      if (o.isMesh) { sum.add(o.getWorldPosition(new THREE.Vector3())); n++; }
    });
    if (!n) return new THREE.Vector3();
    return sum.multiplyScalar(1 / n);
  }

  function yardBounds(root) {
    root.updateMatrixWorld(true);
    var box = new THREE.Box3().setFromObject(root);
    return {
      w: Math.max(1, box.max.x - box.min.x),
      cy: (box.max.y + box.min.y) / 2
    };
  }

  function route(a, b, lift) {
    var mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    mid.y += lift;
    var curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    var pts = curve.getPoints(72);
    var geo = new THREE.BufferGeometry().setFromPoints(pts);
    var line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: EDGE, transparent: true, opacity: 0.22
    }));
    scene.add(line);

    var dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 12),
      new THREE.MeshBasicMaterial({ color: EDGE })
    );
    dot.userData.curve = curve;
    dot.userData.offset = Math.random();
    scene.add(dot);
    arcDots.push(dot);
  }

  function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050d0b, 0.062);

    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 140);
    camera.position.set(0, 1.35, 9.8);
    camera.lookAt(0, 0.35, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x000000, 0);
    if ('outputEncoding' in renderer) renderer.outputEncoding = THREE.sRGBEncoding;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xbdf0d8, 0x04100c, 0.95));
    var key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(5, 8, 6);
    scene.add(key);
    var rim = new THREE.PointLight(0xc7f04b, 2.4, 30, 2);
    rim.position.set(-5, 3.2, 6);
    scene.add(rim);
    var fill = new THREE.PointLight(0x7FD8C0, 1.2, 26, 2);
    fill.position.set(6, -1.4, 4);
    scene.add(fill);
    if (smallScreen) {
      var front = new THREE.DirectionalLight(0xffffff, 1.15);
      front.position.set(0, 2.5, 9);
      scene.add(front);
    }

    grids = new THREE.Group();
    var grid = new THREE.GridHelper(46, 46, 0x1e4a3d, 0x123029);
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    grid.position.y = -1.55;
    grids.add(grid);
    scene.add(grids);

    group = new THREE.Group();

    // The yard is built with off-centre strays, so re-pivot it around the
    // real centre of mass — otherwise it always reads "shifted to the right".
    var stack = buildStack();
    var c = centroidOf(stack);
    stack.position.set(-c.x, 0, -c.z);
    var pivot = new THREE.Group();
    pivot.add(stack);
    group.add(pivot);
    var yb = yardBounds(pivot);
    yardW = yb.w; yardCY = yb.cy;
    group.position.set(4.15, -1.15, -0.9);
    group.rotation.y = -0.5;
    group.scale.setScalar(1.14);
    scene.add(group);

    var gh = group.clone(true);
    gh.position.set(6.55, -1.7, -6.0);
    gh.scale.setScalar(0.86);
    gh.rotation.y = 0.75;
    scene.add(gh);
    group.userData.twin = gh;


    route(new THREE.Vector3(1.4, 2.4, 1.6), new THREE.Vector3(7.2, 3.2, -1.2), 2.2);
    route(new THREE.Vector3(7.4, -1.4, 2.2), new THREE.Vector3(2.4, 0.6, 2.2), 2.6);
    route(new THREE.Vector3(3.2, 3.6, -1.6), new THREE.Vector3(8.2, 0.4, 1.2), 1.6);

    clock = new THREE.Clock();
    resize();
    window.addEventListener('resize', resize);
    renderer.domElement.style.opacity = '1';

    if (reduce) {
      renderer.render(scene, camera);
      return;
    }
    // layout shifts once fonts land and the preloader clears — re-aim after that
    window.addEventListener('load', function () { setTimeout(resize, 120); });
    setTimeout(resize, 1400);

    clock = new THREE.Clock();
    loop();
  }

  function resize() {
    var r = host.getBoundingClientRect();
    var w = Math.max(1, r.width), h = Math.max(1, r.height);
    camera.aspect = w / h;

    // pull back on narrow screens so the yard stays in frame
    var targetZ = w < 720 ? 12.2 : w < 1100 ? 12.4 : 9.6;
    camera.position.z = targetZ;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);

    aimYard(w, h);
    if (reduce) renderer.render(scene, camera);
  }

  // On stacked (<=1180px) layouts the portrait sits centred under the copy,
  // so the cargo yard is re-aimed to sit directly behind it rather than
  // floating off to the right. Solved against the real camera projection
  // (the tilted camera means a plain linear guess lands low).
  function aimYard(w, h) {
    var portrait = document.querySelector('.portrait-wrap');

    if (w > 1180 || !portrait) {
      aim.x = 4.15; aim.y = -1.15; aim.scale = 1.14;
      return;
    }

    var hostR = host.getBoundingClientRect();
    var pr = portrait.getBoundingClientRect();
    var cx = (pr.left + pr.width / 2) - hostR.left;
    // bias upward so the yard frames the arch's open corners instead of
    // spilling down into the statistics strip
    var cy = (pr.top + pr.height * 0.34) - hostR.top;

    camera.position.set(camera.position.x, 1.35, camera.position.z);
    camera.lookAt(0, 0.45, 0);
    camera.updateMatrixWorld(true);

    var dist = camera.position.z + 0.9;
    var visH = 2 * dist * Math.tan((camera.fov * Math.PI) / 360);
    var visW = visH * camera.aspect;

    // the yard's bounds include wide-set strays; over-fill so the central
    // stack reads big and the strays bleed past the frame edges
    var scale = Math.max(0.35, (visW * 1.95) / yardW);

    aim.x = ((cx / w) - 0.5) * visW;
    aim.y = 0.45 - ((cy / h) - 0.5) * visH;

    var probe = new THREE.Vector3();
    for (var i = 0; i < 8; i++) {
      probe.set(aim.x, aim.y + yardCY * scale, -0.9).project(camera);
      var sx = (probe.x * 0.5 + 0.5) * w;
      var sy = (-probe.y * 0.5 + 0.5) * h;
      var ex = cx - sx, ey = cy - sy;
      if (Math.abs(ex) < 0.5 && Math.abs(ey) < 0.5) break;
      aim.x += (ex / w) * visW;
      aim.y -= (ey / h) * visH;
    }
    aim.scale = scale;
  }

  var paused = false;

  function loop() {
    requestAnimationFrame(loop);
    if (paused) return;

    var t = clock.getElapsedTime();

    mouse.x += (mouse.tx - mouse.x) * 0.045;
    mouse.y += (mouse.ty - mouse.y) * 0.045;

    if (group) {
      group.rotation.y = -0.5 + t * 0.05 + mouse.x * 0.24;
      group.rotation.x = Math.sin(t * 0.22) * 0.05 + mouse.y * 0.1;
      group.position.x += (aim.x - group.position.x) * 0.07;
      group.position.y = aim.y + Math.sin(t * 0.55) * 0.085 - scrollN * 1.8;
      group.scale.setScalar(group.scale.x + (aim.scale - group.scale.x) * 0.07);

      var twin = group.userData.twin;
      if (twin) {
        twin.visible = window.innerWidth > 1180;
        if (!twin.visible) { twin.position.copy(group.position); }
        twin.rotation.y = 0.75 - t * 0.055 - mouse.x * 0.16;
        twin.position.x = aim.x + 2.4;
        twin.position.y = aim.y - 0.55 + Math.sin(t * 0.4 + 1.2) * 0.12;
      }

    }
    if (grids) {
      grids.position.z = (t * 0.22) % 1;
      grids.position.y = -1.7 - scrollN * 0.8;
    }
    for (var i = 0; i < arcDots.length; i++) {
      var d = arcDots[i];
      var u = (t * 0.16 + d.userData.offset) % 1;
      d.position.copy(d.userData.curve.getPoint(u));
      var s2 = Math.sin(u * Math.PI);
      d.scale.setScalar(0.5 + s2 * 0.9);
    }
    camera.position.x += (mouse.x * 0.55 - camera.position.x) * 0.05;
    camera.position.y += (1.35 - mouse.y * 0.35 - camera.position.y) * 0.05;
    camera.lookAt(0, 0.45, 0);

    renderer.render(scene, camera);
  }

  window.addEventListener('pointermove', function (e) {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  window.addEventListener('scroll', function () {
    var h = window.innerHeight;
    scrollN = Math.min(1, Math.max(0, window.scrollY / h));
    host.style.opacity = String(1 - Math.min(1, scrollN * 1.25));
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    paused = document.hidden;
    if (!paused) clock = new THREE.Clock();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
