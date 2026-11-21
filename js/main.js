// La Lente - la scene, la journee, le geste.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { creerCiel, appliquerCiel, creerEtoiles, etatDuTemps, nouvelEtat } from './ciel.js';
import { creerMiroir, Rides } from './miroir.js';
import { Tortue, textureOeil, texturePaupiere, VITESSE, OEIL } from './tortue.js';
import { creerHerbe, creerFeuillage, creerFumees, creerHalos, creerLucioles, Oiseaux, Habitants, matiereEau, temps } from './vie.js';
import { Son } from './son.js';

const params = new URLSearchParams(location.search);
const b2t = (p) => new THREE.Vector3(p[0], p[2], -p[1]);
const $ = (s) => document.querySelector(s);
const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const reduit = matchMedia('(prefers-reduced-motion: reduce)').matches;
const tactile = matchMedia('(hover: none)').matches;
const mobile = params.get('qualite') === 'pc' ? false : params.get('qualite') === 'mobile' || tactile || innerWidth < 720;

const canvas = $('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  if (!renderer.capabilities.isWebGL2) throw new Error('webgl2');
} catch (e) {
  $('#secours').hidden = false; $('#chargement').classList.add('fini'); document.body.classList.remove('charge');
  throw e;
}
let DPR = Math.min(devicePixelRatio, mobile ? 1.5 : 2);
renderer.setPixelRatio(DPR); renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xffffff, .0052);
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, .05, 2400);

