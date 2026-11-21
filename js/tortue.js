// La bete : peau articulee par un squelette construit ici (os sans rotation de repos, tout est simple a piloter),
// marche procedurale, regard qui te suit, paupieres.
import * as THREE from 'three';

const b2t = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const CHAINES = {
  cou: [[1.95, 0, 1.28], [2.85, 0, 1.68], [3.45, 0, 2.28], [3.78, 0, 2.72]],
  tete: [3.78, 0, 2.72], teteBout: [5.0, 0, 2.8], queue: [[-2.15, 0, 1.08], [-2.72, 0, .86], [-3.12, 0, .58]],
  corps: [[-1.5, 0, 1.28], [1.5, 0, 1.28]], racine: [0, 0, 1.28],
};
const PATTES = {
  FL: { h: [1.45, 1.30, 1.30], g: [1.82, 1.86, .78], c: [1.86, 1.92, .20], r: [.56, .43, .50], phase: 0 },
  RR: { h: [-1.50, -1.28, 1.25], g: [-1.88, -1.78, .72], c: [-1.84, -1.82, .20], r: [.62, .52, .56], phase: .25 },
  FR: { h: [1.45, -1.30, 1.30], g: [1.82, -1.86, .78], c: [1.86, -1.92, .20], r: [.56, .43, .50], phase: .5 },
  RL: { h: [-1.50, 1.28, 1.25], g: [-1.88, 1.78, .72], c: [-1.84, 1.82, .20], r: [.62, .52, .56], phase: .75 },
};
export const OEIL = [4.40, .365, 2.97];
export const CYCLE = 11.0, FOULEE = .72, APPUI = .72;
export const VITESSE = FOULEE / (APPUI * CYCLE);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
function distSeg(p, a, b) {
  _a.subVectors(b, a); const t = THREE.MathUtils.clamp(_b.subVectors(p, a).dot(_a) / _a.lengthSq(), 0, 1);
  return _c.copy(a).addScaledVector(_a, t).distanceTo(p);
}
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class Tortue {
  constructor(gltf, mats, racineScene) {
    this.groupe = new THREE.Group(); racineScene.add(this.groupe);
    this.t = 0; this.onPas = () => {};
    const os = {}; const mk = (nom, pos, parent) => { const b = new THREE.Bone(); b.name = nom; b.position.copy(pos); b.userData.rest = pos.clone(); (parent || this.groupe).add(b); os[nom] = b; return b; };
    const abs = {}; const add = (nom, abso, pere) => { abs[nom] = b2t(abso); return mk(nom, pere ? abs[nom].clone().sub(abs[pere]) : abs[nom].clone(), pere ? os[pere] : null); };
    add('racine', CHAINES.racine, null);
    add('cou0', CHAINES.cou[0], 'racine'); add('cou1', CHAINES.cou[1], 'cou0'); add('cou2', CHAINES.cou[2], 'cou1'); add('tete', CHAINES.tete, 'cou2');
    add('q0', CHAINES.queue[0], 'racine'); add('q1', CHAINES.queue[1], 'q0'); add('q2', CHAINES.queue[2], 'q1');
    for (const k in PATTES) { const P = PATTES[k]; add(k + 'h', P.h, 'racine'); add(k + 'g', P.g, k + 'h'); add(k + 'c', P.c, k + 'g'); }
    this.os = os; this.abs = abs;

    // Pelle de poids : distance aux segments, sans croisement entre membres
    const peauMesh = gltf.getObjectByName('peau');
    const g = peauMesh.geometry; const pos = g.attributes.position; const n = pos.count;
    const noms = Object.keys(os); const idx = Object.fromEntries(noms.map((nm, i) => [nm, i]));
    const segs = [
      ['racine', b2t(CHAINES.corps[0]), b2t(CHAINES.corps[1]), .95],
      ['cou0', abs.cou0, abs.cou1, .5], ['cou1', abs.cou1, abs.cou2, .36], ['cou2', abs.cou2, abs.tete, .3], ['tete', abs.tete, b2t(CHAINES.teteBout), .36],
      ['q0', abs.q0, abs.q1, .2], ['q1', abs.q1, abs.q2, .08],
    ];
    for (const k in PATTES) { const P = PATTES[k]; segs.push([k + 'h', abs[k + 'h'], abs[k + 'g'], P.r[1]], [k + 'g', abs[k + 'g'], abs[k + 'c'], P.r[1]], [k + 'c', abs[k + 'c'], abs[k + 'c'].clone().setY(-.2).add(new THREE.Vector3(.12, 0, 0)), P.r[2]]); }
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i);
      const list = segs.map(([nm, a, b, r]) => { const d = Math.max(distSeg(p, a, b) - r * .55, .012); return [idx[nm], 1 / Math.pow(d, 5)]; });
      list.sort((x, y) => y[1] - x[1]);
      const top = list.slice(0, 4), tot = top.reduce((s, x) => s + x[1], 0);
      top.forEach((x, j) => { si[i * 4 + j] = x[0]; sw[i * 4 + j] = x[1] / tot; });
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    const peau = new THREE.SkinnedMesh(g, mats.peau); peau.name = 'peau'; peau.castShadow = true; peau.receiveShadow = true; peau.frustumCulled = false;
    this.groupe.add(peau);
    this.groupe.updateMatrixWorld(true);
    const liste = noms.map((nm) => os[nm]);
    peau.bind(new THREE.Skeleton(liste), new THREE.Matrix4());
    this.peau = peau;

    // Tout ce qui est pose sur la carapace suit la racine
    this.dos = new THREE.Group(); this.dos.position.copy(abs.racine).negate(); os.racine.add(this.dos);

    // Yeux et paupieres
    this.yeux = [];
    const tete = os.tete;
    const bordMat = new THREE.MeshPhysicalMaterial({ color: '#2a241d', roughness: .3, clearcoat: .45, clearcoatRoughness: .18 });
    const rayonPaupiere = .116 + .006;
    const bordHaut = new THREE.TorusGeometry(rayonPaupiere, .011, 8, 48);
    const bordBas = new THREE.TorusGeometry(rayonPaupiere, .011, 8, 48);
    // Le bord libre des demi-spheres est dans le plan xz ; il suit leur rotation.
    bordHaut.rotateX(Math.PI / 2); bordBas.rotateX(Math.PI / 2);
    for (const s of [1, -1]) {
      const pp = b2t([OEIL[0], OEIL[1] * s, OEIL[2]]).sub(abs.tete);
      const piv = new THREE.Group(); piv.position.copy(pp); tete.add(piv);
      // le pivot regarde vers l'avant et l'exterieur : +z local sort de l'orbite
      piv.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(.62, .06, s === 1 ? -.78 : .78).normalize());
      const globe = new THREE.Mesh(new THREE.SphereGeometry(.116, 40, 28), mats.oeil);
      globe.position.z = -.02;
      piv.add(globe);
      // Aplatissement dans le +z du pivot, meme pendant la rotation du clignement.
      const paupieres = new THREE.Group(); paupieres.scale.z = .82; piv.add(paupieres);
      const haut = new THREE.Mesh(new THREE.SphereGeometry(rayonPaupiere, 32, 16, 0, Math.PI * 2, 0, Math.PI * .5), mats.paupiere);
      const bas = new THREE.Mesh(new THREE.SphereGeometry(rayonPaupiere, 32, 12, 0, Math.PI * 2, 0, Math.PI * .5), mats.paupiere);
      haut.add(new THREE.Mesh(bordHaut, bordMat)); bas.add(new THREE.Mesh(bordBas, bordMat));
      paupieres.add(haut, bas);
      this.yeux.push({ globe, haut, bas, piv, s });
    }
    this.regard = new THREE.Vector3(10, 3, 10); this.regardCible = new THREE.Vector3(10, 3, 10);
    this.lid = .27; this.lidCible = .27; this.prochain = 4 + Math.random() * 6; this.heureux = 0;
    this.yaw = 0; this.pitch = 0;
    this.pieds = Object.keys(PATTES).map((k) => ({ k, P: PATTES[k], appui: true, L1: abs[k + 'h'].distanceTo(abs[k + 'g']), L2: abs[k + 'g'].distanceTo(abs[k + 'c']), rest1: abs[k + 'g'].clone().sub(abs[k + 'h']).normalize(), rest2: abs[k + 'c'].clone().sub(abs[k + 'g']).normalize() }));
    this._q1 = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._qi = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._m = new THREE.Vector3();
    this._racineH = new THREE.Vector3(); this._local = new THREE.Vector3(); this._mat = new THREE.Matrix4(); this._qR = new THREE.Quaternion();
  }

  // cible : point du monde que le pointeur designe
  regarder(x, y, z) { this.regardCible.set(x, y, z); }
  caresse() { this.heureux = 3.2; this.lidCible = .9; }
  clignement() { this.prochain = 0; }

  maj(dt, temps) {
    this.t += dt;
    const R = this.os.racine, tt = this.t / CYCLE;
    // la coque oscille tres lentement ; on sent le poids
    const bob = Math.sin(tt * Math.PI * 4 + .4) * .032, roul = Math.sin(tt * Math.PI * 2) * .018, tang = Math.sin(tt * Math.PI * 4 + 1.2) * .007, lacet = Math.sin(tt * Math.PI * 2 + 1.1) * .012;
    R.position.copy(this.abs.racine); R.position.y += bob; R.position.x += Math.sin(tt * Math.PI * 4) * .02;
    R.rotation.set(roul, lacet, tang);
    R.updateMatrix(); this._qR.copy(R.quaternion);
    this.groupe.updateMatrixWorld(true);
    const qRi = this._qi.copy(this._qR).invert();
    for (const f of this.pieds) {
      const ph = (tt + f.P.phase) % 1; const c = this.abs[f.k + 'c']; let dx, y;
      if (ph < APPUI) { const u = ph / APPUI; dx = FOULEE * (.5 - u); y = 0; if (!f.appui) { f.appui = true; const px = c.x + dx, pz = c.z; this.onPas(px, pz); } }
      else { f.appui = false; const u = (ph - APPUI) / (1 - APPUI), e = u * u * (3 - 2 * u); dx = FOULEE * (e - .5); y = Math.sin(u * Math.PI) * .3; }
      const cible = this._v.set(c.x + dx + (R.position.x - this.abs.racine.x) * 0, c.y + y, c.z);
      // hanche en repere du groupe
      const H = this.os[f.k + 'h'];
      const hanche = this._local.copy(this.abs[f.k + 'h']).sub(this.abs.racine).applyQuaternion(this._qR).add(R.position).clone();
      const d = cible.clone().sub(hanche); const L = Math.min(d.length(), f.L1 + f.L2 - .002); d.setLength(L);
      const a = (f.L1 * f.L1 - f.L2 * f.L2 + L * L) / (2 * L); const hh = Math.sqrt(Math.max(0, f.L1 * f.L1 - a * a));
      const dn = d.clone().normalize();
      // le genou part vers l'exterieur et un peu vers l'avant
      const pole = new THREE.Vector3(.25, .1, Math.sign(c.z)).normalize(); pole.addScaledVector(dn, -pole.dot(dn)).normalize();
      const genou = hanche.clone().addScaledVector(dn, a).addScaledVector(pole, hh);
      const u1 = genou.clone().sub(hanche).normalize(), u2 = cible.clone().sub(genou).normalize();
      const q1w = new THREE.Quaternion().setFromUnitVectors(f.rest1, u1), q2w = new THREE.Quaternion().setFromUnitVectors(f.rest2, u2);
      // tout est exprime dans le repere du groupe ; on retire la rotation du parent
      H.quaternion.copy(qRi).multiply(q1w);
      this.os[f.k + 'g'].quaternion.copy(q1w).invert().multiply(q2w);
      // le pied reste a plat, s'incline en l'air
      const inc = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ph >= APPUI ? -Math.sin((ph - APPUI) / (1 - APPUI) * Math.PI) * .32 : 0);
      this.os[f.k + 'c'].quaternion.copy(q2w).invert().multiply(inc);
    }
    // queue paresseuse
    this.os.q0.rotation.y = Math.sin(tt * Math.PI * 2) * .1; this.os.q1.rotation.y = Math.sin(tt * Math.PI * 2 - .7) * .16;

    // regard : les yeux d'abord, la tete apres, le cou enfin
    this.regard.lerp(this.regardCible, 1 - Math.exp(-3.2 * dt));
    const tetePos = this._w.copy(this.abs.tete); const dir = this._m.copy(this.regard).sub(tetePos);
    const yawC = THREE.MathUtils.clamp(Math.atan2(-dir.z, dir.x), -.62, .62);
    const pitchC = THREE.MathUtils.clamp(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), -.3, .14);
    this.yaw = damp(this.yaw, yawC, .9, dt); this.pitch = damp(this.pitch, pitchC, .9, dt);
    const balance = Math.sin(tt * Math.PI * 4 + 2) * .02;
    const ps = [[this.os.cou0, .2], [this.os.cou1, .25], [this.os.cou2, .25], [this.os.tete, .3]];
    for (const [o, k] of ps) o.rotation.set(0, this.yaw * k + (o === this.os.cou0 ? balance : 0), this.pitch * k, 'YXZ');

    // yeux
    this.prochain -= dt;
    if (this.prochain <= 0) { this.prochain = 4 + Math.random() * 6; this.clignote = .5; }
    let lidV = this.heureux > 0 ? .82 : .27;
    if (this.heureux > 0) this.heureux -= dt;
    if (this.clignote > 0) { this.clignote = Math.max(0, this.clignote - dt); const u = Math.sin(this.clignote / .5 * Math.PI); lidV = Math.max(lidV, u); }
    this.lid = damp(this.lid, lidV, this.clignote > 0 ? 40 : 4, dt);
    for (const e of this.yeux) {
      // le globe vise la cible : on passe dans le repere local du pivot
      e.piv.updateWorldMatrix(true, false);
      const loc = e.piv.worldToLocal(this._v.copy(this.regard)).normalize();
      // +z du globe = centre de la pupille ; l'oeil tourne dans son orbite, sans se retourner
      const dev = Math.acos(THREE.MathUtils.clamp(loc.z, -1, 1)), maxi = .62;
      if (dev > maxi) { const k = Math.sin(maxi) / Math.max(1e-4, Math.hypot(loc.x, loc.y)); loc.x *= k; loc.y *= k; loc.z = Math.cos(maxi); }
      e.globe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), loc.normalize());
      // paupieres : la haute descend, la basse remonte a peine
      e.haut.rotation.x = -.96 + this.lid * 2.2;
      e.bas.rotation.x = Math.PI + .74 - this.lid * 1.0;
    }
  }
}

