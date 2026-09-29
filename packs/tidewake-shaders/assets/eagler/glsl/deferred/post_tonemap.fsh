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

in vec2 v_position2f;

layout(location = 0) out vec4 output4f;

uniform sampler2D u_lightingHDRFramebufferTexture;
uniform sampler2D u_framebufferLumaAvgInput;
uniform sampler2D u_ditherTexture;
uniform vec3 u_exposure3f;
uniform vec2 u_ditherScale2f;

// ===================== TIDEWAKE TONEMAP / COLOR SETTINGS ===================== //

// 0 = stock eaglercraft ACES-style curve, 1 = AgX (softer highlights, natural colors)
#define TONEMAP_MODE 1

// AgX look: 0 = base, 1 = punchy (a bit more contrast and saturation)
#define AGX_LOOK 1

// exposure multiplier applied before tonemapping
#define EXPOSURE 1.05

// screen color grading (applies to both tonemappers)
#define GRADE_SATURATION 1.06
#define GRADE_VIBRANCE 0.12
#define GRADE_CONTRAST 1.03
// slight color balance: >1 warms/boosts that channel
#define GRADE_BALANCE vec3(1.0, 1.0, 1.0)

// ============================================================================== //

// AgX by Troy Sobotka, polynomial fit of the base contrast curve (MIT licensed approach)
vec3 agxContrastApprox(vec3 x) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

vec3 agx(vec3 val) {
	const mat3 agxMat = mat3(
		0.842479062253094, 0.0423282422610123, 0.0423756549057051,
		0.0784335999999992, 0.878468636469772, 0.0784336,
		0.0792237451477643, 0.0791661274605434, 0.879142973793104);
	const float minEv = -12.47393;
	const float maxEv = 4.026069;
	val = agxMat * val;
	val = clamp(log2(max(val, vec3(1e-10))), minEv, maxEv);
	val = (val - minEv) / (maxEv - minEv);
	return agxContrastApprox(val);
}

vec3 agxEotfToSRGB(vec3 val) {
	const mat3 agxMatInv = mat3(
		1.19687900512017, -0.0528968517574562, -0.0529716355144438,
		-0.0980208811401368, 1.15190312990417, -0.0980434501171241,
		-0.0990297440797205, -0.0989611768448433, 1.15107367264116);
	// stays in the curve's display encoding (already close to sRGB gamma)
	return agxMatInv * val;
}

vec3 agxLook(vec3 val) {
#if AGX_LOOK == 1
	const vec3 slope = vec3(1.0);
	const vec3 power = vec3(1.35);
	const float sat = 1.4;
	val = pow(max(val * slope, vec3(0.0)), power);
	float l = dot(val, vec3(0.2126, 0.7152, 0.0722));
	return l + sat * (val - l);
#else
	return val;
#endif
}

void main() {
	float lumaHDR = textureLod(u_framebufferLumaAvgInput, vec2(0.5), 0.0).r;
	vec3 input3f = textureLod(u_lightingHDRFramebufferTexture, v_position2f, 0.0).rgb;

	input3f /= (0.07 + clamp(lumaHDR * 5.0, 0.18, 4.0));

	input3f *= u_exposure3f * EXPOSURE;

#if TONEMAP_MODE == 1
	// the stock curve bakes in gamma, AgX needs linear input scaled to its mid gray
	input3f = agxEotfToSRGB(agxLook(agx(input3f * 1.9)));
	input3f = clamp(input3f, 0.0, 1.0);
	float sat = 1.0;
#else
	// ACES, modified to approximate gamma correction
	const float a = 1.22;
	const float b = 1.78;
	const float c = 1.22;
	const float d = 1.79;
	const float e = 0.29;

	input3f = clamp((input3f * (a * input3f + b)) / (input3f * (c * input3f + d) + e), 0.0, 1.0);

	// desaturate a bit, makes it look like less of a cartoon
	float sat = 0.8;
#endif

	// screen color grading
	input3f *= GRADE_BALANCE;
	float luma = dot(input3f, vec3(0.299, 0.587, 0.114));
	float chroma = max(input3f.r, max(input3f.g, input3f.b)) - min(input3f.r, min(input3f.g, input3f.b));
	float satTotal = sat * GRADE_SATURATION * (1.0 + GRADE_VIBRANCE * (1.0 - clamp(chroma * 2.0, 0.0, 1.0)));
	input3f = (input3f - luma) * satTotal + luma;
	input3f = (input3f - 0.5) * GRADE_CONTRAST + 0.5;
	input3f = clamp(input3f, 0.0, 1.0);
	luma = dot(input3f, vec3(0.299, 0.587, 0.114));

	input3f += textureLod(u_ditherTexture, v_position2f * u_ditherScale2f, 0.0).r / 255.0;

	output4f = vec4(clamp(input3f, 0.0, 1.0), luma);
}