// ---------- chargement ----------
const mgr = new THREE.LoadingManager();
let vise = 0, affiche = 0;
mgr.onProgress = (_, a, b) => { vise = a / b; };
const tl = new THREE.TextureLoader(mgr);
const S = mobile ? '_m' : '';
function tx(nom, srgb = false, rep = false, flip = false) {
  const t = tl.load('assets/tex/' + nom); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.flipY = flip; t.anisotropy = mobile ? 4 : 8;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const bruit = tx('bruit.png', false, true); bruit.generateMipmaps = true;
const sel = tx('sel.png', false, true);
const feuilles = tx('feuilles.png', true, false); feuilles.generateMipmaps = true;
function pbr(nom, ext = {}, rep = true) {
  const o = tx(nom + '_o.jpg', false, rep);
  return new THREE.MeshStandardMaterial({ map: tx(nom + '_c.jpg', true, rep), normalMap: tx(nom + '_n.jpg', false, rep), roughnessMap: o, aoMap: o, roughness: 1, metalness: 0, vertexColors: true, ...ext });
}
function cuit(nom, ext) {
  const o = tx(`${nom}_o${S}.jpg`);
  return new THREE.MeshPhysicalMaterial({ map: tx(`${nom}_c${S}.jpg`, true), normalMap: tx(`${nom}_n${S}.jpg`), roughnessMap: o, aoMap: o, aoMapIntensity: 1, roughness: 1, metalness: 0, ...ext });
}

const oeil = textureOeil(), paupiere = texturePaupiere();
// Meme canvas partage ; le relief se lit en donnees lineaires, la couleur en sRGB.
const reliefPaupiere = paupiere ? paupiere.clone() : null;
if (reliefPaupiere) reliefPaupiere.colorSpace = THREE.NoColorSpace;
const MATS = {
  peau: cuit('peau', { color: new THREE.Color(1.55, 1.55, 1.5), clearcoat: .14, clearcoatRoughness: .5, sheen: .5, sheenRoughness: .6, sheenColor: new THREE.Color('#8fa097'), normalScale: new THREE.Vector2(1.7, 1.7) }),
  carapace: cuit('carapace', { clearcoat: .34, clearcoatRoughness: .36, normalScale: new THREE.Vector2(1.15, 1.15) }),
  oeil: new THREE.MeshPhysicalMaterial({ map: oeil, color: oeil ? '#ffffff' : '#140f0b', roughness: .25, clearcoat: 1, clearcoatRoughness: .08, ior: 1.45, envMapIntensity: .9 }),
  paupiere: new THREE.MeshPhysicalMaterial({ map: paupiere, bumpMap: reliefPaupiere, bumpScale: .018, color: paupiere ? '#ffffff' : '#57534a', roughness: .65, clearcoat: .08, clearcoatRoughness: .5, side: THREE.DoubleSide }),
  tuile: pbr('tuile'), chaume: pbr('chaume'), bois: pbr('bois'), platre: pbr('platre', { color: new THREE.Color(1.12, 1.1, 1.08) }), pierre: pbr('pierre', { color: new THREE.Color(1.3, 1.3, 1.3) }),
  rochemousse: pbr('rochemousse', { vertexColors: true }),
  rocher: pbr('rocher', { vertexColors: false, normalScale: new THREE.Vector2(1.3, 1.3) }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .85, roughness: .38 }),
  plante: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .75 }),
  tissu: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82 }),
  corde: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }),
  lianes: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, side: THREE.DoubleSide }),
  ailes: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78, side: THREE.DoubleSide }),
  verre: new THREE.MeshPhysicalMaterial({ color: '#dff4ee', roughness: .06, metalness: 0, transparent: true, opacity: .2, clearcoat: 1, envMapIntensity: 1.8, side: THREE.DoubleSide, depthWrite: false }),
  lampes: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, emissive: new THREE.Color('#ff8b4a'), emissiveIntensity: 0, emissiveMap: null }),
  titre: new THREE.MeshPhysicalMaterial({ color: '#fff7ec', roughness: .5, clearcoat: .22, clearcoatRoughness: .3, emissive: new THREE.Color('#ffe9dc'), emissiveIntensity: .24 }),
};
// les lianes ondulent
MATS.lianes.onBeforeCompile = (s) => {
  s.uniforms.uTemps = temps;
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTemps;').replace('#include <begin_vertex>', `#include <begin_vertex>
    float bas=clamp((3.2-position.y)/1.8,0.,1.); transformed.x+=sin(uTemps*.7+position.z*5.+position.x*3.)*.018*bas; transformed.z+=cos(uTemps*.6+position.x*4.)*.018*bas;`);
};

// Un seul ajout partage, sans passe de rendu ni lecture de texture supplementaire.
const rimUniforms = { uRimCouleur: { value: new THREE.Color() } };
const RIM_FRAGMENT = /* glsl */`
  #if NUM_DIR_LIGHTS > 0
    vec3 rimV = normalize(vViewPosition);
    // Three fournit deja la direction du soleil en espace vue, y compris dans le miroir.
    vec3 rimL = directionalLights[0].direction;
    float rimFresnel = pow(1.0 - saturate(dot(normal, rimV)), 3.0);
    float rimDos = 0.3 + 0.7 * saturate(dot(rimL, -rimV));
    float rimCote = saturate(dot(normal, rimL) * 0.6 + 0.4);
    float rimAO = 1.0;
    #ifdef USE_AOMAP
      rimAO = ambientOcclusion;
    #endif
    outgoingLight += uRimCouleur * mix(vec3(1.0), diffuseColor.rgb, 0.5)
      * rimFresnel * rimDos * rimCote * rimAO;
  #endif
`;
function ajouterRim(s) {
  s.uniforms.uRimCouleur = rimUniforms.uRimCouleur;
  s.fragmentShader = s.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uRimCouleur;')
    .replace('#include <opaque_fragment>', RIM_FRAGMENT + '\n#include <opaque_fragment>');
}
for (const nom of ['peau', 'carapace', 'tuile', 'chaume', 'bois', 'platre', 'pierre', 'rochemousse']) {
  const m = MATS[nom], avant = m.onBeforeCompile, cleAvant = m.customProgramCacheKey();
  m.onBeforeCompile = function(s, r) { avant.call(this, s, r); ajouterRim(s); };
  m.customProgramCacheKey = () => cleAvant + '|lente-rim-v1';
}
const gl = new GLTFLoader(mgr);
const charge = (u) => new Promise((res, rej) => gl.load(u, res, undefined, rej));

// ---------- etat de la journee ----------
const E = nouvelEtat();
const ciel = creerCiel(bruit); scene.add(ciel);
const etoiles = creerEtoiles(mobile ? 1400 : 3200); scene.add(etoiles);

const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1); scene.add(hemi);
const soleil = new THREE.DirectionalLight(0xffffff, 3);
soleil.castShadow = true; soleil.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
Object.assign(soleil.shadow.camera, { left: -7.5, right: 7.5, top: 7.5, bottom: -7.5, near: 1, far: 60 }); soleil.shadow.bias = -.0006; soleil.shadow.normalBias = .018;
scene.add(soleil, soleil.target); soleil.target.position.set(.8, 2, 0);
const lampeAtelier = new THREE.PointLight('#ffb27a', 0, 2.6, 1.6);

// environnement : une douzaine d'etats de la journee precalcules
const pmrem = new THREE.PMREMGenerator(renderer);
const envs = [];
function precalculerEnvs() {
  const sc = new THREE.Scene(); const c2 = creerCiel(bruit); sc.add(c2);
  const sol = new THREE.Mesh(new THREE.CircleGeometry(800, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial()); sc.add(sol); sol.position.y = -.5;
  const NE = mobile ? 10 : 18;
  for (let i = 0; i < NE; i++) {
    const e = etatDuTemps(i / (NE - 1), nouvelEtat()); appliquerCiel(c2, e); sol.material.color.copy(e.eau).multiplyScalar(.6);
    envs.push(pmrem.fromScene(sc, 0, .1, 1000).texture);
  }
}

// ---------- montage ----------
let bete, miroir, rides, herbe, feuillage, fumees, halos, lucioles, oiseaux, habitants, moulinAiles, axeMoulin = new THREE.Vector3(1, 0, 0), faisceau, faisceauPiv;
let titreLa, titreLente, rochers, vitres = [], matCascade, matRuisseau, META, cascadePied, lampeBaseI = 0;
const groupeTitre = new THREE.Group(); scene.add(groupeTitre);
const son = new Son();

async function monter() {
  const [modele, titre, herbeBuf, monde, chemin] = await Promise.all([
    charge('assets/lente.glb'), charge('assets/titre.glb'),
    fetch('assets/herbe.bin').then((r) => r.arrayBuffer()), fetch('assets/monde.json').then((r) => r.json()), fetch('assets/chemin.json').then((r) => r.json()),
  ]);
  META = monde; const sce = modele.scene;
  const parNom = {}; sce.traverse((o) => { if (o.isMesh) { o.name = o.name.replace(/\.?00\d$/, ''); parNom[o.name] = o; } });
  bete = new Tortue(sce, MATS, scene);
  const dos = bete.dos;
  const attribuer = (o, m, cast = true, recv = true) => { o.material = m; o.castShadow = cast; o.receiveShadow = recv; dos.add(o); return o; };
  
  attribuer(parNom.carapace, MATS.carapace);
  for (const n of ['tuile', 'chaume', 'bois', 'platre', 'pierre', 'metal', 'plante', 'tissu', 'corde', 'lianes', 'rochemousse']) if (parNom[n]) { attribuer(parNom[n], MATS[n]); }
  const hubT = b2t(META.mobile.moulin.hub); parNom.ailes.geometry.translate(hubT.x, hubT.y, hubT.z);
  moulinAiles = attribuer(parNom.ailes, MATS.ailes, true, false); axeMoulin = b2t(META.mobile.moulin.axe).normalize();
  attribuer(parNom.verre, MATS.verre, false, false);
  const lampes = attribuer(parNom.lampes, MATS.lampes, false, false);
  for (const n in parNom) if (n.startsWith('vitre_')) {
    const id = n.slice(6); const m = new THREE.MeshStandardMaterial({ color: '#23374a', roughness: .12, metalness: .1, emissive: new THREE.Color('#ff8a45'), emissiveIntensity: 0, envMapIntensity: 1.3 });
    const seuil = id === 'phare' ? .1 : .34 + Math.random() * .36;
    attribuer(parNom[n], m, false, false); vitres.push({ id, m, seuil, force: null, i: 0 });
  }
  // eau courante
  matRuisseau = matiereEau(bruit, false); matCascade = matiereEau(bruit, true);
  attribuer(parNom.ruisseau, matRuisseau, false, false); attribuer(parNom.cascade, matCascade, false, false);
  cascadePied = b2t(META.mobile.cascade_pied);
  dos.add(lampeAtelier); lampeAtelier.position.copy(b2t(META.mobile.lampe_atelier)).add(new THREE.Vector3(0, .06, .04));

  // village vivant
  const pxH = herbeBuf.byteLength / 24;
  const zonesSans = META.maisons.map((m) => [m.centre[0], m.centre[1], m.id === 'atelier' ? .38 : .17]); zonesSans.push([-.36, .12, .2], [1.42, -.22, .18], [-.72, -.2, .25]);
  herbe = creerHerbe(herbeBuf, mobile ? 18000 : Math.min(pxH, 60000), zonesSans); dos.add(herbe);
  feuillage = creerFeuillage(META.arbres, feuilles, mobile ? .5 : 1); dos.add(feuillage);
  const chem = META.maisons.map((m) => m.fumee);
  fumees = creerFumees(chem, mobile ? 8 : 14); dos.add(fumees);
  const srcH = [...META.lanternes.map((p) => ({ p, t: .22 })), ...META.maisons.map((m) => ({ p: m.lampe, t: .5 })), { p: META.mobile.phare, t: 1.1, c: '#ffd9a8' }];
  halos = creerHalos(srcH); dos.add(halos);
  lucioles = creerLucioles(mobile ? 50 : 130, 3.1, 2.2, 1.8); dos.add(lucioles);
  habitants = new Habitants(chemin.chemin, mobile ? 8 : 16, new THREE.MeshStandardMaterial({ roughness: .75 }), MATS.lampes.clone()); dos.add(habitants.groupe); habitants.l.material = new THREE.MeshStandardMaterial({ color: '#333', emissive: '#ffa45e', emissiveIntensity: 0 });
  oiseaux = new Oiseaux(mobile ? 14 : 28, new THREE.MeshStandardMaterial({ color: '#d9d4c8', roughness: .7, side: THREE.DoubleSide })); scene.add(oiseaux.im);

  // faisceau du phare : deux cones qui balaient le sel
  const coneG = new THREE.ConeGeometry(2.4, 60, 32, 1, true); coneG.translate(0, -30, 0); coneG.rotateZ(-Math.PI / 2 + .06);
  const coneM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uF: { value: 0 } },
    vertexShader: `varying float vL; varying vec3 vN; varying vec3 vV; void main(){ vL=length(position); vN=normalMatrix*normal; vec4 mv=modelViewMatrix*vec4(position,1.); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `precision highp float; varying float vL; varying vec3 vN; varying vec3 vV; uniform float uF; void main(){ float f=pow(abs(dot(normalize(vN),normalize(vV))),2.2); float a=f*exp(-vL*.075)*uF; gl_FragColor=vec4(vec3(1.,.86,.66)*a,a); }` });
  faisceauPiv = new THREE.Group(); faisceauPiv.position.copy(b2t(META.mobile.phare)); dos.add(faisceauPiv);
  faisceau = coneM; const c1 = new THREE.Mesh(coneG, coneM), c2 = new THREE.Mesh(coneG, coneM); c2.rotation.y = Math.PI; c1.frustumCulled = c2.frustumCulled = false; faisceauPiv.add(c1, c2);

  // grands rochers qui passent, tres loin, reflechis
  rochers = new THREE.InstancedMesh(parNom.rocher.geometry, MATS.rocher, 11); rochers.frustumCulled = false; rochers.castShadow = false; scene.add(rochers);
  // places choisies : assez loin pour ne jamais couper la bete, varies pour faire une ligne d'horizon
  rochers.userData.r = [[-205, -120, 26, 1.2, .8], [-150, -82, 13, 4.1, .9], [-98, -150, 30, .4, 1.05], [-52, -96, 12, 2.6, .7], [-14, -190, 34, 5.2, .9], [38, -88, 11, 3.3, 1.1], [86, -135, 24, 1.9, .75], [132, -76, 14, .9, 1], [176, -170, 36, 4.6, .85], [214, -104, 18, 2.2, .95], [-240, -165, 28, 3.7, 1.15]].map(([x, z, s, ry, sy]) => ({ x, z, s, ry, sy }));

  // titre taille dans le sel
  titre.scene.traverse((o) => { if (o.isMesh) { o.material = MATS.titre; o.castShadow = false; } });
  titreLa = titre.scene.getObjectByName('titre_la'); titreLente = titre.scene.getObjectByName('titre_lente');
  groupeTitre.add(titreLa, titreLente);

  // miroir
  const rw = Math.round(innerWidth * Math.min(devicePixelRatio, mobile ? 1 : 1.5)), rh = Math.round(innerHeight * Math.min(devicePixelRatio, mobile ? 1 : 1.5));
  miroir = creerMiroir({ w: rw, h: rh, bruit, sel, msaa: mobile ? 0 : 4 }); scene.add(miroir);
  rides = new Rides(miroir.material.uniforms.uR);
  const obr = miroir.onBeforeRender;
  // dans le reflet, on retire ce qui ne se verrait pas : grosse economie
  miroir.onBeforeRender = (r, s, cam) => { herbe.visible = false; lucioles.visible = false; fumees.visible = false; habitants.groupe.visible = false; obr.call(miroir, r, s, cam); herbe.visible = true; lucioles.visible = true; fumees.visible = true; habitants.groupe.visible = true; };

  bete.onPas = (x, z) => { rides.ajoute(x, z, .72); son.pas(); };
  miroir.frustumCulled = false;
  precalculerEnvs();
  poserTitre(); poserInteractions();
  renderer.compile(scene, camera);
}

