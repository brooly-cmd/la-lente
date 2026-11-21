// Le ciel : une journee complete pilotee par T (0 aube -> 1 nuit), avec ses nuages, son soleil, sa lune et ses etoiles.
import * as THREE from 'three';

const c = (h) => new THREE.Color(h);
const v = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

// Cles de la journee. Les couleurs sont donnees a l'oeil, converties en lineaire par THREE.Color.
export const CLES = [
  { t: 0,    zen: c('#21328f'), mil: c('#a877c6'), hor: c('#ff9d7d'), sol: v(-.86, .13, -.5), solC: c('#ffb08a'), solI: 2.6, hemiH: c('#c6b8f0'), hemiB: c('#c9a29c'), hemiI: 1.55, env: .8, nuageL: c('#ffc4a8'), nuageS: c('#7f6fb8'), couv: .50, nuit: 0, eau: c('#d9c7cf'), expo: 1.0, bloom: .3, rim: .9 },
  { t: .27,  zen: c('#1458cf'), mil: c('#62a8ee'), hor: c('#def1f7'), sol: v(-.55, .72, .8), solC: c('#fff1dc'), solI: 3.2, hemiH: c('#a9d0f5'), hemiB: c('#d8d2c2'), hemiI: 1.1, env: .75, nuageL: c('#ffffff'), nuageS: c('#88a8d4'), couv: .56, nuit: 0, eau: c('#eef2f0'), expo: .94, bloom: .16, rim: .25 },
  { t: .50,  zen: c('#0f49b8'), mil: c('#4d97e6'), hor: c('#d2ecf5'), sol: v(.2, .92, .55), solC: c('#fff6e6'), solI: 3.5, hemiH: c('#a9d0f5'), hemiB: c('#e0dac8'), hemiI: 1.15, env: .8, nuageL: c('#ffffff'), nuageS: c('#8fb0db'), couv: .52, nuit: 0, eau: c('#f2f4f0'), expo: .9, bloom: .14, rim: .12 },
  { t: .74,  zen: c('#1e1b73'), mil: c('#d13f72'), hor: c('#ff9e45'), sol: v(.82, .17, .55), solC: c('#ff9b68'), solI: 3.3, hemiH: c('#b079c2'), hemiB: c('#b0705f'), hemiI: 1.1, env: .55, nuageL: c('#ff9a6e'), nuageS: c('#5f2f7c'), couv: .55, nuit: .05, eau: c('#c88a8a'), expo: 1.02, bloom: .34, rim: 1.0 },
  { t: .86,  zen: c('#0a0f44'), mil: c('#352a7c'), hor: c('#a4507f'), sol: v(.5, .42, .45), solC: c('#7f8fe6'), solI: .45, hemiH: c('#3c4596'), hemiB: c('#2a2c5c'), hemiI: .65, env: .34, nuageL: c('#74518f'), nuageS: c('#1c1b52'), couv: .46, nuit: .55, eau: c('#4c4a78'), expo: 1.08, bloom: .38, rim: .35 },
  { t: 1,    zen: c('#02041a'), mil: c('#07103a'), hor: c('#14255e'), sol: v(-.5, .55, .68), solC: c('#a9c0ff'), solI: 1.15, hemiH: c('#3a52ad'), hemiB: c('#1b2358'), hemiI: .85, env: .34, nuageL: c('#27366f'), nuageS: c('#050a2a'), couv: .3, nuit: 1, eau: c('#121a3e'), expo: 1.18, bloom: .4, rim: .22 },
];

export function etatDuTemps(T, out) {
  let i = 0; while (i < CLES.length - 2 && T > CLES[i + 1].t) i++;
  const a = CLES[i], b = CLES[i + 1], k0 = THREE.MathUtils.clamp((T - a.t) / (b.t - a.t), 0, 1), k = k0 * k0 * (3 - 2 * k0);
  for (const n of ['zen', 'mil', 'hor', 'solC', 'hemiH', 'hemiB', 'nuageL', 'nuageS', 'eau']) out[n].copy(a[n]).lerp(b[n], k);
  out.sol.copy(a.sol).lerp(b.sol, k).normalize();
  for (const n of ['solI', 'hemiI', 'env', 'couv', 'nuit', 'expo', 'bloom', 'rim']) out[n] = a[n] + (b[n] - a[n]) * k;
  return out;
}
export function nouvelEtat() {
  const o = {}; for (const n of ['zen', 'mil', 'hor', 'solC', 'hemiH', 'hemiB', 'nuageL', 'nuageS', 'eau']) o[n] = new THREE.Color(); o.sol = new THREE.Vector3(); return o;
}

