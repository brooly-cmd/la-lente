// Le miroir de sel : reflet reel de la scene, rides analytiques, polygones de sel sous l'eau, lueur bioluminescente la nuit.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

export const MAX_RIDES = 16;

const SHADER = {
  name: 'Miroir',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    uBruit: { value: null }, uSel: { value: null }, uTemps: { value: 0 }, uDefile: { value: 0 }, uHor: { value: new THREE.Color() }, uEau: { value: new THREE.Color() }, uNuit: { value: 0 }, uSolC: { value: new THREE.Color() }, uSol: { value: new THREE.Vector3() },
    uR: { value: Array.from({ length: MAX_RIDES }, () => new THREE.Vector4(0, 0, -100, 0)) }, uBrume: { value: .006 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix; varying vec4 vU; varying vec3 vW;
    void main(){ vU = textureMatrix*vec4(position,1.); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse,uBruit,uSel; uniform float uTemps,uDefile,uNuit,uBrume; uniform vec3 uHor,uEau,uSolC,uSol; uniform vec4 uR[${MAX_RIDES}];
    varying vec4 vU; varying vec3 vW;
    void main(){
      vec2 p = vW.xz; vec2 pm = p + vec2(uDefile,0.);   // le sol defile sous la bete immobile
      vec3 V = normalize(cameraPosition-vW);
      float dist = length(cameraPosition-vW);
      float loin = clamp(dist/70.,0.,1.);
      // petites rides de vent : tres faibles, c'est un miroir
      vec2 q = pm*.11 + vec2(uTemps*.012,uTemps*.007);
      vec4 n1 = texture2D(uBruit,q), n2 = texture2D(uBruit,pm*.37-vec2(uTemps*.016,0.));
      vec2 nrm = ((n1.rg-.5)*.5 + (n2.ba-.5)*.5)*.018*(1.-loin*.6);
      // rides : anneaux qui s'ecartent. x,z = centre ; y = age ; w = force
      float lueur = 0.;
      for(int i=0;i<${MAX_RIDES};i++){
        vec4 r = uR[i]; if(r.y<0.||r.w<=0.) continue;
        vec2 dd = p-r.xz; float d = length(dd)+1e-4;
        float front = r.y*1.25;
        float env = exp(-pow((d-front)*1.15/(.45+r.y*.25),2.)) * exp(-r.y*.36) * r.w;
        float w = sin((d-front)*11.);
        nrm += (dd/d)*w*env*.17;
        lueur += env*r.w*(.12+.88*w*w);
      }
      // polygones de sel, vus de pres et a travers une pellicule d'eau
      vec2 sq = (pm+nrm*2.)*.11;
      vec3 s = texture2D(uSel,sq).rgb; vec3 s2 = texture2D(uSel,sq*3.1+.31).rgb;
      float detail = (1.-smoothstep(10.,46.,dist));
      vec2 uv = vU.xy/vU.w + nrm;
      vec3 refl = texture2D(tDiffuse,uv).rgb;
      float cosT = clamp(dot(V,vec3(0,1,0)),0.,1.);
      float F = .8 + .2*pow(1.-cosT,3.);
      vec3 fond = uEau*(.42 + .34*s.g + .12*s.b);
      fond = mix(fond, uEau*1.02 + .015, s.r*.5);
      fond *= .78 + .22*s2.g;
      vec3 col = mix(fond,refl,mix(1.,F*(1.-s.r*.16),detail));
      // reflet du soleil en long sillage sur les rides
      vec3 N = normalize(vec3(nrm.x*5.,1.,nrm.y*5.));
      vec3 H = normalize(V+uSol);
      col += uSolC*pow(max(dot(N,H),0.),420.)*2.2*(1.-uNuit);
      // bioluminescence
      col += vec3(.10,.95,.82)*min(lueur,1.5)*uNuit*.5*(1.-smoothstep(16.,70.,dist));
      // l'horizon se dissout : on ne doit plus savoir ou finit le sol
      float brume = 1.-exp(-pow(dist*uBrume,2.));
      col = mix(col,uHor,brume*.92);
      gl_FragColor = vec4(col,1.);
    }`,
};

export function creerMiroir({ w, h, bruit, sel, msaa }) {
  // Les subdivisions préservent la précision du reflet au ras de l'eau.
  const geo = new THREE.PlaneGeometry(2600, 2600, 64, 64);
  const m = new Reflector(geo, { textureWidth: w, textureHeight: h, clipBias: .001, shader: SHADER, multisample: msaa });
  const u = m.material.uniforms; u.uBruit.value = bruit; u.uSel.value = sel;
  // pas de reflet du ciel coupe par le near plane
  m.material.depthWrite = true;
  m.rotation.x = -Math.PI / 2;
  m.frustumCulled = false;
  return m;
}

export class Rides {
  constructor(uniforme) { this.u = uniforme.value; this.i = 0; }
  ajoute(x, z, force = 1) { const r = this.u[this.i]; r.set(x, 0, z, force); r.age = 0; this.i = (this.i + 1) % MAX_RIDES; }
  maj(dt, vitesseSol) {
    for (const r of this.u) { if (r.w > 0) { r.y += dt; r.x -= vitesseSol * dt; if (r.y > 12) r.w = 0; } }
  }
}
