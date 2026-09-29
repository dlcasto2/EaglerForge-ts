#line 2

/*
 * Copyright (c) 2023 lax1dude. All Rights Reserved.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 * IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 * INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 * NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 * 
 */

precision lowp int;
precision mediump float;
precision mediump sampler3D;

in vec2 v_position2f;

layout(location = 0) out vec4 output4f;

uniform sampler3D u_inputTexture;
uniform float u_textureLevel1f;
uniform float u_textureLod1f;
uniform vec2 u_sampleWeights2f;

void main() {
	// Tidewake: soften the stamped cloud shapes with a small blur, then re-sharpen with a
	// smoothstep. Keeps the vanilla-like layout but rounds every corner into a puff.
	vec2 texel2f = 1.25 / vec2(textureSize(u_inputTexture, int(u_textureLod1f)).xy);
	float objsample = textureLod(u_inputTexture, vec3(v_position2f, u_textureLevel1f), u_textureLod1f).r * 2.0;
	objsample += textureLod(u_inputTexture, vec3(v_position2f + vec2(texel2f.x, 0.0), u_textureLevel1f), u_textureLod1f).r;
	objsample += textureLod(u_inputTexture, vec3(v_position2f - vec2(texel2f.x, 0.0), u_textureLevel1f), u_textureLod1f).r;
	objsample += textureLod(u_inputTexture, vec3(v_position2f + vec2(0.0, texel2f.y), u_textureLevel1f), u_textureLod1f).r;
	objsample += textureLod(u_inputTexture, vec3(v_position2f - vec2(0.0, texel2f.y), u_textureLevel1f), u_textureLod1f).r;
	objsample *= (1.0 / 6.0);
	objsample = objsample * objsample * (3.0 - 2.0 * objsample);
	output4f = vec4(objsample * u_sampleWeights2f.x, 0.0, 0.0, objsample * u_sampleWeights2f.y + 1.0);
}