function poserTitre() {
  const portrait = innerWidth / innerHeight < .85;
  if (portrait) {
    // le mot le plus long tient dans 84 % de la largeur visible a cette profondeur
    const large = 2 * 65 * Math.tan(15 * Math.PI / 180) * (innerWidth / innerHeight), s = large * .84 / 1.97;
    titreLa.scale.setScalar(s); titreLente.scale.setScalar(s);
    titreLa.position.set(-large * .17, 15.2 + s * .62, 0); titreLente.position.set(0, 15.2, 0);
    groupeTitre.position.set(.9, 0, -26);
  } else {
    // la bete marche dans l'intervalle entre les deux mots : on deduit la taille de la largeur d'ecran
    const a = innerWidth / innerHeight, z = 20 * Math.max(1, 1.78 / a), k = (z + 34) / z, cx = 1.2;
    const dv = (z + 34) * Math.tan(15 * Math.PI / 180) * a;
    const droiteLa = (-4.1 - cx) * k + cx, gaucheLa = cx - dv * .95, gaucheLe = (3.1 - cx) * k + cx, droiteLe = cx + dv * .95;
    const s = Math.min((droiteLa - gaucheLa) / .86, (droiteLe - gaucheLe) / 1.97);
    titreLa.scale.setScalar(s); titreLente.scale.setScalar(s);
    titreLa.position.set(droiteLa - s * .43, 1.5, 0); titreLente.position.set(gaucheLe + s * .985, 1.5, 0);
    groupeTitre.position.set(0, 0, -34);
  }
}

