#line 2

/*
 * Tidewake Shaders for EaglercraftX 1.8 u53: modified from lax1dude's "High Performance PBR".
 * Look for the TIDEWAKE settings block below to tweak or toggle effects.
 *
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

layout(location = 0) out vec4 output4f;

uniform sampler2D u_gbufferColorTexture;
uniform sampler2D u_gbufferNormalTexture;
uniform sampler2D u_gbufferMaterialTexture;

uniform sampler2D u_gbufferDepthTexture;
uniform sampler2D u_metalsLUT;

uniform mat4 u_inverseProjectionMatrix4f;
uniform mat4 u_inverseViewMatrix4f;

uniform vec2 u_viewportSize2f;
uniform vec3 u_lightPosition3f;
uniform vec3 u_lightColor3f;

#define LIB_INCLUDE_PBR_LIGHTING_FUNCTION
#EAGLER INCLUDE (3) "eagler:glsl/deferred/lib/pbr_lighting.glsl"

// ===================== TIDEWAKE HELD LIGHT SETTINGS ===================== //

// When YOU hold a torch (or any light item) it becomes a flashlight: a bright
// cone of light where you look, plus a softer glow around you.
// Comment out to go back to the plain round glow.
#define HELD_LIGHT_FLASHLIGHT

// how close to the camera a light must be to count as "your" held light
#define FLASHLIGHT_OWNER_RADIUS 1.75
// cone size (cosine of the angle), inner = full brightness, outer = fades to 0
#define FLASHLIGHT_CONE_INNER 0.955
#define FLASHLIGHT_CONE_OUTER 0.82
// beam brightness and how slowly it fades with distance
#define FLASHLIGHT_BRIGHTNESS 5.0
#define FLASHLIGHT_FALLOFF 0.12
// brightness of the glow around you outside the beam (1.0 = stock torch glow)
#define FLASHLIGHT_AMBIENT 0.6

// every dynamic light gets this multiplier (makes torches brighter overall)
#define DYNAMIC_LIGHT_BRIGHTNESS 1.35

// ======================================================================== //

void main() {
	vec2 v_position2f = gl_FragCoord.xy * u_viewportSize2f;
	vec3 diffuseColor3f;
	vec3 normalVector3f;
	vec2 lightmapCoords2f;
	vec3 materialData3f;

	float depth = textureLod(u_gbufferDepthTexture, v_position2f, 0.0).r;
	if(depth == 0.0) {
		discard;
	}

	vec4 worldSpacePosition = vec4(v_position2f, depth, 1.0);
	worldSpacePosition.xyz *= 2.0;
	worldSpacePosition.xyz -= 1.0;
	worldSpacePosition = u_inverseProjectionMatrix4f * worldSpacePosition;
	vec4 worldSpacePosition2 = worldSpacePosition;
	worldSpacePosition = u_inverseViewMatrix4f * worldSpacePosition;
	vec3 lightDist = (worldSpacePosition.xyz / worldSpacePosition.w) - u_lightPosition3f;
	float lightDist2 = dot(lightDist, lightDist);
	vec3 color3f = u_lightColor3f / lightDist2;
	float cm = color3f.r + color3f.g + color3f.b;

#ifdef HELD_LIGHT_FLASHLIGHT
	float beam = 0.0;
	bool isHeldLight = dot(u_lightPosition3f, u_lightPosition3f) < FLASHLIGHT_OWNER_RADIUS * FLASHLIGHT_OWNER_RADIUS;
	if(isHeldLight) {
		vec3 camToFrag = normalize(worldSpacePosition.xyz / worldSpacePosition.w);
		vec3 lookDir = normalize(-u_inverseViewMatrix4f[2].xyz);
		float cosAng = dot(camToFrag, lookDir);
		float cone = smoothstep(FLASHLIGHT_CONE_OUTER, FLASHLIGHT_CONE_INNER, cosAng);
		cone *= 0.75 + 0.25 * smoothstep(FLASHLIGHT_CONE_INNER, 1.0, cosAng);
		// fade the beam out before the edge of the light's volume so there is no hard cutoff
		float lightRange = sqrt((u_lightColor3f.r + u_lightColor3f.g + u_lightColor3f.b) * 40.0) * 0.85;
		beam = cone * FLASHLIGHT_BRIGHTNESS / (lightDist2 * FLASHLIGHT_FALLOFF + 1.0);
		beam *= 1.0 - smoothstep(lightRange * 0.55, lightRange, sqrt(lightDist2));
	}
	if(cm < 0.025 && beam <= 0.0) {
		discard;
	}
	color3f *= max(cm - 0.025, 0.0) / max(cm, 0.0001);
	if(isHeldLight) {
		color3f = color3f * FLASHLIGHT_AMBIENT + u_lightColor3f * beam;
	}
#else
	if(cm < 0.025) {
		discard;
	}
	color3f *= ((cm - 0.025) / cm);
#endif
	color3f *= DYNAMIC_LIGHT_BRIGHTNESS;

	vec4 sampleVar4f = textureLod(u_gbufferColorTexture, v_position2f, 0.0);
	diffuseColor3f.rgb = sampleVar4f.rgb;
	lightmapCoords2f.x = sampleVar4f.a;
	sampleVar4f = textureLod(u_gbufferNormalTexture, v_position2f, 0.0);
	normalVector3f.xyz = sampleVar4f.rgb * 2.0 - 1.0;
	lightmapCoords2f.y = sampleVar4f.a;
	materialData3f = textureLod(u_gbufferMaterialTexture, v_position2f, 0.0).rgb;

	vec3 worldSpaceNormal = normalize(mat3(u_inverseViewMatrix4f) * normalVector3f);

	vec3 lightDir3f = normalize(lightDist);
	lightDir3f = materialData3f.b == 1.0 ? worldSpaceNormal : -lightDir3f;

	if(dot(lightDir3f, worldSpaceNormal) <= 0.0) {
		discard;
	}

	diffuseColor3f *= diffuseColor3f;
	worldSpacePosition2 = u_inverseViewMatrix4f * vec4(worldSpacePosition2.xyz / worldSpacePosition2.w, 0.0);
	worldSpacePosition2.xyz = normalize(worldSpacePosition2.xyz);
	output4f = vec4(eaglercraftLighting(diffuseColor3f, color3f, -worldSpacePosition2.xyz, lightDir3f, worldSpaceNormal, materialData3f), 0.0);
}