// Iris ambre-olive : aucune lumiere peinte, les reflets viennent de la matiere.
export function textureOeil() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#140f0b'; x.fillRect(0, 0, c.width, c.height);
  // la sphere three : u=.75 regarde vers +z
  const cx = 256, cy = 256, Rx = 150, Ry = 150;
  x.save(); x.translate(cx, cy); x.scale(1, Ry / Rx);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, Rx);
  g.addColorStop(0, '#6b4a1f'); g.addColorStop(.3, '#6b4a1f'); g.addColorStop(.52, '#8a6a2c'); g.addColorStop(.76, '#7a6f35'); g.addColorStop(.92, '#40351c'); g.addColorStop(.97, '#20160e'); g.addColorStop(1, '#140f0b');
  x.fillStyle = g; x.beginPath(); x.arc(0, 0, Rx, 0, Math.PI * 2); x.fill();
  for (let i = 0; i < 360; i++) {
    const a = i / 360 * Math.PI * 2 + (Math.random() - .5) * .018;
    const r0 = Rx * (.3 + Math.random() * .18), r1 = Rx * (.74 + Math.random() * .2), courbe = (Math.random() - .5) * .05;
    x.globalAlpha = .08 + Math.random() * .15; x.lineWidth = .4 + Math.random() * 1.1;
    x.strokeStyle = Math.random() < .48 ? '#c79a4a' : '#2a1c10';
    x.beginPath(); x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    x.quadraticCurveTo(Math.cos(a + courbe) * (r0 + r1) * .5, Math.sin(a + courbe) * (r0 + r1) * .5, Math.cos(a) * r1, Math.sin(a) * r1); x.stroke();
  }
  for (let i = 0; i < 45; i++) {
    const a = Math.random() * Math.PI * 2, r = Rx * (.36 + Math.random() * .5);
    x.globalAlpha = .12 + Math.random() * .16; x.fillStyle = '#c79a4a';
    x.beginPath(); x.ellipse(Math.cos(a) * r, Math.sin(a) * r, .5 + Math.random(), 1 + Math.random() * 1.8, a, 0, Math.PI * 2); x.fill();
  }
  x.globalAlpha = 1;
  const pupille = x.createRadialGradient(0, 0, Rx * .28, 0, 0, Rx * .32);
  pupille.addColorStop(0, '#050404'); pupille.addColorStop(.5, '#050404'); pupille.addColorStop(1, 'rgba(5,4,4,0)');
  x.fillStyle = pupille; x.beginPath(); x.arc(0, 0, Rx * .32, 0, Math.PI * 2); x.fill();
  x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// Une seule peau pour les quatre paupieres ; v=0 est leur bord libre.
