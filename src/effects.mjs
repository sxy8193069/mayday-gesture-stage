import * as THREE from '../vendor/three.module.js';

const CONFETTI_DURATION = 6.8;
const CONFETTI_COUNT = 700;
const COLORS = ['#f74c43', '#ffd35b', '#f28cb6', '#66c9ee', '#64cf92'];

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function releaseGroup(group) {
  group.traverse(object => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
  group.removeFromParent();
  group.clear();
  group.visible = false;
}

const starVertexShader = /* glsl */ `
  attribute vec3 tint;
  attribute vec3 sparkle;
  uniform float uTime;
  uniform float uStrength;
  uniform float uSoft;
  uniform float uPixelScale;
  uniform vec3 uTint;
  uniform float uTintMix;
  uniform float uMiddle;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.13 + sparkle.z) * (0.20 + uSoft * 0.45);
    p.y += sin(uTime * 0.10 + sparkle.z * 1.3) * (0.17 + uSoft * 0.32);
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    float perspective = 40.0 / max(8.0, -viewPosition.z);
    gl_PointSize = clamp(sparkle.x * perspective * uPixelScale, 1.15, mix(mix(5.5,9.0,uMiddle),27.0,uSoft));
    gl_Position = projectionMatrix * viewPosition;
    vTint = mix(tint,uTint,uTintMix);
    float pulse = 0.64 + 0.36 * sin(uTime * (0.5+sparkle.y) + sparkle.z);
    vec2 screen=gl_Position.xy/gl_Position.w;
    float edge=mix(1.0,smoothstep(.32,.85,max(abs(screen.x),abs(screen.y))),uSoft);
    vAlpha = pulse * sparkle.y * uStrength * edge;
  }
`;

const starFragmentShader = /* glsl */ `
  uniform float uSoft;
  varying vec3 vTint;
  varying float vAlpha;
  void main() {
    vec2 offset = gl_PointCoord - 0.5;
    float radius = length(offset) * 2.0;
    float core = exp(-radius * radius * mix(4.8, 3.7, uSoft));
    float edge = 1.0 - smoothstep(0.58, 1.0, radius);
    float cross = max(exp(-abs(offset.x)*8.0-abs(offset.y)*45.0),exp(-abs(offset.y)*8.0-abs(offset.x)*45.0));
    float alpha = (core + cross * 0.32 * (1.0 - uSoft)) * edge * vAlpha;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(vTint, alpha);
    #include <colorspace_fragment>
  }
`;

function starLayer(count, layer, random) {
  const soft=layer===2;
  const positions = new Float32Array(count * 3);
  const tints = new Float32Array(count * 3);
  const sparkles = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const offset = i * 3;
    positions[offset] = (random() - 0.5) * (layer===0?64:42);
    positions[offset + 1] = 3+(random()-.5)*(layer===0?43:30);
    positions[offset + 2] = layer===0?-15-random()*28:soft?-3+random()*6:-7-random()*13;
    const colored = random() < (layer===0?.08:.35);
    color.set(colored ? COLORS[Math.floor(random() * COLORS.length)] : (random() < 0.64 ? '#a8c6ed' : '#e7efff'));
    color.toArray(tints, offset);
    sparkles[offset] = soft ? 12 + random() * 12 : (layer===0?1.4:3.2) + random() * (layer===0?2.1:2.8);
    sparkles[offset + 1] = soft ? 0.035 + random() * 0.04 : 0.32 + random() * 0.40;
    sparkles[offset + 2] = random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
  geometry.setAttribute('sparkle', new THREE.BufferAttribute(sparkles, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 1 },
      uSoft: { value: soft ? 1 : 0 },uPixelScale:{value:1},uTint:{value:new THREE.Color('#b0cdf6')},uTintMix:{value:0},uMiddle:{value:layer===1?1:0}
    },
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false
  });
  const points = new THREE.Points(geometry, material);
  points.name = soft ? 'floating-soft-lights' : 'distant-stars';
  points.frustumCulled = false;
  points.renderOrder = -10;
  return points;
}

