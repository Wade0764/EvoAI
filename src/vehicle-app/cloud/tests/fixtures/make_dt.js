// Builds the doc-thumbs fixtures: a one-page repair invoice PDF and a phone-photo-style registration JPEG.
const puppeteer=require('/workspace/vehicle-app/node_modules/puppeteer-core');
const INV=`<html><body style="font:13px Helvetica,Arial;margin:48px;color:#111">
<div style="display:flex;justify-content:space-between;border-bottom:3px solid #8a1c1c;padding-bottom:14px"><div><div style="font:bold 26px Georgia;color:#8a1c1c">Holbert's Porsche</div>1607 Easton Rd, Warrington PA 18976<br>(215) 343-1600</div>
<div style="text-align:right"><div style="font:bold 20px Helvetica">REPAIR INVOICE</div>No. 448210<br>Date: 09/14/2026<br>RO: 77193</div></div>
<table style="width:100%;margin:18px 0;border-collapse:collapse"><tr><td><b>Customer</b><br>Olivia Owner<br>Princeton NJ</td><td><b>Vehicle</b><br>2021 Porsche 911 Carrera S<br>VIN WP0AB2A99MS123456<br>Mileage in: 2,410</td></tr></table>
<table style="width:100%;border-collapse:collapse"><tr style="background:#eee"><th align=left style="padding:6px">Description</th><th align=right>Hours</th><th align=right>Amount</th></tr>
${[['Annual maintenance - engine oil and filter','1.2','389.00'],['Brake fluid flush (DOT 4 Super)','0.8','214.50'],['Cabin air filter','0.3','96.10'],['Multi-point inspection','1.0','185.00'],['Parts: Mobil 1 0W-40, filter, gasket','','400.00']].map(r=>`<tr><td style="padding:6px;border-bottom:1px solid #ddd">${r[0]}</td><td align=right>${r[1]}</td><td align=right>$${r[2]}</td></tr>`).join('')}
<tr><td></td><td align=right style="padding-top:10px"><b>Total</b></td><td align=right style="padding-top:10px"><b>$1,284.60</b></td></tr></table>
<p style="margin-top:40px;color:#555">Next oil service due 12,410 mi or 09/2027. Thank you for your business.</p></body></html>`;
const REG=`<html><body style="margin:0;width:1200px;height:900px;background:linear-gradient(135deg,#6b4a2f,#3d2a1b);display:flex;align-items:center;justify-content:center">
<div style="width:900px;height:560px;background:#f4f1e6;transform:rotate(-3deg);box-shadow:0 30px 60px rgba(0,0,0,.6);font:20px Arial;padding:36px;box-sizing:border-box;color:#1a2a4a">
<div style="font:bold 34px Arial;border-bottom:4px solid #1a2a4a;padding-bottom:10px">STATE OF NEW JERSEY - MOTOR VEHICLE COMMISSION</div>
<div style="font:bold 28px Arial;margin:16px 0">VEHICLE REGISTRATION</div>
<div>Plate: <b>EVO 911</b> &nbsp; Expires: <b>03/31/2027</b></div><div style="margin-top:12px">2021 PORSCHE 911 CARRERA S &nbsp; GT SILVER</div>
<div style="margin-top:12px">VIN WP0AB2A99MS123456</div><div style="margin-top:12px">Registered owner: OLIVIA OWNER</div><div style="margin-top:40px;font-size:16px">Fee paid $84.00 &nbsp; Issued 03/31/2026</div></div></body></html>`;
(async()=>{const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']});const p=await b.newPage();
 await p.setContent(INV);await p.pdf({path:__dirname+'/dt_invoice.pdf',format:'Letter'});
 await p.setViewport({width:1200,height:900});await p.setContent(REG);await p.screenshot({path:__dirname+'/dt_registration.jpg',type:'jpeg',quality:82});
 await b.close();console.log('ok');})();
