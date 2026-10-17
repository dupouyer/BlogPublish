import type { RimSettings } from '../../lib/article-lab/rimlight';
import { createRimScene } from './rimlight-scene';

/** Three.js is fetched only after the article's visible island mounts. */
export async function createRimRenderer(canvas: HTMLCanvasElement) {
  const T = await import('three');
  const renderer = new T.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = T.SRGBColorSpace;
  const { scene, camera, light, dispose: disposeScene } = createRimScene(T);
  const target = new T.WebGLRenderTarget(1, 1, { minFilter: T.NearestFilter, magFilter: T.NearestFilter });
  target.depthTexture = new T.DepthTexture(1, 1, T.UnsignedIntType);
  target.depthTexture.minFilter = target.depthTexture.magFilter = T.NearestFilter;
  const normalTarget = new T.WebGLRenderTarget(1, 1, { minFilter: T.NearestFilter, magFilter: T.NearestFilter });
  const normalMaterial = new T.MeshNormalMaterial();
  const uniforms = {
    colorTex: { value: target.texture },
    depthTex: { value: target.depthTexture },
    normalTex: { value: normalTarget.texture },
    size: { value: new T.Vector2(1, 1) },
    lightVS: { value: new T.Vector3() },
    upVS: { value: new T.Vector3() },
    fov: { value: 50 },
    width: { value: 0.06 },
    cap: { value: 0.012 },
    mode: { value: 2 },
    debug: { value: 0 },
    fadeOn: { value: true },
    normalsOn: { value: true },
  };
  const postMaterial = new T.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUV; void main(){vUV=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `
      varying vec2 vUV;
      uniform sampler2D colorTex, depthTex, normalTex;
      uniform vec2 size;
      uniform vec3 lightVS, upVS;
      uniform float fov, width, cap;
      uniform int mode, debug;
      uniform bool fadeOn, normalsOn;
      float linearZ(float d) { return 0.1*180.0/(180.0-d*(180.0-0.1)); }
      void main(){
        float raw=texture2D(depthTex,vUV).r;
        float z=linearZ(raw);
        float uvWidth=width/(2.0*z*tan(radians(fov)*0.5));
        if(mode==0) uvWidth=4.0/size.y;
        if(mode==2) uvWidth=min(uvWidth,cap);
        float pixels=uvWidth*size.y;
        float dirLen=length(lightVS.xy);
        vec2 dir=lightVS.xy/max(dirLen,0.00001);
        // WebGL texture Y points up. UE viewport Y points down.
        vec2 nextUV=vUV+dir*uvWidth*vec2(size.y/size.x,1.0);
        vec2 margin=0.5/size;
        float valid=float(all(greaterThanEqual(nextUV,margin)) && all(lessThanEqual(nextUV,1.0-margin)));
        float z1=linearZ(texture2D(depthTex,clamp(nextUV,margin,1.0-margin)).r);
        float edge=smoothstep(0.08,0.35,max(z1-z,0.0));
        vec3 normal=normalize(texture2D(normalTex,vUV).rgb*2.0-1.0);
        float normalWeight=normalsOn?smoothstep(-0.15,0.45,dot(normal,lightVS)):1.0;
        float surfaceMask=1.0-smoothstep(0.65,0.95,abs(dot(normal,upVS)));
        float fade=fadeOn?smoothstep(0.0,1.0,pixels):1.0;
        float mask=edge*normalWeight*surfaceMask*fade*valid*step(0.0001,dirLen)*float(raw<0.99999);
        vec3 color=texture2D(colorTex,vUV).rgb;
        if(debug==1) color=vec3(pow(1.0-clamp(z/65.0,0.0,1.0),3.0));
        else if(debug==2) color=vec3(mask);
        else if(debug==3) color=mix(vec3(0.03,0.12,0.3),vec3(1.0,0.45,0.1),clamp(pixels/6.0,0.0,1.0))*float(raw<0.99999);
        else color+=vec3(1.0,0.56,0.22)*mask*1.7;
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const quadGeometry = new T.PlaneGeometry(2, 2);
  const postScene = new T.Scene();
  postScene.add(new T.Mesh(quadGeometry, postMaterial));
  const postCamera = new T.Camera();
  let disposed = false;
  function render(settings: RimSettings) {
    if (disposed) return 0;
    const cssWidth = Math.max(240, canvas.clientWidth);
    const w = Math.round(Math.min(cssWidth, 960) * settings.resolution);
    const h = Math.round(w * 0.68);
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false);
      target.setSize(w, h);
      normalTarget.setSize(w, h);
    }
    camera.aspect = w / h;
    camera.fov = settings.fov;
    const orbit = (settings.orbit * Math.PI) / 180;
    camera.position.set(Math.sin(orbit) * settings.distance, 2 + settings.distance * 0.12, Math.cos(orbit) * settings.distance);
    camera.lookAt(0, 2, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const angle = (settings.angle * Math.PI) / 180;
    const dir = new T.Vector3(Math.cos(angle), Math.sin(angle), 0.3).normalize();
    light.position.copy(dir.clone().multiplyScalar(20));
    uniforms.lightVS.value.copy(dir).transformDirection(camera.matrixWorldInverse);
    uniforms.upVS.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
    uniforms.size.value.set(w, h);
    for (const key of ['fov', 'width', 'cap', 'mode', 'debug'] as const) uniforms[key].value = settings[key];
    uniforms.fadeOn.value = settings.fade;
    uniforms.normalsOn.value = settings.normals;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    scene.overrideMaterial = normalMaterial;
    renderer.setRenderTarget(normalTarget);
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
    return h;
  }
  return {
    kind: 'WebGL',
    render,
    dispose() {
      disposed = true;
      disposeScene();
      target.dispose();
      normalTarget.dispose();
      normalMaterial.dispose();
      quadGeometry.dispose();
      postMaterial.dispose();
      renderer.dispose();
    },
  };
}