export function createAtmosphere(scene) {
  const group = new THREE.Group();
  group.name = 'concert-atmosphere';
  const random = seededRandom(5040917);
  const stars = starLayer(1200,0,random),middle=starLayer(180,1,random);
  const softLights = starLayer(18,2,random);
  group.add(stars,middle,softLights);
  scene.add(group);
  let disposed = false;
  return {
    group,
    update(timeSeconds,strength=1,tint=null,pixelScale=1) {
      if (disposed) return;
      for (const layer of [stars,middle,softLights]) {
        layer.material.uniforms.uTime.value = timeSeconds;
        layer.material.uniforms.uStrength.value = Math.max(0,strength)*(layer===stars?1:layer===middle?.72:.65);
        layer.material.uniforms.uPixelScale.value=Math.max(.8,pixelScale);
        layer.material.uniforms.uTintMix.value=tint&&layer===middle?.23:0;
        if(tint)layer.material.uniforms.uTint.value.copy(tint);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      releaseGroup(group);
    }
  };
}

const confettiVertexShader = /* glsl */ `
  attribute vec3 spawn;
  attribute vec4 shape;
  attribute vec4 motion;
  attribute vec3 wind;
  attribute vec3 paperColor;
  attribute float delay;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShade;

  mat3 rotateX(float a) {
    float s = sin(a), c = cos(a);
    return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c);
  }
  mat3 rotateY(float a) {
    float s = sin(a), c = cos(a);
    return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  }
  mat3 rotateZ(float a) {
    float s = sin(a), c = cos(a);
    return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0);
  }
  void main() {
    float age = max(0.0, uTime - delay);
    float phase = motion.w;
    vec3 center = spawn;
    center.x += sin(age * motion.z + phase) * motion.y + wind.x * age;
    center.y -= motion.x * age + wind.y * age * age;
    center.z += sin(age * 0.75 + phase) * 0.48 + wind.z * age;

    vec3 ribbon = vec3(position.x * shape.x, position.y * shape.y, 0.0);
    ribbon.z = sin(uv.y * 3.141593) * shape.x * 0.45
      + sin(age * 3.2 + uv.y * 5.6 + phase) * shape.y * 0.10;
    mat3 turn = rotateZ(shape.z + sin(age * 1.2 + phase) * 0.55)
      * rotateY(age * shape.w * 0.52 + phase)
      * rotateX(age * shape.w + sin(age * 1.7 + phase) * 0.45);
    vec3 normal = turn * vec3(0.0, 0.0, 1.0);
    vShade = 0.60 + 0.40 * abs(dot(normalize(normal), normalize(vec3(-0.3, 0.8, 1.0))));
    vUv = uv;
    vColor = paperColor;
    float enter = smoothstep(0.0, 0.18, uTime - delay);
    float finish = 1.0 - smoothstep(5.75, 6.8, uTime);
    float ground = smoothstep(-0.6, 0.55, center.y);
    vAlpha = enter * finish * ground * 0.82;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(center + turn * ribbon, 1.0);
  }
`;

const confettiFragmentShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vShade;
  void main() {
    float widthEdge = smoothstep(0.0, 0.09, vUv.x) * smoothstep(0.0, 0.09, 1.0 - vUv.x);
    float lengthEdge = smoothstep(0.0, 0.035, vUv.y) * smoothstep(0.0, 0.035, 1.0 - vUv.y);
    float fold = 0.93 + 0.07 * cos(vUv.y * 9.0);
    float alpha = vAlpha * widthEdge * lengthEdge;
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(vColor * vShade * fold, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function confettiGeometry() {
  const geometry = new THREE.InstancedBufferGeometry();
  const segments = 6;
  const vertices = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const progress = i / segments;
    vertices.push(-0.5, progress - 0.5, 0, 0.5, progress - 0.5, 0);
    uvs.push(0, progress, 1, progress);
    if (i < segments) {
      const index = i * 2;
      indices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.instanceCount = CONFETTI_COUNT;
  const random = seededRandom(5051701);
  const spawn = new Float32Array(CONFETTI_COUNT * 3);
  const shape = new Float32Array(CONFETTI_COUNT * 4);
  const motion = new Float32Array(CONFETTI_COUNT * 4);
  const wind = new Float32Array(CONFETTI_COUNT * 3);
  const colors = new Float32Array(CONFETTI_COUNT * 3);
  const delays = new Float32Array(CONFETTI_COUNT);
  const color = new THREE.Color();
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    const offset3 = i * 3;
    const offset4 = i * 4;
    const side = random() < 0.5 ? -1 : 1;
    const atSide = random() < 0.83;
    spawn[offset3] = atSide ? side * (2.5 + random() * 6.5) : (random() - 0.5) * 5;
    spawn[offset3 + 1] = 9 + random() * 4;
    spawn[offset3 + 2] = -2 + Math.pow(random(), 1.45) * 10;
    shape[offset4] = 0.045 + random() * 0.082;
    shape[offset4 + 1] = random() < 0.68 ? 0.16 + random() * 0.34 : 0.48 + random() * 0.44;
    shape[offset4 + 2] = (random() - 0.5) * Math.PI * 2;
    shape[offset4 + 3] = (1.6 + random() * 3.0) * side;
    motion[offset4] = 1.2 + random() * 0.72;
    motion[offset4 + 1] = 0.18 + random() * 0.64;
    motion[offset4 + 2] = 0.9 + random() * 1.3;
    motion[offset4 + 3] = random() * Math.PI * 2;
    wind[offset3] = side * (0.015 + random() * 0.095);
    wind[offset3 + 1] = 0.18 + random() * 0.085;
    wind[offset3 + 2] = (random() - 0.5) * 0.11;
    color.set(i % 29 === 0 ? '#e8cc8b' : COLORS[i % COLORS.length]);
    color.toArray(colors, offset3);
    delays[i] = random() * 1.05;
  }
  geometry.setAttribute('spawn', new THREE.InstancedBufferAttribute(spawn, 3));
  geometry.setAttribute('shape', new THREE.InstancedBufferAttribute(shape, 4));
  geometry.setAttribute('motion', new THREE.InstancedBufferAttribute(motion, 4));
  geometry.setAttribute('wind', new THREE.InstancedBufferAttribute(wind, 3));
  geometry.setAttribute('paperColor', new THREE.InstancedBufferAttribute(colors, 3));
  geometry.setAttribute('delay', new THREE.InstancedBufferAttribute(delays, 1));
  return geometry;
}

export function createConfetti(scene) {
  const group = new THREE.Group();
  group.name = 'concert-confetti';
  group.visible = false;
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: confettiVertexShader,
    fragmentShader: confettiFragmentShader,
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true
  });
  const mesh = new THREE.Mesh(confettiGeometry(), material);
  mesh.name = 'five-color-paper-ribbons';
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  group.add(mesh);
  scene.add(group);
  let startTime = 0;
  let active = false;
  let disposed = false;
  return {
    group,
    get active() { return active; },
    trigger(timeSeconds) {
      if (disposed) return;
      startTime = timeSeconds;
      material.uniforms.uTime.value = 0;
      active = true;
      group.visible = true;
    },
    reset() {
      active = false;
      group.visible = false;
      material.uniforms.uTime.value = 0;
    },
    update(timeSeconds) {
      if (!active || disposed) return;
      const elapsed = Math.max(0, timeSeconds - startTime);
      material.uniforms.uTime.value = elapsed;
      if (timeSeconds >= startTime + CONFETTI_DURATION) {
        active = false;
        group.visible = false;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      active = false;
      releaseGroup(group);
    }
  };
}
