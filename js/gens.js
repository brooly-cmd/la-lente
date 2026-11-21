// Villageois animes : modeles Quaternius (CC0) prepares dans Blender (fabrication/personnages/construire.py).
// Ils marchent sur le chemin, s'arretent parfois ; Odile lit dans son atelier.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const b2t = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const alea = (a, b) => a + Math.random() * (b - a);
const VITESSE = .975;   // l'animation "marche" avance de 1,3 m en 1,333 s a l'echelle 1 : les pieds ne glissent pas
const ECHELLE = .045;   // 1,8 m -> environ 8 cm : la hauteur des portes du village
const FONDU = .35;
const VARIANTES = [['hommes', 'paysan'], ['femmes', 'robe'], ['hommes', 'barbu'], ['femmes', 'tablier'], ['hommes', 'jeune']];
const ODILE = { pos: [.315, 3.4737, .6591], rotY: Math.PI / 2, echelle: .115 };
const LANTERNE = [.28, .72, .06];   // a cote de la main, en metres a l'echelle 1

function garder(racine, noms) {
  const retirer = [];
  racine.traverse((o) => { if (o.isMesh && !noms.includes(o.name)) retirer.push(o); });
  for (const o of retirer) o.removeFromParent();
  racine.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.receiveShadow = true; } });
}

export class Habitants {
  constructor(chemin, n, matCorps, matLampe) {
    this.pts = chemin.map((p) => b2t(p)); this.n = n;
    this.cum = [0]; for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.L = this.cum[this.cum.length - 1];
    this.groupe = new THREE.Group();
    this.l = new THREE.InstancedMesh(new THREE.SphereGeometry(.0055, 6, 5), matLampe, n);
    this.l.frustumCulled = false; this.l.castShadow = false;
    this.lanternes = new Float32Array(n * 3);
    this._d = new THREE.Object3D(); this._d.scale.setScalar(0); this._d.updateMatrix();
    for (let i = 0; i < n; i++) this.l.setMatrixAt(i, this._d.matrix);
    this._d.scale.setScalar(1);
    this.groupe.add(this.l);
    this._p = new THREE.Vector3(); this._t = new THREE.Vector3();
    this.g = []; this.odile = null; this.pret = false;
    const charge = new GLTFLoader();
    Promise.all(['hommes', 'femmes'].map((f) => charge.loadAsync(`assets/gens/${f}.glb`)))
      .then(([hommes, femmes]) => this._peupler({ hommes, femmes }))
      .catch((e) => console.warn('Villageois non charges :', e));
  }

  _peupler(fichiers) {
    const clips = (gltf) => Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
    for (let i = 0; i < this.n; i++) {
      const [f, nom] = VARIANTES[i % VARIANTES.length];
      const racine = SkeletonUtils.clone(fichiers[f].scene); garder(racine, [nom]);
      const ech = ECHELLE * alea(.94, 1.06), k = alea(.9, 1.1);
      racine.scale.setScalar(ech);
      const mixer = new THREE.AnimationMixer(racine), C = clips(fichiers[f]);
      const actions = { marche: mixer.clipAction(C.marche), repos: mixer.clipAction(C.repos), bavarde: mixer.clipAction(C.bavarde) };
      actions.marche.timeScale = k;
      const h = { racine, mixer, actions, courante: 'marche', ech, k, s: Math.random() * this.L, sens: Math.random() < .5 ? 1 : -1, etat: 'marche', minuterie: 0, auBout: false, arret: alea(5, 40), cap: 0 };
      actions.marche.play(); actions.marche.time = Math.random() * C.marche.duration;
      this._placer(h); h.cap = h.capCible;
      racine.rotation.y = h.cap;
      this.groupe.add(racine); this.g.push(h);
    }
    // Odile, assise a son etabli, lit
    const racine = SkeletonUtils.clone(fichiers.femmes.scene); garder(racine, ['lectrice', 'livre', 'page']);
    racine.position.set(...ODILE.pos); racine.rotation.y = ODILE.rotY; racine.scale.setScalar(ODILE.echelle);
    const mixer = new THREE.AnimationMixer(racine);
    mixer.clipAction(clips(fichiers.femmes).lire).play();
    this.odile = { racine, mixer };
    this.groupe.add(racine);
    this.pret = true;
  }

  _jouer(h, nom) {
    if (h.courante === nom) return;
    const avant = h.actions[h.courante], apres = h.actions[nom];
    apres.reset(); apres.timeScale = nom === 'marche' ? h.k : 1; apres.play();
    apres.crossFadeFrom(avant, FONDU, false);
    h.courante = nom;
  }

  // position et direction sur le chemin a l'abscisse h.s
  _placer(h) {
    const cum = this.cum, pts = this.pts;
    let a = 1, b = cum.length - 1;
    while (a < b) { const m = (a + b) >> 1; if (cum[m] < h.s) a = m + 1; else b = m; }
    const u = (h.s - cum[a - 1]) / Math.max(1e-5, cum[a] - cum[a - 1]);
    this._p.copy(pts[a - 1]).lerp(pts[a], u);
    this._t.subVectors(pts[a], pts[a - 1]).multiplyScalar(h.sens);
    h.racine.position.copy(this._p);
    h.capCible = Math.atan2(this._t.x, this._t.z);
  }

  maj(dt, t) {
    if (!this.pret) return;
    this.odile.mixer.update(dt);
    const d = this._d, L = this.L;
    for (let i = 0; i < this.g.length; i++) {
      const h = this.g[i];
      h.mixer.update(dt);
      let tour = 8;
      if (h.etat === 'marche') {
        h.s += h.sens * VITESSE * h.ech * h.k * dt;
        h.arret -= dt;
        if (h.s <= 0 || h.s >= L) {
          h.s = Math.max(0, Math.min(L, h.s)); h.etat = 'pause'; h.auBout = true; h.minuterie = alea(1.5, 4); this._jouer(h, 'repos');
        } else if (h.arret <= 0) {
          h.etat = 'pause'; h.auBout = false; h.minuterie = alea(2, 6); h.arret = alea(20, 40); this._jouer(h, Math.random() < .5 ? 'repos' : 'bavarde');
        }
      } else if (h.etat === 'pause') {
        h.minuterie -= dt;
        if (h.minuterie <= 0) {
          if (h.auBout) { h.sens = -h.sens; h.etat = 'tourne'; h.minuterie = .6; }
          else { h.etat = 'marche'; this._jouer(h, 'marche'); }
        }
      } else {   // demi-tour sur place avant de repartir
        tour = 6; h.minuterie -= dt;
        if (h.minuterie <= 0) { h.etat = 'marche'; this._jouer(h, 'marche'); }
      }
      this._placer(h);
      let diff = h.capCible - h.cap; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      h.cap += diff * Math.min(1, dt * tour);
      h.racine.rotation.y = h.cap;
      // lanterne a cote de la main
      const c = Math.cos(h.cap), s = Math.sin(h.cap), e = h.ech;
      const lx = LANTERNE[0] * e, ly = LANTERNE[1] * e, lz = LANTERNE[2] * e;
      d.position.set(h.racine.position.x + c * lx + s * lz, h.racine.position.y + ly, h.racine.position.z - s * lx + c * lz);
      d.updateMatrix(); this.l.setMatrixAt(i, d.matrix);
      this.lanternes[i * 3] = d.position.x; this.lanternes[i * 3 + 1] = d.position.y; this.lanternes[i * 3 + 2] = d.position.z;
    }
    this.l.instanceMatrix.needsUpdate = true;
  }
}
