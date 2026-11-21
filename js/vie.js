// Ce qui vit sur le dos : herbe, feuillage, fumees, lueurs, oiseaux, habitants, eau courante.
import * as THREE from 'three';

const b2t = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
export const temps = { value: 0 };

function vent(m, code) {
  m.onBeforeCompile = (s) => { s.uniforms.uTemps = temps; code(s); };
}

export function creerHerbe(buffer, n, exclus = []) {
  const a = new Float32Array(buffer), total = a.length / 6; n = Math.min(n, total);
  // une lame : base large, pointe courbe
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, -.3, .55, .08, .3, .55, .08, 0, 1, .28], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  const m = new THREE.MeshStandardMaterial({ roughness: .9, side: THREE.DoubleSide, envMapIntensity: .5 });
  vent(m, (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTemps;\nvarying float vH;').replace('#include <begin_vertex>', `#include <begin_vertex>
      vH = position.y;
      vec4 oW = instanceMatrix*vec4(0.,0.,0.,1.);
      float vv = sin(uTemps*1.3+oW.x*3.+oW.z*2.4)+.6*sin(uTemps*2.3+oW.x*7.);
      transformed.x += position.y*position.y*vv*.26; transformed.z += position.y*position.y*.12*cos(uTemps*1.1+oW.z*4.);`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vH;').replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(.42,1.28,vH);');
  });
  const im = new THREE.InstancedMesh(g, m, n); im.frustumCulled = false; im.receiveShadow = true;
  const d = new THREE.Object3D(), c = new THREE.Color();
  const pas = Math.floor(total / n);
  for (let i = 0; i < n; i++) {
    const j = i * pas; const x = a[j * 6], y = a[j * 6 + 1], z = a[j * 6 + 2];
    if (exclus.some((e) => Math.hypot(x - e[0], y - e[1]) < e[2])) { d.position.set(0, -50, 0); d.scale.setScalar(.0001); d.updateMatrix(); im.setMatrixAt(i, d.matrix); continue; }
    d.position.set(x, z - .004, -y); d.rotation.set((Math.random() - .5) * .3, Math.random() * 6.28, (Math.random() - .5) * .3);
    const h = .018 + Math.random() * Math.random() * .036; d.scale.set(.0048 + Math.random() * .004, h, .005); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    c.setRGB(a[j * 6 + 3], a[j * 6 + 4], a[j * 6 + 5]); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h + (Math.random() - .5) * .03, Math.min(1, hsl.s * 1.08), Math.min(.6, hsl.l * (1.05 + Math.random() * .45))); im.setColorAt(i, c);
  }
  return im;
}

const TEINTES = {
  vert: [new THREE.Color('#2e6a2c'), new THREE.Color('#6f9d33'), new THREE.Color('#a6c04d')],
  sombre: [new THREE.Color('#123f2e'), new THREE.Color('#25663a'), new THREE.Color('#4f8a43')],
  fleur: [new THREE.Color('#d73c52'), new THREE.Color('#ff7f73'), new THREE.Color('#ffc4bc')],
};
export function creerFeuillage(arbres, tex, densite) {
  // Cartes fixes, tangentes a la couronne ; eclairage en boule pour garder le volume.
  const facteurDensite = densite < 1 ? 1.3 : 1.6;
  const nombreFeuilles = (a) => Math.ceil(Math.ceil(a.r * a.r * 4200 * densite + 40) * facteurDensite);
  let n = 0; for (const a of arbres) n += nombreFeuilles(a);
  const geo = new THREE.PlaneGeometry(1, 1);
  const iCentre = new Float32Array(n * 3); const iTaille = new Float32Array(n);
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: .5, roughness: .78, side: THREE.DoubleSide, envMapIntensity: .55 });
  vent(m, (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTemps;\nattribute vec3 iCentre;\nattribute float iTaille;\nvarying float vProf;')
      .replace('#include <beginnormal_vertex>', `vec3 objectNormal = normalize(iCentre + vec3(0.,.25,0.));`)
      // iCentre est deja dans le repere de l'arbre : ne pas lui appliquer la rotation de la carte.
      .replace('#include <defaultnormal_vertex>', `vec3 transformedNormal = normalMatrix * objectNormal;`)
      .replace('#include <project_vertex>', `
        vec4 oW = instanceMatrix*vec4(0.,0.,0.,1.);
        float vv = sin(uTemps*.9+oW.x*2.)+.5*sin(uTemps*1.9+oW.z*3.);
        float ang = sin(uTemps*1.7+oW.x*11.+oW.z*7.)*.087266;
        float ca=cos(ang),sa=sin(ang);
        vec3 carte = position;
        carte.yz = mat2(ca,-sa,sa,ca)*carte.yz; // battement local, au plus 5 degres
        vec4 pW = instanceMatrix*vec4(carte,1.);
        pW.xyz += vec3(vv*.012,cos(uTemps*1.2+oW.x*4.)*.006,sin(uTemps+oW.z*2.)*.012)*min(1.,iTaille*25.);
        vec4 mvPosition = modelViewMatrix*pW;
        gl_Position = projectionMatrix*mvPosition;
        vProf = clamp(iCentre.y*.5+.5+length(iCentre)*.35-.2,0.,1.);`)
      .replace('#include <worldpos_vertex>', `vec4 worldPosition = modelMatrix*pW;`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vProf;').replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= mix(.36,1.15,vProf);');
  });
  m.customProgramCacheKey = () => 'feuillage-fixe';
  const im = new THREE.InstancedMesh(geo, m, n); im.frustumCulled = false; im.receiveShadow = true;
  const d = new THREE.Object3D(), c = new THREE.Color(); let i = 0;
  const face = new THREE.Vector3(0, 0, 1), direction = new THREE.Vector3();
  const ombres = new THREE.Group();
  const ombreMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  for (const a of arbres) {
    const P = b2t(a.p), r = a.r * 1.0, T = TEINTES[a.k]; const cnt = nombreFeuilles(a);
    const om = new THREE.Mesh(new THREE.IcosahedronGeometry(r * .9, 1), ombreMat); om.position.copy(P); om.castShadow = true; ombres.add(om);
    for (let k = 0; k < cnt; k++) {
      // boule bossue : plusieurs lobes
      const u = Math.random() * 2 - 1, th = Math.random() * 6.283, s = Math.sqrt(1 - u * u); const rr = r * Math.pow(Math.random(), .28) * (.82 + .3 * Math.sin(th * 3 + u * 4 + a.p[0] * 9) * Math.sin(u * 5 + a.p[1] * 7));
      const ox = s * Math.cos(th) * rr, oy = u * rr * .86, oz = s * Math.sin(th) * rr;
      iCentre.set([ox / r, oy / r, oz / r], i * 3); iTaille[i] = (.055 + Math.random() * .06) * Math.max(.75, Math.min(1.2, a.r * 3.2)) * 1.15;
      d.position.set(P.x + ox, P.y + oy, P.z + oz);
      d.quaternion.setFromUnitVectors(face, direction.set(ox, oy, oz).normalize());
      d.rotateZ(Math.random() * Math.PI * 2);
      d.rotateX((Math.random() * 2 - 1) * THREE.MathUtils.degToRad(35));
      d.scale.setScalar(iTaille[i]); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
      const t = Math.random(); c.copy(T[0]).lerp(T[1], Math.min(1, t * 1.6)).lerp(T[2], Math.max(0, t * 1.6 - 1)); im.setColorAt(i, c); i++;
    }
  }
  geo.setAttribute('iCentre', new THREE.InstancedBufferAttribute(iCentre, 3)); geo.setAttribute('iTaille', new THREE.InstancedBufferAttribute(iTaille, 1));
  const g = new THREE.Group(); g.add(im, ombres); return g;
}

// ---- fumees : points doux qui montent des cheminees ----
export function creerFumees(sources, parCheminee = 16) {
  const n = sources.length * parCheminee, pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { const s = sources[Math.floor(i / parCheminee)]; const p = b2t(s); pos.set([p.x, p.y, p.z], i * 3); ph[i] = (i % parCheminee) / parCheminee + Math.random() * .03; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aP', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTemps: temps, uCoul: { value: new THREE.Color('#fff') }, uPx: { value: 1 }, uBouffee: { value: 0 } },
    vertexShader: `attribute float aP; uniform float uTemps,uPx; varying float vL;
      void main(){ float l=fract(aP+uTemps*.052); vL=l; vec3 p=position; float s=fract(aP*7.3)*6.28; p.y+=l*.62; p.x-=l*l*.42; p.x+=sin(l*6.+s)*.03*l; p.z+=cos(l*5.+s)*.035*l;
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=(.012+l*.075)*uPx/-mv.z; }`,
    fragmentShader: `precision highp float; uniform vec3 uCoul; varying float vL; void main(){ float d=length(gl_PointCoord-.5)*2.; float a=smoothstep(1.,.2,d)*smoothstep(0.,.1,vL)*(1.-vL)*.24; gl_FragColor=vec4(uCoul,a); }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}

// ---- halos autour de chaque lumiere, invisibles le jour ----
export function creerHalos(sources) {
  const n = sources.length, pos = new Float32Array(n * 3), tt = new Float32Array(n), col = new Float32Array(n * 3), ph = new Float32Array(n); const c = new THREE.Color();
  sources.forEach((s, i) => { const p = b2t(s.p); pos.set([p.x, p.y, p.z], i * 3); tt[i] = s.t || .35; ph[i] = Math.random() * 6.28; c.set(s.c || '#ff9a57'); col.set([c.r, c.g, c.b], i * 3); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aT', new THREE.BufferAttribute(tt, 1)); g.setAttribute('aC', new THREE.BufferAttribute(col, 3)); g.setAttribute('aP', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    uniforms: { uTemps: temps, uNuit: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute float aT,aP; attribute vec3 aC; uniform float uTemps,uNuit,uPx; varying vec3 vC; varying float vA;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=aT*uPx/-mv.z; vC=aC; vA=uNuit*(.88+.12*sin(uTemps*2.3+aP)); }`,
    fragmentShader: `precision highp float; varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-.5)*2.; float a=pow(max(1.-d,0.),2.4); gl_FragColor=vec4(vC*a*vA*.8,a*vA); }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}

// ---- lucioles autour du village ----
export function creerLucioles(n, Zmin, rx, rz) {
  const pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * .95; pos.set([Math.cos(a) * r * rx, Zmin + Math.random() * 1.6, Math.sin(a) * r * rz], i * 3); ph[i] = Math.random() * 100; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aP', new THREE.BufferAttribute(ph, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTemps: temps, uNuit: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute float aP; uniform float uTemps,uNuit,uPx; varying float vA; void main(){ vec3 p=position; p.x+=sin(uTemps*.33+aP)*.25; p.y+=sin(uTemps*.21+aP*2.)*.16; p.z+=cos(uTemps*.27+aP*3.)*.25;
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; gl_PointSize=.07*uPx/-mv.z; vA=uNuit*pow(max(sin(uTemps*.8+aP*5.),0.),3.); }`,
    fragmentShader: `precision highp float; varying float vA; void main(){ float d=length(gl_PointCoord-.5)*2.; float a=pow(max(1.-d,0.),2.); gl_FragColor=vec4(vec3(.72,1.,.42)*a*vA*2.,a*vA); }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
}

// ---- nuee d'oiseaux : deux ailes, battement dans le shader ----
export class Oiseaux {
  constructor(n, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .5, 0, 0, -.55, -1, 0, -.1, 0, 0, .5, 0, 0, -.55, 1, 0, -.1, 0, -.02, .5, 0, -.02, -.55, 0, .12, 0], 3)); g.computeVertexNormals();
    this.mat = mat; const aile = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 0]);
    g.setAttribute('aA', new THREE.BufferAttribute(aile, 1));
    const ph = new Float32Array(n); for (let i = 0; i < n; i++) ph[i] = Math.random() * 6.28; g.setAttribute('aP', new THREE.InstancedBufferAttribute(ph, 1));
    mat.onBeforeCompile = (s) => { s.uniforms.uTemps = temps; s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTemps; attribute float aA; attribute float aP;').replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed.y += aA*sin(uTemps*7.5+aP)*.72;`); };
    this.im = new THREE.InstancedMesh(g, mat, n); this.im.frustumCulled = false; this.im.castShadow = false;
    this.oi = Array.from({ length: n }, (_, i) => ({ a: Math.random() * 6.28, r: 3.1 + Math.random() * 2.2, y: 4.6 + Math.random() * 1.6, v: .1 + Math.random() * .08, ph: Math.random() * 6.28, s: .028 + Math.random() * .016 }));
    this.affole = 0; this._d = new THREE.Object3D();
  }
  envol() { this.affole = 1; }
  maj(dt, t) {
    this.affole = Math.max(0, this.affole - dt * .14);
    const d = this._d, A = this.affole;
    this.oi.forEach((o, i) => {
      o.a += dt * o.v * (1 + A * 3.4);
      const r = o.r + Math.sin(t * .17 + o.ph) * .45 + A * 1.8, y = o.y + Math.sin(t * .23 + o.ph) * .3 + A * 1.2;
      const x = Math.cos(o.a) * r, z = Math.sin(o.a) * r;
      d.position.set(x, y, z); d.rotation.set(0, -o.a, Math.sin(t * .3 + o.ph) * .22); d.scale.setScalar(o.s * 1.5); d.updateMatrix(); this.im.setMatrixAt(i, d.matrix);
    });
    this.im.instanceMatrix.needsUpdate = true;
  }
}

