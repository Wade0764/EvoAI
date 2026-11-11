// MOCKUP ONLY (not in the build): press-and-hold on a hero card -> actions, move mode, remove.
(function(){
var css=`
.ph-hold{transform:scale(.955)!important;transition:transform .5s cubic-bezier(.2,.8,.2,1),box-shadow .5s!important;box-shadow:0 0 0 2px #C9AA6B,0 0 38px 6px rgba(201,170,107,.45)!important;border-radius:28px}
.ph-ring{position:absolute;left:50%;top:27%;width:84px;height:84px;margin:-42px 0 0 -42px;z-index:60;pointer-events:none}
.ph-ring circle{fill:none;stroke-width:5}
.ph-tip{position:absolute;left:0;right:0;top:calc(27% + 50px);z-index:60;text-align:center;color:#F2F0EB;font:600 16px/1.3 Inter,system-ui,sans-serif;text-shadow:0 1px 8px #000;background:rgba(0,0,0,.55);width:max-content;margin:0 auto;padding:4px 12px;border-radius:999px}
.ph-scrim{position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:900;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.ph-sheet{position:fixed;left:0;right:0;bottom:0;z-index:901;background:#141416;border-top:1px solid rgba(201,170,107,.45);border-radius:26px 26px 0 0;padding:12px 20px calc(22px + env(safe-area-inset-bottom));font-family:Inter,system-ui,sans-serif;color:#F2F0EB}
.ph-grab{width:44px;height:5px;border-radius:3px;background:#C9AA6B;margin:0 auto 16px;opacity:.8}
.ph-car{display:flex;gap:14px;align-items:center;margin-bottom:18px}
.ph-thumb{width:64px;height:48px;border-radius:12px;background:#222 center/cover;border:1px solid rgba(201,170,107,.4);flex:none}
.ph-car b{display:block;font-size:19px;font-weight:600}.ph-car span{display:block;font-size:15px;color:#C9AA6B;margin-top:2px}
.ph-btn{display:flex;align-items:center;gap:14px;width:100%;min-height:58px;padding:0 18px;margin-top:10px;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:#1D1D20;color:#F2F0EB;font:600 17px Inter,system-ui,sans-serif;text-align:left}
.ph-btn i{font-style:normal;font-size:20px;width:24px;text-align:center;color:#C9AA6B}
.ph-btn.red{color:#FF8A8A;border-color:rgba(255,107,107,.55);background:#2A1416}.ph-btn.red i{color:#FF8A8A}
.ph-btn.gold{background:#C9AA6B;color:#111;border-color:#C9AA6B;justify-content:center}
.ph-btn.line{justify-content:center}
.ph-btn small{display:block;font-size:15px;font-weight:400;color:#F2F0EB;margin-top:2px}
.ph-h{font-size:22px;font-weight:600;margin:2px 0 6px}.ph-p{font-size:16px;line-height:1.45;margin:0 0 6px}
.ph-note{font-size:15px;color:#C9AA6B;margin-top:12px;line-height:1.4}
.ph-move{position:fixed;inset:0;z-index:850;background:#0B0B0C;font-family:Inter,system-ui,sans-serif;color:#F2F0EB;padding:calc(18px + env(safe-area-inset-top)) 18px 120px;overflow:auto}
.ph-mh{display:flex;justify-content:space-between;align-items:center;margin:6px 0 4px}.ph-mh h2{font-size:24px;font-weight:600;margin:0}
.ph-mh button{min-height:44px;padding:0 20px;border-radius:999px;background:#C9AA6B;color:#111;border:0;font:700 17px Inter,sans-serif}
.ph-ml{font-size:16px;line-height:1.45;margin:6px 0 16px}
.ph-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.ph-tile{position:relative;border-radius:18px;background:#17171A;border:1px solid rgba(255,255,255,.14);padding:8px 8px 10px;min-height:150px}
.ph-tile .im{height:78px;border-radius:12px;background:#222 center/cover;display:flex;align-items:center;justify-content:center;color:#C9AA6B;font-size:15px}
.ph-tile b{display:block;font-size:15px;font-weight:600;margin:8px 2px 0;line-height:1.25}
.ph-tile .n{position:absolute;top:12px;left:12px;background:rgba(0,0,0,.7);color:#C9AA6B;border:1px solid #C9AA6B;border-radius:999px;font:700 15px Inter;padding:1px 9px}
.ph-tile .ar{display:flex;gap:8px;margin-top:8px}.ph-tile .ar button{flex:1;min-height:40px;border-radius:12px;background:#222226;border:1px solid rgba(201,170,107,.45);color:#C9AA6B;font:700 18px Inter}
.ph-tile.lift{border-color:#C9AA6B;box-shadow:0 14px 36px rgba(0,0,0,.7),0 0 0 2px #C9AA6B;transform:scale(1.05) rotate(-1.5deg);z-index:2;background:#1E1C18}
.ph-tile.gap{border:2px dashed rgba(201,170,107,.7);background:transparent}
.ph-tile.gap span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#C9AA6B;font-size:15px;font-weight:600}
.ph-save{position:fixed;left:18px;right:18px;bottom:calc(20px + env(safe-area-inset-bottom));z-index:851;font-size:15px;text-align:center;color:#F2F0EB;background:#141416;border:1px solid rgba(201,170,107,.4);border-radius:14px;padding:12px}
.ph-toast{position:fixed;left:16px;right:16px;bottom:calc(96px + env(safe-area-inset-bottom));z-index:950;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#1B1B1E;border:1px solid #C9AA6B;border-radius:16px;padding:14px 16px;font:600 16px Inter,sans-serif;color:#F2F0EB;box-shadow:0 10px 30px rgba(0,0,0,.6)}
.ph-toast button{min-height:44px;padding:0 18px;border-radius:999px;background:#C9AA6B;color:#111;border:0;font:700 16px Inter}
.ph-tag{display:inline-block;font-size:15px;color:#111;background:#C9AA6B;border-radius:999px;padding:2px 10px;margin-left:6px;font-weight:700}`;
var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
window.PHM={css:css};
})();
