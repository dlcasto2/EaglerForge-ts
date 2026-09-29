TIDEWAKE SHADERS for EaglercraftX 1.8 u53
==========================================

Built on lax1dude's built-in "High Performance PBR" shader pack (the one inside
your u53 client). Every built-in toggle in the Shaders menu still works.

INSTALL
 1. Options > Resource Packs > Open Pack Folder / Add Pack, choose the zip.
 2. Move "Tidewake Shaders" to the top of the selected packs list, click Done.
 3. Options > Video Settings > Shaders: turn shaders ON. Turn on "Realistic Water",
    "Screen Space Reflections" and "Dynamic Lights" to get the full effect.
 4. If the shaders were already on, turn them off and on again (or restart) so the
    new shader files get reloaded.
 The pack also includes noise-based vanilla water textures and a round sun and moon,
 so the water and sky look closer to this style even with shaders off.

WHAT'S CHANGED (file -> feature)
 realistic_water_noise.fsh    Procedural water height: connected lattice lines + zigzag ridges
                              + soft rolling swell. Loops seamlessly.
 realistic_water_render.fsh   Clearer blue-turquoise water, sharper sun glint, stronger reflections.
 realistic_water_control.fsh  Water depth: shallow water is clear turquoise, deep water fades
                              to rich blue (Beer-Lambert absorption), soft shoreline foam.
 reproject_ssr.fsh            Refined ray tracing for reflections: each hit is binary-searched
                              so tall/vertical objects reflect straight and sit on their base.
 post_tonemap.fsh             AgX tone mapping (default) or stock ACES, plus screen color grading
                              (saturation, vibrance, contrast, color balance).
 deferred_combine.fsh         Reactive block light: sea lanterns cast blue, glowstone casts golden
                              orange, redstone red, portals purple, beacons cyan. Glowstone and sea
                              lantern surfaces get their hue too. Blue-gray moonlit night ambient.
 lighting_sun.fsh             Soft blue-gray grade on direct moonlight.
 lighting_point.fsh           Held torch = flashlight: bright cone where you look + soft glow.
                              All dynamic lights are brighter.
 emissive_items.csv           Held light colors: sea lantern blue, glowstone golden, brighter torch.
 material_block_constants.csv Unique emission codes for sea lantern / torch / beacon so the
                              reactive lighting can tell light blocks apart.
 clouds_sample.fsh            Rounder dome-topped volumetric clouds, silver lining, powder effect.
 clouds_shapes.fsh            Rounds the corners of the vanilla-style cloud shapes.
 skybox_render.fsh            Crisp round sun disc with limb darkening and corona.
 moon_render.fsh              Anti-aliased round moon edge, soft halo, slightly cool tint.

TWEAKING
 Open any of those files and look for the block marked TIDEWAKE ... SETTINGS.
 "#define NAME value" lines change numbers; comment a "#define" out with // to turn
 that effect off. Examples:
   post_tonemap.fsh:         #define TONEMAP_MODE 0          -> stock tonemapper
   realistic_water_noise.fsh #define WATER_STYLE 0           -> stock water waves
   deferred_combine.fsh:     //#define REACTIVE_LIGHTING      -> turn off colored block light
   lighting_point.fsh:       //#define HELD_LIGHT_FLASHLIGHT  -> normal round torch glow

KNOWN LIMITS
 * Reactive block light is screen-space: it can only detect light blocks that are on
   screen, so the tint fades back to normal torch-orange when the lamp is off-screen.
 * The flashlight only applies to your own held light in first person.

Credits: base shaders (c) lax1dude, original notices kept in every file.
