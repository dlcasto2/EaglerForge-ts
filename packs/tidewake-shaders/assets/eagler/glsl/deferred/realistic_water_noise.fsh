#line 2

/*
 * Tidewake Shaders for EaglercraftX 1.8 (u53)
 * Based on "High Performance PBR" by lax1dude, Copyright (c) 2023-2025 lax1dude. All Rights Reserved.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *
 * Tidewake: this pass writes the 256x256 tiling water height map every frame.
 * The stock version scrolled 4 lookups of a noise texture. This version builds the
 * height field procedurally: a moving Voronoi lattice (bright connected lines, the
 * "net" pattern seen on stylized Bedrock water) layered with zigzag ridges and soft
 * value noise. Everything tiles on [0,1] and every speed is a multiple of 1/600 so
 * the 600 second timer wrap is seamless.
 */

precision lowp int;
precision highp float;
precision highp sampler2D;

in vec2 v_position2f;

layout(location = 0) out float realisticWaterDisplacementOutput1f;

uniform sampler2D u_noiseTexture;

uniform vec4 u_waveTimer4f;

// ================= SETTINGS ================= //

// 0 = stock eaglercraft water, 1 = Tidewake zigzag lattice water
#define WATER_STYLE 1

// overall wave height (also controls how strong the normals / reflections distort)
#define WATER_WAVE_HEIGHT 1.0

// weight of the connected lattice lines
#define WATER_LATTICE_STRENGTH 0.50

// weight of the zigzag ridges
#define WATER_ZIGZAG_STRENGTH 0.45

// weight of the soft rolling noise underneath
#define WATER_ROLL_STRENGTH 0.28

// lattice line thickness (smaller = thinner, sharper lines)
#define WATER_LATTICE_WIDTH 0.30

// ============================================ //

#define TAU 6.2831853
// one full cycle per 600 seconds, keeps the timer wrap invisible
#define TIME_CYCLE (TAU / 600.0)

float hash12(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * 0.1031);
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
	vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
	p3 += dot(p3, p3.yzx + 33.33);
	return fract((p3.xx + p3.yz) * p3.zy);
}

// value noise that repeats every 'period' cells
float periodicNoise(vec2 p, float period) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float a = hash12(mod(i, period));
	float b = hash12(mod(i + vec2(1.0, 0.0), period));
	float c = hash12(mod(i + vec2(0.0, 1.0), period));
	float d = hash12(mod(i + vec2(1.0, 1.0), period));
	return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// distance to the nearest Voronoi cell border, cells repeat every 'period'
// feature points orbit slowly so the net of lines crawls and reconnects
float periodicLattice(vec2 p, float period, float t) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	float d1 = 8.0;
	float d2 = 8.0;
	for(int y = -1; y <= 1; ++y) {
		for(int x = -1; x <= 1; ++x) {
			vec2 o = vec2(float(x), float(y));
			vec2 h = hash22(mod(i + o, period));
			vec2 pt = o + 0.5 + 0.38 * sin(t * (1.0 + floor(h * 3.0)) * (TIME_CYCLE * 45.0) + TAU * h) - f;
			float d = dot(pt, pt);
			if(d < d1) {
				d2 = d1;
				d1 = d;
			}else if(d < d2) {
				d2 = d;
			}
		}
	}
	return sqrt(d2) - sqrt(d1);
}

float tri(float x) {
	return abs(fract(x) - 0.5) * 2.0;
}

void main() {
#if WATER_STYLE == 0
	vec2 sampleA = v_position2f + vec2(-0.093, -0.056) * (u_waveTimer4f.x + 0.12);
	sampleA = textureLod(u_noiseTexture, fract(sampleA) * 0.46875 + vec2(0.015625, 0.015625), 0.0).rg;
	vec2 sampleB = v_position2f + vec2(0.075, 0.153) * (u_waveTimer4f.x + 1.33);
	sampleB = textureLod(u_noiseTexture, fract(sampleB) * 0.46875 + vec2(0.515625, 0.015625), 0.0).rg;
	vec2 sampleC = v_position2f + vec2(0.075, -0.113) * u_waveTimer4f.x + vec2(sampleA.g, sampleB.g) * 0.15;
	sampleC = textureLod(u_noiseTexture, fract(sampleC) * 0.46875 + vec2(0.515625, 0.515625), 0.0).rg;
	vec2 sampleD = v_position2f + vec2(-0.135, 0.092) * u_waveTimer4f.x + sampleC * 0.1;
	sampleD = textureLod(u_noiseTexture, fract(sampleD) * 0.46875 + vec2(0.015625, 0.515625), 0.0).rg;
	realisticWaterDisplacementOutput1f = exp((dot(vec4(sampleA.r, sampleB.r, sampleC.r, sampleD.r), vec4(0.63, 0.40, 0.035, 0.035)) + dot(vec2(sampleC.g, sampleD.g), vec2(-0.075 * sampleA.g, 0.053 * sampleA.r))) * 2.0);
#else
	float t = u_waveTimer4f.x;
	vec2 uv = v_position2f;

	// drift speeds are k/600 tiles per second so the pattern loops cleanly
	vec2 driftA = vec2(18.0, -12.0) / 600.0 * t;
	vec2 driftB = vec2(-15.0, 21.0) / 600.0 * t;
	vec2 driftC = vec2(24.0, 9.0) / 600.0 * t;

	// soft rolling swell, also used to warp the sharp layers so nothing looks gridded
	float roll = periodicNoise((uv + driftC) * 4.0, 4.0) * 0.65;
	roll += periodicNoise((uv - driftA) * 8.0, 8.0) * 0.35;
	vec2 warp = vec2(periodicNoise((uv + driftB) * 4.0 + 17.0, 4.0), periodicNoise((uv - driftC) * 4.0 + 5.0, 4.0)) - 0.5;

	// connected lattice lines (two scales, crossing each other)
	vec2 lp = uv + driftA + warp * 0.045;
	float edge = periodicLattice(lp * 5.0, 5.0, t);
	float lattice = 1.0 - smoothstep(0.0, WATER_LATTICE_WIDTH, edge);
	vec2 lp2 = uv + driftB + warp * 0.03;
	float edge2 = periodicLattice(lp2 * 9.0 + 3.0, 9.0, t + 150.0);
	lattice = max(lattice, (1.0 - smoothstep(0.0, WATER_LATTICE_WIDTH * 1.2, edge2)) * 0.6);

	// zigzag ridges: a triangle wave bends every ridge line back and forth
	vec2 zp = (uv + driftC + warp * 0.06) * vec2(6.0, 7.0);
	float zig = tri(zp.x * 0.5 + 0.25) * 0.9;
	float ridge = 1.0 - tri(zp.y + zig);
	ridge = ridge * ridge * (3.0 - 2.0 * ridge);
	vec2 zp2 = (uv - driftA + warp.yx * 0.06) * vec2(8.0, 6.0);
	float zig2 = tri(zp2.y * 0.5) * 0.9;
	float ridge2 = 1.0 - tri(zp2.x + zig2);
	ridge2 = ridge2 * ridge2 * (3.0 - 2.0 * ridge2);
	float zigzag = mix(ridge, ridge2, 0.45);

	float h = lattice * WATER_LATTICE_STRENGTH + zigzag * WATER_ZIGZAG_STRENGTH + roll * WATER_ROLL_STRENGTH;
	realisticWaterDisplacementOutput1f = exp(h * 0.88 * WATER_WAVE_HEIGHT);
#endif
}