export function texturePaupiere() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#57534a'; x.fillRect(0, 0, c.width, c.height);
  // Reseau de petites cellules decalees, avec sommets partages et couture periodique.
  const cols = 32, rows = 16, pasX = c.width / cols, pasY = c.height / rows;
  const points = Array.from({ length: rows + 1 }, (_, j) => {
    const ligne = Array.from({ length: cols }, (_, i) => ({ x: (i + (j % 2) * .5) * pasX + (Math.random() - .5) * 7, y: j * pasY + (Math.random() - .5) * 7 }));
    ligne.push({ x: ligne[0].x + c.width, y: ligne[0].y }); return ligne;
  });
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = points[j][i], b = points[j][i + 1], d = points[j + 1][i], e = points[j + 1][i + 1];
    const couleur = x.createLinearGradient(a.x, a.y, e.x, e.y);
    couleur.addColorStop(0, '#66604f'); couleur.addColorStop(.45, Math.random() < .5 ? '#57534a' : '#5c574b'); couleur.addColorStop(1, '#48453d');
    for (const decalage of [-c.width, 0, c.width]) {
      x.save(); x.translate(decalage, 0); x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.lineTo(e.x, e.y); x.lineTo(d.x, d.y); x.closePath();
      x.globalAlpha = .65 + Math.random() * .2; x.fillStyle = couleur; x.fill();
      x.globalAlpha = .62; x.strokeStyle = '#302c25'; x.lineWidth = 1.25; x.lineJoin = 'round'; x.stroke(); x.restore();
    }
  }
  // Le bas de l'image rejoint le bord libre de la demi-sphere : rides concentriques.
  for (let k = 0; k < 6; k++) {
    const y = c.height - 7 - k * 15;
    for (const [decalage, couleur, largeur] of [[-2.5, 'rgba(132,123,101,.28)', 3], [0, 'rgba(34,30,25,.7)', 2.8]]) {
      x.beginPath();
      for (let i = 0; i <= c.width; i += 2) {
        const v = y + decalage + Math.sin(i / c.width * Math.PI * 4 + k * .7) * 2 + Math.sin(i / c.width * Math.PI * 12) * .65;
        if (i === 0) x.moveTo(i, v); else x.lineTo(i, v);
      }
      x.strokeStyle = couleur; x.lineWidth = largeur; x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