// ---------- post-traitement ----------
const cibleHDR = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: mobile ? 0 : 4 });
const composer = new EffectComposer(renderer, cibleHDR);
composer.setPixelRatio(DPR); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .3, .62, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finition = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uG: { value: mobile ? .028 : .038 }, uContraste: { value: 0 } },
  vertexShader: 'varying vec2 vU; void main(){ vU=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader: `precision highp float; varying vec2 vU; uniform sampler2D tDiffuse; uniform float uT,uG,uContraste;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uT)*43758.5453); }
    void main(){
      vec3 c = clamp(texture2D(tDiffuse,vU).rgb, 0., 1.);
      c = mix(c, c*c*(3.-2.*c), uContraste);
      vec2 q=vU-.5; float v=smoothstep(.95,.32,length(q*vec2(1.,.92))); c*=mix(.8,1.,v);
      c+=(h(vU*vec2(1920.,1080.))-.5)*uG; gl_FragColor=vec4(c,1.);
    }`,
});
composer.addPass(finition);

// ---------- camera : cinq stations, un chemin continu ----------
const portrait = () => innerWidth / innerHeight < .85;
const courbes = {};
let STATIONS;
function poserCamera() {
  const at = b2t(META.mobile.atelier);
  const lar = portrait();
  const oe = b2t([OEIL[0], -OEIL[1], OEIL[2]]);
  STATIONS = lar ? [
    { pos: [1.0, .5, 39], tgt: [1.0, 6.2, 0], fov: 30 },
    { pos: [3.0, 10.4, 12], tgt: [.2, 3.6, -.1], fov: 30 },
    { pos: [at.x + .5, at.y + 1.25, at.z + 3.7], tgt: [at.x + .1, at.y + .02, at.z], fov: 28 },
    { pos: [oe.x + 1.5, oe.y + .34, oe.z + 8.2], tgt: [oe.x - .35, oe.y - .42, oe.z - .3], fov: 25 },
    { pos: [-6, .42, 40], tgt: [.5, 3.6, 0], fov: 32 },
  ] : [
    { pos: [1.2, .46, 20 * Math.max(1, 1.78 / (innerWidth / innerHeight))], tgt: [1.2, 1.82, 0], fov: 30 },
    { pos: [5.2, 9.0, 9.8], tgt: [.35, 2.9, -.2], fov: 30 },
    { pos: [at.x + 1.0, at.y + .86, at.z + 2.0], tgt: [at.x + .26, at.y + .05, at.z], fov: 28 },
    { pos: [oe.x + 1.6, oe.y + .34, oe.z + 5.6], tgt: [oe.x - .95, oe.y - .28, oe.z - .3], fov: 25 },
    { pos: [-5, .42, 24.5], tgt: [.2, 2.1, 0], fov: 33 },
  ];
  const v3 = (a) => new THREE.Vector3(...a);
  courbes.pos = new THREE.CatmullRomCurve3(STATIONS.map((s) => v3(s.pos)), false, 'centripetal');
  courbes.tgt = new THREE.CatmullRomCurve3(STATIONS.map((s) => v3(s.tgt)), false, 'centripetal');
}
// plateau autour de chaque station : le mouvement se pose avant de repartir
function ralenti(p) {
  const n = STATIONS.length - 1, x = clamp(p, 0, 1) * n, i = Math.min(Math.floor(x), n - 1), f = x - i;
  const e = f < .5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
  return (i + (f * .25 + e * .75)) / n;
}
const TEMPS_P = [[0, 0], [.25, .27], [.5, .5], [.75, .74], [1, 1]];
function tempsDePage(p) {
  for (let i = 0; i < TEMPS_P.length - 1; i++) { const [a, ta] = TEMPS_P[i], [b, tb] = TEMPS_P[i + 1]; if (p <= b) { return ta + (tb - ta) * ((p - a) / (b - a)); } }
  return 1;
}

// ---------- defilement ----------
const lenis = !reduit ? new window.Lenis({ duration: 1.2, smoothWheel: true, syncTouch: false }) : null;
const panneaux = [...document.querySelectorAll('.chap')].map((c) => ({ el: c.querySelector('.txt'), c }));
const btns = [...document.querySelectorAll('#moments button')];
btns.forEach((b) => b.addEventListener('click', () => allerA(+b.dataset.p)));
$('#revenir').addEventListener('click', () => allerA(0));
function allerA(p) {
  const y = hauteurPour(p);
  if (lenis) lenis.scrollTo(y, { duration: 2.6, easing: (t) => 1 - Math.pow(1 - t, 3) }); else scrollTo(0, y);
}
const centres = () => panneaux.map((x) => x.c.offsetTop + Math.max(0, x.c.offsetHeight - innerHeight) * .5);
function hauteurPour(p) {
  const i = Math.round(p * 4); const cs = centres(); if (i === 0) return 0; if (i === 4) return document.documentElement.scrollHeight - innerHeight; return cs[i];
}
function progression() {
  const hauteur = document.documentElement.scrollHeight - innerHeight;
  if (hauteur <= 0) return 0;
  const y = scrollY, cs = centres(); cs[0] = 0; cs[4] = hauteur;
  for (let i = 0; i < 4; i++) if (y <= cs[i + 1]) {
    const ecart = cs[i + 1] - cs[i];
    return clamp((i + (ecart > 0 ? (y - cs[i]) / ecart : 0)) / 4, 0, 1);
  }
  return 1;
}

// ---------- geste ----------
const souris = new THREE.Vector2(innerWidth * .5, innerHeight * .5), lisse = new THREE.Vector2(0, 0);
const ray = new THREE.Raycaster(), plan = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt = new THREE.Vector3(), ndc = new THREE.Vector2();
let aziDrag = 0, eleDrag = 0, aziC = 0, eleC = 0, tire = null, aBouge = false, derniereRide = 0, repos = 0;
const curseur = $('#curseur'), legende = $('#legende');
let cibles = [], tLegende = 0;
const NOMS = ['Maison d\'Hector, qui répare les cloches', 'Chez Maud, on y sèche les algues du sel', 'Maison bleue des deux sœurs Lune', 'Ici dort l\'homme qui compte les pas', 'La maison que personne n\'ose repeindre', 'Maison du dernier arrivé, il y a quarante ans', 'Chez Ilse, qui entend venir la pluie', 'Le four à pain, allumé depuis trois générations', 'Maison de Tomé, gardien des ruches', 'Chez Ana, on y coud les ailes du moulin', 'Maison haute, la seule d\'où l\'on voit la queue', 'Chez Paulin, il pêche des nuages dans le reflet', 'La petite maison du pont'];
function poserInteractions() {
  cibles = [];
  META.maisons.forEach((m, i) => { const est = m.id === 'atelier'; cibles.push({ type: 'maison', id: m.id, c: b2t(m.centre), r: est ? .36 : Math.max(.2, m.rayon), txt: est ? 'L\'atelier d\'Odile. Sa lampe ne s\'éteint presque jamais.' : NOMS[i % NOMS.length] }); });
  cibles.push({ type: 'phare', c: b2t(META.mobile.phare).add(new THREE.Vector3(0, -.45, 0)), r: .38, txt: 'Le phare. On le suit depuis l\'autre bord du sel.' });
  cibles.push({ type: 'moulin', c: b2t(META.mobile.moulin.hub), r: .42, txt: 'Le moulin tourne avec le pas. Touche encore, il accélère.' });
  cibles.push({ type: 'barque', c: b2t(META.mobile.barque), r: .34, txt: 'La barque attend une pluie. Elle attend depuis longtemps.' });
  cibles.push({ type: 'serre', c: new THREE.Vector3(-.72, 3.1, .2), r: .26, txt: 'La serre. Tout ce qui pousse ici a été apporté à la main.' });
}
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Vector3(), _hit = new THREE.Vector3();
function raySphere(c, r) { _c.subVectors(c, _o); const t = _c.dot(_d); if (t < 0) return Infinity; const d2 = _c.lengthSq() - t * t; if (d2 > r * r) return Infinity; return t - Math.sqrt(r * r - d2); }
function raySurBete() { // ellipsoide de la carapace
  const c = new THREE.Vector3(0, 1.1, 0), R = new THREE.Vector3(2.8, 2.35, 2.3);
  const o = _o.clone().sub(c).divide(R), d = _d.clone().divide(R); const a = d.dot(d), b = 2 * o.dot(d), cc = o.dot(o) - 1, D = b * b - 4 * a * cc; if (D < 0) return Infinity; const t = (-b - Math.sqrt(D)) / (2 * a); const y = _o.y + _d.y * t; return (t > 0 && y > .9) ? t : Infinity;
}
function viser(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); _o.copy(ray.ray.origin); _d.copy(ray.ray.direction);
  let best = null, tb = Infinity;
  const tTete = raySphere(b2t([4.3, 0, 2.86]), .85); const tCorps = raySurBete();
  // les maisons se visent bien mieux quand elles sont proches
  const prox = _o.length() < 16 ? 1 : .0;
  if (prox) for (const c of cibles) { const t = raySphere(c.c, c.r); if (t < tb) { tb = t; best = c; } }
  if (tTete < tb && tTete < tCorps) { tb = tTete; best = { type: 'tete' }; }
  else if (!best && tCorps < Infinity) { tb = tCorps; best = { type: 'dos' }; }
  if (best && best.type === 'maison' && tCorps < tb - 1.2) { best = { type: 'dos' }; tb = tCorps; }
  return { best, t: tb };
}
canvas.addEventListener('pointerdown', (e) => { son.reveille(); tire = { x: e.clientX, y: e.clientY, a: aziC, el: eleC, id: e.pointerId }; aBouge = false; });
addEventListener('pointermove', (e) => {
  souris.set(e.clientX, e.clientY); repos = 0;
  curseur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
  if (tire && e.pointerId === tire.id) {
    const dx = e.clientX - tire.x, dy = e.clientY - tire.y;
    if (Math.hypot(dx, dy) > 8) { if (!aBouge) { try { canvas.setPointerCapture(e.pointerId); } catch (_) {} } aBouge = true; }
    if (aBouge) { aziC = clamp(tire.a - dx * .0042, -1.5, 1.5); eleC = tactile ? tire.el : clamp(tire.el + dy * .0024, -.28, .55); }
  }
  if (!tactile && !tire) {
    const { best } = viser(e.clientX, e.clientY);
    curseur.classList.toggle('sur', !!best && best.type !== 'dos');
    // effleurer l'eau laisse un sillage
    if (rides && !best && performance.now() - derniereRide > 240) { ray.ray.intersectPlane(plan, pt); if (pt && pt.length() < 90) { rides.ajoute(pt.x, pt.z, .34); derniereRide = performance.now(); } }
  }
}, { passive: true });
addEventListener('pointerup', (e) => {
  if (tire && e.pointerId === tire.id && !aBouge) toucher(e.clientX, e.clientY);
  tire = null;
});
addEventListener('pointercancel', () => { tire = null; });
canvas.addEventListener('dblclick', () => { aziC = 0; eleC = 0; });
function dire(t, s = 4.4) { legende.textContent = t; legende.classList.add('vu'); tLegende = s; }
const forceMoulin = { v: 0 };
function toucher(x, y) {
  if (!rides || !bete || !oiseaux) return;
  const { best } = viser(x, y);
  if (!best) { ray.ray.intersectPlane(plan, pt); if (pt) { rides.ajoute(pt.x, pt.z, 1.25); son.goutte(); souris.set(x, y); } return; }
  son.touche();
  if (best.type === 'maison') { const v = vitres.find((w) => String(w.id) === String(best.id)); if (v) { v.force = !(v.force ?? (v.i > .5)); } dire(best.txt); }
  else if (best.type === 'tete') { bete.caresse(); rides.ajoute(3.2, 1.6, 1.4); son.voix(); dire('Elle aime ça. Ça ne se voit qu\'à peine.'); }
  else if (best.type === 'dos') { oiseaux.envol(); son.oiseaux(); dire('Les oiseaux reviennent toujours au même arbre.', 3); }
  else if (best.type === 'moulin') { forceMoulin.v = Math.min(forceMoulin.v + 1.6, 5); dire(best.txt); }
  else if (best.type === 'phare') { flash = 1; dire(best.txt); }
  else dire(best.txt);
}
let flash = 0;

// ---------- son ----------
const bSon = $('#son'); bSon.addEventListener('click', () => { const on = son.bascule(); bSon.setAttribute('aria-pressed', on); $('#son-txt').textContent = on ? 'Son activé' : 'Son'; });
document.addEventListener('visibilitychange', () => { son.pause(document.hidden); });

// ---------- boucle ----------
const horloge = new THREE.Clock();
const PALIERS = [
  { dpr: 2, msaa: 4, msaaR: 4, reflet: .75, bloom: true, ombres: 2, herbe: 1, feuilles: 1 },
  { dpr: 1.5, msaa: 4, msaaR: 0, reflet: .6, bloom: true, ombres: 3, herbe: 1, feuilles: 1 },
  { dpr: 1.25, msaa: 0, msaaR: 0, reflet: .5, bloom: true, ombres: 4, herbe: .7, feuilles: .8 },
  { dpr: 1, msaa: 0, msaaR: 0, reflet: .4, bloom: false, ombres: 8, herbe: .45, feuilles: .65 },
  { dpr: .8, msaa: 0, msaaR: 0, reflet: .32, bloom: false, ombres: 16, herbe: .25, feuilles: .5 },
];
let basses = 0, tBon = 0, remontees = 0, palierMin = 0, palierQ = 0, majOmbres = 2, images2 = 0, herbeMax = 0, feuillageMax = 0;
let P = params.has('p') ? +params.get('p') : 0, Pl = P, Tl = tempsDePage(P), intro = reduit ? 1 : 0, cumul = 0, images = 0, tMes = 0, nvQual = 0, moyenne = 16, defile = 0, ctime = 0;
const figer = params.has('palier');
let camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), aHeure = '';
const qt = new THREE.Vector3();
let regardDecouple = new THREE.Vector3(9, 3.2, 8), iniCam = false;
let moulinAng = 0;

function maj(dt) {
  ctime += dt; temps.value = ctime;
  P = params.has('p') ? +params.get('p') : progression();
  if (!Number.isFinite(P)) P = 0;
  Pl = damp(Pl, P, reduit ? 40 : 3.2, dt);
  if (!Number.isFinite(Pl)) Pl = 0;
  const T = tempsDePage(Pl);
  const et = etatDuTemps(T, E);
  rimUniforms.uRimCouleur.value.copy(et.solC).multiplyScalar(et.rim * 1.6);
  appliquerCiel(ciel, et); ciel.material.uniforms.uTemps.value = ctime + 120;
  etoiles.material.uniforms.uNuit.value = et.nuit; etoiles.material.uniforms.uTemps.value = ctime;
  scene.fog.color.copy(et.hor); scene.fog.density = .0052 + et.nuit * .001;
  hemi.color.copy(et.hemiH); hemi.groundColor.copy(et.hemiB); hemi.intensity = et.hemiI;
  soleil.color.copy(et.solC); soleil.intensity = et.solI; soleil.position.copy(et.sol).multiplyScalar(30).add(soleil.target.position);
  scene.environment = envs[Math.round(T * (envs.length - 1))]; scene.environmentIntensity = et.env;
  renderer.toneMappingExposure = et.expo; bloom.strength = Math.min(.4, et.bloom);
  const u = miroir.material.uniforms; u.uTemps.value = ctime; defile += VITESSE * dt; u.uDefile.value = defile; u.uHor.value.copy(et.hor); u.uEau.value.copy(et.eau); u.uNuit.value = et.nuit; u.uSol.value.copy(et.sol); u.uSolC.value.copy(et.solC);
  rides.maj(dt, VITESSE);
  // pied de cascade : une ride reguliere
  if (Math.floor(ctime * .9) !== Math.floor((ctime - dt) * .9)) rides.ajoute(cascadePied.x, cascadePied.z, .46);

  // lumieres du village
  const nuit = et.nuit; const allume = clamp((nuit - .02) / .5, 0, 1);
  for (const v of vitres) { const auto = nuit > v.seuil * .9; const cib = v.force ?? auto ? 1 : 0; v.i = damp(v.i, cib, 2.2, dt); v.m.emissiveIntensity = v.i * (2.6 + Math.sin(ctime * 2 + v.seuil * 90) * .2); }
  MATS.lampes.emissiveIntensity = allume * 5 + .1; lampeAtelier.intensity = (.9 + allume * 1.9);
  habitants.l.material.emissiveIntensity = allume * 5;
  halos.material.uniforms.uNuit.value = allume; lucioles.material.uniforms.uNuit.value = clamp((nuit - .4) / .5, 0, 1);
  const px = renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(camera.fov * Math.PI / 360));
  fumees.material.uniforms.uPx.value = px; halos.material.uniforms.uPx.value = px; lucioles.material.uniforms.uPx.value = px; etoiles.material.uniforms.uPx.value = DPR;
  fumees.material.uniforms.uCoul.value.copy(et.nuageL).lerp(et.hemiH, .4);
  matCascade.uniforms.uAmb.value.copy(et.hemiH).lerp(et.solC, .4); matCascade.uniforms.uHaut.value.copy(et.zen).lerp(et.hor, .5);
  matRuisseau.uniforms.uAmb.value.copy(matCascade.uniforms.uAmb.value); matRuisseau.uniforms.uHaut.value.copy(matCascade.uniforms.uHaut.value);
  // phare : balaie dans la nuit ; un toucher le fait flamber
  flash = Math.max(0, flash - dt * .5);
  faisceau.uniforms.uF.value = clamp((nuit - .3) / .5, 0, 1) * .2 + flash * .6; faisceauPiv.visible = faisceau.uniforms.uF.value > .004; faisceauPiv.rotation.y = ctime * .24;
  // moulin
  forceMoulin.v = Math.max(0, forceMoulin.v - dt * .32);
  moulinAng += dt * (.32 + forceMoulin.v); moulinAiles.quaternion.setFromAxisAngle(axeMoulin, moulinAng);
  oiseaux.maj(dt, ctime); oiseaux.im.visible = nuit < .85; habitants.maj(dt, ctime);

  // rochers
  const d = new THREE.Object3D();
  rochers.userData.r.forEach((r, i) => { r.x -= VITESSE * dt * .9; if (r.x < -230) r.x += 460; d.position.set(r.x, -.3, r.z); d.rotation.set(0, r.ry, 0); d.scale.set(r.s, r.s * r.sy, r.s); d.updateMatrix(); rochers.setMatrixAt(i, d.matrix); }); rochers.instanceMatrix.needsUpdate = true;

  // titre : il sort de l'eau a l'ouverture, s'y enfonce quand le temps passe
  intro = Math.min(1, intro + dt / 4.2); const ei = 1 - Math.pow(1 - intro, 4);
  const sortie = clamp(Pl / .18, 0, 1); const es = sortie * sortie * (3 - 2 * sortie);
  groupeTitre.position.y = (ei - 1) * 11 - es * 15; groupeTitre.visible = es < .999;
    document.body.classList.toggle('loin', Pl > .08);

  // camera
  const e_ = ralenti(Pl);
  courbes.pos.getPoint(e_, camPos); courbes.tgt.getPoint(e_, camTgt);
  const n = STATIONS.length - 1, x = e_ * n, i = Math.min(Math.floor(x), n - 1); const fov = STATIONS[i].fov + (STATIONS[i + 1].fov - STATIONS[i].fov) * (x - i);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // arrivee : on recule au tout debut
  camPos.z += (1 - ei) * (portrait() ? -9 : -7) ; camPos.y += (1 - ei) * 1.4;
  aziDrag = damp(aziDrag, aziC, 2.6, dt); eleDrag = damp(eleDrag, eleC, 2.6, dt);
  lisse.x = damp(lisse.x, (souris.x / innerWidth - .5) * 2 || 0, 2.2, dt); lisse.y = damp(lisse.y, (souris.y / innerHeight - .5) * 2 || 0, 2.2, dt);
  const off = qt.subVectors(camPos, camTgt); const r = off.length();
  let th = Math.atan2(off.x, off.z), ph = Math.asin(clamp(off.y / r, -1, 1));
  const prox = clamp(r / 22, .15, 1);
  th += aziDrag + (tactile ? 0 : lisse.x * .045) + Math.sin(ctime * .11) * .012;
  ph = clamp(ph + eleDrag - (tactile ? 0 : lisse.y * .018) + Math.sin(ctime * .17) * .003, -.6, 1.4);
  camera.position.set(camTgt.x + r * Math.cos(ph) * Math.sin(th), camTgt.y + r * Math.sin(ph), camTgt.z + r * Math.cos(ph) * Math.cos(th));
  if (camera.position.y < .22) camera.position.y = .22;
  camera.lookAt(camTgt);

  // regard de la tortue : le pointeur dans le monde, ou la camera pres du visage
  repos += dt;
  const pres = 1 - clamp(Math.abs(Pl - .75) / .14, 0, 1);
  if (!tactile || tire) {
    ndc.set(souris.x / innerWidth * 2 - 1, -(souris.y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    pt.copy(ray.ray.origin).addScaledVector(ray.ray.direction, camera.position.distanceTo(b2t(OEIL)) * .55);
    bete.regarder(pt.x, pt.y, pt.z);
  } else {
    const c = camera.position; bete.regarder(c.x + Math.sin(ctime * .3) * 1.2, c.y + Math.sin(ctime * .23) * .5, c.z);
  }
  bete.maj(dt, ctime);

  // textes
  panneaux.forEach((pp, k) => {
    const c = k / 4, l = .115; const tt = 1 - clamp((Math.abs(Pl - c) - l * .35) / (l * .5), 0, 1);
    const ee = tt * tt * (3 - 2 * tt); const ou = ee * (k === 0 ? ei : 1);
    pp.el.style.opacity = ou.toFixed(3); pp.el.style.transform = `translateY(${((1 - ee) * 18).toFixed(1)}px)`; pp.el.style.visibility = ou < .01 ? 'hidden' : 'visible';
  });
  const actif = Math.round(Pl * 4); btns.forEach((b, k) => { b.classList.toggle('actif', k === actif); if (k === actif) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  // horloge : de 5h48 a 23h40
  const minutes = Math.round(5 * 60 + 48 + T * (17 * 60 + 52)); const h_ = String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
  if (h_ !== aHeure) { aHeure = h_; $('#heure').textContent = h_; }
  if (tLegende > 0) { tLegende -= dt; if (tLegende <= 0) legende.classList.remove('vu'); }
  son.maj(T, nuit);
  finition.uniforms.uT.value = ctime % 10;
  finition.uniforms.uContraste.value = et.contraste;

  // ombres : la bete est lente, inutile de les recalculer a chaque image
  soleil.shadow.needsUpdate ||= (images % majOmbres) === 0;
  images++;
}

// Qualite adaptative, mesuree en temps reel : on sacrifie les pixels et les details, jamais la fluidite.
function palier(n) {
  palierQ = n;
  const q = PALIERS[Math.min(n, PALIERS.length - 1)];
  DPR = Math.min(devicePixelRatio, q.dpr); renderer.setPixelRatio(DPR); composer.setPixelRatio(DPR);
  bloom.enabled = q.bloom; majOmbres = q.ombres;
  soleil.shadow.radius = [4, 3, 2.5, 2, 1.5][Math.min(n, PALIERS.length - 1)];
  soleil.shadow.needsUpdate = true;
  const rt = miroir.getRenderTarget(); rt.samples = q.msaaR; rt.setSize(Math.round(innerWidth * DPR * q.reflet), Math.round((canvas.clientHeight || innerHeight) * DPR * q.reflet)); rt.dispose();
  for (const c of [composer.renderTarget1, composer.renderTarget2]) { if (c.samples !== q.msaa) { c.samples = q.msaa; c.dispose(); } }
  herbe.count = Math.round(herbeMax * q.herbe);
  feuillage.children[0].count = Math.round(feuillageMax * q.feuilles);
  window.__palier = n;
}
function surveiller(now) {
  if (figer) return;
  if (!tMes) { tMes = now + 5000; images2 = 0; return; } // on laisse passer les a-coups du demarrage
  if (now < tMes) return;
  images2++;
  const ecoule = now - tMes;
  if (ecoule > 1600 && !document.hidden) {
    const fps = images2 / (ecoule / 1000); window.__fps = fps; tMes = now; images2 = 0;
    // un a-coup passager ne doit pas degrader pour toujours : apres 12 s tres fluides, on remonte d'un cran
    // deux mesures basses de suite avant de baisser : un seul a-coup de chargement ne compte pas
    if (fps < 45 && palierQ < PALIERS.length - 1) { tBon = 0; if (++basses >= 2) { basses = 0; palier(Math.min(PALIERS.length - 1, palierQ + (fps < 24 ? 2 : 1))); } }
    else if (fps > 56 && palierQ > palierMin && remontees < 3) { tBon += ecoule; if (tBon > 12000) { remontees++; tBon = 0; palier(palierQ - 1); } }
    else tBon = 0;
    if (fps >= 45) basses = 0;
  }
}

function boucle(now) {
  requestAnimationFrame(boucle);
  surveiller(now);
  if (lenis) lenis.raf(now);
  const dt = Math.min(horloge.getDelta(), .05);
  maj(dt);
  composer.render(dt);
}

let largeurVue = 0;
function redim() {
  // sur telephone, la barre du navigateur qui se replie ne doit rien recalculer : la toile garde sa grande hauteur
  if (tactile && largeurVue === innerWidth && herbeMax) return;
  largeurVue = innerWidth;
  const H = canvas.clientHeight || innerHeight;
  camera.aspect = innerWidth / H; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, H, false); composer.setSize(innerWidth, H);
  if (META && titreLa) { poserCamera(); poserTitre(); if (herbeMax) palier(palierQ); }
}
addEventListener('resize', redim);

// ---------- depart ----------
const pct = $('#pct');
const compteur = setInterval(() => { affiche += (vise * 100 - affiche) * .16; pct.textContent = Math.round(affiche); }, 50);
monter().then(async () => {
  try { await document.fonts.ready; } catch (_) {}
  poserCamera(); redim();
  clearInterval(compteur); pct.textContent = '100';
  renderer.compile(scene, camera);
  soleil.shadow.autoUpdate = false;
  herbeMax = herbe.count; feuillageMax = feuillage.children[0].count;
  // depart prudent : telephone et carte integree commencent bas, puis la mesure ajuste
  const g = renderer.getContext(), ext = g.getExtension('WEBGL_debug_renderer_info'), carte = ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  const forcer = params.get('palier');
  palier(forcer !== null ? +forcer : mobile ? 2 : /Intel|UHD|Iris|Software|SwiftShader/i.test(carte) ? 3 : 0);
  window.__carte = carte;
  maj(.016); composer.render(.016);
  scrollTo(0, 0);
  horloge.getDelta();
  requestAnimationFrame(boucle);
  document.body.classList.remove('charge'); document.body.classList.add('pret'); $('#chargement').classList.add('fini');
  if (params.has('p')) { $('#chargement').style.display = 'none'; intro = 1; }
  window.__lente = { P: () => Pl, scene, camera, renderer, E, bete };
}).catch((e) => {
  console.error(e); clearInterval(compteur);
  $('#secours').hidden = false; $('#chargement').classList.add('fini'); document.body.classList.remove('charge');
});
