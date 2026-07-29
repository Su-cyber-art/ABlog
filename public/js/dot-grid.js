/* 默·博客 — 原生 Canvas 交互点阵背景（独立实现） */
(function () {
  'use strict';

  var page = document.querySelector('.page');
  if (!page || !document.body || !window.requestAnimationFrame || !window.HTMLCanvasElement) return;

  var canvas = document.createElement('canvas');
  canvas.className = 'dot-grid-bg';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);

  var context = canvas.getContext('2d');
  if (!context) {
    canvas.remove();
    return;
  }

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var coarsePointer = window.matchMedia('(pointer: coarse)');
  var dots = [];
  var waves = [];
  var width = 0;
  var height = 0;
  var dpr = 1;
  var frameId = 0;
  var resizeId = 0;
  var lastFrame = 0;
  var pointer = {
    active: false,
    x: -1000,
    y: -1000,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    vx: 0,
    vy: 0
  };

  var readColor = function (name, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    var match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
    if (!match) return fallback;
    var hex = match[1].length === 3
      ? match[1].split('').map(function (part) { return part + part; }).join('')
      : match[1];
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  };

  var baseColor = readColor('--color-text', { r: 32, g: 31, b: 29 });
  var activeColor = readColor('--color-accent', { r: 182, g: 130, b: 53 });
  var motionEnabled = function () { return !reducedMotion.matches && !coarsePointer.matches; };
  var clamp = function (value, min, max) { return Math.max(min, Math.min(max, value)); };

  var draw = function (now, update) {
    context.clearRect(0, 0, width, height);
    var proximity = width <= 740 ? 112 : 148;
    var maxMotion = 0;

    for (var i = 0; i < dots.length; i++) {
      var dot = dots[i];
      var targetX = 0;
      var targetY = 0;
      var intensity = 0;
      var dx;
      var dy;
      var distance;

      if (pointer.active) {
        dx = dot.x - pointer.x;
        dy = dot.y - pointer.y;
        distance = Math.hypot(dx, dy);
        if (distance < proximity) {
          var near = 1 - distance / proximity;
          var smoothNear = near * near * (3 - 2 * near);
          var unitX = distance ? dx / distance : 0;
          var unitY = distance ? dy / distance : 0;
          targetX += (unitX * 2.8 + clamp(pointer.vx * 5, -7, 7)) * smoothNear;
          targetY += (unitY * 2.8 + clamp(pointer.vy * 5, -7, 7)) * smoothNear;
          intensity = smoothNear;
        }
      }

      for (var w = 0; w < waves.length; w++) {
        var wave = waves[w];
        var age = (now - wave.started) / 820;
        if (age >= 1) continue;
        dx = dot.x - wave.x;
        dy = dot.y - wave.y;
        distance = Math.hypot(dx, dy);
        var ring = age * 260;
        var band = 42;
        var edge = 1 - Math.abs(distance - ring) / band;
        if (edge > 0) {
          var pulse = edge * Math.sin(age * Math.PI);
          targetX += (distance ? dx / distance : 0) * 14 * pulse;
          targetY += (distance ? dy / distance : 0) * 14 * pulse;
          intensity = Math.max(intensity, pulse);
        }
      }

      if (update) {
        dot.vx = (dot.vx + (targetX - dot.ox) * 0.12) * 0.74;
        dot.vy = (dot.vy + (targetY - dot.oy) * 0.12) * 0.74;
        dot.ox += dot.vx;
        dot.oy += dot.vy;
      }
      maxMotion = Math.max(maxMotion, Math.abs(dot.vx), Math.abs(dot.vy),
        Math.abs(targetX - dot.ox), Math.abs(targetY - dot.oy));

      var mix = clamp(intensity, 0, 1);
      var red = Math.round(baseColor.r + (activeColor.r - baseColor.r) * mix);
      var green = Math.round(baseColor.g + (activeColor.g - baseColor.g) * mix);
      var blue = Math.round(baseColor.b + (activeColor.b - baseColor.b) * mix);
      var alpha = 0.11 + mix * 0.55;
      var radius = 1.15 + mix * 0.65;
      context.beginPath();
      context.arc(dot.x + dot.ox, dot.y + dot.oy, radius, 0, Math.PI * 2);
      context.fillStyle = 'rgba(' + red + ',' + green + ',' + blue + ',' + alpha + ')';
      context.fill();
    }
    return maxMotion;
  };

  var tick = function (now) {
    frameId = 0;
    var elapsed = lastFrame ? Math.min(34, now - lastFrame) : 16;
    lastFrame = now;
    var decay = Math.pow(0.78, elapsed / 16);
    pointer.vx *= decay;
    pointer.vy *= decay;
    waves = waves.filter(function (wave) { return now - wave.started < 820; });
    var moving = draw(now, true);
    if (waves.length || moving > 0.025 || Math.abs(pointer.vx) > 0.02 || Math.abs(pointer.vy) > 0.02) {
      frameId = requestAnimationFrame(tick);
    }
  };

  var start = function () {
    if (!motionEnabled() || frameId || document.hidden) return;
    lastFrame = 0;
    frameId = requestAnimationFrame(tick);
  };

  var build = function () {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    var cell = width <= 740 ? 30 : 34;
    var columns = Math.ceil(width / cell) + 1;
    var rows = Math.ceil(height / cell) + 1;
    var startX = (width - (columns - 1) * cell) / 2;
    var startY = (height - (rows - 1) * cell) / 2;
    dots = [];
    for (var row = 0; row < rows; row++) {
      for (var column = 0; column < columns; column++) {
        dots.push({
          x: startX + column * cell,
          y: startY + row * cell,
          ox: 0,
          oy: 0,
          vx: 0,
          vy: 0
        });
      }
    }
    draw(performance.now(), false);
  };

  var onPointerMove = function (event) {
    if (!motionEnabled() || (event.pointerType && !['mouse', 'pen'].includes(event.pointerType))) return;
    var now = performance.now();
    var elapsed = pointer.lastTime ? Math.max(8, now - pointer.lastTime) : 16;
    pointer.vx = pointer.lastTime ? (event.clientX - pointer.lastX) / elapsed : 0;
    pointer.vy = pointer.lastTime ? (event.clientY - pointer.lastY) / elapsed : 0;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    pointer.lastTime = now;
    pointer.active = true;
    start();
  };

  var clearPointer = function () {
    if (!pointer.active) return;
    pointer.active = false;
    pointer.vx = 0;
    pointer.vy = 0;
    start();
  };

  var onPointerDown = function (event) {
    if (!motionEnabled() || event.button !== 0
      || (event.pointerType && !['mouse', 'pen'].includes(event.pointerType))) return;
    waves.push({ x: event.clientX, y: event.clientY, started: performance.now() });
    if (waves.length > 3) waves.shift();
    start();
  };

  var onResize = function () {
    if (resizeId) cancelAnimationFrame(resizeId);
    resizeId = requestAnimationFrame(function () {
      resizeId = 0;
      build();
    });
  };

  var resetMotion = function () {
    pointer.active = false;
    waves = [];
    for (var i = 0; i < dots.length; i++) {
      dots[i].ox = 0;
      dots[i].oy = 0;
      dots[i].vx = 0;
      dots[i].vy = 0;
    }
    draw(performance.now(), false);
  };

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('mouseout', function (event) {
    if (!event.relatedTarget) clearPointer();
  });
  window.addEventListener('blur', clearPointer);
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    } else if (!document.hidden) {
      if (motionEnabled()) start();
      else draw(performance.now(), false);
    }
  });

  var watchMotion = function (query) {
    if (query.addEventListener) query.addEventListener('change', resetMotion);
    else if (query.addListener) query.addListener(resetMotion);
  };
  watchMotion(reducedMotion);
  watchMotion(coarsePointer);
  build();
}());
