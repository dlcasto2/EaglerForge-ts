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
precision highp float;
precision highp sampler2D;

in vec2 v_position2f;

layout(location = 0) out vec4 output4f;

uniform sampler2D u_gbufferColorTexture;
uniform sampler2D u_gbufferNormalTexture;
uniform sampler2D u_gbufferMaterialTexture;

uniform sampler2D u_gbufferDepthTexture;
uniform sampler2D u_metalsLUT;

uniform mat4 u_inverseViewMatrix4f;
uniform mat4 u_inverseProjectionMatrix4f;

#ifdef COMPILE_SUN_SHADOW
uniform sampler2D u_sunShadowTexture;
#endif
#ifdef COMPILE_SUBSURFACE_SCATTERING
uniform sampler2D u_subsurfaceScatteringTexture;
#endif

uniform vec3 u_sunDirection3f;
uniform vec3 u_sunColor3f;

#define LIB_INCLUDE_PBR_LIGHTING_FUNCTION
#EAGLER INCLUDE (3) "eagler:glsl/deferred/lib/pbr_lighting.glsl"

// Tidewake: moonlight gets a soft blue-gray grade (only kicks in when the light
// color is clearly the cool moon light, daytime sunlight is untouched)
#define NIGHT_TINT
#define NIGHT_MOONLIGHT_COLOR vec3(0.74, 0.84, 1.0)
#define NIGHT_MOONLIGHT_DESATURATE 0.5
#define NIGHT_MOONLIGHT_BRIGHTNESS 1.1

vec3 gradeSunColor(in vec3 c) {
#ifdef NIGHT_TINT
	float moonness = smoothstep(0.12, 0.35, (c.b - c.r) / max(c.b, 0.00001));
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	vec3 graded = mix(c, vec3(l), NIGHT_MOONLIGHT_DESATURATE);
	graded *= NIGHT_MOONLIGHT_COLOR * (NIGHT_MOONLIGHT_BRIGHTNESS / dot(NIGHT_MOONLIGHT_COLOR, vec3(0.2126, 0.7152, 0.0722)));
	return mix(c, graded, moonness);
#else
	return c;
#endif
}

void main() {
	vec3 diffuseColor3f;
	vec3 normalVector3f;
	vec2 lightmapCoords2f;
	vec3 materialData3f;
	vec4 sampleVar4f;

#ifdef COMPILE_SUBSURFACE_SCATTERING
	float depth = textureLod(u_gbufferDepthTexture, v_position2f, 0.0).r;
	if(depth == 0.0) {
		discard;
	}
	sampleVar4f = textureLod(u_gbufferColorTexture, v_position2f, 0.0);
	diffuseColor3f.rgb = sampleVar4f.rgb;
	diffuseColor3f *= diffuseColor3f;
	lightmapCoords2f.x = sampleVar4f.a;
#endif

#ifdef COMPILE_SUBSURFACE_SCATTERING
	float subsurfValue = textureLod(u_subsurfaceScatteringTexture, v_position2f, 0.0).r;
	subsurfValue *= subsurfValue;
	output4f = vec4(subsurfValue * gradeSunColor(u_sunColor3f) * diffuseColor3f * 0.125, 0.0);
#endif

#ifdef COMPILE_SUN_SHADOW
#ifdef COMPILE_COLORED_SHADOW
	vec4 shadow = textureLod(u_sunShadowTexture, v_position2f, 0.0);
	if(shadow.a < 0.05) {
#ifndef COMPILE_SUBSURFACE_SCATTERING
		discard;
#else
		return;
#endif
	}
#else
	vec3 shadow = vec3(textureLod(u_sunShadowTexture, v_position2f, 0.0).r);
#ifndef COMPILE_SUBSURFACE_SCATTERING
	if(shadow.r < 0.05) {
#ifndef COMPILE_SUBSURFACE_SCATTERING
		discard;
#else
		return;
#endif
	}
#endif
#endif
#endif

#ifndef COMPILE_SUBSURFACE_SCATTERING
	float depth = textureLod(u_gbufferDepthTexture, v_position2f, 0.0).r;
#endif

#ifndef COMPILE_SUN_SHADOW
	if(depth == 0.0) {
#ifndef COMPILE_SUBSURFACE_SCATTERING
		discard;
#else
		return;
#endif
	}
#endif

	sampleVar4f = textureLod(u_gbufferNormalTexture, v_position2f, 0.0);

#ifndef COMPILE_SUN_SHADOW
	vec3 shadow = vec3(sampleVar4f.a, 0.0, 0.0);
	if(shadow.r < 0.5) {
		discard;
	}
	shadow = vec3(max(shadow.r * 2.0 - 1.0, 0.0));
#endif

	normalVector3f.xyz = sampleVar4f.rgb * 2.0 - 1.0;
	lightmapCoords2f.y = sampleVar4f.a;

#ifndef COMPILE_SUBSURFACE_SCATTERING
	sampleVar4f = textureLod(u_gbufferColorTexture, v_position2f, 0.0);
	diffuseColor3f.rgb = sampleVar4f.rgb;
	diffuseColor3f *= diffuseColor3f;
	lightmapCoords2f.x = sampleVar4f.a;
#endif
	materialData3f = textureLod(u_gbufferMaterialTexture, v_position2f, 0.0).rgb;

	vec3 worldSpaceNormal = normalize(mat3(u_inverseViewMatrix4f) * normalVector3f);
	vec4 worldSpacePosition = vec4(v_position2f, depth, 1.0);
	worldSpacePosition.xyz *= 2.0;
	worldSpacePosition.xyz -= 1.0;
	worldSpacePosition = u_inverseProjectionMatrix4f * worldSpacePosition;
	worldSpacePosition = u_inverseViewMatrix4f * vec4(worldSpacePosition.xyz / worldSpacePosition.w, 0.0);

#ifdef COMPILE_SUBSURFACE_SCATTERING
	output4f.rgb += 
#else
	output4f = vec4(
#endif
	eaglercraftLighting(diffuseColor3f, gradeSunColor(u_sunColor3f) * shadow.rgb, normalize(-worldSpacePosition.xyz), u_sunDirection3f, worldSpaceNormal, materialData3f)
#ifdef COMPILE_SUBSURFACE_SCATTERING
	* (1.0 - subsurfValue * 0.0625);
#else
	, 0.0);
#endif
}