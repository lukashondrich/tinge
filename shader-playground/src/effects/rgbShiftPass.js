import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';


export function createRGBShiftPass() {
  const pass = new ShaderPass(RGBShiftShader);
  pass.uniforms['amount'].value = 0.001; // tweak to control strength
  return pass;
}
