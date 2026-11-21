// Ce qui vit sur le dos : herbe, feuillage, fumees, lueurs, oiseaux, habitants, eau courante.
import * as THREE from 'three';

const b2t = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
export const temps = { value: 0 };

function vent(m, code) {
  m.onBeforeCompile = (s) => { s.uniforms.uTemps = temps; code(s); };
}

export function creerHerbe(buffer, n, exclus = []) {
  const points = new Float32Array(buffer);
  const total = Math.floor(points.length / 6);
  const mobile = n <= 20000;
  n = Math.min(n, total);

  // Le tirage reproductible ne dépend ni de la caméra ni du palier en cours.
  let graine = 17491;
  const hasard = () => {
    graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0;
    return graine / 4294967296;
  };
  const interdit = (x, y) => exclus.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 < r * r);
  const racines = new Float32Array(3 * (n + (mobile ? Math.floor(n / 2) : n)));
  const ordre = [];
  const planter = (j, x, y) => {
    const k = ordre.length * 3;
    racines[k] = j;
    racines[k + 1] = x;
    racines[k + 2] = y;
    ordre.push(k);
  };
  for (let i = 0; i < n; i++) {
    const j = 6 * Math.floor((i + hasard()) * total / n);
    const x = points[j], y = points[j + 1];
    if (interdit(x, y)) continue;
    planter(j, x, y);
    if (mobile && i % 2 === 0) continue;
    const a = hasard() * Math.PI * 2, r = .003 + hasard() * .006;
    const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
    if (!interdit(x + dx, y + dy)) planter(j, x + dx, y + dy);
    else if (!interdit(x - dx, y - dy)) planter(j, x - dx, y - dy);
  }
  // Chaque préfixe reste réparti sur le village quand main.js réduit count.
  for (let i = ordre.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    const k = ordre[i];
    ordre[i] = ordre[j];
    ordre[j] = k;
  }

  const pointe = .24;
  const sections = [[0, .5, 0], [.44, .36, .035]];
  if (!mobile) sections.push([.76, .17, .115]);
  const sommets = [], normales = [], couleurs = [], triangles = [];
  for (const [h, largeur, courbe] of sections) {
    sommets.push(-largeur, h, courbe, largeur, h, courbe);
    normales.push(-.16, .97, .18, .16, .97, .18);
    const teinte = [.50 + .83 * h, .56 + .69 * h, .49 + .41 * h];
    couleurs.push(...teinte, ...teinte);
  }
  const sommet = sommets.length / 3;
  sommets.push(0, 1, pointe);
  normales.push(0, .96, .28);
  couleurs.push(1.48, 1.30, .87);
  for (let j = 0; j < sommet - 2; j += 2) triangles.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
  triangles.push(sommet - 2, sommet - 1, sommet);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(sommets, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normales, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 3));
  g.setIndex(triangles);

  // Une petite corolle à cinq pétales, dont le centre coïncide avec la pointe.
  const corolle = new THREE.BufferGeometry();
  const petales = [0, 1, pointe], teintesPetales = [.95, .70, .38], faces = [];
  for (let j = 0; j < 15; j++) {
    const a = j * Math.PI * 2 / 15, r = j % 3 === 0 ? .63 : 1;
    petales.push(Math.cos(a) * r * 1.4, 1 + .075 * r, pointe + Math.sin(a) * r * .17);
    teintesPetales.push(1, 1, 1);
    faces.push(0, (j + 1) % 15 + 1, j + 1);
  }
  corolle.setAttribute('position', new THREE.Float32BufferAttribute(petales, 3));
  corolle.setAttribute('color', new THREE.Float32BufferAttribute(teintesPetales, 3));
  corolle.setIndex(faces);
  corolle.computeVertexNormals();

  const m = new THREE.MeshPhysicalMaterial({ roughness: .89, side: THREE.DoubleSide, envMapIntensity: .5, vertexColors: true });
  vent(m, (s) => {
    // Même déplacement pour le bout d'une lame et sa fleur, dans le repère du village.
    const deplacement = `
      vec2 racine = instanceMatrix[3].xz;
      float vague = sin(dot(racine, vec2(-1.55, .43)) - uTemps * .83);
      float houle = sin(dot(racine, vec2(.64, 2.11)) - uTemps * .56);
      float frisson = sin(dot(racine, vec2(19., -12.)) + uTemps * 4.1);
      float souffle = .19 + .12 * vague + .065 * houle + .034 * frisson;
      float hauteur = min(position.y, 1.);
      vec3 pli = vec3(-souffle, 0., souffle * .28 + .027 * frisson)
        * hauteur * hauteur * instanceMatrix[1].y;`;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTemps;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + deplacement)
      .replace('#include <project_vertex>', THREE.ShaderChunk.project_vertex.replace('mvPosition = modelViewMatrix', 'mvPosition.xyz += pli;\nmvPosition = modelViewMatrix'))
      .replace('#include <worldpos_vertex>', THREE.ShaderChunk.worldpos_vertex.replace('worldPosition = modelMatrix', 'worldPosition.xyz += pli;\nworldPosition = modelMatrix'));
    // Les deux faces gardent une normale orientée vers le ciel.
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  });
  m.customProgramCacheKey = () => 'lente-pelouse-vent';
  const nombreLames = ordre.length;
  const nombreFleurs = Math.round(nombreLames * .03);
  const partFleurie = nombreLames ? nombreFleurs / nombreLames : 0;
  const im = new THREE.InstancedMesh(g, m, nombreLames);
  const fleurs = new THREE.InstancedMesh(corolle, m, nombreFleurs);
  im.frustumCulled = fleurs.frustumCulled = false;
  im.receiveShadow = fleurs.receiveShadow = true;
  fleurs.renderOrder = im.renderOrder + 1;
  im.add(fleurs);
  im.onBeforeRender = () => { fleurs.count = Math.round(im.count * partFleurie); };

  const d = new THREE.Object3D(), c = new THREE.Color();
  const palette = ['#f1e9d4', '#e6c66b', '#e0adb1', '#b8a8d1'].map((hex) => new THREE.Color(hex));
  const sec = new THREE.Color('#735c32');
  let fleur = 0;
  for (let i = 0; i < nombreLames; i++) {
    const k = ordre[i], j = racines[k], x = racines[k + 1], y = racines[k + 2];
    const h = .020 + .035 * Math.pow(hasard(), 1.6);
    d.position.set(x, points[j + 2] - .004, -y);
    d.rotation.set((hasard() - .5) * .35, hasard() * Math.PI * 2, (hasard() - .5) * .27, 'YXZ');
    d.scale.set(.00288 + hasard() * .0024, h, h);
    d.updateMatrix();
    im.setMatrixAt(i, d.matrix);
    c.setRGB(points[j + 3], points[j + 4], points[j + 5]);
    const touffe = .5 + .5 * Math.sin(x * 14 + y * 7) * Math.sin(y * 17 - x * 5);
    c.lerp(sec, touffe * .13).multiplyScalar(.93 + .23 * touffe + hasard() * .20);
    im.setColorAt(i, c);
    if (Math.round((i + 1) * partFleurie) > fleur) {
      fleurs.setMatrixAt(fleur, d.matrix);
      fleurs.setColorAt(fleur, palette[Math.floor(hasard() * palette.length)]);
      fleur++;
    }
  }
  im.instanceMatrix.needsUpdate = fleurs.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  if (fleurs.instanceColor) fleurs.instanceColor.needsUpdate = true;
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