const VERT = /* glsl */`
varying vec3 vD;
void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position.z = gl_Position.w * .99999; }`;
const FRAG = /* glsl */`
precision highp float;
varying vec3 vD;
uniform vec3 uZen,uMil,uHor,uSol,uSolC,uNL,uNS; uniform float uCouv,uNuit,uTemps,uQual; uniform sampler2D uBruit;
float hs(float a,float b,float x){float t=clamp((x-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
void main(){
  vec3 d = normalize(vD);
  float y = max(d.y,0.);
  float g1 = hs(0.,.20,y), g2 = hs(.10,.62,y);
  vec3 col = mix(uHor,uMil,g1); col = mix(col,uZen,g2);
  float sd = dot(d,uSol);
  // halo du soleil, large et chaud pres de l'horizon
  float jour = 1.-uNuit;
  col += uSolC * (pow(max(sd,0.),6.)*.28 + pow(max(sd,0.),70.)*.7) * jour * (.45 + .55*(1.-hs(.1,.7,uSol.y)));
  float disque = hs(.9992,.99965,sd);
  col += uSolC * disque * 26. * jour;
  // lune : dessinee avec ses mers, un peu trop grande, comme dans un livre
  vec3 lu = normalize(vec3(-.12,.24,-.96));
  float ld = dot(d,lu); float moon = hs(.99925,.99938,ld);
  if(moon>0.){
    vec2 m = vec2(dot(d,normalize(cross(lu,vec3(0,1,0)))),dot(d,normalize(cross(cross(lu,vec3(0,1,0)),lu))))*20.;
    float mers = texture2D(uBruit,m*.9+.2).r;
    col = mix(col, vec3(1.,.97,.92)*(1.05-mers*.62), moon*uNuit);
  }
  col += vec3(.45,.55,.95)*(pow(max(ld,0.),1800.)*.35+pow(max(ld,0.),90.)*.05)*uNuit;
  // voie lactee reflechie, bruit tuilable le long d'une bande
  if(uNuit>.05){
    vec3 axe = normalize(vec3(.62,.74,.24));
    float bande = 1.-abs(dot(d,axe)); bande = hs(.55,1.,bande);
    vec2 p = vec2(d.x+d.z*.4,d.y+d.z*.3)*.9;
    float n = texture2D(uBruit,p*.9+.1).a, n2 = texture2D(uBruit,p*2.6+.3).b;
    float lait = pow(bande,3.)*(.15+1.2*n*n)*(.4+n2);
    col += (vec3(.36,.46,.95)*lait*.2 + vec3(.9,.4,.6)*pow(bande,20.)*n2*.25)*uNuit*hs(.0,.25,y+.06);
  }
  // nuages : couches projetees sur un plafond, eclairees cote soleil
  if(d.y>.005){
    vec2 p = d.xz/(d.y+.14);
    float t = uTemps*.0035;
    vec2 q = p*.17 + vec2(t,t*.3);
    vec4 a = texture2D(uBruit,q);
    vec4 b = texture2D(uBruit,q*2.7 + a.rg*.16 + vec2(t*1.6,0.));
    vec4 c3 = texture2D(uBruit,q*8.3 + b.rg*.1);
    float forme = a.a*.58 + a.g*.18 + b.r*.17 + c3.g*.07;
    float seuil = 1.-uCouv*1.02;
    float n = hs(seuil,seuil+.11,forme);
    n *= hs(.012,.14,d.y);
    // relief : on regarde vers le soleil dans le bruit
    vec2 versS = normalize(uSol.xz+1e-3)*.03;
    float f2 = (texture2D(uBruit,q+versS).a*.62 + texture2D(uBruit,q*2.7+versS*2.7+a.rg*.16+vec2(t*1.6,0.)).r*.38);
    float eclat = clamp((forme-f2)*12.+.55,0.,1.)*.75 + .25*hs(seuil,seuil+.3,forme);
    vec3 nc = mix(uNS,uNL,eclat);
    nc += uSolC*pow(max(sd,0.),8.)*.55*jour*(1.-n*.55);
    col = mix(col,nc,n*.93);
  }
  gl_FragColor = vec4(col,1.);
}`;

export function creerCiel(bruit) {
  const uniforms = {
    uZen: { value: new THREE.Color() }, uMil: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSol: { value: new THREE.Vector3(0, 1, 0) }, uSolC: { value: new THREE.Color() },
    uNL: { value: new THREE.Color() }, uNS: { value: new THREE.Color() }, uCouv: { value: .5 }, uNuit: { value: 0 }, uTemps: { value: 0 }, uQual: { value: 1 }, uBruit: { value: bruit },
  };
  const m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, side: THREE.BackSide, depthWrite: false, fog: false });
  const ciel = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), m);
  ciel.frustumCulled = false; ciel.renderOrder = -10;
  return ciel;
}
export function appliquerCiel(ciel, e) {
  const u = ciel.material.uniforms;
  u.uZen.value.copy(e.zen); u.uMil.value.copy(e.mil); u.uHor.value.copy(e.hor); u.uSol.value.copy(e.sol); u.uSolC.value.copy(e.solC);
  u.uNL.value.copy(e.nuageL); u.uNS.value.copy(e.nuageS); u.uCouv.value = e.couv; u.uNuit.value = e.nuit;
}

export function creerEtoiles(n) {
  const pos = new Float32Array(n * 3), tail = new Float32Array(n), teinte = new Float32Array(n * 3), ph = new Float32Array(n);
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const u = Math.random(), a = Math.random() * Math.PI * 2, y = u * u * .96 + .012, r = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(a) * r * 850; pos[i * 3 + 1] = y * 850; pos[i * 3 + 2] = Math.sin(a) * r * 850;
    tail[i] = Math.pow(Math.random(), 7) * 3.2 + .55; ph[i] = Math.random() * 6.28;
    col.setHSL(Math.random() < .2 ? .06 : .6, .55, .82); teinte.set([col.r, col.g, col.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aT', new THREE.BufferAttribute(tail, 1)); g.setAttribute('aC', new THREE.BufferAttribute(teinte, 3)); g.setAttribute('aP', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uNuit: { value: 0 }, uTemps: { value: 0 }, uPx: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aT,aP; attribute vec3 aC; varying vec3 vC; varying float vA; uniform float uTemps,uNuit,uPx;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_Position.z=gl_Position.w*.99998; gl_PointSize=aT*uPx*(1.15+.25*sin(uTemps*1.4+aP)); vC=aC; vA=uNuit*(.65+.35*sin(uTemps*1.1+aP*3.)); }`,
    fragmentShader: `precision highp float; varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.15,d); gl_FragColor=vec4(vC*a*vA*1.6,a*vA); }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -9; return p;
}