// ---- habitants : vrais villageois animes, voir gens.js ----
export { Habitants } from './gens.js';

// ---- eau courante : ruisseau et cascade ----
export function matiereEau(bruit, chute) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTemps: temps, uBruit: { value: bruit }, uAmb: { value: new THREE.Color('#fff') }, uHaut: { value: new THREE.Color('#fff') } },
    vertexShader: `varying vec2 vU; varying float vF; void main(){ vU=uv; vec4 w=modelMatrix*vec4(position,1.); vF=w.y; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `precision highp float; uniform float uTemps; uniform sampler2D uBruit; uniform vec3 uAmb,uHaut; varying vec2 vU; varying float vF;
      void main(){ float e=abs(vU.x-.5)*2.; float v=vU.y;
        vec4 n=texture2D(uBruit,vec2(vU.x*${chute ? '.42' : '.8'},v*${chute ? '.36' : '1.4'}-uTemps*${chute ? '.42' : '.2'}));
        vec4 n2=texture2D(uBruit,vec2(vU.x*1.3+.4,v*${chute ? '.9' : '3.'}-uTemps*${chute ? '.7' : '.34'}));
        float m=n.r*.6+n2.g*.4; float blanc=smoothstep(.46,.68,m);
        float bord=smoothstep(1.,.45-m*.3,e);
        float a=bord*${chute ? 'mix(.55,.96,blanc)*smoothstep(0.,.3,v)' : 'mix(.72,1.,blanc)'};
        vec3 c=mix(uHaut*.72,uAmb*1.42,blanc);
        gl_FragColor=vec4(c,a); }`,
  });
}