export function creerFumees(sources, parCheminee = 16) {
  parCheminee = THREE.MathUtils.clamp(Math.floor(parCheminee), 0, 16);
  const n = sources.length * parCheminee;
  const g = new THREE.PlaneGeometry(1, 1);
  const bouffees = new Float32Array(n * 2);
  const bruit = new THREE.TextureLoader().load(new URL('../assets/tex/bruit.png', import.meta.url).href);
  bruit.wrapS = bruit.wrapT = THREE.RepeatWrapping;
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    // uPx reste disponible pour main.js ; la projection fixe désormais la taille à l'écran.
    uniforms: { uTemps: temps, uCoul: { value: new THREE.Color('#fff') }, uPx: { value: 1 }, uBouffee: { value: 0 }, uBruit: { value: bruit } },
    vertexShader: `
      attribute vec2 aBouffee;
      uniform float uTemps, uBouffee;
      varying vec2 vNuage, vEchantillon;
      varying float vOpacite;
      void main() {
        float age = fract(aBouffee.x + uTemps * .108);
        float graine = aBouffee.y;
        const vec3 vent = vec3(-1., 0., .28);
        vec3 centre = instanceMatrix[3].xyz;
        centre.y += .007 + age * (.24 + age * .37);
        centre += vent * (.48 * age * age);
        centre.xz += vec2(sin(age * 6. + graine * 6.28), cos(age * 5. + graine * 6.28)) * (.04 * age);
        vec4 mv = modelViewMatrix * vec4(centre, 1.);

        // Rotation de la bouffée, puis étirement dans la direction du vent projeté.
        float angle = graine * 6.28 + age * (1.2 + graine * 1.2);
        float c = cos(angle), s = sin(angle);
        vec2 p = mat2(c, s, -s, c) * position.xy;
        vec2 axe = (modelViewMatrix * vec4(vent, 0.)).xy;
        axe *= inversesqrt(max(dot(axe, axe), .001));
        p += axe * dot(p, axe) * (.27 * age);
        float taille = .063 * (1. + 4. * age) * (1. + .2 * clamp(uBouffee, 0., 1.));
        mv.xy += p * taille;
        gl_Position = projectionMatrix * mv;
        vNuage = position.xy * 2.;
        vEchantillon = uv * .72 + vec2(graine * 7.13, graine * 4.37 + age * .19);
        vOpacite = smoothstep(0., .07, age) * (1. - smoothstep(.30, 1., age)) * (1. - .52 * age);
      }`,
    fragmentShader: `
      uniform vec3 uCoul;
      uniform sampler2D uBruit;
      varying vec2 vNuage, vEchantillon;
      varying float vOpacite;
      void main() {
        float lobes = texture2D(uBruit, vEchantillon).r;
        float grain = texture2D(uBruit, vEchantillon * 2.7 + .17).r;
        float rayon = length(vNuage) + (.5 - lobes) * .46 + (.5 - grain) * .12;
        float bord = 1. - smoothstep(.34, .93, rayon);
        bord *= 1. - smoothstep(.83, 1., max(abs(vNuage.x), abs(vNuage.y)));
        float coeur = 1. - smoothstep(.04, .77, rayon + vNuage.y * .13);
        float alpha = .35 * vOpacite * bord * mix(.53, 1., coeur) * mix(.75, 1., grain);
        gl_FragColor = vec4(uCoul * mix(.61, 1.16, coeur), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const fumees = new THREE.InstancedMesh(g, m, n);
  const matrice = new THREE.Matrix4();
  sources.forEach((source, i) => {
    const p = b2t(source);
    matrice.makeTranslation(p.x, p.y, p.z);
    const depart = Math.random();
    for (let j = 0; j < parCheminee; j++) {
      const k = i * parCheminee + j;
      fumees.setMatrixAt(k, matrice);
      bouffees[k * 2] = (depart + (j + Math.random() * .2) / parCheminee) % 1;
      bouffees[k * 2 + 1] = Math.random();
    }
  });
  g.setAttribute('aBouffee', new THREE.InstancedBufferAttribute(bouffees, 2));
  fumees.instanceMatrix.needsUpdate = true;
  fumees.frustumCulled = false;
  return fumees;
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
