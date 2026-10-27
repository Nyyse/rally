#!/bin/sh
# Combine the shell and scripts into one self-contained page.
cd "$(dirname "$0")"
OUT=dustlight-rally.html
cat shell.html > $OUT
printf '<script>\n' >> $OUT
for f in js/00_core.js js/01_data.js js/012_carmesh.js js/02_audio.js js/03_track.js js/04_world.js js/05_physics.js js/06_render.js js/065_gl.js js/066_cargl.js js/07_fx.js js/08_backdrop.js js/085_pad.js js/087_touch.js js/09_game.js js/095_rally.js js/10_ui.js js/105_rallyui.js js/11_main.js; do
  cat "$f" >> $OUT; printf '\n' >> $OUT
done
printf '</script>\n' >> $OUT
# a standalone preview wrapper (the artifact host adds this skeleton itself)
{ printf '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>\n'; cat $OUT; printf '</body></html>\n'; } > preview.html
wc -c $OUT
